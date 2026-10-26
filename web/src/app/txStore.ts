import { readJSON, Store, writeJSON } from "@/lib/storage";
import type { AppMode, TxRecord } from "@/domain/types";

const KEY = (mode: AppMode) => `credvalid:txs:${mode}`;

function load(mode: AppMode): TxRecord[] {
  const rows = readJSON<TxRecord[]>(KEY(mode)) ?? [];
  // A tab closed mid-flight leaves "awaiting-signature" rows that will never resolve.
  return rows.map((t) =>
    t.state === "awaiting-signature" ? { ...t, state: "failed", error: "Interrupted before the wallet responded." } : t,
  );
}

export const txStores: Record<AppMode, Store<TxRecord[]>> = {
  demo: new Store<TxRecord[]>([]),
  testnet: new Store<TxRecord[]>([]),
};

if (typeof window !== "undefined") {
  (["demo", "testnet"] as const).forEach((mode) => {
    txStores[mode].set(load(mode));
    txStores[mode].subscribe(() => writeJSON(KEY(mode), txStores[mode].get().slice(0, 200)));
  });
}

let counter = 0;
export function startTx(mode: AppMode, init: Omit<TxRecord, "id" | "mode" | "createdAt" | "updatedAt" | "state">): string {
  const id = `${mode === "demo" ? "SIM" : "TX"}-${Date.now().toString(36)}-${(counter++).toString(36)}`;
  const now = Date.now();
  txStores[mode].set((rows) => [{ ...init, id, mode, state: "awaiting-signature", createdAt: now, updatedAt: now }, ...rows]);
  return id;
}

export function updateTx(mode: AppMode, id: string, patch: Partial<TxRecord>) {
  txStores[mode].set((rows) => rows.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)));
}

export function clearTxs(mode: AppMode) {
  txStores[mode].set([]);
}
