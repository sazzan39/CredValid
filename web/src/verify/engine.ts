import { getAddress, isAddressEqual, type Hex } from "viem";
import { canonicalizePayload, expiryToTimestamp, hashPayload, normalizeText, PayloadFormatError } from "@/crypto/canonical";
import { messageFromPayload, recoverCredentialSigner } from "@/crypto/eip712";
import type { AppMode, CredentialDocument, IssuerRecord, RegistryRecord } from "@/domain/types";
import { RegistryUnavailableError, type RegistryReader } from "@/registry/types";

export const VERIFICATION_STATES = [
  "VERIFIED",
  "INVALID_SIGNATURE",
  "HASH_MISMATCH",
  "REVOKED",
  "EXPIRED",
  "SUPERSEDED",
  "ISSUER_UNAUTHORIZED",
  "NOT_FOUND",
  "WRONG_NETWORK",
  "WALLET_NOT_CONNECTED",
  "TRANSACTION_PENDING",
  "UNABLE_TO_VERIFY",
] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

export type CheckKey = "network" | "record" | "issuer" | "issuerClaim" | "hash" | "signature" | "status" | "expiry";
export type CheckResult = "pass" | "fail" | "warn" | "skip";

export interface Check {
  key: CheckKey;
  label: string;
  result: CheckResult;
  detail: string;
}

export interface VerificationReport {
  state: VerificationState;
  /** Where the record came from. "demo" results are simulated and must be labeled as such. */
  mode: AppMode;
  credentialId: Hex | null;
  checkedAt: number;
  checks: Check[];
  /** Did we compare actual credential contents, or only the on-chain record? */
  contentChecked: boolean;
  record: RegistryRecord | null;
  issuer: IssuerRecord | null;
  document: CredentialDocument | null;
  summary: string;
  notes: string[];
}

export interface VerifyInput {
  credentialId?: Hex | null;
  document?: CredentialDocument | null;
  reader: RegistryReader;
  now?: number; // unix seconds
}

const LABEL: Record<CheckKey, string> = {
  network: "Network and registry",
  record: "Registry record",
  issuer: "Issuer authorization",
  issuerClaim: "Issuer named on the document",
  hash: "Contents match the commitment",
  signature: "Issuer signature",
  status: "Revocation and supersession",
  expiry: "Expiry",
};

function check(key: CheckKey, result: CheckResult, detail: string): Check {
  return { key, label: LABEL[key], result, detail };
}

