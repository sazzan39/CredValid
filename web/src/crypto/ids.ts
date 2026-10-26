import { bytesToHex, type Hex } from "viem";

/** 32 bytes from the platform CSPRNG. Opaque: reveals nothing about the holder. */
export function randomBytes32(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export const newCredentialId = randomBytes32;
export const newSalt = randomBytes32;

export function isCredentialId(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(value.trim());
}

export function shortId(id: string, head = 6, tail = 4): string {
  if (id.length <= head + tail + 2) return id;
  return `${id.slice(0, head + 2)}…${id.slice(-tail)}`;
}

/** Accepts a raw ID, a /v/<id> path, or a full verification URL. */
export function extractCredentialId(input: string): Hex | null {
  const match = input.trim().match(/0x[0-9a-fA-F]{64}/);
  return match ? (match[0].toLowerCase() as Hex) : null;
}
