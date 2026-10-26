import { describe, expect, it } from "vitest";
import { canonicalizePayload, expiryToTimestamp, hashPayload, normalizePayload, PayloadFormatError } from "@/crypto/canonical";
import { extractCredentialId } from "@/crypto/ids";
import { parseDocument } from "@/crypto/document";
import type { CredentialPayload } from "@/domain/types";
import { SEED_DOCUMENTS } from "@/demo/seed.generated";

const base: CredentialPayload = {
  v: "credvalid/1",
  credentialId: `0x${"ab".repeat(32)}`,
  type: "degree",
  subject: { name: "Aanya Mehta" },
  title: "MSc Data Science",
  issuerName: "Northbridge University",
  issuerAddress: "0x33C2A06a0D949eFF434DE702F8bb7f0fb8D94f12",
  issueDate: "2025-07-18",
  expiryDate: null,
  salt: `0x${"cd".repeat(32)}`,
};

describe("canonicalization", () => {
  it("is stable under whitespace, Unicode form and address case", () => {
    const messy: CredentialPayload = {
      ...base,
      subject: { name: "  Aanya   Mehta " },
      title: "MSc  Data\tScience",
      issuerAddress: base.issuerAddress.toLowerCase() as CredentialPayload["issuerAddress"],
      credentialId: base.credentialId.toUpperCase().replace("0X", "0x") as CredentialPayload["credentialId"],
    };
    expect(canonicalizePayload(messy)).toBe(canonicalizePayload(base));
    expect(hashPayload(messy)).toBe(hashPayload(base));

    const composed = { ...base, subject: { name: "Tomás Ferreira" } };
    const decomposed = { ...base, subject: { name: "Tomás Ferreira" } };
    expect(hashPayload(decomposed)).toBe(hashPayload(composed));
  });

  it("sorts keys and has no whitespace", () => {
    const c = canonicalizePayload(base);
    expect(c.startsWith('{"credentialId":')).toBe(true);
    expect(c).not.toMatch(/": /);
    expect(c).toContain('"expiryDate":null');
  });

  it("changes the hash when any field changes", () => {
    const h = hashPayload(base);
    expect(hashPayload({ ...base, title: "PhD Data Science" })).not.toBe(h);
    expect(hashPayload({ ...base, salt: `0x${"ce".repeat(32)}` })).not.toBe(h);
    expect(hashPayload({ ...base, expiryDate: "2030-01-01" })).not.toBe(h);
  });

  it("rejects malformed payloads", () => {
    expect(() => normalizePayload({ ...base, issueDate: "2025-02-30" })).toThrow(PayloadFormatError);
    expect(() => normalizePayload({ ...base, salt: "0x1234" })).toThrow(PayloadFormatError);
    expect(() => normalizePayload({ ...base, subject: { name: "   " } })).toThrow(PayloadFormatError);
  });

  it("maps expiry to the last second of the UTC day", () => {
    expect(expiryToTimestamp(null)).toBe(0n);
    expect(expiryToTimestamp("2029-12-31")).toBe(1893455999n);
  });
});

describe("ids and documents", () => {
  it("extracts an ID from a URL or raw text", () => {
    const id = `0x${"9f".repeat(32)}`;
    expect(extractCredentialId(`https://credvalid.app/v/${id}`)).toBe(id);
    expect(extractCredentialId("nothing here")).toBeNull();
  });

  it("round-trips a seed document and rejects junk", () => {
    const doc = SEED_DOCUMENTS[0]!;
    const parsed = parseDocument(JSON.stringify(doc));
    expect(parsed.ok).toBe(true);
    expect(parseDocument("{").ok).toBe(false);
    expect(parseDocument(JSON.stringify({ format: "other" })).ok).toBe(false);
  });
});

describe("optional email", () => {
  it("leaves the hash unchanged when absent and binds it when present", () => {
    const withEmpty = { ...base, subject: { name: "Aanya Mehta", email: "" } };
    expect(hashPayload(withEmpty)).toBe(hashPayload(base));
    const withEmail = { ...base, subject: { name: "Aanya Mehta", email: " Aanya@Example.edu " } };
    expect(hashPayload(withEmail)).not.toBe(hashPayload(base));
    expect(hashPayload(withEmail)).toBe(hashPayload({ ...base, subject: { name: "Aanya Mehta", email: "aanya@example.edu" } }));
    expect(() => normalizePayload({ ...base, subject: { name: "A B", email: "not-an-email" } })).toThrow(PayloadFormatError);
  });
});
