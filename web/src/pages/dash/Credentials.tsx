import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FilePlus2 } from "lucide-react";
import { useMode } from "@/app/AppProvider";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState, PageHeader, SourceBadge } from "@/components/app/primitives";
import { applyFilters, CredentialTable, EMPTY_FILTERS, SearchAndFilters, type CredentialFilters } from "@/components/app/credentials";
import { TestnetNotConfigured } from "@/components/app/wallet";
import { testnet } from "@/lib/config";
import { useCredentialRows } from "./data";

export function Credentials() {
  const mode = useMode();
  const { rows, isLoading, error, refetch } = useCredentialRows();
  const [params, setParams] = useSearchParams();
  const filters: CredentialFilters = {
    q: params.get("q") ?? EMPTY_FILTERS.q,
    type: (params.get("type") as CredentialFilters["type"]) ?? EMPTY_FILTERS.type,
    status: (params.get("status") as CredentialFilters["status"]) ?? EMPTY_FILTERS.status,
    range: (params.get("range") as CredentialFilters["range"]) ?? EMPTY_FILTERS.range,
  };
  const setFilters = (f: CredentialFilters) => {
    const next = new URLSearchParams();
    (Object.keys(f) as (keyof CredentialFilters)[]).forEach((k) => f[k] !== EMPTY_FILTERS[k] && next.set(k, f[k]));
    setParams(next, { replace: true });
  };
  const filtered = React.useMemo(() => applyFilters(rows, filters), [rows, filters.q, filters.type, filters.status, filters.range]); // eslint-disable-line react-hooks/exhaustive-deps

  if (mode === "testnet" && !testnet.ok) return <TestnetNotConfigured />;

  return (
    <>
      <PageHeader
        title="Credentials"
        meta={<SourceBadge mode={mode} />}
        description="Manage issued credentials and review their current status."
        actions={
          <Button asChild>
            <Link to="/app/issue">
              <FilePlus2 /> Issue credential
            </Link>
          </Button>
        }
      />
      <div className="card overflow-hidden">
        <SearchAndFilters value={filters} onChange={setFilters} resultCount={filtered.length} />
        {error ? (
          <ErrorState retry={() => void refetch()} />
        ) : isLoading ? (
          <LoadingState label="Loading credentials…" />
        ) : (
          <CredentialTable rows={filtered} emptyAction={<Button variant="secondary" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</Button>} />
        )}
      </div>
      {mode === "testnet" && <p className="mt-3 text-[13px] text-muted">Names and titles appear only for credentials issued in this browser session. The blockchain stores no personal data.</p>}
    </>
  );
}
