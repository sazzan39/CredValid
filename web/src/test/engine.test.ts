import { describe, expect, it, beforeEach } from "vitest";
import type { Hex } from "viem";
import { verifyCredential } from "@/verify/engine";
import { demoService, resetDemo, setDemoLatency, setActingIssuer, demoStore } from "@/demo/store";
import { SEED_SAMPLES } from "@/demo/seed.generated";
import { RegistryUnavailableError, type RegistryReader } from "@/registry/types";

const NOW = Math.floor(Date.parse("2026-10-26T12:00:00Z") / 1000);

beforeEach(() => {
  resetDemo();
  setDemoLatency({ sign: 0, confirm: 0 });
});

describe("verification engine against the demo registry", () => {
  it.each(SEED_SAMPLES.map((s) => [s.label, s.credentialId, s.expected] as const))(
    "%s → %s",
    async (_label, id, expected) => {
      const report = await verifyCredential({ credentialId: id, document: demoService.getDocument(id), reader: demoService, now: NOW });
      expect(report.state).toBe(expected);
      expect(report.mode).toBe("demo");
    },
  );

  it("needs the holder's file to reach VERIFIED", async () => {
    const valid = SEED_SAMPLES.find((s) => s.expected === "VERIFIED")!;
    const report = await verifyCredential({ credentialId: valid.credentialId, reader: demoService, now: NOW });
    expect(report.state).toBe("UNABLE_TO_VERIFY");
    expect(report.contentChecked).toBe(false);
    expect(report.checks.find((c) => c.key === "status")?.result).toBe("pass");
  });

  it("treats RPC failure as unable to verify, never as fraud", async () => {
    const broken: RegistryReader = {
      ...demoService,
      getCredential: async () => {
        throw new RegistryUnavailableError("RPC timeout");
      },
    };
    const id = SEED_SAMPLES[0]!.credentialId;
    const report = await verifyCredential({ credentialId: id, document: demoService.getDocument(id), reader: broken, now: NOW });
    expect(report.state).toBe("UNABLE_TO_VERIFY");
  });

  it("rejects a demo file checked against a different registry", async () => {
    const id = SEED_SAMPLES[0]!.credentialId;
    const other: RegistryReader = { ...demoService, mode: "testnet", chainId: 80002, address: "0x00000000000000000000000000000000000000aa" };
    const report = await verifyCredential({ credentialId: id, document: demoService.getDocument(id), reader: other, now: NOW });
    expect(report.state).toBe("WRONG_NETWORK");
  });

  it("detects a single-character edit", async () => {
    const valid = SEED_SAMPLES.find((s) => s.expected === "VERIFIED")!;
    const doc = demoService.getDocument(valid.credentialId)!;
    const edited = { ...doc, payload: { ...doc.payload, subject: { name: doc.payload.subject.name + "." } } };
    const report = await verifyCredential({ document: edited, reader: demoService, now: NOW });
    expect(report.state).toBe("HASH_MISMATCH");
  });
});

describe("demo issuance workflow", () => {
  it("issues, verifies, supersedes and revokes", async () => {
    const issuer = demoStore.get().issuers.find((i) => i.status === "active")!;
    setActingIssuer(issuer.address);
    const steps: string[] = [];
    const issued = await demoService.issue(
      { candidateName: "Test Person", type: "certificate", title: "Test Certificate", issuerName: "ignored", issueDate: "2026-10-01", expiryDate: "2030-01-01" },
      (s) => steps.push(s.step),
    );
    expect(steps).toEqual(["canonicalized", "hashed", "signing", "signed", "submitting", "pending", "confirmed"]);
    expect(issued.document.payload.issuerName).toBe(issuer.name);

    const r1 = await verifyCredential({ document: issued.document, reader: demoService, now: NOW });
    expect(r1.state).toBe("VERIFIED");

    // Seed credentials from the same issuer still verify after the session key rotation.
    const older = SEED_SAMPLES.find((s) => s.expected === "VERIFIED")!;
    const r0 = await verifyCredential({ credentialId: older.credentialId, document: demoService.getDocument(older.credentialId), reader: demoService, now: NOW });
    expect(r0.state).toBe("VERIFIED");

    const replacement = await demoService.supersede(issued.credentialId, {
      candidateName: "Test Person",
      type: "certificate",
      title: "Test Certificate (corrected)",
      issuerName: "",
      issueDate: "2026-10-01",
      expiryDate: null,
    });
    expect((await verifyCredential({ document: issued.document, reader: demoService, now: NOW })).state).toBe("SUPERSEDED");
    expect((await verifyCredential({ document: replacement.document, reader: demoService, now: NOW })).state).toBe("VERIFIED");

    await demoService.revoke(replacement.credentialId as Hex, 1);
    expect((await verifyCredential({ document: replacement.document, reader: demoService, now: NOW })).state).toBe("REVOKED");
  });

  it("blocks issuance by a suspended issuer", async () => {
    const suspended = demoStore.get().issuers.find((i) => i.status === "suspended")!;
    setActingIssuer(suspended.address);
    await expect(
      demoService.issue({ candidateName: "X", type: "degree", title: "Y", issuerName: "", issueDate: "2026-01-01", expiryDate: null }),
    ).rejects.toThrow(/suspended/);
  });

  it("reports TRANSACTION_PENDING while an issuance is in flight", async () => {
    setDemoLatency({ sign: 0, confirm: 200 });
    const issuer = demoStore.get().issuers.find((i) => i.status === "active")!;
    setActingIssuer(issuer.address);
    let id: Hex | null = null;
    const running = demoService.issue(
      { candidateName: "P", type: "degree", title: "Pending Test", issuerName: "", issueDate: "2026-01-01", expiryDate: null },
      (s) => {
        if (s.step === "pending") id = demoStore.get().pending[0] ?? null;
      },
    );
    await new Promise((r) => setTimeout(r, 60));
    expect(id).not.toBeNull();
    const report = await verifyCredential({ credentialId: id!, reader: demoService, now: NOW });
    expect(report.state).toBe("TRANSACTION_PENDING");
    await running;
  });
});
