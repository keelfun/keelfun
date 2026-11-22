"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { baseMeta, Bolt, keelMeta, PresetBar, RowSell, useKeelBuy, usePrefs, useRelayBuy } from "@/components/QuickBuy";
import { TokenAvatar } from "@/components/TokenAvatar";
import { LaunchpadChip, PoolAvatar, useLaunchpad } from "@/components/PoolAvatar";
import { api, useTokens, type Portfolio, type Token } from "@/lib/api";
import { fetchBasePools, type BasePool } from "@/lib/basePools";
import { pairInfo } from "@/lib/config";
import { fmtCompact, fmtPct, fmtPrice, fmtUsd, shortAddr, timeAgo } from "@/lib/format";
import { errMsg } from "@/lib/tx";

const COLS = [
  { sort: "new", title: "New Pairs" },
  { sort: "active", title: "Trending" },
  { sort: "top", title: "Top Market Cap" },
] as const;
const BASE_COLS = [
  { sort: "new", title: "New Pairs" },
  { sort: "trending", title: "Trending" },
  { sort: "top", title: "Top Volume" },
] as const;



const DEX: Record<string, string> = {
  "uniswap-v4-base": "Uni v4", "uniswap-v3-base": "Uni v3", "uniswap-v2-base": "Uni v2", "aerodrome-base": "Aero", "aerodrome-slipstream": "Aero CL",
  "aero-slipstream-base": "Aero CL", "pancakeswap-v3-base": "Pancake", "sushiswap-v3-base": "Sushi", "baseswap": "BaseSwap",
};

const SETS_EVT = "keel-sets";
function readSet(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}
function useSet(key: string) {
  const [s, setS] = useState<string[]>([]);
  useEffect(() => {
    const f = () => setS(readSet(key));
    f();
    addEventListener(SETS_EVT, f);
    addEventListener("storage", f);
    return () => (removeEventListener(SETS_EVT, f), removeEventListener("storage", f));
  }, [key]);
  const toggle = (a: string) => {
    const x = a.toLowerCase();
    const cur = readSet(key);
    localStorage.setItem(key, JSON.stringify(cur.includes(x) ? cur.filter((y) => y !== x) : [...cur, x]));
    dispatchEvent(new Event(SETS_EVT));
  };
  return [s, toggle] as const;
}
const useWatch = () => useSet("keel-watch");
const useHidden = () => useSet("keel-hidden");

type Lane = { p: number | null; minLiq: number; minVol: number; minMc: number; maxAgeH: number; showHidden: boolean };
const LANE0: Lane = { p: null, minLiq: 0, minVol: 0, minMc: 0, maxAgeH: 0, showHidden: false };
function useLane(id: string) {
  const key = `keel-lane-${id}`;
  const [lane, setL] = useState<Lane>(LANE0);
  useEffect(() => {
    try {
      setL({ ...LANE0, ...JSON.parse(localStorage.getItem(key) || "{}") });
    } catch {}
  }, [key]);
  const set = (v: Partial<Lane>) =>
    setL((cur) => {
      const n = { ...cur, ...v };
      localStorage.setItem(key, JSON.stringify(n));
      return n;
    });
  return [lane, set] as const;
}
const laneActive = (l: Lane) => l.minLiq > 0 || l.minVol > 0 || l.minMc > 0 || l.maxAgeH > 0 || l.showHidden;
function passLane(l: Lane, x: { liq: number; vol: number; mc: number; created: number }) {
  if (x.liq < l.minLiq || x.vol < l.minVol || x.mc < l.minMc) return false;
  if (l.maxAgeH > 0 && x.created && Date.now() / 1000 - (x.created > 1e12 ? x.created / 1000 : x.created) > l.maxAgeH * 3600) return false;
  return true;
}

