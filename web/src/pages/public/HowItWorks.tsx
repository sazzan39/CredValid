import * as React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function HowItWorks() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-[32px] font-semibold tracking-[-0.02em]">How verification works</h1>
      <p className="mt-2 text-[16px] text-muted">What CredValid checks, what it stores, and what a result does and doesn't prove.</p>

      <Section title="Issuing a credential">
        An approved institution enters the recipient's details. CredValid turns them into a standard format, computes a SHA-256 fingerprint, and the institution signs it with its registered key. The registry contract checks that signature before recording the fingerprint.
      </Section>

      <Section title="What's stored where">
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line p-4">
            <p className="font-medium text-fg">On the blockchain</p>
            <p className="mt-1">A random credential ID, the fingerprint, the issuer's account, timestamps and status.</p>
          </div>
          <div className="rounded-xl border border-line p-4">
            <p className="font-medium text-fg">With the recipient</p>
            <p className="mt-1">Name, email, title and dates, in a credential file they share when needed.</p>
          </div>
        </div>
      </Section>

      <Section title="What a verifier checks">
        <ul className="mt-2 space-y-1.5">
          {["The credential exists in the registry", "Its issuer is approved", "The details match the recorded fingerprint", "The signature belongs to the issuer's key", "It hasn't been revoked, replaced or expired"].map((t) => (
            <li key={t} className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              {t}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="What a result means">
        A verified result confirms who issued the credential and that it hasn't been altered. It doesn't independently confirm the facts the institution attested to, and approval of institutions is a decision made by the registry's administrators. Without the recipient's credential file, CredValid can confirm a record is live but can't show its details.
      </Section>

      <Section title="Demo and testnet">
        In demo mode, signatures and fingerprints are computed for real but the registry is simulated in your browser, and every result is labelled as simulated. Testnet mode uses a deployed contract on Polygon Amoy and your browser wallet.
      </Section>

      <div className="mt-12 flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/verify">Verify a credential</Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link to="/app">Open dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[18px] font-semibold">{title}</h2>
      <div className="mt-2 text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}
