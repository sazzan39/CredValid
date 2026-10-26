import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Ban, CheckCircle2, ChevronDown, Circle, Copy, Download, FilePen, Minus, ShieldCheck, XCircle } from "lucide-react";
import { isAddressEqual } from "viem";
import { useDemoState, useHistory, useMode, useRegistry, useTxs, useWallet } from "@/app/AppProvider";
import { useIssuers, useRecord } from "@/app/queries";
import { Button } from "@/components/ui/button";
import { CopyButton, CredentialStatusBadge, displayStatus, EmptyState, ErrorState, LoadingState, MonoValue, SourceBadge, VerificationBadge } from "@/components/app/primitives";
import { RevokeDialog } from "@/components/app/revoke";
import { TestnetNotConfigured } from "@/components/app/wallet";
import { QRCodeView } from "@/components/qr";
import { toast } from "@/components/ui/toast";
import { downloadDocument } from "@/crypto/document";
import { extractCredentialId } from "@/crypto/ids";
import { CREDENTIAL_TYPE_LABEL, REVOCATION_REASONS } from "@/domain/types";
import { verifyCredential } from "@/verify/engine";
import { explorerTx, testnet, verificationUrl } from "@/lib/config";
import { copyText, cn, fmtDate, fmtDateTime, fmtIsoDate } from "@/lib/utils";

