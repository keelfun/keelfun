// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {HookMiner} from "v4-periphery/test/shared/HookMiner.sol";
import {LaunchHook} from "../src/LaunchHook.sol";
import {LaunchFactory} from "../src/LaunchFactory.sol";
import {LaunchRouter} from "../src/LaunchRouter.sol";
import {LaunchToken} from "../src/LaunchToken.sol";
import {PoolSwapTest} from "v4-core/src/test/PoolSwapTest.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";

contract LaunchpadTest is Test {
    IPoolManager PM;
    int24 constant START_TICK = 200_200;

    LaunchHook hook;
    LaunchFactory factory;
    LaunchRouter router;

    address owner = makeAddr("owner");
    address creator = makeAddr("creator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    function setUp() public {
        PM = new PoolManager(owner);
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG
                | Hooks.AFTER_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );
        bytes memory args = abi.encode(PM, owner);
        (address hookAddr, bytes32 salt) = HookMiner.find(address(this), flags, type(LaunchHook).creationCode, args);
        hook = new LaunchHook{salt: salt}(PM, owner);
        assertEq(address(hook), hookAddr);
        factory = new LaunchFactory(PM, hook, START_TICK);
        router = new LaunchRouter(PM, factory);
        vm.startPrank(owner);
        hook.setFactory(address(factory));
        hook.setTrustedRouter(address(router), true);
        vm.stopPrank();
        vm.deal(creator, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _params(uint8 tier, uint16 fee, bool snipe, bool holders)
        internal
        view
        returns (LaunchFactory.LaunchParams memory p)
    {
        address[] memory r;
        uint16[] memory s;
        if (!holders) {
            r = new address[](1);
            r[0] = creator;
            s = new uint16[](1);
            s[0] = 10_000;
        }
        p = LaunchFactory.LaunchParams("Keel Cat", "KCAT", "ipfs://meta", tier, fee, snipe, holders, r, s, 0);
    }

    function _launch(LaunchFactory.LaunchParams memory p, uint256 firstBuy) internal returns (address token) {
        vm.prank(creator);
        token = factory.launch{value: firstBuy}(p);
    }

    function _buy(address who, address token, uint256 eth) internal returns (uint256) {
        vm.prank(who);
        return router.buy{value: eth}(token, 0, who, block.timestamp);
    }

    function test_launchSeedsWholeSupplyEveryTier() public {
        for (uint8 t; t <= 3; ++t) {
            address token = _launch(_params(t, 100, false, false), 0);
            uint256 supply = 1_000_000_000 ether * 10 ** t;
            uint256 burned = LaunchToken(token).balanceOf(factory.DEAD());
            assertEq(LaunchToken(token).totalSupply(), supply);
            assertEq(LaunchToken(token).balanceOf(address(PM)) + burned, supply);
            assertLt(burned * 1e12, supply);
            // same opening market cap: 1 ETH buys ~a third of the supply on every tier
            uint256 out = _buy(alice, token, 1 ether);
            assertGt(out * 100, supply * 30);
            assertLt(out * 100, supply * 34);
        }
    }

    function test_feeTiersAndPlatformSlice() public {
        uint16[5] memory tiers = [uint16(100), 200, 300, 500, 1000];
        uint16[5] memory plat = [uint16(40), 50, 60, 75, 100];
        for (uint256 i; i < 5; ++i) {
            address token = _launch(_params(0, tiers[i], false, false), 0);
            uint256 p0 = hook.platformAccrued();
            uint256 c0 = hook.accrued(token, creator);
            _buy(alice, token, 1 ether);
            assertEq(hook.platformAccrued() - p0, 1 ether * uint256(plat[i]) / 10_000);
            assertEq(hook.accrued(token, creator) - c0, 1 ether * uint256(tiers[i] - plat[i]) / 10_000);
        }
        vm.expectRevert();
        _launch(_params(0, 400, false, false), 0);
    }

    function test_buySellAndCreatorClaim() public {
        address token = _launch(_params(0, 100, false, false), 0);
        (uint256 qIn, uint256 qOut) = router.quoteBuy(token, 1 ether);
        assertEq(qIn, 1 ether);
        uint256 out = _buy(alice, token, 1 ether);
        assertEq(out, qOut);

        uint256 half = out / 2;
        (, uint256 qEth) = router.quoteSell(token, half);
        vm.startPrank(alice);
        LaunchToken(token).approve(address(router), half);
        uint256 ethOut = router.sell(token, half, qEth, alice, block.timestamp);
        vm.stopPrank();
        assertEq(ethOut, qEth);
        assertGt(ethOut, 0.5 ether);

        uint256 fees = hook.accrued(token, creator);
        uint256 cBefore = creator.balance;
        vm.prank(creator);
        hook.claim(token);
        assertEq(creator.balance - cBefore, fees);
        assertEq(hook.accrued(token, creator), 0);
        assertEq(hook.routeEarned(token), fees);

        uint256 plat = hook.platformAccrued();
        vm.prank(owner);
        hook.withdrawPlatformFees(owner);
        assertEq(owner.balance, plat);
    }

    function test_splitRoute() public {
        LaunchFactory.LaunchParams memory p = _params(0, 500, false, false);
        p.recipients = new address[](3);
        p.recipients[0] = creator;
        p.recipients[1] = bob;
        p.recipients[2] = carol;
        p.shares = new uint16[](3);
        p.shares[0] = 5000;
        p.shares[1] = 3000;
        p.shares[2] = 2000;
        address token = _launch(p, 0);
        _buy(alice, token, 1 ether);
        uint256 route = 1 ether * 425 / 10_000;
        assertEq(hook.accrued(token, creator), route * 5000 / 10_000);
        assertEq(hook.accrued(token, bob), route * 3000 / 10_000);
        assertEq(hook.accrued(token, carol), route - route * 5000 / 10_000 - route * 3000 / 10_000);

        vm.prank(carol);
        hook.changeRecipient(token, alice);
        _buy(bob, token, 1 ether);
        assertGt(hook.accrued(token, alice), 0);
        vm.expectRevert(LaunchHook.NotRecipient.selector);
        vm.prank(carol);
        hook.changeRecipient(token, carol);

        p.shares[2] = 1000;
        vm.expectRevert(LaunchHook.InvalidRoute.selector);
        _launch(p, 0);
    }

    function test_holdersRoute() public {
        address token = _launch(_params(0, 100, false, true), 0);
        uint256 a = _buy(alice, token, 1 ether);
        uint256 b = _buy(bob, token, 1 ether);
        assertEq(hook.accrued(token, creator), 0);
        uint256 pending = hook.holdersPending(token);
        assertEq(pending, 2 ether * 60 / 10_000);
        assertEq(LaunchToken(token).totalShares(), a + b);

        hook.flushHolders(token);
        assertEq(hook.holdersPending(token), 0);
        uint256 ca = LaunchToken(token).claimable(alice);
        uint256 cb = LaunchToken(token).claimable(bob);
        assertApproxEqAbs(ca + cb, pending, 10);
        assertApproxEqRel(ca * b, cb * a, 1e9);

        // transfers move future rewards but not already-earned ones
        vm.prank(alice);
        LaunchToken(token).transfer(carol, a);
        assertEq(LaunchToken(token).claimable(alice), ca);
        assertEq(LaunchToken(token).claimable(carol), 0);

        uint256 before = alice.balance;
        vm.prank(alice);
        LaunchToken(token).claim();
        assertEq(alice.balance - before, ca);
        assertEq(LaunchToken(token).claimable(alice), 0);

        // claim also flushes new fees
        _buy(bob, token, 1 ether);
        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        uint256 got = LaunchToken(token).claim();
        assertGt(got, cb);
        assertEq(bob.balance - bobBefore, got);
    }

    function test_snipeTaxDecays() public {
        address token = _launch(_params(0, 100, true, false), 0);
        (uint256 t0,) = hook.feeRates(token, true, alice);
        assertEq(t0, 9_100);
        uint256 t = block.timestamp;
        uint256 sniped = _buy(alice, token, 1 ether);
        // extra tax follows the fee route
        assertEq(hook.accrued(token, creator), 1 ether * 9_060 / 10_000);
        vm.warp(t + 30);
        (uint256 t30,) = hook.feeRates(token, true, alice);
        assertEq(t30, 4_600);
        vm.warp(t + 60);
        (uint256 t60,) = hook.feeRates(token, true, alice);
        assertEq(t60, 100);
        (uint256 s0,) = hook.feeRates(token, false, alice);
        assertEq(s0, 100);

        address token2 = _launch(_params(0, 100, false, false), 0);
        (uint256 off,) = hook.feeRates(token2, true, alice);
        assertEq(off, 100);
        uint256 normal = _buy(bob, token2, 1 ether);
        assertLt(sniped * 5, normal);
    }

    function test_launchBuyExemptFromSnipe() public {
        address token = _launch(_params(0, 100, true, false), 1 ether);
        uint256 got = LaunchToken(token).balanceOf(creator);
        assertGt(got, 300_000_000 ether);
        assertEq(hook.platformAccrued(), 0.004 ether);
    }

    function test_onlyFactoryCanCreatePools() public {
        address[] memory none;
        LaunchToken t = new LaunchToken("X", "X", 1e18, address(this), address(hook), false, none);
        PoolKey memory key = PoolKey(CurrencyLibrary.ADDRESS_ZERO, Currency.wrap(address(t)), 0, 200, IHooks(address(hook)));
        vm.expectRevert();
        PM.initialize(key, TickMath.getSqrtPriceAtTick(START_TICK));
    }

    function test_slippageGuard() public {
        address token = _launch(_params(0, 100, false, false), 0);
        (, uint256 q) = router.quoteBuy(token, 1 ether);
        vm.expectRevert(LaunchRouter.InsufficientOutput.selector);
        vm.prank(alice);
        router.buy{value: 1 ether}(token, q + 1, alice, block.timestamp);

        LaunchFactory.LaunchParams memory p = _params(0, 100, false, false);
        p.minTokensOut = type(uint256).max;
        vm.expectRevert(LaunchFactory.InsufficientOutput.selector);
        _launch(p, 1 ether);
    }

    function test_exactOutputSwapsChargeSameShare() public {
        address token = _launch(_params(0, 100, false, false), 0);
        PoolSwapTest swapper = new PoolSwapTest(PM);
        PoolKey memory key = factory.poolKeyOf(token);
        PoolSwapTest.TestSettings memory ts = PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false});

        vm.prank(alice);
        BalanceDelta d = swapper.swap{value: 1 ether}(
            key, SwapParams(true, int256(100_000_000 ether), TickMath.MIN_SQRT_PRICE + 1), ts, ""
        );
        uint256 paid = uint256(uint128(-d.amount0()));
        assertEq(uint256(uint128(d.amount1())), 100_000_000 ether);
        uint256 fee1 = hook.platformAccrued() + hook.accrued(token, creator);
        assertApproxEqAbs(fee1 * 10_000, paid * 100, 10_000);

        vm.startPrank(alice);
        LaunchToken(token).approve(address(swapper), type(uint256).max);
        uint256 before = alice.balance;
        swapper.swap(key, SwapParams(false, int256(0.1 ether), TickMath.MAX_SQRT_PRICE - 1), ts, "");
        vm.stopPrank();
        assertEq(alice.balance - before, 0.1 ether);
        uint256 fee2 = hook.platformAccrued() + hook.accrued(token, creator) - fee1;
        assertApproxEqAbs(fee2 * 10_000, (0.1 ether + fee2) * 100, 10_000);
    }
}
