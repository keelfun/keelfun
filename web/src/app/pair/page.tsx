"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CandlestickSeries, ColorType, createChart, HistogramSeries, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { AnySwap } from "@/components/AnySwap";
import { Bolt, PresetBar, usePrefs, useRelayBuy } from "@/components/QuickBuy";
import { TokenAvatar } from "@/components/TokenAvatar";
import { api, type Token } from "@/lib/api";
import { DEX_LABEL, fetchOhlcv, fetchPool, fetchPoolTrades, fetchTokenTopPool, type PoolDetail } from "@/lib/basePools";
import { EXPLORER } from "@/lib/config";
import { fmtCompact, fmtPrice, fmtUsd, shortAddr, timeAgo } from "@/lib/format";
import { errMsg } from "@/lib/tx";

const TF = [
  { l: "1m", tf: "minute", a: 1 },
  { l: "5m", tf: "minute", a: 5 },
  { l: "15m", tf: "minute", a: 15 },
  { l: "1h", tf: "hour", a: 1 },
  { l: "4h", tf: "hour", a: 4 },
  { l: "1d", tf: "day", a: 1 },
] as const;
const css = (v: string, fb: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb;

function Chart({ pool, supply }: { pool: string; supply: number }) {
  const [tf, setTf] = useState(1);
  const [mc, setMc] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const cs = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const vs = useRef<ISeriesApi<"Histogram"> | null>(null);
  const t = TF[tf];
  const { data } = useQuery({ queryKey: ["ohlcv", pool, t.l], queryFn: () => fetchOhlcv(pool, t.tf, t.a), refetchInterval: 30000, retry: 2 });
  useEffect(() => {
    if (!el.current) return;
    const up = css("--color-up", "#2ee6a6"), down = css("--color-down", "#ff5c7a"), line = css("--color-line", "#1c2436"), accent = css("--color-accent", "#3d7bff");
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
            <button onClick={() => setMc(false)} className={!mc ? "text-accent" : "text-dim hover:text-fg"}>Price</button>
            <span className="text-line-2">/</span>
            <button onClick={() => setMc(true)} className={mc ? "text-accent" : "text-dim hover:text-fg"}>MC</button>
          </span>
        )}
      </div>
      <div ref={el} className="h-[340px] w-full sm:h-[440px]" />
    </div>
  );
}

function QuickBtn({ p }: { p: PoolDetail }) {
  const { preset } = usePrefs();
  const relay = useRelayBuy();
  const [s, setS] = useState("");
  const go = async () => {
    setS("busy");
    try {
      await relay(p, preset);
      setS("ok");
    } catch (e) {
      setS(errMsg(e));
    }
  };
  return (
    <div>
      <button onClick={go} disabled={s === "busy"} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-up font-semibold text-bg disabled:opacity-60">
        <Bolt className="h-4 w-4" />
        {s === "busy" ? "Buying…" : s === "ok" ? "Bought" : `Quick buy ${preset.amount} ETH`}
      </button>
      {s && s !== "busy" && s !== "ok" && <p className="mt-1 text-xs text-down">{s}</p>}
    </div>
  );
}

