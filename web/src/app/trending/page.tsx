"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { baseMeta, Bolt, PresetBar, RowSell, usePrefs, useRelayBuy } from "@/components/QuickBuy";
import { LaunchpadChip, PoolAvatar, useLaunchpad } from "@/components/PoolAvatar";
import { DEX_LABEL, fetchBasePools, fetchPoolsByAddr, fetchPoolsByToken, type BasePool } from "@/lib/basePools";
import { useSet } from "@/lib/sets";
import { addrOnNet, NETS, pairHref, useNet } from "@/lib/net";
import { fmtCompact, fmtPrice, fmtUsd, timeAgo } from "@/lib/format";
import { errMsg } from "@/lib/tx";

const DUR = ["5m", "1h", "6h", "24h"] as const;

function Spark({ p }: { p: BasePool }) {
  const now = p.priceUsd;
  const pts = [p.chg24, p.chg6h, p.chg1h, p.chg5m, 0].map((c) => (c > -100 ? now / (1 + c / 100) : now));
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const y = (v: number) => (hi === lo ? 14 : 26 - ((v - lo) / (hi - lo)) * 24);
  const d = pts.map((v, i) => `${i ? "L" : "M"}${(i / (pts.length - 1)) * 76 + 2},${y(v).toFixed(1)}`).join(" ");
  const up = p.chg24 >= 0;
  const c = up ? "var(--color-up)" : "var(--color-down)";
  return (
    <svg viewBox="0 0 80 28" className="h-7 w-20">
      <path d={`${d} L78,28 L2,28 Z`} style={{ fill: c, opacity: 0.12 }} />
      <path d={d} fill="none" style={{ stroke: c }} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function BuyBtn({ p }: { p: BasePool }) {
  const { preset } = usePrefs();
  const relay = useRelayBuy();
  const [s, setS] = useState("");
  const go = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (s === "busy") return;
    setS("busy");
    try {
      await relay(p, preset);
      setS("ok");
    } catch (err) {
      setS(errMsg(err));
    }
    setTimeout(() => setS(""), 4000);
  };
  return (
    <button
      onClick={go}
      title={s && s !== "busy" && s !== "ok" ? s : `Quick buy ${preset.amount} ETH`}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-4 font-mono text-xs font-semibold ${s === "ok" ? "border-up bg-up/20 text-up" : s && s !== "busy" ? "border-down/60 text-down" : "border-up/50 bg-up/10 text-up hover:bg-up/20"}`}
    >
      <Bolt />
      {s === "busy" ? "…" : s === "ok" ? "Bought" : s ? "Failed" : `${preset.amount} ETH`}
    </button>
  );
}

function Lp({ p }: { p: BasePool }) {
  const lp = useLaunchpad(p.token.address, p.dex, p.net);
  return lp ? <LaunchpadChip id={lp} /> : null;
}

export default function TrendingPage() {
  const [dur, setDur] = useState<(typeof DUR)[number]>("1h");
  const [q, setQ] = useState("");
  const [cjk, setCjk] = useState(false);
  const [tab, setTab] = useState<"trending" | "watch" | "recent">("trending");
  const net = useNet();
  const watchAll = useSet("keel-watch");
  const recentAll = useSet("keel-recent");
  const watch = watchAll.filter((a) => addrOnNet(a, net));
  const recent = recentAll.filter((a) => addrOnNet(a, net));
  const { data: all, isLoading, error } = useQuery({
    queryKey: ["base-market", net, tab, dur, q.trim(), tab === "watch" ? watch.join() : tab === "recent" ? recent.join() : ""],
    queryFn: () => (tab === "watch" ? fetchPoolsByToken(watch, net) : tab === "recent" ? fetchPoolsByAddr(recent, net) : fetchBasePools("trending", q.trim(), dur, net)),
    refetchInterval: 30000,
    retry: 3,
    retryDelay: (n) => 2000 * (n + 1),
  });
  const data = cjk ? all?.filter((p) => /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(p.token.name + p.token.symbol)) : all;
  const th = "px-3 py-2.5 text-left text-xs font-normal text-dim";
  return (
    <div className="space-y-4 py-6">
      <div className="flex gap-5 border-b border-line text-sm">
        {([["trending", "Trending"], ["watch", `★ Watchlist${watch.length ? ` ${watch.length}` : ""}`], ["recent", "Recents"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 pb-2.5 ${tab === k ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"}`}>{l}</button>
        ))}
        <Link href="/traders/" className="ml-auto pb-2.5 text-muted hover:text-fg">Traders</Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold italic">Market</h1>
        <span className="text-sm text-muted">Trending on {NETS[net].label}</span>
        <div className="flex rounded-lg border border-line p-0.5">
          {DUR.map((d) => (
            <button key={d} onClick={() => setDur(d)} className={`rounded-md px-2.5 py-1 font-mono text-xs ${dur === d ? "bg-panel-2 text-fg" : "text-dim hover:text-fg"}`}>{d}</button>
          ))}
        </div>
        <button onClick={() => setCjk((v) => !v)} className={`h-8 rounded-lg border px-2.5 text-xs ${cjk ? "border-accent text-accent-fg" : "border-line text-muted hover:text-fg"}`}>中 Chinese names</button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${NETS[net].label} tokens`} className="h-8 w-48 rounded-lg border border-line bg-bg px-3 text-xs outline-none focus:border-accent" />
        <div className="ml-auto">
          <PresetBar />
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
        <table className="w-full sm:min-w-[860px] text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={th}>Pair info</th>
              <th className={`${th} hidden sm:table-cell`}>Chart</th>
              <th className={`${th} text-right`}>Market cap</th>
              <th className={`${th} text-right hidden sm:table-cell`}>Liquidity</th>
              <th className={`${th} text-right hidden sm:table-cell`}>Volume</th>
              <th className={`${th} text-right hidden sm:table-cell`}>TXNS</th>
              <th className={`${th} text-right`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((p) => (
              <tr key={p.pool} className="border-b border-line/60 last:border-0 hover:bg-panel-2/50">
                <td className="px-3 py-2.5">
                  <Link href={pairHref(p.pool, p.net)} className="flex items-center gap-2 sm:gap-3">
                    <PoolAvatar net={p.net} token={p.token} dex={p.dex} dexLabel={DEX_LABEL[p.dex] ?? p.dex.replace(/-(base|ethereum|eth|solana)$/, "").slice(0, 8)} size={44} />
                    <div className="min-w-0 max-w-[8.5rem] sm:max-w-none">
                      <p className="truncate"><b>{p.token.symbol}</b> <span className="hidden text-xs text-dim sm:inline">{p.token.name}</span></p>
                      <p className="truncate text-xs text-muted"><span className="text-up">{p.createdAt ? timeAgo(p.createdAt) : "—"}</span> · /{p.quote} <Lp p={p} /></p>
                    </div>
                  </Link>
                </td>
                <td className="px-3 py-2.5 hidden sm:table-cell"><Spark p={p} /></td>
                <td className="px-3 py-2.5 text-right font-mono">
                  <p>{fmtUsd(p.mcUsd)}</p>
                  <p className={`text-xs ${p.chg24 >= 0 ? "text-up" : "text-down"}`}>{p.chg24 >= 0 ? "+" : ""}{p.chg24.toFixed(2)}%</p>
                </td>
                <td className="px-3 py-2.5 text-right font-mono hidden sm:table-cell">{fmtUsd(p.liqUsd)}</td>
                <td className="px-3 py-2.5 text-right font-mono hidden sm:table-cell">{fmtUsd(p.vol24)}</td>
                <td className="px-3 py-2.5 text-right font-mono hidden sm:table-cell">
                  <p>{fmtCompact(p.buys + p.sells, 1)}</p>
                  <p className="text-xs"><span className="text-up">{fmtCompact(p.buys, 1)}</span> / <span className="text-down">{fmtCompact(p.sells, 1)}</span></p>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="hidden font-mono text-xs text-dim xl:inline">${fmtPrice(p.priceUsd)}</span>
                    <BuyBtn p={p} />
                    <RowSell meta={baseMeta(p.token)} className="h-9 rounded-full px-3" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && <p className="p-8 text-center text-sm text-dim">Loading {NETS[net].label} tokens…</p>}
        {data && !data.length && !isLoading && <p className="p-8 text-center text-sm text-dim">{tab === "watch" ? "Your watchlist is empty. Star tokens in Pulse to add them." : tab === "recent" ? "Tokens you open will show up here." : "No tokens match."}</p>}
        {error && !data && <p className="p-8 text-center text-sm text-dim">{(error as Error).message}</p>}
      </div>
      <p className="text-xs text-dim">Data from GeckoTerminal. Anyone can create a token on {NETS[net].label}, including copies of real names. Check the contract before buying.</p>
    </div>
  );
}
