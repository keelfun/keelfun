"use client";
import Link from "next/link";
import type { Token } from "@/lib/api";
import { pairInfo } from "@/lib/config";
import { fmtPct, fmtValue } from "@/lib/format";
import { TokenAvatar } from "./TokenAvatar";

const LINE = "M0 250 C 90 250, 150 215, 230 205 S 360 150, 430 160 S 540 235, 620 185 S 760 70, 840 75 S 900 60, 960 40";

export function HeroChart({ featured, ethUsd }: { featured?: Token; ethUsd: number }) {
  const pair = featured ? pairInfo(featured.pair) : undefined;
  return (
    <div aria-hidden={!featured} className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] opacity-50 sm:h-[70%] sm:opacity-100">
      <svg viewBox="0 0 960 300" preserveAspectRatio="none" className="anim-chart-draw absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="hc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--color-accent)" }} stopOpacity="0.28" />
            <stop offset="100%" style={{ stopColor: "var(--color-accent)" }} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hc-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="35%" stopColor="white" stopOpacity="1" />
          </linearGradient>
          <mask id="hc-mask">
            <rect width="960" height="300" fill="url(#hc-fade)" />
          </mask>
        </defs>
        <g mask="url(#hc-mask)">
          <path d={`${LINE} L960 300 L0 300 Z`} fill="url(#hc-fill)" />
          <path d={LINE} fill="none" style={{ stroke: "var(--color-accent-soft)" }} strokeOpacity="0.85" strokeWidth="2.5" vectorEffect="non-scaling-stroke" className="anim-chart-line" />
        </g>
      </svg>
      <span className="absolute right-[12.5%] top-[25%] block h-3 w-3">
        <span className="anim-ping absolute inset-0 rounded-full bg-up" />
        <span className="absolute inset-0 rounded-full border-2 border-bg bg-up" />
      </span>
      {featured && (
        <Link
          href={`/token/?a=${featured.address}`}
          className="anim-float pointer-events-auto absolute right-6 top-[16%] hidden w-72 rounded-2xl border border-line-2 bg-panel/85 p-4 shadow-2xl backdrop-blur-md transition-colors hover:border-accent/50 lg:block xl:right-[8%]"
        >
          <div className="flex items-center gap-3">
            <TokenAvatar src={featured.image} symbol={featured.symbol} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">${featured.symbol}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                Paired with
                {pair?.logo && <img src={pair.logo} alt="" className="h-3.5 w-3.5 rounded-full" />}
                <span className="text-fg">{featured.pairSymbol ?? "ETH"}</span>
              </p>
            </div>
            <span className="text-muted">→</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-xl font-semibold">
              {fmtValue(featured.fdvEth, ethUsd)} <span className="text-xs font-normal text-muted">market cap</span>
            </p>
            <span className={`font-mono text-xs ${featured.change24h >= 0 ? "text-up" : "text-down"}`}>{fmtPct(featured.change24h)}</span>
          </div>
        </Link>
      )}
    </div>
  );
}
