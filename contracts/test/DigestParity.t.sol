// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CredValidRegistry} from "../src/CredValidRegistry.sol";

/// Guards against the frontend and contract drifting apart on EIP-712 encoding.
/// The expected value is produced by web/scripts/digest-vector.ts (viem hashTypedData).
contract DigestParityTest is Test {
    function test_DigestMatchesFrontendEncoding() public {
        vm.chainId(31337);
        CredValidRegistry registry = new CredValidRegistry(address(this));
        assertEq(address(registry), 0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f, "deploy address changed; update the vector");
        bytes32 digest = registry.credentialDigest(
            0x1111111111111111111111111111111111111111111111111111111111111111,
            0x2222222222222222222222222222222222222222222222222222222222222222,
            0x3333333333333333333333333333333333333333,
            1893455999
        );
        assertEq(digest, 0x73ef3a222b39f61e25dc009191f5a71fa57a05b3fe2fa66a7da4bc164ad5970e);
    }
}
