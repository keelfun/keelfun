"use client";
/* eslint-disable @next/next/no-img-element */
import { pushRecent, toggleSet, useSet } from "@/lib/sets";
import { normAddr, type Net } from "@/lib/net";
import { PairTabs, SecurityCard, TradePanel, useSecurity } from "@/components/PairTrade";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CandlestickSeries, ColorType, createChart, HistogramSeries, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { AnySwap } from "@/components/AnySwap";
import { TokenAvatar } from "@/components/TokenAvatar";
import { api, type Token } from "@/lib/api";
import { DEX_LABEL, fetchOhlcv, fetchPool, fetchPoolTrades, fetchTokenTopPool, type PoolDetail } from "@/lib/basePools";
import { explorerToken, getNet, NETS, parseNet, setNet } from "@/lib/net";
import { fmtCompact, fmtPrice, fmtUsd, shortAddr, timeAgo } from "@/lib/format";

const TF = [
  { l: "1m", tf: "minute", a: 1 },
  { l: "5m", tf: "minute", a: 5 },
  { l: "15m", tf: "minute", a: 15 },
  { l: "1h", tf: "hour", a: 1 },
  { l: "4h", tf: "hour", a: 4 },
  { l: "1d", tf: "day", a: 1 },
] as const;
const css = (v: string, fb: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb;

function Chart({ pool, supply, net }: { pool: string; supply: number; net: Net }) {
  const [tf, setTf] = useState(1);
  const [mc, setMc] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const cs = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const vs = useRef<ISeriesApi<"Histogram"> | null>(null);
  const t = TF[tf];
  const { data } = useQuery({ queryKey: ["ohlcv", net, pool, t.l], queryFn: () => fetchOhlcv(pool, t.tf, t.a, net), refetchInterval: 30000, retry: 2 });
  useEffect(() => {
    if (!el.current) return;
    const up = css("--color-up", "#2ee6a6"), down = css("--color-down", "#ff5c7a"), line = css("--color-line", "#1c2436"), accent = css("--color-accent-fg", "#3c8aff");
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: css("--color-muted", "#8a93ab"), fontFamily: "var(--font-geist-mono)", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: `${line}80` }, horzLines: { color: `${line}80` } },
      rightPriceScale: { borderColor: line },
      timeScale: { borderColor: line, timeVisible: true },
      crosshair: { vertLine: { color: accent, labelBackgroundColor: accent }, horzLine: { color: accent, labelBackgroundColor: accent } },
    });
    cs.current = c.addSeries(CandlestickSeries, {
      upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down,
      priceFormat: { type: "custom", minMove: 1e-15, formatter: (p: number) => (p >= 1000 ? fmtCompact(p) : fmtPrice(p)) },
    });
    vs.current = c.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" } });
    c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chart.current = c;
    return () => c.remove();
  }, []);
  useEffect(() => {
    if (!data || !cs.current || !vs.current) return;
    const k = mc && supply > 0 ? supply : 1;
    const up = css("--color-up", "#2ee6a6"), down = css("--color-down", "#ff5c7a");
    cs.current.setData(data.map((d) => ({ time: d.time as UTCTimestamp, open: d.open * k, high: d.high * k, low: d.low * k, close: d.close * k })));
    vs.current.setData(data.map((d) => ({ time: d.time as UTCTimestamp, value: d.volume, color: d.close >= d.open ? `${up}40` : `${down}40` })));
    chart.current?.timeScale().fitContent();
  }, [data, mc, supply]);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="no-scrollbar flex items-center gap-0.5 overflow-x-auto border-b border-line px-2 py-1.5">
        {TF.map((x, i) => (
          <button key={x.l} onClick={() => setTf(i)} className={`h-7 rounded-md px-2 font-mono text-xs ${tf === i ? "bg-panel-2 text-fg" : "text-dim hover:text-fg"}`}>{x.l}</button>
        ))}
        {supply > 0 && (
          <span className="ml-auto flex items-center gap-1 px-1.5 font-mono text-xs">
            <button onClick={() => setMc(false)} className={!mc ? "text-accent-fg" : "text-dim hover:text-fg"}>Price</button>
            <span className="text-line-2">/</span>
            <button onClick={() => setMc(true)} className={mc ? "text-accent-fg" : "text-dim hover:text-fg"}>MC</button>
          </span>
        )}
      </div>
      <div ref={el} className="h-[340px] w-full sm:h-[440px]" />
    </div>
  );
}

