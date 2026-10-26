import { useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";
import { useMode, useRegistry } from "./AppProvider";

export function useRecords() {
  const mode = useMode();
  const registry = useRegistry();
  return useQuery({
    queryKey: ["registry", mode, "records"],
    queryFn: () => registry!.listRecords(),
    enabled: Boolean(registry),
  });
}

export function useIssuers() {
  const mode = useMode();
  const registry = useRegistry();
  return useQuery({
    queryKey: ["registry", mode, "issuers"],
    queryFn: () => registry!.listIssuers(),
    enabled: Boolean(registry),
  });
}

export function useRecord(id: Hex | null) {
  const mode = useMode();
  const registry = useRegistry();
  return useQuery({
    queryKey: ["registry", mode, "record", id],
    queryFn: () => registry!.getCredential(id!),
    enabled: Boolean(registry && id),
  });
}
