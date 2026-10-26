import {
  getAddress,
  hashTypedData,
  recoverTypedDataAddress,
  zeroAddress,
  type Address,
  type Hex,
  type TypedDataDomain,
} from "viem";
import { expiryToTimestamp, hashPayload } from "./canonical";
import type { CredentialPayload } from "@/domain/types";

/** Must match CREDENTIAL_TYPEHASH in CredValidRegistry.sol. */
export const CREDENTIAL_TYPES_712 = {
  Credential: [
    { name: "credentialId", type: "bytes32" },
    { name: "payloadHash", type: "bytes32" },
    { name: "issuer", type: "address" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;

/** Demo mode signs against this domain so a demo signature can never validate on a real registry. */
export const DEMO_REGISTRY: Address = zeroAddress;
export const DEMO_CHAIN_ID = 80002;

export function credentialDomain(chainId: number, registry: Address): TypedDataDomain {
  return { name: "CredValid", version: "1", chainId, verifyingContract: registry };
}

export interface CredentialMessage {
  credentialId: Hex;
  payloadHash: Hex;
  issuer: Address;
  expiresAt: bigint;
}

export function messageFromPayload(payload: CredentialPayload, payloadHash = hashPayload(payload)): CredentialMessage {
  return {
    credentialId: payload.credentialId.toLowerCase() as Hex,
    payloadHash,
    issuer: getAddress(payload.issuerAddress),
    expiresAt: expiryToTimestamp(payload.expiryDate),
  };
}

export function typedData(chainId: number, registry: Address, message: CredentialMessage) {
  return {
    domain: credentialDomain(chainId, registry),
    types: CREDENTIAL_TYPES_712,
    primaryType: "Credential" as const,
    message,
  };
}

export function credentialDigest(chainId: number, registry: Address, message: CredentialMessage): Hex {
  return hashTypedData(typedData(chainId, registry, message));
}

/** Returns the recovered signer, or null when the signature is malformed. */
export async function recoverCredentialSigner(
  chainId: number,
  registry: Address,
  message: CredentialMessage,
  signature: Hex,
): Promise<Address | null> {
  try {
    return await recoverTypedDataAddress({ ...typedData(chainId, registry, message), signature });
  } catch {
    return null;
  }
}
