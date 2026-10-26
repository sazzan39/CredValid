import { createWalletClient, custom, getAddress, numberToHex, type Address, type WalletClient } from "viem";
import { Store } from "@/lib/storage";
import { testnet } from "@/lib/config";

export type WalletStatus = "unavailable" | "disconnected" | "connecting" | "connected";

export interface WalletState {
  status: WalletStatus;
  account: Address | null;
  accounts: Address[];
  chainId: number | null;
  error: string | null;
}

export const walletStore = new Store<WalletState>({
  status: typeof window !== "undefined" && window.ethereum ? "disconnected" : "unavailable",
  account: null,
  accounts: [],
  chainId: null,
  error: null,
});

function provider(): EthereumProvider | null {
  return typeof window !== "undefined" ? (window.ethereum ?? null) : null;
}

function toAccounts(value: unknown): Address[] {
  return Array.isArray(value) ? value.filter((a): a is string => typeof a === "string").map((a) => getAddress(a)) : [];
}

function errorCode(err: unknown): number | undefined {
  return typeof err === "object" && err !== null && "code" in err ? Number((err as { code: unknown }).code) : undefined;
}

async function readChainId(p: EthereumProvider): Promise<number> {
  return Number(await p.request({ method: "eth_chainId" }));
}

export async function connectWallet(): Promise<void> {
  const p = provider();
  if (!p) {
    walletStore.set((s) => ({ ...s, status: "unavailable", error: "No browser wallet found. Install MetaMask or another EIP-1193 wallet." }));
    return;
  }
  walletStore.set((s) => ({ ...s, status: "connecting", error: null }));
  try {
    const accounts = toAccounts(await p.request({ method: "eth_requestAccounts" }));
    const chainId = await readChainId(p);
    walletStore.set({ status: accounts.length ? "connected" : "disconnected", account: accounts[0] ?? null, accounts, chainId, error: null });
  } catch (err) {
    const rejected = errorCode(err) === 4001;
    walletStore.set((s) => ({
      ...s,
      status: "disconnected",
      error: rejected ? "Connection request was declined in the wallet." : "The wallet couldn't connect. Unlock it and try again.",
    }));
  }
}

/** Forget the connection in the app. Wallets don't offer a programmatic disconnect. */
export function disconnectWallet() {
  walletStore.set((s) => ({ ...s, status: provider() ? "disconnected" : "unavailable", account: null, accounts: [], error: null }));
}

export async function switchToConfiguredChain(): Promise<void> {
  const p = provider();
  if (!p || !testnet.ok) return;
  const { chain } = testnet.config;
  const hexId = numberToHex(chain.id);
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (err) {
    if (errorCode(err) === 4902) {
      await p.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexId,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: chain.rpcUrls.default.http,
            blockExplorerUrls: testnet.config.explorer ? [testnet.config.explorer] : undefined,
          },
        ],
      });
    } else if (errorCode(err) === 4001) {
      walletStore.set((s) => ({ ...s, error: "Network switch was declined." }));
      return;
    } else {
      throw err;
    }
  }
  walletStore.set((s) => ({ ...s, chainId: chain.id, error: null }));
}

export function getWalletClient(account: Address): WalletClient | null {
  const p = provider();
  if (!p || !testnet.ok) return null;
  return createWalletClient({ account, chain: testnet.config.chain, transport: custom(p) });
}

let listening = false;
export function initWalletListeners() {
  const p = provider();
  if (!p || listening || !p.on) return;
  listening = true;
  p.on("accountsChanged", (value) => {
    const accounts = toAccounts(value);
    walletStore.set((s) =>
      s.status === "connected" || s.status === "connecting"
        ? { ...s, accounts, account: accounts[0] ?? null, status: accounts.length ? "connected" : "disconnected" }
        : s,
    );
  });
  p.on("chainChanged", (value) => walletStore.set((s) => ({ ...s, chainId: Number(value) })));
  // Restore a previously granted connection without prompting.
  void p
    .request({ method: "eth_accounts" })
    .then(async (value) => {
      const accounts = toAccounts(value);
      if (accounts.length) walletStore.set({ status: "connected", account: accounts[0]!, accounts, chainId: await readChainId(p), error: null });
    })
    .catch(() => undefined);
}

export function isWrongNetwork(state: WalletState): boolean {
  return state.status === "connected" && testnet.ok && state.chainId !== testnet.config.chainId;
}
