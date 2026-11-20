// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/src/types/BalanceDelta.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {LaunchFactory} from "./LaunchFactory.sol";

/// @notice Minimal exact-input router for launchpad pools (pair asset / token), with revert-based quotes.
contract LaunchRouter is IUnlockCallback {
    using BalanceDeltaLibrary for BalanceDelta;
    using CurrencyLibrary for Currency;
    using SafeTransferLib for ERC20;

    error NotPoolManager();
    error Expired();
    error InsufficientOutput();
    error UnknownToken();
    error BadValue();
    error QuoteResult(uint256 amountIn, uint256 amountOut);

    uint8 internal constant BUY = 0;
    uint8 internal constant SELL = 1;

    IPoolManager public immutable poolManager;
    LaunchFactory public immutable factory;

    struct Action {
        uint8 kind;
        bool quote;
        PoolKey key;
        uint256 amountIn;
        uint256 minOut;
        address payer;
        address recipient;
    }

    constructor(IPoolManager _poolManager, LaunchFactory _factory) {
        poolManager = _poolManager;
        factory = _factory;
    }

    function _key(address token) internal view returns (PoolKey memory key) {
        key = factory.poolKeyOf(token);
        if (Currency.unwrap(key.currency1) != token) revert UnknownToken();
    }

    /// @notice Spend `amountIn` of the pair asset (send it as value for ETH pairs, approve this router otherwise).
    function buy(address token, uint256 amountIn, uint256 minOut, address recipient, uint256 deadline)
        external
        payable
        returns (uint256 amountOut)
    {
        if (block.timestamp > deadline) revert Expired();
        PoolKey memory key = _key(token);
        bool native = key.currency0.isAddressZero();
        if (native ? msg.value != amountIn : msg.value != 0) revert BadValue();
        (uint256 spent, uint256 out) = abi.decode(
            poolManager.unlock(abi.encode(Action(BUY, false, key, amountIn, minOut, msg.sender, recipient))),
            (uint256, uint256)
        );
        amountOut = out;
        if (native && spent < msg.value) SafeTransferLib.safeTransferETH(msg.sender, msg.value - spent);
    }

    /// @notice Sell `amountIn` tokens (approve this router first) for the pair asset.
    function sell(address token, uint256 amountIn, uint256 minOut, address recipient, uint256 deadline)
        external
        returns (uint256 amountOut)
    {
        if (block.timestamp > deadline) revert Expired();
        (, amountOut) = abi.decode(
            poolManager.unlock(abi.encode(Action(SELL, false, _key(token), amountIn, minOut, msg.sender, recipient))),
            (uint256, uint256)
        );
    }

    /// @notice Call with eth_call. Tokens out for `amountIn` of the pair asset (fees and snipe tax included).
    function quoteBuy(address token, uint256 amountIn) external returns (uint256 used, uint256 tokensOut) {
        return _quote(Action(BUY, true, _key(token), amountIn, 0, msg.sender, msg.sender));
    }

    /// @notice Call with eth_call. Pair asset out for selling `amountIn` tokens (fees included).
    function quoteSell(address token, uint256 amountIn) external returns (uint256 used, uint256 amountOut) {
        return _quote(Action(SELL, true, _key(token), amountIn, 0, msg.sender, msg.sender));
    }

    function _quote(Action memory a) internal returns (uint256, uint256) {
        try poolManager.unlock(abi.encode(a)) {}
        catch (bytes memory reason) {
            if (reason.length == 68 && bytes4(reason) == QuoteResult.selector) {
                uint256 amountIn;
                uint256 amountOut;
                assembly {
                    amountIn := mload(add(reason, 36))
                    amountOut := mload(add(reason, 68))
                }
                return (amountIn, amountOut);
            }
            assembly {
                revert(add(reason, 32), mload(reason))
            }
        }
        revert();
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        Action memory a = abi.decode(data, (Action));
        bool isBuy = a.kind == BUY;

        BalanceDelta d = poolManager.swap(
            a.key,
            SwapParams({
                zeroForOne: isBuy,
                amountSpecified: -int256(a.amountIn),
                sqrtPriceLimitX96: isBuy ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            abi.encode(a.recipient)
        );

        uint256 amountIn;
        uint256 amountOut;
        if (isBuy) {
            amountIn = uint256(uint128(-d.amount0()));
            amountOut = uint256(uint128(d.amount1()));
        } else {
            amountIn = uint256(uint128(-d.amount1()));
            amountOut = uint256(uint128(d.amount0()));
        }
        if (a.quote) revert QuoteResult(amountIn, amountOut);
        if (amountOut < a.minOut) revert InsufficientOutput();

        Currency payC = isBuy ? a.key.currency0 : a.key.currency1;
        Currency outC = isBuy ? a.key.currency1 : a.key.currency0;
        if (payC.isAddressZero()) {
            poolManager.settle{value: amountIn}();
        } else {
            poolManager.sync(payC);
            ERC20(Currency.unwrap(payC)).safeTransferFrom(a.payer, address(poolManager), amountIn);
            poolManager.settle();
        }
        poolManager.take(outC, a.recipient, amountOut);
        return abi.encode(amountIn, amountOut);
    }
}
