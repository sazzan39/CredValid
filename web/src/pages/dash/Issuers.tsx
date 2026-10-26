import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { getAddress, isAddress, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, Info, Loader2, MoreHorizontal, PauseCircle, PlayCircle, Plus, Shuffle } from "lucide-react";
import { useMode, useRegistry, useWallet } from "@/app/AppProvider";
import { useIssuers, useRecords } from "@/app/queries";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { ConfirmationDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownTrigger, Td, Th } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { EmptyState, ErrorState, IssuerStatusBadge, LoadingState, MonoValue, PageHeader, SourceBadge } from "@/components/app/primitives";
import { TestnetNotConfigured } from "@/components/app/wallet";
import type { IssuerKind, IssuerRecord } from "@/domain/types";
import { UserRejectedError } from "@/registry/service";
import { explorerAddress, testnet } from "@/lib/config";
import { fmtDate } from "@/lib/utils";

const KIND: Record<IssuerKind, string> = { university: "University", college: "College", employer: "Employer" };

export function Issuers() {
  const mode = useMode();
  const registry = useRegistry();
  const issuers = useIssuers();
  const records = useRecords();
  const wallet = useWallet();
  const qc = useQueryClient();
  const [adding, setAdding] = React.useState(false);
  const [viewing, setViewing] = React.useState<IssuerRecord | null>(null);
  const [toggling, setToggling] = React.useState<IssuerRecord | null>(null);

  if (mode === "testnet" && !testnet.ok) return <TestnetNotConfigured />;
  const counts = new Map<string, number>();
  for (const r of records.data ?? []) counts.set(r.issuer.toLowerCase(), (counts.get(r.issuer.toLowerCase()) ?? 0) + 1);
  const canAdmin = mode === "demo" || wallet.status === "connected";
  const list = issuers.data ?? [];

  return (
    <>
      <PageHeader
        title="Issuers"
        meta={<SourceBadge mode={mode} />}
        description="Institutions and employers approved to issue credentials."
        actions={
          <Button onClick={() => setAdding(true)} disabled={!canAdmin} title={canAdmin ? undefined : "Connect an admin wallet first"}>
            <Plus /> Add issuer
          </Button>
        }
      />

      <div className="mb-4 flex gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-[13.5px] text-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        {mode === "demo"
          ? "Demo mode: approvals are simulated in your browser. You act as the registry administrator."
          : "These approvals are read from the registry contract. Adding or suspending an issuer requires a wallet with the issuer-admin role."}
      </div>

      <div className="card overflow-hidden">
        {issuers.error ? (
          <ErrorState retry={() => void issuers.refetch()} />
        ) : issuers.isLoading ? (
          <LoadingState label="Loading issuers…" />
        ) : list.length === 0 ? (
          <EmptyState title="No issuers yet" body="Add the first institution to let it issue credentials." action={canAdmin && <Button size="sm" onClick={() => setAdding(true)}>Add issuer</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-line bg-subtle/50">
                <tr>
                  <Th>Organization</Th>
                  <Th>Type</Th>
                  <Th>Issuer wallet</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Credentials</Th>
                  <Th>Registered</Th>
                  <Th className="w-12">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((i) => (
                  <tr key={i.address} className="cursor-pointer transition-colors hover:bg-subtle/60" onClick={() => setViewing(i)}>
                    <Td className="font-medium">{i.name}</Td>
                    <Td className="text-muted">{i.kind ? KIND[i.kind] : "—"}</Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <MonoValue value={i.address} short />
                    </Td>
                    <Td>
                      <IssuerStatusBadge status={i.status} />
                    </Td>
                    <Td className="text-right tabular-nums">{counts.get(i.address.toLowerCase()) ?? 0}</Td>
                    <Td className="whitespace-nowrap text-muted">{fmtDate(i.registeredAt)}</Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${i.name}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownTrigger>
                        <DropdownContent>
                          <DropdownItem onSelect={() => setViewing(i)}>
                            <Eye /> View details
                          </DropdownItem>
                          <DropdownItem disabled={!canAdmin} danger={i.status === "active"} onSelect={() => setToggling(i)}>
                            {i.status === "active" ? <PauseCircle /> : <PlayCircle />} {i.status === "active" ? "Suspend issuer" : "Reinstate issuer"}
                          </DropdownItem>
                        </DropdownContent>
                      </DropdownMenu>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddIssuerDialog open={adding} onOpenChange={setAdding} />

      <Dialog open={Boolean(viewing)} onOpenChange={(o) => !o && setViewing(null)}>
        {viewing && (
          <DialogContent title={viewing.name} description={viewing.kind ? KIND[viewing.kind] : "Issuer"}>
            <dl className="space-y-3 text-[14px]">
              <Row label="Status"><IssuerStatusBadge status={viewing.status} /></Row>
              <Row label="Issuer wallet"><MonoValue value={viewing.address} short /></Row>
              <Row label="Signing key"><MonoValue value={viewing.signer} short /></Row>
              <Row label="Credentials issued">{counts.get(viewing.address.toLowerCase()) ?? 0}</Row>
              <Row label="Registered">{fmtDate(viewing.registeredAt)}</Row>
              <Row label="Last change">{fmtDate(viewing.updatedAt)}</Row>
              <Row label="Recorded in">{mode === "demo" ? "Simulated registry" : "Registry contract"}</Row>
            </dl>
            {explorerAddress(viewing.address) && (
              <a href={explorerAddress(viewing.address)!} target="_blank" rel="noreferrer" className="mt-4 inline-block text-[13.5px] text-primary hover:underline">
                View wallet on explorer
              </a>
            )}
            <p className="mt-4 rounded-lg bg-subtle/70 p-3 text-[13px] text-muted">
              Suspending blocks new credentials. Credentials already issued stay verifiable until revoked individually.
            </p>
          </DialogContent>
        )}
      </Dialog>

      {toggling && (
        <ConfirmationDialog
          open={Boolean(toggling)}
          onOpenChange={(o) => !o && setToggling(null)}
          title={toggling.status === "active" ? `Suspend ${toggling.name}?` : `Reinstate ${toggling.name}?`}
          description={
            toggling.status === "active"
              ? "They won't be able to issue new credentials. Existing credentials stay verifiable until revoked."
              : "They'll be able to issue credentials again."
          }
          confirmLabel={toggling.status === "active" ? "Suspend issuer" : "Reinstate issuer"}
          tone={toggling.status === "active" ? "danger" : "primary"}
          onConfirm={async () => {
            try {
              await registry!.setIssuerStatus(toggling.address, toggling.status === "active" ? "suspend" : "reinstate");
            } catch (err) {
              if (err instanceof UserRejectedError) throw new Error("You cancelled in your wallet. Nothing changed.");
              throw err;
            }
            await qc.invalidateQueries({ queryKey: ["registry", mode] });
            toast(toggling.status === "active" ? `${toggling.name} suspended` : `${toggling.name} reinstated`);
          }}
        />
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

const addr = z.string().trim().refine((v): boolean => isAddress(v, { strict: false }), "Enter a valid wallet address (0x followed by 40 characters).");
const schema = z.object({
  name: z.string().trim().min(2, "Enter the organization's name.").max(96, "Use 96 characters or fewer."),
  kind: z.enum(["university", "college", "employer"]),
  address: addr,
  signer: z.union([z.literal(""), addr]),
});
type Values = z.infer<typeof schema>;

function AddIssuerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const mode = useMode();
  const registry = useRegistry();
  const qc = useQueryClient();
  const [error, setError] = React.useState("");
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", kind: "university", address: "", signer: "" } });
  const e = form.formState.errors;
  React.useEffect(() => {
    if (open) {
      form.reset();
      setError("");
    }
  }, [open, form]);

  async function submit(v: Values) {
    setError("");
    try {
      const a = getAddress(v.address);
      await registry!.registerIssuer(a, v.signer ? (getAddress(v.signer) as Address) : a, v.name.trim(), v.kind);
      await qc.invalidateQueries({ queryKey: ["registry", mode] });
      toast(`${v.name.trim()} added`, { body: mode === "demo" ? "Approved in the simulated registry." : "Registered on chain." });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof UserRejectedError ? "You cancelled in your wallet. Nothing changed." : err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add an issuer" description="Approve an institution or employer to issue credentials." className="max-w-lg">
        <form noValidate className="space-y-4" onSubmit={form.handleSubmit(submit)}>
          <Field label="Organization name" htmlFor="iname" error={e.name?.message}>
            <Input id="iname" aria-invalid={Boolean(e.name)} {...form.register("name")} />
          </Field>
          <Field label="Organization type" htmlFor="ikind" hint={mode === "testnet" ? "Shown in demo only; the contract records the name." : undefined}>
            <Select id="ikind" {...form.register("kind")}>
              <option value="university">University</option>
              <option value="college">College</option>
              <option value="employer">Employer</option>
            </Select>
          </Field>
          <Field label="Issuer wallet address" htmlFor="iaddr" error={e.address?.message}>
            <div className="flex gap-2">
              <Input id="iaddr" className="mono" placeholder="0x…" aria-invalid={Boolean(e.address)} {...form.register("address")} />
              {mode === "demo" && (
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-10 shrink-0"
                  aria-label="Generate a demo address"
                  title="Generate a demo address"
                  onClick={() => form.setValue("address", privateKeyToAccount(generatePrivateKey()).address, { shouldValidate: true })}
                >
                  <Shuffle />
                </Button>
              )}
            </div>
          </Field>
          <Field label="Signing key address" optional htmlFor="isigner" error={e.signer?.message} hint="Leave blank to sign with the issuer wallet.">
            <Input id="isigner" className="mono" placeholder="0x…" aria-invalid={Boolean(e.signer)} {...form.register("signer")} />
          </Field>
          {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />} Add issuer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
