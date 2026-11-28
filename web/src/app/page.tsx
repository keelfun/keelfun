"use client";
import { BuildOnBaseCta } from "@/components/BuiltOnBase";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TokenCard } from "@/components/TokenCard";
import { HeroChart } from "@/components/HeroChart";
import { PairTicker } from "@/components/PairTicker";
import { useStats, useTokens } from "@/lib/api";
import { BRAND, chain, DEPLOYED, PAIRS, pairInfo } from "@/lib/config";
import { PairLogo, PairPicker } from "@/components/PairPicker";
import { TokenAvatar } from "@/components/TokenAvatar";
import { fmtCompact, fmtPct, fmtValue, timeAgo } from "@/lib/format";
import { KeelCA, OfficialBadge, pinOfficial } from "@/components/Official";

const TABS = [
  { id: "top", label: "Market cap" },
  { id: "volume", label: "Volume" },
  { id: "new", label: "New" },
  { id: "active", label: "Active" },
];

export default function Home() {
  const [sort, setSort] = useState("top");
  const [pairIdx, setPairIdx] = useState(-1);
  const [picker, setPicker] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);
  const { data, isLoading, error } = useTokens(sort, q, pairIdx >= 0 ? PAIRS[pairIdx].address.toLowerCase() : "");
  const { data: stats } = useStats();
  const tokens = pinOfficial(data?.tokens, (t) => t.address) ?? [];
  const ethUsd = data?.ethUsd ?? stats?.ethUsd ?? 0;

  return (
    <div>
      <section className="relative left-1/2 -mt-px mb-8 w-screen -translate-x-1/2 overflow-hidden">
        <img src="/art/hero.webp" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[70%_40%] opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/85 via-bg/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-bg/30 via-transparent to-bg" />
        <HeroChart featured={tokens[0]} ethUsd={ethUsd} />
        <div className="anim-rise relative mx-auto max-w-7xl px-4 pb-10 pt-16 sm:px-6 sm:pb-14 sm:pt-28">
          <h1 className="max-w-3xl font-serif text-[44px] leading-[1.02] tracking-tight sm:text-7xl">
            The steady way to <em className="text-accent-soft">launch</em> on Base
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-fg/80 sm:text-base">
            One transaction, a Uniswap v4 pool from block one and liquidity locked forever. Fees go to you, your holders or a
            split.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/launch/" className="rounded-lg bg-fg px-5 py-2.5 text-sm font-medium text-bg hover:bg-white">
              Launch a token
            </Link>
            <a href="#markets" className="text-sm text-fg/90 underline-offset-4 hover:underline">
              See what&apos;s trading
            </a>
            <Link href="/docs/" className="text-sm text-fg/90 underline-offset-4 hover:underline">
              How {BRAND} works
            </Link>
          </div>
          <div className="mt-6">
            <span className="hidden sm:inline"><KeelCA /></span>
            <span className="sm:hidden"><KeelCA short /></span>
          </div>
          {!DEPLOYED && (
            <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-warn/30 bg-bg/60 px-3 py-1 text-xs text-warn backdrop-blur">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" /> Contracts go live on {chain.name} soon. Launching and trading open then.
            </p>
          )}
          <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-6 sm:mt-16 lg:grid-cols-4">
            {[
              ["Tokens launched", stats ? fmtCompact(stats.tokens, 0) : "0", "fixed supply, no presale"],
              ["Volume", stats ? fmtValue(stats.volumeEth, stats.ethUsd) : "$0", "settled in v4 pools"],
              ["Trades", stats ? fmtCompact(stats.trades, 1) : "0", "on " + chain.name],
              ["LP locked", "100%", "forever, from block one"],
            ].map(([k, v, sub]) => (
              <div key={k} className="border-t border-fg/15 pt-3">
                <p className="text-xs text-fg/60">{k}</p>
                <p className="mt-1 font-serif text-4xl sm:text-5xl">{v}</p>
                <p className="mt-1 text-xs text-fg/45">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PairTicker />
      <h2 id="markets" className="mb-3 mt-4 scroll-mt-28 font-serif text-4xl sm:text-5xl">Markets</h2>
      <div className="sticky top-[97px] z-30 -mx-4 mb-4 flex flex-col gap-3 border-b border-line bg-bg/90 px-4 pt-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-14 md:flex-row md:items-end">
        <div className="no-scrollbar flex gap-5 overflow-x-auto sm:gap-7">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setSort(t.id)}
              className={`-mb-px shrink-0 border-b-2 pb-3 pt-1 text-[15px] font-medium transition-colors ${sort === t.id ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pb-3 md:ml-auto">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search name, ticker or address"
            className="h-9 min-w-0 flex-1 rounded-full border border-line bg-panel px-4 text-sm outline-none placeholder:text-dim focus:border-accent/50 md:w-60 md:flex-none"
          />
          <button
            onClick={() => setPicker(true)}
            className={`flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors ${pairIdx >= 0 ? "border-accent/60 bg-accent/10" : "border-line bg-panel hover:border-line-2"}`}
          >
            {pairIdx >= 0 ? <><PairLogo p={PAIRS[pairIdx]} size={18} />{PAIRS[pairIdx].symbol}</> : "Any pair"}
            <span className="text-dim">▾</span>
          </button>
          {pairIdx >= 0 && (
            <button onClick={() => setPairIdx(-1)} className="h-9 shrink-0 px-1 text-xs text-muted hover:text-fg" aria-label="Clear pair">✕</button>
          )}
          <div className="flex shrink-0 rounded-full border border-line bg-panel p-0.5">
            {(["list", "grid"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} aria-label={`${v} view`} className={`flex h-8 w-9 items-center justify-center rounded-full ${view === v ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}>
                {v === "list" ? (
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 4h9M5 8h9M5 12h9M2 4h.01M2 8h.01M2 12h.01" strokeLinecap="round" /></svg>
                ) : (
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="2" width="5" height="5" rx="1.2" /><rect x="9" y="2" width="5" height="5" rx="1.2" /><rect x="2" y="9" width="5" height="5" rx="1.2" /><rect x="9" y="9" width="5" height="5" rx="1.2" /></svg>
                )}
              </button>
            ))}
          </div>
        </div>
        {picker && (
          <PairPicker
            pairs={PAIRS.map((p, i) => ({ p, i }))}
            onClose={() => setPicker(false)}
            onPick={(i) => {
              setPairIdx(i);
              setPicker(false);
            }}
          />
        )}
      </div>

      {error && DEPLOYED ? (
        <p className="py-16 text-center text-sm text-down">Couldn&apos;t load tokens: {String((error as Error).message)}</p>
      ) : isLoading && DEPLOYED ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl border border-line bg-panel" />
          ))}
        </div>
      ) : data && data.tokens.length > 0 ? (
        view === "grid" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tokens.map((t, i) => (
              <TokenCard key={t.address} t={t} ethUsd={ethUsd} i={i} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
            <table className="w-full min-w-[640px] text-sm tabular-nums">
              <thead className="text-muted">
                <tr className="border-b border-line text-left">
                  <th className="px-4 py-3 font-normal">Token</th>
                  <th className="px-4 py-3 font-normal">Pair</th>
                  <th className="px-4 py-3 text-right font-normal">Market cap</th>
                  <th className="px-4 py-3 text-right font-normal">Vol 24h</th>
                  <th className="px-4 py-3 text-right font-normal">24h</th>
                  <th className="px-4 py-3 text-right font-normal">Holders</th>
                  <th className="px-4 py-3 text-right font-normal">Age</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => {
                  const p = pairInfo(t.pair);
                  return (
                    <tr key={t.address} className="anim-rise border-b border-line/60 last:border-0 hover:bg-panel-2">
                      <td className="px-4 py-3">
                        <Link href={`/token/?a=${t.address}`} className="flex items-center gap-3">
                          <TokenAvatar src={t.image} symbol={t.symbol} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 truncate font-medium">{t.name}<OfficialBadge address={t.address} /></span>
                            <span className="block text-xs text-muted">${t.symbol}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3"><span className="flex items-center gap-1.5"><PairLogo p={p} size={18} />{t.pairSymbol ?? p.symbol}</span></td>
                      <td className="px-4 py-3 text-right">{fmtValue(t.fdvEth, ethUsd)}</td>
                      <td className="px-4 py-3 text-right">{fmtValue(t.volume24hEth, ethUsd)}</td>
                      <td className={`px-4 py-3 text-right ${t.change24h >= 0 ? "text-up" : "text-down"}`}>{fmtPct(t.change24h)}</td>
                      <td className="px-4 py-3 text-right">{t.holders}</td>
                      <td className="px-4 py-3 text-right text-muted">{timeAgo(t.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="rounded-2xl border border-dashed border-line-2 py-16 text-center">
          <p className="text-sm text-muted">{q ? "No tokens match that search." : "No tokens here yet."}</p>
          <Link href="/launch/" className="mt-3 inline-block text-sm text-accent-fg hover:underline">
            Be the first to launch →
          </Link>
        </div>
      )}
      <section className="relative left-1/2 mt-12 w-screen -translate-x-1/2 overflow-hidden">
        <img src="/art/band.webp" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[60%_55%] opacity-85" />
        <div className="absolute inset-0 bg-gradient-to-b from-bg via-bg/20 to-bg" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/85 via-bg/30 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
          <h2 className="max-w-xl font-serif text-4xl leading-tight sm:text-6xl">
            Every token gets a <em className="text-accent-soft">keel</em>
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-fg/80">
            Fixed supply, 100% of tokens in the pool, optional 60-second anti-snipe and fees that keep paying the people who
            hold.
          </p>
          <Link href="/launch/" className="mt-7 inline-block rounded-lg bg-fg px-5 py-2.5 text-sm font-medium text-bg hover:bg-white">
            Launch a token
          </Link>
        </div>
      </section>
      <BuildOnBaseCta />
    </div>
  );
}
