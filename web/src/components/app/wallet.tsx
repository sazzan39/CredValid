import * as React from "react";
import { ArrowUpRight, CheckCircle2, Circle, Loader2, LogOut, Wallet, XCircle } from "lucide-react";
import { setMode, useMode, useTxs, useWallet } from "@/app/AppProvider";
import { connectWallet, disconnectWallet, isWrongNetwork, switchToConfiguredChain } from "@/wallet/wallet";
import { explorerAddress, explorerTx, testnet } from "@/lib/config";
import { cn, shortAddr } from "@/lib/utils";
import type { TxRecord } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MonoValue, StatusBadge } from "./primitives";

export function WalletConnectButton() {
  const mode = useMode();
  const w = useWallet();
  const [open, setOpen] = React.useState(false);
  if (mode === "demo") return null;
  const wrong = isWrongNetwork(w);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant={w.status === "connected" && !wrong ? "secondary" : "primary"} size="sm" onClick={() => setOpen(true)}>
        {w.status === "connecting" ? <Loader2 className="animate-spin" /> : <Wallet />}
        {w.status === "connected" && w.account ? (wrong ? "Wrong network" : <span className="mono text-fg">{shortAddr(w.account)}</span>) : "Connect wallet"}
      </Button>
      <WalletDialog onDone={() => setOpen(false)} />
    </Dialog>
  );
}

function WalletDialog({ onDone }: { onDone: () => void }) {
  const w = useWallet();
  const wrong = isWrongNetwork(w);
  if (w.status === "unavailable") {
    return (
      <DialogContent title="No wallet found" description="Testnet mode needs a browser wallet such as MetaMask. Verifying credentials doesn't.">
        <Button asChild className="w-full">
          <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
            Get MetaMask <ArrowUpRight />
          </a>
        </Button>
      </DialogContent>
    );
  }
  if (w.status === "connected" && w.account) {
    return (
      <DialogContent title="Wallet" description="Issuers sign credentials and send registry transactions from this wallet.">
        <div className="space-y-3 rounded-lg border border-line p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted">Account</span>
            <MonoValue value={w.account} short />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted">Network</span>
            {wrong ? <StatusBadge tone="warn">Chain {w.chainId}</StatusBadge> : <StatusBadge tone="good">{testnet.ok ? testnet.config.chain.name : `Chain ${w.chainId}`}</StatusBadge>}
          </div>
          {explorerAddress(w.account) && (
            <a className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline" href={explorerAddress(w.account)!} target="_blank" rel="noreferrer">
              View on explorer <ArrowUpRight className="size-3.5" />
            </a>
          )}
        </div>
        <div className="mt-4 space-y-2">
          {wrong && (
            <Button className="w-full" onClick={() => void switchToConfiguredChain()}>
              Switch to {testnet.ok ? testnet.config.chain.name : "the configured network"}
            </Button>
          )}
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              disconnectWallet();
              onDone();
            }}
          >
            <LogOut /> Disconnect
          </Button>
        </div>
      </DialogContent>
    );
  }
  return (
    <DialogContent title="Connect a wallet" description="CredValid never sees your keys. You approve every signature and transaction in the wallet.">
      <Button className="w-full" size="lg" disabled={w.status === "connecting"} onClick={() => void connectWallet()}>
        {w.status === "connecting" ? <Loader2 className="animate-spin" /> : <Wallet />}
        {w.status === "connecting" ? "Waiting for wallet…" : "Connect browser wallet"}
      </Button>
      {w.error && (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {w.error}
        </p>
      )}
    </DialogContent>
  );
}

export function WrongNetworkBanner() {
  const mode = useMode();
  const w = useWallet();
  if (mode !== "testnet" || !isWrongNetwork(w) || !testnet.ok) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#fedf89] bg-warning-soft px-6 py-2.5 text-[13.5px] text-warning">
      <span>Your wallet is on the wrong network. CredValid uses {testnet.config.chain.name}.</span>
      <Button size="sm" variant="secondary" onClick={() => void switchToConfiguredChain()}>
        Switch network
      </Button>
    </div>
  );
}

export function TestnetNotConfigured() {
  return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      <p className="text-[16px] font-semibold">Testnet isn't set up yet</p>
      <p className="mt-2 text-[14px] text-muted">
        Deploy the contract and set <code className="mono text-fg">VITE_CONTRACT_ADDRESS</code> in <code className="mono text-fg">web/.env.local</code>. The README has the steps.
      </p>
      <Button className="mt-6" onClick={() => setMode("demo")}>
        Switch to demo mode
      </Button>
    </div>
  );
}

