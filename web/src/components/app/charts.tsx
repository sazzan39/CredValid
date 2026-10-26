import * as React from "react";
import { cn } from "@/lib/utils";

export interface Series {
  name: string;
  color: string;
}

/** Weekly stacked columns with a y-axis scale and hover readout. Counts are drawn as-is. */
export function StackedColumns({ buckets, series, height = 180 }: { buckets: { label: string; values: number[] }[]; series: Series[]; height?: number }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const totals = buckets.map((b) => b.values.reduce((a, c) => a + c, 0));
  const rawMax = Math.max(1, ...totals);
  const step = rawMax <= 4 ? 1 : rawMax <= 10 ? 2 : Math.ceil(rawMax / 4);
  const max = Math.ceil(rawMax / step) * step;
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const n = buckets.length;

  return (
    <div>
      <div className="flex gap-3">
        <div className="relative w-6 shrink-0 text-right text-[11px] tabular-nums text-faint" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t / max) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height }} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: `${(1 - t / max) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[6%] px-[2%]">
            {buckets.map((b, i) => (
              <div key={b.label} className="relative flex h-full flex-1 flex-col justify-end" onMouseEnter={() => setHover(i)}>
                <div className={cn("flex flex-col-reverse overflow-hidden rounded-t-[4px] transition-opacity", hover !== null && hover !== i && "opacity-40")}>
                  {b.values.map((v, s) => (
                    <div key={s} style={{ height: `${(v / max) * height}px`, background: series[s]?.color }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {hover !== null && buckets[hover] && (
            <div
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-[calc(100%+6px)] whitespace-nowrap rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-[var(--shadow-pop)]"
              style={{ left: `${((hover + 0.5) / n) * 100}%` }}
            >
              <p className="font-medium">Week of {buckets[hover]!.label}</p>
              {series.map((s, i) => (
                <p key={s.name} className="mt-0.5 flex items-center gap-1.5 text-muted">
                  <span className="size-2 rounded-sm" style={{ background: s.color }} /> {s.name}: <span className="font-medium text-fg tabular-nums">{buckets[hover]!.values[i]}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="ml-9 mt-2 flex justify-between text-[11.5px] text-faint">
        <span>{buckets[0]?.label}</span>
        <span>{buckets[Math.floor(n / 2)]?.label}</span>
        <span>{buckets[n - 1]?.label}</span>
      </div>
      <Legend series={series} className="ml-9 mt-3" />
    </div>
  );
}

export function Legend({ series, className }: { series: Series[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1", className)}>
      {series.map((s) => (
        <span key={s.name} className="flex items-center gap-1.5 text-[12.5px] text-muted">
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} /> {s.name}
        </span>
      ))}
    </div>
  );
}

/** One horizontal stacked bar plus a value table: readable distribution without a pie. */
export function Distribution({ rows }: { rows: { label: string; value: number; color: string }[] }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-subtle" role="img" aria-label={rows.map((r) => `${r.label} ${r.value}`).join(", ")}>
        {rows.map((r) => (r.value ? <div key={r.label} style={{ width: `${(r.value / Math.max(1, total)) * 100}%`, background: r.color }} /> : null))}
      </div>
      <ul className="mt-4 space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between text-[13.5px]">
            <span className="flex items-center gap-2 text-muted">
              <span className="size-2.5 rounded-sm" style={{ background: r.color }} /> {r.label}
            </span>
            <span className="tabular-nums">
              <span className="font-medium">{r.value}</span>
              <span className="ml-2 inline-block w-10 text-right text-faint">{total ? Math.round((r.value / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarList({ rows, color = "var(--primary)" }: { rows: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-center justify-between text-[13.5px]">
            <span className="truncate">{r.label}</span>
            <span className="ml-3 font-medium tabular-nums">{r.value}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-subtle">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export const CHART = {
  primary: "#315efb",
  success: "#15803d",
  successLight: "#73c69a",
  warning: "#dc8b2b",
  danger: "#d9534a",
  neutral: "#c3c9d4",
};

export function weekBuckets<T>(items: T[], at: (item: T) => number, weeks: number, classify: (item: T) => number, seriesCount: number) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - weeks * 7 * 86_400;
  const buckets = Array.from({ length: weeks }, (_, i) => ({
    label: new Date((start + i * 7 * 86_400) * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    values: new Array<number>(seriesCount).fill(0),
  }));
  for (const item of items) {
    const t = at(item);
    if (t < start || t > now) continue;
    const idx = Math.min(weeks - 1, Math.floor((t - start) / (7 * 86_400)));
    const s = classify(item);
    if (s >= 0) buckets[idx]!.values[s]! += 1;
  }
  return buckets;
}
