import * as React from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock,
  FileJson,
  ImageUp,
  Loader2,
  Minus,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  X,
} from "lucide-react";
import type { Hex } from "viem";
import jsQR from "jsqr";
import { verifyCredential, type CheckResult, type VerificationReport } from "@/verify/engine";
import { STATE_META, type Tone } from "@/verify/states";
import { extractCredentialId } from "@/crypto/ids";
import { parseDocument } from "@/crypto/document";
import type { CredentialDocument } from "@/domain/types";
import { CREDENTIAL_TYPE_LABEL, REVOCATION_REASONS } from "@/domain/types";
import { recordHistory, useMode, useRegistry, useTxs } from "@/app/AppProvider";
import { SEED_SAMPLES } from "@/demo/seed.generated";
import { cn, fmtDate, fmtIsoDate } from "@/lib/utils";
import { testnet } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { QrScanner } from "@/components/qr";
import { MonoValue, SourceBadge } from "./primitives";
import { TestnetNotConfigured, TxLink } from "./wallet";

const PROGRESS = ["Retrieving credential record", "Checking issuer authorization", "Verifying credential integrity", "Checking current status"];

/** Plain-English outcome copy. */
function explain(report: VerificationReport): { title: string; body: string; meaning: string[] } {
  const issuer = report.issuer?.name ?? "the issuer";
  switch (report.state) {
    case "VERIFIED":
      return {
        title: "Credential verified",
        body: `This credential was issued by ${issuer} and hasn't been changed since.`,
        meaning: [
          "The details match the cryptographic fingerprint the issuer recorded.",
          `The signature belongs to ${issuer}'s registered key, and ${issuer} is approved in CredValid's issuer registry.`,
          "It hasn't been revoked, replaced or expired.",
          "CredValid confirms who issued it and that it's unaltered. It doesn't independently confirm the facts the issuer attested to.",
        ],
      };
    case "HASH_MISMATCH":
      return { title: STATE_META.HASH_MISMATCH.title, body: "These details were changed after the credential was issued.", meaning: ["Even a one-character edit breaks the match. Don't rely on this version.", "Ask the holder for the original file, or contact the issuer."] };
    case "INVALID_SIGNATURE":
      return { title: STATE_META.INVALID_SIGNATURE.title, body: "This credential wasn't signed by the issuer's registered key.", meaning: ["Treat it as not genuine.", "Contact the issuer if you believe this is a mistake."] };
    case "ISSUER_UNAUTHORIZED":
      return { title: STATE_META.ISSUER_UNAUTHORIZED.title, body: "The credential names an issuer that didn't issue it, or one that isn't approved.", meaning: ["The organization shown on the credential can't be trusted for this record.", "Don't rely on it without confirming directly with the institution."] };
    case "REVOKED": {
      const reason = report.record ? REVOCATION_REASONS[report.record.revocationReason] : null;
      return { title: STATE_META.REVOKED.title, body: `${issuer} withdrew this credential${report.record ? ` on ${fmtDate(report.record.statusChangedAt)}` : ""}.`, meaning: [reason && reason !== "Unspecified" ? `Reason given: ${reason}.` : "No reason was given.", "It should no longer be relied on."] };
    }
    case "EXPIRED":
      return { title: STATE_META.EXPIRED.title, body: `This credential was genuine, but it expired${report.record ? ` on ${fmtDate(report.record.expiresAt)}` : ""}.`, meaning: ["The holder may have a renewed credential. Ask them for the current one."] };
    case "SUPERSEDED":
      return { title: STATE_META.SUPERSEDED.title, body: `${issuer} replaced this credential with a corrected version.`, meaning: ["Ask the holder for the current version, or follow the link below."] };
    case "NOT_FOUND":
      return { title: STATE_META.NOT_FOUND.title, body: "There's no credential with this ID.", meaning: ["Check the ID for typos.", "If it's correct, this credential was never recorded."] };
    case "WRONG_NETWORK":
      return { title: STATE_META.WRONG_NETWORK.title, body: "This credential was recorded on a different network.", meaning: [report.document?.mode === "demo" ? "It was created in demo mode. Switch to demo mode to check it." : "Switch to the network it was issued on and try again."] };
    case "TRANSACTION_PENDING":
      return { title: STATE_META.TRANSACTION_PENDING.title, body: "The issuer just submitted this credential and it isn't confirmed yet.", meaning: ["Check again in a minute."] };
    case "UNABLE_TO_VERIFY":
      if (report.record)
        return {
          title: "Record found, details not checked",
          body: `${issuer} issued a credential with this ID and it's still active.`,
          meaning: ["The registry only stores a fingerprint, so CredValid can't show you the name or details on its own.", "Add the credential file the holder gave you to confirm what it says."],
        };
      return { title: "Network unavailable", body: "We couldn't reach the registry to check this credential.", meaning: ["This is a connection problem, not a sign the credential is invalid.", "Try again in a moment."] };
    default:
      return { title: STATE_META[report.state].title, body: report.summary, meaning: [] };
  }
}

