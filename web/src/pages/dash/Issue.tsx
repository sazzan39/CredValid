import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CheckCircle2, Download, Eye, FileLock2, Globe, Info, ShieldCheck } from "lucide-react";
import { isAddressEqual, type Hex } from "viem";
import { useDemoState, useMode, useRegistry, useWallet } from "@/app/AppProvider";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { CopyButton, PageHeader, SourceBadge } from "@/components/app/primitives";
import { RequireWallet, TransactionStatus, type TransactionStage } from "@/components/app/wallet";
import { QRCodeView } from "@/components/qr";
import { downloadDocument } from "@/crypto/document";
import { CREDENTIAL_TYPE_LABEL, CREDENTIAL_TYPES, type IssuerRecord } from "@/domain/types";
import { UserRejectedError, type IssueInput, type IssueResult, type IssueStep } from "@/registry/service";
import { verificationUrl } from "@/lib/config";
import { cn, fmtIsoDate, todayIso } from "@/lib/utils";

const schema = z
  .object({
    candidateName: z.string().trim().min(2, "Enter the recipient's full name.").max(120, "Use 120 characters or fewer."),
    candidateEmail: z.union([z.literal(""), z.string().trim().email("Enter a valid email address, or leave it blank.")]),
    type: z.enum(CREDENTIAL_TYPES),
    title: z.string().trim().min(2, "Enter the degree or job title.").max(160, "Use 160 characters or fewer."),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an issue date."),
    expiryDate: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.issueDate > todayIso()) ctx.addIssue({ code: "custom", path: ["issueDate"], message: "The issue date can't be in the future." });
    if (v.expiryDate) {
      if (v.expiryDate <= v.issueDate) ctx.addIssue({ code: "custom", path: ["expiryDate"], message: "The expiry date must be after the issue date." });
      else if (v.expiryDate < todayIso()) ctx.addIssue({ code: "custom", path: ["expiryDate"], message: "The expiry date must be in the future." });
    }
  });
type FormValues = z.infer<typeof schema>;
const DEFAULTS: FormValues = { candidateName: "", candidateEmail: "", type: "degree", title: "", issueDate: todayIso(), expiryDate: "" };

function useIssuerIdentity(): { issuer: IssuerRecord | null; loading: boolean; problem: string | null } {
  const mode = useMode();
  const demo = useDemoState();
  const wallet = useWallet();
  const registry = useRegistry();
  const q = useQuery({
    queryKey: ["registry", "testnet", "issuer", wallet.account],
    queryFn: () => registry!.getIssuer(wallet.account!),
    enabled: mode === "testnet" && Boolean(registry && wallet.account),
  });
  if (mode === "demo") {
    const issuer = demo.issuers.find((i) => i.address === demo.actingIssuer) ?? null;
    return { issuer, loading: false, problem: issuer?.status === "suspended" ? `${issuer.name} is suspended and can't issue credentials. Choose another issuer from the account menu.` : null };
  }
  if (q.isLoading) return { issuer: null, loading: true, problem: null };
  if (q.error) return { issuer: null, loading: false, problem: "We couldn't reach the registry to confirm your issuer status. Try again in a moment." };
  const issuer = q.data ?? null;
  if (!issuer) return { issuer, loading: false, problem: "This wallet isn't an approved issuer. Ask a registry administrator to add it on the Issuers page." };
  if (issuer.status === "suspended") return { issuer, loading: false, problem: `${issuer.name} is suspended and can't issue credentials.` };
  if (!wallet.accounts.some((a) => isAddressEqual(a, issuer.signer)))
    return { issuer, loading: false, problem: `Your registered signing key (${issuer.signer.slice(0, 10)}…) isn't connected. Connect it in your wallet as well.` };
  return { issuer, loading: false, problem: null };
}

function toStage(step: IssueStep["step"] | null, failed: boolean): TransactionStage {
  if (failed) return "failed";
  if (step === "confirmed") return "confirmed";
  if (step === "submitting" || step === "pending") return "submitted";
  return "awaiting";
}

