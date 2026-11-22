"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TokenAvatar } from "@/components/TokenAvatar";
import { api } from "@/lib/api";
import { fmtPct, fmtUsd, shortAddr, timeAgo } from "@/lib/format";

type Trader = {
  wallet: string; pnlEth: number; pnlPct: number; unrealizedEth: number; open: number; volumeEth: number; wins: number; losses: number;
  buys: number; sells: number; best: { symbol: string; image: string | null; pnl: number } | null; lastTs: number; dev: boolean; maxDd?: number; bot?: boolean;
};
const DD = [["any", "Any", 2], ["25", "≤ 25%", 0.25], ["50", "≤ 50%", 0.5], ["75", "≤ 75%", 0.75]] as const;
const WIN = ["1d", "7d", "30d", "all"] as const;

function Ident({ a }: { a: string }) {
  const h = parseInt(a.slice(2, 8), 16);
  const color = `hsl(${h % 360} 70% 60%)`;
  const bits = parseInt(a.slice(8, 16), 16);
  return (
    <svg viewBox="0 0 5 5" className="h-7 w-7 rounded-md bg-panel-2" shapeRendering="crispEdges">
      {Array.from({ length: 15 }, (_, i) => {
        if (!((bits >> i) & 1)) return null;
        const x = i % 3, y = Math.floor(i / 3);
        return (
          <g key={i} style={{ fill: color }}>
            <rect x={x} y={y} width="1" height="1" />
            <rect x={4 - x} y={y} width="1" height="1" />
          </g>
        );
      })}
    </svg>
  );
}

