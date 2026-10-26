/**
 * End-to-end check of TESTNET MODE code against a real local chain (anvil).
 *
 * Starts anvil, deploys CredValidRegistry from Foundry's build output, then drives the
 * same chainService the UI uses — wallet signature, simulate, transaction, receipt,
 * event scan, verification — through an EIP-1193 provider backed by anvil's unlocked
 * test accounts (standing in for MetaMask).
 *
 *   (cd ../contracts && forge build) && npm run test:chain
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { foundry } from "viem/chains";

const RPC = "http://127.0.0.1:8546";
const ANVIL = new URL("../../contracts/node_modules/.bin/anvil", import.meta.url).pathname;
const artifact = JSON.parse(readFileSync(new URL("../../contracts/out/CredValidRegistry.sol/CredValidRegistry.json", import.meta.url), "utf8"));

const anvil = spawn(process.env.ANVIL_BIN ?? ANVIL, ["--port", "8546", "--silent"], { stdio: "ignore" });
const cleanup = () => anvil.kill();
process.on("exit", cleanup);

async function rpc(method: string, params: unknown[] = []) {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const json = (await res.json()) as { result?: unknown; error?: { code: number; message: string } };
  if (json.error) throw Object.assign(new Error(json.error.message), { code: json.error.code });
  return json.result;
}

let selected: Address[] = [];
/** MetaMask stand-in. Anvil's default accounts are unlocked, so it signs and sends. */
const provider: EthereumProvider = {
  async request({ method, params }) {
    if (method === "eth_requestAccounts" || method === "eth_accounts") return selected;
    return rpc(method, (params as unknown[]) ?? []);
  },
  on() {},
};
(globalThis as unknown as { window: unknown }).window = { ethereum: provider, localStorage: undefined };

let failures = 0;
function expect(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — got ${String(actual)}, expected ${String(expected)}`}`);
}