function PairView() {
  const params = useSearchParams();
  const router = useRouter();
  const poolParam = params.get("p")?.toLowerCase() ?? "";
  const tokenParam = params.get("t")?.toLowerCase() ?? "";
  const resolved = useQuery({ queryKey: ["toppool", tokenParam], queryFn: () => fetchTokenTopPool(tokenParam), enabled: !poolParam && !!tokenParam });
  const pool = poolParam || resolved.data || "";
  const { data: p, error } = useQuery({ queryKey: ["pool", pool], queryFn: () => fetchPool(pool), enabled: !!pool, refetchInterval: 30000, retry: 2 });
  const keel = useQuery({ queryKey: ["is-keel", p?.token.address], queryFn: async () => {
      const a = p!.token.address.toLowerCase();
      const r = await api<{ tokens: Token[] }>(`/tokens?q=${a}&limit=5`);
      return r.tokens.some((t) => t.address.toLowerCase() === a) || null;
    }, enabled: !!p, retry: false });
  useEffect(() => {
    if (keel.data && p) router.replace(`/token/?a=${p.token.address}`);
  }, [keel.data, p, router]);
  const trades = useQuery({ queryKey: ["ptrades", pool], queryFn: () => fetchPoolTrades(pool, p!.token.address), enabled: !!p, refetchInterval: 20000 });
  const [copied, setCopied] = useState(false);

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
    <div className="space-y-5 py-6">
      <Link href="/terminal/" className="text-sm text-muted hover:text-fg">← Terminal</Link>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-0 flex-1 basis-full items-center gap-4 sm:basis-0">
        <TokenAvatar src={p.token.image} symbol={p.token.symbol} size={60} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h1 className="text-2xl font-bold sm:text-3xl">{p.token.symbol}</h1>
            <span className="text-muted">/ {p.quote}</span>
            <span className="text-sm text-dim">{p.token.name}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <button onClick={() => navigator.clipboard.writeText(p.token.address).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1000)))} className="rounded-md border border-line px-2 py-1 font-mono text-muted hover:text-fg">
              {copied ? "copied" : shortAddr(p.token.address)}
            </button>
            <span className="rounded-md border border-line px-2 py-1 text-muted">{DEX_LABEL[p.dex] ?? p.dex}</span>
            <a href={`${EXPLORER}/token/${p.token.address}`} target="_blank" rel="noreferrer" className="rounded-md border border-line px-2 py-1 text-muted hover:text-fg">Basescan ↗</a>
            <a href={`https://www.geckoterminal.com/base/pools/${p.pool}`} target="_blank" rel="noreferrer" className="rounded-md border border-line px-2 py-1 text-muted hover:text-fg">GeckoTerminal ↗</a>
            <a href={`https://dexscreener.com/base/${p.pool}`} target="_blank" rel="noreferrer" className="rounded-md border border-line px-2 py-1 text-muted hover:text-fg">DexScreener ↗</a>
          </div>
        </div>
        </div>
        <PresetBar />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([k, v, sub]) => (
          <div key={k}>
            <p className="text-xs text-muted">{k}</p>
            <p className="mt-1 text-xl font-bold">{v}</p>
            {sub && <p className="font-mono text-[11px] text-dim">{sub}</p>}
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-5">
          <Chart pool={p.pool} supply={supply} />
          <div>
            <h3 className="mb-3 text-lg font-semibold">Transactions</h3>
            <div className="max-h-[560px] overflow-auto rounded-2xl border border-line">
              <table className="w-full min-w-[560px] text-xs tabular-nums">
                <thead className="sticky top-0 bg-panel text-muted">
                  <tr className="border-b border-line">
                    <th className="px-3 py-2.5 text-left font-normal">Time</th>
                    <th className="px-3 py-2.5 text-left font-normal">Type</th>
                    <th className="px-3 py-2.5 text-right font-normal">Price</th>
                    <th className="px-3 py-2.5 text-right font-normal">Amount</th>
                    <th className="px-3 py-2.5 text-right font-normal">Value</th>
                    <th className="px-3 py-2.5 text-right font-normal">Wallet</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {trades.data?.map((r) => (
                    <tr key={r.tx + r.from + r.usd} className="border-b border-line/60">
                      <td className="px-3 py-2.5 text-muted"><a href={`${EXPLORER}/tx/${r.tx}`} target="_blank" rel="noreferrer" className="hover:text-fg">{timeAgo(r.ts)} ago ↗</a></td>
                      <td className={`px-3 py-2.5 font-sans text-sm ${r.kind === "buy" ? "text-up" : "text-down"}`}>{r.kind === "buy" ? "Buy" : "Sell"}</td>
                      <td className="px-3 py-2.5 text-right">${fmtPrice(r.priceUsd)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtCompact(r.tokenAmount)} <span className="text-dim">{p.token.symbol}</span></td>
                      <td className="px-3 py-2.5 text-right">{fmtUsd(r.usd)}</td>
                      <td className="px-3 py-2.5 text-right"><Link href={`/portfolio/?w=${r.from}`} className="text-muted hover:text-accent">{shortAddr(r.from)}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {trades.isLoading && <p className="p-6 text-center text-xs text-dim">Loading trades…</p>}
            </div>
          </div>
        </div>
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <QuickBtn p={p} />
          <AnySwap initialGet={p.token.address} />
          <p className="text-xs leading-relaxed text-dim">Swaps route through Relay at the best price on Base. Anyone can create a token on Base, including copies of real names, so check the contract first.</p>
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
