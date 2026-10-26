import { z } from "zod";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { CREDENTIAL_TYPES, type CredentialDocument } from "@/domain/types";

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected 32-byte hex");
const address = z.string().refine((v): boolean => isAddress(v, { strict: false }), "invalid address");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const documentSchema = z.object({
  format: z.literal("credvalid-document/1"),
  mode: z.enum(["demo", "testnet"]),
  chainId: z.number().int().positive(),
  registry: address,
  payload: z.object({
    v: z.literal("credvalid/1"),
    credentialId: hex32,
    type: z.enum(CREDENTIAL_TYPES),
    subject: z.object({ name: z.string().min(1), email: z.string().optional() }),
    title: z.string().min(1),
    issuerName: z.string().min(1),
    issuerAddress: address,
    issueDate: isoDate,
    expiryDate: isoDate.nullable(),
    salt: hex32,
  }),
  payloadHash: hex32,
  signer: address,
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export type ParseResult = { ok: true; document: CredentialDocument } | { ok: false; error: string };

export function parseDocument(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  const result = documentSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    return { ok: false, error: `Not a CredValid document (${first?.path.join(".") || "root"}: ${first?.message ?? "invalid"}).` };
  }
  const d = result.data;
  return {
    ok: true,
    document: {
      ...d,
      registry: getAddress(d.registry),
      signer: getAddress(d.signer),
      signature: d.signature as Hex,
      payloadHash: d.payloadHash as Hex,
      payload: {
        ...d.payload,
        credentialId: d.payload.credentialId as Hex,
        salt: d.payload.salt as Hex,
        issuerAddress: getAddress(d.payload.issuerAddress) as Address,
      },
    },
  };
}

export function serializeDocument(doc: CredentialDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function downloadDocument(doc: CredentialDocument) {
  const blob = new Blob([serializeDocument(doc)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(window.document.createElement("a"), {
    href: url,
    download: `credvalid-${doc.payload.credentialId.slice(2, 12)}${doc.mode === "demo" ? "-demo" : ""}.json`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
