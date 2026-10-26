import { getAddress, sha256, stringToBytes, type Hex } from "viem";
import { CREDENTIAL_TYPES, type CredentialPayload } from "@/domain/types";

/**
 * Canonicalization scheme "credvalid/1".
 *
 *  1. Every string is Unicode-NFC normalized, trimmed, and internal whitespace runs
 *     collapsed to a single U+0020.
 *  2. Addresses are lower-cased hex. IDs, salts and hashes are lower-cased 0x-hex.
 *  3. Dates are ISO calendar dates (YYYY-MM-DD). Missing expiry is JSON null.
 *     An optional subject.email is lower-cased; when absent the key is omitted entirely.
 *  4. Objects are serialized with keys sorted by UTF-16 code unit order, no whitespace,
 *     using JSON string escaping (JSON.stringify). Only strings, null and objects occur.
 *  5. payloadHash = SHA-256 over the UTF-8 bytes of that string.
 *
 * Issuance and verification both call canonicalizePayload, so they cannot drift.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BYTES32_RE = /^0x[0-9a-f]{64}$/;

export function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export class PayloadFormatError extends Error {
  override name = "PayloadFormatError";
}

/** Returns a normalized copy, throwing PayloadFormatError on structurally invalid input. */
export function normalizePayload(p: CredentialPayload): CredentialPayload {
  if (p.v !== "credvalid/1") throw new PayloadFormatError(`Unsupported payload version: ${String(p.v)}`);
  if (!CREDENTIAL_TYPES.includes(p.type)) throw new PayloadFormatError(`Unknown credential type: ${String(p.type)}`);
  const id = p.credentialId.toLowerCase() as Hex;
  const salt = p.salt.toLowerCase() as Hex;
  if (!BYTES32_RE.test(id)) throw new PayloadFormatError("credentialId must be 32 bytes of hex");
  if (!BYTES32_RE.test(salt)) throw new PayloadFormatError("salt must be 32 bytes of hex");
  if (!isIsoDate(p.issueDate)) throw new PayloadFormatError("issueDate must be YYYY-MM-DD");
  if (p.expiryDate !== null && !isIsoDate(p.expiryDate)) throw new PayloadFormatError("expiryDate must be YYYY-MM-DD or null");
  let issuerAddress: string;
  try {
    issuerAddress = getAddress(p.issuerAddress).toLowerCase();
  } catch {
    throw new PayloadFormatError("issuerAddress is not a valid address");
  }
  const name = normalizeText(p.subject.name);
  const email = p.subject.email ? normalizeText(p.subject.email).toLowerCase() : "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PayloadFormatError("subject.email is not a valid email address");
  const title = normalizeText(p.title);
  const issuerName = normalizeText(p.issuerName);
  if (!name || !title || !issuerName) throw new PayloadFormatError("Name, title and issuer name are required");

  return {
    v: "credvalid/1",
    credentialId: id,
    type: p.type,
    subject: email ? { name, email } : { name },
    title,
    issuerName,
    issuerAddress: issuerAddress as CredentialPayload["issuerAddress"],
    issueDate: p.issueDate,
    expiryDate: p.expiryDate,
    salt,
  };
}

type Canonical = string | null | { [key: string]: Canonical };

function serialize(value: Canonical): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${serialize(value[k] as Canonical)}`).join(",")}}`;
}

export function canonicalizePayload(p: CredentialPayload): string {
  const n = normalizePayload(p);
  const tree: Canonical = {
    v: n.v,
    credentialId: n.credentialId,
    type: n.type,
    subject: n.subject.email ? { name: n.subject.name, email: n.subject.email } : { name: n.subject.name },
    title: n.title,
    issuerName: n.issuerName,
    issuerAddress: n.issuerAddress,
    issueDate: n.issueDate,
    expiryDate: n.expiryDate,
    salt: n.salt,
  };
  return serialize(tree);
}

export function hashPayload(p: CredentialPayload): Hex {
  return sha256(stringToBytes(canonicalizePayload(p)));
}

/** On-chain expiresAt: last second (23:59:59 UTC) of the expiry date, or 0. */
export function expiryToTimestamp(expiryDate: string | null): bigint {
  if (expiryDate === null) return 0n;
  const ms = Date.parse(`${expiryDate}T23:59:59Z`);
  return BigInt(Math.floor(ms / 1000));
}
