import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Ban, Building2, CheckCircle2, FilePlus2, Files, Loader, ShieldCheck } from "lucide-react";
import { useHistory, useMode, useTxs } from "@/app/AppProvider";
import { Button } from "@/components/ui/button";
import { CredentialStatusBadge, EmptyState, ErrorState, LoadingState, MetricCard, PageHeader, SectionHeading, SourceBadge, VerificationBadge } from "@/components/app/primitives";
import { CHART, Distribution, StackedColumns, weekBuckets } from "@/components/app/charts";
import { TestnetNotConfigured } from "@/components/app/wallet";
import { STATE_META } from "@/verify/states";
import { testnet } from "@/lib/config";
import { fmtDate, relTime } from "@/lib/utils";
import { useCredentialRows } from "./data";

export function Overview() {
  const mode = useMode();
  const nav = useNavigate();
  const { rows, isLoading, error, refetch } = useCredentialRows();
  const history = useHistory();
  const txs = useTxs();
  if (mode === "testnet" && !testnet.ok) return <TestnetNotConfigured />;

  const anchored = rows.filter((r) => r.record);
  const monthAgo = Date.now() / 1000 - 30 * 86_400;
  const recent30 = anchored.filter((r) => r.anchoredAt > monthAgo).length;
  const verified = history.filter((h) => h.state === "VERIFIED").length;
  const pending = txs.filter((t) => t.state === "pending" || t.state === "awaiting-signature").length;
  const revoked = anchored.filter((r) => r.status === "revoked").length;
  const count = (s: string) => rows.filter((r) => r.status === s).length;

  const buckets = weekBuckets(history, (h) => h.at, 12, (h) => (h.state === "VERIFIED" ? 0 : STATE_META[h.state].tone === "bad" ? 1 : 2), 3);

  return (
    <>
      <PageHeader
        title="Overview"
        meta={<SourceBadge mode={mode} />}
        description="Monitor credentials, verification activity, and issuer operations."
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to="/app/verify">
                <ShieldCheck /> Verify a credential
              </Link>
            </Button>
            <Button asChild>
              <Link to="/app/issue">
                <FilePlus2 /> Issue credential
              </Link>
            </Button>
          </>
        }
      />

      {error ? (
        <div className="card mb-6">
          <ErrorState retry={() => void refetch()} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Credentials issued" icon={Files} value={isLoading ? "–" : anchored.length} hint={recent30 ? `${recent30} in the last 30 days` : "None in the last 30 days"} onClick={() => nav("/app/credentials")} />
        <MetricCard label="Successful verifications" icon={CheckCircle2} value={verified} hint={`Out of ${history.length} checks`} onClick={() => nav("/app/history")} />
        <MetricCard label="Pending transactions" icon={Loader} value={pending} hint={pending ? "Waiting for confirmation" : "Nothing waiting"} onClick={() => nav("/app/transactions")} />
        <MetricCard label="Revoked credentials" icon={Ban} value={isLoading ? "–" : revoked} hint={`${count("superseded")} replaced by corrections`} onClick={() => nav("/app/credentials?status=revoked")} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-8">
          <section>
            <SectionHeading title="Verification activity" description="Checks per week, last 12 weeks" />
            <div className="card p-5">
              <StackedColumns
                buckets={buckets}
                series={[
                  { name: "Verified", color: CHART.success },
                  { name: "Failed", color: CHART.danger },
                  { name: "Expired, replaced or inconclusive", color: CHART.warning },
                ]}
              />
            </div>
          </section>

          <section>
            <SectionHeading
              title="Recent verification activity"
              action={
                <Link to="/app/history" className="inline-flex items-center gap-1 text-[13.5px] font-medium text-primary hover:underline">
                  View all <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            <div className="card">
              {history.length === 0 ? (
                <EmptyState title="No verifications yet" body="Checks you or recruiters run will appear here." />
              ) : (
                <ul className="divide-y divide-line">
                  {history.slice(0, 5).map((h) => (
                    <li key={h.id}>
                      <Link to={`/app/credentials/${h.credentialId}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-subtle/60">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium">{h.verifier}</p>
                          <p className="mono truncate text-[12px] text-faint">{h.credentialId.slice(0, 18)}…</p>
                        </div>
                        <span className="hidden text-[13px] text-muted sm:block">{relTime(h.at * 1000)}</span>
                        <VerificationBadge state={h.state} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-8">
          <section>
            <SectionHeading title="Credential status" />
            <div className="card p-5">
              {isLoading ? (
                <LoadingState />
              ) : (
                <Distribution
                  rows={[
                    { label: "Active", value: count("active"), color: CHART.success },
                    { label: "Pending", value: count("pending"), color: CHART.primary },
                    { label: "Expired", value: count("expired"), color: CHART.warning },
                    { label: "Replaced", value: count("superseded"), color: CHART.neutral },
                    { label: "Revoked", value: count("revoked"), color: CHART.danger },
                  ]}
                />
              )}
            </div>
          </section>

          <section>
            <SectionHeading
              title="Recent issuance"
              action={
                <Link to="/app/credentials" className="inline-flex items-center gap-1 text-[13.5px] font-medium text-primary hover:underline">
                  View all <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            <div className="card">
              {isLoading ? (
                <LoadingState />
              ) : rows.length === 0 ? (
                <EmptyState title="No credentials yet" action={<Button size="sm" asChild><Link to="/app/issue">Issue credential</Link></Button>} />
              ) : (
                <ul className="divide-y divide-line">
                  {rows.slice(0, 5).map((r) => (
                    <li key={r.id}>
                      <Link to={`/app/credentials/${r.id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-subtle/60">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium">{r.document?.payload.subject.name ?? "Holder details off-chain"}</p>
                          <p className="truncate text-[12.5px] text-muted">{r.status === "pending" ? "Confirming…" : `${r.issuer?.name ?? "Issuer"} · ${fmtDate(r.anchoredAt)}`}</p>
                        </div>
                        <CredentialStatusBadge status={r.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section>
            <SectionHeading title="Quick actions" />
            <div className="grid grid-cols-1 gap-2">
              {[
                { to: "/app/issue", icon: FilePlus2, label: "Issue a credential", sub: "Create a signed record for a candidate" },
                { to: "/app/verify", icon: ShieldCheck, label: "Verify a credential", sub: "Check an ID, QR code or file" },
                { to: "/app/issuers", icon: Building2, label: "Manage issuers", sub: "Approve or suspend institutions" },
              ].map((a) => (
                <Link key={a.to} to={a.to} className="card flex items-center gap-3 px-4 py-3 transition hover:border-line-strong">
                  <span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary">
                    <a.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">{a.label}</span>
                    <span className="block truncate text-[12.5px] text-muted">{a.sub}</span>
                  </span>
                  <ArrowRight className="size-4 text-faint" />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
