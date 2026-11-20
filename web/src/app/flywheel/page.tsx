"use client";
import Link from "next/link";
import { Em, PageHero } from "@/components/PageHero";
import { TokenAvatar } from "@/components/TokenAvatar";
import { useFlywheel } from "@/lib/api";
import { BRAND, EXPLORER } from "@/lib/config";
import { fmtCompact, fmtPct, fmtValue, timeAgo } from "@/lib/format";

const STEPS = [
  ["Trade", "Every buy and sell pays the token's tax (1–10%), taken in the pair asset inside the Uniswap v4 hook."],
  ["Split", "The tax is split by the creator's settings: creator wallets, holder dividends and a burn allocation."],
  ["Buy back", "The burn allocation piles up in the hook. Anyone can press Buy back + burn to spend it on the token in its own pool."],
  ["Burn", "Bought tokens go to the dead address forever. Supply only shrinks, holders keep their dividends."],
];

export default function FlywheelPage() {
  const { data } = useFlywheel();
  const usd = data?.ethUsd ?? 0;
  return (
    <div>
      <PageHero title={<>Ecosystem <Em>flywheel</Em></>} sub={`Tax from every ${BRAND} trade feeds the token it came from. Burn allocations buy the token back from its own pool and destroy it, so volume turns into a shrinking supply.`}>
        <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-3">
          {[
            ["Bought back & burned", data ? fmtValue(data.burnedEth, usd) : "—", "lifetime, valued now"],
            ["Buybacks executed", data ? fmtCompact(data.burns, 0) : "—", "each one a swap and a permanent burn"],
            ["Tokens reached", data ? String(data.tokensReached) : "—", "distinct tokens bought back"],
          ].map(([k, v, sub]) => (
            <div key={k} className="border-t border-fg/15 pt-3">
              <p className="text-xs text-fg/60">{k}</p>
              <p className="mt-1 font-serif text-4xl sm:text-5xl">{v}</p>
              <p className="mt-1 text-xs text-fg/45">{sub}</p>
            </div>
          ))}
        </div>
      </PageHero>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(([t, d], i) => (
          <div key={t} className="anim-rise relative overflow-hidden rounded-2xl border border-line bg-panel p-5" style={{ animationDelay: `${i * 80}ms` }}>
            <span className="font-mono text-xs text-accent">0{i + 1}</span>
            <p className="mt-2 text-lg font-semibold">{t}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{d}</p>
            {i < 3 && <span className="absolute right-4 top-4 hidden text-dim lg:block">→</span>}
          </div>
        ))}
      </section>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="font-serif text-3xl sm:text-4xl">Current rankings</h2>
          <p className="mt-1 text-sm text-muted">Top {BRAND} tokens by market cap and their share of the top 10. Burn shows the part of each tax that buys the token back.</p>
          <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-panel">
            {data?.rankings.map((t, i) => (
              <Link key={t.address} href={`/token/?a=${t.address}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-panel-2">
                <span className="w-5 font-mono text-xs text-dim">{i + 1}</span>
                <TokenAvatar src={t.image} symbol={t.symbol} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.symbol} <span className="text-dim">/ {t.pairSymbol ?? "ETH"}</span></p>
                  <p className="truncate text-xs text-muted">{t.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm">{fmtValue(t.fdvEth, usd)}</p>
                  <p className="text-xs text-muted">{fmtPct(t.weight, false)} weight · burn {(t.burnBps ?? 0) / 100}%</p>
                </div>
              </Link>
            ))}
            {data && data.rankings.length === 0 && <p className="py-10 text-center text-sm text-dim">No tokens yet</p>}
          </div>
        </section>
        <section>
          <h2 className="font-serif text-3xl sm:text-4xl">Recent buyback burns</h2>
          <p className="mt-1 text-sm text-muted">Bought on the open market with burn allocations, then sent to the dead address.</p>
          <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-panel">
            {data?.recent.map((r) => (
              <div key={r.tx + r.token} className="flex items-center gap-3 px-4 py-3 text-sm">
                <TokenAvatar src={r.image} symbol={r.symbol} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.symbol}</p>
                  <p className="text-xs text-muted">{fmtCompact(r.tokens)} burned · {timeAgo(r.ts)} ago</p>
                </div>
                <div className="text-right">
                  <p>{fmtValue(r.eth, usd)}</p>
                  {EXPLORER && <a href={`${EXPLORER}/tx/${r.tx}`} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">view burn</a>}
                </div>
              </div>
            ))}
            {data && data.recent.length === 0 && <p className="py-10 text-center text-sm text-dim">No burns yet. Open a token with a burn allocation and press Buy back + burn.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
