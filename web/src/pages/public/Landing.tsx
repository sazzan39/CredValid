import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, EyeOff, FilePlus2, Fingerprint, ListChecks, ScanLine, ShieldCheck } from "lucide-react";
import { demoService } from "@/demo/store";
import { SEED_SAMPLES } from "@/demo/seed.generated";
import { verifyCredential, type VerificationReport } from "@/verify/engine";
import { CREDENTIAL_TYPE_LABEL } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { fmtIsoDate } from "@/lib/utils";

/** A real verification of a seeded demo credential, rendered as the product preview. */
function ProductPreview() {
  const [report, setReport] = React.useState<VerificationReport | null>(null);
  React.useEffect(() => {
    const s = SEED_SAMPLES.find((x) => x.expected === "VERIFIED")!;
    void verifyCredential({ credentialId: s.credentialId, document: demoService.getDocument(s.credentialId), reader: demoService }).then(setReport);
  }, []);
  const doc = report?.document;
  return (
    <div className="card overflow-hidden shadow-[var(--shadow-pop)]">
      <div className="flex items-center gap-3 border-b border-line bg-success-soft/60 px-5 py-4">
        <span className="grid size-9 place-items-center rounded-full bg-success-soft text-success ring-1 ring-[#abefc6]">
          <ShieldCheck className="size-5" />
        </span>
        <div>
          <p className="text-[15px] font-semibold">{report?.state === "VERIFIED" ? "Credential verified" : "Verifying…"}</p>
          <p className="text-[12.5px] text-muted">Issued by {report?.issuer?.name ?? "…"} and unchanged since</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5 px-5 py-5 text-[13.5px]">
        <Item label="Recipient" value={doc?.payload.subject.name} />
        <Item label="Credential" value={doc ? CREDENTIAL_TYPE_LABEL[doc.payload.type] : undefined} />
        <Item label="Title" value={doc?.payload.title} wide />
        <Item label="Issue date" value={doc ? fmtIsoDate(doc.payload.issueDate) : undefined} />
        <Item label="Status" value={report ? "Active" : undefined} />
      </dl>
      <ul className="space-y-2 border-t border-line px-5 py-4 text-[13px]">
        {["Issuer is approved", "Signature matches the issuer's key", "Details match the recorded fingerprint", "Not revoked or expired"].map((c) => (
          <li key={c} className="flex items-center gap-2 text-muted">
            <CheckCircle2 className="size-4 text-success" /> {c}
          </li>
        ))}
      </ul>
      <p className="border-t border-line bg-subtle/60 px-5 py-2.5 text-[12px] text-muted">Live result from the demo registry</p>
    </div>
  );
}

function Item({ label, value, wide }: { label: string; value?: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{value ?? <span className="inline-block h-4 w-24 animate-pulse rounded bg-subtle" />}</dd>
    </div>
  );
}

export function Landing() {
  return (
    <>
      <section className="border-b border-line bg-bg">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-muted">
              <span className="size-1.5 rounded-full bg-success" /> For universities, employers and recruiters
            </span>
            <h1 className="mt-6 text-[clamp(2.25rem,5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.03em]">Verify a degree or employment record in seconds.</h1>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-muted">
              Institutions issue tamper-proof digital credentials. Recruiters check them with an ID or QR code — no account, no blockchain knowledge needed.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to="/verify">
                  Verify a credential <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="secondary" asChild>
                <Link to="/app">Open dashboard</Link>
              </Button>
            </div>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-[26px] font-semibold tracking-[-0.02em]">How it works</h2>
        <p className="mt-2 max-w-xl text-[15px] text-muted">Three steps from the registrar's office to a recruiter's screen.</p>
        <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3">
          {[
            { icon: FilePlus2, title: "Issue", body: "An approved institution enters the credential and signs it with its registered key." },
            { icon: Fingerprint, title: "Record", body: "A cryptographic fingerprint is recorded on the blockchain. Personal details stay off it." },
            { icon: ScanLine, title: "Verify", body: "Anyone checks the issuer, the signature, and whether it's been revoked or expired." },
          ].map((s, i) => (
            <div key={s.title}>
              <span className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary">
                <s.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-[17px] font-semibold">
                <span className="mr-1.5 text-faint">{i + 1}.</span>
                {s.title}
              </h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-bg">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-16 sm:px-6 md:grid-cols-3">
          {[
            { icon: EyeOff, title: "Private by design", body: "Names, grades and emails never touch the public ledger." },
            { icon: ListChecks, title: "Every result explained", body: "Each verification says exactly what was checked, in plain English." },
            { icon: ShieldCheck, title: "Only approved issuers", body: "Credentials count only if they come from an institution in the issuer registry." },
          ].map((p) => (
            <div key={p.title} className="flex gap-4">
              <p.icon className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <h3 className="text-[15px] font-semibold">{p.title}</h3>
                <p className="mt-1 text-[14px] text-muted">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-[26px] font-semibold tracking-[-0.02em]">Have a credential to check?</h2>
        <p className="mt-2 text-[15px] text-muted">Enter its ID or scan its QR code. It takes a few seconds.</p>
        <Button size="lg" className="mt-6" asChild>
          <Link to="/verify">
            Verify a credential <ArrowRight />
          </Link>
        </Button>
      </section>
    </>
  );
}
