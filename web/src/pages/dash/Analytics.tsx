import { useHistory, useMode } from "@/app/AppProvider";
import { CheckCircle2, Ban, Percent, XCircle } from "lucide-react";
import { BarList, CHART, Distribution, StackedColumns, weekBuckets } from "@/components/app/charts";
import { MetricCard, PageHeader, SectionHeading, SourceBadge } from "@/components/app/primitives";
import { TestnetNotConfigured } from "@/components/app/wallet";
import { CREDENTIAL_TYPE_LABEL } from "@/domain/types";
import { STATE_META } from "@/verify/states";
import { testnet } from "@/lib/config";
import { useCredentialRows } from "./data";

export function Analytics() {
  const mode = useMode();
  const history = useHistory();
  const { rows } = useCredentialRows();
  if (mode === "testnet" && !testnet.ok) return <TestnetNotConfigured />;

  const anchored = rows.filter((r) => r.record);
  const ok = history.filter((h) => h.state === "VERIFIED").length;
  const failed = history.filter((h) => STATE_META[h.state].tone === "bad").length;
  const rate = history.length ? Math.round((ok / history.length) * 100) : 0;
  const revoked = anchored.filter((r) => r.status === "revoked");

  const trend = weekBuckets(history, (h) => h.at, 16, (h) => (h.state === "VERIFIED" ? 0 : 1), 2);
  const types = new Map<string, number>();
  for (const r of anchored) {
    const t = r.document ? CREDENTIAL_TYPE_LABEL[r.document.payload.type] : "Not available";
    types.set(t, (types.get(t) ?? 0) + 1);
  }
  const outcomes = (["VERIFIED", "HASH_MISMATCH", "INVALID_SIGNATURE", "ISSUER_UNAUTHORIZED", "REVOKED", "EXPIRED", "SUPERSEDED", "NOT_FOUND", "UNABLE_TO_VERIFY"] as const)
    .map((s) => ({ label: STATE_META[s].label, value: history.filter((h) => h.state === s).length }))
    .filter((r) => r.value > 0);

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - (5 - i));
    return d;
  });
  const revocations = months.map((m) => {
    const start = m.getTime() / 1000;
    const end = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)).getTime() / 1000;
    return {
      label: m.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      values: [revoked.filter((r) => r.record!.statusChangedAt >= start && r.record!.statusChangedAt < end).length],
    };
  });

  return (
    <>
      <PageHeader
        title="Analytics"
        meta={<SourceBadge mode={mode} />}
        description={mode === "demo" ? "Derived from the same demo data shown across the dashboard." : "Credential figures come from the contract; verification figures from checks run in this browser."}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total checks" icon={CheckCircle2} value={history.length} />
        <MetricCard label="Success rate" icon={Percent} value={`${rate}%`} hint={`${ok} verified`} />
        <MetricCard label="Failed checks" icon={XCircle} value={failed} hint="Tampered, forged, untrusted or revoked" />
        <MetricCard label="Revocations" icon={Ban} value={revoked.length} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <SectionHeading title="Verification trend" description="Weekly checks, last 16 weeks" />
          <div className="card p-5">
            <StackedColumns buckets={trend} series={[{ name: "Verified", color: CHART.success }, { name: "Not verified", color: CHART.neutral }]} />
          </div>
        </section>
        <section className="min-w-0">
          <SectionHeading title="Successful vs unsuccessful" />
          <div className="card p-5">
            <Distribution
              rows={[
                { label: "Verified", value: ok, color: CHART.success },
                { label: "Failed", value: failed, color: CHART.danger },
                { label: "Inconclusive or outdated", value: history.length - ok - failed, color: CHART.warning },
              ]}
            />
          </div>
        </section>
        <section className="min-w-0">
          <SectionHeading title="Results by outcome" />
          <div className="card p-5">
            <BarList rows={outcomes.sort((a, b) => b.value - a.value)} />
          </div>
        </section>
        <section className="min-w-0 space-y-8">
          <div>
            <SectionHeading title="Credential types" />
            <div className="card p-5">
              <BarList rows={[...types].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)} color={CHART.primary} />
            </div>
          </div>
          <div>
            <SectionHeading title="Revocation activity" description="Last 6 months" />
            <div className="card p-5">
              <StackedColumns buckets={revocations} series={[{ name: "Revoked", color: CHART.danger }]} height={120} />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