const TONE_ICON: Record<Tone, { icon: React.ElementType; wrap: string; ring: string }> = {
  good: { icon: ShieldCheck, wrap: "bg-success-soft text-success", ring: "border-[#abefc6]" },
  bad: { icon: ShieldX, wrap: "bg-danger-soft text-danger", ring: "border-[#fecdca]" },
  warn: { icon: AlertTriangle, wrap: "bg-warning-soft text-warning", ring: "border-[#fedf89]" },
  info: { icon: Clock, wrap: "bg-primary-soft text-primary", ring: "border-[#c7d7fe]" },
  neutral: { icon: AlertTriangle, wrap: "bg-subtle text-muted", ring: "border-line" },
};

const CHECK_ICON: Record<CheckResult, React.ReactNode> = {
  pass: <CheckCircle2 className="size-4 text-success" />,
  fail: <X className="size-4 text-danger" />,
  warn: <AlertTriangle className="size-4 text-warning" />,
  skip: <Minus className="size-4 text-faint" />,
};

export function VerificationResult({ report, onReset, onAddFile, linkBase }: { report: VerificationReport; onReset: () => void; onAddFile: () => void; linkBase: string }) {
  const copy = explain(report);
  const tone = report.state === "UNABLE_TO_VERIFY" && report.record ? "info" : STATE_META[report.state].tone;
  const T = TONE_ICON[tone];
  const doc = report.document;
  const rec = report.record;
  const tx = useTxs(report.mode).find((t) => t.credentialId?.toLowerCase() === report.credentialId && t.hash);
  const network = report.mode === "demo" ? "Simulated registry (demo)" : testnet.ok ? testnet.config.chain.name : "Testnet";
  const [showChecks, setShowChecks] = React.useState(false);

  return (
    <div className="space-y-4 fade-in" aria-live="polite">
      <section className={cn("card border p-6 sm:p-7", T.ring)}>
        <div className="flex items-start gap-4">
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", T.wrap)}>
            <T.icon className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[20px] font-semibold tracking-[-0.01em]">{copy.title}</h2>
              <SourceBadge mode={report.mode} />
            </div>
            <p className="mt-1 text-[14.5px] text-muted">{copy.body}</p>
          </div>
        </div>
        {report.state === "UNABLE_TO_VERIFY" && rec && (
          <Button variant="secondary" className="mt-5" onClick={onAddFile}>
            <FileJson /> Add credential file
          </Button>
        )}
      </section>

      {(doc || rec) && (
        <section className="card">
          <div className="border-b border-line px-6 py-4">
            <h3 className="text-[15px] font-semibold">Credential details</h3>
          </div>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 px-6 py-5 sm:grid-cols-2">
            {doc && <Detail label="Recipient" value={doc.payload.subject.name} />}
            {doc && <Detail label="Credential" value={doc.payload.title} />}
            <Detail label="Issuer" value={report.issuer?.name ?? doc?.payload.issuerName ?? "Unknown"} />
            {doc && <Detail label="Credential type" value={CREDENTIAL_TYPE_LABEL[doc.payload.type]} />}
            {doc ? <Detail label="Issue date" value={fmtIsoDate(doc.payload.issueDate)} /> : rec && <Detail label="Recorded" value={fmtDate(rec.issuedAt)} />}
            {rec && <Detail label="Expiry" value={rec.expiresAt ? fmtDate(rec.expiresAt) : "No expiry"} />}
            <Detail label="Verified at" value={new Date(report.checkedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} />
            <Detail label="Network" value={network} />
            {report.credentialId && (
              <div className="sm:col-span-2">
                <dt className="text-[12.5px] text-muted">Credential ID</dt>
                <dd className="mt-0.5">
                  <MonoValue value={report.credentialId} />
                </dd>
              </div>
            )}
            {tx && (
              <div className="sm:col-span-2">
                <dt className="text-[12.5px] text-muted">Transaction</dt>
                <dd className="mt-0.5">
                  <TxLink tx={tx} />
                </dd>
              </div>
            )}
            {rec?.supersededBy && (
              <div className="sm:col-span-2">
                <dt className="text-[12.5px] text-muted">Replaced by</dt>
                <dd className="mt-0.5">
                  <Link to={`${linkBase}/${rec.supersededBy}`} className="mono text-primary hover:underline">
                    {rec.supersededBy.slice(0, 18)}… → Verify the current version
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}

      <section className="rounded-xl bg-subtle/70 px-6 py-5">
        <h3 className="text-[14px] font-semibold">What this means</h3>
        <ul className="mt-2 space-y-1.5 text-[14px] text-muted">
          {copy.meaning.map((m) => (
            <li key={m} className="flex gap-2.5">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-faint" />
              {m}
            </li>
          ))}
        </ul>
        {report.notes.map((n) => (
          <p key={n} className="mt-3 text-[13.5px] text-warning">
            {n}
          </p>
        ))}
        {report.checks.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <button onClick={() => setShowChecks((s) => !s)} className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-fg" aria-expanded={showChecks}>
              {showChecks ? "Hide" : "Show"} checks performed <ChevronDown className={cn("size-4 transition-transform", showChecks && "rotate-180")} />
            </button>
            {showChecks && (
              <ul className="mt-3 space-y-2">
                {report.checks.map((c) => (
                  <li key={c.key} className="flex gap-2.5 text-[13.5px]">
                    <span className="mt-0.5">{CHECK_ICON[c.result]}</span>
                    <span>
                      <span className="font-medium text-fg">{c.label}.</span> <span className="text-muted">{c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <div className="flex justify-center pt-2">
        <Button variant="secondary" onClick={onReset}>
          <RotateCcw /> Verify another credential
        </Button>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[14.5px] font-medium">{value}</dd>
    </div>
  );
}

function VerificationProgress({ step, mode }: { step: number; mode: "demo" | "testnet" }) {
  return (
    <div className="card p-6 fade-in" role="status" aria-live="polite">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[15px] font-semibold">Verifying credential</p>
        <SourceBadge mode={mode} />
      </div>
      <ol className="space-y-3">
        {PROGRESS.map((label, i) => (
          <li key={label} className="flex items-center gap-3 text-[14px]">
            {i < step ? <CheckCircle2 className="size-5 text-success" /> : i === step ? <Loader2 className="size-5 animate-spin text-primary" /> : <CircleDashed className="size-5 text-line-strong" />}
            <span className={i <= step ? "text-fg" : "text-faint"}>{label}</span>
          </li>
        ))}
      </ol>
      {mode === "demo" && <p className="mt-4 text-[12.5px] text-muted">Simulation: these checks run against the demo registry in your browser, not a blockchain.</p>}
    </div>
  );
}

async function decodeQrImage(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data ?? null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const SAMPLE_LABEL = { VERIFIED: "Valid degree", HASH_MISMATCH: "Edited credential", REVOKED: "Revoked credential", EXPIRED: "Expired certificate" } as const;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The complete verify experience: input, progress, result. Shared by the public page and the dashboard. */
export function VerifyPanel({ initialId, verifierLabel, linkBase }: { initialId?: string; verifierLabel: string; linkBase: string }) {
  const mode = useMode();
  const registry = useRegistry();
  const [input, setInput] = React.useState(initialId ?? "");
  const [file, setFile] = React.useState<CredentialDocument | null>(null);
  const [error, setError] = React.useState("");
  const [camera, setCamera] = React.useState(false);
  const [phase, setPhase] = React.useState<"idle" | "running" | "done">("idle");
  const [step, setStep] = React.useState(0);
  const [report, setReport] = React.useState<VerificationReport | null>(null);
  const docInput = React.useRef<HTMLInputElement>(null);
  const qrInput = React.useRef<HTMLInputElement>(null);
  const textInput = React.useRef<HTMLInputElement>(null);
  const autoRan = React.useRef(false);

  const run = React.useCallback(
    async (raw: string, method: "qr" | "id" | "file", doc: CredentialDocument | null = file) => {
      if (!registry) return;
      const id = extractCredentialId(raw) ?? (doc ? (doc.payload.credentialId.toLowerCase() as Hex) : null);
      if (!id) {
        setError(raw.trim() ? "That doesn't look like a credential ID. IDs start with 0x and are 66 characters long." : "Enter a credential ID.");
        textInput.current?.focus();
        return;
      }
      setError("");
      setCamera(false);
      setPhase("running");
      setStep(0);
      const document = doc ?? registry.getDocument(id);
      const pending = verifyCredential({ credentialId: id, document, reader: registry });
      // Pace the visible steps so people can follow them; the result never waits on this alone.
      for (let i = 1; i <= PROGRESS.length; i++) {
        await wait(220);
        setStep(i);
      }
      const r = await pending;
      setReport(r);
      setPhase("done");
      recordHistory({ id: crypto.randomUUID(), mode, credentialId: id, state: r.state, verifier: verifierLabel, method: doc ? "file" : method, contentChecked: r.contentChecked, at: Math.floor(Date.now() / 1000) });
    },
    [registry, file, mode, verifierLabel],
  );

  React.useEffect(() => {
    if (initialId && !autoRan.current && registry) {
      autoRan.current = true;
      void run(initialId, "qr");
    }
  }, [initialId, registry, run]);

  async function onDoc(f: File | undefined) {
    if (!f) return;
    if (f.size > 200_000) return setError("That file is too large to be a credential file.");
    const parsed = parseDocument(await f.text());
    if (!parsed.ok) return setError(parsed.error);
    setFile(parsed.document);
    setInput(parsed.document.payload.credentialId);
    void run(parsed.document.payload.credentialId, "file", parsed.document);
  }
  async function onQrImage(f: File | undefined) {
    if (!f) return;
    const text = await decodeQrImage(f);
    if (!text) return setError("We couldn't find a QR code in that image. Try a sharper photo.");
    setInput(text);
    void run(text, "qr");
  }
  function reset() {
    setPhase("idle");
    setReport(null);
    setFile(null);
    setInput("");
    setError("");
    setTimeout(() => textInput.current?.focus(), 0);
  }

  if (mode === "testnet" && !testnet.ok) return <TestnetNotConfigured />;

  const samples = mode === "demo" ? (["VERIFIED", "HASH_MISMATCH", "REVOKED", "EXPIRED"] as const).map((s) => SEED_SAMPLES.find((x) => x.expected === s)!).filter(Boolean) : [];
  const hidden = (
    <>
      <input ref={qrInput} type="file" accept="image/*" className="hidden" onChange={(e) => { void onQrImage(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={docInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { void onDoc(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );

  if (phase === "running") return <VerificationProgress step={step} mode={mode} />;
  if (phase === "done" && report)
    return (
      <>
        {hidden}
        <VerificationResult report={report} onReset={reset} onAddFile={() => docInput.current?.click()} linkBase={linkBase} />
      </>
    );

  return (
    <div className="card p-5 sm:p-6">
      {hidden}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void run(input, "id");
        }}
      >
        <label htmlFor="credential-id" className="text-[13.5px] font-medium">
          Credential ID
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input
            ref={textInput}
            id="credential-id"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError("");
            }}
            placeholder="Enter credential ID"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "credential-id-error" : undefined}
            className="mono h-12 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-4 text-[14px] text-fg shadow-[0_1px_2px_rgb(16_24_40/0.04)] placeholder:font-sans placeholder:text-[15px] placeholder:text-faint focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/12 aria-[invalid=true]:border-danger"
          />
          <Button type="submit" size="lg" className="h-12 px-6">
            Verify credential
          </Button>
        </div>
        {error && (
          <p id="credential-id-error" role="alert" className="mt-2 text-[13.5px] text-danger">
            {error}
          </p>
        )}
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setCamera((c) => !c)} aria-expanded={camera}>
          <Camera /> {camera ? "Close camera" : "Scan QR code"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => qrInput.current?.click()}>
          <ImageUp /> Upload QR image
        </Button>
        <Button variant="secondary" size="sm" onClick={() => docInput.current?.click()}>
          <FileJson /> Use credential file
        </Button>
      </div>
      {camera && (
        <div className="mt-4">
          <QrScanner
            onResult={(text) => {
              setInput(text);
              void run(text, "qr");
            }}
          />
        </div>
      )}

      {samples.length > 0 && (
        <div className="mt-6 border-t border-line pt-5">
          <p className="text-[13px] text-muted">Try a sample credential</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {samples.map((s) => (
              <button
                key={s.credentialId}
                onClick={() => {
                  setInput(s.credentialId);
                  void run(s.credentialId, "id");
                }}
                className="rounded-full border border-line px-3 py-1.5 text-[13px] text-fg transition hover:border-line-strong hover:bg-subtle"
              >
                {SAMPLE_LABEL[s.expected as keyof typeof SAMPLE_LABEL]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Centered page frame for the verify screen. */
export function VerifyHeader() {
  return (
    <div className="mb-8 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
        <ShieldCheck className="size-6" />
      </span>
      <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.02em]">Verify a credential</h1>
      <p className="mx-auto mt-1.5 max-w-md text-[15px] text-muted">Confirm a credential's integrity and check its issuer and current status.</p>
    </div>
  );
}
