"use client";
import { useQuery } from "@tanstack/react-query";
import { erc20Abi, formatUnits } from "viem";
import { getQuote, ETH } from "@/components/AnySwap";
import { api, type Portfolio } from "./api";
import { tokenPrices } from "./basePools";
import { launchRouterAbi } from "./abis";
import { ADDR } from "./config";
import { vaultActions, vaultClient, vaultPublic, type TokenMeta, type VaultWallet } from "./vault";

export type Holding = { meta: TokenMeta; raw: bigint; amount: number; usd: number };
const ZERO = "0x0000000000000000000000000000000000000000";
type RelayCur = { chainId: number; address: string; symbol: string; name: string; decimals: number; metadata?: { logoURI?: string } };

async function relayTokens(user: string): Promise<TokenMeta[]> {
  try {
    const r = await fetch(`https://api.relay.link/requests/v2?user=${user}&limit=50`);
    const j = (await r.json()) as { requests?: { data?: { metadata?: { currencyIn?: { currency: RelayCur }; currencyOut?: { currency: RelayCur } } } }[] };
    const out: TokenMeta[] = [];
    for (const q of j.requests ?? [])
      for (const c of [q.data?.metadata?.currencyOut?.currency, q.data?.metadata?.currencyIn?.currency])
        if (c && c.chainId === 8453 && /^0x[0-9a-fA-F]{40}$/.test(c.address) && c.address !== ZERO)
          out.push({ address: c.address as `0x${string}`, symbol: c.symbol, name: c.name, decimals: c.decimals, image: c.metadata?.logoURI ?? null });
    return out;
  } catch {
    return [];
  }
}

export function useVaultHoldings(w: VaultWallet, tracked: TokenMeta[]) {
  return useQuery({
    queryKey: ["vault-holdings", w.address, tracked.length],
    refetchInterval: 15000,
    queryFn: async (): Promise<Holding[]> => {
      const [rel, pf] = await Promise.all([relayTokens(w.address), api<Portfolio>(`/portfolio/${w.address}`).catch(() => null)]);
      const keel = (pf?.holdings ?? []).map((h) => ({ address: h.token.address as `0x${string}`, symbol: h.token.symbol, name: h.token.name, decimals: 18, image: h.token.image, keel: true }));
      const map = new Map<string, TokenMeta>();
      for (const t of [...rel, ...tracked, ...keel]) map.set(t.address.toLowerCase(), { ...map.get(t.address.toLowerCase()), ...t });
      const metas = [...map.values()];
      if (!metas.length) return [];
      const pub = vaultPublic();
      const bals = await pub.multicall({ contracts: metas.map((m) => ({ address: m.address, abi: erc20Abi, functionName: "balanceOf", args: [w.address] }) as const), allowFailure: true });
      const held = metas.map((meta, i) => ({ meta, raw: (bals[i].result as bigint | undefined) ?? 0n })).filter((h) => h.raw > 0n);
      const px = await tokenPrices(held.filter((h) => !h.meta.keel).map((h) => h.meta.address.toLowerCase()));
      const keelUsd = Object.fromEntries((pf?.holdings ?? []).map((h) => [h.token.address.toLowerCase(), h.amount ? h.valueUsd / h.amount : 0]));
      return held
        .map((h) => {
          const amount = Number(formatUnits(h.raw, h.meta.decimals));
          const p = h.meta.keel ? keelUsd[h.meta.address.toLowerCase()] ?? 0 : px[h.meta.address.toLowerCase()] ?? 0;
          return { ...h, amount, usd: amount * p };
        })
        .sort((a, b) => b.usd - a.usd);
    },
  });
}

/** Sell part of a holding from a trading wallet back to ETH (or the pair asset for Keelfun tokens). */
export async function vaultSell(w: VaultWallet, h: Holding, pct: number, slippage = 15) {
  const raw = pct >= 100 ? h.raw : (h.raw * BigInt(pct)) / 100n;
  if (raw === 0n) throw new Error("Nothing to sell");
  const pub = vaultPublic();
  const c = vaultClient(w);
  let hash = "";
  if (h.meta.keel) {
    const allowance = await pub.readContract({ address: h.meta.address, abi: erc20Abi, functionName: "allowance", args: [w.address, ADDR.router] });
    if (allowance < raw) {
      const a = await c.writeContract({ address: h.meta.address, abi: erc20Abi, functionName: "approve", args: [ADDR.router, raw] });
      await pub.waitForTransactionReceipt({ hash: a });
    }
    const { result } = await pub.simulateContract({ account: w.address, address: ADDR.router, abi: launchRouterAbi, functionName: "quoteSell", args: [h.meta.address, raw] });
    hash = await c.writeContract({
      address: ADDR.router, abi: launchRouterAbi, functionName: "sell",
      args: [h.meta.address, raw, (result[1] * BigInt(100 - slippage)) / 100n, w.address, BigInt(Math.floor(Date.now() / 1000) + 600)],
    });
    if ((await pub.waitForTransactionReceipt({ hash: hash as `0x${string}` })).status !== "success") throw new Error("Sell reverted");
  } else {
    const q = await getQuote(w.address, { address: h.meta.address, symbol: h.meta.symbol, name: h.meta.name, decimals: h.meta.decimals }, ETH, raw.toString());
    for (const s of q.steps) {
      if (s.kind !== "transaction") continue;
      for (const it of s.items) {
        hash = await c.sendTransaction({ to: it.data.to, data: it.data.data, value: BigInt(it.data.value || "0") });
        if ((await pub.waitForTransactionReceipt({ hash: hash as `0x${string}` })).status !== "success") throw new Error("Sell reverted");
      }
    }
  }
  await vaultActions.record(w.address, h.meta, { side: "sell", hash });
}
