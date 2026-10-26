import type { Address, Hex } from "viem";
import type { CredentialPayload } from "@/domain/types";
import type { IssueInput } from "@/registry/service";
import { canonicalizePayload, hashPayload, normalizePayload } from "./canonical";
import { newCredentialId, newSalt } from "./ids";

export function buildPayload(input: IssueInput, issuerAddress: Address, credentialId: Hex = newCredentialId()): CredentialPayload {
  return normalizePayload({
    v: "credvalid/1",
    credentialId,
    type: input.type,
    subject: input.candidateEmail ? { name: input.candidateName, email: input.candidateEmail } : { name: input.candidateName },
    title: input.title,
    issuerName: input.issuerName,
    issuerAddress,
    issueDate: input.issueDate,
    expiryDate: input.expiryDate || null,
    salt: newSalt(),
  });
}

export function preparePayload(input: IssueInput, issuerAddress: Address) {
  const payload = buildPayload(input, issuerAddress);
  return { payload, canonical: canonicalizePayload(payload), payloadHash: hashPayload(payload) };
}