/** Gate for actions that need a wallet in testnet mode. Demo mode passes through. */
export function RequireWallet({ children, action }: { children: React.ReactNode; action: string }) {
  const mode = useMode();
  const w = useWallet();
  const [open, setOpen] = React.useState(false);
  if (mode === "demo") return <>{children}</>;
  if (!testnet.ok) return <TestnetNotConfigured />;
  if (w.status !== "connected") {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <span className="mx-auto grid size-10 place-items-center rounded-full bg-primary-soft text-primary">
          <Wallet className="size-5" />
        </span>
        <p className="mt-4 text-[16px] font-semibold">Connect a wallet to {action}</p>
        <p className="mt-1 text-[14px] text-muted">Only approved issuer wallets can make changes to the registry.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button className="mt-6" onClick={() => setOpen(true)}>
            Connect wallet
          </Button>
          <WalletDialog onDone={() => setOpen(false)} />
        </Dialog>
      </div>
    );
  }
  if (isWrongNetwork(w)) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <p className="text-[16px] font-semibold">Switch to {testnet.config.chain.name}</p>
        <p className="mt-1 text-[14px] text-muted">Your wallet is connected to a different network.</p>
        <Button className="mt-6" onClick={() => void switchToConfiguredChain()}>
          Switch network
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}

const TX_STATE: Record<TxRecord["state"], { label: string; tone: "info" | "good" | "bad" | "neutral" }> = {
  "awaiting-signature": { label: "Awaiting wallet", tone: "info" },
  pending: { label: "Submitted", tone: "info" },
  confirmed: { label: "Confirmed", tone: "good" },
  failed: { label: "Failed", tone: "bad" },
  rejected: { label: "Cancelled", tone: "neutral" },
};

export function TxBadge({ tx }: { tx: TxRecord }) {
  return <StatusBadge tone={TX_STATE[tx.state].tone}>{TX_STATE[tx.state].label}</StatusBadge>;
}

/** Real hash with explorer link, or an explicit "simulated" marker. Never a fabricated hash. */
export function TxLink({ tx }: { tx: TxRecord }) {
  if (tx.mode === "demo") return <span className="text-[12.5px] text-muted">Simulated · no transaction hash</span>;
  if (!tx.hash) return <span className="text-[12.5px] text-muted">Waiting for hash</span>;
  const url = explorerTx(tx.hash);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="mono inline-flex items-center gap-1 text-primary hover:underline">
      {tx.hash.slice(0, 10)}…{tx.hash.slice(-6)} <ArrowUpRight className="size-3" />
    </a>
  ) : (
    <span className="mono text-muted">{tx.hash.slice(0, 10)}…{tx.hash.slice(-6)}</span>
  );
}

export type TransactionStage = "awaiting" | "submitted" | "confirmed" | "failed";

/** Four-state transaction progress used by issuance. */
export function TransactionStatus({ stage, mode, txId, error }: { stage: TransactionStage; mode: "demo" | "testnet"; txId?: string; error?: string }) {
  const tx = useTxs().find((t) => t.id === txId);
  const steps = [
    { key: "awaiting", label: mode === "demo" ? "Signing with issuer key" : "Awaiting wallet confirmation", hint: mode === "demo" ? "Simulated key in your browser" : "Approve the signature, then the transaction" },
    { key: "submitted", label: mode === "demo" ? "Submitted to simulated registry" : "Transaction submitted", hint: mode === "demo" ? "No blockchain transaction" : "Waiting to be included in a block" },
    { key: "confirmed", label: mode === "demo" ? "Recorded (simulated)" : "Transaction confirmed", hint: "" },
  ] as const;
  const order = { awaiting: 0, submitted: 1, confirmed: 2, failed: -1 } as const;
  const failedAt = stage === "failed" ? (tx?.state === "pending" || tx?.hash ? 1 : 0) : -1;
  const current = stage === "failed" ? failedAt : order[stage];

  return (
    <div className="space-y-1">
      {steps.map((s, i) => {
        const done = stage === "confirmed" ? true : i < current;
        const active = i === current && stage !== "confirmed";
        const failed = stage === "failed" && i === failedAt;
        return (
          <div key={s.key} className={cn("flex items-start gap-3 rounded-lg px-3 py-2.5", active && !failed && "bg-primary-soft/60", failed && "bg-danger-soft")}>
            <span className="mt-0.5">
              {failed ? (
                <XCircle className="size-5 text-danger" />
              ) : done ? (
                <CheckCircle2 className="size-5 text-success" />
              ) : active ? (
                <Loader2 className="size-5 animate-spin text-primary" />
              ) : (
                <Circle className="size-5 text-line-strong" />
              )}
            </span>
            <div className="min-w-0">
              <p className={cn("text-[14px] font-medium", !done && !active && !failed && "text-muted")}>{failed ? (mode === "demo" ? "Issuance failed" : "Transaction failed") : s.label}</p>
              {failed ? <p className="text-[13px] text-danger">{error}</p> : (active || done) && s.hint ? <p className="text-[13px] text-muted">{s.hint}</p> : null}
              {s.key === "submitted" && tx && (done || active) && (
                <div className="mt-0.5">
                  <TxLink tx={tx} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