function PairView() {
  const params = useSearchParams();
  const router = useRouter();
  const net: Net = parseNet(params.get("n")) ?? "base";
  const norm = (v: string | null) => (v ? normAddr(v) : "");
  const poolParam = norm(params.get("p"));
  useEffect(() => {
    if (poolParam) pushRecent(poolParam);
  }, [poolParam]);
  useEffect(() => {
    if (getNet() !== net && /^terminal\.|^localhost$/.test(location.hostname)) setNet(net);
  }, [net]);
  const tokenParam = norm(params.get("t"));
  const resolved = useQuery({ queryKey: ["toppool", net, tokenParam], queryFn: () => fetchTokenTopPool(tokenParam, net), enabled: !poolParam && !!tokenParam });
  const pool = poolParam || resolved.data || "";
  const { data: p, error } = useQuery({ queryKey: ["pool", net, pool], queryFn: () => fetchPool(pool, net), enabled: !!pool, refetchInterval: 30000, retry: 2 });
  const keel = useQuery({ queryKey: ["is-keel", p?.token.address], enabled: !!p && net === "base", queryFn: async () => {
      const a = p!.token.address.toLowerCase();
      const r = await api<{ tokens: Token[] }>(`/tokens?q=${a}&limit=5`);
      return r.tokens.some((t) => t.address.toLowerCase() === a) || null;
    }, retry: false });
  useEffect(() => {
    if (keel.data && p) router.replace(`/token/?a=${p.token.address}`);
  }, [keel.data, p, router]);
  const trades = useQuery({ queryKey: ["ptrades", net, pool], queryFn: () => fetchPoolTrades(pool, p!.token.address, net), enabled: !!p, refetchInterval: 20000 });
  const [copied, setCopied] = useState(false);
  const sec = useSecurity(p?.token.address, net);
  const watched = useSet("keel-watch").includes(p ? normAddr(p.token.address) : "-");

  if (!pool) return <p className="py-20 text-center text-sm text-muted">{resolved.isLoading ? "Finding the main pool…" : "No pair selected."}</p>;
  if (error) return <p className="py-20 text-center text-sm text-down">{(error as Error).message}</p>;
  if (!p) return <p className="py-20 text-center text-sm text-muted">Loading pair…</p>;
  const supply = p.priceUsd > 0 ? p.mcUsd / p.priceUsd : 0;
  const stats: [string, string, string?][] = [
    ["Market cap", fmtUsd(p.mcUsd)],
    ["Price", `$${fmtPrice(p.priceUsd)}`, `${p.chg24 >= 0 ? "+" : ""}${p.chg24.toFixed(2)}% 24h`],
    ["Liquidity", fmtUsd(p.liqUsd), p.lockedPct != null ? `${p.lockedPct.toFixed(0)}% locked` : undefined],
    ["Volume 24h", fmtUsd(p.vol24), `1h ${fmtUsd(p.vol1h)}`],
    ["Txns 24h", `${fmtCompact(p.buys)}/${fmtCompact(p.sells)}`, `${fmtCompact(p.traders)} traders`],
    ["Age", p.createdAt ? timeAgo(p.createdAt) : "—", p.feePct ? `${p.feePct}% pool fee` : undefined],
  ];
  return (
    <div className="relative left-1/2 w-screen -translate-x-1/2 space-y-3 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-line bg-panel px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <TokenAvatar src={p.token.image} symbol={p.token.symbol} size={44} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">{p.token.symbol}</h1>
              <span className="text-sm text-muted">/ {p.quote}</span>
              <button onClick={() => toggleSet("keel-watch", p.token.address)} className={watched ? "text-warn" : "text-dim hover:text-fg"} title={watched ? "Remove from watchlist" : "Add to watchlist"} aria-label="Watchlist">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill={watched ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></svg>
              </button>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dim">
              <span className="max-w-[10rem] truncate">{p.token.name}</span>
              <button onClick={() => navigator.clipboard.writeText(p.token.address).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1000)))} className="font-mono hover:text-fg" title="Copy contract address">
                {copied ? "copied" : shortAddr(p.token.address)} ⧉
              </button>
              <span className="rounded border border-line px-1.5">{DEX_LABEL[p.dex] ?? p.dex}</span>
              <span className="flex items-center gap-1 rounded border border-line px-1.5"><img src={NETS[net].logo} alt="" className="h-3 w-3 rounded-full" />{NETS[net].label}</span>
              <a href={explorerToken(net, p.token.address)} target="_blank" rel="noreferrer" className="hover:text-fg">{NETS[net].explorerName} ↗</a>
              <a href={`https://dexscreener.com/${NETS[net].ds}/${p.pool}`} target="_blank" rel="noreferrer" className="hover:text-fg">DexScreener ↗</a>
              <a href={`https://x.com/search?q=${encodeURIComponent(`$${p.token.symbol} OR ${p.token.address}`)}&f=live`} target="_blank" rel="noreferrer" className="hover:text-fg">X ↗</a>
            </div>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-x-5 gap-y-2 sm:flex sm:flex-wrap">
          {stats.map(([k, v, sub]) => (
            <div key={k} className="min-w-0">
              <p className="text-[11px] text-dim">{k}</p>
              <p className="truncate font-mono text-sm font-semibold">{v}</p>
              {sub && <p className={`truncate font-mono text-[10px] ${k === "Price" ? (p.chg24 >= 0 ? "text-up" : "text-down") : "text-dim"}`}>{sub}</p>}
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Chart pool={p.pool} supply={supply} net={net} />
        </div>
        <aside className="space-y-3 lg:sticky lg:top-28 lg:row-span-2 lg:self-start">
          <TradePanel p={p} />
          <SecurityCard p={p} sec={sec.data} loading={sec.isLoading} />
          {net === "base" && (
            <details className="rounded-xl border border-line bg-panel p-3">
              <summary className="cursor-pointer text-xs font-semibold">Swap with any token</summary>
              <div className="mt-3">
                <AnySwap initialGet={p.token.address} />
              </div>
            </details>
          )}
          <p className="text-[11px] leading-relaxed text-dim">
            {net === "base" ? "Swaps route through Relay at the best price on Base." : net === "eth" ? "Buys route through Relay from Base ETH to Ethereum. Sells need a little ETH on Ethereum for gas." : "Buys route through Relay from Base ETH to your Solana address. Sells go to SOL through Jupiter."}{" "}
            Anyone can create a token, including copies of real names, so check the contract first.
          </p>
        </aside>
        <div className="min-w-0">
          <PairTabs p={p} trades={trades.data} loading={trades.isLoading} sec={sec.data} />
        </div>
      </div>
    </div>
  );
}

export default function PairPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Loading…</p>}>
      <PairView />
    </Suspense>
  );
}
