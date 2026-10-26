import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Hex } from "viem";
import { useMode, useRegistry } from "@/app/AppProvider";
import { REVOCATION_REASONS } from "@/domain/types";
import { UserRejectedError } from "@/registry/service";
import { ConfirmationDialog } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";

/** Revocation with a required confirmation step and a reason code. */
export function RevokeDialog({ id, name, open, onOpenChange }: { id: Hex; name?: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const mode = useMode();
  const registry = useRegistry();
  const qc = useQueryClient();
  const [reason, setReason] = React.useState(1);
  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Revoke this credential?"
      description={`${name ? `${name}'s credential` : "This credential"} will show as revoked to anyone who verifies it. This can't be undone.${mode === "demo" ? " In demo mode the revocation is simulated." : " Your wallet will ask you to confirm a transaction."}`}
      confirmLabel="Revoke credential"
      onConfirm={async () => {
        if (!registry) throw new Error("Registry unavailable.");
        try {
          await registry.revoke(id, reason);
        } catch (err) {
          if (err instanceof UserRejectedError) throw new Error("You cancelled in your wallet. Nothing changed.");
          throw err;
        }
        await qc.invalidateQueries({ queryKey: ["registry", mode] });
        toast("Credential revoked", { body: mode === "demo" ? "Recorded in the simulated registry." : "Confirmed on chain." });
      }}
    >
      <Field label="Reason" htmlFor="revoke-reason" hint="Only the reason code is recorded publicly.">
        <Select id="revoke-reason" value={reason} onChange={(e) => setReason(Number(e.target.value))}>
          {Object.entries(REVOCATION_REASONS)
            .filter(([k]) => k !== "0")
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </Select>
      </Field>
    </ConfirmationDialog>
  );
}
