import * as React from "react";
import { AlertTriangle, Check, Copy, Inbox, Loader2 } from "lucide-react";
import type { AppMode, CredentialStatus, IssuerStatus } from "@/domain/types";
import type { VerificationState } from "@/verify/engine";
import { STATE_META, type Tone } from "@/verify/states";
import { cn, copyText } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

const TONE: Record<Tone, string> = {
  good: "bg-success-soft text-success ring-[#abefc6]",
  warn: "bg-warning-soft text-warning ring-[#fedf89]",
  bad: "bg-danger-soft text-danger ring-[#fecdca]",
  info: "bg-primary-soft text-primary ring-[#c7d7fe]",
  neutral: "bg-subtle text-muted ring-line",
};

export function StatusBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset", TONE[tone], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

export function VerificationBadge({ state }: { state: VerificationState }) {
  const m = STATE_META[state];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

export type DisplayStatus = CredentialStatus | "expired" | "pending";
export function displayStatus(status: CredentialStatus, expiresAt: number, now = Date.now() / 1000): DisplayStatus {
  if (status === "active" && expiresAt !== 0 && now > expiresAt) return "expired";
  return status;
}
export const STATUS_META: Record<DisplayStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "good" },
  pending: { label: "Pending", tone: "info" },
  revoked: { label: "Revoked", tone: "bad" },
  expired: { label: "Expired", tone: "warn" },
  superseded: { label: "Replaced", tone: "warn" },
  none: { label: "Unknown", tone: "neutral" },
};
export function CredentialStatusBadge({ status }: { status: DisplayStatus }) {
  return <StatusBadge tone={STATUS_META[status].tone}>{STATUS_META[status].label}</StatusBadge>;
}

export function IssuerStatusBadge({ status }: { status: IssuerStatus }) {
  return status === "active" ? <StatusBadge tone="good">Approved</StatusBadge> : status === "suspended" ? <StatusBadge tone="warn">Suspended</StatusBadge> : <StatusBadge tone="neutral">Unknown</StatusBadge>;
}

/** Marks where data came from, so simulated results are never mistaken for chain results. */
export function SourceBadge({ mode, className }: { mode: AppMode; className?: string }) {
  return mode === "demo" ? (
    <span className={cn("inline-flex items-center rounded-md bg-warning-soft px-1.5 py-0.5 text-[11.5px] font-medium text-warning", className)}>Simulated</span>
  ) : (
    <span className={cn("inline-flex items-center rounded-md bg-primary-soft px-1.5 py-0.5 text-[11.5px] font-medium text-primary", className)}>Testnet</span>
  );
}

export function CopyButton({ value, label = "Copy", toastLabel, className, children }: { value: string; label?: string; toastLabel?: string; className?: string; children?: React.ReactNode }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyText(value);
        if (ok) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
          if (toastLabel) toast(toastLabel);
        } else toast("Couldn't copy", { tone: "error", body: "Your browser blocked clipboard access. Select the text instead." });
      }}
      className={cn("inline-flex items-center gap-1.5 rounded-md p-1 text-faint transition hover:bg-subtle hover:text-fg", className)}
      aria-label={done ? "Copied" : label}
      title={label}
    >
      {done ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      {children}
    </button>
  );
}

export function MonoValue({ value, short = false, copy = true, className }: { value: string; short?: boolean; copy?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 max-w-full items-center gap-1", className)}>
      <span className={cn("mono text-muted", short ? "whitespace-nowrap" : "break-all")} title={value}>
        {short ? `${value.slice(0, 8)}…${value.slice(-6)}` : value}
      </span>
      {copy && <CopyButton value={value} label="Copy" />}
    </span>
  );
}

export function PageHeader({ title, description, actions, meta }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
          {meta}
        </div>
        {description && <p className="mt-1 max-w-2xl text-[14.5px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function MetricCard({ label, value, icon: Icon, hint, onClick }: { label: string; value: React.ReactNode; icon: React.ElementType; hint?: React.ReactNode; onClick?: () => void }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick} className={cn("card w-full p-5 text-left", onClick && "transition hover:border-line-strong")}>
      <div className="flex items-center justify-between">
        <span className="text-[13.5px] font-medium text-muted">{label}</span>
        <span className="grid size-8 place-items-center rounded-lg bg-subtle text-muted">
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-3 text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{value}</div>
      {hint && <div className="mt-2 text-[12.5px] text-muted">{hint}</div>}
    </Comp>
  );
}

export function EmptyState({ title, body, action, icon: Icon = Inbox }: { title: string; body?: React.ReactNode; action?: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-subtle text-muted">
        <Icon className="size-5" />
      </span>
      <p className="mt-4 text-[15px] font-medium">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[14px] text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-14 text-[14px] text-muted" role="status">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorState({ title = "Couldn't load this", body, retry }: { title?: string; body?: React.ReactNode; retry?: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center" role="alert">
      <span className="grid size-10 place-items-center rounded-full bg-warning-soft text-warning">
        <AlertTriangle className="size-5" />
      </span>
      <p className="mt-4 text-[15px] font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-[14px] text-muted">{body ?? "The network didn't respond. This says nothing about any credential."}</p>
      {retry && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function SectionHeading({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[16px] font-semibold">{title}</h2>
        {description && <p className="text-[13px] text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--primary)" />
        <path d="M16 7l7 3v5.5c0 4.4-3 7.9-7 9.5-4-1.6-7-5.1-7-9.5V10l7-3z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        <path d="M12.5 15.8l2.4 2.4 4.6-4.7" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!collapsed && <span className="text-[16px] font-semibold tracking-[-0.01em]">CredValid</span>}
    </span>
  );
}
