// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {CredValidRegistry} from "../src/CredValidRegistry.sol";

contract CredValidRegistryTest is Test {
    CredValidRegistry internal registry;

    address internal admin = makeAddr("admin");
    address internal outsider = makeAddr("outsider");

    // University issues from its wallet and signs with a separate key.
    address internal uni = makeAddr("university");
    uint256 internal uniSignerKey = 0xA11CE;
    address internal uniSigner;

    // Employer signs with the same key it transacts with.
    uint256 internal employerKey = 0xB0B;
    address internal employer;

    bytes32 internal constant ID_1 = keccak256("cred-1");
    bytes32 internal constant ID_2 = keccak256("cred-2");
    // keccak literals (not sha256) so reading them never makes a precompile call that eats vm.prank
    bytes32 internal constant HASH_1 = keccak256("payload-1");
    bytes32 internal constant HASH_2 = keccak256("payload-2");

    function setUp() public {
        vm.warp(1_760_000_000);
        uniSigner = vm.addr(uniSignerKey);
        employer = vm.addr(employerKey);

        registry = new CredValidRegistry(admin);
        vm.startPrank(admin);
        registry.registerIssuer(uni, uniSigner, "Northbridge University");
        registry.registerIssuer(employer, employer, "Halcyon Systems Ltd");
        vm.stopPrank();
    }

    // ------------------------------------------------------------ helpers

    function _sign(uint256 key, bytes32 id, bytes32 payloadHash, address issuer, uint64 expiresAt)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = registry.credentialDigest(id, payloadHash, issuer, expiresAt);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _issueAsUni(bytes32 id, bytes32 payloadHash, uint64 expiresAt) internal {
        bytes memory sig = _sign(uniSignerKey, id, payloadHash, uni, expiresAt);
        vm.prank(uni);
        registry.issueCredential(id, payloadHash, expiresAt, sig);
    }

    // ------------------------------------------------- issuer registration

    function test_RegisterIssuer_StoresRecordAndEmits() public {
        address newIssuer = makeAddr("college");
        vm.expectEmit(true, true, true, true);
        emit CredValidRegistry.IssuerRegistered(newIssuer, newIssuer, "Ridgeway College", admin);
        vm.prank(admin);
        registry.registerIssuer(newIssuer, newIssuer, "Ridgeway College");

        CredValidRegistry.Issuer memory i = registry.getIssuer(newIssuer);
        assertEq(uint8(i.status), uint8(CredValidRegistry.IssuerStatus.Active));
        assertEq(i.signer, newIssuer);
        assertEq(i.name, "Ridgeway College");
        assertTrue(registry.isActiveIssuer(newIssuer));
        assertEq(registry.issuerCount(), 3);
    }

    function test_RegisterIssuer_RejectsDuplicate() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(CredValidRegistry.IssuerAlreadyRegistered.selector, uni));
        registry.registerIssuer(uni, uniSigner, "Again");
    }

    function test_RegisterIssuer_ValidatesInput() public {
        vm.startPrank(admin);
        vm.expectRevert(CredValidRegistry.ZeroAddress.selector);
        registry.registerIssuer(address(0), uniSigner, "X");
        vm.expectRevert(CredValidRegistry.ZeroAddress.selector);
        registry.registerIssuer(makeAddr("x"), address(0), "X");
        vm.expectRevert(CredValidRegistry.InvalidIssuerName.selector);
        registry.registerIssuer(makeAddr("x"), uniSigner, "");
        vm.expectRevert(CredValidRegistry.InvalidIssuerName.selector);
        registry.registerIssuer(makeAddr("x"), uniSigner, string(new bytes(97)));
        vm.stopPrank();
    }

    // -------------------------------------------------------- access control

    function test_AccessControl_OnlyIssuerAdminManagesIssuers() public {
        bytes memory missingRole = abi.encodeWithSelector(
            IAccessControl.AccessControlUnauthorizedAccount.selector, outsider, registry.ISSUER_ADMIN_ROLE()
        );
        vm.startPrank(outsider);
        vm.expectRevert(missingRole);
        registry.registerIssuer(outsider, outsider, "Diploma Mill");
        vm.expectRevert(missingRole);
        registry.suspendIssuer(uni);
        vm.expectRevert(missingRole);
        registry.reinstateIssuer(uni);
        vm.expectRevert(missingRole);
        registry.setIssuerSigner(uni, outsider);
        vm.stopPrank();
    }

    function test_AccessControl_IssuersCannotGrantThemselvesAdmin() public {
        bytes32 adminRole = registry.ISSUER_ADMIN_ROLE();
        bytes32 rootRole = registry.DEFAULT_ADMIN_ROLE();
        vm.prank(uni);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, uni, rootRole));
        registry.grantRole(adminRole, uni);
    }

    function test_AccessControl_DelegatedIssuerAdminCanRegister() public {
        address ops = makeAddr("ops");
        bytes32 role = registry.ISSUER_ADMIN_ROLE();
        vm.prank(admin);
        registry.grantRole(role, ops);
        vm.prank(ops);
        registry.registerIssuer(makeAddr("delegated"), makeAddr("delegated"), "Delegated Institute");
        assertEq(registry.issuerCount(), 3);
    }

    // ---------------------------------------------------------- issuance

    function test_Issue_AuthorizedIssuerWithSeparateSigner() public {
        uint64 expiresAt = uint64(block.timestamp + 365 days);
        bytes memory sig = _sign(uniSignerKey, ID_1, HASH_1, uni, expiresAt);

        vm.expectEmit(true, true, true, true);
        emit CredValidRegistry.CredentialIssued(ID_1, uni, uniSigner, HASH_1, expiresAt);
        vm.prank(uni);
        registry.issueCredential(ID_1, HASH_1, expiresAt, sig);

        CredValidRegistry.Credential memory c = registry.getCredential(ID_1);
        assertEq(c.payloadHash, HASH_1);
        assertEq(c.issuer, uni);
        assertEq(c.signer, uniSigner);
        assertEq(c.issuedAt, block.timestamp);
        assertEq(c.expiresAt, expiresAt);
        assertEq(uint8(c.status), uint8(CredValidRegistry.CredentialStatus.Active));
        assertEq(registry.credentialCount(), 1);
    }

    function test_Issue_AuthorizedIssuerSigningWithWallet() public {
        bytes memory sig = _sign(employerKey, ID_1, HASH_1, employer, 0);
        vm.prank(employer);
        registry.issueCredential(ID_1, HASH_1, 0, sig);
        assertEq(registry.getCredential(ID_1).signer, employer);
    }

    function test_Issue_RejectsUnregisteredSender() public {
        bytes memory sig = _sign(uniSignerKey, ID_1, HASH_1, outsider, 0);
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(CredValidRegistry.IssuerNotRegistered.selector, outsider));
        registry.issueCredential(ID_1, HASH_1, 0, sig);
    }

    function test_Issue_RejectsSignatureFromWrongKey() public {
        uint256 attackerKey = 0xBAD;
        bytes memory sig = _sign(attackerKey, ID_1, HASH_1, uni, 0);
        vm.prank(uni);
        vm.expectRevert(
            abi.encodeWithSelector(CredValidRegistry.InvalidIssuerSignature.selector, vm.addr(attackerKey), uniSigner)
        );
        registry.issueCredential(ID_1, HASH_1, 0, sig);
    }

    function test_Issue_RejectsSignatureReplayedByAnotherIssuer() public {
        // Employer cannot replay the university's endorsement as its own: issuer is in the digest.
        bytes memory sig = _sign(uniSignerKey, ID_1, HASH_1, uni, 0);
        vm.prank(employer);
        vm.expectRevert();
        registry.issueCredential(ID_1, HASH_1, 0, sig);
    }

    function test_Issue_RejectsTamperedPayloadHash() public {
        bytes memory sig = _sign(uniSignerKey, ID_1, HASH_1, uni, 0);
        vm.prank(uni);
        vm.expectRevert();
        registry.issueCredential(ID_1, HASH_2, 0, sig);
    }

    function test_Issue_RejectsDuplicateId() public {
        _issueAsUni(ID_1, HASH_1, 0);
        bytes memory sig = _sign(uniSignerKey, ID_1, HASH_2, uni, 0);
        vm.prank(uni);
        vm.expectRevert(abi.encodeWithSelector(CredValidRegistry.CredentialAlreadyExists.selector, ID_1));
        registry.issueCredential(ID_1, HASH_2, 0, sig);
    }

    function test_Issue_RejectsDuplicateIdAcrossIssuers() public {
        _issueAsUni(ID_1, HASH_1, 0);
        bytes memory sig = _sign(employerKey, ID_1, HASH_2, employer, 0);
        vm.prank(employer);
        vm.expectRevert(abi.encodeWithSelector(CredValidRegistry.CredentialAlreadyExists.selector, ID_1));
        registry.issueCredential(ID_1, HASH_2, 0, sig);
    }

    function test_Issue_ValidatesInput() public {
        bytes memory sig = _sign(uniSignerKey, bytes32(0), HASH_1, uni, 0);
        vm.prank(uni);
        vm.expectRevert(CredValidRegistry.InvalidCredentialId.selector);
        registry.issueCredential(bytes32(0), HASH_1, 0, sig);

        sig = _sign(uniSignerKey, ID_1, bytes32(0), uni, 0);
        vm.prank(uni);
        vm.expectRevert(CredValidRegistry.InvalidPayloadHash.selector);
        registry.issueCredential(ID_1, bytes32(0), 0, sig);

        uint64 past = uint64(block.timestamp - 1);
        sig = _sign(uniSignerKey, ID_1, HASH_1, uni, past);
        vm.prank(uni);
        vm.expectRevert(abi.encodeWithSelector(CredValidRegistry.InvalidExpiry.selector, past));
        registry.issueCredential(ID_1, HASH_1, past, sig);
    }

    // ---------------------------------------------------------- revocation

    function test_Revoke_ByIssuer() public {
        _issueAsUni(ID_1, HASH_1, 0);
        vm.warp(block.timestamp + 10 days);
        vm.expectEmit(true, true, true, true);
        emit CredValidRegistry.CredentialRevoked(ID_1, uni, uni, 2);
        vm.prank(uni);
        registry.revokeCredential(ID_1, 2);

        CredValidRegistry.Credential memory c = registry.getCredential(ID_1);
        assertEq(uint8(c.status), uint8(CredValidRegistry.CredentialStatus.Revoked));
        assertEq(c.revocationReason, 2);
        assertEq(c.statusChangedAt, block.timestamp);
    }

    function test_Revoke_ByIssuerAdmin() public {
        _issueAsUni(ID_1, HASH_1, 0);
        vm.prank(admin);
        registry.revokeCredential(ID_1, 1);
        assertEq(uint8(registry.getCredential(ID_1).status), uint8(CredValidRegistry.CredentialStatus.Revoked));
    }

    function test_Revoke_RejectsOutsider() public {
        _issueAsUni(ID_1, HASH_1, 0);
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(CredValidRegistry.NotIssuerOrAdmin.selector, outsider));
        registry.revokeCredential(ID_1, 1);
    }

    function test_Revoke_RejectsOtherIssuer() public {
        _issueAsUni(ID_1, HASH_1, 0);
        vm.prank(employer);
        vm.expectRevert(abi.encodeWithSelector(CredValidRegistry.NotIssuerOrAdmin.selector, employer));
        registry.revokeCredential(ID_1, 1);
    }

    function test_Revoke_RejectsUnknownAndRepeat() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(CredValidRegistry.CredentialNotFound.selector, ID_2));
        registry.revokeCredential(ID_2, 1);

        _issueAsUni(ID_1, HASH_1, 0);
        vm.prank(uni);
        registry.revokeCredential(ID_1, 1);
        vm.prank(uni);
        vm.expectRevert(
            abi.encodeWithSelector(
                CredValidRegistry.CredentialNotActive.selector, ID_1, CredValidRegistry.CredentialStatus.Revoked
            )
        );
        registry.revokeCredential(ID_1, 1);
    }

    // --------------------------------------------------------- supersession

    function test_Supersede_ReplacesCredential() public {
        _issueAsUni(ID_1, HASH_1, 0);
        bytes memory sig = _sign(uniSignerKey, ID_2, HASH_2, uni, 0);

        vm.expectEmit(true, true, true, true);
        emit CredValidRegistry.CredentialSuperseded(ID_1, ID_2, uni);
        vm.prank(uni);
        registry.supersedeCredential(ID_1, ID_2, HASH_2, 0, sig);

        CredValidRegistry.Credential memory old = registry.getCredential(ID_1);
        CredValidRegistry.Credential memory fresh = registry.getCredential(ID_2);
        assertEq(uint8(old.status), uint8(CredValidRegistry.CredentialStatus.Superseded));
        assertEq(old.supersededBy, ID_2);
        assertEq(uint8(fresh.status), uint8(CredValidRegistry.CredentialStatus.Active));
        assertEq(fresh.payloadHash, HASH_2);
        assertEq(registry.credentialCount(), 2);
    }

    function test_Supersede_RejectsNonIssuerIncludingAdmin() public {
        _issueAsUni(ID_1, HASH_1, 0);
        bytes memory sig = _sign(uniSignerKey, ID_2, HASH_2, uni, 0);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(CredValidRegistry.NotCredentialIssuer.selector, admin));
        registry.supersedeCredential(ID_1, ID_2, HASH_2, 0, sig);
    }

    function test_Supersede_RejectsSelfAndInactive() public {
        _issueAsUni(ID_1, HASH_1, 0);
        bytes memory sig = _sign(uniSignerKey, ID_1, HASH_2, uni, 0);
        vm.prank(uni);
        vm.expectRevert(CredValidRegistry.SelfSupersession.selector);
        registry.supersedeCredential(ID_1, ID_1, HASH_2, 0, sig);

        vm.prank(uni);
        registry.revokeCredential(ID_1, 1);
        sig = _sign(uniSignerKey, ID_2, HASH_2, uni, 0);
        vm.prank(uni);
        vm.expectRevert(
            abi.encodeWithSelector(
                CredValidRegistry.CredentialNotActive.selector, ID_1, CredValidRegistry.CredentialStatus.Revoked
            )
        );
        registry.supersedeCredential(ID_1, ID_2, HASH_2, 0, sig);
    }

    // --------------------------------------------------------- suspension

    function test_Suspend_BlocksIssuanceButAllowsRevocation() public {
        _issueAsUni(ID_1, HASH_1, 0);
        vm.prank(admin);
        registry.suspendIssuer(uni);
        assertFalse(registry.isActiveIssuer(uni));

        bytes memory sig = _sign(uniSignerKey, ID_2, HASH_2, uni, 0);
        vm.prank(uni);
        vm.expectRevert(abi.encodeWithSelector(CredValidRegistry.IssuerNotActive.selector, uni));
        registry.issueCredential(ID_2, HASH_2, 0, sig);

        // Existing credential stays active until explicitly revoked; issuer may still revoke.
        assertEq(uint8(registry.getCredential(ID_1).status), uint8(CredValidRegistry.CredentialStatus.Active));
        vm.prank(uni);
        registry.revokeCredential(ID_1, 1);
    }

    function test_Suspend_BlocksSupersession() public {
        _issueAsUni(ID_1, HASH_1, 0);
        vm.prank(admin);
        registry.suspendIssuer(uni);
        bytes memory sig = _sign(uniSignerKey, ID_2, HASH_2, uni, 0);
        vm.prank(uni);
        vm.expectRevert(abi.encodeWithSelector(CredValidRegistry.IssuerNotActive.selector, uni));
        registry.supersedeCredential(ID_1, ID_2, HASH_2, 0, sig);
    }

    function test_Reinstate_RestoresIssuance() public {
        vm.startPrank(admin);
        registry.suspendIssuer(uni);
        vm.expectRevert(abi.encodeWithSelector(CredValidRegistry.IssuerAlreadySuspended.selector, uni));
        registry.suspendIssuer(uni);
        registry.reinstateIssuer(uni);
        vm.expectRevert(abi.encodeWithSelector(CredValidRegistry.IssuerNotSuspended.selector, uni));
        registry.reinstateIssuer(uni);
        vm.stopPrank();

        _issueAsUni(ID_1, HASH_1, 0);
        assertEq(registry.credentialCount(), 1);
    }

    // ---------------------------------------------------------- key rotation

    function test_SignerRotation_OldKeyRejectedNewKeyAccepted_ExistingRecordKeepsSigner() public {
        _issueAsUni(ID_1, HASH_1, 0);
        uint256 newKey = 0xC0FFEE;
        vm.prank(admin);
        registry.setIssuerSigner(uni, vm.addr(newKey));

        bytes memory oldSig = _sign(uniSignerKey, ID_2, HASH_2, uni, 0);
        vm.prank(uni);
        vm.expectRevert();
        registry.issueCredential(ID_2, HASH_2, 0, oldSig);

        bytes memory newSig = _sign(newKey, ID_2, HASH_2, uni, 0);
        vm.prank(uni);
        registry.issueCredential(ID_2, HASH_2, 0, newSig);

        assertEq(registry.getCredential(ID_1).signer, uniSigner);
        assertEq(registry.getCredential(ID_2).signer, vm.addr(newKey));
    }

    // ------------------------------------------------------------- fuzzing

    function testFuzz_OnlyRegisteredSignerCanEndorse(uint256 key) public {
        key = bound(key, 1, 115792089237316195423570985008687907852837564279074904382605163141518161494336);
        vm.assume(key != uniSignerKey);
        bytes memory sig = _sign(key, ID_1, HASH_1, uni, 0);
        vm.prank(uni);
        vm.expectRevert();
        registry.issueCredential(ID_1, HASH_1, 0, sig);
    }
}
