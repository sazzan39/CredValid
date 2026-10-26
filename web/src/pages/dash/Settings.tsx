import * as React from "react";
import { setMode, testnetHistory, useMode, useWallet } from "@/app/AppProvider";
import { resetDemo } from "@/demo/store";
import { clearTxs } from "@/app/txStore";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { MonoValue, PageHeader, StatusBadge } from "@/components/app/primitives";
import { testnet } from "@/lib/config";
import { cn } from "@/lib/utils";

export function Settings() {
  const mode = useMode();
  const wallet = useWallet();
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Choose how CredValid runs and manage the data kept in this browser." />

      <Section title="Mode" description="Demo mode works instantly with simulated data. Testnet mode reads and writes the deployed contract.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["demo", "testnet"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn("rounded-xl border p-4 text-left transition", mode === m ? "border-primary bg-primary-soft/60 ring-1 ring-primary" : "border-line hover:border-line-strong")}
            >
              <span className="flex items-center justify-between">
                <span className="text-[14.5px] font-medium">{m === "demo" ? "Demo mode" : "Testnet mode"}</span>
                {mode === m && <StatusBadge tone="info">Current</StatusBadge>}
              </span>
              <span className="mt-1 block text-[13px] text-muted">
                {m === "demo" ? "Real signatures, simulated registry. No wallet needed." : testnet.ok ? `Uses ${testnet.config.chain.name} and your wallet.` : "Needs a deployed contract address."}
              </span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Network" description="Read from the app's environment configuration. Nothing here is secret.">
        <dl className="divide-y divide-line rounded-xl border border-line">
          <Row label="Status">{testnet.ok ? <StatusBadge tone="good">Configured</StatusBadge> : <StatusBadge tone="warn">Not configured</StatusBadge>}</Row>
          {testnet.ok ? (
            <>
              <Row label="Network">{testnet.config.chain.name} (chain {testnet.config.chainId})</Row>
              <Row label="Registry contract"><MonoValue value={testnet.config.contract} short /></Row>
              <Row label="RPC endpoint"><span className="mono text-muted break-all">{testnet.config.rpcUrl}</span></Row>
            </>
          ) : (
            <Row label="To enable">
              <span className="text-muted">Set <code className="mono text-fg">VITE_CONTRACT_ADDRESS</code> in <code className="mono text-fg">web/.env.local</code></span>
            </Row>
          )}
          <Row label="Wallet">{wallet.status === "connected" && wallet.account ? <MonoValue value={wallet.account} short /> : <span className="text-muted">{wallet.status === "unavailable" ? "No browser wallet detected" : "Not connected"}</span>}</Row>
        </dl>
      </Section>

      <Section title="Data in this browser" description="CredValid has no server. Demo data, verification history and transaction lists are stored locally.">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setConfirmReset(true)}>
            Reset demo data
          </Button>
          <Button variant="secondary" onClick={() => setConfirmClear(true)}>
            Clear testnet history
          </Button>
        </div>
      </Section>

      <ConfirmationDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset demo data?"
        description="Credentials, issuers and history you've changed in demo mode will be replaced with the original sample data."
        confirmLabel="Reset demo data"
        onConfirm={() => {
          resetDemo();
          clearTxs("demo");
          toast("Demo data reset");
        }}
      />
      <ConfirmationDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear testnet history?"
        description="This removes the verification history and transaction list stored in this browser. Nothing on chain changes."
        confirmLabel="Clear history"
        onConfirm={() => {
          clearTxs("testnet");
          testnetHistory.set([]);
          toast("Testnet history cleared");
        }}
      />
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-4 border-t border-line py-8 first-of-type:border-t-0 first-of-type:pt-0 md:grid-cols-[220px_1fr]">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <p className="mt-1 text-[13.5px] text-muted">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[14px]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
