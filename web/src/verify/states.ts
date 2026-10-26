import type { VerificationState } from "./engine";

export type Tone = "good" | "warn" | "bad" | "neutral" | "info";

/**
 * Red is reserved for confirmed problems (tampering, forgery, false issuer, revocation).
 * Amber covers uncertainty and technical issues (expired, replaced, not found, network).
 */
export const STATE_META: Record<VerificationState, { label: string; title: string; tone: Tone; short: string }> = {
  VERIFIED: { label: "Verified", title: "Credential verified", tone: "good", short: "Genuine and current" },
  INVALID_SIGNATURE: { label: "Invalid signature", title: "Invalid signature", tone: "bad", short: "Not signed by the issuer" },
  HASH_MISMATCH: { label: "Data mismatch", title: "Credential data mismatch", tone: "bad", short: "Edited after issuance" },
  REVOKED: { label: "Revoked", title: "Credential revoked", tone: "bad", short: "Withdrawn by the issuer" },
  EXPIRED: { label: "Expired", title: "Credential expired", tone: "warn", short: "Past its expiry date" },
  SUPERSEDED: { label: "Replaced", title: "Credential replaced", tone: "warn", short: "A newer version exists" },
  ISSUER_UNAUTHORIZED: { label: "Untrusted issuer", title: "Untrusted issuer", tone: "bad", short: "Issuer claim doesn't hold" },
  NOT_FOUND: { label: "Not found", title: "Credential not found", tone: "warn", short: "No matching record" },
  WRONG_NETWORK: { label: "Wrong network", title: "Different network", tone: "warn", short: "Recorded elsewhere" },
  WALLET_NOT_CONNECTED: { label: "Wallet needed", title: "Wallet not connected", tone: "neutral", short: "Connect to continue" },
  TRANSACTION_PENDING: { label: "Pending", title: "Still being recorded", tone: "info", short: "Waiting for confirmation" },
  UNABLE_TO_VERIFY: { label: "Not verified", title: "Couldn't complete verification", tone: "warn", short: "Not enough to decide" },
};
