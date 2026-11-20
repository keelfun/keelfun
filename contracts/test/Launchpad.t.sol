// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {HookMiner} from "v4-periphery/test/shared/HookMiner.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {LaunchHook} from "../src/LaunchHook.sol";
import {LaunchFactory} from "../src/LaunchFactory.sol";
import {LaunchRouter} from "../src/LaunchRouter.sol";
import {LaunchToken} from "../src/LaunchToken.sol";

contract LaunchpadTest is Test {
    IPoolManager PM;
    int24 constant ETH_TICK = 200_200;
    int24 constant USDC_TICK = 402_000;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    LaunchHook hook;
    LaunchFactory factory;
    LaunchRouter router;
    MockERC20 usdc;

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
        factory = new LaunchFactory(PM, hook, owner);
        router = new LaunchRouter(PM, factory);
        usdc = new MockERC20("USD Coin", "USDC", 6);
        vm.startPrank(owner);
        hook.setFactory(address(factory));
        hook.setTrustedRouter(address(router), true);
        factory.setPair(address(0), true, ETH_TICK);
        factory.setPair(address(usdc), true, USDC_TICK);
        vm.stopPrank();
        address[4] memory who = [creator, alice, bob, carol];
        for (uint256 i; i < 4; ++i) {
            vm.deal(who[i], 100 ether);
            usdc.mint(who[i], 1_000_000e6);
        }
    }

    // ---------------------------------------------------------------- helpers

    function _params(address pair, uint8 tier, uint16 buyBps, uint16 sellBps, uint16 c, uint16 h, uint16 b, bool snipe)
        internal
        view
        returns (LaunchFactory.LaunchParams memory p)
    {
        address[] memory r;
        uint16[] memory s;
        if (c > 0) {
            r = new address[](1);
            r[0] = creator;
            s = new uint16[](1);
            s[0] = 10_000;
        }
        p = LaunchFactory.LaunchParams({
            name: "Keel Cat",
            symbol: "KCAT",
            metadataURI: "ipfs://meta",
            supplyTier: tier,
            pair: pair,
            buyBps: buyBps,
            sellBps: sellBps,
            creatorBps: c,
            holdersBps: h,
            burnBps: b,
            antiSnipe: snipe,
            editable: true,
            recipients: r,
            shares: s,
            salt: bytes32(0),
            devBuy: 0,
            minTokensOut: 0
        });
    }

    function _eth(uint16 buyBps, uint16 sellBps) internal view returns (LaunchFactory.LaunchParams memory) {
        return _params(address(0), 0, buyBps, sellBps, 10_000, 0, 0, false);
    }

    /// Finds a salt whose token sorts above the pair (and, optionally, ends with `suffix`).
    function _mine(LaunchFactory.LaunchParams memory p, uint16 suffix, bool useSuffix) internal view returns (bytes32) {
        bytes32 h = factory.tokenInitCodeHash(p.name, p.symbol, p.supplyTier, p.pair, p.holdersBps > 0);
        for (uint256 i;; ++i) {
            address t = factory.predictToken(creator, bytes32(i), h);
            if (uint160(t) > uint160(p.pair) && (!useSuffix || uint16(uint160(t)) == suffix)) return bytes32(i);
        }
    }

    function _launch(LaunchFactory.LaunchParams memory p) internal returns (address token) {
        if (p.pair != address(0)) p.salt = _mine(p, 0, false);
        vm.startPrank(creator);
        if (p.pair != address(0)) usdc.approve(address(factory), p.devBuy);
        token = factory.launch{value: p.pair == address(0) ? p.devBuy : 0}(p);
        vm.stopPrank();
    }

    function _buy(address who, address token, uint256 amount) internal returns (uint256) {
        vm.startPrank(who);
        uint256 out;
        if (factory.poolKeyOf(token).currency0.isAddressZero()) {
            out = router.buy{value: amount}(token, amount, 0, who, block.timestamp);
        } else {
            usdc.approve(address(router), amount);
            out = router.buy(token, amount, 0, who, block.timestamp);
        }
        vm.stopPrank();
        return out;
    }

    function _sell(address who, address token, uint256 amount) internal returns (uint256 out) {
        vm.startPrank(who);
        LaunchToken(token).approve(address(router), amount);
        out = router.sell(token, amount, 0, who, block.timestamp);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- tests

    function test_launchSeedsWholeSupplyEveryTier() public {
        for (uint8 t; t <= 3; ++t) {
            LaunchFactory.LaunchParams memory p = _eth(100, 100);
            p.supplyTier = t;
            p.salt = bytes32(uint256(t));
            address token = _launch(p);
            uint256 supply = 1_000_000_000 ether * 10 ** t;
            uint256 burned = LaunchToken(token).balanceOf(DEAD);
            assertEq(LaunchToken(token).totalSupply(), supply);
            assertEq(LaunchToken(token).balanceOf(address(PM)) + burned, supply);
            assertLt(burned * 1e12, supply);
            // same opening market cap (~2 ETH): 1 ETH buys ~a third of the supply on every tier
            uint256 out = _buy(alice, token, 1 ether);
            assertGt(out * 100, supply * 30);
            assertLt(out * 100, supply * 34);
        }
    }

    function test_platformSlice() public view {
        assertEq(hook.platformBpsFor(100), 40);
        assertEq(hook.platformBpsFor(200), 50);
        assertEq(hook.platformBpsFor(300), 60);
        assertEq(hook.platformBpsFor(500), 80);
        assertEq(hook.platformBpsFor(700), 100);
        assertEq(hook.platformBpsFor(1000), 100);
    }

    function test_invalidTaxOrAllocationReverts() public {
        vm.expectRevert();
        _launch(_eth(50, 100));
        vm.expectRevert();
        _launch(_eth(100, 1100));
        LaunchFactory.LaunchParams memory p = _params(address(0), 0, 100, 100, 5_000, 4_000, 0, false);
        vm.expectRevert();
        _launch(p);
    }

    function test_separateBuyAndSellTax() public {
        address token = _launch(_eth(200, 500));
        uint256 out = _buy(alice, token, 1 ether);
        assertEq(hook.platformAccrued(address(0)), 1 ether * 50 / 10_000);
        assertEq(hook.accrued(token, creator), 1 ether * 150 / 10_000);

        uint256 p0 = hook.platformAccrued(address(0));
        uint256 c0 = hook.accrued(token, creator);
        uint256 got = _sell(alice, token, out / 2);
        uint256 gross = got * 10_000 / 9_500;
        assertApproxEqAbs(hook.platformAccrued(address(0)) - p0, gross * 80 / 10_000, 2);
        assertApproxEqAbs(hook.accrued(token, creator) - c0, gross * 420 / 10_000, 2);
    }

    function test_quotesMatchAndCreatorClaim() public {
        address token = _launch(_eth(100, 100));
        (uint256 qIn, uint256 qOut) = router.quoteBuy(token, 1 ether);
        assertEq(qIn, 1 ether);
        uint256 out = _buy(alice, token, 1 ether);
        assertEq(out, qOut);
        (, uint256 qEth) = router.quoteSell(token, out / 2);
        assertEq(_sell(alice, token, out / 2), qEth);

        uint256 fees = hook.accrued(token, creator);
        uint256 before = creator.balance;
        vm.prank(creator);
        hook.claim(token);
        assertEq(creator.balance - before, fees);
        assertEq(hook.routeEarned(token), fees);

        uint256 plat = hook.platformAccrued(address(0));
        vm.prank(owner);
        hook.withdrawPlatformFees(address(0), owner);
        assertEq(owner.balance, plat);
    }

    function test_splitAllocation() public {
        LaunchFactory.LaunchParams memory p = _params(address(0), 0, 1000, 1000, 5_000, 2_500, 2_500, false);
        address[] memory r = new address[](2);
        r[0] = creator;
        r[1] = carol;
        uint16[] memory s = new uint16[](2);
        s[0] = 6_000;
        s[1] = 4_000;
        p.recipients = r;
        p.shares = s;
        p.holdersBps = 2_500;
        address token = _launch(p);
        _buy(alice, token, 1 ether);
        uint256 route = 1 ether * 900 / 10_000;
        assertEq(hook.holdersPending(token), route / 4);
        assertEq(hook.burnPending(token), route / 4);
        assertEq(hook.accrued(token, creator), route / 2 * 6 / 10);
        assertEq(hook.accrued(token, carol), route / 2 - route / 2 * 6 / 10);
    }

    function test_holderDividends() public {
        address token = _launch(_params(address(0), 0, 500, 500, 0, 10_000, 0, false));
        uint256 a = _buy(alice, token, 1 ether);
        uint256 b = _buy(bob, token, 1 ether);
        uint256 pending = hook.holdersPending(token);
        assertGt(pending, 0);
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        LaunchToken(token).claim();
        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        LaunchToken(token).claim();
        uint256 aGot = alice.balance - aliceBefore;
        uint256 bGot = bob.balance - bobBefore;
        assertApproxEqAbs(aGot + bGot, pending, 2);
        assertApproxEqRel(aGot * b, bGot * a, 1e12);
    }

    function test_burnAllocationBuysAndBurns() public {
        address token = _launch(_params(address(0), 0, 1000, 1000, 0, 0, 10_000, false));
        uint256 out = _buy(alice, token, 2 ether);
        _sell(alice, token, out / 2);
        uint256 pending = hook.burnPending(token);
        assertGt(pending, 0);
        uint256 dead0 = LaunchToken(token).balanceOf(DEAD);
        uint256 plat0 = hook.platformAccrued(address(0));
        uint256 burned = hook.burn(token);
        assertGt(burned, 0);
        assertEq(LaunchToken(token).balanceOf(DEAD) - dead0, burned);
        assertEq(hook.burnPending(token), 0);
        assertEq(hook.platformAccrued(address(0)), plat0); // burn swaps are tax-free
        assertEq(hook.burn(token), 0);
    }

    function test_usdcPair() public {
        LaunchFactory.LaunchParams memory p = _params(address(usdc), 0, 300, 300, 10_000, 0, 0, false);
        p.devBuy = 100e6;
        address token = _launch(p);
        assertGt(uint160(token), uint160(address(usdc)));
        assertGt(LaunchToken(token).balanceOf(creator), 0);
        assertEq(LaunchToken(token).pair(), address(usdc));

        // ~$3.5K opening cap: $1000 buys roughly a fifth of the supply
        uint256 out = _buy(alice, token, 1_000e6);
        assertGt(out, 150_000_000 ether);
        uint256 got = _sell(alice, token, out);
        assertGt(got, 900e6);

        uint256 fees = hook.accrued(token, creator);
        assertGt(fees, 0);
        uint256 before = usdc.balanceOf(creator);
        vm.prank(creator);
        hook.claim(token);
        assertEq(usdc.balanceOf(creator) - before, fees);

        uint256 plat = hook.platformAccrued(address(usdc));
        vm.prank(owner);
        hook.withdrawPlatformFees(address(usdc), owner);
        assertEq(usdc.balanceOf(owner), plat);
    }

    function test_usdcHolderDividendsAndBurn() public {
        address token = _launch(_params(address(usdc), 0, 1000, 1000, 0, 5_000, 5_000, false));
        _buy(alice, token, 500e6);
        _buy(bob, token, 500e6);
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        LaunchToken(token).claim();
        assertGt(usdc.balanceOf(alice), before);
        assertGt(hook.burn(token), 0);
    }

    function test_vanityAndBadSalt() public {
        LaunchFactory.LaunchParams memory p = _eth(100, 100);
        bytes32 h = factory.tokenInitCodeHash(p.name, p.symbol, p.supplyTier, p.pair, false);
        p.salt = _mine(p, 0x0ee1, true);
        address expected = factory.predictToken(creator, p.salt, h);
        address token = _launch(p);
        assertEq(token, expected);
        assertEq(uint16(uint160(token)), 0x0ee1);

        LaunchFactory.LaunchParams memory q = _params(address(usdc), 0, 100, 100, 10_000, 0, 0, false);
        bytes32 hq = factory.tokenInitCodeHash(q.name, q.symbol, 0, address(usdc), false);
        for (uint256 i;; ++i) {
            if (uint160(factory.predictToken(creator, bytes32(i), hq)) < uint160(address(usdc))) {
                q.salt = bytes32(i);
                break;
            }
        }
        vm.prank(creator);
        vm.expectRevert(LaunchFactory.BadSalt.selector);
        factory.launch(q);
    }

    function test_pairMustBeEnabled() public {
        vm.prank(owner);
        factory.setPair(address(usdc), false, USDC_TICK);
        LaunchFactory.LaunchParams memory p = _params(address(usdc), 0, 100, 100, 10_000, 0, 0, false);
        p.salt = _mine(p, 0, false);
        vm.prank(creator);
        vm.expectRevert(LaunchFactory.PairNotEnabled.selector);
        factory.launch(p);
        vm.prank(alice);
        vm.expectRevert();
        factory.setPair(address(usdc), true, USDC_TICK);
    }

    function test_metadataEditableThenFrozen() public {
        address token = _launch(_eth(100, 100));
        vm.prank(alice);
        vm.expectRevert(LaunchFactory.NotCreator.selector);
        factory.setMetadata(token, "ipfs://x");
        vm.prank(creator);
        factory.setMetadata(token, "ipfs://new");
        vm.prank(creator);
        factory.freezeMetadata(token);
        vm.prank(creator);
        vm.expectRevert(LaunchFactory.MetadataLocked.selector);
        factory.setMetadata(token, "ipfs://again");

        LaunchFactory.LaunchParams memory p = _eth(100, 100);
        p.editable = false;
        p.salt = bytes32(uint256(7));
        address locked = _launch(p);
        vm.prank(creator);
        vm.expectRevert(LaunchFactory.MetadataLocked.selector);
        factory.setMetadata(locked, "ipfs://x");
    }

    function test_snipeTaxDecaysAndDevBuyExempt() public {
        LaunchFactory.LaunchParams memory p = _params(address(0), 0, 100, 100, 10_000, 0, 0, true);
        p.devBuy = 1 ether;
        uint256 t0 = block.timestamp;
        address token = _launch(p);
        assertEq(hook.accrued(token, creator), 1 ether * 60 / 10_000); // dev buy pays the normal tax only
        assertEq(hook.snipeTaxBps(token), 9_000);
        vm.warp(t0 + 30);
        assertEq(hook.snipeTaxBps(token), 4_500);
        vm.warp(t0 + 60);
        assertEq(hook.snipeTaxBps(token), 0);
    }

    function test_onlyFactoryCanCreatePools() public {
        address token = _launch(_eth(100, 100));
        PoolKey memory key = PoolKey(Currency.wrap(address(0)), Currency.wrap(token), 3000, 60, IHooks(address(hook)));
        vm.expectRevert();
        PM.initialize(key, TickMath.getSqrtPriceAtTick(0));
    }

    function test_slippageGuardAndValue() public {
        address token = _launch(_eth(100, 100));
        (, uint256 q) = router.quoteBuy(token, 1 ether);
        vm.prank(alice);
        vm.expectRevert(LaunchRouter.InsufficientOutput.selector);
        router.buy{value: 1 ether}(token, 1 ether, q + 1, alice, block.timestamp);
        vm.prank(alice);
        vm.expectRevert(LaunchRouter.BadValue.selector);
        router.buy{value: 1 ether}(token, 2 ether, 0, alice, block.timestamp);
    }
}
