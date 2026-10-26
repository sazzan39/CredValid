// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title CredValidRegistry
/// @notice Public registry of credential commitments. It never stores personal data:
///         only an opaque credential ID, a SHA-256 commitment of the off-chain payload,
///         the issuing account, the signer that endorsed it, timestamps and status.
///
/// Trust model (see README "Trust model"):
///  - Accounts holding ISSUER_ADMIN_ROLE approve issuers and bind each issuer to one
///    signing address (which may be the issuer wallet itself or a separate key).
///  - An active issuer submits a credential together with an EIP-712 signature by its
///    registered signer. The contract checks that signature, so a record existing here
///    proves the bound signer endorsed exactly (credentialId, payloadHash, issuer, expiresAt).
///  - Revocation: the credential's issuer (even while suspended) or an issuer admin.
///  - Supersession: only the original issuer, while active, because it issues a new
///    credential that needs the issuer's signature.
///  - Suspension blocks new issuance. It does not retroactively invalidate credentials;
///    admins revoke individually when that is required.
contract CredValidRegistry is AccessControl, EIP712 {
    bytes32 public constant ISSUER_ADMIN_ROLE = keccak256("ISSUER_ADMIN_ROLE");

    bytes32 public constant CREDENTIAL_TYPEHASH =
        keccak256("Credential(bytes32 credentialId,bytes32 payloadHash,address issuer,uint64 expiresAt)");

    uint256 public constant MAX_ISSUER_NAME_LENGTH = 96;

    enum IssuerStatus {
        None,
        Active,
        Suspended
    }

    enum CredentialStatus {
        None,
        Active,
        Revoked,
        Superseded
    }

    struct Issuer {
        IssuerStatus status;
        address signer;
        uint64 registeredAt;
        uint64 updatedAt;
        string name; // public institution / employer name, never a person
    }

    struct Credential {
        bytes32 payloadHash;
        address issuer;
        address signer;
        uint64 issuedAt;
        uint64 expiresAt; // 0 = does not expire
        CredentialStatus status;
        uint64 statusChangedAt;
        uint8 revocationReason;
        bytes32 supersededBy;
    }

    mapping(address => Issuer) private _issuers;
    mapping(bytes32 => Credential) private _credentials;

    uint256 public issuerCount;
    uint256 public credentialCount;

    // ---------------------------------------------------------------- errors
    error ZeroAddress();
    error InvalidIssuerName();
    error IssuerAlreadyRegistered(address issuer);
    error IssuerNotRegistered(address issuer);
    error IssuerNotActive(address issuer);
    error IssuerAlreadySuspended(address issuer);
    error IssuerNotSuspended(address issuer);
    error InvalidCredentialId();
    error InvalidPayloadHash();
    error InvalidExpiry(uint64 expiresAt);
    error CredentialAlreadyExists(bytes32 credentialId);
    error CredentialNotFound(bytes32 credentialId);
    error CredentialNotActive(bytes32 credentialId, CredentialStatus status);
    error NotIssuerOrAdmin(address caller);
    error NotCredentialIssuer(address caller);
    error InvalidIssuerSignature(address recovered, address expected);
    error SelfSupersession();

    // ---------------------------------------------------------------- events
    event IssuerRegistered(address indexed issuer, address indexed signer, string name, address indexed by);
    event IssuerSignerUpdated(address indexed issuer, address indexed previousSigner, address indexed newSigner);
    event IssuerSuspended(address indexed issuer, address indexed by);
    event IssuerReinstated(address indexed issuer, address indexed by);
    event CredentialIssued(
        bytes32 indexed credentialId, address indexed issuer, address indexed signer, bytes32 payloadHash, uint64 expiresAt
    );
    event CredentialRevoked(bytes32 indexed credentialId, address indexed issuer, address indexed by, uint8 reason);
    event CredentialSuperseded(bytes32 indexed credentialId, bytes32 indexed replacementId, address indexed issuer);

    constructor(address admin) EIP712("CredValid", "1") {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ISSUER_ADMIN_ROLE, admin);
    }

    // ------------------------------------------------------- issuer management

    function registerIssuer(address issuer, address signer, string calldata name)
        external
        onlyRole(ISSUER_ADMIN_ROLE)
    {
        if (issuer == address(0) || signer == address(0)) revert ZeroAddress();
        uint256 len = bytes(name).length;
        if (len == 0 || len > MAX_ISSUER_NAME_LENGTH) revert InvalidIssuerName();
        if (_issuers[issuer].status != IssuerStatus.None) revert IssuerAlreadyRegistered(issuer);

        _issuers[issuer] = Issuer({
            status: IssuerStatus.Active,
            signer: signer,
            registeredAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            name: name
        });
        unchecked {
            issuerCount++;
        }
        emit IssuerRegistered(issuer, signer, name, msg.sender);
    }

    /// @notice Rotate an issuer's signing key. Credentials already issued keep the signer
    ///         recorded at issuance, so rotation does not break existing verifications.
    function setIssuerSigner(address issuer, address newSigner) external onlyRole(ISSUER_ADMIN_ROLE) {
        if (newSigner == address(0)) revert ZeroAddress();
        Issuer storage i = _issuers[issuer];
        if (i.status == IssuerStatus.None) revert IssuerNotRegistered(issuer);
        address previous = i.signer;
        i.signer = newSigner;
        i.updatedAt = uint64(block.timestamp);
        emit IssuerSignerUpdated(issuer, previous, newSigner);
    }

    function suspendIssuer(address issuer) external onlyRole(ISSUER_ADMIN_ROLE) {
        Issuer storage i = _issuers[issuer];
        if (i.status == IssuerStatus.None) revert IssuerNotRegistered(issuer);
        if (i.status == IssuerStatus.Suspended) revert IssuerAlreadySuspended(issuer);
        i.status = IssuerStatus.Suspended;
        i.updatedAt = uint64(block.timestamp);
        emit IssuerSuspended(issuer, msg.sender);
    }

    function reinstateIssuer(address issuer) external onlyRole(ISSUER_ADMIN_ROLE) {
        Issuer storage i = _issuers[issuer];
        if (i.status == IssuerStatus.None) revert IssuerNotRegistered(issuer);
        if (i.status != IssuerStatus.Suspended) revert IssuerNotSuspended(issuer);
        i.status = IssuerStatus.Active;
        i.updatedAt = uint64(block.timestamp);
        emit IssuerReinstated(issuer, msg.sender);
    }

    // ------------------------------------------------------------ credentials

    function issueCredential(bytes32 credentialId, bytes32 payloadHash, uint64 expiresAt, bytes calldata signature)
        external
    {
        address signer = _requireActiveIssuerSignature(credentialId, payloadHash, expiresAt, signature);
        _store(credentialId, payloadHash, expiresAt, signer);
    }

    function revokeCredential(bytes32 credentialId, uint8 reason) external {
        Credential storage c = _credentials[credentialId];
        if (c.status == CredentialStatus.None) revert CredentialNotFound(credentialId);
        if (msg.sender != c.issuer && !hasRole(ISSUER_ADMIN_ROLE, msg.sender)) revert NotIssuerOrAdmin(msg.sender);
        if (c.status != CredentialStatus.Active) revert CredentialNotActive(credentialId, c.status);

        c.status = CredentialStatus.Revoked;
        c.statusChangedAt = uint64(block.timestamp);
        c.revocationReason = reason;
        emit CredentialRevoked(credentialId, c.issuer, msg.sender, reason);
    }

    /// @notice Replace an active credential with a corrected one in a single transaction.
    function supersedeCredential(
        bytes32 credentialId,
        bytes32 replacementId,
        bytes32 replacementPayloadHash,
        uint64 replacementExpiresAt,
        bytes calldata signature
    ) external {
        if (credentialId == replacementId) revert SelfSupersession();
        Credential storage old = _credentials[credentialId];
        if (old.status == CredentialStatus.None) revert CredentialNotFound(credentialId);
        if (msg.sender != old.issuer) revert NotCredentialIssuer(msg.sender);
        if (old.status != CredentialStatus.Active) revert CredentialNotActive(credentialId, old.status);

        address signer =
            _requireActiveIssuerSignature(replacementId, replacementPayloadHash, replacementExpiresAt, signature);

        old.status = CredentialStatus.Superseded;
        old.statusChangedAt = uint64(block.timestamp);
        old.supersededBy = replacementId;

        _store(replacementId, replacementPayloadHash, replacementExpiresAt, signer);
        emit CredentialSuperseded(credentialId, replacementId, msg.sender);
    }

    // ------------------------------------------------------------------ views

    function getCredential(bytes32 credentialId) external view returns (Credential memory) {
        return _credentials[credentialId];
    }

    function getIssuer(address issuer) external view returns (Issuer memory) {
        return _issuers[issuer];
    }

    function isActiveIssuer(address issuer) external view returns (bool) {
        return _issuers[issuer].status == IssuerStatus.Active;
    }

    /// @notice EIP-712 digest the registered signer must sign. Exposed so clients can
    ///         check their typed-data encoding against the contract.
    function credentialDigest(bytes32 credentialId, bytes32 payloadHash, address issuer, uint64 expiresAt)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(CREDENTIAL_TYPEHASH, credentialId, payloadHash, issuer, expiresAt)));
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // --------------------------------------------------------------- internal

    function _requireActiveIssuerSignature(
        bytes32 credentialId,
        bytes32 payloadHash,
        uint64 expiresAt,
        bytes calldata signature
    ) private view returns (address signer) {
        Issuer storage i = _issuers[msg.sender];
        if (i.status == IssuerStatus.None) revert IssuerNotRegistered(msg.sender);
        if (i.status != IssuerStatus.Active) revert IssuerNotActive(msg.sender);
        if (credentialId == bytes32(0)) revert InvalidCredentialId();
        if (payloadHash == bytes32(0)) revert InvalidPayloadHash();
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert InvalidExpiry(expiresAt);
        if (_credentials[credentialId].status != CredentialStatus.None) revert CredentialAlreadyExists(credentialId);

        bytes32 digest = credentialDigest(credentialId, payloadHash, msg.sender, expiresAt);
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || recovered != i.signer) {
            revert InvalidIssuerSignature(recovered, i.signer);
        }
        return i.signer;
    }

    function _store(bytes32 credentialId, bytes32 payloadHash, uint64 expiresAt, address signer) private {
        _credentials[credentialId] = Credential({
            payloadHash: payloadHash,
            issuer: msg.sender,
            signer: signer,
            issuedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            status: CredentialStatus.Active,
            statusChangedAt: uint64(block.timestamp),
            revocationReason: 0,
            supersededBy: bytes32(0)
        });
        unchecked {
            credentialCount++;
        }
        emit CredentialIssued(credentialId, msg.sender, signer, payloadHash, expiresAt);
    }
}
