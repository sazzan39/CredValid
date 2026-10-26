import { getAddress, isAddressEqual, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { DEMO_CHAIN_ID, DEMO_REGISTRY, messageFromPayload, typedData } from "@/crypto/eip712";
import { preparePayload } from "@/crypto/payload";
import type { HistoryEntry } from "@/domain/history";
import type { CredentialDocument, IssuerRecord, RegistryRecord } from "@/domain/types";
import { readJSON, removeKey, Store, writeJSON } from "@/lib/storage";
import { startTx, updateTx } from "@/app/txStore";
import { ActionError, type IssueInput, type IssueResult, type IssueStep, type RegistryService } from "@/registry/service";
import type { VerificationState } from "@/verify/engine";
import { SEED_DOCUMENTS, SEED_HISTORY, SEED_ISSUERS, SEED_RECORDS } from "./seed.generated";

const KEY = "credvalid:demo:v1";

export interface DemoState {
  version: 1;
  issuers: IssuerRecord[];
  records: Record<string, RegistryRecord>;
  documents: Record<string, CredentialDocument>;
  history: HistoryEntry[];
  actingIssuer: Address;
  /** Simulated chain admin. In demo you are always the admin. */
  pending: Hex[];
}

export function seedState(): DemoState {
  return {
    version: 1,
    issuers: SEED_ISSUERS.map((i) => ({ ...i })),
    records: Object.fromEntries(SEED_RECORDS.map((r) => [r.credentialId, { ...r }])),
    documents: Object.fromEntries(SEED_DOCUMENTS.map((d) => [d.payload.credentialId.toLowerCase(), d])),
    history: SEED_HISTORY.map((h) => ({ ...h, mode: "demo", state: h.state as VerificationState, contentChecked: h.method === "file" || h.method === "qr" })),
    actingIssuer: SEED_ISSUERS[0]!.address,
    pending: [],
  };
}

function load(): DemoState {
  const saved = readJSON<DemoState>(KEY);
  if (saved?.version === 1 && saved.issuers?.length) return { ...saved, pending: [] };
  return seedState();
}

export const demoStore = new Store<DemoState>(typeof window === "undefined" ? seedState() : load());
demoStore.subscribe(() => writeJSON(KEY, demoStore.get()));

export function resetDemo() {
  removeKey(KEY);
  sessionSigners.clear();
  demoStore.set(seedState());
}

/**
 * Demo signing keys live only in memory for this tab. When the acting issuer first issues
 * in a session, a fresh key is generated and registered as its signer (a simulated
 * IssuerSignerUpdated). Past credentials keep the signer recorded at their issuance,
 * exactly like the contract, so they still verify.
 */
const sessionSigners = new Map<string, PrivateKeyAccount>();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowS = () => Math.floor(Date.now() / 1000);
let simulatedLatency = { sign: 450, confirm: 2600 };
export function setDemoLatency(l: { sign: number; confirm: number }) {
  simulatedLatency = l;
}

function patch(fn: (s: DemoState) => DemoState) {
  demoStore.set(fn);
}

function issuerOf(address: Address): IssuerRecord | undefined {
  return demoStore.get().issuers.find((i) => isAddressEqual(i.address, address));
}

async function ensureSessionSigner(issuer: IssuerRecord): Promise<PrivateKeyAccount> {
  const existing = sessionSigners.get(issuer.address.toLowerCase());
  if (existing && isAddressEqual(existing.address, issuer.signer)) return existing;
  const account = privateKeyToAccount(generatePrivateKey());
  sessionSigners.set(issuer.address.toLowerCase(), account);
  const txId = startTx("demo", { kind: "rotate-signer", label: `Session signing key registered for ${issuer.name}` });
  updateTx("demo", txId, { state: "confirmed" });
  patch((s) => ({
    ...s,
    issuers: s.issuers.map((i) => (i.address === issuer.address ? { ...i, signer: account.address, updatedAt: nowS() } : i)),
  }));
  return account;
}

async function signAndAnchor(
  input: IssueInput,
  onStep: (s: IssueStep) => void,
  label: string,
  kind: "issue" | "supersede",
  supersedes?: Hex,
): Promise<IssueResult> {
  const state = demoStore.get();
  const issuer = issuerOf(state.actingIssuer);
  if (!issuer) throw new ActionError("Pick an issuer to act as.");
  if (issuer.status !== "active") throw new ActionError(`${issuer.name} is suspended and can't issue credentials.`);

  const { payload, canonical, payloadHash } = preparePayload({ ...input, issuerName: issuer.name }, issuer.address);
  onStep({ step: "canonicalized", canonical });
  onStep({ step: "hashed", payloadHash });

  const txId = startTx("demo", { kind, label, credentialId: payload.credentialId });
  onStep({ step: "signing" });
  const signer = await ensureSessionSigner(issuer);
  await wait(simulatedLatency.sign);
  const signature = await signer.signTypedData(typedData(DEMO_CHAIN_ID, DEMO_REGISTRY, messageFromPayload(payload, payloadHash)));
  onStep({ step: "signed", signer: signer.address, signature });

  const document: CredentialDocument = {
    format: "credvalid-document/1",
    mode: "demo",
    chainId: DEMO_CHAIN_ID,
    registry: DEMO_REGISTRY,
    payload,
    payloadHash,
    signer: signer.address,
    signature,
  };
  const id = payload.credentialId;

  onStep({ step: "submitting" });
  updateTx("demo", txId, { state: "pending" });
  patch((s) => ({ ...s, documents: { ...s.documents, [id]: document }, pending: [...s.pending, id] }));
  onStep({ step: "pending", txId });

  await wait(simulatedLatency.confirm);
  const t = nowS();
  const msg = messageFromPayload(payload, payloadHash);
  patch((s) => {
    const records = { ...s.records };
    records[id] = {
      credentialId: id,
      payloadHash,
      issuer: issuer.address,
      signer: signer.address,
      issuedAt: t,
      expiresAt: Number(msg.expiresAt),
      status: "active",
      statusChangedAt: t,
      revocationReason: 0,
      supersededBy: null,
    };
    if (supersedes && records[supersedes]) {
      records[supersedes] = { ...records[supersedes]!, status: "superseded", statusChangedAt: t, supersededBy: id };
    }
    return { ...s, records, pending: s.pending.filter((p) => p !== id) };
  });
  updateTx("demo", txId, { state: "confirmed" });
  onStep({ step: "confirmed", txId });
  return { credentialId: id, document, txId };
}

export const demoService: RegistryService = {
  mode: "demo",
  label: "Simulated registry",
  chainId: DEMO_CHAIN_ID,
  address: DEMO_REGISTRY,

  async getCredential(id) {
    return demoStore.get().records[id.toLowerCase()] ?? null;
  },
  async getIssuer(address) {
    return issuerOf(address) ?? null;
  },
  hasPendingIssuance(id) {
    return demoStore.get().pending.includes(id.toLowerCase() as Hex);
  },
  async listIssuers() {
    return demoStore.get().issuers;
  },
  async listRecords() {
    return Object.values(demoStore.get().records);
  },
  getDocument(id) {
    return demoStore.get().documents[id.toLowerCase()] ?? null;
  },
  listDocuments() {
    return Object.values(demoStore.get().documents);
  },

  issue(input, onStep = () => {}) {
    return signAndAnchor(input, onStep, `Issue ${input.title} to ${input.candidateName}`, "issue");
  },

  async supersede(oldId, input, onStep = () => {}) {
    const old = demoStore.get().records[oldId.toLowerCase()];
    if (!old) throw new ActionError("Credential not found.");
    if (old.status !== "active") throw new ActionError("Only an active credential can be superseded.");
    if (!isAddressEqual(old.issuer, demoStore.get().actingIssuer))
      throw new ActionError("Only the original issuer can supersede a credential.");
    return signAndAnchor(input, onStep, `Supersede ${oldId.slice(0, 10)}… with a corrected credential`, "supersede", old.credentialId);
  },

  async revoke(id, reason) {
    const key = id.toLowerCase() as Hex;
    const rec = demoStore.get().records[key];
    if (!rec) throw new ActionError("Credential not found.");
    if (rec.status !== "active") throw new ActionError("This credential is no longer active.");
    // Demo user acts as both the selected issuer and the registry admin, mirroring the contract rule.
    const txId = startTx("demo", { kind: "revoke", label: `Revoke ${key.slice(0, 10)}…`, credentialId: key });
    await wait(simulatedLatency.sign);
    updateTx("demo", txId, { state: "pending" });
    await wait(simulatedLatency.confirm * 0.6);
    patch((s) => ({
      ...s,
      records: { ...s.records, [key]: { ...rec, status: "revoked", statusChangedAt: nowS(), revocationReason: reason } },
    }));
    updateTx("demo", txId, { state: "confirmed" });
    return { txId };
  },

  async registerIssuer(address, signer, name, kind) {
    const a = getAddress(address);
    if (issuerOf(a)) throw new ActionError("That account is already a registered issuer.");
    const txId = startTx("demo", { kind: "register-issuer", label: `Register ${name}` });
    await wait(simulatedLatency.sign);
    updateTx("demo", txId, { state: "pending" });
    await wait(simulatedLatency.confirm * 0.5);
    const t = nowS();
    patch((s) => ({
      ...s,
      issuers: [...s.issuers, { address: a, signer: getAddress(signer), name, status: "active", registeredAt: t, updatedAt: t, kind: kind ?? "college" }],
    }));
    updateTx("demo", txId, { state: "confirmed" });
    return { txId };
  },

  async setIssuerStatus(address, action) {
    const issuer = issuerOf(address);
    if (!issuer) throw new ActionError("Issuer not found.");
    if (action === "suspend" && issuer.status === "suspended") throw new ActionError("Already suspended.");
    if (action === "reinstate" && issuer.status !== "suspended") throw new ActionError("Issuer isn't suspended.");
    const txId = startTx("demo", { kind: action === "suspend" ? "suspend-issuer" : "reinstate-issuer", label: `${action === "suspend" ? "Suspend" : "Reinstate"} ${issuer.name}` });
    await wait(simulatedLatency.sign);
    updateTx("demo", txId, { state: "pending" });
    await wait(simulatedLatency.confirm * 0.5);
    patch((s) => ({
      ...s,
      issuers: s.issuers.map((i) => (i.address === issuer.address ? { ...i, status: action === "suspend" ? "suspended" : "active", updatedAt: nowS() } : i)),
    }));
    updateTx("demo", txId, { state: "confirmed" });
    return { txId };
  },
};

export function setActingIssuer(address: Address) {
  patch((s) => ({ ...s, actingIssuer: address }));
}

export function addDemoHistory(entry: HistoryEntry) {
  patch((s) => ({ ...s, history: [entry, ...s.history].slice(0, 500) }));
}
