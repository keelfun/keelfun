// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "v4-core/src/types/BeforeSwapDelta.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {Owned} from "solmate/src/auth/Owned.sol";
import {LaunchToken} from "./LaunchToken.sol";

/// @notice Tax + anti-snipe hook for launchpad pools (pair asset / token, pair asset is currency0).
/// Charges the creator-chosen buy and sell tax in the pair asset on every swap. The protocol keeps a slice;
/// the rest is split between creator wallets (one to four), every holder pro rata, and burns.
/// Burn fees accumulate and anyone can trigger `burn`, which buys the token in its own pool and sends it to the
/// dead address. Optional anti-snipe adds a tax on buys that decays to zero over the first minute.
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

    struct Config {
        uint16 buyBps;
        uint16 sellBps;
        uint16 creatorBps;
        uint16 holdersBps;
        uint16 burnBps;
        bool antiSnipe;
    }

    struct PoolInfo {
        address token;
        address creator;
        Currency pair;
        uint40 launchedAt;
        uint16 buyBps;
        uint16 sellBps;
        uint16 buyPlatformBps;
        uint16 sellPlatformBps;
        uint16 creatorBps;
        uint16 holdersBps;
        uint16 burnBps;
        bool antiSnipe;
        uint256 supply;
    }

    uint256 public constant BPS = 10_000;
    uint256 public constant MIN_TAX_BPS = 100;
    uint256 public constant MAX_TAX_BPS = 1_000;
    uint256 public constant MAX_TOTAL_BPS = 9_900;
    uint256 public constant SNIPE_START_BPS = 9_000;
    uint256 public constant SNIPE_WINDOW = 60;
    uint256 public constant MAX_RECIPIENTS = 4;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint8 internal constant PAY = 0;
    uint8 internal constant BURN = 1;

    IPoolManager public immutable poolManager;
    address public factory;

    mapping(PoolId => PoolInfo) public pools;
    mapping(address token => PoolId) public poolIdOf;
    mapping(address token => PoolKey) internal _keys;
    mapping(address token => address[]) internal _recipients;
    mapping(address token => uint16[]) internal _shares;
    mapping(address token => mapping(address recipient => uint256)) public accrued;
    mapping(address token => uint256) public holdersPending;
    mapping(address token => uint256) public burnPending;
    mapping(address token => uint256) public routeEarned;
    mapping(address => bool) public trustedRouter;
    /// @dev Keyed by pair asset (address(0) = ETH).
    mapping(address pair => uint256) public platformAccrued;

    event FactorySet(address factory);
    event RouterTrusted(address router, bool trusted);
    event RouteSet(
        address indexed token, uint16 creatorBps, uint16 holdersBps, uint16 burnBps, address[] recipients, uint16[] shares
    );
    event Trade(
        address indexed token,
        address indexed trader,
        bool isBuy,
        uint256 pairAmount,
        uint256 tokenAmount,
        uint256 platformFee,
        uint256 creatorFee,
        uint160 sqrtPriceX96
    );
    event FeesClaimed(address indexed token, address indexed recipient, uint256 amount);
    event HoldersFlushed(address indexed token, uint256 amount);
    event Burned(address indexed token, uint256 pairAmount, uint256 tokensBurned);
    event PlatformFeesWithdrawn(address indexed pair, address indexed to, uint256 amount);
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

    /// @notice Protocol slice (bps of the trade) of a 1%-10% tax: 0.4% at 1%, +0.1% per extra 1%, capped at 1%.
    function platformBpsFor(uint256 taxBps) public pure returns (uint16) {
        if (taxBps < MIN_TAX_BPS || taxBps > MAX_TAX_BPS) revert InvalidFee();
        uint256 p = 40 + (taxBps - MIN_TAX_BPS) / 10;
        return uint16(p > 100 ? 100 : p);
    }

    function register(
        PoolKey calldata key,
        address token,
        address creator,
        uint256 supply,
        Config calldata c,
        address[] calldata recipients,
        uint16[] calldata shares
    ) external {
        if (msg.sender != factory) revert NotFactory();
        if (uint256(c.creatorBps) + c.holdersBps + c.burnBps != BPS) revert InvalidRoute();
        uint16 buyPlatform = platformBpsFor(c.buyBps);
        uint16 sellPlatform = platformBpsFor(c.sellBps);
        if (c.creatorBps == 0) {
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
            pair: key.currency0,
            launchedAt: uint40(block.timestamp),
            buyBps: c.buyBps,
            sellBps: c.sellBps,
            buyPlatformBps: buyPlatform,
            sellPlatformBps: sellPlatform,
            creatorBps: c.creatorBps,
            holdersBps: c.holdersBps,
            burnBps: c.burnBps,
            antiSnipe: c.antiSnipe,
            supply: supply
        });
        poolIdOf[token] = id;
        _keys[token] = key;
        emit RouteSet(token, c.creatorBps, c.holdersBps, c.burnBps, recipients, shares);
    }

    // ---------------------------------------------------------------- views

    function poolInfo(address token) external view returns (PoolInfo memory) {
        return pools[poolIdOf[token]];
    }

    function routeOf(address token)
        external
        view
        returns (uint16 creatorBps, uint16 holdersBps, uint16 burnBps, address[] memory recipients, uint16[] memory shares)
    {
        PoolInfo storage p = pools[poolIdOf[token]];
        return (p.creatorBps, p.holdersBps, p.burnBps, _recipients[token], _shares[token]);
    }

    /// @notice Extra tax on buys right after launch: 90% at launch, falling linearly to 0 after 60 seconds.
    function snipeTaxBps(address token) public view returns (uint256) {
        return _snipe(pools[poolIdOf[token]]);
    }

    function _snipe(PoolInfo storage p) internal view returns (uint256) {
        if (!p.antiSnipe) return 0;
        uint256 elapsed = block.timestamp - p.launchedAt;
        if (elapsed >= SNIPE_WINDOW) return 0;
        return SNIPE_START_BPS * (SNIPE_WINDOW - elapsed) / SNIPE_WINDOW;
    }

    /// @notice Tax rates (bps of the gross pair amount moved) that a trade would pay right now.
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
        if (sender == address(this)) return (0, 0);
        if (isBuy) {
            totalBps = p.buyBps;
            platformBps = p.buyPlatformBps;
            if (sender != factory) totalBps += _snipe(p);
        } else {
            totalBps = p.sellBps;
            platformBps = p.sellPlatformBps;
        }
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
        // The pair asset is the specified side on exact-in buys and exact-out sells: take the fee before the swap.
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
        uint256 pairPool = uint256(uint128(amount0 < 0 ? -amount0 : amount0));

        uint256 fee;
        int128 hookDelta;
        if (isBuy == exactIn) {
            uint256 amount = exactIn ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
            fee = exactIn ? amount * totalBps / BPS : amount * totalBps / (BPS - totalBps);
        } else {
            // Pair asset is unspecified: exact-out buys (pair in) and exact-in sells (pair out)
            fee = isBuy ? pairPool * totalBps / (BPS - totalBps) : pairPool * totalBps / BPS;
            _accrue(p, fee, totalBps, platformBps);
            hookDelta = int128(int256(fee));
        }

        uint256 tokenAmount;
        uint256 pairAmount;
        if (isBuy) {
            tokenAmount = uint256(uint128(amount1));
            pairAmount = pairPool + fee;
        } else {
            tokenAmount = uint256(uint128(-amount1));
            pairAmount = pairPool - fee;
        }

        address trader = tx.origin;
        if (sender == address(this)) {
            trader = DEAD;
        } else if ((sender == factory || trustedRouter[sender]) && hookData.length == 32) {
            trader = abi.decode(hookData, (address));
        }
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(id);
        uint256 platformFee = totalBps == 0 ? 0 : fee * platformBps / totalBps;
        emit Trade(p.token, trader, isBuy, pairAmount, tokenAmount, platformFee, fee - platformFee, sqrtPriceX96);

        return (IHooks.afterSwap.selector, hookDelta);
    }

    function _accrue(PoolInfo storage p, uint256 fee, uint256 totalBps, uint256 platformBps) internal {
        if (fee == 0) return;
        uint256 platformFee = fee * platformBps / totalBps;
        uint256 routeFee = fee - platformFee;
        address token = p.token;
        platformAccrued[Currency.unwrap(p.pair)] += platformFee;
        routeEarned[token] += routeFee;
        uint256 h = routeFee * p.holdersBps / BPS;
        uint256 b = routeFee * p.burnBps / BPS;
        uint256 c = routeFee - h - b;
        if (p.creatorBps == 0) {
            if (p.burnBps > 0) b += c;
            else h += c;
            c = 0;
        }
        if (h > 0) holdersPending[token] += h;
        if (b > 0) burnPending[token] += b;
        if (c > 0) {
            address[] storage r = _recipients[token];
            uint16[] storage s = _shares[token];
            uint256 n = r.length;
            uint256 left = c;
            for (uint256 i; i < n - 1; ++i) {
                uint256 part = c * s[i] / BPS;
                accrued[token][r[i]] += part;
                left -= part;
            }
            accrued[token][r[n - 1]] += left;
        }
        poolManager.mint(address(this), p.pair.toId(), fee);
    }

    // ---------------------------------------------------------------- claims, burns

    function claim(address token) public returns (uint256 amount) {
        amount = accrued[token][msg.sender];
        if (amount == 0) return 0;
        accrued[token][msg.sender] = 0;
        _pay(pools[poolIdOf[token]].pair, msg.sender, amount);
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
        Currency pair = pools[poolIdOf[token]].pair;
        if (pair.isAddressZero()) {
            _pay(pair, address(this), amount);
            LaunchToken(token).distribute{value: amount}(amount);
        } else {
            _pay(pair, token, amount);
            LaunchToken(token).distribute(amount);
        }
        emit HoldersFlushed(token, amount);
    }

    /// @notice Spends the token's pending burn fees buying it in its own pool and sends the tokens to the dead address.
    function burn(address token) external returns (uint256 burned) {
        uint256 amount = burnPending[token];
        if (amount == 0) return 0;
        burnPending[token] = 0;
        burned = abi.decode(poolManager.unlock(abi.encode(BURN, token, amount, address(0))), (uint256));
    }

    /// @notice A creator-fee recipient can hand its slot (future fees) to another wallet.
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

    function withdrawPlatformFees(address pair, address to) external onlyOwner returns (uint256 amount) {
        amount = platformAccrued[pair];
        if (amount == 0) return 0;
        platformAccrued[pair] = 0;
        _pay(Currency.wrap(pair), to, amount);
        emit PlatformFeesWithdrawn(pair, to, amount);
    }

    function _pay(Currency c, address to, uint256 amount) internal {
        poolManager.unlock(abi.encode(PAY, Currency.unwrap(c), amount, to));
    }

    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        (uint8 kind, address a, uint256 amount, address to) = abi.decode(data, (uint8, address, uint256, address));
        if (kind == PAY) {
            Currency c = Currency.wrap(a);
            poolManager.burn(address(this), c.toId(), amount);
            poolManager.take(c, to, amount);
            return "";
        }
        PoolKey memory key = _keys[a];
        BalanceDelta d = poolManager.swap(
            key,
            SwapParams({zeroForOne: true, amountSpecified: -int256(amount), sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1}),
            ""
        );
        uint256 paid = uint256(uint128(-d.amount0()));
        uint256 out = uint256(uint128(d.amount1()));
        poolManager.burn(address(this), key.currency0.toId(), paid);
        poolManager.take(key.currency1, DEAD, out);
        if (paid < amount) burnPending[a] += amount - paid;
        emit Burned(a, paid, out);
        return abi.encode(out);
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
