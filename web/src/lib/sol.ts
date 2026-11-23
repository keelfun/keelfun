"use client";
import { useEffect, useState } from "react";
import { isSolAddr } from "./net";

export const WSOL = "So11111111111111111111111111111111111111112";
const RPC = "https://solana-rpc.publicnode.com";
const JUP = "https://lite-api.jup.ag/swap/v1";
const KEY = "keel-sol";
const EVT = "keel-sol";

type Pk = { toString(): string };
type Provider = {
  publicKey?: Pk | null;
  connect(o?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: Pk }>;
  disconnect(): Promise<void>;
  signAndSendTransaction(tx: unknown): Promise<{ signature: string }>;
};
type W = { phantom?: { solana?: Provider }; solana?: Provider; backpack?: { solana?: Provider }; solflare?: Provider };

export function solProvider(): Provider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as W;
  return w.phantom?.solana ?? w.backpack?.solana ?? w.solflare ?? w.solana ?? null;
}

/** Solana address that receives buys: the connected wallet, or one pasted by the user. */
export function solAddress(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && isSolAddr(v) ? v : null;
  } catch {
    return null;
  }
}
function save(a: string | null) {
  if (a) localStorage.setItem(KEY, a);
  else localStorage.removeItem(KEY);
  dispatchEvent(new Event(EVT));
}
export function setSolAddress(a: string) {
  if (!isSolAddr(a.trim())) throw new Error("Not a Solana address");
  save(a.trim());
}
export async function connectSol(): Promise<string> {
  const p = solProvider();
  if (!p) {
    window.open(`https://phantom.app/ul/browse/${encodeURIComponent(location.href)}?ref=${encodeURIComponent(location.origin)}`, "_blank");
    throw new Error("No Solana wallet found. Open this page in Phantom, or paste a receive address.");
  }
  const r = await p.connect();
  const a = r.publicKey.toString();
  save(a);
  return a;
}
export async function disconnectSol() {
  await solProvider()?.disconnect().catch(() => {});
  save(null);
}
export function useSol() {
  const [a, setA] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  useEffect(() => {
    const f = () => {
      setA(solAddress());
      setLive(!!solProvider()?.publicKey && solProvider()!.publicKey!.toString() === solAddress());
    };
    f();
    const p = solProvider();
    if (p && solAddress()) p.connect({ onlyIfTrusted: true }).then(f, () => {});
    addEventListener(EVT, f);
    return () => removeEventListener(EVT, f);
  }, []);
  return { address: a, canSign: live };
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message ?? "Solana RPC error");
  return j.result as T;
}

/** Raw balance and decimals of an SPL token held by owner. */
export async function splBalance(owner: string, mint: string): Promise<{ raw: bigint; decimals: number }> {
  type Acc = { account: { data: { parsed: { info: { tokenAmount: { amount: string; decimals: number } } } } } };
  const r = await rpc<{ value: Acc[] }>("getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }]);
  let raw = 0n;
  let decimals = 0;
  for (const x of r.value) {
    const t = x.account.data.parsed.info.tokenAmount;
    raw += BigInt(t.amount);
    decimals = t.decimals;
  }
  return { raw, decimals };
}

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Swaps an SPL token to SOL with Jupiter, signed by the connected Solana wallet. */
export async function solSell(mint: string, raw: bigint, slippagePct: number): Promise<string> {
  const p = solProvider();
  const owner = p?.publicKey?.toString();
  if (!p || !owner) throw new Error("Connect your Solana wallet to sell");
  const quote = await (await fetch(`${JUP}/quote?inputMint=${mint}&outputMint=${WSOL}&amount=${raw}&slippageBps=${Math.round(slippagePct * 100)}`)).json();
  if (quote.error || !quote.outAmount) throw new Error(quote.error ?? "No route for this token");
  const sw = await (
    await fetch(`${JUP}/swap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quoteResponse: quote, userPublicKey: owner, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: "auto" }),
    })
  ).json();
  if (!sw.swapTransaction) throw new Error(sw.error ?? "Could not build the swap");
  const { VersionedTransaction } = await import("@solana/web3.js");
  const { signature } = await p.signAndSendTransaction(VersionedTransaction.deserialize(b64(sw.swapTransaction)));
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const s = await rpc<{ value: ({ err: unknown; confirmationStatus?: string } | null)[] }>("getSignatureStatuses", [[signature]]).catch(() => null);
    const v = s?.value[0];
    if (v?.err) throw new Error("Sell failed on Solana");
    if (v && (v.confirmationStatus === "confirmed" || v.confirmationStatus === "finalized")) return signature;
  }
  return signature;
}
