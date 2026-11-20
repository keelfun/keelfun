"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PriceChart } from "@/components/PriceChart";
import { TokenAvatar } from "@/components/TokenAvatar";
import { FeesCard } from "@/components/FeesCard";
import { TradePanel } from "@/components/TradePanel";
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
  const links = [
    ["Website", ext(t.website)],
    ["X", ext(t.x)],
    ["Telegram", ext(t.telegram)],
    ["Discord", ext(t.discord)],
  ].filter(([, u]) => u) as [string, string][];
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <TokenAvatar src={t.image} symbol={t.symbol} size={56} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-xl font-semibold sm:text-2xl">{t.name}</h1>
          <span className="font-mono text-sm text-muted">${t.symbol}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
          <Copy value={t.address} />
          <span>
            by{" "}
            <Link href={`/portfolio/?w=${t.creator}`} className="font-mono hover:text-accent">
              {shortAddr(t.creator)}
            </Link>
          </span>
          <span>· {timeAgo(t.createdAt)} ago</span>
          {links.map(([l, u]) => (
            <a key={l} href={u} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-2 py-1 hover:text-fg">
              {l === "X" ? (
                <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-label="X">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              ) : (
                l
              )}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stats({ t, ethUsd }: { t: Token; ethUsd: number }) {
  const items: [string, string, string?][] = [
    ["Price", ethUsd > 0 ? `$${fmtPrice(t.priceUsd)}` : `${fmtPrice(t.priceEth)} ETH`],
    ["24h", fmtPct(t.change24h), t.change24h >= 0 ? "text-up" : "text-down"],
    ["FDV", fmtValue(t.fdvEth, ethUsd)],
    ["Liquidity", fmtValue(t.liquidityEth, ethUsd)],
    ["Vol 24h", fmtValue(t.volume24hEth, ethUsd)],
    ["Holders", String(t.holders)],
  ];
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {items.map(([k, v, c]) => (
        <div key={k} className="rounded-xl border border-line bg-panel px-3 py-2.5">
          <p className="text-[11px] text-dim">{k}</p>
          <p className={`truncate font-mono text-sm ${c ?? ""}`}>{v}</p>
        </div>
      ))}
    </div>
  );
}

const FEE_LABEL: Record<FeeEvent["kind"], [string, string]> = {
  buy_tax: ["Buy tax", "text-up"],
  sell_tax: ["Sell tax", "text-down"],
  claim: ["Creator claim", "text-accent"],
  holders: ["Holder dividends", "text-up"],
  burn: ["Buyback burn", "text-warn"],
};

function Activity({ t }: { t: Token; ethUsd: number }) {
  const [tab, setTab] = useState<"trades" | "holders" | "fees">("trades");
  const trades = useTrades(t.address);
  const holders = useHolders(t.address);
  const fees = useFees(tab === "fees" ? t.address : undefined);
  const pair = pairInfo(t.pair);
  const tx = (h: string, child: React.ReactNode) =>
    EXPLORER ? <a href={`${EXPLORER}/tx/${h}`} target="_blank" rel="noreferrer" className="hover:text-fg">{child}</a> : child;
  const th = "py-3 font-normal";
  const td = "py-3.5";
  const empty =
    (tab === "trades" ? trades.data?.trades.length : tab === "holders" ? holders.data?.holders.length : fees.data?.fees.length) === 0;
  return (
    <div>
      <div className="flex gap-6 border-b border-line">
        {([["trades", "Trades"], ["holders", `Holders${t.holders ? ` ${t.holders}` : ""}`], ["fees", "Fee activity"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 pb-3 text-base transition-colors ${tab === k ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="max-h-[520px] overflow-auto">
        {tab === "trades" && (
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-bg text-muted">
              <tr className="border-b border-line">
                <th className={`${th} text-left`}>Side</th>
                <th className={`${th} text-right`}>{t.symbol}</th>
                <th className={`${th} text-right`}>{pair.symbol}</th>
                <th className={`${th} hidden text-right sm:table-cell`}>Trader</th>
                <th className={`${th} text-right`}>When</th>
              </tr>
            </thead>
            <tbody>
              {trades.data?.trades.map((r) => (
                <tr key={r.id} className="border-b border-line/70">
                  <td className={`${td} ${r.isBuy ? "text-up" : "text-down"}`}>{r.isBuy ? "Buy" : "Sell"}</td>
                  <td className={`${td} text-right`}>{fmtCompact(r.tokens)}</td>
                  <td className={`${td} text-right`}>{fmtCompact(Number(r.pairAmount ?? r.eth))}</td>
                  <td className={`${td} hidden text-right sm:table-cell`}>
                    <Link href={`/portfolio/?w=${r.trader}`} className={`hover:text-accent ${r.trader === t.creator ? "text-warn" : "text-muted"}`}>
                      {r.trader === t.creator ? "dev" : shortAddr(r.trader)}
                    </Link>
                  </td>
                  <td className={`${td} text-right text-muted`}>{tx(r.tx, `${timeAgo(r.ts)} ago`)}</td>
                </tr>
              ))}
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
                    <Link href={`/portfolio/?w=${h.holder}`} className="hover:text-accent">{shortAddr(h.holder)}</Link>
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
  return (
    <div className="space-y-4 py-6">
      <Header t={t} />
      <Stats t={t} ethUsd={data.ethUsd} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <PriceChart token={t.address} ethUsd={data.ethUsd} />
          <div className="lg:hidden">
            <TradePanel token={t} />
          </div>
          {t.description && <p className="rounded-2xl border border-line bg-panel p-4 text-sm leading-relaxed text-muted">{t.description}</p>}
          <Activity t={t} ethUsd={data.ethUsd} />
        </div>
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="hidden lg:block">
            <TradePanel token={t} />
          </div>
          <FeesCard t={t} ethUsd={data.ethUsd} />
        </div>
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
