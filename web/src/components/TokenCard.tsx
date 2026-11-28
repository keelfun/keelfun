"use client";
import Link from "next/link";
import type { Token } from "@/lib/api";
import { fmtCompact, fmtPct, fmtValue, shortAddr, timeAgo } from "@/lib/format";
import { pairInfo } from "@/lib/config";
import { TokenAvatar } from "./TokenAvatar";
import { OfficialBadge } from "./Official";

export function TokenCard({ t, ethUsd, i = 0 }: { t: Token; ethUsd: number; i?: number }) {
  const up = t.change24h >= 0;
  const pair = pairInfo(t.pair);
  const fdv = fmtValue(t.fdvEth, ethUsd);
  return (
    <Link
      href={`/token/?a=${t.address}`}
      style={{ animationDelay: `${Math.min(i, 12) * 50}ms` }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
      }}
      className="card-glow anim-rise group flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4 transition-[transform,border-color,background-color] duration-300 hover:-translate-y-1 hover:border-accent/40 hover:bg-panel-2"
    >
      {pair?.logo && (
        <span aria-hidden className="pointer-events-none absolute -bottom-8 -right-8 flex h-32 w-32 items-center justify-center rounded-full border border-line/80 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6">
          <img src={pair.logo} alt="" className="h-20 w-20 rounded-full object-cover opacity-25 transition-opacity group-hover:opacity-40" />
        </span>
      )}
      <div className="flex items-start gap-3">
        <TokenAvatar src={t.image} symbol={t.symbol} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{t.name}</p>
            <OfficialBadge address={t.address} />
            <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent-fg">{t.buyBps / 100}/{t.sellBps / 100}%</span>
          </div>
          <p className="font-mono text-xs text-muted">
            ${t.symbol} · {shortAddr(t.creator)} · {timeAgo(t.createdAt)}
          </p>
        </div>
        <span className={`font-mono text-xs ${up ? "text-up" : "text-down"}`}>{fmtPct(t.change24h)}</span>
      </div>
      {t.description && <p className="line-clamp-2 text-xs leading-relaxed text-muted">{t.description}</p>}
      <div className="grid grid-cols-3 gap-2 font-mono text-xs">
        <div>
          <p className="text-dim">FDV</p>
          <p key={fdv} className="anim-flash">{fdv}</p>
        </div>
        <div>
          <p className="text-dim">Vol 24h</p>
          <p>{fmtValue(t.volume24hEth, ethUsd)}</p>
        </div>
        <div>
          <p className="text-dim">Holders</p>
          <p>{t.holders}</p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap gap-1.5 font-mono text-[10px] text-dim">
        <span className="rounded-md border border-line px-1.5 py-0.5">{fmtCompact(t.supply)} supply</span>
        <span className="rounded-md border border-line px-1.5 py-0.5">{t.pairSymbol ?? "ETH"} pair</span>
        <span className="rounded-md border border-line px-1.5 py-0.5">
          {[t.creatorBps && "creator", t.holdersBps && "holders", t.burnBps && "burn"].filter(Boolean).join(" · ") || "fees → creator"}
        </span>
        {t.antiSnipe && <span className="rounded-md border border-line px-1.5 py-0.5">anti-snipe</span>}
      </div>
    </Link>
  );
}
