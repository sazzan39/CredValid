import * as React from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { useHistory, useMode } from "@/app/AppProvider";
import { Td, Th } from "@/components/ui/misc";
import { EmptyState, ErrorState, LoadingState, PageHeader, SourceBadge, StatusBadge } from "@/components/app/primitives";
import { TestnetNotConfigured } from "@/components/app/wallet";
import { testnet } from "@/lib/config";
import { fmtDate, relTime } from "@/lib/utils";
import { useCredentialRows, type CredentialRow } from "./data";

export function Candidates() {
  const mode = useMode();
  const { rows, isLoading, error, refetch } = useCredentialRows();
  const history = useHistory();
  const [q, setQ] = React.useState("");
  if (mode === "testnet" && !testnet.ok) return <TestnetNotConfigured />;

  const people = new Map<string, CredentialRow[]>();
  for (const r of rows) {
    if (!r.document) continue;
    const name = r.document.payload.subject.name;
    people.set(name, [...(people.get(name) ?? []), r]);
  }
  const list = [...people.entries()]
    .map(([name, creds]) => {
      const ids = new Set(creds.map((c) => c.id));
      const checks = history.filter((h) => ids.has(h.credentialId));
      const lastCheck = checks[0]?.at ?? 0;
      const lastIssue = Math.max(...creds.map((c) => c.anchoredAt));
      return {
        name,
        creds,
        checks: checks.length,
        verified: checks.filter((h) => h.state === "VERIFIED").length,
        failed: checks.filter((h) => ["HASH_MISMATCH", "INVALID_SIGNATURE", "ISSUER_UNAUTHORIZED", "REVOKED"].includes(h.state)).length,
        last: Math.max(lastCheck, lastIssue),
        lastLabel: lastCheck > lastIssue ? "Verified" : "Credential issued",
      };
    })
    .filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.last - a.last);

  return (
    <>
      <PageHeader
        title="Candidates"
        meta={<SourceBadge mode={mode} />}
        description={mode === "demo" ? "People who hold credentials in the demo registry." : "People whose credential files are available in this browser session. The blockchain stores no names."}
      />
      <div className="card overflow-hidden">
        <div className="border-b border-line p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search candidates"
              aria-label="Search candidates"
              className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-[14px] placeholder:text-faint focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/12"
            />
          </div>
        </div>
        {error ? (
          <ErrorState retry={() => void refetch()} />
        ) : isLoading ? (
          <LoadingState />
        ) : list.length === 0 ? (
          <EmptyState title={people.size ? "No candidates match" : "No candidates yet"} body={people.size ? "Try a different name." : "Candidates appear once credentials are issued."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-line bg-subtle/50">
                <tr>
                  <Th>Candidate</Th>
                  <Th className="text-right">Credentials</Th>
                  <Th>Verification summary</Th>
                  <Th>Recent activity</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((p) => (
                  <tr key={p.name} className="transition-colors hover:bg-subtle/60">
                    <Td>
                      <div className="flex items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-subtle text-[12px] font-semibold text-muted">
                          {p.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium">{p.name}</p>
                          <p className="truncate text-[12.5px] text-muted">
                            {p.creds.slice(0, 2).map((c, i) => (
                              <React.Fragment key={c.id}>
                                {i > 0 && ", "}
                                <Link to={`/app/credentials/${c.id}`} className="hover:text-primary">
                                  {c.document!.payload.title}
                                </Link>
                              </React.Fragment>
                            ))}
                            {p.creds.length > 2 && ` +${p.creds.length - 2}`}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-right tabular-nums">{p.creds.length}</Td>
                    <Td>
                      {p.checks === 0 ? (
                        <span className="text-muted">Not verified yet</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          <StatusBadge tone="good">{p.verified} verified</StatusBadge>
                          {p.failed > 0 && <StatusBadge tone="bad">{p.failed} failed</StatusBadge>}
                          {p.checks - p.verified - p.failed > 0 && <StatusBadge tone="neutral">{p.checks - p.verified - p.failed} other</StatusBadge>}
                        </div>
                      )}
                    </Td>
                    <Td className="text-muted">
                      <span className="block text-fg">{p.lastLabel}</span>
                      <span className="block text-[12.5px]" title={fmtDate(p.last)}>{relTime(p.last * 1000)}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
