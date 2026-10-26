import * as React from "react";
import type { Hex } from "viem";
import { useIssuers, useRecords } from "@/app/queries";
import { useDemoState, useMode, useRegistry } from "@/app/AppProvider";
import type { CredentialDocument, IssuerRecord, RegistryRecord } from "@/domain/types";
import { displayStatus, type DisplayStatus } from "@/components/app/primitives";

export interface CredentialRow {
  id: Hex;
  record: RegistryRecord | null;
  document: CredentialDocument | null;
  issuer: IssuerRecord | null;
  status: DisplayStatus;
  anchoredAt: number;
}

/** Joins registry records with whatever off-chain documents this browser holds. */
export function useCredentialRows() {
  const mode = useMode();
  const registry = useRegistry();
  const records = useRecords();
  const issuers = useIssuers();
  const demo = useDemoState(); // re-render on demo changes (documents, pending)

  const rows = React.useMemo<CredentialRow[]>(() => {
    if (!registry) return [];
    const byIssuer = new Map((issuers.data ?? []).map((i) => [i.address.toLowerCase(), i]));
    const out: CredentialRow[] = (records.data ?? []).map((r) => ({
      id: r.credentialId,
      record: r,
      document: registry.getDocument(r.credentialId),
      issuer: byIssuer.get(r.issuer.toLowerCase()) ?? null,
      status: displayStatus(r.status, r.expiresAt),
      anchoredAt: r.issuedAt,
    }));
    if (mode === "demo") {
      for (const id of demo.pending) {
        const doc = demo.documents[id] ?? null;
        out.push({
          id,
          record: null,
          document: doc,
          issuer: doc ? (byIssuer.get(doc.payload.issuerAddress.toLowerCase()) ?? null) : null,
          status: "pending",
          anchoredAt: Math.floor(Date.now() / 1000),
        });
      }
    }
    return out.sort((a, b) => b.anchoredAt - a.anchoredAt);
  }, [registry, records.data, issuers.data, mode, demo.pending, demo.documents]);

  return { rows, isLoading: records.isLoading || issuers.isLoading, error: records.error ?? issuers.error, refetch: records.refetch };
}
