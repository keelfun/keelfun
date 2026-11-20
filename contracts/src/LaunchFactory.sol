// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "v4-core/src/libraries/FixedPoint96.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/src/types/BalanceDelta.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {Owned} from "solmate/src/auth/Owned.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {LaunchToken} from "./LaunchToken.sol";
import {LaunchHook} from "./LaunchHook.sol";

/// @notice Deploys a fixed-supply token, opens its Uniswap v4 pool against an allowed pair asset (ETH, USDC, ...)
/// and seeds it with the whole supply as single-sided liquidity. The position is owned by this contract, which has
/// no way to remove it. Token addresses are CREATE2-derived from (creator, salt), so creators can mine vanity
/// addresses; the token must sort above its pair asset so the pair is always currency0.
contract LaunchFactory is IUnlockCallback, Owned {
    using PoolIdLibrary for PoolKey;
    using BalanceDeltaLibrary for BalanceDelta;
    using CurrencyLibrary for Currency;
    using SafeTransferLib for ERC20;

    error NotPoolManager();
    error InvalidStartTick();
    error InvalidName();
    error InvalidSupply();
    error InsufficientOutput();
    error PairNotEnabled();
    error BadValue();
    error BadSalt();
    error NotCreator();
    error MetadataLocked();

    struct LaunchParams {
        string name;
        string symbol;
        string metadataURI;
        /// @dev 0 = 1B, 1 = 10B, 2 = 100B, 3 = 1T
        uint8 supplyTier;
        /// @dev address(0) = native ETH
        address pair;
        /// @dev 100-1000 each
        uint16 buyBps;
        uint16 sellBps;
        /// @dev split of the tax left after protocol; must sum to 10000
        uint16 creatorBps;
        uint16 holdersBps;
        uint16 burnBps;
        bool antiSnipe;
        bool editable;
        /// @dev creator-fee wallets and their shares (bps, sum 10000); empty when creatorBps == 0
        address[] recipients;
        uint16[] shares;
        bytes32 salt;
        /// @dev pair asset spent on the creator's tax-free first buy (send as value for ETH, approve otherwise)
        uint256 devBuy;
        uint256 minTokensOut;
    }

    struct Pair {
        bool enabled;
        /// @dev upper tick of the launch position for a 1B supply (= opening price, token units per pair unit)
        int24 startTick;
    }

    uint256 public constant BASE_SUPPLY = 1_000_000_000 ether;
    int24 public constant TICK_SPACING = 200;
    /// @dev ~log_1.0001(10), rounded to the tick spacing: keeps the opening market cap the same for every supply
    int24 public constant TICKS_PER_10X = 23_000;
    uint8 public constant MAX_SUPPLY_TIER = 3;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    IPoolManager public immutable poolManager;
    LaunchHook public immutable hook;

    mapping(address pair => Pair) public pairs;
    address[] public allTokens;
    mapping(address token => PoolKey) internal _keys;
    mapping(address token => address) public creatorOf;
    mapping(address token => bool) public metadataEditable;

    event PairSet(address indexed pair, bool enabled, int24 startTick);
    event TokenLaunched(
        address indexed token,
        address indexed creator,
        PoolId indexed poolId,
        address pair,
        string name,
        string symbol,
        string metadataURI,
        uint256 supply,
        uint16 buyBps,
        uint16 sellBps,
        uint16 creatorBps,
        uint16 holdersBps,
        uint16 burnBps,
        bool antiSnipe,
        bool editable,
        uint256 devBuy,
        uint256 devBuyTokens
    );
    event MetadataUpdated(address indexed token, string metadataURI);
    event MetadataFrozen(address indexed token);

    constructor(IPoolManager _poolManager, LaunchHook _hook, address _owner) Owned(_owner) {
        poolManager = _poolManager;
        hook = _hook;
    }

    // ---------------------------------------------------------------- admin

    function setPair(address pair, bool enabled, int24 startTick) external onlyOwner {
        if (
            startTick % TICK_SPACING != 0 || startTick <= TickMath.minUsableTick(TICK_SPACING)
                || startTick + TICKS_PER_10X * int24(uint24(MAX_SUPPLY_TIER)) >= TickMath.maxUsableTick(TICK_SPACING)
        ) {
            revert InvalidStartTick();
        }
        pairs[pair] = Pair(enabled, startTick);
        emit PairSet(pair, enabled, startTick);
    }

    // ---------------------------------------------------------------- views

    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    function poolKeyOf(address token) external view returns (PoolKey memory) {
        return _keys[token];
    }

    function tickFor(address pair, uint8 supplyTier) public view returns (int24) {
        return pairs[pair].startTick + TICKS_PER_10X * int24(uint24(supplyTier));
    }

    /// @notice keccak256 of the token's CREATE2 init code, for mining a salt off-chain.
    function tokenInitCodeHash(string calldata name, string calldata symbol, uint8 supplyTier, address pair, bool holderRewards)
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                type(LaunchToken).creationCode,
                abi.encode(
                    name, symbol, BASE_SUPPLY * 10 ** supplyTier, address(this), address(hook), pair, holderRewards, _excluded()
                )
            )
        );
    }

    /// @notice Address `launch` will deploy for `creator` with `salt` and the given init code hash.
    function predictToken(address creator, bytes32 salt, bytes32 initCodeHash) public view returns (address) {
        bytes32 s = keccak256(abi.encode(creator, salt));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), s, initCodeHash)))));
    }

    function _excluded() internal view returns (address[] memory excl) {
        excl = new address[](3);
        excl[0] = address(poolManager);
        excl[1] = address(hook);
        excl[2] = DEAD;
    }

    // ---------------------------------------------------------------- launch

    function launch(LaunchParams calldata p) external payable returns (address token) {
        if (
            bytes(p.name).length == 0 || bytes(p.name).length > 64 || bytes(p.symbol).length == 0
                || bytes(p.symbol).length > 16
        ) {
            revert InvalidName();
        }
        if (p.supplyTier > MAX_SUPPLY_TIER) revert InvalidSupply();
        if (!pairs[p.pair].enabled) revert PairNotEnabled();
        if (p.pair == address(0) ? msg.value != p.devBuy : msg.value != 0) revert BadValue();
        uint256 supply = BASE_SUPPLY * 10 ** p.supplyTier;

        token = address(
            new LaunchToken{salt: keccak256(abi.encode(msg.sender, p.salt))}(
                p.name, p.symbol, supply, address(this), address(hook), p.pair, p.holdersBps > 0, _excluded()
            )
        );
        if (uint160(token) <= uint160(p.pair)) revert BadSalt();

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(p.pair),
            currency1: Currency.wrap(token),
            fee: 0,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });
        _keys[token] = key;
        allTokens.push(token);
        creatorOf[token] = msg.sender;
        metadataEditable[token] = p.editable;

        hook.register(
            key,
            token,
            msg.sender,
            supply,
            LaunchHook.Config(p.buyBps, p.sellBps, p.creatorBps, p.holdersBps, p.burnBps, p.antiSnipe),
            p.recipients,
            p.shares
        );
        int24 upper = tickFor(p.pair, p.supplyTier);
        poolManager.initialize(key, TickMath.getSqrtPriceAtTick(upper));

        uint256 bought = abi.decode(
            poolManager.unlock(abi.encode(key, msg.sender, p.devBuy, p.minTokensOut, supply, upper)), (uint256)
        );

        uint256 leftover = LaunchToken(token).balanceOf(address(this));
        if (leftover > 0) LaunchToken(token).transfer(DEAD, leftover);
        uint256 refund = address(this).balance;
        if (refund > 0) SafeTransferLib.safeTransferETH(msg.sender, refund);

        _emitLaunched(token, key, p, supply, bought);
    }

    function _emitLaunched(address token, PoolKey memory key, LaunchParams calldata p, uint256 supply, uint256 bought)
        internal
    {
        emit TokenLaunched(
            token,
            msg.sender,
            key.toId(),
            p.pair,
            p.name,
            p.symbol,
            p.metadataURI,
            supply,
            p.buyBps,
            p.sellBps,
            p.creatorBps,
            p.holdersBps,
            p.burnBps,
            p.antiSnipe,
            p.editable,
            p.devBuy,
            bought
        );
    }

    // ---------------------------------------------------------------- metadata

    function setMetadata(address token, string calldata metadataURI) external {
        if (msg.sender != creatorOf[token]) revert NotCreator();
        if (!metadataEditable[token]) revert MetadataLocked();
        emit MetadataUpdated(token, metadataURI);
    }

    function freezeMetadata(address token) external {
        if (msg.sender != creatorOf[token]) revert NotCreator();
        metadataEditable[token] = false;
        emit MetadataFrozen(token);
    }

    // ---------------------------------------------------------------- pool manager

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (PoolKey memory key, address creator, uint256 devBuy, uint256 minTokensOut, uint256 supply, int24 upper) =
            abi.decode(data, (PoolKey, address, uint256, uint256, uint256, int24));

        int24 tickLower = TickMath.minUsableTick(TICK_SPACING);
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(upper);
        uint128 liquidity = uint128(FullMath.mulDiv(supply, FixedPoint96.Q96, sqrtUpper - sqrtLower));

        (BalanceDelta addDelta,) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: upper,
                liquidityDelta: int256(uint256(liquidity)),
                salt: bytes32(0)
            }),
            ""
        );
        uint256 owed = uint256(uint128(-addDelta.amount1()));
        poolManager.sync(key.currency1);
        LaunchToken(Currency.unwrap(key.currency1)).transfer(address(poolManager), owed);
        poolManager.settle();

        uint256 bought;
        if (devBuy > 0) {
            BalanceDelta d = poolManager.swap(
                key,
                SwapParams({
                    zeroForOne: true,
                    amountSpecified: -int256(devBuy),
                    sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
                }),
                abi.encode(creator)
            );
            uint256 paid = uint256(uint128(-d.amount0()));
            if (key.currency0.isAddressZero()) {
                poolManager.settle{value: paid}();
            } else {
                poolManager.sync(key.currency0);
                ERC20(Currency.unwrap(key.currency0)).safeTransferFrom(creator, address(poolManager), paid);
                poolManager.settle();
            }
            bought = uint256(uint128(d.amount1()));
            if (bought < minTokensOut) revert InsufficientOutput();
            poolManager.take(key.currency1, creator, bought);
        }
        return abi.encode(bought);
    }
}
