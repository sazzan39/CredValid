import { getAddress, isAddress, type Address, type Chain } from "viem";
import { polygonAmoy } from "viem/chains";

export interface TestnetConfig {
  chain: Chain;
  chainId: number;
  contract: Address;
  explorer: string;
  rpcUrl: string;
  deployBlock: bigint;
}

export type TestnetConfigResult = { ok: true; config: TestnetConfig } | { ok: false; reason: string; missing: string[] };

const env: Partial<ImportMetaEnv> = import.meta.env ?? {};

export function readTestnetConfig(): TestnetConfigResult {
  const missing: string[] = [];
  const chainId = Number(env.VITE_CHAIN_ID || polygonAmoy.id);
  const rawContract = (env.VITE_CONTRACT_ADDRESS ?? "").trim();
  if (!rawContract) missing.push("VITE_CONTRACT_ADDRESS");
  if (rawContract && !isAddress(rawContract)) {
    return { ok: false, reason: "VITE_CONTRACT_ADDRESS is not a valid address.", missing: ["VITE_CONTRACT_ADDRESS"] };
  }
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return { ok: false, reason: "VITE_CHAIN_ID must be a positive integer.", missing: ["VITE_CHAIN_ID"] };
  }
  if (missing.length) {
    return { ok: false, reason: "No deployed contract is configured, so testnet mode is off.", missing };
  }

  const base = chainId === polygonAmoy.id ? polygonAmoy : null;
  const rpcUrl = (env.VITE_RPC_URL || base?.rpcUrls.default.http[0] || "").trim();
  if (!rpcUrl) return { ok: false, reason: `Set VITE_RPC_URL for chain ${chainId}.`, missing: ["VITE_RPC_URL"] };
  const explorer = (env.VITE_EXPLORER_URL || base?.blockExplorers?.default.url || "").replace(/\/$/, "");

  const chain: Chain = base
    ? { ...base, rpcUrls: { default: { http: [rpcUrl] } } }
    : {
        id: chainId,
        name: `Chain ${chainId}`,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
        blockExplorers: explorer ? { default: { name: "Explorer", url: explorer } } : undefined,
      };

  return {
    ok: true,
    config: {
      chain,
      chainId,
      contract: getAddress(rawContract),
      explorer,
      rpcUrl,
      deployBlock: BigInt(env.VITE_DEPLOY_BLOCK || 0),
    },
  };
}

export const testnet = readTestnetConfig();

/** Public base URL used in QR codes. Falls back to the current origin. */
export function appBaseUrl(): string {
  const configured = (env.VITE_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  if (configured) return configured;
  return typeof window !== "undefined" ? window.location.origin : "";
}

export function verificationUrl(credentialId: string): string {
  if (env.VITE_ROUTER === "hash") {
    const path = typeof window !== "undefined" && !env.VITE_PUBLIC_APP_URL ? window.location.pathname : "/";
    return `${appBaseUrl()}${path}#/v/${credentialId}`;
  }
  return `${appBaseUrl()}/v/${credentialId}`;
}

export function explorerTx(hash: string): string | null {
  return testnet.ok && testnet.config.explorer ? `${testnet.config.explorer}/tx/${hash}` : null;
}

export function explorerAddress(address: string): string | null {
  return testnet.ok && testnet.config.explorer ? `${testnet.config.explorer}/address/${address}` : null;
}