export async function verifyCredential(input: VerifyInput): Promise<VerificationReport> {
  const { reader } = input;
  const document = input.document ?? null;
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const checks: Check[] = [];
  const notes: string[] = [];
  const base = { mode: reader.mode, checkedAt: Date.now(), document, notes };

  const docId = document ? (document.payload.credentialId.toLowerCase() as Hex) : null;
  const requestedId = input.credentialId ? (input.credentialId.toLowerCase() as Hex) : null;
  const credentialId = requestedId ?? docId;

  const done = (
    state: VerificationState,
    summary: string,
    extra: Partial<Pick<VerificationReport, "record" | "issuer" | "contentChecked">> = {},
  ): VerificationReport => ({
    ...base,
    state,
    summary,
    credentialId,
    checks,
    record: extra.record ?? null,
    issuer: extra.issuer ?? null,
    contentChecked: extra.contentChecked ?? false,
  });

  if (!credentialId) {
    return done("UNABLE_TO_VERIFY", "Enter a credential ID, scan its QR code, or provide the credential file.");
  }
  if (requestedId && docId && requestedId !== docId) {
    checks.push(check("network", "fail", "The file you provided belongs to a different credential ID."));
    return done("UNABLE_TO_VERIFY", "The credential file doesn't match the ID being checked. Ask the holder for the right file.");
  }

  // 1. Same chain and registry as the document claims?
  if (document) {
    const sameChain = document.chainId === reader.chainId;
    const sameRegistry = isAddressEqual(document.registry, reader.address);
    if (!sameChain || !sameRegistry || document.mode !== reader.mode) {
      const where =
        document.mode === "demo"
          ? "This file was produced in demo mode. Its signature only exists in the simulated registry."
          : `This file was anchored on chain ${document.chainId} at ${document.registry}.`;
      checks.push(check("network", "fail", `${where} You're checking against ${reader.mode === "demo" ? "the simulated demo registry" : `chain ${reader.chainId} at ${reader.address}`}.`));
      return done("WRONG_NETWORK", "This credential was anchored somewhere else. Switch to the matching mode or network and check again.");
    }
    checks.push(check("network", "pass", reader.mode === "demo" ? "Simulated demo registry." : `Chain ${reader.chainId}, registry ${reader.address}.`));
  }

  // 2. Registry record
  let record: RegistryRecord | null;
  try {
    record = await reader.getCredential(credentialId);
  } catch (err) {
    const why = err instanceof RegistryUnavailableError ? err.message : "The registry could not be read.";
    checks.push(check("record", "skip", why));
    return done("UNABLE_TO_VERIFY", "We couldn't reach the registry. This says nothing about whether the credential is genuine — try again shortly.");
  }

  if (!record) {
    if (reader.hasPendingIssuance(credentialId)) {
      checks.push(check("record", "warn", "An issuance transaction for this ID was submitted from this browser and hasn't confirmed yet."));
      return done("TRANSACTION_PENDING", "The issuance transaction is still pending. Check again once it confirms.");
    }
    checks.push(check("record", "fail", "No credential with this ID exists in the registry."));
    return done("NOT_FOUND", "There's no record of this credential. It was never anchored, or the ID is wrong.");
  }
  checks.push(check("record", "pass", `Anchored ${formatTs(record.issuedAt)} by ${record.issuer}.`));

  // 3. Issuer
  let issuer: IssuerRecord | null;
  try {
    issuer = await reader.getIssuer(record.issuer);
  } catch {
    checks.push(check("issuer", "skip", "Issuer details could not be read from the registry."));
    return done("UNABLE_TO_VERIFY", "We couldn't read the issuer's registry entry. Try again shortly.", { record });
  }
  if (!issuer || issuer.status === "none") {
    checks.push(check("issuer", "fail", "The issuing account is not a registered issuer."));
    return done("ISSUER_UNAUTHORIZED", "The account that anchored this credential isn't an approved issuer.", { record });
  }
  if (issuer.status === "suspended") {
    checks.push(check("issuer", "warn", `${issuer.name} is currently suspended. It was approved when this credential was issued; suspension blocks new issuance but doesn't void existing credentials.`));
    notes.push(`${issuer.name} is suspended in the registry. Consider confirming with the institution directly.`);
  } else {
    checks.push(check("issuer", "pass", `${issuer.name} is an approved issuer. The registry verified its registered key signed this credential at issuance.`));
  }

  // 4. Contents (only with the holder's file)
  let integrityFailure: VerificationState | null = null;
  let contentChecked = false;
  if (document) {
    contentChecked = true;
    const claimedName = normalizeText(document.payload.issuerName);
    const sameAccount = isAddressEqual(getAddress(document.payload.issuerAddress), record.issuer);
    const sameName = claimedName === normalizeText(issuer.name);
    if (!sameAccount || !sameName) {
      checks.push(
        check(
          "issuerClaim",
          "fail",
          !sameAccount
            ? `The file names issuer account ${document.payload.issuerAddress}, but the registry record was created by ${record.issuer}.`
            : `The file says "${claimedName}", but the account that issued it is registered as "${issuer.name}".`,
        ),
      );
      integrityFailure = "ISSUER_UNAUTHORIZED";
    } else {
      checks.push(check("issuerClaim", "pass", `The file names ${issuer.name}, matching the registry.`));
    }

    let recomputed: Hex | null = null;
    try {
      canonicalizePayload(document.payload);
      recomputed = hashPayload(document.payload);
    } catch (err) {
      const msg = err instanceof PayloadFormatError ? err.message : "unreadable payload";
      checks.push(check("hash", "fail", `The credential contents are malformed (${msg}).`));
      integrityFailure ??= "HASH_MISMATCH";
    }
    if (recomputed) {
      if (recomputed === record.payloadHash.toLowerCase()) {
        checks.push(check("hash", "pass", `SHA-256 of the canonical contents equals the anchored commitment ${record.payloadHash}.`));
      } else {
        checks.push(check("hash", "fail", "The file was edited after it was issued. Its fingerprint no longer matches the registry."));
        integrityFailure ??= "HASH_MISMATCH";
      }

      const expectedExpiry = Number(expiryToTimestamp(document.payload.expiryDate));
      if (expectedExpiry !== record.expiresAt) {
        notes.push("The expiry date in the file doesn't match the anchored expiry.");
      }

      // Signature is checked over the anchored values, so it endorses exactly what's on chain.
      const message = messageFromPayload(document.payload, record.payloadHash);
      message.expiresAt = BigInt(record.expiresAt);
      const recovered = await recoverCredentialSigner(reader.chainId, reader.address, message, document.signature);
      if (!recovered) {
        checks.push(check("signature", "fail", "The signature is malformed and can't be checked."));
        integrityFailure ??= "INVALID_SIGNATURE";
      } else if (!isAddressEqual(recovered, record.signer)) {
        checks.push(check("signature", "fail", "The signature wasn't made by the issuer's registered key."));
        integrityFailure ??= "INVALID_SIGNATURE";
      } else {
        checks.push(check("signature", "pass", `EIP-712 signature recovers to ${recovered}, the key the registry accepted at issuance.`));
      }
    }
  } else {
    checks.push(check("hash", "skip", "No credential file provided. The registry only holds a commitment, so the contents can't be compared."));
    checks.push(check("signature", "skip", "Needs the credential file."));
  }

  // 5. Status
  if (record.status === "revoked") {
    checks.push(check("status", "fail", `Revoked ${formatTs(record.statusChangedAt)}.`));
  } else if (record.status === "superseded") {
    checks.push(check("status", "fail", `Replaced ${formatTs(record.statusChangedAt)} by ${record.supersededBy ?? "a newer credential"}.`));
  } else {
    checks.push(check("status", "pass", "Not revoked or superseded."));
  }

  // 6. Expiry
  const expired = record.expiresAt !== 0 && now > record.expiresAt;
  if (record.expiresAt === 0) checks.push(check("expiry", "pass", "Doesn't expire."));
  else if (expired) checks.push(check("expiry", "fail", `Expired ${formatTs(record.expiresAt)}.`));
  else checks.push(check("expiry", "pass", `Valid until ${formatTs(record.expiresAt)}.`));

  const ctx = { record, issuer, contentChecked };
  if (integrityFailure === "ISSUER_UNAUTHORIZED")
    return done("ISSUER_UNAUTHORIZED", "The file claims an issuer that didn't issue it. Treat it as a false claim.", ctx);
  if (integrityFailure === "HASH_MISMATCH")
    return done("HASH_MISMATCH", "The credential file was changed after it was issued. The anchored record doesn't match it.", ctx);
  if (integrityFailure === "INVALID_SIGNATURE")
    return done("INVALID_SIGNATURE", "The signature on this file wasn't made by the issuer's registered key.", ctx);
  if (record.status === "revoked") return done("REVOKED", "The issuer revoked this credential.", ctx);
  if (record.status === "superseded") return done("SUPERSEDED", "This credential was replaced by a newer one. Ask the holder for the current version.", ctx);
  if (expired) return done("EXPIRED", "This credential was genuine but has expired.", ctx);
  if (!document) {
    return done(
      "UNABLE_TO_VERIFY",
      "The record is active and was issued by an approved issuer, but without the holder's credential file we can't confirm what it says.",
      ctx,
    );
  }
  return done("VERIFIED", `Issued by ${issuer.name}, unchanged since issuance, and currently valid.`, ctx);
}

export function formatTs(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
