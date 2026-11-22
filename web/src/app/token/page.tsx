"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PriceChart } from "@/components/PriceChart";
import { TokenAvatar } from "@/components/TokenAvatar";
import { FeesCard } from "@/components/FeesCard";
import { TradePanel } from "@/components/TradePanel";
import { keelMeta, QuickSell } from "@/components/QuickBuy";
import { useFees, useHolders, useToken, useTrades, type FeeEvent, type Token } from "@/lib/api";
import { EXPLORER, pairInfo } from "@/lib/config";
import { fmtCompact, fmtEth, fmtPct, fmtPrice, fmtValue, shortAddr, timeAgo } from "@/lib/format";

function Copy({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(value).then(() => (setDone(true), setTimeout(() => setDone(false), 1200)))}
      className="rounded-lg border border-line px-2 py-1 font-mono text-xs text-muted hover:text-fg"
    >
      {done ? "copied" : label ?? shortAddr(value)}
    </button>
  );
}

function ext(url: string | null) {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

function Header({ t }: { t: Token }) {
  const pair = pairInfo(t.pair);
  const links = [
    ["Website", ext(t.website)],
    ["X", ext(t.x)],
    ["Telegram", ext(t.telegram)],
    ["Discord", ext(t.discord)],
  ].filter(([, u]) => u) as [string, string][];
  const [shared, setShared] = useState(false);
  const share = () => {
    const url = `https://keelfun.app/token/?a=${t.address}`;
    (navigator.share ? navigator.share({ title: `${t.name} ($${t.symbol})`, url }) : navigator.clipboard.writeText(url).then(() => (setShared(true), setTimeout(() => setShared(false), 1200)))).catch(() => {});
  };
  const chip = "inline-flex h-6 items-center gap-1.5 rounded-md border border-line bg-panel px-2 text-xs";
  return (
    <div className="flex flex-wrap items-start gap-4">
      <TokenAvatar src={t.image} symbol={t.symbol} size={64} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{t.name}</h1>
          <span className="text-sm text-muted">{t.symbol}</span>
          <Copy value={t.address} />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className={chip}>
            <img src={pair.logo} alt="" className="h-3.5 w-3.5 rounded-full" />
            {pair.symbol}
          </span>
          <span className={`${chip} ${t.editable ? "text-warn" : "border-up/30 text-up"}`}>
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d={t.editable ? "M8 11V7a4 4 0 0 1 7.5-2" : "M8 11V7a4 4 0 0 1 8 0v4"} /></svg>
            {t.editable ? "Editable" : "Immutable"}
          </span>
          <span className={`${chip} border-up/30 text-up`}>LP locked</span>
          {t.antiSnipe && <span className={`${chip} text-muted`}>Anti-snipe</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {links.map(([l, u]) => (
          <a key={l} href={u} target="_blank" rel="noreferrer" className="flex h-9 items-center rounded-full border border-line px-3 text-xs text-muted hover:text-fg">
            {l === "X" ? (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-label="X">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            ) : (
              l
            )}
          </a>
        ))}
        <button onClick={share} className="flex h-9 items-center gap-1.5 rounded-full bg-accent-2 px-4 text-sm font-semibold text-bg">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" /></svg>
          {shared ? "Copied" : "Share"}
        </button>
      </div>
    </div>
  );
}

function Stats({ t, ethUsd }: { t: Token; ethUsd: number }) {
  const inPair = (eth: number) => (t.pairEth > 0 ? `${fmtCompact(eth / t.pairEth, 4)} ${t.pairSymbol}` : "");
  const items: [string, string, string][] = [
    ["Market cap", fmtValue(t.fdvEth, ethUsd), inPair(t.fdvEth)],
    ["Token price", ethUsd > 0 ? `$${fmtPrice(t.priceUsd)}` : fmtEth(t.priceEth), `${fmtPrice(t.priceInPair)} ${t.pairSymbol}`],
    ["Volume 24h", fmtValue(t.volume24hEth, ethUsd), inPair(t.volume24hEth)],
    ["Pool liquidity", fmtValue(t.liquidityEth, ethUsd), inPair(t.liquidityEth)],
    ["Total supply", fmtCompact(t.supply), t.burned > 0 ? `${fmtCompact(t.burned)} burned` : "fixed"],
    ["Holders", fmtCompact(t.holders, 1), `${t.trades} trades`],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(([k, v, sub]) => (
        <div key={k} className="min-w-0">
          <p className="text-xs text-muted">{k}</p>
          <p className="mt-1 truncate text-2xl font-bold tracking-tight">{v}</p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-dim">
            {sub}
            {k === "Market cap" && t.change24h !== 0 && <span className={`ml-2 ${t.change24h >= 0 ? "text-up" : "text-down"}`}>{fmtPct(t.change24h)}</span>}
          </p>
        </div>
      ))}
    </div>
  );
}

function Info({ t, ethUsd }: { t: Token; ethUsd: number }) {
  const both = (eth: number) => (
    <span className="text-right">
      <span className="block">{fmtValue(eth, ethUsd)}</span>
      {t.pairEth > 0 && <span className="block text-[11px] text-dim">{fmtCompact(eth / t.pairEth, 4)} {t.pairSymbol}</span>}
    </span>
  );
  const d = new Date(t.createdAt * 1000);
  const rows: [string, React.ReactNode][] = [
    ["Creator", <Link key="c" href={`/portfolio/?w=${t.creator}`} className="hover:text-accent-fg">{shortAddr(t.creator)}</Link>],
    ["Created", <span key="d" className="text-right"><span className="block">{d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span><span className="block text-[11px] text-dim">({timeAgo(t.createdAt)} ago)</span></span>],
    ["Buy / sell tax", `${t.buyBps / 100}% / ${t.sellBps / 100}%`],
    ["Lifetime volume", both(t.volumeEth)],
    ["Creator revenue", both(t.routeFeesEth)],
    ["Protocol revenue", both(t.platformFeesEth)],
    ["Bought back & burned", `${fmtCompact(t.buybackBurned)} ${t.symbol}`],
  ];
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <h3 className="mb-2 text-sm font-semibold">Info</h3>
      {t.description && <p className="mb-3 text-sm leading-relaxed text-muted">{t.description}</p>}
      <dl className="divide-y divide-line/60 font-mono text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-3 py-2.5">
            <dt className="font-sans text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const FEE_LABEL: Record<FeeEvent["kind"], [string, string]> = {
  buy_tax: ["Buy tax", "text-up"],
  sell_tax: ["Sell tax", "text-down"],
  claim: ["Creator claim", "text-accent-fg"],
  holders: ["Holder dividends", "text-up"],
  burn: ["Buyback burn", "text-warn"],
};

function Activity({ t, ethUsd }: { t: Token; ethUsd: number }) {
  const [tab, setTab] = useState<"trades" | "buys" | "sells" | "holders" | "fees">("trades");
  const trades = useTrades(t.address);
  const holders = useHolders(t.address);
  const fees = useFees(tab === "fees" ? t.address : undefined);
  const pair = pairInfo(t.pair);
  const rows = trades.data?.trades.filter((r) => tab === "trades" || (tab === "buys" ? r.isBuy : !r.isBuy));
  const approx = (eth: number) => (ethUsd > 0 ? <span className="block text-[11px] text-dim">≈ ${fmtPrice(eth * ethUsd)}</span> : null);
  const tx = (h: string, child: React.ReactNode) =>
    EXPLORER ? <a href={`${EXPLORER}/tx/${h}`} target="_blank" rel="noreferrer" className="hover:text-fg">{child}</a> : child;
  const th = "py-3 font-normal";
  const td = "py-3.5";
  const empty =
    (tab === "holders" ? holders.data?.holders.length : tab === "fees" ? fees.data?.fees.length : rows?.length) === 0;
  return (
    <div>
      <h3 className="mb-3 text-lg font-semibold">Transactions</h3>
      <div className="no-scrollbar flex gap-5 overflow-x-auto border-b border-line">
        {([["trades", "All"], ["buys", "Buy"], ["sells", "Sell"], ["holders", `Holders${t.holders ? ` ${t.holders}` : ""}`], ["fees", "Fees"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px shrink-0 border-b-2 pb-3 text-sm transition-colors ${tab === k ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="max-h-[560px] overflow-auto">
        {(tab === "trades" || tab === "buys" || tab === "sells") && (
          <table className="w-full min-w-[640px] text-sm tabular-nums">
            <thead className="sticky top-0 bg-bg text-xs text-muted">
              <tr className="border-b border-line">
                <th className={`${th} text-left`}>Time</th>
                <th className={`${th} text-left`}>Type</th>
                <th className={`${th} text-right`}>Price</th>
                <th className={`${th} text-right`}>Amount</th>
                <th className={`${th} text-right`}>Value</th>
                <th className={`${th} text-right`}>Wallet</th>
                <th className={`${th} text-right`}>Tx</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {rows?.map((r) => {
                const px = t.pairEth > 0 ? r.priceEth / t.pairEth : r.priceEth;
                return (
                  <tr key={r.id} className="border-b border-line/70">
                    <td className={`${td} text-muted`}>{timeAgo(r.ts)} ago</td>
                    <td className={`${td} font-sans text-sm ${r.isBuy ? "text-up" : "text-down"}`}>{r.isBuy ? "Buy" : "Sell"}</td>
                    <td className={`${td} text-right`}>{fmtPrice(px)} {pair.symbol}{approx(r.priceEth)}</td>
                    <td className={`${td} text-right`}>{fmtCompact(r.tokens)} <span className="text-dim">{t.symbol}</span></td>
                    <td className={`${td} text-right`}>{fmtCompact(Number(r.pairAmount ?? r.eth), 4)} {pair.symbol}{approx(r.eth)}</td>
                    <td className={`${td} text-right`}>
                      <Link href={`/portfolio/?w=${r.trader}`} className={`hover:text-accent-fg ${r.trader === t.creator ? "text-warn" : "text-muted"}`}>
                        {r.trader === t.creator ? "dev" : shortAddr(r.trader)}
                      </Link>
                    </td>
                    <td className={`${td} text-right text-muted`}>{tx(r.tx, "↗")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {tab === "holders" && (
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-bg text-muted">
              <tr className="border-b border-line">
                <th className={`${th} w-10 text-left`}>#</th>
                <th className={`${th} text-left`}>Holder</th>
                <th className={`${th} text-right`}>{t.symbol}</th>
                <th className={`${th} text-right`}>Share</th>
              </tr>
            </thead>
            <tbody>
              {holders.data?.holders.map((h, i) => (
                <tr key={h.holder} className="border-b border-line/70">
                  <td className={`${td} text-muted`}>{i + 1}</td>
                  <td className={td}>
                    <Link href={`/portfolio/?w=${h.holder}`} className="hover:text-accent-fg">{shortAddr(h.holder)}</Link>
                    {h.label && <span className="ml-2 rounded bg-panel-2 px-1.5 py-0.5 text-[10px] text-muted">{h.label === "pool" ? "v4 pool" : h.label}</span>}
                  </td>
                  <td className={`${td} text-right`}>{fmtCompact(h.amount)}</td>
                  <td className={`${td} text-right text-muted`}>{fmtPct(h.pct, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "fees" && (
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-bg text-muted">
              <tr className="border-b border-line">
                <th className={`${th} text-left`}>Type</th>
                <th className={`${th} text-right`}>{pair.symbol}</th>
                <th className={`${th} hidden text-right sm:table-cell`}>Wallet</th>
                <th className={`${th} text-right`}>When</th>
              </tr>
            </thead>
            <tbody>
              {fees.data?.fees.map((f) => (
                <tr key={f.id + f.kind} className="border-b border-line/70">
                  <td className={`${td} ${FEE_LABEL[f.kind][1]}`}>
                    {FEE_LABEL[f.kind][0]}
                    {f.kind === "burn" && f.tokens > 0 && <span className="ml-1.5 text-xs text-muted">{fmtCompact(f.tokens)} {t.symbol}</span>}
                  </td>
                  <td className={`${td} text-right`}>{fmtCompact(f.amount)}</td>
                  <td className={`${td} hidden text-right text-muted sm:table-cell`}>{f.who ? shortAddr(f.who) : "—"}</td>
                  <td className={`${td} text-right text-muted`}>{tx(f.tx, `${timeAgo(f.ts)} ago`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {empty && <p className="py-10 text-center text-sm text-dim">Nothing yet</p>}
      </div>
    </div>
  );
}

function TokenView() {
  const params = useSearchParams();
  const addr = params.get("a")?.toLowerCase();
  const { data, error, isLoading } = useToken(addr);
  if (!addr) return <p className="py-20 text-center text-sm text-muted">No token selected.</p>;
  if (isLoading || (!data && !error))
    return <p className="py-20 text-center text-sm text-muted">Loading token… freshly launched tokens show up within a few seconds.</p>;
  if (error || !data) return <p className="py-20 text-center text-sm text-down">Token not found.</p>;
  const t = data.token;
  return <TokenBody t={t} ethUsd={data.ethUsd} />;
}

function TokenBody({ t, ethUsd }: { t: Token; ethUsd: number }) {
  const [side, setSide] = useState<{ s: "buy" | "sell"; n: number }>({ s: "buy", n: 0 });
  const go = (s: "buy" | "sell") => {
    setSide((v) => ({ s, n: v.n + 1 }));
    setTimeout(() => document.getElementById("trade-m")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };
  return (
    <div className="space-y-5 pb-24 pt-5 lg:pb-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">← All tokens</Link>
      <Header t={t} />
      <Stats t={t} ethUsd={ethUsd} />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-5">
          <PriceChart t={t} ethUsd={ethUsd} />
          <div id="trade-m" className="lg:hidden">
            <TradePanel key={`m${side.n}`} token={t} defaultSide={side.s} />
            <div className="mt-3"><QuickSell meta={keelMeta(t)} /></div>
          </div>
          <div className="lg:hidden">
            <Info t={t} ethUsd={ethUsd} />
          </div>
          <Activity t={t} ethUsd={ethUsd} />
        </div>
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="hidden lg:block">
            <TradePanel token={t} />
            <div className="mt-3"><QuickSell meta={keelMeta(t)} /></div>
          </div>
          <div className="hidden lg:block">
            <Info t={t} ethUsd={ethUsd} />
          </div>
          <FeesCard t={t} ethUsd={ethUsd} />
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
        <button onClick={() => go("buy")} className="h-12 flex-1 rounded-full bg-up text-base font-semibold text-bg">Buy</button>
        <button onClick={() => go("sell")} className="h-12 flex-1 rounded-full bg-down text-base font-semibold text-bg">Sell</button>
      </div>
    </div>
  );
}

export default function TokenPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Loading…</p>}>
      <TokenView />
    </Suspense>
  );
}
