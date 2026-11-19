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
import {LaunchToken} from "./LaunchToken.sol";
import {LaunchHook} from "./LaunchHook.sol";

/// @notice Deploys a fixed-supply token, opens its native-ETH Uniswap v4 pool and seeds it with the whole supply
/// as single-sided liquidity. The position is owned by this contract, which has no way to remove it.
contract LaunchFactory is IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using BalanceDeltaLibrary for BalanceDelta;
    using CurrencyLibrary for Currency;

    error NotPoolManager();
    error InvalidStartTick();
    error InvalidName();
    error InvalidSupply();
    error InsufficientOutput();

    struct LaunchParams {
        string name;
        string symbol;
        string metadataURI;
        /// @dev 0 = 1B, 1 = 10B, 2 = 100B, 3 = 1T
        uint8 supplyTier;
        /// @dev 100, 200, 300, 500 or 1000
        uint16 feeBps;
        bool antiSnipe;
        /// @dev true = fees stream to every holder; false = to `recipients` by `shares` (bps, sum 10000)
        bool holders;
        address[] recipients;
        uint16[] shares;
        uint256 minTokensOut;
    }

    uint256 public constant BASE_SUPPLY = 1_000_000_000 ether;
    int24 public constant TICK_SPACING = 200;
    /// @dev ~log_1.0001(10), rounded to the tick spacing: keeps the opening market cap the same for every supply
    int24 public constant TICKS_PER_10X = 23_000;
    uint8 public constant MAX_SUPPLY_TIER = 3;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    IPoolManager public immutable poolManager;
    LaunchHook public immutable hook;
    /// @dev Upper tick of the launch position for a 1B supply (= initial price, in tokens per ETH).
    int24 public immutable startTick;

    address[] public allTokens;
    mapping(address token => PoolKey) internal _keys;

    event TokenLaunched(
        address indexed token,
        address indexed creator,
        PoolId indexed poolId,
        string name,
        string symbol,
        string metadataURI,
        uint256 supply,
        uint16 feeBps,
        bool holders,
        bool antiSnipe,
        uint256 launchBuyEth,
        uint256 launchBuyTokens,
        uint256 tokensBurned
    );

    constructor(IPoolManager _poolManager, LaunchHook _hook, int24 _startTick) {
        if (
            _startTick % TICK_SPACING != 0 || _startTick <= TickMath.minUsableTick(TICK_SPACING)
                || _startTick + TICKS_PER_10X * int24(uint24(MAX_SUPPLY_TIER)) >= TickMath.maxUsableTick(TICK_SPACING)
        ) {
            revert InvalidStartTick();
        }
        poolManager = _poolManager;
        hook = _hook;
        startTick = _startTick;
    }

    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    function poolKeyOf(address token) external view returns (PoolKey memory) {
        return _keys[token];
    }

    function tickFor(uint8 supplyTier) public view returns (int24) {
        return startTick + TICKS_PER_10X * int24(uint24(supplyTier));
    }

    function launch(LaunchParams calldata p) external payable returns (address token) {
        if (
            bytes(p.name).length == 0 || bytes(p.name).length > 64 || bytes(p.symbol).length == 0
                || bytes(p.symbol).length > 16
        ) {
            revert InvalidName();
        }
        if (p.supplyTier > MAX_SUPPLY_TIER) revert InvalidSupply();
        uint256 supply = BASE_SUPPLY * 10 ** p.supplyTier;

        address[] memory excl = new address[](3);
        excl[0] = address(poolManager);
        excl[1] = address(hook);
        excl[2] = DEAD;
        token = address(
            new LaunchToken{salt: keccak256(abi.encode(msg.sender, allTokens.length))}(
                p.name, p.symbol, supply, address(this), address(hook), p.holders, excl
            )
        );
        PoolKey memory key = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO,
            currency1: Currency.wrap(token),
            fee: 0,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });
        _keys[token] = key;
        allTokens.push(token);

        hook.register(key, token, msg.sender, supply, p.feeBps, p.antiSnipe, p.holders, p.recipients, p.shares);
        int24 upper = tickFor(p.supplyTier);
        poolManager.initialize(key, TickMath.getSqrtPriceAtTick(upper));

        uint256 boughtTokens = abi.decode(
            poolManager.unlock(abi.encode(key, msg.sender, msg.value, p.minTokensOut, supply, upper)), (uint256)
        );

        uint256 leftover = LaunchToken(token).balanceOf(address(this));
        if (leftover > 0) LaunchToken(token).transfer(DEAD, leftover);

        emit TokenLaunched(
            token,
            msg.sender,
            key.toId(),
            p.name,
            p.symbol,
            p.metadataURI,
            supply,
            p.feeBps,
            p.holders,
            p.antiSnipe,
            msg.value,
            boughtTokens,
            leftover
        );
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (PoolKey memory key, address creator, uint256 ethIn, uint256 minTokensOut, uint256 supply, int24 upper) =
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
        if (ethIn > 0) {
            BalanceDelta d = poolManager.swap(
                key,
                SwapParams({
                    zeroForOne: true,
                    amountSpecified: -int256(ethIn),
                    sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
                }),
                abi.encode(creator)
            );
            poolManager.settle{value: uint256(uint128(-d.amount0()))}();
            bought = uint256(uint128(d.amount1()));
            if (bought < minTokensOut) revert InsufficientOutput();
            poolManager.take(key.currency1, creator, bought);
        }
        return abi.encode(bought);
    }
}