export default function TradersPage() {
  const [win, setWin] = useState<(typeof WIN)[number]>("7d");
  const [tracked, setTracked] = useState<string[]>([]);
  const [dd, setDd] = useState<(typeof DD)[number][0]>("any");
  const [bots, setBots] = useState(true);
  useEffect(() => {
    try {
      setTracked(JSON.parse(localStorage.getItem("keel-tracked") || "[]"));
    } catch {}
  }, []);
  const track = (w: string) => {
    const n = tracked.includes(w) ? tracked.filter((x) => x !== w) : [...tracked, w];
    setTracked(n);
    localStorage.setItem("keel-tracked", JSON.stringify(n));
  };
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["traders", win],
    queryFn: () => api<{ traders: Trader[]; ethUsd: number }>(`/traders?window=${win}`),
    refetchInterval: 30000,
  });
  const lim = DD.find((d) => d[0] === dd)![2];
  const rows = data?.traders.filter((t) => (t.maxDd ?? 0) <= lim && (bots || !t.bot));
  const usd = (eth: number) => fmtUsd(eth * (data?.ethUsd ?? 0));
  const signed = (eth: number) => `${eth > 0 ? "+" : eth < 0 ? "-" : ""}${usd(Math.abs(eth))}`;
  const th = "px-3 py-2.5 text-left text-xs font-normal text-dim";
  return (
    <div className="space-y-4 py-6">
      <div className="flex gap-5 border-b border-line text-sm">
        <Link href="/discover/" className="pb-2.5 text-muted hover:text-fg">Tokens</Link>
        <span className="-mb-px border-b-2 border-fg pb-2.5">Traders</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold italic">Traders</h1>
        <div className="flex rounded-lg border border-line p-0.5">
          {WIN.map((w) => (
            <button key={w} onClick={() => setWin(w)} className={`rounded-md px-2.5 py-1 font-mono text-xs ${win === w ? "bg-panel-2 text-fg" : "text-dim hover:text-fg"}`}>{w === "all" ? "All" : w}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Max DD
          <select value={dd} onChange={(e) => setDd(e.target.value as typeof dd)} className="h-7 rounded-lg border border-line bg-panel px-2 text-xs text-fg outline-none">
            {DD.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <button onClick={() => setBots((v) => !v)} className={`h-7 rounded-lg border px-2.5 text-xs ${bots ? "border-line text-muted hover:text-fg" : "border-accent text-accent-fg"}`}>
          {bots ? "Bots shown" : "Bots hidden"}
        </button>
        <span className="ml-auto text-xs text-dim">{dataUpdatedAt ? `Updated ${timeAgo(Math.floor(dataUpdatedAt / 1000))} ago` : ""}</span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={th}>#</th>
              <th className={th}>Wallet</th>
              <th className={`${th} text-right`}>PnL</th>
              <th className={`${th} text-right`}>Unrealized</th>
              <th className={`${th} text-right`}>Volume</th>
              <th className={`${th} text-right`}>Win rate</th>
              <th className={`${th} text-right`}>Max DD</th>
              <th className={th}>Best trade</th>
              <th className={`${th} text-right`}>Last active</th>
              <th className={`${th} text-right`}>Action</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows?.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-10 text-center font-sans text-muted">No traders match these filters</td></tr>
            )}
            {rows?.map((t, i) => {
              const total = t.wins + t.losses;
              return (
                <tr key={t.wallet} className="border-b border-line/60 last:border-0 hover:bg-panel-2/50">
                  <td className="px-3 py-3 text-muted">{i + 1}</td>
                  <td className="px-3 py-3">
                    <Link href={`/portfolio/?w=${t.wallet}`} className="flex items-center gap-2.5 hover:text-accent-fg">
                      <Ident a={t.wallet} />
                      <span>
                        <span className="block">{shortAddr(t.wallet)}</span>
                        {t.dev && <span className="mt-0.5 mr-1 inline-block rounded bg-warn/15 px-1 text-[10px] text-warn">DEV</span>}
                        {t.bot && <span className="mt-0.5 inline-block rounded bg-panel-2 px-1 text-[10px] text-muted">BOT</span>}
                      </span>
                    </Link>
                  </td>
                  <td className={`px-3 py-3 text-right ${t.pnlEth >= 0 ? "text-up" : "text-down"}`}>
                    <p>{signed(t.pnlEth)}</p>
                    <p className="text-xs">{fmtPct(t.pnlPct)}</p>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <p className={t.unrealizedEth >= 0 ? "text-muted" : "text-down"}>{signed(t.unrealizedEth)}</p>
                    <p className="text-xs text-dim">{t.open ? `${t.open} open` : "none open"}</p>
                  </td>
                  <td className="px-3 py-3 text-right">{usd(t.volumeEth)}</td>
                  <td className="px-3 py-3 text-right">
                    <p>{total ? Math.round((t.wins / total) * 100) : 0}%</p>
                    <p className="text-xs"><span className="text-up">{t.wins}</span> / <span className="text-down">{t.losses}</span></p>
                  </td>
                  <td className={`px-3 py-3 text-right ${(t.maxDd ?? 0) > 0.5 ? "text-down" : "text-muted"}`}>{Math.round((t.maxDd ?? 0) * 100)}%</td>
                  <td className="px-3 py-3">
                    {t.best && (
                      <span className="flex items-center gap-1.5 font-sans">
                        <TokenAvatar src={t.best.image} symbol={t.best.symbol} size={20} />
                        <span className="max-w-20 truncate">{t.best.symbol}</span>
                        <span className={`font-mono text-xs ${t.best.pnl >= 0 ? "text-up" : "text-down"}`}>{signed(t.best.pnl)}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right text-muted">{timeAgo(t.lastTs)}</td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => track(t.wallet)} className={`rounded-md border px-2 py-1 font-sans text-xs ${tracked.includes(t.wallet) ? "border-accent text-accent-fg" : "border-line text-muted hover:text-fg"}`}>
                      {tracked.includes(t.wallet) ? "Tracking" : "Track"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {isLoading && <p className="p-8 text-center text-sm text-dim">Loading traders…</p>}
        {data && data.traders.length === 0 && <p className="p-8 text-center text-sm text-dim">No trades in this window yet.</p>}
      </div>
      <p className="text-xs text-dim">Trades in Keelfun pools only. PnL = realized (sells minus average cost) plus unrealized (held tokens at the current price). Tracked wallets show up in the Terminal wallet tracker.</p>
    </div>
  );
}
