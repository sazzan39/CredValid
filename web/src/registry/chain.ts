import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  getAddress,
  http,
  isAddressEqual,
  UserRejectedRequestError,
  zeroHash,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { messageFromPayload, typedData } from "@/crypto/eip712";
import { preparePayload } from "@/crypto/payload";
import type { CredentialDocument, CredentialStatus, IssuerRecord, IssuerStatus, RegistryRecord, TxKind } from "@/domain/types";
import { startTx, txStores, updateTx } from "@/app/txStore";
import { testnet, type TestnetConfig } from "@/lib/config";
import { getWalletClient, walletStore } from "@/wallet/wallet";
import { credValidRegistryAbi } from "./abi";
import { ActionError, UserRejectedError, type IssueInput, type IssueResult, type IssueStep, type RegistryService } from "./service";
import { RegistryUnavailableError } from "./types";

export class WalletNotConnectedError extends ActionError {
  override name = "WalletNotConnectedError";
}
export class WrongNetworkError extends ActionError {
  override name = "WrongNetworkError";
}

const CREDENTIAL_STATUS: CredentialStatus[] = ["none", "active", "revoked", "superseded"];
const ISSUER_STATUS: IssuerStatus[] = ["none", "active", "suspended"];

const FRIENDLY_REVERTS: Record<string, string> = {
  IssuerNotRegistered: "This wallet isn't a registered issuer on the registry.",
  IssuerNotActive: "This issuer is suspended and can't issue or supersede credentials.",
  IssuerAlreadyRegistered: "That account is already a registered issuer.",
  IssuerAlreadySuspended: "That issuer is already suspended.",
  IssuerNotSuspended: "That issuer isn't suspended.",
  CredentialAlreadyExists: "A credential with this ID already exists.",
  CredentialNotFound: "No credential with this ID exists.",
  CredentialNotActive: "This credential is no longer active.",
  NotIssuerOrAdmin: "Only the credential's issuer or an issuer admin can do this.",
  NotCredentialIssuer: "Only the original issuer can supersede this credential.",
  InvalidIssuerSignature: "The registry rejected the signature: it wasn't made by this issuer's registered signing key.",
  InvalidExpiry: "The expiry date must be in the future.",
  InvalidIssuerName: "Issuer name must be 1–96 characters.",
  AccessControlUnauthorizedAccount: "This wallet doesn't hold the issuer-admin role.",
  ZeroAddress: "An address is missing.",
  SelfSupersession: "A credential can't supersede itself.",
};

function explain(err: unknown): Error {
  if (err instanceof ActionError || err instanceof UserRejectedError) return err;
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return new UserRejectedError("You cancelled the request in your wallet.");
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? "";
      return new ActionError(FRIENDLY_REVERTS[name] ?? `The contract rejected the transaction${name ? ` (${name})` : ""}.`);
    }
    return new ActionError(err.shortMessage || "The transaction failed.");
  }
  if (typeof err === "object" && err && "code" in err && (err as { code: unknown }).code === 4001)
    return new UserRejectedError("You cancelled the request in your wallet.");
  return new ActionError(err instanceof Error ? err.message : "Something went wrong.");
}

