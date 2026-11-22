"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { erc20Abi, formatUnits, parseEther } from "viem";
import { usePublicClient, useSendTransaction, useWriteContract } from "wagmi";
import { ETH, getQuote } from "@/components/AnySwap";
import { launchRouterAbi } from "@/lib/abis";
import type { Token } from "@/lib/api";
import type { BasePool } from "@/lib/basePools";
import { ADDR, chain } from "@/lib/config";
import { fmtCompact } from "@/lib/format";
import { errMsg, useConfirm, useEnsureWallet } from "@/lib/tx";
import { useVault, vaultActions, vaultClient, vaultPlan, vaultPublic, vaultSellWallets, type TokenMeta } from "@/lib/vault";
import { vaultSell } from "@/lib/vaultHoldings";

export type Preset = { amount: string; slippage: number };
type Prefs = { active: number; presets: Preset[]; sell?: number };
const SELL_PCTS = [25, 50, 100];
const KEY = "keel-quick";
const EVT = "keel-quick";
const DEF: Prefs = { active: 0, presets: [{ amount: "0.001", slippage: 15 }, { amount: "0.01", slippage: 15 }, { amount: "0.05", slippage: 20 }] };

function load(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "null");
    if (Array.isArray(p?.presets) && p.presets.length === 3) return p;
  } catch {}
  return DEF;
}

export function usePrefs() {
  const [p, setP] = useState<Prefs>(DEF);
  useEffect(() => {
    setP(load());
    const f = () => setP(load());
    addEventListener(EVT, f);
    addEventListener("storage", f);
    return () => {
      removeEventListener(EVT, f);
      removeEventListener("storage", f);
    };
  }, []);
  const save = (n: Prefs) => {
    localStorage.setItem(KEY, JSON.stringify(n));
    dispatchEvent(new Event(EVT));
  };
  return {
    prefs: p,
    preset: p.presets[p.active] ?? DEF.presets[0],
    sellPct: p.sell ?? 100,
    setSell: (n: number) => save({ ...p, sell: n }),
    setActive: (i: number) => save({ ...p, active: i }),
    setPreset: (i: number, v: Partial<Preset>) => save({ ...p, presets: p.presets.map((x, j) => (j === i ? { ...x, ...v } : x)) }),
  };
}

export function Bolt({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>
  );
}

