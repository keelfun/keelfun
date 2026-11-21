"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBlockNumber, useGasPrice } from "wagmi";
import { useStats } from "@/lib/api";
import { chain } from "@/lib/config";
import { fmtCompact, fmtUsd } from "@/lib/format";

type Llama = {
  total24h: number; total7d: number; total30d: number; change_1d: number; change_7d: number;
  totalDataChart: [number, number][];
  protocols: { name: string; displayName?: string; logo?: string; total24h?: number; total7d?: number; total30d?: number; change_1d?: number; category?: string }[];
};
const RANGE = [
  ["30d", 30],
  ["90d", 90],
  ["1y", 365],
] as const;

function Card({ label, value, sub, delta }: { label: string; value: string; sub?: string; delta?: number }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between text-xs text-muted">
        {label}
        {delta != null && isFinite(delta) && <span className={delta >= 0 ? "text-up" : "text-down"}>{delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%</span>}
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-1 text-xs text-dim">{sub}</p>}
    </div>
  );
}

export default function ChainPage() {
  const [range, setRange] = useState<number>(30);
  const [hover, setHover] = useState<number | null>(null);
  const { data } = useQuery({
    queryKey: ["llama-base"],
    queryFn: async () => (await (await fetch("https://api.llama.fi/overview/dexs/base?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=true&dataType=dailyVolume")).json()) as Llama,
    refetchInterval: 300000,
    staleTime: 120000,
  });
  const { data: stats } = useStats();
  const block = useBlockNumber({ chainId: chain.id, watch: true });
  const gas = useGasPrice({ chainId: chain.id, query: { refetchInterval: 6000 } });
  const ethUsd = stats?.ethUsd ?? 0;
  const series = (data?.totalDataChart ?? []).slice(-range);
  const max = Math.max(1, ...series.map((d) => d[1]));
  const protos = (data?.protocols ?? []).filter((p) => (p.total24h ?? 0) > 0).sort((a, b) => (b.total24h ?? 0) - (a.total24h ?? 0)).slice(0, 25);
  const h = hover != null ? series[hover] : series[series.length - 1];
  const th = "px-3 py-2.5 text-right text-xs font-normal text-dim";

  return (
    <div className="space-y-5 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold italic">Chain</h1>
        <span className="flex items-center gap-1.5 text-sm text-muted"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-up" />Base, live</span>
        <span className="ml-auto font-mono text-xs text-dim">Block #{block.data?.toLocaleString() ?? "…"} · {gas.data ? `${(Number(gas.data) / 1e9).toFixed(4)} gwei` : "…"}</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div className="rounded-2xl border border-line bg-panel p-5 lg:row-span-2">
          <div className="flex items-center justify-between text-sm text-muted">
            Base DEX volume, 24h
            {data && <span className={data.change_1d >= 0 ? "text-up" : "text-down"}>{data.change_1d >= 0 ? "↑" : "↓"} {Math.abs(data.change_1d).toFixed(1)}%</span>}
          </div>
          <p className="mt-2 text-5xl font-bold tracking-tight">{data ? fmtUsd(data.total24h) : "…"}</p>
          <div className="mt-4 flex items-center justify-between text-xs text-dim">
            <span>{h ? `${new Date(h[0] * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${fmtUsd(h[1])}` : ""}</span>
            <div className="flex rounded-lg border border-line p-0.5">
              {RANGE.map(([l, n]) => (
                <button key={l} onClick={() => setRange(n)} className={`rounded-md px-2 py-0.5 font-mono ${range === n ? "bg-panel-2 text-fg" : "hover:text-fg"}`}>{l}</button>
              ))}
            </div>
          </div>
          <svg viewBox={`0 0 ${Math.max(series.length, 1)} 100`} preserveAspectRatio="none" className="mt-2 h-44 w-full" onMouseLeave={() => setHover(null)}>
            {series.map(([, v], i) => (
              <rect
                key={i}
                x={i + 0.1}
                width={0.8}
                y={100 - (v / max) * 100}
                height={(v / max) * 100}
                onMouseEnter={() => setHover(i)}
                style={{ fill: hover === i ? "var(--color-accent-2)" : "var(--color-accent)", opacity: hover == null || hover === i ? 0.9 : 0.5 }}
              />
            ))}
          </svg>
        </div>
        <Card label="DEX volume, 7d" value={data ? fmtUsd(data.total7d) : "…"} delta={data?.change_7d} />
        <Card label="DEX volume, 30d" value={data ? fmtUsd(data.total30d) : "…"} sub={`${protos.length ? (data?.protocols.filter((p) => (p.total24h ?? 0) > 0).length ?? 0) : "…"} active DEXs`} />
        <Card label="Keelfun volume" value={stats ? fmtUsd(stats.volumeEth * ethUsd) : "…"} sub={stats ? `${stats.trades} trades · ${stats.tokens} tokens` : ""} />
        <Card label="ETH price" value={ethUsd ? `$${ethUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "…"} sub={stats?.btcUsd ? `BTC $${fmtCompact(stats.btcUsd)}` : ""} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">DEXs on Base</h2>
            <p className="text-xs text-dim">USD traded on each DEX</p>
          </div>
        </div>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={`${th} !text-left`}>DEX</th>
              <th className={th}>24h</th>
              <th className={th}>7d</th>
              <th className={th}>30d</th>
              <th className={th}>Change, 1d</th>
              <th className={th}>Share, 24h</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {protos.map((p) => {
              const share = data ? (p.total24h ?? 0) / data.total24h : 0;
              return (
                <tr key={p.name} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-2.5 font-sans">
                    <span className="flex items-center gap-2">
                      {p.logo && <img src={p.logo} alt="" className="h-5 w-5 rounded-full" />}
                      {p.displayName ?? p.name}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">{fmtUsd(p.total24h ?? 0)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtUsd(p.total7d ?? 0)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtUsd(p.total30d ?? 0)}</td>
                  <td className={`px-3 py-2.5 text-right ${(p.change_1d ?? 0) >= 0 ? "text-up" : "text-down"}`}>{p.change_1d != null ? `${p.change_1d >= 0 ? "+" : ""}${p.change_1d.toFixed(1)}%` : "—"}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-panel-2"><span className="block h-full bg-accent" style={{ width: `${Math.min(100, share * 100)}%` }} /></span>
                      {(share * 100).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!data && <p className="p-8 text-center text-sm text-dim">Loading Base data…</p>}
      </div>
      <p className="text-xs text-dim">DEX volumes from DefiLlama. Block and gas read live from Base. Keelfun numbers from the Keelfun indexer.</p>
    </div>
  );
}
