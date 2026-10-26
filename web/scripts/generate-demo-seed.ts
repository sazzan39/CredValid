/**
 * Generates src/demo/seed.generated.ts: fictional issuers, credentials, signatures and
 * verification history for DEMO MODE.
 *
 * Every signing key is created here, used once, and discarded. Only public addresses and
 * signatures are written out, so no signing secret ever lands in the frontend source.
 *
 *   npm run seed
 */
import { writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { expiryToTimestamp, hashPayload } from "../src/crypto/canonical";
import { DEMO_CHAIN_ID, DEMO_REGISTRY, messageFromPayload, typedData } from "../src/crypto/eip712";
import { randomBytes32 } from "../src/crypto/ids";
import type {
  CredentialDocument,
  CredentialPayload,
  CredentialType,
  IssuerKind,
  IssuerRecord,
  RegistryRecord,
} from "../src/domain/types";

const day = 86_400;
const ts = (date: string, hour = 10) => Math.floor(Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`) / 1000);

type Key = ReturnType<typeof privateKeyToAccount>;
interface SeedIssuer {
  record: IssuerRecord;
  signerKey: Key;
}

function makeIssuer(name: string, kind: IssuerKind, registered: string, opts: { separateSigner?: boolean } = {}): SeedIssuer {
  const wallet = privateKeyToAccount(generatePrivateKey());
  const signerKey = opts.separateSigner ? privateKeyToAccount(generatePrivateKey()) : wallet;
  return {
    signerKey,
    record: {
      address: wallet.address,
      name,
      signer: signerKey.address,
      status: "active",
      registeredAt: ts(registered, 9),
      updatedAt: ts(registered, 9),
      kind,
    },
  };
}

const issuers = {
  amity: makeIssuer("Amity University, Noida", "university", "2024-01-15", { separateSigner: true }),
  iitd: makeIssuer("IIT Delhi", "university", "2024-01-22", { separateSigner: true }),
  sharda: makeIssuer("Sharda University, Greater Noida", "university", "2024-02-02"),
  dtu: makeIssuer("Delhi Technological University", "university", "2024-03-11"),
  halcyon: makeIssuer("Halcyon Systems Pvt Ltd, Gurugram", "employer", "2024-04-20"),
  marlow: makeIssuer("Marlow Logistics, Faridabad", "employer", "2024-05-06"),
  crestline: makeIssuer("Crestline Online Academy", "college", "2024-06-18"),
};
issuers.marlow.record.status = "suspended";
issuers.marlow.record.updatedAt = ts("2026-08-29", 14);

interface Spec {
  key: string;
  issuer: keyof typeof issuers;
  name: string;
  type: CredentialType;
  title: string;
  issueDate: string;
  expiryDate?: string;
  status?: "revoked" | "superseded";
  statusDate?: string;
  reason?: number;
  supersededByKey?: string;
  claimIssuerName?: string; // for the false-claim sample
  tamper?: (p: CredentialPayload) => CredentialPayload; // edit after signing
  forgeSignature?: boolean;
  label: string; // why this sample exists
}

const specs: Spec[] = [
  { key: "aanya", issuer: "amity", name: "Aanya Mehta", type: "degree", title: "B.Tech Computer Science and Engineering", issueDate: "2025-07-18", label: "Valid degree" },
  { key: "rohan", issuer: "iitd", name: "Rohan Kulkarni", type: "degree", title: "M.Tech Computer Technology", issueDate: "2025-06-30", label: "Valid degree" },
  { key: "kavya", issuer: "sharda", name: "Kavya Nair", type: "diploma", title: "Diploma in General Nursing and Midwifery", issueDate: "2025-11-04", label: "Valid diploma" },
  { key: "rahul", issuer: "halcyon", name: "Rahul Verma", type: "employment", title: "Senior Backend Engineer, Mar 2022 – Aug 2026", issueDate: "2026-08-31", label: "Valid employment record" },
  { key: "ishita", issuer: "dtu", name: "Ishita Kapoor", type: "certificate", title: "Certificate in Cloud Computing", issueDate: "2026-02-12", expiryDate: "2029-02-11", label: "Valid certificate with expiry" },
  { key: "siddharth", issuer: "halcyon", name: "Siddharth Rao", type: "employment", title: "Product Designer, Jan 2023 – Jun 2026", issueDate: "2026-06-30", label: "Valid employment record" },
  { key: "priya", issuer: "iitd", name: "Priya Raghavan", type: "degree", title: "PhD Computer Science and Engineering", issueDate: "2026-03-22", label: "Valid doctorate" },
  { key: "manoj", issuer: "marlow", name: "Manoj Yadav", type: "employment", title: "Fleet Operations Lead, 2021 – 2025", issueDate: "2025-09-15", label: "Valid record from an issuer suspended later" },
  { key: "neha", issuer: "sharda", name: "Neha Gupta", type: "training", title: "Basic Life Support (BLS) Provider", issueDate: "2023-05-10", expiryDate: "2025-05-09", label: "Expired training certificate" },
  { key: "arjun", issuer: "amity", name: "Arjun Bhattacharya", type: "degree", title: "MBA, Finance", issueDate: "2025-12-05", status: "revoked", statusDate: "2026-04-17", reason: 2, label: "Revoked for misconduct" },
  { key: "pooja", issuer: "halcyon", name: "Pooja Singh", type: "employment", title: "Data Analyst, 2024 – 2026", issueDate: "2026-01-09", status: "revoked", statusDate: "2026-01-10", reason: 1, label: "Revoked: issued in error" },
  { key: "adityaOld", issuer: "dtu", name: "Aditya Malhotra", type: "degree", title: "B.Tech Mechanical Engineering", issueDate: "2025-06-28", status: "superseded", statusDate: "2025-08-02", supersededByKey: "adityaNew", label: "Superseded by a corrected credential" },
  { key: "adityaNew", issuer: "dtu", name: "Aditya Malhotra", type: "degree", title: "B.Tech Mechanical Engineering, First Division with Distinction", issueDate: "2025-06-28", label: "Replacement credential" },
  { key: "karan", issuer: "iitd", name: "Karan Mehra", type: "degree", title: "M.Tech Robotics", issueDate: "2025-07-02", tamper: (p) => ({ ...p, title: "PhD Robotics" }), label: "Tampered: M.Tech edited to PhD" },
  { key: "sneha", issuer: "amity", name: "Sneha Joshi", type: "certificate", title: "PG Diploma in Cyber Security", issueDate: "2026-05-14", forgeSignature: true, label: "Forged signature" },
  { key: "rohit", issuer: "crestline", name: "Rohit Bansal", type: "degree", title: "M.Tech Artificial Intelligence", issueDate: "2026-07-01", claimIssuerName: "IIT Delhi", label: "False issuer claim" },
  { key: "vikram", issuer: "sharda", name: "Vikram Iyer", type: "certificate", title: "Infection Prevention and Control", issueDate: "2026-09-19", expiryDate: "2028-09-18", label: "Valid certificate" },
];

const records: RegistryRecord[] = [];
const documents: CredentialDocument[] = [];
const samples: { credentialId: Hex; label: string; expected: string }[] = [];
const ids = new Map<string, Hex>(specs.map((s) => [s.key, randomBytes32()]));

for (const s of specs) {
  const iss = issuers[s.issuer];
  const credentialId = ids.get(s.key)!;
  const payload: CredentialPayload = {
    v: "credvalid/1",
    credentialId,
    type: s.type,
    subject: { name: s.name },
    title: s.title,
    issuerName: s.claimIssuerName ?? iss.record.name,
    issuerAddress: iss.record.address,
    issueDate: s.issueDate,
    expiryDate: s.expiryDate ?? null,
    salt: randomBytes32(),
  };
  const payloadHash = hashPayload(payload);
  const message = messageFromPayload(payload, payloadHash);
  const signingKey = s.forgeSignature ? privateKeyToAccount(generatePrivateKey()) : iss.signerKey;
  const signature = await signingKey.signTypedData(typedData(DEMO_CHAIN_ID, DEMO_REGISTRY, message));

  const issuedAt = ts(s.issueDate, 11) + (s.key === "adityaNew" ? 36 * day : 0);
  records.push({
    credentialId,
    payloadHash,
    issuer: iss.record.address,
    signer: iss.signerKey.address,
    issuedAt: s.key === "adityaNew" ? ts("2025-08-02", 12) : issuedAt,
    expiresAt: Number(expiryToTimestamp(payload.expiryDate)),
    status: s.status ?? "active",
    statusChangedAt: s.statusDate ? ts(s.statusDate, 15) : issuedAt,
    revocationReason: s.reason ?? 0,
    supersededBy: s.supersededByKey ? ids.get(s.supersededByKey)! : null,
  });

  const shared = s.tamper ? s.tamper(payload) : payload;
  documents.push({
    format: "credvalid-document/1",
    mode: "demo",
    chainId: DEMO_CHAIN_ID,
    registry: DEMO_REGISTRY,
    payload: shared,
    payloadHash,
    signer: signingKey.address,
    signature,
  });

  const expected = s.tamper
    ? "HASH_MISMATCH"
    : s.forgeSignature
      ? "INVALID_SIGNATURE"
      : s.claimIssuerName
        ? "ISSUER_UNAUTHORIZED"
        : s.status === "revoked"
          ? "REVOKED"
          : s.status === "superseded"
            ? "SUPERSEDED"
            : s.expiryDate && Date.parse(s.expiryDate) < Date.parse("2026-10-01")
              ? "EXPIRED"
              : "VERIFIED";
  samples.push({ credentialId, label: s.label, expected });
}

const unknownId = randomBytes32();
samples.push({ credentialId: unknownId, label: "Never issued", expected: "NOT_FOUND" });

// Verification history: who checked what, and what they saw.
const verifiers = ["Talent team, Orbital Health, Gurugram", "Recruiter, Brightwater Partners, Noida", "HR, Lumen Retail, New Delhi", "Admissions, Westmoor Graduate School", "Background check, Ferro & Vance", "Hiring manager, Quayside Labs, Gurugram"];
const history: { id: string; credentialId: Hex; state: string; verifier: string; at: number; method: "qr" | "id" | "file" }[] = [];
let seed = 7;
const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
for (let i = 0; i < 46; i++) {
  const sample = samples[Math.floor(rand() * samples.length)]!;
  const at = ts("2026-10-25", 18) - Math.floor(rand() * 120) * day - Math.floor(rand() * 20) * 3600;
  history.push({
    id: `h${String(i).padStart(3, "0")}`,
    credentialId: sample.credentialId,
    state: sample.expected,
    verifier: verifiers[Math.floor(rand() * verifiers.length)]!,
    at,
    method: (["qr", "qr", "file", "id"] as const)[Math.floor(rand() * 4)]!,
  });
}
history.sort((a, b) => b.at - a.at);

const out = `// Generated by scripts/generate-demo-seed.ts — do not edit by hand.
// All people and organizations are fictional. Signing keys were discarded after use.
import type { CredentialDocument, IssuerRecord, RegistryRecord } from "@/domain/types";
import type { Hex } from "viem";

export const SEED_ISSUERS: IssuerRecord[] = ${JSON.stringify(Object.values(issuers).map((i) => i.record), null, 2)};

export const SEED_RECORDS: RegistryRecord[] = ${JSON.stringify(records, null, 2)};

export const SEED_DOCUMENTS: CredentialDocument[] = ${JSON.stringify(documents, null, 2)};

export const SEED_SAMPLES: { credentialId: Hex; label: string; expected: string }[] = ${JSON.stringify(samples, null, 2)};

export const SEED_HISTORY: { id: string; credentialId: Hex; state: string; verifier: string; at: number; method: "qr" | "id" | "file" }[] = ${JSON.stringify(history, null, 2)};
`;
writeFileSync(new URL("../src/demo/seed.generated.ts", import.meta.url), out);
console.log(`Wrote ${records.length} credentials, ${Object.keys(issuers).length} issuers, ${history.length} history rows.`);
