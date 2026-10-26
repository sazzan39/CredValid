import type { Address, Hex } from "viem";
import type { CredentialDocument, CredentialType, IssuerKind, IssuerRecord, RegistryRecord } from "@/domain/types";
import type { RegistryReader } from "./types";

export interface IssueInput {
  candidateName: string;
  candidateEmail?: string;
  type: CredentialType;
  title: string;
  issuerName: string;
  issueDate: string;
  expiryDate: string | null;
}

export type IssueStep =
  | { step: "canonicalized"; canonical: string }
  | { step: "hashed"; payloadHash: Hex }
  | { step: "signing" }
  | { step: "signed"; signer: Address; signature: Hex }
  | { step: "submitting" }
  | { step: "pending"; txId: string; hash?: Hex }
  | { step: "confirmed"; txId: string; hash?: Hex; blockNumber?: number };

export interface IssueResult {
  credentialId: Hex;
  document: CredentialDocument;
  txId: string;
}

/** Everything the UI needs from a registry, in either mode. */
export interface RegistryService extends RegistryReader {
  readonly label: string;
  listIssuers(): Promise<IssuerRecord[]>;
  listRecords(): Promise<RegistryRecord[]>;
  /** A credential file available to this browser (demo store, or issued this session). */
  getDocument(id: Hex): CredentialDocument | null;
  listDocuments(): CredentialDocument[];
  issue(input: IssueInput, onStep?: (s: IssueStep) => void): Promise<IssueResult>;
  supersede(oldId: Hex, input: IssueInput, onStep?: (s: IssueStep) => void): Promise<IssueResult>;
  revoke(id: Hex, reason: number): Promise<{ txId: string }>;
  /** `kind` is a presentation hint kept only in demo mode; the contract stores the name. */
  registerIssuer(address: Address, signer: Address, name: string, kind?: IssuerKind): Promise<{ txId: string }>;
  setIssuerStatus(address: Address, action: "suspend" | "reinstate"): Promise<{ txId: string }>;
}

/** User cancelled in the wallet. Not an error worth alarming anyone about. */
export class UserRejectedError extends Error {
  override name = "UserRejectedError";
}

export class ActionError extends Error {
  override name = "ActionError";
}
