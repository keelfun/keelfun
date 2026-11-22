"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { baseMeta, Bolt, PresetBar, RowSell, usePrefs, useRelayBuy } from "@/components/QuickBuy";
import { LaunchpadChip, PoolAvatar, useLaunchpad } from "@/components/PoolAvatar";
import { DEX_LABEL, fetchBasePools, type BasePool } from "@/lib/basePools";
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
  const lp = useLaunchpad(p.token.address, p.dex);
  return lp ? <LaunchpadChip id={lp} /> : null;
}

export default function TrendingPage() {
  const [dur, setDur] = useState<(typeof DUR)[number]>("1h");
  const [q, setQ] = useState("");
  const [cjk, setCjk] = useState(false);
  const { data: all, isLoading, error } = useQuery({
    queryKey: ["base-trending", dur, q.trim()],
    queryFn: () => fetchBasePools("trending", q.trim(), dur),
    refetchInterval: 30000,
    retry: 3,
    retryDelay: (n) => 2000 * (n + 1),
  });
  const data = cjk ? all?.filter((p) => /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(p.token.name + p.token.symbol)) : all;
  const th = "px-3 py-2.5 text-left text-xs font-normal text-dim";
  return (
    <div className="space-y-4 py-6">
      <div className="flex gap-5 border-b border-line text-sm">
        <span className="-mb-px border-b-2 border-fg pb-2.5">Tokens</span>
        <Link href="/traders/" className="pb-2.5 text-muted hover:text-fg">Traders</Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold italic">Discover</h1>
        <span className="text-sm text-muted">Trending on Base</span>
        <div className="flex rounded-lg border border-line p-0.5">
          {DUR.map((d) => (
            <button key={d} onClick={() => setDur(d)} className={`rounded-md px-2.5 py-1 font-mono text-xs ${dur === d ? "bg-panel-2 text-fg" : "text-dim hover:text-fg"}`}>{d}</button>
          ))}
        </div>
        <button onClick={() => setCjk((v) => !v)} className={`h-8 rounded-lg border px-2.5 text-xs ${cjk ? "border-accent text-accent" : "border-line text-muted hover:text-fg"}`}>中 Chinese names</button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Base tokens" className="h-8 w-48 rounded-lg border border-line bg-bg px-3 text-xs outline-none focus:border-accent" />
        <div className="ml-auto">
          <PresetBar />
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={th}>Pair info</th>
              <th className={th}>Chart</th>
              <th className={`${th} text-right`}>Market cap</th>
              <th className={`${th} text-right`}>Liquidity</th>
              <th className={`${th} text-right`}>Volume</th>
              <th className={`${th} text-right`}>TXNS</th>
              <th className={`${th} text-right`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((p) => (
              <tr key={p.pool} className="border-b border-line/60 last:border-0 hover:bg-panel-2/50">
                <td className="px-3 py-2.5">
                  <Link href={`/pair/?p=${p.pool}`} className="flex items-center gap-3">
                    <PoolAvatar token={p.token} dex={p.dex} dexLabel={DEX_LABEL[p.dex] ?? p.dex.replace(/-base$/, "").slice(0, 8)} size={44} />
                    <div className="min-w-0">
                      <p className="truncate"><b>{p.token.symbol}</b> <span className="text-xs text-dim">{p.token.name}</span></p>
                      <p className="text-xs text-muted"><span className="text-up">{p.createdAt ? timeAgo(p.createdAt) : "—"}</span> · /{p.quote} <Lp p={p} /></p>
                    </div>
                  </Link>
                </td>
                <td className="px-3 py-2.5"><Spark p={p} /></td>
                <td className="px-3 py-2.5 text-right font-mono">
                  <p>{fmtUsd(p.mcUsd)}</p>
                  <p className={`text-xs ${p.chg24 >= 0 ? "text-up" : "text-down"}`}>{p.chg24 >= 0 ? "+" : ""}{p.chg24.toFixed(2)}%</p>
                </td>
                <td className="px-3 py-2.5 text-right font-mono">{fmtUsd(p.liqUsd)}</td>
                <td className="px-3 py-2.5 text-right font-mono">{fmtUsd(p.vol24)}</td>
                <td className="px-3 py-2.5 text-right font-mono">
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
        {isLoading && <p className="p-8 text-center text-sm text-dim">Loading Base tokens…</p>}
        {data && !data.length && !isLoading && <p className="p-8 text-center text-sm text-dim">No tokens match.</p>}
        {error && !data && <p className="p-8 text-center text-sm text-dim">{(error as Error).message}</p>}
      </div>
      <p className="text-xs text-dim">Data from GeckoTerminal. Anyone can create a token on Base, including copies of real names. Check the contract before buying.</p>
    </div>
  );
}
