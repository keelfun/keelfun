import Link from "next/link";
import type { Token } from "@/lib/api";
import { fmtCompact, fmtPct, fmtValue, shortAddr, timeAgo } from "@/lib/format";
import { TokenAvatar } from "./TokenAvatar";

export function TokenCard({ t, ethUsd }: { t: Token; ethUsd: number }) {
  const up = t.change24h >= 0;
  return (
    <Link
      href={`/token/?a=${t.address}`}
      className="group flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-accent/40 hover:bg-panel-2"
    >
      <div className="flex items-start gap-3">
        <TokenAvatar src={t.image} symbol={t.symbol} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{t.name}</p>
            <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent">{t.buyBps / 100}/{t.sellBps / 100}%</span>
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
          <p>{fmtValue(t.fdvEth, ethUsd)}</p>
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