export function PresetBar({ compact = false }: { compact?: boolean }) {
  const { prefs, preset, setActive, setPreset, sellPct, setSell } = usePrefs();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center gap-1.5">
      {!compact && <span className="hidden text-xs text-muted sm:inline">Quick buy</span>}
      <label className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-bg px-2 focus-within:border-accent">
        <Bolt className="h-3.5 w-3.5 text-up" />
        <input
          value={preset.amount}
          onChange={(e) => setPreset(prefs.active, { amount: e.target.value.replace(/[^0-9.]/g, "") })}
          inputMode="decimal"
          className="w-14 bg-transparent font-mono text-xs outline-none"
          aria-label="Quick buy amount"
        />
        <span className="font-mono text-[11px] text-dim">ETH</span>
      </label>
      <div className="flex rounded-lg border border-line p-0.5">
        {[0, 1, 2].map((i) => (
          <button key={i} onClick={() => setActive(i)} className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] ${prefs.active === i ? "bg-panel-2 text-fg" : "text-dim hover:text-fg"}`}>
            P{i + 1}
          </button>
        ))}
      </div>
      <button onClick={() => setOpen((v) => !v)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted hover:text-fg" aria-label="Quick buy settings">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-64 rounded-xl border border-line bg-panel p-3 shadow-2xl">
          <p className="mb-2 text-xs font-semibold">Quick buy presets</p>
          {prefs.presets.map((p, i) => (
            <div key={i} className="mb-2 grid grid-cols-[28px_1fr_1fr] items-center gap-2 text-xs">
              <span className={`font-mono ${prefs.active === i ? "text-accent" : "text-muted"}`}>P{i + 1}</span>
              <label className="flex items-center gap-1 rounded-md border border-line bg-bg px-1.5 py-1">
                <input value={p.amount} onChange={(e) => setPreset(i, { amount: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className="w-full bg-transparent font-mono outline-none" />
                <span className="text-dim">ETH</span>
              </label>
              <label className="flex items-center gap-1 rounded-md border border-line bg-bg px-1.5 py-1">
                <input value={p.slippage} onChange={(e) => setPreset(i, { slippage: Math.min(50, Math.max(1, Number(e.target.value.replace(/[^0-9]/g, "")) || 1)) })} inputMode="numeric" className="w-full bg-transparent font-mono outline-none" />
                <span className="text-dim">% slip</span>
              </label>
            </div>
          ))}
          <div className="mb-2 mt-3 flex items-center gap-2 text-xs">
            <span className="font-semibold">Quick sell</span>
            <div className="ml-auto flex rounded-lg border border-line p-0.5">
              {SELL_PCTS.map((n) => (
                <button key={n} onClick={() => setSell(n)} className={`rounded-md px-2 py-0.5 font-mono text-[11px] ${sellPct === n ? "bg-down/20 text-down" : "text-dim hover:text-fg"}`}>{n}%</button>
              ))}
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-dim">Quick sell sells from your trading wallets (the active preset group, or all of them). Slippage applies to Keelfun pools. Other Base tokens route through Relay with its own price protection.</p>
        </div>
      )}
    </div>
  );
}

export function useKeelBuy() {
  const client = usePublicClient({ chainId: chain.id });
  const ensureWallet = useEnsureWallet();
  const confirm = useConfirm();
  const { writeContractAsync } = useWriteContract();
  return async (t: Token, p: Preset) => {
    const plan = vaultPlan(load().active, Number(p.amount || 0));
    if (plan.length) {
      const pub = vaultPublic();
      await Promise.all(
        plan.map(async ({ w, amount }) => {
          const value = parseEther(amount.toFixed(18));
          const { result } = await pub.simulateContract({ account: w.address, address: ADDR.router, abi: launchRouterAbi, functionName: "quoteBuy", args: [t.address, value] });
          const h = await vaultClient(w).writeContract({
            address: ADDR.router, abi: launchRouterAbi, functionName: "buy",
            args: [t.address, value, (result[1] * BigInt(100 - p.slippage)) / 100n, w.address, BigInt(Math.floor(Date.now() / 1000) + 600)], value,
          });
          if ((await pub.waitForTransactionReceipt({ hash: h })).status !== "success") throw new Error(`Buy reverted for ${w.name}`);
          await vaultActions.record(w.address, { address: t.address, symbol: t.symbol, name: t.name, decimals: 18, image: t.image ?? null, keel: true }, { side: "buy", eth: amount, hash: h });
        }),
      );
      return;
    }
    const account = await ensureWallet();
    const value = parseEther(p.amount || "0");
    if (value === 0n) throw new Error("Set a quick buy amount");
    const { result } = await client!.simulateContract({ address: ADDR.router, abi: launchRouterAbi, functionName: "quoteBuy", args: [t.address, value] });
    const minOut = (result[1] * BigInt(100 - p.slippage)) / 100n;
    const hash = await writeContractAsync({
      address: ADDR.router, abi: launchRouterAbi, functionName: "buy",
      args: [t.address, value, minOut, account, BigInt(Math.floor(Date.now() / 1000) + 600)], value, chainId: chain.id,
    });
    await confirm(hash);
  };
}

export function useRelayBuy() {
  const ensureWallet = useEnsureWallet();
  const confirm = useConfirm();
  const { sendTransactionAsync } = useSendTransaction();
  return async (pool: Pick<BasePool, "token">, p: Preset) => {
    const plan = vaultPlan(load().active, Number(p.amount || 0));
    if (plan.length) {
      const pub = vaultPublic();
      const t = pool.token;
      await Promise.all(
        plan.map(async ({ w, amount }) => {
          const q = await getQuote(w.address, ETH, { address: t.address, symbol: t.symbol, name: t.name, decimals: t.decimals }, parseEther(amount.toFixed(18)).toString());
          const c = vaultClient(w);
          let last = "";
          for (const s of q.steps) {
            if (s.kind !== "transaction") continue;
            for (const it of s.items) {
              const h = await c.sendTransaction({ to: it.data.to, data: it.data.data, value: BigInt(it.data.value || "0") });
              if ((await pub.waitForTransactionReceipt({ hash: h })).status !== "success") throw new Error(`Swap reverted for ${w.name}`);
              last = h;
            }
          }
          await vaultActions.record(w.address, { address: t.address as `0x${string}`, symbol: t.symbol, name: t.name, decimals: t.decimals, image: t.image ?? null }, { side: "buy", eth: amount, hash: last });
        }),
      );
      return;
    }
    const user = await ensureWallet();
    const wei = parseEther(p.amount || "0");
    if (wei === 0n) throw new Error("Set a quick buy amount");
    const t = pool.token;
    const q = await getQuote(user, ETH, { address: t.address, symbol: t.symbol, name: t.name, decimals: t.decimals }, wei.toString());
    for (const s of q.steps) {
      if (s.kind !== "transaction") continue;
      for (const it of s.items) {
        const h = await sendTransactionAsync({ to: it.data.to, data: it.data.data, value: BigInt(it.data.value || "0"), chainId: chain.id });
        await confirm(h);
      }
    }
  };
}

export const keelMeta = (t: Pick<Token, "address" | "symbol" | "name" | "image">): TokenMeta => ({ address: t.address, symbol: t.symbol, name: t.name, decimals: 18, image: t.image ?? null, keel: true });
export const baseMeta = (t: BasePool["token"]): TokenMeta => ({ address: t.address as `0x${string}`, symbol: t.symbol, name: t.name, decimals: t.decimals, image: t.image ?? null });

async function heldBy(meta: TokenMeta) {
  const ws = vaultSellWallets(load().active);
  if (!ws.length) return [];
  const bals = await vaultPublic().multicall({
    contracts: ws.map((w) => ({ address: meta.address, abi: erc20Abi, functionName: "balanceOf", args: [w.address] }) as const),
    allowFailure: true,
  });
  return ws.map((w, i) => ({ w, raw: (bals[i].result as bigint | undefined) ?? 0n })).filter((x) => x.raw > 0n);
}

/** Sells pct% of a token from every trading wallet that holds it. */
export function useQuickSell() {
  return async (meta: TokenMeta, pct: number) => {
    if (!vaultSellWallets(0).length) throw new Error("Unlock your trading wallets to quick sell");
    const held = await heldBy(meta);
    if (!held.length) throw new Error(`No ${meta.symbol} in your trading wallets`);
    const p = load();
    const slip = p.presets[p.active]?.slippage ?? 15;
    await Promise.all(held.map(({ w, raw }) => vaultSell(w, { meta, raw, amount: 0, usd: 0 }, pct, slip)));
  };
}

function useHeld(meta: TokenMeta, enabled: boolean) {
  const { prefs } = usePrefs();
  return useQuery({
    queryKey: ["qs-held", meta.address.toLowerCase(), prefs.active],
    enabled,
    refetchInterval: 15000,
    queryFn: async () => (await heldBy(meta)).reduce((a, x) => a + x.raw, 0n),
  });
}

/** Quick sell panel for a token page: 25% / 50% / 100% from trading wallets. */
export function QuickSell({ meta }: { meta: TokenMeta }) {
  const v = useVault();
  const sell = useQuickSell();
  const held = useHeld(meta, !!v.data);
  const [s, setS] = useState<{ pct: number; msg: string } | null>(null);
  const go = async (pct: number) => {
    setS({ pct, msg: "busy" });
    try {
      await sell(meta, pct);
      setS({ pct, msg: "ok" });
      held.refetch();
    } catch (e) {
      setS({ pct, msg: errMsg(e) });
    }
    setTimeout(() => setS(null), 5000);
  };
  const amt = held.data ? Number(formatUnits(held.data, meta.decimals)) : 0;
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <div className="mb-2 flex items-center text-xs">
        <span className="font-semibold">Quick sell</span>
        {v.data && <span className="ml-auto font-mono text-dim">Held {held.data == null ? "…" : fmtCompact(amt)} {meta.symbol}</span>}
      </div>
      {!v.data ? (
        <p className="text-xs text-dim">
          Sells straight from your trading wallets, no popup. <Link href="/wallets/" className="text-accent hover:underline">{v.exists ? "Unlock wallets" : "Create a trading wallet"}</Link>
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {SELL_PCTS.map((n) => (
            <button
              key={n}
              onClick={() => go(n)}
              disabled={!!s && s.msg === "busy"}
              className="h-9 rounded-lg border border-down/50 bg-down/10 font-mono text-xs font-semibold text-down hover:bg-down/20 disabled:opacity-50"
            >
              {s?.pct === n && s.msg === "busy" ? "Selling…" : s?.pct === n && s.msg === "ok" ? "Sold" : n === 100 ? "Sell all" : `${n}%`}
            </button>
          ))}
        </div>
      )}
      {s && s.msg !== "busy" && s.msg !== "ok" && <p className="mt-1.5 text-xs text-down">{s.msg}</p>}
    </div>
  );
}

/** Small sell button for list rows; only shown for tokens a trading wallet has bought. */
export function RowSell({ meta, className = "h-8 px-2.5" }: { meta: TokenMeta; className?: string }) {
  const v = useVault();
  const { sellPct } = usePrefs();
  const sell = useQuickSell();
  const [s, setS] = useState("");
  const a = meta.address.toLowerCase();
  const tracked = !!v.data && Object.values(v.data.tokens ?? {}).some((l) => l.some((x) => x.address.toLowerCase() === a));
  if (!tracked) return null;
  const go = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (s === "busy") return;
    setS("busy");
    try {
      await sell(meta, sellPct);
      setS("ok");
    } catch (err) {
      setS(errMsg(err));
    }
    setTimeout(() => setS(""), 4000);
  };
  return (
    <button
      onClick={go}
      title={s && s !== "busy" && s !== "ok" ? s : `Quick sell ${sellPct}% from trading wallets`}
      className={`flex shrink-0 items-center rounded-lg border font-mono text-xs font-semibold ${className} ${s === "ok" ? "border-down bg-down/20 text-down" : s && s !== "busy" ? "border-down/60 text-down" : "border-down/50 bg-down/10 text-down hover:bg-down/20"}`}
    >
      {s === "busy" ? "…" : s === "ok" ? "Sold" : s ? "Failed" : `S ${sellPct}%`}
    </button>
  );
}
