"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TokenCard } from "@/components/TokenCard";
import { HeroChart } from "@/components/HeroChart";
import { PairTicker } from "@/components/PairTicker";
import { useStats, useTokens } from "@/lib/api";
import { BRAND, chain, DEPLOYED } from "@/lib/config";
import { fmtCompact, fmtValue } from "@/lib/format";

const TABS = [
  { id: "trending", label: "Trending" },
  { id: "new", label: "New" },
  { id: "top", label: "Top FDV" },
  { id: "holders", label: "Most holders" },
];

export default function Home() {
  const [sort, setSort] = useState("trending");
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);
  const { data, isLoading, error } = useTokens(sort, q);
  const { data: stats } = useStats();
  const ethUsd = data?.ethUsd ?? stats?.ethUsd ?? 0;

  return (
    <div>
      <section className="relative left-1/2 -mt-px mb-8 w-screen -translate-x-1/2 overflow-hidden">
        <img src="/art/hero.webp" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[70%_40%] opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/85 via-bg/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-bg/30 via-transparent to-bg" />
        <HeroChart featured={data?.tokens[0]} ethUsd={ethUsd} />
        <div className="anim-rise relative mx-auto max-w-7xl px-4 pb-10 pt-16 sm:px-6 sm:pb-14 sm:pt-28">
          <h1 className="max-w-3xl font-serif text-[44px] leading-[1.02] tracking-tight sm:text-7xl">
            The steady way to <em className="text-[#bcd3ff]">launch</em> on Base
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
      <div className="sticky top-[97px] z-30 -mx-4 mb-4 flex flex-col gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:top-14 md:flex-row md:items-center">
        <div className="no-scrollbar flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setSort(t.id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors ${sort === t.id ? "bg-accent text-accent-ink" : "text-muted hover:bg-panel-2 hover:text-fg"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search name, ticker or address"
          className="h-9 w-full rounded-lg border border-line bg-panel px-3 text-sm outline-none placeholder:text-dim focus:border-accent/50 md:ml-auto md:w-72"
        />
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.tokens.map((t, i) => (
            <TokenCard key={t.address} t={t} ethUsd={ethUsd} i={i} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-line-2 py-16 text-center">
          <p className="text-sm text-muted">{q ? "No tokens match that search." : "No tokens here yet."}</p>
          <Link href="/launch/" className="mt-3 inline-block text-sm text-accent hover:underline">
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
            Every token gets a <em className="text-[#bcd3ff]">keel</em>
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
    </div>
  );
}
