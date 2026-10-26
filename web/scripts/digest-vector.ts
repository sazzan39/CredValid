// Prints the EIP-712 digest for the fixed vector used in contracts/test/DigestParity.t.sol.
import { credentialDigest } from "../src/crypto/eip712";
const registry = "0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f";
console.log(credentialDigest(31337, registry, {
  credentialId: "0x1111111111111111111111111111111111111111111111111111111111111111",
  payloadHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
  issuer: "0x3333333333333333333333333333333333333333",
  expiresAt: 1893455999n,
}));
