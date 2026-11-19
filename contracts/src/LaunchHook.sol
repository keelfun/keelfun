// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "v4-core/src/types/BeforeSwapDelta.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {Owned} from "solmate/src/auth/Owned.sol";
import {LaunchToken} from "./LaunchToken.sol";

/// @notice Fee + anti-snipe hook for launchpad pools (native ETH / token).
/// Charges the creator-chosen trading fee in ETH on every swap. The platform keeps a fixed slice; the rest goes
/// to the token's fee route: every holder pro rata, or one to four fixed wallets.
/// Optional anti-snipe adds a tax on buys that decays to zero over the first minute; it follows the fee route.
/// Only the factory can create pools and add liquidity, and nobody can remove it.
contract LaunchHook is IHooks, IUnlockCallback, Owned {
    using PoolIdLibrary for PoolKey;
    using BalanceDeltaLibrary for BalanceDelta;
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;

    error NotPoolManager();
    error NotFactory();
    error NotRecipient();
    error UnknownPool();
    error HookNotImplemented();
    error FactoryAlreadySet();
    error InvalidFee();
    error InvalidRoute();
    error ZeroAddress();

    struct PoolInfo {
        address token;
        address creator;
        uint40 launchedAt;
        uint16 feeBps;
        uint16 platformBps;
        bool antiSnipe;
        bool holders;
        uint256 supply;
    }

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_TOTAL_BPS = 9_900;
    uint256 public constant SNIPE_START_BPS = 9_000;
    uint256 public constant SNIPE_WINDOW = 60;
    uint256 public constant MAX_RECIPIENTS = 4;

    IPoolManager public immutable poolManager;
    address public factory;

    mapping(PoolId => PoolInfo) public pools;
    mapping(address token => PoolId) public poolIdOf;
    mapping(address token => address[]) internal _recipients;
    mapping(address token => uint16[]) internal _shares;
    mapping(address token => mapping(address recipient => uint256)) public accrued;
    mapping(address token => uint256) public holdersPending;
    mapping(address token => uint256) public routeEarned;
    mapping(address => bool) public trustedRouter;
    uint256 public platformAccrued;

    event FactorySet(address factory);
    event RouterTrusted(address router, bool trusted);
    event RouteSet(address indexed token, bool holders, address[] recipients, uint16[] shares);
    event Trade(
        address indexed token,
        address indexed trader,
        bool isBuy,
        uint256 ethAmount,
        uint256 tokenAmount,
        uint256 platformFee,
        uint256 creatorFee,
        uint160 sqrtPriceX96
    );
    event FeesClaimed(address indexed token, address indexed recipient, uint256 amount);
    event HoldersFlushed(address indexed token, uint256 amount);
    event PlatformFeesWithdrawn(address indexed to, uint256 amount);
    event RecipientChanged(address indexed token, address indexed from, address indexed to);

    constructor(IPoolManager _poolManager, address _owner) Owned(_owner) {
        poolManager = _poolManager;
        Hooks.validateHookPermissions(
            this,
            Hooks.Permissions({
                beforeInitialize: true,
                afterInitialize: false,
                beforeAddLiquidity: true,
                afterAddLiquidity: false,
                beforeRemoveLiquidity: false,
                afterRemoveLiquidity: false,
                beforeSwap: true,
                afterSwap: true,
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: true,
                afterSwapReturnDelta: true,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            })
        );
    }

    receive() external payable {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
    }

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    // ---------------------------------------------------------------- admin

    function setFactory(address _factory) external onlyOwner {
        if (factory != address(0)) revert FactoryAlreadySet();
        factory = _factory;
        emit FactorySet(_factory);
    }

    function setTrustedRouter(address router, bool trusted) external onlyOwner {
        trustedRouter[router] = trusted;
        emit RouterTrusted(router, trusted);
    }

    /// @notice Platform slice of each fee tier (bps of the trade).
    function platformBpsFor(uint256 feeBps) public pure returns (uint16) {
        if (feeBps == 100) return 40;
        if (feeBps == 200) return 50;
        if (feeBps == 300) return 60;
        if (feeBps == 500) return 75;
        if (feeBps == 1000) return 100;
        revert InvalidFee();
    }

    function register(
        PoolKey calldata key,
        address token,
        address creator,
        uint256 supply,
        uint16 feeBps,
        bool antiSnipe,
        bool holders,
        address[] calldata recipients,
        uint16[] calldata shares
    ) external {
        if (msg.sender != factory) revert NotFactory();
        uint16 platformBps = platformBpsFor(feeBps);
        if (holders) {
            if (recipients.length != 0 || shares.length != 0) revert InvalidRoute();
        } else {
            uint256 n = recipients.length;
            if (n == 0 || n > MAX_RECIPIENTS || shares.length != n) revert InvalidRoute();
            uint256 sum;
            for (uint256 i; i < n; ++i) {
                if (recipients[i] == address(0)) revert ZeroAddress();
                if (shares[i] == 0) revert InvalidRoute();
                for (uint256 j; j < i; ++j) {
                    if (recipients[j] == recipients[i]) revert InvalidRoute();
                }
                sum += shares[i];
            }
            if (sum != BPS) revert InvalidRoute();
            _recipients[token] = recipients;
            _shares[token] = shares;
        }
        PoolId id = key.toId();
        pools[id] = PoolInfo({
            token: token,
            creator: creator,
            launchedAt: uint40(block.timestamp),
            feeBps: feeBps,
            platformBps: platformBps,
            antiSnipe: antiSnipe,
            holders: holders,
            supply: supply
        });
        poolIdOf[token] = id;
        emit RouteSet(token, holders, recipients, shares);
    }

    // ---------------------------------------------------------------- views

    function poolInfo(address token) external view returns (PoolInfo memory) {
        return pools[poolIdOf[token]];
    }

    function routeOf(address token)
        external
        view
        returns (bool holders, address[] memory recipients, uint16[] memory shares)
    {
        return (pools[poolIdOf[token]].holders, _recipients[token], _shares[token]);
    }

    /// @notice Extra tax on buys right after launch: 90% at launch, falling linearly to 0 after 60 seconds.
    function snipeTaxBps(address token) public view returns (uint256) {
        PoolInfo storage p = pools[poolIdOf[token]];
        return _snipe(p);
    }

    function _snipe(PoolInfo storage p) internal view returns (uint256) {
        if (!p.antiSnipe) return 0;
        uint256 elapsed = block.timestamp - p.launchedAt;
        if (elapsed >= SNIPE_WINDOW) return 0;
        return SNIPE_START_BPS * (SNIPE_WINDOW - elapsed) / SNIPE_WINDOW;
    }

    /// @notice Fee rates (bps of the gross ETH moved) that a trade would pay right now.
    function feeRates(address token, bool isBuy, address sender)
        public
        view
        returns (uint256 totalBps, uint256 platformBps)
    {
        return _feeRates(pools[poolIdOf[token]], isBuy, sender);
    }

    function _feeRates(PoolInfo storage p, bool isBuy, address sender)
        internal
        view
        returns (uint256 totalBps, uint256 platformBps)
    {
        platformBps = p.platformBps;
        totalBps = p.feeBps;
        if (isBuy && sender != factory) totalBps += _snipe(p);
        if (totalBps > MAX_TOTAL_BPS) totalBps = MAX_TOTAL_BPS;
    }

    // ---------------------------------------------------------------- hook callbacks

    function beforeInitialize(address sender, PoolKey calldata, uint160) external view onlyPoolManager returns (bytes4) {
        if (sender != factory) revert NotFactory();
        return IHooks.beforeInitialize.selector;
    }

    function beforeAddLiquidity(address sender, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        if (sender != factory) revert NotFactory();
        return IHooks.beforeAddLiquidity.selector;
    }

    function beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolInfo storage p = pools[key.toId()];
        if (p.token == address(0)) revert UnknownPool();
        bool isBuy = params.zeroForOne;
        bool exactIn = params.amountSpecified < 0;
        // ETH is the specified side on exact-in buys and exact-out sells: take the fee before the swap.
        if (isBuy == exactIn) {
            (uint256 totalBps, uint256 platformBps) = _feeRates(p, isBuy, sender);
            uint256 amount = exactIn ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
            uint256 fee = exactIn ? amount * totalBps / BPS : amount * totalBps / (BPS - totalBps);
            _accrue(p, fee, totalBps, platformBps);
            return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(int256(fee)), 0), 0);
        }
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) external onlyPoolManager returns (bytes4, int128) {
        PoolId id = key.toId();
        PoolInfo storage p = pools[id];
        bool isBuy = params.zeroForOne;
        bool exactIn = params.amountSpecified < 0;
        (uint256 totalBps, uint256 platformBps) = _feeRates(p, isBuy, sender);

        int128 amount0 = delta.amount0();
        int128 amount1 = delta.amount1();
        uint256 ethPool = uint256(uint128(amount0 < 0 ? -amount0 : amount0));

        uint256 fee;
        int128 hookDelta;
        if (isBuy == exactIn) {
            uint256 amount = exactIn ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
            fee = exactIn ? amount * totalBps / BPS : amount * totalBps / (BPS - totalBps);
        } else {
            // ETH is unspecified: exact-out buys (ETH in) and exact-in sells (ETH out)
            fee = isBuy ? ethPool * totalBps / (BPS - totalBps) : ethPool * totalBps / BPS;
            _accrue(p, fee, totalBps, platformBps);
            hookDelta = int128(int256(fee));
        }

        uint256 tokenAmount;
        uint256 ethAmount;
        if (isBuy) {
            tokenAmount = uint256(uint128(amount1));
            ethAmount = ethPool + fee;
        } else {
            tokenAmount = uint256(uint128(-amount1));
            ethAmount = ethPool - fee;
        }

        address trader = tx.origin;
        if ((sender == factory || trustedRouter[sender]) && hookData.length == 32) {
            trader = abi.decode(hookData, (address));
        }
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(id);
        uint256 platformFee = totalBps == 0 ? 0 : fee * platformBps / totalBps;
        emit Trade(p.token, trader, isBuy, ethAmount, tokenAmount, platformFee, fee - platformFee, sqrtPriceX96);

        return (IHooks.afterSwap.selector, hookDelta);
    }

    function _accrue(PoolInfo storage p, uint256 fee, uint256 totalBps, uint256 platformBps) internal {
        if (fee == 0) return;
        uint256 platformFee = fee * platformBps / totalBps;
        uint256 routeFee = fee - platformFee;
        platformAccrued += platformFee;
        address token = p.token;
        routeEarned[token] += routeFee;
        if (p.holders) {
            holdersPending[token] += routeFee;
        } else {
            address[] storage r = _recipients[token];
            uint16[] storage s = _shares[token];
            uint256 n = r.length;
            uint256 left = routeFee;
            for (uint256 i; i < n - 1; ++i) {
                uint256 part = routeFee * s[i] / BPS;
                accrued[token][r[i]] += part;
                left -= part;
            }
            accrued[token][r[n - 1]] += left;
        }
        poolManager.mint(address(this), CurrencyLibrary.ADDRESS_ZERO.toId(), fee);
    }

    // ---------------------------------------------------------------- fee claims

    function claim(address token) public returns (uint256 amount) {
        amount = accrued[token][msg.sender];
        if (amount == 0) return 0;
        accrued[token][msg.sender] = 0;
        poolManager.unlock(abi.encode(msg.sender, amount));
        emit FeesClaimed(token, msg.sender, amount);
    }

    function claimMany(address[] calldata tokens) external returns (uint256 total) {
        for (uint256 i; i < tokens.length; ++i) {
            total += claim(tokens[i]);
        }
    }

    /// @notice Moves the holders' pending fees into the token, where every holder can claim their share.
    function flushHolders(address token) external returns (uint256 amount) {
        amount = holdersPending[token];
        if (amount == 0) return 0;
        holdersPending[token] = 0;
        poolManager.unlock(abi.encode(address(this), amount));
        LaunchToken(token).distribute{value: amount}();
        emit HoldersFlushed(token, amount);
    }

    /// @notice A fee recipient can hand its slot (future fees) to another wallet.
    function changeRecipient(address token, address to) external {
        if (to == address(0)) revert ZeroAddress();
        address[] storage r = _recipients[token];
        uint256 n = r.length;
        uint256 idx = type(uint256).max;
        for (uint256 i; i < n; ++i) {
            if (r[i] == to) revert InvalidRoute();
            if (r[i] == msg.sender) idx = i;
        }
        if (idx == type(uint256).max) revert NotRecipient();
        r[idx] = to;
        emit RecipientChanged(token, msg.sender, to);
    }

    function withdrawPlatformFees(address to) external onlyOwner returns (uint256 amount) {
        amount = platformAccrued;
        if (amount == 0) return 0;
        platformAccrued = 0;
        poolManager.unlock(abi.encode(to, amount));
        emit PlatformFeesWithdrawn(to, amount);
    }

    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        (address to, uint256 amount) = abi.decode(data, (address, uint256));
        poolManager.burn(address(this), CurrencyLibrary.ADDRESS_ZERO.toId(), amount);
        poolManager.take(CurrencyLibrary.ADDRESS_ZERO, to, amount);
        return "";
    }

    // ---------------------------------------------------------------- unused hooks

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }
}
