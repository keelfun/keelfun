// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "v4-periphery/test/shared/HookMiner.sol";
import {LaunchHook} from "../src/LaunchHook.sol";
import {LaunchFactory} from "../src/LaunchFactory.sol";
import {LaunchRouter} from "../src/LaunchRouter.sol";

/// forge script script/Deploy.s.sol --rpc-url base --broadcast --private-key $DEPLOYER_KEY
contract Deploy is Script {
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant CBBTC = 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf;
    IPoolManager constant BASE_PM = IPoolManager(0x498581fF718922c3f8e6A244956aF099B2652b2b);

    function run() external {
        int24 startTick = int24(vm.envOr("START_TICK", int256(200_200)));
        IPoolManager PM = IPoolManager(vm.envOr("POOL_MANAGER", address(BASE_PM)));
        vm.startBroadcast();
        address owner = vm.envOr("OWNER", msg.sender);
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG
                | Hooks.AFTER_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );
        // deploy with msg.sender as temporary owner so we can wire it up, then hand over
        (address hookAddr, bytes32 salt) =
            HookMiner.find(CREATE2_DEPLOYER, flags, type(LaunchHook).creationCode, abi.encode(PM, msg.sender));
        LaunchHook hook = new LaunchHook{salt: salt}(PM, msg.sender);
        require(address(hook) == hookAddr, "hook address mismatch");
        LaunchFactory factory = new LaunchFactory(PM, hook, msg.sender);
        LaunchRouter router = new LaunchRouter(PM, factory);
        hook.setFactory(address(factory));
        hook.setTrustedRouter(address(router), true);
        factory.setPair(address(0), true, startTick);
        if (block.chainid == 8453) {
            factory.setPair(USDC, true, int24(vm.envOr("USDC_TICK", int256(402_000))));
            factory.setPair(CBBTC, true, int24(vm.envOr("CBBTC_TICK", int256(466_200))));
        }
        if (owner != msg.sender) factory.transferOwnership(owner);
        if (owner != msg.sender) hook.transferOwnership(owner);
        vm.stopBroadcast();

        string memory json = "deployment";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeUint(json, "startBlock", block.number);
        vm.serializeAddress(json, "poolManager", address(PM));
        vm.serializeAddress(json, "hook", address(hook));
        vm.serializeAddress(json, "factory", address(factory));
        string memory out = vm.serializeAddress(json, "router", address(router));
        vm.writeJson(out, string.concat("./deployments/", vm.toString(block.chainid), ".json"));
        console2.log("hook", address(hook));
        console2.log("factory", address(factory));
        console2.log("router", address(router));
    }
}