async function main() {
  for (let i = 0; i < 50; i++) {
    try {
      await rpc("eth_chainId");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const accounts = (await rpc("eth_accounts")) as Address[];
  const [admin, issuerAcct, signerAcct, outsider] = accounts as [Address, Address, Address, Address];

  const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
  const adminWallet = createWalletClient({ account: admin, chain: foundry, transport: http(RPC) });
  const deployHash = await adminWallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object as Hex, args: [admin] });
  const { contractAddress } = await pub.waitForTransactionReceipt({ hash: deployHash });
  console.log(`Deployed at ${contractAddress}`);

  const { createChainService } = await import("../src/registry/chain");
  const { walletStore } = await import("../src/wallet/wallet");
  const { verifyCredential } = await import("../src/verify/engine");
  const { UserRejectedError } = await import("../src/registry/service");

  const config = { chain: foundry, chainId: foundry.id, contract: contractAddress!, explorer: "", rpcUrl: RPC, deployBlock: 0n };
  // The wallet module reads the configured chain from env; point it at anvil for this run.
  const cfg = await import("../src/lib/config");
  Object.assign(cfg.testnet, { ok: true, config });
  const svc = createChainService(config);
  const connect = (accts: Address[]) => {
    selected = accts;
    walletStore.set({ status: "connected", account: accts[0]!, accounts: accts, chainId: foundry.id, error: null });
  };

  // Admin registers an issuer whose signing key is a separate account.
  connect([admin]);
  await svc.registerIssuer(issuerAcct, signerAcct, "Northbridge University");
  const issuers = await svc.listIssuers();
  expect("issuer listed from events", issuers.length, 1);
  expect("issuer signer bound", issuers[0]?.signer.toLowerCase(), signerAcct.toLowerCase());

  // Outsider can't issue.
  connect([outsider]);
  try {
    await svc.issue({ candidateName: "Mallory", type: "degree", title: "PhD", issuerName: "", issueDate: "2026-01-01", expiryDate: null });
    expect("outsider issuance rejected", "accepted", "rejected");
  } catch (e) {
    expect("outsider issuance rejected", (e as Error).message.includes("isn't a registered issuer"), true);
  }

  // Issuer with both accounts connected: signer signs, issuer submits.
  connect([issuerAcct, signerAcct]);
  const steps: string[] = [];
  const issued = await svc.issue(
    { candidateName: "Aanya Mehta", type: "degree", title: "MSc Data Science", issuerName: "", issueDate: "2025-07-18", expiryDate: "2030-07-17" },
    (s) => steps.push(s.step),
  );
  expect("issue steps", steps.join(","), "canonicalized,hashed,signing,signed,submitting,pending,confirmed");
  const record = await svc.getCredential(issued.credentialId);
  expect("record on chain", record?.status, "active");
  expect("signer recorded", record?.signer.toLowerCase(), signerAcct.toLowerCase());
  expect("event scan finds it", (await svc.listRecords()).length, 1);

  const ok = await verifyCredential({ document: issued.document, reader: svc });
  expect("VERIFIED against chain", ok.state, "VERIFIED");
  expect("result labeled testnet", ok.mode, "testnet");

  const tampered = { ...issued.document, payload: { ...issued.document.payload, title: "PhD Data Science" } };
  expect("tampered file", (await verifyCredential({ document: tampered, reader: svc })).state, "HASH_MISMATCH");
  expect("record only", (await verifyCredential({ credentialId: issued.credentialId, reader: svc })).state, "UNABLE_TO_VERIFY");
  expect("unknown id", (await verifyCredential({ credentialId: `0x${"12".repeat(32)}`, reader: svc })).state, "NOT_FOUND");

  // Supersede, then revoke the replacement as admin.
  const replacement = await svc.supersede(issued.credentialId, { candidateName: "Aanya Mehta", type: "degree", title: "MSc Data Science, Distinction", issuerName: "", issueDate: "2025-07-18", expiryDate: null });
  expect("old superseded", (await verifyCredential({ document: issued.document, reader: svc })).state, "SUPERSEDED");
  connect([admin]);
  await svc.revoke(replacement.credentialId, 1);
  expect("admin revoked", (await verifyCredential({ document: replacement.document, reader: svc })).state, "REVOKED");

  // Wrong chain in the wallet is caught before anything is sent.
  walletStore.set((s) => ({ ...s, chainId: 1 }));
  try {
    await svc.revoke(issued.credentialId, 1);
    expect("wrong network blocked", "sent", "blocked");
  } catch (e) {
    expect("wrong network blocked", (e as Error).name, "WrongNetworkError");
  }

  // User cancelling in the wallet is surfaced as a rejection, not a failure.
  connect([issuerAcct, signerAcct]);
  const realRequest = provider.request;
  provider.request = async (args) => {
    if (args.method === "eth_signTypedData_v4") throw Object.assign(new Error("User rejected the request."), { code: 4001 });
    return realRequest(args);
  };
  try {
    await svc.issue({ candidateName: "X Y", type: "degree", title: "BSc", issuerName: "", issueDate: "2025-01-01", expiryDate: null });
    expect("wallet rejection", "issued", "rejected");
  } catch (e) {
    expect("wallet rejection", e instanceof UserRejectedError, true);
  }
  provider.request = realRequest;

  // Suspended issuer is blocked by the contract path.
  connect([admin]);
  await svc.setIssuerStatus(issuerAcct, "suspend");
  connect([issuerAcct, signerAcct]);
  try {
    await svc.issue({ candidateName: "X Y", type: "degree", title: "BSc", issuerName: "", issueDate: "2025-01-01", expiryDate: null });
    expect("suspended issuer blocked", "issued", "blocked");
  } catch (e) {
    expect("suspended issuer blocked", (e as Error).message.includes("suspended"), true);
  }

  // RPC down: unable to verify, never a fraud verdict.
  anvil.kill();
  await new Promise((r) => setTimeout(r, 300));
  expect("RPC outage", (await verifyCredential({ document: issued.document, reader: svc })).state, "UNABLE_TO_VERIFY");

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll chain checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  cleanup();
  process.exit(1);
});
