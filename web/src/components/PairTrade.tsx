"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { erc20Abi, formatUnits } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { baseMeta, Bolt, PresetBar, QuickSell, usePrefs, useRelayBuy } from "./QuickBuy";
import { useStats } from "@/lib/api";
import type { PoolDetail, PoolTrade } from "@/lib/basePools";
import { chain, EXPLORER } from "@/lib/config";
import { fmtCompact, fmtPrice, fmtUsd, shortAddr, timeAgo } from "@/lib/format";
import { useSet } from "@/lib/sets";
import { errMsg } from "@/lib/tx";
import { useVault } from "@/lib/vault";

type Sec = Record<string, any>;
export function useSecurity(token?: string) {
  return useQuery({
    queryKey: ["goplus", token],
    queryFn: async () => {
      const r = await fetch(`https://api.gopluslabs.io/api/v1/token_security/${chain.id}?contract_addresses=${token}`);
      const j = await r.json();
      return (j.result?.[token!.toLowerCase()] ?? null) as Sec | null;
    },
    enabled: !!token,
    staleTime: 300_000,
    retry: 1,
  });
}

const DEAD = /^0x0{40}$|^0x0{36}dead$/i;
const pct = (v: unknown) => (v == null || v === "" ? null : Number(v) * 100);

