import { Link } from "react-router-dom";
import { useMode, useTxs } from "@/app/AppProvider";
import { Td, Th } from "@/components/ui/misc";
import { EmptyState, PageHeader, SourceBadge } from "@/components/app/primitives";
import { TxBadge, TxLink } from "@/components/app/wallet";
import { relTime } from "@/lib/utils";

const KIND = {
  issue: "Issue credential",
  revoke: "Revoke credential",
  supersede: "Issue correction",
  "register-issuer": "Add issuer",
  "suspend-issuer": "Suspend issuer",
  "reinstate-issuer": "Reinstate issuer",
  "rotate-signer": "Register signing key",
} as const;

export function Transactions() {
  const mode = useMode();
  const txs = useTxs();
  return (
    <>
      <PageHeader
        title="Transactions"
        meta={<SourceBadge mode={mode} />}
        description={mode === "demo" ? "Simulated registry changes. Nothing was sent to a blockchain, so there are no transaction hashes." : "Registry transactions sent from this browser."}
      />
      <div className="card overflow-hidden">
        {txs.length === 0 ? (
          <EmptyState title="No transactions yet" body="Issuing, revoking and issuer changes will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-line bg-subtle/50">
                <tr>
                  <Th>Action</Th>
                  <Th>Details</Th>
                  <Th>Transaction</Th>
                  <Th>Status</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {txs.map((t) => (
                  <tr key={t.id}>
                    <Td className="whitespace-nowrap font-medium">{KIND[t.kind]}</Td>
                    <Td className="max-w-[300px]">
                      <span className="block truncate">{t.label}</span>
                      {t.credentialId && (
                        <Link to={`/app/credentials/${t.credentialId}`} className="mono text-faint hover:text-primary">
                          {t.credentialId.slice(0, 12)}…
                        </Link>
                      )}
                      {t.error && <span className="block text-[12.5px] text-danger">{t.error}</span>}
                    </Td>
                    <Td><TxLink tx={t} /></Td>
                    <Td><TxBadge tx={t} /></Td>
                    <Td className="whitespace-nowrap text-muted">{relTime(t.updatedAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
