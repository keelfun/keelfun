"use client";
import Link from "next/link";
import { useBlockNumber, useGasPrice } from "wagmi";
import { usePrefs } from "./QuickBuy";
import { useStats } from "@/lib/api";
import { chain, SOCIALS } from "@/lib/config";

export function StatusBar() {
  const { data } = useStats();
  const block = useBlockNumber({ chainId: chain.id, watch: true });
  const gas = useGasPrice({ chainId: chain.id, query: { refetchInterval: 8000 } });
  const { prefs, preset } = usePrefs();
  const synced = data ? data.head - data.cursor < 50 : false;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 hidden h-8 items-center gap-4 border-t border-line bg-bg/95 px-4 font-mono text-[11px] text-muted backdrop-blur lg:flex">
      <span className="flex items-center gap-1.5"><span className="text-up">⚡</span>P{prefs.active + 1} {preset.amount} ETH · {preset.slippage}%</span>
      <span className="ml-auto">ETH <span className="text-fg">${data?.ethUsd ? data.ethUsd.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "…"}</span></span>
      <span>Block <span className="text-fg">#{block.data?.toLocaleString() ?? "…"}</span></span>
      <span>Gas <span className="text-fg">{gas.data ? (Number(gas.data) / 1e9).toFixed(4) : "…"}</span> gwei</span>
      <span className={`flex items-center gap-1.5 ${synced ? "text-up" : "text-warn"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${synced ? "animate-pulse bg-up" : "bg-warn"}`} />
        {synced ? "live" : "syncing"}
      </span>
      <Link href="/docs/" className="hover:text-fg">Docs</Link>
      {SOCIALS.x && <a href={SOCIALS.x} target="_blank" rel="noreferrer" className="hover:text-fg" aria-label="X">𝕏</a>}
    </div>
  );
}
