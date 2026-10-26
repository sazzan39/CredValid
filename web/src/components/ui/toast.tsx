import * as React from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { Store } from "@/lib/storage";
import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
}

const store = new Store<ToastItem[]>([]);
let next = 1;

export function toast(title: string, opts: { tone?: Tone; body?: string } = {}) {
  const id = next++;
  store.set((t) => [...t.slice(-2), { id, tone: opts.tone ?? "success", title, body: opts.body }]);
  setTimeout(() => dismiss(id), 4200);
}
function dismiss(id: number) {
  store.set((t) => t.filter((x) => x.id !== id));
}

const ICON = {
  success: <CheckCircle2 className="size-5 text-success" />,
  error: <XCircle className="size-5 text-danger" />,
  info: <Info className="size-5 text-primary" />,
};

export function Toaster() {
  const items = React.useSyncExternalStore(store.subscribe, store.get);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-32px)] max-w-sm flex-col gap-2" aria-live="polite" role="status">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn("pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-pop)]")}
          style={{ animation: "toast-in .25s var(--ease-out-soft) both" }}
        >
          {ICON[t.tone]}
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium">{t.title}</p>
            {t.body && <p className="mt-0.5 text-[13px] text-muted">{t.body}</p>}
          </div>
          <button onClick={() => dismiss(t.id)} className="rounded p-0.5 text-faint hover:text-fg" aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
