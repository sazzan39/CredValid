import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Ban, ChevronLeft, ChevronRight, Copy, Eye, MoreHorizontal, Search, ShieldCheck, X } from "lucide-react";
import type { Hex } from "viem";
import { useMode, useWallet } from "@/app/AppProvider";
import { CREDENTIAL_TYPE_LABEL, CREDENTIAL_TYPES, type CredentialType } from "@/domain/types";
import { verificationUrl } from "@/lib/config";
import { copyText, fmtDate, fmtIsoDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger, Td, Th } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { CredentialStatusBadge, EmptyState, type DisplayStatus } from "./primitives";
import { RevokeDialog } from "./revoke";
import type { CredentialRow } from "@/pages/dash/data";

export interface CredentialFilters {
  q: string;
  type: CredentialType | "all";
  status: DisplayStatus | "all";
  range: "all" | "30" | "90" | "365";
}

export const EMPTY_FILTERS: CredentialFilters = { q: "", type: "all", status: "all", range: "all" };

export function applyFilters(rows: CredentialRow[], f: CredentialFilters): CredentialRow[] {
  const needle = f.q.trim().toLowerCase();
  const since = f.range === "all" ? 0 : Date.now() / 1000 - Number(f.range) * 86_400;
  return rows.filter(
    (r) =>
      (f.status === "all" || r.status === f.status) &&
      (f.type === "all" || r.document?.payload.type === f.type) &&
      r.anchoredAt >= since &&
      (!needle ||
        r.id.includes(needle) ||
        [r.document?.payload.subject.name, r.document?.payload.title, r.issuer?.name].some((v) => v?.toLowerCase().includes(needle))),
  );
}

export function SearchAndFilters({ value, onChange, resultCount }: { value: CredentialFilters; onChange: (f: CredentialFilters) => void; resultCount: number }) {
  const active = value.q || value.type !== "all" || value.status !== "all" || value.range !== "all";
  return (
    <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <input
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          placeholder="Search by candidate, credential, issuer or ID"
          aria-label="Search credentials"
          className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-[14px] placeholder:text-faint focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/12"
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Select aria-label="Credential type" value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value as CredentialFilters["type"] })} className="sm:w-44">
          <option value="all">All types</option>
          {CREDENTIAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {CREDENTIAL_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <Select aria-label="Status" value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value as CredentialFilters["status"] })} className="sm:w-36">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="revoked">Revoked</option>
          <option value="expired">Expired</option>
          <option value="superseded">Replaced</option>
        </Select>
        <Select aria-label="Issued within" value={value.range} onChange={(e) => onChange({ ...value, range: e.target.value as CredentialFilters["range"] })} className="sm:w-40">
          <option value="all">Any date</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last 12 months</option>
        </Select>
        {active && (
          <Button variant="ghost" onClick={() => onChange(EMPTY_FILTERS)}>
            <X /> Clear filters
          </Button>
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        {resultCount} credentials
      </span>
    </div>
  );
}

function RowActions({ row }: { row: CredentialRow }) {
  const nav = useNavigate();
  const mode = useMode();
  const wallet = useWallet();
  const [revoke, setRevoke] = React.useState(false);
  // The contract enforces issuer-or-admin; the UI offers it to any connected wallet and surfaces the contract's answer.
  const canRevoke = row.record?.status === "active" && (mode === "demo" || wallet.status === "connected");
  return (
    <>
      <DropdownMenu>
        <DropdownTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${row.document?.payload.subject.name ?? row.id}`} onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal />
          </Button>
        </DropdownTrigger>
        <DropdownContent onClick={(e) => e.stopPropagation()}>
          <DropdownItem onSelect={() => nav(`/app/credentials/${row.id}`)}>
            <Eye /> View details
          </DropdownItem>
          <DropdownItem onSelect={() => nav(`/app/verify/${row.id}`)}>
            <ShieldCheck /> Verify
          </DropdownItem>
          <DropdownItem
            onSelect={async () => {
              const ok = await copyText(verificationUrl(row.id));
              toast(ok ? "Verification link copied" : "Couldn't copy the link", { tone: ok ? "success" : "error" });
            }}
          >
            <Copy /> Copy verification link
          </DropdownItem>
          {canRevoke && (
            <>
              <DropdownSeparator />
              <DropdownItem danger onSelect={() => setRevoke(true)}>
                <Ban /> Revoke
              </DropdownItem>
            </>
          )}
        </DropdownContent>
      </DropdownMenu>
      {row.record && <RevokeDialog id={row.record.credentialId as Hex} name={row.document?.payload.subject.name} open={revoke} onOpenChange={setRevoke} />}
    </>
  );
}

export function CredentialTable({ rows, pageSize = 10, emptyAction }: { rows: CredentialRow[]; pageSize?: number; emptyAction?: React.ReactNode }) {
  const nav = useNavigate();
  const [page, setPage] = React.useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  React.useEffect(() => {
    if (page > pages - 1) setPage(0);
  }, [page, pages]);
  const slice = rows.slice(page * pageSize, page * pageSize + pageSize);

  if (rows.length === 0) return <EmptyState title="No credentials match" body="Try a different search or clear the filters." action={emptyAction} />;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px]">
          <thead className="border-b border-line bg-subtle/50">
            <tr>
              <Th>Candidate</Th>
              <Th>Credential type</Th>
              <Th>Issuer</Th>
              <Th>Issue date</Th>
              <Th>Status</Th>
              <Th className="w-12 text-right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {slice.map((r) => (
              <tr key={r.id} className="cursor-pointer transition-colors hover:bg-subtle/60" onClick={() => nav(`/app/credentials/${r.id}`)}>
                <Td className="max-w-[280px]">
                  <Link to={`/app/credentials/${r.id}`} className="block truncate font-medium hover:text-primary" onClick={(e) => e.stopPropagation()}>
                    {r.document?.payload.subject.name ?? "Details held off-chain"}
                  </Link>
                  <span className="mono block truncate text-[12px] text-faint">{r.id.slice(0, 10)}…{r.id.slice(-6)}</span>
                </Td>
                <Td>
                  <span className="block">{r.document ? CREDENTIAL_TYPE_LABEL[r.document.payload.type] : "—"}</span>
                  {r.document && <span className="block max-w-[220px] truncate text-[12.5px] text-muted">{r.document.payload.title}</span>}
                </Td>
                <Td className="text-muted">{r.issuer?.name ?? "—"}</Td>
                <Td className="whitespace-nowrap text-muted">{r.document ? fmtIsoDate(r.document.payload.issueDate) : fmtDate(r.anchoredAt)}</Td>
                <Td>
                  <CredentialStatusBadge status={r.status} />
                </Td>
                <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                  <RowActions row={r} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > pageSize && (
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[13.5px]">
          <span className="text-muted">
            {page * pageSize + 1}–{Math.min(rows.length, (page + 1) * pageSize)} of {rows.length}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft /> Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
