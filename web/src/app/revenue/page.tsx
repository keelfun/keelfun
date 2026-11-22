"use client";
import Link from "next/link";
import { useState } from "react";
import { Em, PageHero } from "@/components/PageHero";
import { useRevenue } from "@/lib/api";
import { ADDR, BRAND, EXPLORER } from "@/lib/config";
import { fmtCompact, fmtValue } from "@/lib/format";

export default function RevenuePage() {
  const { data } = useRevenue();
  const usd = data?.ethUsd ?? 0;
  const [metric, setMetric] = useState<"feesEth" | "volumeEth">("feesEth");
  const days = data?.daily ?? [];
  const max = Math.max(1e-18, ...days.map((d) => d[metric]));
  const v = (n?: number) => (data ? fmtValue(n ?? 0, usd) : "—");
  return (
    <div>
      <PageHero title={<><Em>Revenue</Em></>} sub={`Every ${BRAND} trade pays a small protocol cut on top of the creator's tax. It collects in the hook per pair asset until the treasury withdraws it. The rest of the tax goes straight to creators, holders and burns.`}>
        <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-3">
          {[
            ["Platform revenue", v(data?.platformFeesEth), "protocol cut, valued now"],
            ["Trading volume", v(data?.volumeEth), "all pairs, all time"],
            ["Paid to creators", v(data?.creatorFeesEth), "creator share of taxes"],
            ["Holder dividends", v(data?.holdersEth), "flushed to holders"],
            ["Bought back & burned", v(data?.burnsEth), `${data?.burnCount ?? 0} buybacks`],
            ["Claimed by creators", v(data?.claimsEth), "withdrawn from the hook"],
          ].map(([k, val, sub]) => (
            <div key={k} className="border-t border-fg/15 pt-3">
              <p className="text-xs text-fg/60">{k}</p>
              <p className="mt-1 font-serif text-3xl sm:text-5xl">{val}</p>
              <p className="mt-1 text-xs text-fg/45">{sub}</p>
            </div>
          ))}
        </div>
      </PageHero>

      <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Daily {metric === "feesEth" ? "taxes collected" : "volume"}</h2>
            <p className="text-sm text-muted">Last {days.length || 0} days with trades, in USD.</p>
          </div>
          <div className="flex gap-1 rounded-lg border border-line p-1">
            {([["feesEth", "Taxes"], ["volumeEth", "Volume"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setMetric(k)} className={`rounded-md px-3 py-1 text-sm ${metric === k ? "bg-panel-2 text-fg" : "text-muted"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="mt-6 flex h-48 items-end gap-1">
          {days.map((d) => (
            <div key={d.day} className="group relative flex h-full max-w-10 flex-1 items-end">
              <div className="anim-rise w-full rounded-t bg-accent/70 transition-colors group-hover:bg-accent" style={{ height: `${Math.max(2, (d[metric] / max) * 100)}%` }} />
              <span className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-panel-2 px-2 py-1 font-mono text-[10px] group-hover:block">
                {new Date(d.day * 1000).toLocaleDateString("en", { month: "short", day: "numeric" })} · {fmtValue(d[metric], usd)}
              </span>
            </div>
          ))}
          {days.length === 0 && <p className="w-full self-center text-center text-sm text-dim">No trades yet</p>}
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Platform revenue by pair</h2>
          <table className="mt-3 w-full text-sm tabular-nums">
            <thead className="text-muted"><tr className="border-b border-line"><th className="py-2 text-left font-normal">Pair</th><th className="py-2 text-right font-normal">Amount</th><th className="py-2 text-right font-normal">Value</th></tr></thead>
            <tbody>
              {data?.byPair.map((p) => (
                <tr key={p.symbol} className="border-b border-line/60"><td className="py-2.5">{p.symbol}</td><td className="py-2.5 text-right">{fmtCompact(p.amount)}</td><td className="py-2.5 text-right">{fmtValue(p.eth, usd)}</td></tr>
              ))}
            </tbody>
          </table>
          {data && data.byPair.length === 0 && <p className="py-6 text-center text-sm text-dim">Nothing collected yet</p>}
        </div>
        <div className="rounded-2xl border border-line bg-panel p-5 text-sm leading-relaxed text-muted sm:p-6">
          <h2 className="text-lg font-semibold text-fg">Where it goes</h2>
          <p className="mt-3">Protocol fees are held by the hook contract{EXPLORER && <> (<a href={`${EXPLORER}/address/${ADDR.hook}`} target="_blank" rel="noreferrer" className="text-accent-fg hover:underline">view on Basescan</a>)</>} and can only be withdrawn by the {BRAND} treasury.</p>
          <p className="mt-3">The plan for that revenue, including buybacks, lives on the <Link href="/buyback/" className="text-accent-fg hover:underline">Buyback</Link> page. Token-level buybacks run on the <Link href="/flywheel/" className="text-accent-fg hover:underline">Flywheel</Link>.</p>
          <p className="mt-3">Pair assets are valued at current prices, so totals move with ETH, stocks and memes.</p>
        </div>
      </section>
    </div>
  );
}
