// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CredValidRegistry} from "../src/CredValidRegistry.sol";

/// Deploys CredValidRegistry. The admin defaults to the broadcasting account.
///
///   forge script script/Deploy.s.sol --rpc-url amoy --account credvalid-deployer --broadcast
///
/// Optional env:
///   CREDVALID_ADMIN            address that receives DEFAULT_ADMIN_ROLE + ISSUER_ADMIN_ROLE
///   CREDVALID_FIRST_ISSUER     issuer account to register immediately
///   CREDVALID_FIRST_SIGNER     signing address for that issuer (defaults to the issuer)
///   CREDVALID_FIRST_ISSUER_NAME public institution name
contract Deploy is Script {
    function run() external returns (CredValidRegistry registry) {
        vm.startBroadcast();
        (, address sender,) = vm.readCallers();
        address admin = vm.envOr("CREDVALID_ADMIN", sender);

        registry = new CredValidRegistry(admin);
        console2.log("CredValidRegistry deployed at", address(registry));
        console2.log("Admin", admin);
        console2.log("Deployment block", block.number);

        address firstIssuer = vm.envOr("CREDVALID_FIRST_ISSUER", address(0));
        if (firstIssuer != address(0) && admin == sender) {
            address signer = vm.envOr("CREDVALID_FIRST_SIGNER", firstIssuer);
            string memory name = vm.envOr("CREDVALID_FIRST_ISSUER_NAME", string("Demo Institution"));
            registry.registerIssuer(firstIssuer, signer, name);
            console2.log("Registered issuer", firstIssuer);
        }
        vm.stopBroadcast();
    }
}
