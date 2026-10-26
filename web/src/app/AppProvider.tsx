import * as React from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import type { AppMode, TxRecord } from "@/domain/types";
import type { HistoryEntry } from "@/domain/history";
import { readJSON, Store, writeJSON } from "@/lib/storage";
import { testnet } from "@/lib/config";
import { demoService, demoStore, addDemoHistory, type DemoState } from "@/demo/store";
import { chainService } from "@/registry/chain";
import type { RegistryService } from "@/registry/service";
import { txStores } from "./txStore";
import { initWalletListeners, walletStore, type WalletState } from "@/wallet/wallet";
import { TooltipProvider } from "@/components/ui/misc";
import { Toaster } from "@/components/ui/toast";

const MODE_KEY = "credvalid:mode";
const HISTORY_KEY = "credvalid:history:testnet";

const initialMode: AppMode = readJSON<AppMode>(MODE_KEY) === "testnet" && testnet.ok ? "testnet" : "demo";
export const modeStore = new Store<AppMode>(initialMode);
modeStore.subscribe(() => writeJSON(MODE_KEY, modeStore.get()));

/** Verifications run in testnet mode from this browser. Local only; never sent anywhere. */
export const testnetHistory = new Store<HistoryEntry[]>(readJSON<HistoryEntry[]>(HISTORY_KEY) ?? []);
testnetHistory.subscribe(() => writeJSON(HISTORY_KEY, testnetHistory.get().slice(0, 500)));

export function recordHistory(entry: HistoryEntry) {
  if (entry.mode === "demo") addDemoHistory(entry);
  else testnetHistory.set((rows) => [entry, ...rows]);
}

export const useMode = () => React.useSyncExternalStore(modeStore.subscribe, modeStore.get);
export const useDemoState = (): DemoState => React.useSyncExternalStore(demoStore.subscribe, demoStore.get);
export const useWallet = (): WalletState => React.useSyncExternalStore(walletStore.subscribe, walletStore.get);
export function useTxs(mode?: AppMode): TxRecord[] {
  const current = useMode();
  const store = txStores[mode ?? current];
  return React.useSyncExternalStore(store.subscribe, store.get);
}
export function useHistory(): HistoryEntry[] {
  const mode = useMode();
  const demo = useDemoState();
  const chain = React.useSyncExternalStore(testnetHistory.subscribe, testnetHistory.get);
  return mode === "demo" ? demo.history : chain;
}

/** The registry for the current mode, or null when testnet mode lacks configuration. */
export function useRegistry(): RegistryService | null {
  const mode = useMode();
  return mode === "demo" ? demoService : chainService;
}

export function setMode(mode: AppMode) {
  modeStore.set(mode);
}

function DemoInvalidator() {
  const qc = useQueryClient();
  React.useEffect(() => demoStore.subscribe(() => void qc.invalidateQueries({ queryKey: ["registry", "demo"] })), [qc]);
  React.useEffect(
    () =>
      txStores.testnet.subscribe(() => {
        const latest = txStores.testnet.get()[0];
        if (latest?.state === "confirmed") void qc.invalidateQueries({ queryKey: ["registry", "testnet"] });
      }),
    [qc],
  );
  return null;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } } }),
  );
  React.useEffect(() => initWalletListeners(), []);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <DemoInvalidator />
        {children}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