export function SecurityCard({ p, sec, loading }: { p: PoolDetail; sec: Sec | null | undefined; loading: boolean }) {
  const top10 = sec?.holders ? (sec.holders as any[]).slice(0, 10).reduce((s, h) => s + Number(h.percent || 0) * 100, 0) : null;
  const buyTax = pct(sec?.buy_tax);
  const sellTax = pct(sec?.sell_tax);
  const flag = (v: unknown, yes: string, no: string, bad = "1"): [string, "good" | "bad" | "warn" | null] => (v == null || v === "" ? ["—", null] : v === bad ? [yes, "bad"] : [no, "good"]);
  const rows: [string, [string, "good" | "bad" | "warn" | null]][] = [
    ["Honeypot", flag(sec?.is_honeypot, "Yes", "No")],
    ["Buy / sell tax", buyTax == null ? ["—", null] : [`${buyTax.toFixed(1)}% / ${(sellTax ?? 0).toFixed(1)}%`, buyTax > 10 || (sellTax ?? 0) > 10 ? "bad" : "good"]],
    ["Contract verified", flag(sec?.is_open_source, "No", "Yes", "0")],
    ["Mintable", flag(sec?.is_mintable, "Yes", "No")],
    ["Owner", sec ? (!sec.owner_address || DEAD.test(sec.owner_address) ? ["Renounced", "good"] : [shortAddr(sec.owner_address), "warn"]) : ["—", null]],
    ["Proxy contract", sec?.is_proxy === "1" ? ["Yes", "warn"] : flag(sec?.is_proxy, "Yes", "No")],
    ["Holders", sec?.holder_count ? [fmtCompact(Number(sec.holder_count)), null] : ["—", null]],
    ["Top 10 holders", top10 == null ? ["—", null] : [`${top10.toFixed(1)}%`, top10 > 50 ? "warn" : "good"]],
    ["Creator holds", pct(sec?.creator_percent) == null ? ["—", null] : [`${pct(sec?.creator_percent)!.toFixed(2)}%`, pct(sec?.creator_percent)! > 10 ? "warn" : "good"]],
    ["LP locked", p.lockedPct == null ? ["—", null] : [`${p.lockedPct.toFixed(0)}%`, p.lockedPct >= 90 ? "good" : "warn"]],
  ];
  const tone = { good: "text-up", bad: "text-down", warn: "text-warn" } as const;
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <div className="mb-2 flex items-center text-xs">
        <span className="font-semibold">Security info</span>
        {loading && <span className="ml-auto text-dim">checking…</span>}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        {rows.map(([k, [v, t]]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className={`text-right font-mono ${t ? tone[t] : "text-fg"}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[10px] text-dim">Checks by GoPlus. Not a guarantee, always verify the contract.</p>
    </div>
  );
}

function usePosition(p: PoolDetail) {
  const v = useVault();
  const ws = v.data?.wallets ?? [];
  const a = p.token.address.toLowerCase();
  const bal = useReadContracts({
    contracts: ws.map((w) => ({ address: p.token.address as `0x${string}`, abi: erc20Abi, functionName: "balanceOf", args: [w.address], chainId: chain.id }) as const),
    query: { enabled: ws.length > 0, refetchInterval: 15000 },
  });
  const held = (bal.data ?? []).reduce((s, x) => s + (x.status === "success" ? Number(formatUnits(x.result as bigint, p.token.decimals)) : 0), 0);
  const acts = (v.data?.activity ?? []).filter((x) => x.token === a);
  const bought = acts.filter((x) => x.side === "buy").reduce((s, x) => s + (x.eth ?? 0), 0);
  const sold = acts.filter((x) => x.side === "sell").reduce((s, x) => s + (x.eth ?? 0), 0);
  return { unlocked: !!v.data, held, bought, sold };
}

export function TradePanel({ p }: { p: PoolDetail }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const { prefs, preset } = usePrefs();
  const relay = useRelayBuy();
  const v = useVault();
  const [amt, setAmt] = useState("");
  const [s, setS] = useState("");
  const ethUsd = useStats().data?.ethUsd ?? 0;
  const pos = usePosition(p);
  const amount = amt || preset.amount;
  const chips = [...new Set([...prefs.presets.map((x) => x.amount), "0.001", "0.005", "0.01", "0.05"].filter((x) => Number(x) > 0))].sort((a, b) => Number(a) - Number(b)).slice(0, 6);
  const go = async () => {
    setS("busy");
    try {
      await relay(p, { ...preset, amount });
      setS("ok");
    } catch (e) {
      setS(errMsg(e));
    }
    setTimeout(() => setS(""), 5000);
  };
  const holdUsd = pos.held * p.priceUsd;
  const pnl = ethUsd ? holdUsd + (pos.sold - pos.bought) * ethUsd : 0;
  return (
    <div className="space-y-3 rounded-xl border border-line bg-panel p-3">
      <div className="grid grid-cols-2 rounded-lg bg-bg p-0.5 text-sm font-semibold">
        {(["buy", "sell"] as const).map((k) => (
          <button key={k} onClick={() => setSide(k)} className={`rounded-md py-1.5 capitalize ${side === k ? (k === "buy" ? "bg-up/15 text-up" : "bg-down/15 text-down") : "text-muted hover:text-fg"}`}>{k}</button>
        ))}
      </div>
      {side === "buy" ? (
        <>
          <div className="flex items-center rounded-lg border border-line bg-bg px-3 focus-within:border-accent">
            <input value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={preset.amount} inputMode="decimal" className="h-10 min-w-0 flex-1 bg-transparent font-mono text-sm outline-none" />
            <span className="text-xs text-dim">ETH</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {chips.map((c) => (
              <button key={c} onClick={() => setAmt(c)} className={`h-8 rounded-md border font-mono text-xs ${amount === c ? "border-accent text-accent-fg" : "border-line text-muted hover:text-fg"}`}>{c}</button>
            ))}
          </div>
          <button onClick={go} disabled={s === "busy"} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-up font-semibold text-bg disabled:opacity-60">
            <Bolt className="h-4 w-4" />
            {s === "busy" ? "Buying…" : s === "ok" ? "Bought" : `Buy ${p.token.symbol} · ${amount} ETH`}
          </button>
          {s && s !== "busy" && s !== "ok" && <p className="text-xs text-down">{s}</p>}
          <p className="text-[11px] text-dim">
            {v.data ? `From your P${prefs.active + 1} trading wallets, no popup.` : <>From your connected wallet. <Link href="/wallets/" className="text-accent-fg hover:underline">Set up trading wallets</Link> for one-click buys.</>}
          </p>
        </>
      ) : (
        <QuickSell meta={baseMeta(p.token)} />
      )}
      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <span className="text-xs text-dim">Preset</span>
        <PresetBar compact />
      </div>
      {pos.unlocked && (
        <div className="grid grid-cols-4 gap-1 border-t border-line pt-3 text-center">
          {[
            ["Bought", ethUsd ? fmtUsd(pos.bought * ethUsd) : "—", "text-up"],
            ["Sold", ethUsd ? fmtUsd(pos.sold * ethUsd) : "—", "text-down"],
            ["Holding", fmtUsd(holdUsd), "text-fg"],
            ["PnL", ethUsd && pos.bought ? `${pnl >= 0 ? "+" : ""}${fmtUsd(pnl)}` : "—", pnl >= 0 ? "text-up" : "text-down"],
          ].map(([k, val, c]) => (
            <div key={k}>
              <p className="text-[10px] text-dim">{k}</p>
              <p className={`font-mono text-xs ${c}`}>{val}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PairTabs({ p, trades, loading, sec }: { p: PoolDetail; trades: PoolTrade[] | undefined; loading: boolean; sec: Sec | null | undefined }) {
  const [tab, setTab] = useState<"trades" | "traders" | "holders">("trades");
  const [who, setWho] = useState<"all" | "dev" | "tracked" | "you">("all");
  const tracked = useSet("keel-tracked");
  const v = useVault();
  const { address } = useAccount();
  const mine = new Set([...(v.data?.wallets ?? []).map((w) => w.address.toLowerCase()), ...(address ? [address.toLowerCase()] : [])]);
  const dev = String(sec?.creator_address ?? "").toLowerCase();
  const tag = (a: string) => (a === dev ? "DEV" : mine.has(a) ? "YOU" : tracked.includes(a) ? "TRACKED" : null);
  const rows = (trades ?? []).filter((r) => {
    const a = r.from.toLowerCase();
    return who === "all" || (who === "dev" ? a === dev : who === "you" ? mine.has(a) : tracked.includes(a));
  });
  const traders = Object.values(
    (trades ?? []).reduce<Record<string, { a: string; bought: number; sold: number; n: number }>>((m, r) => {
      const a = r.from.toLowerCase();
      const x = (m[a] ??= { a, bought: 0, sold: 0, n: 0 });
      if (r.kind === "buy") x.bought += r.usd;
      else x.sold += r.usd;
      x.n++;
      return m;
    }, {}),
  ).sort((a, b) => b.bought + b.sold - (a.bought + a.sold)).slice(0, 50);
  const holders = (sec?.holders ?? []) as { address: string; tag?: string; percent: string; is_contract?: number; is_locked?: number }[];
  const th = "px-3 py-2 font-normal";
  const Tag = ({ a }: { a: string }) => {
    const t = tag(a);
    return t ? <span className={`ml-1.5 rounded px-1 py-px font-sans text-[9px] font-semibold ${t === "DEV" ? "bg-warn/15 text-warn" : t === "YOU" ? "bg-accent/25 text-accent-fg" : "bg-panel-2 text-muted"}`}>{t}</span> : null;
  };
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-3 text-sm">
        {([["trades", "Trades"], ["traders", "Top traders"], ["holders", `Holders${sec?.holder_count ? ` ${fmtCompact(Number(sec.holder_count))}` : ""}`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 py-2.5 ${tab === k ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"}`}>{l}</button>
        ))}
        {tab === "trades" && (
          <div className="ml-auto flex gap-1 py-1.5 text-[11px]">
            {(["all", "dev", "tracked", "you"] as const).map((k) => (
              <button key={k} onClick={() => setWho(k)} className={`rounded-md border px-2 py-0.5 uppercase ${who === k ? "border-accent text-accent-fg" : "border-line text-dim hover:text-fg"}`}>{k}</button>
            ))}
          </div>
        )}
      </div>
      <div className="max-h-[520px] overflow-auto">
        {tab === "trades" && (
          <table className="w-full min-w-[560px] text-xs tabular-nums">
            <thead className="sticky top-0 bg-panel text-muted">
              <tr className="border-b border-line">
                <th className={`${th} text-left`}>Time</th>
                <th className={`${th} text-left`}>Type</th>
                <th className={`${th} text-right`}>Price</th>
                <th className={`${th} text-right`}>Amount</th>
                <th className={`${th} text-right`}>Value</th>
                <th className={`${th} text-right`}>Wallet</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {rows.map((r) => (
                <tr key={r.tx + r.from + r.usd} className="border-b border-line/60">
                  <td className="px-3 py-2 text-muted"><a href={`${EXPLORER}/tx/${r.tx}`} target="_blank" rel="noreferrer" className="hover:text-fg">{timeAgo(r.ts)} ago ↗</a></td>
                  <td className={`px-3 py-2 font-sans ${r.kind === "buy" ? "text-up" : "text-down"}`}>{r.kind === "buy" ? "Buy" : "Sell"}</td>
                  <td className="px-3 py-2 text-right">${fmtPrice(r.priceUsd)}</td>
                  <td className="px-3 py-2 text-right">{fmtCompact(r.tokenAmount)} <span className="text-dim">{p.token.symbol}</span></td>
                  <td className={`px-3 py-2 text-right ${r.kind === "buy" ? "text-up" : "text-down"}`}>{fmtUsd(r.usd)}</td>
                  <td className="px-3 py-2 text-right"><Link href={`/portfolio/?w=${r.from}`} className="text-muted hover:text-accent-fg">{shortAddr(r.from)}</Link><Tag a={r.from.toLowerCase()} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "traders" && (
          <table className="w-full min-w-[480px] text-xs tabular-nums">
            <thead className="sticky top-0 bg-panel text-muted">
              <tr className="border-b border-line">
                <th className={`${th} text-left`}>Wallet</th>
                <th className={`${th} text-right`}>Bought</th>
                <th className={`${th} text-right`}>Sold</th>
                <th className={`${th} text-right`}>Net</th>
                <th className={`${th} text-right`}>Trades</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {traders.map((t) => (
                <tr key={t.a} className="border-b border-line/60">
                  <td className="px-3 py-2"><Link href={`/portfolio/?w=${t.a}`} className="text-muted hover:text-accent-fg">{shortAddr(t.a)}</Link><Tag a={t.a} /></td>
                  <td className="px-3 py-2 text-right text-up">{fmtUsd(t.bought)}</td>
                  <td className="px-3 py-2 text-right text-down">{fmtUsd(t.sold)}</td>
                  <td className={`px-3 py-2 text-right ${t.sold - t.bought >= 0 ? "text-up" : "text-down"}`}>{t.sold - t.bought >= 0 ? "+" : "-"}{fmtUsd(Math.abs(t.sold - t.bought))}</td>
                  <td className="px-3 py-2 text-right text-muted">{t.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "holders" && (
          <table className="w-full min-w-[420px] text-xs tabular-nums">
            <thead className="sticky top-0 bg-panel text-muted">
              <tr className="border-b border-line">
                <th className={`${th} text-left`}>#</th>
                <th className={`${th} text-left`}>Holder</th>
                <th className={`${th} text-right`}>Share</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {holders.map((h, i) => {
                const a = h.address.toLowerCase();
                const share = Number(h.percent) * 100;
                return (
                  <tr key={a} className="border-b border-line/60">
                    <td className="px-3 py-2 text-dim">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link href={`/portfolio/?w=${a}`} className="text-muted hover:text-accent-fg">{shortAddr(a)}</Link>
                      <Tag a={a} />
                      {(h.tag || h.is_locked || h.is_contract) && <span className="ml-1.5 font-sans text-[10px] text-dim">{h.tag || (h.is_locked ? "locked" : "contract")}</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-2">
                        <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-panel-2 sm:block"><span className="block h-full bg-accent" style={{ width: `${Math.min(100, share)}%` }} /></span>
                        {share.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {loading && <p className="p-6 text-center text-xs text-dim">Loading…</p>}
        {!loading && tab === "trades" && !rows.length && <p className="p-6 text-center text-xs text-dim">{who === "all" ? "No trades yet." : `No ${who} trades in the latest ${trades?.length ?? 0}.`}</p>}
        {tab === "traders" && traders.length > 0 && <p className="px-3 py-2 text-[10px] text-dim">From the latest {trades?.length} trades.</p>}
        {tab === "holders" && !holders.length && <p className="p-6 text-center text-xs text-dim">{sec === undefined ? "Loading holders…" : "Holder data unavailable for this token."}</p>}
      </div>
    </div>
  );
}
