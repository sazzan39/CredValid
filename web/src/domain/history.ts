import type { Hex } from "viem";
import type { AppMode } from "./types";
import type { VerificationState } from "@/verify/engine";

/** One verification run. Holds no personal data: ID, outcome, who checked, when. */
export interface HistoryEntry {
  id: string;
  mode: AppMode;
  credentialId: Hex;
  state: VerificationState;
  verifier: string;
  method: "qr" | "id" | "file";
  contentChecked: boolean;
  at: number; // unix seconds
}