export function CredentialDetail() {
  const params = useParams();
  const id = extractCredentialId(params.id ?? "");
  const mode = useMode();
  const registry = useRegistry();
  const demo = useDemoState();
  const wallet = useWallet();
  const record = useRecord(id);
  const issuers = useIssuers();
  const history = useHistory().filter((h) => h.credentialId === id);
  const tx = useTxs().find((t) => t.credentialId?.toLowerCase() === id && (t.kind === "issue" || t.kind === "supersede") && t.hash);
  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const [techOpen, setTechOpen] = React.useState(false);

  const doc = id && registry ? registry.getDocument(id) : null;
  const check = useQuery({
    queryKey: ["registry", mode, "check", id, record.data?.status, Boolean(doc)],
    queryFn: () => verifyCredential({ credentialId: id, document: doc, reader: registry! }),
    enabled: Boolean(id && registry && record.data),
  });

  if (mode === "testnet" && !testnet.ok) return <TestnetNotConfigured />;
  if (!id || !registry) return <div className="card"><EmptyState title="This isn't a valid credential link" action={<Button variant="secondary" asChild><Link to="/app/credentials">Back to credentials</Link></Button>} /></div>;
  if (record.isLoading) return <div className="card"><LoadingState label="Loading credential…" /></div>;
  if (record.error) return <div className="card"><ErrorState retry={() => void record.refetch()} /></div>;

  const rec = record.data ?? null;
  const pending = registry.hasPendingIssuance(id);
  if (!rec && !pending)
    return (
      <div className="card">
        <EmptyState title="No credential with this ID" body="It may belong to the other mode, or the ID is wrong." action={<Button variant="secondary" asChild><Link to="/app/credentials">Back to credentials</Link></Button>} />
      </div>
    );

  const issuer = rec ? (issuers.data ?? []).find((i) => isAddressEqual(i.address, rec.issuer)) : null;
  const url = verificationUrl(id);
  const actor = mode === "demo" ? demo.actingIssuer : wallet.account;
  const isIssuer = Boolean(rec && actor && isAddressEqual(rec.issuer, actor));
  const canRevoke = rec?.status === "active" && (mode === "demo" || wallet.status === "connected");
  const canCorrect = rec?.status === "active" && isIssuer && issuer?.status === "active";
  const status = rec ? displayStatus(rec.status, rec.expiresAt) : "pending";
  const report = check.data;
  const sig = report?.checks.find((c) => c.key === "signature");
  const hash = report?.checks.find((c) => c.key === "hash");
  const explorer = tx?.hash ? explorerTx(tx.hash) : null;
  const name = doc?.payload.subject.name ?? "Credential";

  const timeline = [
    rec && { label: mode === "demo" ? "Issued (simulated)" : "Issued on chain", at: rec.issuedAt, tone: "good" as const },
    rec?.status === "superseded" && { label: "Replaced by a corrected credential", at: rec.statusChangedAt, tone: "warn" as const },
    rec?.status === "revoked" && { label: `Revoked · ${REVOCATION_REASONS[rec.revocationReason] ?? "Unspecified"}`, at: rec.statusChangedAt, tone: "bad" as const },
    status === "expired" && rec && { label: "Expired", at: rec.expiresAt, tone: "warn" as const },
  ].filter(Boolean) as { label: string; at: number; tone: "good" | "warn" | "bad" }[];

  return (
    <>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">{name}</h1>
            <CredentialStatusBadge status={status} />
            <SourceBadge mode={mode} />
          </div>
          <p className="mt-1 text-[14.5px] text-muted">{doc ? `${doc.payload.title} · ${issuer?.name ?? doc.payload.issuerName}` : "Recipient details are held off-chain in the credential file."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              const ok = await copyText(url);
              toast(ok ? "Verification link copied" : "Couldn't copy the link", { tone: ok ? "success" : "error" });
            }}
          >
            <Copy /> Copy verification link
          </Button>
          {doc && (
            <Button variant="secondary" onClick={() => downloadDocument(doc)}>
              <Download /> Download credential
            </Button>
          )}
          {explorer && (
            <Button variant="secondary" asChild>
              <a href={explorer} target="_blank" rel="noreferrer">
                View transaction <ArrowUpRight />
              </a>
            </Button>
          )}
          {canCorrect && (
            <Button variant="secondary" asChild>
              <Link to={`/app/issue?supersede=${id}`}>
                <FilePen /> Issue correction
              </Link>
            </Button>
          )}
          {canRevoke && (
            <Button variant="danger-outline" onClick={() => setRevokeOpen(true)}>
              <Ban /> Revoke
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <section className="card">
            <header className="border-b border-line px-6 py-4">
              <h2 className="text-[15px] font-semibold">Credential</h2>
            </header>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 px-6 py-5 sm:grid-cols-2">
              <Item label="Candidate" value={doc?.payload.subject.name ?? "Held off-chain"} />
              <Item label="Credential type" value={doc ? CREDENTIAL_TYPE_LABEL[doc.payload.type] : "—"} />
              <Item label="Degree or job title" value={doc?.payload.title ?? "—"} />
              <Item label="Issuer" value={issuer?.name ?? doc?.payload.issuerName ?? "—"} />
              <Item label="Issue date" value={doc ? fmtIsoDate(doc.payload.issueDate) : fmtDate(rec?.issuedAt)} />
              <Item label="Expiry date" value={rec?.expiresAt ? fmtDate(rec.expiresAt) : "No expiry"} />
              <div className="sm:col-span-2">
                <dt className="text-[12.5px] text-muted">Credential ID</dt>
                <dd className="mt-0.5">
                  <MonoValue value={id} />
                </dd>
              </div>
            </dl>
          </section>

          <section className="card">
            <header className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-[15px] font-semibold">Verification status</h2>
              {report && <VerificationBadge state={report.state} />}
            </header>
            <ul className="divide-y divide-line">
              <StatusRow
                label="Signature"
                state={!sig ? "loading" : sig.result === "pass" ? "pass" : sig.result === "skip" ? "na" : "fail"}
                detail={!sig ? "Checking…" : sig.result === "pass" ? "Signed by the issuer's registered key" : sig.result === "skip" ? "Needs the credential file" : "Not signed by the issuer's key"}
              />
              <StatusRow
                label="Data integrity"
                state={!hash ? "loading" : hash.result === "pass" ? "pass" : hash.result === "skip" ? "na" : "fail"}
                detail={!hash ? "Checking…" : hash.result === "pass" ? "Details match the recorded fingerprint" : hash.result === "skip" ? "Needs the credential file" : "Details don't match the recorded fingerprint"}
              />
              <StatusRow
                label="On-chain commitment"
                state={rec ? "pass" : "loading"}
                detail={rec ? (mode === "demo" ? "Recorded in the simulated registry" : `Recorded on ${testnet.ok ? testnet.config.chain.name : "testnet"}`) : "Waiting for confirmation"}
              />
              <StatusRow label="Issuer" state={issuer?.status === "active" ? "pass" : issuer ? "warn" : "loading"} detail={issuer ? (issuer.status === "active" ? `${issuer.name} is approved` : `${issuer.name} is currently suspended`) : "Checking…"} />
            </ul>
          </section>

          <section className="card">
            <header className="border-b border-line px-6 py-4">
              <h2 className="text-[15px] font-semibold">History</h2>
            </header>
            <ol className="space-y-4 px-6 py-5">
              {timeline.map((t) => (
                <li key={t.label} className="flex items-start gap-3">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", t.tone === "good" ? "bg-success" : t.tone === "bad" ? "bg-danger" : "bg-warning")} />
                  <div>
                    <p className="text-[14px] font-medium">{t.label}</p>
                    <p className="text-[13px] text-muted">{fmtDateTime(t.at)}</p>
                  </div>
                </li>
              ))}
              <li className="flex items-start gap-3">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-line-strong" />
                <div>
                  <p className="text-[14px] font-medium">
                    Verified {history.length} {history.length === 1 ? "time" : "times"}
                  </p>
                  <p className="text-[13px] text-muted">{history[0] ? `Last checked ${fmtDateTime(history[0].at)} by ${history[0].verifier}` : "Not checked yet"}</p>
                </div>
              </li>
            </ol>
          </section>

          <section className="card">
            <button onClick={() => setTechOpen((o) => !o)} aria-expanded={techOpen} className="flex w-full items-center justify-between px-6 py-4 text-left">
              <span>
                <span className="block text-[15px] font-semibold">Technical details</span>
                <span className="block text-[13px] text-muted">Hashes, keys and registry data for technical review</span>
              </span>
              <ChevronDown className={cn("size-5 text-faint transition-transform", techOpen && "rotate-180")} />
            </button>
            {techOpen && (
              <div className="border-t border-line px-6 py-5 fade-in">
                <p className="section-label mb-3">Public record</p>
                <dl className="space-y-3">
                  <Tech label="Commitment (SHA-256)">{rec ? <MonoValue value={rec.payloadHash} /> : "—"}</Tech>
                  <Tech label="Registry">{mode === "demo" ? "Simulated registry (demo)" : testnet.ok ? <MonoValue value={testnet.config.contract} /> : "—"}</Tech>
                  <Tech label="Transaction">
                    {tx?.hash ? (
                      explorer ? (
                        <a href={explorer} target="_blank" rel="noreferrer" className="mono inline-flex items-center gap-1 text-primary hover:underline">
                          {tx.hash.slice(0, 14)}…{tx.hash.slice(-8)} <ArrowUpRight className="size-3.5" />
                        </a>
                      ) : (
                        <MonoValue value={tx.hash} />
                      )
                    ) : (
                      <span className="text-muted">{mode === "demo" ? "None — simulated issuance" : "Not available in this browser"}</span>
                    )}
                  </Tech>
                  {rec?.supersededBy && (
                    <Tech label="Replaced by">
                      <Link className="mono text-primary hover:underline" to={`/app/credentials/${rec.supersededBy}`}>
                        {rec.supersededBy.slice(0, 18)}…
                      </Link>
                    </Tech>
                  )}
                </dl>
                <p className="section-label mb-3 mt-6">Administrative</p>
                <dl className="space-y-3">
                  <Tech label="Issuer account">{rec ? <MonoValue value={rec.issuer} /> : "—"}</Tech>
                  <Tech label="Signing key">{rec ? <MonoValue value={rec.signer} /> : "—"}</Tech>
                  <Tech label="Recipient email">{doc?.payload.subject.email ?? <span className="text-muted">Not provided</span>}</Tech>
                  {rec?.status === "revoked" && <Tech label="Revocation reason code">{`${rec.revocationReason} · ${REVOCATION_REASONS[rec.revocationReason] ?? "Unspecified"}`}</Tech>}
                </dl>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="card p-5 text-center">
            <p className="text-[14px] font-medium">Share for verification</p>
            <div className="mx-auto mt-4 w-fit rounded-xl border border-line p-3">
              <QRCodeView value={url} size={168} />
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-subtle/60 px-3 py-2">
              <span className="mono min-w-0 flex-1 truncate text-left text-muted">{url}</span>
              <CopyButton value={url} label="Copy verification link" toastLabel="Verification link copied" />
            </div>
            <p className="mt-2 text-[12.5px] text-muted">The QR code contains only the credential ID.</p>
          </div>
          <Button variant="secondary" className="w-full" asChild>
            <Link to={`/app/verify/${id}`}>
              <ShieldCheck /> Run a verification
            </Link>
          </Button>
        </aside>
      </div>

      {rec && <RevokeDialog id={rec.credentialId} name={doc?.payload.subject.name} open={revokeOpen} onOpenChange={setRevokeOpen} />}
    </>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-[14.5px] font-medium">{value}</dd>
    </div>
  );
}

function Tech({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0 text-[13.5px]">{children}</dd>
    </div>
  );
}

function StatusRow({ label, state, detail }: { label: string; state: "pass" | "fail" | "warn" | "na" | "loading"; detail: string }) {
  const icon = {
    pass: <CheckCircle2 className="size-5 text-success" />,
    fail: <XCircle className="size-5 text-danger" />,
    warn: <Circle className="size-5 text-warning" />,
    na: <Minus className="size-5 text-faint" />,
    loading: <Circle className="size-5 text-line-strong" />,
  }[state];
  return (
    <li className="flex items-center gap-3 px-6 py-3.5">
      {icon}
      <span className="w-40 shrink-0 text-[14px] font-medium">{label}</span>
      <span className="min-w-0 text-[13.5px] text-muted">{detail}</span>
    </li>
  );
}
