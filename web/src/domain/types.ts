import type { Address, Hex } from "viem";

export type AppMode = "demo" | "testnet";

export const CREDENTIAL_TYPES = ["degree", "diploma", "certificate", "employment", "training"] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export const CREDENTIAL_TYPE_LABEL: Record<CredentialType, string> = {
  degree: "Degree",
  diploma: "Diploma",
  certificate: "Professional certificate",
  employment: "Employment record",
  training: "Training completion",
};

/** Off-chain credential contents. Hashed and signed; never written to the chain. */
export interface CredentialPayload {
  v: "credvalid/1";
  credentialId: Hex;
  type: CredentialType;
  subject: { name: string; email?: string }; // email is optional and omitted from the hash when absent
  title: string;
  issuerName: string;
  issuerAddress: Address;
  issueDate: string; // YYYY-MM-DD
  expiryDate: string | null; // YYYY-MM-DD, inclusive, UTC
  salt: Hex; // 32 random bytes so the commitment can't be brute-forced from a name list
}

/** The file a holder shares with a verifier. Contains personal data — share deliberately. */
export interface CredentialDocument {
  format: "credvalid-document/1";
  mode: AppMode;
  chainId: number;
  registry: Address;
  payload: CredentialPayload;
  payloadHash: Hex;
  signer: Address;
  signature: Hex;
}

export type IssuerStatus = "none" | "active" | "suspended";
export type IssuerKind = "university" | "college" | "employer";

export interface IssuerRecord {
  address: Address;
  name: string;
  signer: Address;
  status: IssuerStatus;
  registeredAt: number; // unix seconds
  updatedAt: number;
  kind?: IssuerKind; // demo-only presentation hint, not on chain
}

export type CredentialStatus = "none" | "active" | "revoked" | "superseded";

/** Mirrors CredValidRegistry.Credential. */
export interface RegistryRecord {
  credentialId: Hex;
  payloadHash: Hex;
  issuer: Address;
  signer: Address;
  issuedAt: number;
  expiresAt: number; // 0 = no expiry
  status: CredentialStatus;
  statusChangedAt: number;
  revocationReason: number;
  supersededBy: Hex | null;
}

export const REVOCATION_REASONS: Record<number, string> = {
  0: "Unspecified",
  1: "Issued in error",
  2: "Academic or professional misconduct",
  3: "Requested by the holder",
  4: "Issuer data correction",
  5: "Other",
};

export type TxKind =
  | "issue"
  | "revoke"
  | "supersede"
  | "register-issuer"
  | "suspend-issuer"
  | "reinstate-issuer"
  | "rotate-signer";

export type TxState = "awaiting-signature" | "pending" | "confirmed" | "failed" | "rejected";

export interface TxRecord {
  id: string;
  mode: AppMode;
  kind: TxKind;
  state: TxState;
  label: string;
  credentialId?: Hex;
  /** Real hash only. Demo transactions never get one. */
  hash?: Hex;
  blockNumber?: number;
  error?: string;
  createdAt: number; // ms
  updatedAt: number;
}
