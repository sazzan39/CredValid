import type { Address, Hex } from "viem";
import type { AppMode, IssuerRecord, RegistryRecord } from "@/domain/types";

/** Read side of the registry. Implemented by the simulated demo store and the on-chain client. */
export interface RegistryReader {
  readonly mode: AppMode;
  readonly chainId: number;
  readonly address: Address;
  getCredential(id: Hex): Promise<RegistryRecord | null>;
  getIssuer(address: Address): Promise<IssuerRecord | null>;
  /** True when this browser has submitted an issuance for this ID that hasn't confirmed yet. */
  hasPendingIssuance(id: Hex): boolean;
}

/** Thrown when the registry can't be reached. Never evidence of fraud. */
export class RegistryUnavailableError extends Error {
  override name = "RegistryUnavailableError";
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
  }
}