function LaneControls({ lane, set }: { lane: Lane; set: (v: Partial<Lane>) => void }) {
  const [open, setOpen] = useState(false);
  const num = (k: "minLiq" | "minVol" | "minMc" | "maxAgeH", label: string, unit: string) => (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <span className="flex w-28 items-center gap-1 rounded-md border border-line bg-bg px-1.5 py-1">
        <input value={lane[k] || ""} onChange={(e) => set({ [k]: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} inputMode="decimal" placeholder="any" className="w-full bg-transparent font-mono outline-none" />
        <span className="text-dim">{unit}</span>
      </span>
    </label>
  );
  return (
    <div className="relative flex shrink-0 items-center gap-1">
      <div className="flex rounded-md border border-line p-0.5" title="Quick buy preset for this column">
        {[0, 1, 2].map((i) => (
          <button key={i} onClick={() => set({ p: lane.p === i ? null : i })} className={`rounded px-1 font-mono text-[10px] ${lane.p === i ? "bg-panel-2 text-accent-fg" : "text-dim hover:text-fg"}`}>
            P{i + 1}
          </button>
        ))}
      </div>
      <button onClick={() => setOpen((v) => !v)} aria-label="Filters" className={`flex h-6 w-6 items-center justify-center rounded-md border ${laneActive(lane) ? "border-accent text-accent-fg" : "border-line text-dim hover:text-fg"}`}>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-40 w-60 space-y-2 rounded-xl border border-line bg-panel p-3 shadow-2xl">
          <p className="text-xs font-semibold">Filters</p>
          {num("minLiq", "Min liquidity", "$")}
          {num("minVol", "Min volume 24h", "$")}
          {num("minMc", "Min market cap", "$")}
          {num("maxAgeH", "Max age", "h")}
          <label className="flex items-center justify-between text-xs">
            <span className="text-muted">Show hidden pairs</span>
            <input type="checkbox" checked={lane.showHidden} onChange={(e) => set({ showHidden: e.target.checked })} className="accent-[var(--accent)]" />
          </label>
          <div className="flex justify-between pt-1">
            <button onClick={() => set(LANE0)} className="text-xs text-dim hover:text-fg">Reset</button>
            <button onClick={() => setOpen(false)} className="rounded-md bg-panel-2 px-2 py-0.5 text-xs">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RowTools({ address, symbol }: { address: string; symbol: string }) {
  const [watch, toggleWatch] = useWatch();
  const [hidden, toggleHidden] = useHidden();
  const a = address.toLowerCase();
  const on = watch.includes(a);
  const off = hidden.includes(a);
  const stop = (f: () => void) => (e: React.MouseEvent) => (e.preventDefault(), e.stopPropagation(), f());
  const ext = (href: string, title: string, icon: React.ReactNode) => (
    <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-dim hover:text-fg" title={title}>
      {icon}
    </a>
  );
  return (
    <span className="inline-flex items-center gap-1.5">
      <button onClick={stop(() => toggleWatch(a))} className={on ? "text-warn" : "text-dim hover:text-fg"} title={on ? "Remove from watchlist" : "Add to watchlist"} aria-label="Watchlist">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></svg>
      </button>
      {ext(`https://x.com/search?q=${encodeURIComponent(`$${symbol} OR ${address}`)}&f=live`, "Search on X", <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor"><path d="M18.2 2.3h3.4l-7.4 8.4 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9L.8 2.3h7l4.8 6.4zm-1.2 17.9h1.9L7 4.2H5z" /></svg>)}
      {ext(`https://basescan.org/token/${address}`, "Basescan", <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></svg>)}
      <button onClick={stop(() => toggleHidden(a))} className={off ? "text-down" : "text-dim hover:text-fg"} title={off ? "Unhide pair" : "Hide pair"} aria-label="Hide">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.7M6.6 6.6A17 17 0 0 0 2.5 12S6 18 12 18a9 9 0 0 0 4.4-1.1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
      </button>
    </span>
  );
}

function Row({ t, ethUsd, amount, buy }: { t: Token; ethUsd: number; amount: string; buy: (t: Token, a: string) => Promise<void> }) {
  const pair = pairInfo(t.pair);
  const native = pair.symbol === "ETH";
  const [state, setState] = useState<"" | "busy" | "ok" | string>("");
  const [copied, setCopied] = useState(false);
  const usd = (eth: number) => (ethUsd > 0 ? fmtUsd(eth * ethUsd) : `${fmtCompact(eth)} ETH`);
  const go = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (state === "busy") return;
    setState("busy");
    try {
      await buy(t, amount);
      setState("ok");
    } catch (err) {
      setState(errMsg(err));
    }
    setTimeout(() => setState(""), 4000);
  };
  const chip = "inline-flex h-[18px] items-center gap-0.5 rounded border px-1 font-mono text-[10px]";
  const burnPct = t.supply > 0 ? t.burned / t.supply : 0;
  return (
    <Link href={`/token/?a=${t.address}`} className="group block border-b border-line px-3 py-2.5 transition-colors hover:bg-panel-2/60">
      <div className="flex gap-3">
        <div className="relative shrink-0">
          <TokenAvatar src={t.image} symbol={t.symbol} size={52} />
          <span className="absolute -bottom-1 -right-1 rounded bg-bg px-1 font-mono text-[9px] text-muted ring-1 ring-line">V4</span>
          <p className="mt-1.5 text-center font-mono text-[10px] text-dim">{t.address.slice(0, 4)}…{t.address.slice(-3)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold">{t.symbol}</span>
            <span className={`${chip} border-line text-muted`}>TAX {t.buyBps / 100}%</span>
            <button
              onClick={(e) => (e.preventDefault(), navigator.clipboard.writeText(t.address).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1000))))}
              className="text-dim hover:text-fg"
              aria-label="Copy address"
            >
              {copied ? <span className="text-[10px] text-up">✓</span> : <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>}
            </button>
            <span className="ml-auto shrink-0 text-xs text-muted">MC <b className="text-sm text-fg">{usd(t.fdvEth)}</b></span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap [&>*]:shrink-0">
            <span className="text-up">{timeAgo(t.createdAt)}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-line px-1.5 py-px text-[10px]">
              <img src={pair.logo} alt="" className="h-3 w-3 rounded-full" />
              {pair.symbol}
            </span>
            <span className="inline-flex items-center gap-0.5" title="Holders">
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" /></svg>
              {t.holders}
            </span>
            {t.antiSnipe && <span className="text-[10px] text-warn">anti-snipe</span>}
            <RowTools address={t.address} symbol={t.symbol} />
            </div>
            <button
              onClick={native ? go : undefined}
              className={`flex h-8 shrink-0 items-center gap-1 rounded-lg border px-3 font-mono text-xs font-semibold ${
                state === "ok" ? "border-up bg-up/20 text-up" : state && state !== "busy" ? "border-down/60 text-down" : "border-up/50 bg-up/10 text-up hover:bg-up/20"
              }`}
              title={native ? `Quick buy ${amount} ETH` : `Open to buy with ${pair.symbol}`}
            >
              <Bolt />
              {state === "busy" ? "…" : state === "ok" ? "Bought" : state ? "Failed" : native ? amount : pair.symbol}
            </button>
            <RowSell meta={keelMeta(t)} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className={`${chip} ${t.change24h >= 0 ? "border-up/40 text-up" : "border-down/40 text-down"}`}>{fmtPct(t.change24h)}</span>
            <span className={`${chip} border-line text-muted`} title="Creator / holders / burn split">
              {t.creatorBps / 100}/{t.holdersBps / 100}/{t.burnBps / 100}
            </span>
            {burnPct > 0 && <span className={`${chip} border-warn/40 text-warn`}>🔥 {(burnPct * 100).toFixed(2)}%</span>}
            {!t.editable && <span className={`${chip} border-up/40 text-up`}>immutable</span>}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 font-mono text-[11px] text-dim">
        <span>LIQ <span className="text-muted">{usd(t.liquidityEth)}</span></span>
        <span>VOL <span className="text-muted">{usd(t.volume24hEth)}</span></span>
        <span>TXNS <span className="text-muted">{t.trades}</span></span>
        <span className="ml-auto text-muted">${fmtPrice(t.priceUsd)}</span>
      </div>
      {state && state !== "busy" && state !== "ok" && <p className="mt-1 truncate text-[11px] text-down">{state}</p>}
    </Link>
  );
}

type ColProps<T> = { sort: string; title: string; buy: (x: T, a: string, p: number | null) => Promise<void>; hidden: boolean; view: "all" | "watch" };
function useLaneAmount(lane: Lane) {
  const { prefs, preset } = usePrefs();
  return lane.p == null ? preset.amount : prefs.presets[lane.p].amount;
}

function Column({ sort, title, buy, hidden, view }: ColProps<Token>) {
  const [q, setQ] = useState("");
  const { data, isLoading } = useTokens(sort, q);
  const [lane, setLane] = useLane(`k-${sort}`);
  const amount = useLaneAmount(lane);
  const [watch] = useWatch();
  const [hid] = useHidden();
  const ethUsd = data?.ethUsd ?? 0;
  const list = data?.tokens.filter((t) => {
    const a = t.address.toLowerCase();
    if (view === "watch" && !watch.includes(a)) return false;
    if (!lane.showHidden && hid.includes(a)) return false;
    return passLane(lane, { liq: t.liquidityEth * ethUsd, vol: t.volume24hEth * ethUsd, mc: t.fdvEth * ethUsd, created: t.createdAt });
  });
  return (
    <section className={`${hidden ? "hidden lg:flex" : "flex"} min-h-0 min-w-0 flex-1 flex-col border-line lg:border-r`}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="shrink-0 text-sm font-bold italic">{title}</h2>
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-up" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          className="ml-auto h-7 w-24 min-w-0 rounded-md border border-line bg-bg px-2 text-xs outline-none focus:border-accent"
        />
        <LaneControls lane={lane} set={setLane} />
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {list?.map((t) => <Row key={t.address} t={t} ethUsd={ethUsd} amount={amount} buy={(x, a) => buy(x, a, lane.p)} />)}
        {isLoading && <p className="p-6 text-center text-xs text-dim">Loading…</p>}
        {list && list.length === 0 && <p className="p-6 text-center text-xs text-dim">{view === "watch" ? "No watchlisted tokens here. Tap ☆ on a row." : "No tokens match."}</p>}
      </div>
    </section>
  );
}


const pctChip = (v: number, label: string) => (
  <span className={`inline-flex h-[18px] items-center gap-0.5 rounded border px-1 font-mono text-[10px] ${v > 0 ? "border-up/40 text-up" : v < 0 ? "border-down/40 text-down" : "border-line text-muted"}`}>
    <span className="text-dim">{label}</span>
    {v > 0 ? "+" : ""}
    {Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)}%
  </span>
);

function BaseRow({ p, amount, buy }: { p: BasePool; amount: string; buy: (p: BasePool, a: string) => Promise<void> }) {
  const [state, setState] = useState("");
  const [copied, setCopied] = useState(false);
  const go = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (state === "busy") return;
    setState("busy");
    try {
      await buy(p, amount);
      setState("ok");
    } catch (err) {
      setState(errMsg(err));
    }
    setTimeout(() => setState(""), 4000);
  };
  const t = p.token;
  const lp = useLaunchpad(t.address, p.dex);
  return (
    <Link href={`/pair/?p=${p.pool}`} className="group block border-b border-line px-3 py-2.5 transition-colors hover:bg-panel-2/60">
      <div className="flex gap-3">
        <div className="relative shrink-0">
          <PoolAvatar token={t} dex={p.dex} dexLabel={DEX[p.dex] ?? p.dex.replace(/-base$/, "").slice(0, 8)} size={52} />
          <p className="mt-1.5 text-center font-mono text-[10px] text-dim">{t.address.slice(0, 4)}…{t.address.slice(-3)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold">{t.symbol}</span>
            <span className="truncate text-xs text-dim">{t.name}</span>
            <button
              onClick={(e) => (e.preventDefault(), navigator.clipboard.writeText(t.address).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1000))))}
              className="shrink-0 text-dim hover:text-fg"
              aria-label="Copy address"
            >
              {copied ? <span className="text-[10px] text-up">✓</span> : <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>}
            </button>
            <span className="ml-auto shrink-0 text-xs text-muted">MC <b className="text-sm text-fg">{fmtUsd(p.mcUsd)}</b></span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap [&>*]:shrink-0">
            <span className="text-up">{p.createdAt ? timeAgo(p.createdAt) : "—"}</span>
            <span className="rounded-full border border-line px-1.5 py-px text-[10px]">/{p.quote}</span>
            {lp && <LaunchpadChip id={lp} />}
            <span className="inline-flex items-center gap-0.5" title="Traders 24h">
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" /></svg>
              {fmtCompact(p.traders, 1)}
            </span>
            <a
              href={`https://www.geckoterminal.com/base/pools/${p.pool}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-dim hover:text-fg"
              title="Chart"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3v18h18" /><path d="m7 14 4-4 3 3 5-6" /></svg>
            </a>
            <RowTools address={t.address} symbol={t.symbol} />
            </div>
            <button
              onClick={go}
              className={`flex h-8 shrink-0 items-center gap-1 rounded-lg border px-3 font-mono text-xs font-semibold ${
                state === "ok" ? "border-up bg-up/20 text-up" : state && state !== "busy" ? "border-down/60 text-down" : "border-up/50 bg-up/10 text-up hover:bg-up/20"
              }`}
              title={`Quick buy ${amount} ETH via Relay`}
            >
              <Bolt />
              {state === "busy" ? "…" : state === "ok" ? "Bought" : state ? "Failed" : amount}
            </button>
            <RowSell meta={baseMeta(t)} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {pctChip(p.chg5m, "5m")}
            {pctChip(p.chg1h, "1h")}
            {pctChip(p.chg24, "24h")}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 font-mono text-[11px] text-dim">
        <span>LIQ <span className="text-muted">{fmtUsd(p.liqUsd)}</span></span>
        <span>VOL <span className="text-muted">{fmtUsd(p.vol24)}</span></span>
        <span>TXNS <span className="text-muted">{fmtCompact(p.buys + p.sells, 1)}</span> <span className="text-up">{fmtCompact(p.buys, 1)}</span>/<span className="text-down">{fmtCompact(p.sells, 1)}</span></span>
        <span className="ml-auto text-muted">${fmtPrice(p.priceUsd)}</span>
      </div>
      {state && state !== "busy" && state !== "ok" && <p className="mt-1 truncate text-[11px] text-down">{state}</p>}
    </Link>
  );
}

function BaseColumn({ sort, title, buy, hidden, view }: ColProps<BasePool>) {
  const [q, setQ] = useState("");
  const [lane, setLane] = useLane(`b-${sort}`);
  const amount = useLaneAmount(lane);
  const [watch] = useWatch();
  const [hid] = useHidden();
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["base-pools", sort, dq],
    queryFn: async () => ({ pools: await fetchBasePools(sort, dq) }),
    refetchInterval: 30000,
    retry: 3,
    retryDelay: (n) => 2000 * (n + 1),
    staleTime: 15000,
  });
  const list = data?.pools.filter((p) => {
    const a = p.token.address.toLowerCase();
    if (view === "watch" && !watch.includes(a)) return false;
    if (!lane.showHidden && hid.includes(a)) return false;
    return passLane(lane, { liq: p.liqUsd, vol: p.vol24, mc: p.mcUsd, created: p.createdAt });
  });
  return (
    <section className={`${hidden ? "hidden lg:flex" : "flex"} min-h-0 min-w-0 flex-1 flex-col border-line lg:border-r`}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="shrink-0 text-sm font-bold italic">{title}</h2>
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-up" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Base"
          className="ml-auto h-7 w-24 min-w-0 rounded-md border border-line bg-bg px-2 text-xs outline-none focus:border-accent"
        />
        <LaneControls lane={lane} set={setLane} />
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {list?.map((p) => <BaseRow key={p.pool} p={p} amount={amount} buy={(x, a) => buy(x, a, lane.p)} />)}
        {isLoading && <p className="p-6 text-center text-xs text-dim">Loading Base pairs…</p>}
        {error && !data && <p className="p-6 text-center text-xs text-dim">{(error as Error).message}</p>}
        {list && list.length === 0 && <p className="p-6 text-center text-xs text-dim">{view === "watch" ? "No watchlisted pairs here. Tap ☆ on a row." : "No pairs match."}</p>}
      </div>
    </section>
  );
}

function Tracker({ onClose }: { onClose: () => void }) {
  const [wallets, setWallets] = useState<string[]>([]);
  const [input, setInput] = useState("");
  useEffect(() => {
    try {
      setWallets(JSON.parse(localStorage.getItem("keel-tracked") || "[]"));
    } catch {}
  }, []);
  const save = (w: string[]) => (setWallets(w), localStorage.setItem("keel-tracked", JSON.stringify(w)));
  const add = () => {
    const w = input.trim().toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(w) && !wallets.includes(w)) save([...wallets, w]);
    setInput("");
  };
  const qs = useQueries({
    queries: wallets.map((w) => ({ queryKey: ["portfolio", w], queryFn: () => api<Portfolio>(`/portfolio/${w}`), refetchInterval: 8000 })),
  });
  const feed = qs
    .flatMap((q, i) => (q.data?.trades ?? []).map((r) => ({ ...r, wallet: wallets[i] })))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 60);
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-line xl:flex">
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <h2 className="text-sm font-semibold">Wallet tracker</h2>
        <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Close">×</button>
      </div>
      <div className="flex gap-1.5 border-b border-line p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="0x… wallet"
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 font-mono text-xs outline-none focus:border-accent"
        />
        <button onClick={add} className="h-8 rounded-md bg-accent px-3 text-xs font-semibold text-accent-ink">Add</button>
      </div>
      {wallets.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-line p-2">
          {wallets.map((w) => (
            <span key={w} className="inline-flex items-center gap-1 rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
              <Link href={`/portfolio/?w=${w}`} className="hover:text-fg">{shortAddr(w)}</Link>
              <button onClick={() => save(wallets.filter((x) => x !== w))} className="hover:text-down">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {wallets.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs leading-relaxed text-muted">Track a wallet to see what it buys and sells on Keelfun.</p>
        ) : feed.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-dim">No trades from tracked wallets yet.</p>
        ) : (
          feed.map((r) => (
            <Link key={r.id + r.wallet} href={`/token/?a=${r.token}`} className="flex items-center gap-2 border-b border-line/60 px-3 py-2 text-xs hover:bg-panel-2/60">
              <TokenAvatar src={r.image} symbol={r.symbol} size={24} />
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  <span className={r.isBuy ? "text-up" : "text-down"}>{r.isBuy ? "Buy" : "Sell"}</span> ${r.symbol}
                </p>
                <p className="font-mono text-[10px] text-dim">{shortAddr(r.wallet)} · {timeAgo(r.ts)} ago</p>
              </div>
              <span className="font-mono text-[11px] text-muted">{fmtCompact(r.pairAmount ?? r.eth, 4)} {r.pair ? pairInfo(r.pair).symbol : "ETH"}</span>
            </Link>
          ))
        )}
      </div>
    </aside>
  );
}

export default function TerminalPage() {
  const [tab, setTab] = useState(0);
  const [tracker, setTracker] = useState(true);
  const [src, setSrc] = useState<"base" | "keel">("base");
  const [view, setView] = useState<"all" | "watch">("all");
  const [watch] = useWatch();
  const { prefs, preset } = usePrefs();
  const keelBuy = useKeelBuy();
  const relay = useRelayBuy();
  const pick = (p: number | null) => (p == null ? preset : prefs.presets[p]);
  const buy = (t: Token, a: string, p: number | null) => keelBuy(t, { ...pick(p), amount: a });
  const relayBuy = (x: BasePool, a: string, p: number | null) => relay(x, { ...pick(p), amount: a });
  useEffect(() => {
    const f = () => setTracker((v) => !v);
    addEventListener("keel-tracker", f);
    return () => removeEventListener("keel-tracker", f);
  }, []);
  const cols = src === "base" ? BASE_COLS : COLS;
  return (
    <div className="relative left-1/2 -mb-20 flex h-[calc(100dvh-6.5rem)] w-screen -translate-x-1/2 flex-col border-t border-line lg:h-[calc(100dvh-3.5rem)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2">
        {!tracker && (
          <button onClick={() => setTracker(true)} className="hidden h-8 rounded-md border border-line px-2 text-xs text-muted hover:text-fg xl:block">Wallet tracker</button>
        )}
        <h1 className="text-base font-bold italic">Pulse</h1>
        <span className="flex items-center gap-1.5 text-xs text-up"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-up" />live</span>
        <div className="flex rounded-lg border border-line p-0.5 text-xs">
          {([["base", "All Base"], ["keel", "Keelfun"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setSrc(k)} className={`rounded-md px-2.5 py-1 ${src === k ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}>{l}</button>
          ))}
        </div>
        <div className="flex rounded-lg border border-line p-0.5 text-xs">
          {([["all", "All"], ["watch", `★ ${watch.length}`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className={`rounded-md px-2.5 py-1 ${view === k ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}>{l}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <PresetBar />
        </div>
      </div>
      <div className="flex border-b border-line lg:hidden">
        {cols.map((c, i) => (
          <button key={c.sort} onClick={() => setTab(i)} className={`-mb-px flex-1 border-b-2 py-2.5 text-sm ${tab === i ? "border-accent text-fg" : "border-transparent text-muted"}`}>
            {c.title}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1">
        {tracker && <Tracker onClose={() => setTracker(false)} />}
        {src === "base"
          ? BASE_COLS.map((c, i) => <BaseColumn key={`b${c.sort}`} sort={c.sort} title={c.title} buy={relayBuy} hidden={tab !== i} view={view} />)
          : COLS.map((c, i) => <Column key={c.sort} sort={c.sort} title={c.title} buy={buy} hidden={tab !== i} view={view} />)}
      </div>
    </div>
  );
}
