"use client";
import { Em, Faq, Num, PageHero } from "@/components/PageHero";
import { KeelCA } from "@/components/Official";
import { useStats } from "@/lib/api";
import { BRAND, FEE_TIERS } from "@/lib/config";
import { fmtEth, fmtValue } from "@/lib/format";

const SHARE = 70;
const eth = fmtEth;

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="border-t border-line pt-3">
      <p className="text-xs text-dim">{k}</p>
      <p className="mt-1 font-serif text-3xl sm:text-4xl">{v}</p>
      {sub && <p className="mt-1 text-xs text-dim">{sub}</p>}
    </div>
  );
}

export default function BuybackPage() {
  const { data: s } = useStats();
  const fees = s?.platformFeesEth ?? 0;
  const usd = s?.ethUsd ?? 0;
  const set = (fees * SHARE) / 100;
  return (
    <div>
      <PageHero
        title={<>The <Em>buyback</Em></>}
        sub={`${SHARE}% of every ${BRAND} platform fee goes to buying back and burning $KEEL. Here is where that money comes from, what it spent, what it burned and what is left.`}
      />
      <section className="rounded-2xl border border-line bg-panel p-5 sm:p-7">
        <p className="text-sm text-muted">Burned by buybacks</p>
        <p className="mt-1 font-serif text-6xl sm:text-7xl">0 <span className="text-3xl text-fg/60">KEEL</span></p>
        <p className="mt-2 max-w-xl text-sm text-muted">
          $KEEL is live on Base. The automatic buyback hasn&apos;t started yet; until it does, its share of every platform fee is set aside for it.
        </p>
        <KeelCA short className="mt-4" />
        <div className="mt-6 h-1.5 w-full rounded-full bg-line"><div className="h-full w-0 rounded-full bg-accent" /></div>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <Stat k="1 · Automatic buyback" v={eth(set)} sub={`${SHARE}% of platform fees, set aside so far`} />
          <Stat k="2 · Treasury" v={eth(fees - set)} sub={`${100 - SHARE}% of platform fees, for growth and operations`} />
        </div>
      </section>

      <div className="mt-14 space-y-14">
        <Num n={1}>
          <p className="text-xs text-dim">Platform fees · runs by itself</p>
          <h2 className="mt-1 font-serif text-4xl">The automatic buyback</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            {SHARE}% of every platform fee buys $KEEL in its own Uniswap v4 pool and burns it, around the clock, in small buys under a daily cap so it never moves the price all at once.
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-warn/30 bg-warn/10 px-3 py-1 text-xs text-warn">
            <span className="h-1.5 w-1.5 rounded-full bg-warn" /> Not running yet · $KEEL is live, buyback starts soon
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Stat k="Platform fees earned" v={eth(fees)} sub={fmtValue(fees, usd)} />
            <Stat k="Set aside for it" v={eth(set)} sub={fmtValue(set, usd)} />
            <Stat k="Spent" v={eth(0)} sub="0 buys" />
            <Stat k="Burned" v="0 KEEL" sub="0% of supply" />
          </div>
        </Num>

        <Num n={2}>
          <p className="text-xs text-dim">Where the money comes from</p>
          <h2 className="mt-1 font-serif text-4xl">The platform fee</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Every trade in a {BRAND} token pays the fee its creator picked. A fixed slice of it is {BRAND}&apos;s platform fee; the rest goes to the creator, the holders or a split.
          </p>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-left text-xs text-dim">
                <tr><th className="py-2 font-normal">Token fee</th><th className="font-normal">Platform fee</th><th className="font-normal">To the buyback</th><th className="font-normal">To the creator&apos;s route</th></tr>
              </thead>
              <tbody className="divide-y divide-line border-t border-line">
                {FEE_TIERS.map((t) => (
                  <tr key={t.bps}>
                    <td className="py-2.5">{t.bps / 100}%</td>
                    <td>{t.platformBps / 100}%</td>
                    <td>{((t.platformBps * SHARE) / 10_000).toFixed(3)}%</td>
                    <td>{(t.bps - t.platformBps) / 100}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Num>
      </div>

      <section className="mt-16 grid gap-8 lg:grid-cols-[1fr_2fr]">
        <h2 className="font-serif text-4xl">The details</h2>
        <Faq
          items={[
            ["Where do these numbers come from?", `They're read from the chain by ${BRAND}'s indexer: every platform fee is an onchain transfer in the trade that paid it, and anyone can recompute them.`],
            ["When does the buyback start?", "$KEEL is live, and the buyback switches on soon. Everything set aside before then is spent by the buyback in its first weeks, under the same daily cap."],
            ["Is every bought token burned?", "Yes. Each buy sends its $KEEL to the dead address in the same transaction, so it's out of supply for good."],
            ["Why a daily cap?", "So the buyback is steady pressure, not a single spike anyone could trade against."],
          ]}
        />
      </section>
    </div>
  );
}
