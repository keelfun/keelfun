"use client";
import {
  AreaSeries, CandlestickSeries, ColorType, createChart, CrosshairMode, HistogramSeries,
  type IChartApi, type ISeriesApi, type MouseEventParams, type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCandles, type Candle, type Token } from "@/lib/api";
import { fmtCompact, fmtPrice } from "@/lib/format";

const RES = [
  { s: 15, l: "15s" },
  { s: 60, l: "1m" },
  { s: 300, l: "5m" },
  { s: 900, l: "15m" },
  { s: 3600, l: "1h" },
  { s: 14400, l: "4h" },
  { s: 86400, l: "1D" },
];

const css = (v: string, fb: string) => (typeof window === "undefined" ? fb : getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb);

type Bar = { open: number; high: number; low: number; close: number; volume: number };

function Toggle({ a, b, on, set }: { a: string; b: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <span className="flex items-center gap-1 px-1.5 font-mono text-xs">
      <button onClick={() => set(true)} className={on ? "text-accent-fg" : "text-dim hover:text-fg"}>{a}</button>
      <span className="text-line-2">/</span>
      <button onClick={() => set(false)} className={!on ? "text-accent-fg" : "text-dim hover:text-fg"}>{b}</button>
    </span>
  );
}

export function PriceChart({ t, ethUsd }: { t: Token; ethUsd: number }) {
  const [res, setRes] = useState(60);
  const [usd, setUsd] = useState(true);
  const [mcap, setMcap] = useState(true);
  const [candle, setCandle] = useState(true);
  const [full, setFull] = useState(false);
  const [hover, setHover] = useState<Bar | null>(null);
  const showUsd = usd && ethUsd > 0;
  const pairSym = t.pairSymbol || "ETH";
  const { data } = useCandles(t.address, res);
  const box = useRef<HTMLDivElement>(null);
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Area"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);
  const fitted = useRef("");

  const k = (showUsd ? ethUsd : t.pairEth > 0 ? 1 / t.pairEth : 1) * (mcap ? t.supply : 1);
  const bars = useMemo<(Candle & Bar)[]>(
    () => (data?.candles ?? []).map((c) => ({ ...c, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k, volume: c.volume * (showUsd ? ethUsd : t.pairEth > 0 ? 1 / t.pairEth : 1) })),
    [data, k, showUsd, ethUsd, t.pairEth],
  );
  const fmt = (v: number) => (mcap ? fmtCompact(v) : fmtPrice(v));
  const unit = showUsd ? "$" : "";

  useEffect(() => {
    if (!el.current) return;
    const up = css("--color-up", "#2ee6a6");
    const down = css("--color-down", "#ff5c7a");
    const accent = css("--color-accent-fg", "#3c8aff");
    const line = css("--color-line", "#1c2436");
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: css("--color-muted", "#8a93ab"), fontFamily: "var(--font-geist-mono)", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: `${line}80` }, horzLines: { color: `${line}80` } },
      rightPriceScale: { borderColor: line, scaleMargins: { top: 0.18, bottom: 0.22 } },
      timeScale: { borderColor: line, timeVisible: true, secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: accent, style: 3, labelBackgroundColor: accent }, horzLine: { color: accent, style: 3, labelBackgroundColor: accent } },
    });
    const pf = { type: "custom" as const, minMove: 1e-15, formatter: (p: number) => fmt(p) };
    series.current = candle
      ? c.addSeries(CandlestickSeries, { upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down, priceFormat: pf })
      : c.addSeries(AreaSeries, { lineColor: accent, topColor: `${accent}55`, bottomColor: `${accent}00`, lineWidth: 2, priceFormat: pf });
    volume.current = c.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, color: `${up}33` });
    c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    const move = (p: MouseEventParams) => {
      const d = p.seriesData.get(series.current!) as { open?: number; high?: number; low?: number; close?: number; value?: number } | undefined;
      const v = p.seriesData.get(volume.current!) as { value?: number } | undefined;
      if (!d) return setHover(null);
      const close = d.close ?? d.value ?? 0;
      setHover({ open: d.open ?? close, high: d.high ?? close, low: d.low ?? close, close, volume: v?.value ?? 0 });
    };
    c.subscribeCrosshairMove(move);
    chart.current = c;
    fitted.current = "";
    return () => {
      c.unsubscribeCrosshairMove(move);
      c.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candle, mcap]);

  useEffect(() => {
    if (!series.current || !volume.current) return;
    const up = css("--color-up", "#2ee6a6");
    const down = css("--color-down", "#ff5c7a");
    if (candle) (series.current as ISeriesApi<"Candlestick">).setData(bars.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
    else (series.current as ISeriesApi<"Area">).setData(bars.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })));
    volume.current.setData(bars.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? `${up}40` : `${down}40` })));
    const key = `${t.address}:${res}:${showUsd}:${mcap}:${candle}`;
    if (fitted.current !== key) {
      chart.current?.timeScale().fitContent();
      fitted.current = key;
    }
  }, [bars, candle, res, showUsd, mcap, t.address]);

  useEffect(() => {
    const f = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  const last = bars[bars.length - 1];
  const b = hover ?? last;
  const first = bars[0];
  const chg = b && first && first.open > 0 ? b.close / first.open - 1 : 0;
  const resLabel = RES.find((r) => r.s === res)?.l;
  const btn = "flex h-7 items-center rounded-md px-2 font-mono text-xs";

  return (
    <div ref={box} className={`overflow-hidden rounded-2xl border border-line bg-panel ${full ? "flex flex-col" : ""}`}>
      <div className="no-scrollbar flex items-center gap-0.5 overflow-x-auto border-b border-line px-2 py-1.5">
        {RES.map((r) => (
          <button key={r.s} onClick={() => setRes(r.s)} className={`${btn} ${res === r.s ? "bg-panel-2 text-fg" : "text-dim hover:text-fg"}`}>
            {r.l}
          </button>
        ))}
        <span className="mx-1 h-4 w-px shrink-0 bg-line" />
        <button onClick={() => setCandle((v) => !v)} className={`${btn} gap-1.5 text-muted hover:text-fg`} title={candle ? "Line" : "Candles"}>
          {candle ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 3v4m0 10v4M17 3v6m0 8v4" /><rect x="4.5" y="7" width="5" height="10" rx="1" /><rect x="14.5" y="9" width="5" height="8" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 17 5-6 4 4 8-9" /></svg>
          )}
        </button>
        <span className="mx-1 h-4 w-px shrink-0 bg-line" />
        {ethUsd > 0 && <Toggle a="USD" b={pairSym} on={usd} set={setUsd} />}
        <span className="mx-1 h-4 w-px shrink-0 bg-line" />
        <Toggle a="MarketCap" b="Price" on={mcap} set={setMcap} />
        <button
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : box.current?.requestFullscreen?.())}
          className={`${btn} ml-auto text-muted hover:text-fg`}
          aria-label="Fullscreen"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
        </button>
      </div>
      <div className={`relative ${full ? "flex-1" : ""}`}>
        <div className="pointer-events-none absolute left-3 top-2 z-10 space-y-0.5 font-mono text-[11px] leading-tight">
          <p className="text-muted">
            <span className="text-fg">{t.symbol}/{pairSym}</span> · {resLabel} · keelfun.app · {mcap ? "Market cap" : "Price"}
          </p>
          {b && (
            <p className={b.close >= b.open ? "text-up" : "text-down"}>
              <span className="text-dim">O</span>{unit}{fmt(b.open)} <span className="text-dim">H</span>{unit}{fmt(b.high)} <span className="text-dim">L</span>{unit}{fmt(b.low)}{" "}
              <span className="text-dim">C</span>{unit}{fmt(b.close)} <span>({chg >= 0 ? "+" : ""}{(chg * 100).toFixed(2)}%)</span>
            </p>
          )}
          {b && (
            <p className="text-dim">
              Volume <span className="text-accent-soft">{unit}{fmtCompact(b.volume)}{showUsd ? "" : ` ${pairSym}`}</span>
            </p>
          )}
        </div>
        <div ref={el} className={`w-full ${full ? "h-full" : "h-[340px] sm:h-[460px]"}`} />
      </div>
    </div>
  );
}