export function createChainService(config: TestnetConfig): RegistryService {
  const client = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl, { retryCount: 2 }) }) as PublicClient;
  const sessionDocuments = new Map<string, CredentialDocument>();
  const base = { address: config.contract, abi: credValidRegistryAbi } as const;

  async function read<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw new RegistryUnavailableError(
        err instanceof BaseError ? `RPC error: ${err.shortMessage}` : "The network RPC didn't respond.",
        err,
      );
    }
  }

  function requireWallet(): { account: Address; accounts: Address[] } {
    const w = walletStore.get();
    if (w.status === "unavailable") throw new WalletNotConnectedError("No browser wallet found. Install MetaMask to use testnet mode.");
    if (w.status !== "connected" || !w.account) throw new WalletNotConnectedError("Connect your wallet first.");
    if (w.chainId !== config.chainId) throw new WrongNetworkError(`Your wallet is on chain ${w.chainId}. Switch to ${config.chain.name}.`);
    return { account: w.account, accounts: w.accounts };
  }

  async function send(
    kind: TxKind,
    label: string,
    credentialId: Hex | undefined,
    request: { functionName: string; args: readonly unknown[] },
    account: Address,
    onPending?: (txId: string, hash: Hex) => void,
  ): Promise<{ txId: string; hash: Hex; blockNumber: number }> {
    const txId = startTx("testnet", { kind, label, credentialId });
    try {
      const wallet = getWalletClient(account);
      if (!wallet) throw new WalletNotConnectedError("Wallet unavailable.");
      // Simulate first: surfaces the contract's custom error before asking for a signature.
      const { request: prepared } = await client.simulateContract({ ...base, ...request, account } as Parameters<typeof client.simulateContract>[0]);
      const hash = await wallet.writeContract(prepared as Parameters<typeof wallet.writeContract>[0]);
      updateTx("testnet", txId, { state: "pending", hash });
      onPending?.(txId, hash);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        updateTx("testnet", txId, { state: "failed", error: "Reverted on chain.", blockNumber: Number(receipt.blockNumber) });
        throw new ActionError("The transaction was mined but reverted.");
      }
      updateTx("testnet", txId, { state: "confirmed", blockNumber: Number(receipt.blockNumber) });
      return { txId, hash, blockNumber: Number(receipt.blockNumber) };
    } catch (err) {
      const e = explain(err);
      const current = txStores.testnet.get().find((t) => t.id === txId);
      if (current && current.state !== "failed")
        updateTx("testnet", txId, { state: e instanceof UserRejectedError ? "rejected" : "failed", error: e.message });
      throw e;
    }
  }

  async function getIssuer(address: Address): Promise<IssuerRecord | null> {
    const r = await read(() => client.readContract({ ...base, functionName: "getIssuer", args: [address] }));
    const status = ISSUER_STATUS[r.status] ?? "none";
    if (status === "none") return null;
    return {
      address: getAddress(address),
      name: r.name,
      signer: r.signer,
      status,
      registeredAt: Number(r.registeredAt),
      updatedAt: Number(r.updatedAt),
    };
  }

  async function getCredential(id: Hex): Promise<RegistryRecord | null> {
    const r = await read(() => client.readContract({ ...base, functionName: "getCredential", args: [id] }));
    const status = CREDENTIAL_STATUS[r.status] ?? "none";
    if (status === "none") return null;
    return {
      credentialId: id.toLowerCase() as Hex,
      payloadHash: r.payloadHash,
      issuer: r.issuer,
      signer: r.signer,
      issuedAt: Number(r.issuedAt),
      expiresAt: Number(r.expiresAt),
      status,
      statusChangedAt: Number(r.statusChangedAt),
      revocationReason: r.revocationReason,
      supersededBy: r.supersededBy === zeroHash ? null : r.supersededBy,
    };
  }

  async function logsInChunks<T>(fetch: (from: bigint, to: bigint) => Promise<T[]>): Promise<T[]> {
    const latest = await read(() => client.getBlockNumber({ cacheTime: 0 })); // no cache: refetches right after a confirmed tx must see it
    const step = 9_000n;
    const out: T[] = [];
    let from = config.deployBlock > 0n ? config.deployBlock : latest > 50_000n ? latest - 50_000n : 0n;
    while (from <= latest) {
      const to = from + step > latest ? latest : from + step;
      out.push(...(await read(() => fetch(from, to))));
      from = to + 1n;
    }
    return out;
  }

  async function signAndSubmit(
    input: IssueInput,
    onStep: (s: IssueStep) => void,
    supersedes?: Hex,
  ): Promise<IssueResult> {
    const { account, accounts } = requireWallet();
    const issuer = await getIssuer(account);
    if (!issuer) throw new ActionError("This wallet isn't a registered issuer. An issuer admin has to register it first.");
    if (issuer.status !== "active") throw new ActionError(`${issuer.name} is suspended and can't issue credentials.`);
    const signerAccount = accounts.find((a) => isAddressEqual(a, issuer.signer));
    if (!signerAccount) {
      throw new ActionError(
        `This issuer's registered signing key is ${issuer.signer}. Connect that account in your wallet (alongside ${account}) so it can sign, or ask an admin to rotate the signer.`,
      );
    }

    const { payload, canonical, payloadHash } = preparePayload({ ...input, issuerName: issuer.name }, account);
    onStep({ step: "canonicalized", canonical });
    onStep({ step: "hashed", payloadHash });

    const wallet = getWalletClient(signerAccount);
    if (!wallet) throw new WalletNotConnectedError("Wallet unavailable.");
    const message = messageFromPayload(payload, payloadHash);
    onStep({ step: "signing" });
    let signature: Hex;
    try {
      // An EIP-712 signature, not a transaction: the wallet shows the typed fields and spends no gas.
      signature = await wallet.signTypedData({ account: signerAccount, ...typedData(config.chainId, config.contract, message) });
    } catch (err) {
      throw explain(err);
    }
    onStep({ step: "signed", signer: signerAccount, signature });

    const document: CredentialDocument = {
      format: "credvalid-document/1",
      mode: "testnet",
      chainId: config.chainId,
      registry: config.contract,
      payload,
      payloadHash,
      signer: signerAccount,
      signature,
    };
    sessionDocuments.set(payload.credentialId.toLowerCase(), document);

    onStep({ step: "submitting" });
    const request = supersedes
      ? { functionName: "supersedeCredential", args: [supersedes, payload.credentialId, payloadHash, message.expiresAt, signature] as const }
      : { functionName: "issueCredential", args: [payload.credentialId, payloadHash, message.expiresAt, signature] as const };
    const { txId, hash, blockNumber } = await send(
      supersedes ? "supersede" : "issue",
      supersedes ? `Supersede ${supersedes.slice(0, 10)}…` : `Issue ${payload.title}`,
      payload.credentialId,
      request,
      account,
      (pendingId, h) => onStep({ step: "pending", txId: pendingId, hash: h }),
    );
    onStep({ step: "confirmed", txId, hash, blockNumber });
    return { credentialId: payload.credentialId, document, txId };
  }

  return {
    mode: "testnet",
    label: `${config.chain.name} · ${config.contract.slice(0, 8)}…`,
    chainId: config.chainId,
    address: config.contract,
    getCredential,
    getIssuer,
    hasPendingIssuance(id) {
      return txStores.testnet
        .get()
        .some((t) => t.credentialId?.toLowerCase() === id.toLowerCase() && (t.kind === "issue" || t.kind === "supersede") && t.state === "pending");
    },
    async listIssuers() {
      const logs = await logsInChunks((fromBlock, toBlock) =>
        client.getContractEvents({ ...base, eventName: "IssuerRegistered", fromBlock, toBlock }),
      );
      const addresses = [...new Set(logs.map((l) => l.args.issuer).filter((a): a is Address => Boolean(a)))];
      const rows = await Promise.all(addresses.map((a) => getIssuer(a)));
      return rows.filter((r): r is IssuerRecord => r !== null);
    },
    async listRecords() {
      const logs = await logsInChunks((fromBlock, toBlock) =>
        client.getContractEvents({ ...base, eventName: "CredentialIssued", fromBlock, toBlock }),
      );
      const ids = [...new Set(logs.map((l) => l.args.credentialId).filter((x): x is Hex => Boolean(x)))].slice(-300);
      const rows = await Promise.all(ids.map((id) => getCredential(id)));
      return rows.filter((r): r is RegistryRecord => r !== null);
    },
    getDocument(id) {
      return sessionDocuments.get(id.toLowerCase()) ?? null;
    },
    listDocuments() {
      return [...sessionDocuments.values()];
    },
    issue(input, onStep = () => {}) {
      return signAndSubmit(input, onStep);
    },
    async supersede(oldId, input, onStep = () => {}) {
      return signAndSubmit(input, onStep, oldId);
    },
    async revoke(id, reason) {
      const { account } = requireWallet();
      const { txId } = await send("revoke", `Revoke ${id.slice(0, 10)}…`, id, { functionName: "revokeCredential", args: [id, reason] }, account);
      return { txId };
    },
    async registerIssuer(address, signer, name) {
      const { account } = requireWallet();
      const { txId } = await send("register-issuer", `Register ${name}`, undefined, { functionName: "registerIssuer", args: [address, signer, name] }, account);
      return { txId };
    },
    async setIssuerStatus(address, action) {
      const { account } = requireWallet();
      const { txId } = await send(
        action === "suspend" ? "suspend-issuer" : "reinstate-issuer",
        `${action === "suspend" ? "Suspend" : "Reinstate"} ${address.slice(0, 10)}…`,
        undefined,
        { functionName: action === "suspend" ? "suspendIssuer" : "reinstateIssuer", args: [address] },
        account,
      );
      return { txId };
    },
  };
}

export const chainService: RegistryService | null = testnet.ok ? createChainService(testnet.config) : null;