const STEPS = ["Recipient details", "Credential details", "Review and issue"];

function Stepper({ current }: { current: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2 text-[13px]" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s} className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
              i < current ? "bg-primary text-white" : i === current ? "bg-primary-soft text-primary ring-1 ring-inset ring-primary" : "bg-subtle text-faint",
            )}
            aria-current={i === current ? "step" : undefined}
          >
            {i < current ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className={cn("hidden truncate sm:block", i <= current ? "font-medium text-fg" : "text-muted")}>{s}</span>
          {i < STEPS.length - 1 && <span className="h-px flex-1 bg-line" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

export function Issue() {
  return (
    <div className="mx-auto max-w-[760px]">
      <RequireWallet action="issue credentials">
        <IssueFlow />
      </RequireWallet>
    </div>
  );
}

function IssueFlow() {
  const mode = useMode();
  const registry = useRegistry()!;
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const supersedeId = params.get("supersede") as Hex | null;
  const previous = supersedeId ? registry.getDocument(supersedeId) : null;
  const { issuer, loading, problem } = useIssuerIdentity();

  const [stage, setStage] = React.useState<"form" | "review" | "running" | "done">("form");
  const [values, setValues] = React.useState<FormValues | null>(null);
  const [step, setStep] = React.useState<IssueStep["step"] | null>(null);
  const [txId, setTxId] = React.useState<string | undefined>();
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<IssueResult | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: previous
      ? {
          candidateName: previous.payload.subject.name,
          candidateEmail: previous.payload.subject.email ?? "",
          type: previous.payload.type,
          title: previous.payload.title,
          issueDate: previous.payload.issueDate,
          expiryDate: previous.payload.expiryDate ?? "",
        }
      : DEFAULTS,
    mode: "onTouched",
  });
  const e = form.formState.errors;
  const nameReady = (form.watch("candidateName") ?? "").trim().length >= 2;

  async function issue(v: FormValues) {
    setStage("running");
    setError(null);
    setStep(null);
    setTxId(undefined);
    const input: IssueInput = {
      candidateName: v.candidateName,
      candidateEmail: v.candidateEmail || undefined,
      type: v.type,
      title: v.title,
      issuerName: issuer?.name ?? "",
      issueDate: v.issueDate,
      expiryDate: v.expiryDate || null,
    };
    const onStep = (s: IssueStep) => {
      setStep(s.step);
      if (s.step === "pending" || s.step === "confirmed") setTxId(s.txId);
    };
    try {
      const r = supersedeId ? await registry.supersede(supersedeId, input, onStep) : await registry.issue(input, onStep);
      await qc.invalidateQueries({ queryKey: ["registry", mode] });
      setResult(r);
      setStage("done");
      toast(supersedeId ? "Corrected credential issued" : "Credential issued", { body: mode === "demo" ? "Recorded in the simulated registry." : "Confirmed on chain." });
    } catch (err) {
      setError(err instanceof UserRejectedError ? "You cancelled the request in your wallet. Nothing was recorded." : err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (stage === "done" && result)
    return (
      <Issued
        result={result}
        onAnother={() => {
          form.reset(DEFAULTS);
          setResult(null);
          setStage("form");
        }}
      />
    );

  const title = supersedeId ? "Issue a corrected credential" : "Issue a credential";

  return (
    <>
      <PageHeader title={title} meta={<SourceBadge mode={mode} />} description="Create a verifiable digital record for a candidate." />
      {supersedeId && (
        <div className="mb-6 flex gap-3 rounded-xl border border-[#fedf89] bg-warning-soft px-4 py-3 text-[14px] text-warning">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>This replaces credential <span className="mono">{supersedeId.slice(0, 12)}…</span>. The original will be marked as replaced and point verifiers here.</span>
        </div>
      )}

      {stage === "form" && (
        <form
          noValidate
          onSubmit={form.handleSubmit((v) => {
            setValues(v);
            setStage("review");
            window.scrollTo?.(0, 0);
          })}
        >
          <Stepper current={nameReady ? 1 : 0} />
          <div className="card divide-y divide-line">
            <section className="p-6">
              <h2 className="text-[16px] font-semibold">1. Recipient details</h2>
              <p className="mt-0.5 text-[13.5px] text-muted">Who the credential is for. This stays off-chain.</p>
              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label="Full name" htmlFor="candidateName" error={e.candidateName?.message}>
                  <Input id="candidateName" autoComplete="off" aria-invalid={Boolean(e.candidateName)} {...form.register("candidateName")} />
                </Field>
                <Field label="Email address" optional htmlFor="candidateEmail" error={e.candidateEmail?.message} hint="Included in the credential file only.">
                  <Input id="candidateEmail" type="email" autoComplete="off" aria-invalid={Boolean(e.candidateEmail)} {...form.register("candidateEmail")} />
                </Field>
              </div>
            </section>

            <section className="p-6">
              <h2 className="text-[16px] font-semibold">2. Credential details</h2>
              <p className="mt-0.5 text-[13.5px] text-muted">What's being certified, and by whom.</p>
              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label="Credential type" htmlFor="type">
                  <Select id="type" {...form.register("type")}>
                    {CREDENTIAL_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {CREDENTIAL_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Institution or employer" htmlFor="issuerName" hint="Set by your approved issuer record.">
                  <Input id="issuerName" readOnly value={loading ? "Loading…" : (issuer?.name ?? "—")} />
                </Field>
                <Field label="Degree or job title" htmlFor="title" error={e.title?.message} className="sm:col-span-2">
                  <Input id="title" autoComplete="off" placeholder="e.g. MSc Data Science, Distinction" aria-invalid={Boolean(e.title)} {...form.register("title")} />
                </Field>
                <Field label="Issue date" htmlFor="issueDate" error={e.issueDate?.message}>
                  <Input id="issueDate" type="date" max={todayIso()} aria-invalid={Boolean(e.issueDate)} {...form.register("issueDate")} />
                </Field>
                <Field label="Expiry date" optional htmlFor="expiryDate" error={e.expiryDate?.message} hint="Leave blank if it doesn't expire.">
                  <Input id="expiryDate" type="date" min={todayIso()} aria-invalid={Boolean(e.expiryDate)} {...form.register("expiryDate")} />
                </Field>
              </div>
            </section>

            <div className="flex flex-col-reverse gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
              {problem ? <p className="text-[13.5px] text-danger" role="alert">{problem}</p> : <span className="text-[13px] text-muted">Next: review before anything is recorded.</span>}
              <Button type="submit" disabled={Boolean(problem) || loading}>
                Review credential
              </Button>
            </div>
          </div>
        </form>
      )}

      {stage === "review" && values && (
        <>
          <Stepper current={2} />
          <div className="card divide-y divide-line">
            <section className="p-6">
              <h2 className="text-[16px] font-semibold">3. Review and issue</h2>
              <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                <Summary label="Recipient" value={values.candidateName} />
                <Summary label="Email" value={values.candidateEmail || "Not provided"} />
                <Summary label="Credential type" value={CREDENTIAL_TYPE_LABEL[values.type]} />
                <Summary label="Institution or employer" value={issuer?.name ?? "—"} />
                <Summary label="Degree or job title" value={values.title} wide />
                <Summary label="Issue date" value={fmtIsoDate(values.issueDate)} />
                <Summary label="Expiry date" value={values.expiryDate ? fmtIsoDate(values.expiryDate) : "No expiry"} />
              </dl>
            </section>
            <section className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
              <div className="rounded-lg bg-subtle/70 p-4">
                <p className="flex items-center gap-2 text-[14px] font-medium">
                  <Globe className="size-4 text-primary" /> Recorded {mode === "demo" ? "in the simulated registry" : "on-chain"}
                </p>
                <ul className="mt-2 space-y-1 text-[13.5px] text-muted">
                  <li>A random credential ID</li>
                  <li>A cryptographic commitment (SHA-256 fingerprint)</li>
                  <li>Your issuer account and expiry date</li>
                </ul>
              </div>
              <div className="rounded-lg bg-subtle/70 p-4">
                <p className="flex items-center gap-2 text-[14px] font-medium">
                  <FileLock2 className="size-4 text-success" /> Kept off-chain
                </p>
                <ul className="mt-2 space-y-1 text-[13.5px] text-muted">
                  <li>Name, email and title</li>
                  <li>Stored only in the credential file you give the recipient</li>
                </ul>
              </div>
              <p className="flex gap-2 text-[13.5px] text-muted sm:col-span-2">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                {mode === "demo"
                  ? "Demo mode: the credential is signed with a temporary key in your browser and recorded in a simulated registry. No blockchain transaction takes place."
                  : "Your wallet will ask for two approvals: a signature that endorses the credential (free), then a transaction that records the commitment (a small testnet fee)."}
              </p>
            </section>
            <div className="flex flex-col-reverse gap-3 p-6 sm:flex-row sm:justify-between">
              <Button variant="secondary" onClick={() => setStage("form")}>
                <ArrowLeft /> Edit details
              </Button>
              <Button onClick={() => void issue(values)}>{mode === "demo" ? "Issue credential (simulated)" : "Sign and issue credential"}</Button>
            </div>
          </div>
        </>
      )}

      {stage === "running" && (
        <div className="card p-6">
          <h2 className="text-[16px] font-semibold">{mode === "demo" ? "Issuing credential (simulated)" : "Issuing credential"}</h2>
          <p className="mt-0.5 text-[13.5px] text-muted">{values?.candidateName} · {values?.title}</p>
          <div className="mt-5">
            <TransactionStatus stage={toStage(step, Boolean(error))} mode={mode} txId={txId} error={error ?? undefined} />
          </div>
          {error && (
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button variant="secondary" onClick={() => setStage("review")}>
                <ArrowLeft /> Back to review
              </Button>
              <Button onClick={() => values && void issue(values)}>Try again</Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Summary({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[14.5px] font-medium">{value}</dd>
    </div>
  );
}

function Issued({ result, onAnother }: { result: IssueResult; onAnother: () => void }) {
  const mode = useMode();
  const url = verificationUrl(result.credentialId);
  const p = result.document.payload;
  return (
    <div className="card overflow-hidden fade-in">
      <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="size-6" />
        </span>
        <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.02em]">Credential issued</h1>
        <p className="mt-1 text-[14.5px] text-muted">
          {p.subject.name} · {p.title}
        </p>
        <div className="mt-2">
          <SourceBadge mode={mode} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 border-t border-line p-6 sm:grid-cols-[auto_1fr]">
        <div className="mx-auto rounded-xl border border-line p-3">
          <QRCodeView value={url} size={148} />
        </div>
        <div className="min-w-0 space-y-4">
          <div>
            <p className="text-[13.5px] font-medium">Verification link</p>
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-line bg-subtle/60 px-3 py-2">
              <span className="mono min-w-0 flex-1 truncate text-muted">{url}</span>
              <CopyButton value={url} label="Copy verification link" toastLabel="Verification link copied" />
            </div>
            <p className="mt-1.5 text-[12.5px] text-muted">Contains only the credential ID — no personal data.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to={`/app/credentials/${result.credentialId}`}>
                <Eye /> View credential
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link to={`/app/verify/${result.credentialId}`}>
                <ShieldCheck /> Verify it
              </Link>
            </Button>
            <Button variant="secondary" onClick={() => downloadDocument(result.document)}>
              <Download /> Download credential
            </Button>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-subtle/50 px-6 py-4">
        <p className="text-[13px] text-muted">Send the recipient their credential file. Verifiers need it to confirm the details.</p>
        <Button variant="ghost" size="sm" onClick={onAnother}>
          Issue another
        </Button>
      </div>
    </div>
  );
}
