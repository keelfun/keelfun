"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Bolt, PresetBar, useKeelBuy, usePrefs, useRelayBuy } from "@/components/QuickBuy";
import { TokenAvatar } from "@/components/TokenAvatar";
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
            <button
              onClick={native ? go : undefined}
              className={`ml-auto flex h-8 shrink-0 items-center gap-1 rounded-lg border px-3 font-mono text-xs font-semibold ${
                state === "ok" ? "border-up bg-up/20 text-up" : state && state !== "busy" ? "border-down/60 text-down" : "border-up/50 bg-up/10 text-up hover:bg-up/20"
              }`}
              title={native ? `Quick buy ${amount} ETH` : `Open to buy with ${pair.symbol}`}
            >
              <Bolt />
              {state === "busy" ? "…" : state === "ok" ? "Bought" : state ? "Failed" : native ? amount : pair.symbol}
            </button>
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

function Column({ sort, title, amount, buy, hidden }: { sort: string; title: string; amount: string; buy: (t: Token, a: string) => Promise<void>; hidden: boolean }) {
  const [q, setQ] = useState("");
  const { data, isLoading } = useTokens(sort, q);
  return (
    <section className={`${hidden ? "hidden lg:flex" : "flex"} min-h-0 min-w-0 flex-1 flex-col border-line lg:border-r`}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="shrink-0 text-sm font-bold italic">{title}</h2>
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-up" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          className="ml-auto h-7 w-28 min-w-0 rounded-md border border-line bg-bg px-2 text-xs outline-none focus:border-accent"
        />
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {data?.tokens.map((t) => <Row key={t.address} t={t} ethUsd={data.ethUsd} amount={amount} buy={buy} />)}
        {isLoading && <p className="p-6 text-center text-xs text-dim">Loading…</p>}
        {data && data.tokens.length === 0 && <p className="p-6 text-center text-xs text-dim">No tokens yet.</p>}
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
  return (
    <Link href={`/pair/?p=${p.pool}`} className="group block border-b border-line px-3 py-2.5 transition-colors hover:bg-panel-2/60">
      <div className="flex gap-3">
        <div className="relative shrink-0">
          <TokenAvatar src={t.image} symbol={t.symbol} size={52} />
          <span className="absolute -bottom-1 -right-1 rounded bg-bg px-1 font-mono text-[9px] text-muted ring-1 ring-line">{DEX[p.dex] ?? p.dex.replace(/-base$/, "").slice(0, 8)}</span>
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
            <span className="text-up">{p.createdAt ? timeAgo(p.createdAt) : "—"}</span>
            <span className="rounded-full border border-line px-1.5 py-px text-[10px]">/{p.quote}</span>
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
            <button
              onClick={go}
              className={`ml-auto flex h-8 shrink-0 items-center gap-1 rounded-lg border px-3 font-mono text-xs font-semibold ${
                state === "ok" ? "border-up bg-up/20 text-up" : state && state !== "busy" ? "border-down/60 text-down" : "border-up/50 bg-up/10 text-up hover:bg-up/20"
              }`}
              title={`Quick buy ${amount} ETH via Relay`}
            >
              <Bolt />
              {state === "busy" ? "…" : state === "ok" ? "Bought" : state ? "Failed" : amount}
            </button>
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

function BaseColumn({ sort, title, amount, buy, hidden }: { sort: string; title: string; amount: string; buy: (p: BasePool, a: string) => Promise<void>; hidden: boolean }) {
  const [q, setQ] = useState("");
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
  return (
    <section className={`${hidden ? "hidden lg:flex" : "flex"} min-h-0 min-w-0 flex-1 flex-col border-line lg:border-r`}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="shrink-0 text-sm font-bold italic">{title}</h2>
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-up" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Base"
          className="ml-auto h-7 w-32 min-w-0 rounded-md border border-line bg-bg px-2 text-xs outline-none focus:border-accent"
        />
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {data?.pools.map((p) => <BaseRow key={p.pool} p={p} amount={amount} buy={buy} />)}
        {isLoading && <p className="p-6 text-center text-xs text-dim">Loading Base pairs…</p>}
        {error && !data && <p className="p-6 text-center text-xs text-dim">{(error as Error).message}</p>}
        {data && data.pools.length === 0 && <p className="p-6 text-center text-xs text-dim">No pairs found.</p>}
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
  const { preset } = usePrefs();
  const amount = preset.amount;
  const keelBuy = useKeelBuy();
  const relay = useRelayBuy();
  const buy = (t: Token, a: string) => keelBuy(t, { ...preset, amount: a });
  const relayBuy = (p: BasePool, a: string) => relay(p, { ...preset, amount: a });
  const cols = src === "base" ? BASE_COLS : COLS;
  return (
    <div className="relative left-1/2 -mb-20 flex h-[calc(100dvh-6.5rem)] w-screen -translate-x-1/2 flex-col border-t border-line lg:h-[calc(100dvh-3.5rem)]">
      <div className="flex items-center gap-3 border-b border-line px-3 py-2">
        {!tracker && (
          <button onClick={() => setTracker(true)} className="hidden h-8 rounded-md border border-line px-2 text-xs text-muted hover:text-fg xl:block">Wallet tracker</button>
        )}
        <h1 className="text-base font-bold italic">Terminal</h1>
        <span className="flex items-center gap-1.5 text-xs text-up"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-up" />live</span>
        <div className="flex rounded-lg border border-line p-0.5 text-xs">
          {([["base", "All Base"], ["keel", "Keelfun"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setSrc(k)} className={`rounded-md px-2.5 py-1 ${src === k ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}>{l}</button>
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
          ? BASE_COLS.map((c, i) => <BaseColumn key={`b${c.sort}`} sort={c.sort} title={c.title} amount={amount} buy={relayBuy} hidden={tab !== i} />)
          : COLS.map((c, i) => <Column key={c.sort} sort={c.sort} title={c.title} amount={amount} buy={buy} hidden={tab !== i} />)}
      </div>
    </div>
  );
}
