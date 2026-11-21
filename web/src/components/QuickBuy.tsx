"use client";
import { useEffect, useState } from "react";
import { parseEther } from "viem";
import { usePublicClient, useSendTransaction, useWriteContract } from "wagmi";
import { ETH, getQuote } from "@/components/AnySwap";
import { launchRouterAbi } from "@/lib/abis";
import type { Token } from "@/lib/api";
import type { BasePool } from "@/lib/basePools";
import { ADDR, chain } from "@/lib/config";
import { useConfirm, useEnsureWallet } from "@/lib/tx";
import { vaultClient, vaultPlan, vaultPublic } from "@/lib/vault";

export type Preset = { amount: string; slippage: number };
type Prefs = { active: number; presets: Preset[] };
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
  const { prefs, preset, setActive, setPreset } = usePrefs();
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
          <p className="text-[11px] leading-relaxed text-dim">Slippage applies to Keelfun pools. Other Base tokens route through Relay with its own price protection.</p>
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
          for (const s of q.steps) {
            if (s.kind !== "transaction") continue;
            for (const it of s.items) {
              const h = await c.sendTransaction({ to: it.data.to, data: it.data.data, value: BigInt(it.data.value || "0") });
              if ((await pub.waitForTransactionReceipt({ hash: h })).status !== "success") throw new Error(`Swap reverted for ${w.name}`);
            }
          }
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
