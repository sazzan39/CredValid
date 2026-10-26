import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Search, ShieldCheck, X } from "lucide-react";
import { useDemoState, useHistory, useMode, useRegistry } from "@/app/AppProvider";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Td, Th } from "@/components/ui/misc";
import { EmptyState, PageHeader, SourceBadge, VerificationBadge } from "@/components/app/primitives";
import { VERIFICATION_STATES, type VerificationState } from "@/verify/engine";
import { STATE_META } from "@/verify/states";
import { fmtDateTime } from "@/lib/utils";

const METHOD = { qr: "QR code", id: "Credential ID", file: "Credential file" } as const;

export function History() {
  const mode = useMode();
  const history = useHistory();
  const registry = useRegistry();
  useDemoState();
  const nav = useNavigate();
  const [q, setQ] = React.useState("");
  const [state, setState] = React.useState<VerificationState | "all">("all");
  const [page, setPage] = React.useState(0);
  const per = 12;

  const rows = history.map((h) => ({ ...h, candidate: registry?.getDocument(h.credentialId)?.payload.subject.name ?? null }));
  const needle = q.trim().toLowerCase();
  const filtered = rows.filter(
    (h) => (state === "all" || h.state === state) && (!needle || h.credentialId.includes(needle) || h.candidate?.toLowerCase().includes(needle) || h.verifier.toLowerCase().includes(needle)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / per));
  const slice = filtered.slice(page * per, page * per + per);
  React.useEffect(() => setPage(0), [q, state]);

  return (
    <>
      <PageHeader
        title="Verification history"
        meta={<SourceBadge mode={mode} />}
        description={mode === "demo" ? "Every check run against the demo registry, including sample activity." : "Checks run from this browser. History is stored locally, not on chain."}
        actions={
          <Button asChild>
            <Link to="/app/verify">
              <ShieldCheck /> Verify a credential
            </Link>
          </Button>
        }
      />
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by candidate, verifier or credential ID"
              aria-label="Search verification history"
              className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-[14px] placeholder:text-faint focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/12"
            />
          </div>
          <Select aria-label="Result" value={state} onChange={(e) => setState(e.target.value as VerificationState | "all")} className="sm:w-52">
            <option value="all">All results</option>
            {VERIFICATION_STATES.filter((s) => s !== "WALLET_NOT_CONNECTED").map((s) => (
              <option key={s} value={s}>
                {STATE_META[s].label}
              </option>
            ))}
          </Select>
          {(q || state !== "all") && (
            <Button variant="ghost" onClick={() => { setQ(""); setState("all"); }}>
              <X /> Clear
            </Button>
          )}
        </div>
        {filtered.length === 0 ? (
          <EmptyState title={history.length ? "No checks match" : "No verifications yet"} body={history.length ? "Try a different search or result filter." : "Verifications you run will be listed here."} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead className="border-b border-line bg-subtle/50">
                  <tr>
                    <Th>Credential</Th>
                    <Th>Candidate</Th>
                    <Th>Result</Th>
                    <Th>Checked by</Th>
                    <Th>Timestamp</Th>
                    <Th>Source</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {slice.map((h) => (
                    <tr key={h.id} className="transition-colors hover:bg-subtle/60">
                      <Td>
                        <Link to={`/app/credentials/${h.credentialId}`} className="mono text-fg hover:text-primary">
                          {h.credentialId.slice(0, 10)}…{h.credentialId.slice(-4)}
                        </Link>
                      </Td>
                      <Td>{h.candidate ?? <span className="text-muted">Not available</span>}</Td>
                      <Td>
                        <VerificationBadge state={h.state} />
                      </Td>
                      <Td>
                        <span className="block">{h.verifier}</span>
                        <span className="block text-[12.5px] text-muted">via {METHOD[h.method]}</span>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{fmtDateTime(h.at)}</Td>
                      <Td>
                        <SourceBadge mode={h.mode} />
                      </Td>
                      <Td className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => nav(`/app/verify/${h.credentialId}`)}>
                          Verify again
                        </Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > per && (
              <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[13.5px]">
                <span className="text-muted">
                  {page * per + 1}–{Math.min(filtered.length, (page + 1) * per)} of {filtered.length}
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
        )}
      </div>
    </>
  );
}
