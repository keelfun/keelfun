"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useVault } from "@/lib/vault";
import { useBlockNumber, useGasPrice } from "wagmi";
import { usePrefs } from "./QuickBuy";
import { useStats } from "@/lib/api";
import { chain, SOCIALS } from "@/lib/config";
import { useIsTerminal } from "./Header";
import { WalletChip } from "./TerminalChrome";

export function StatusBar() {
  const { data } = useStats();
  const block = useBlockNumber({ chainId: chain.id, watch: true });
  const gas = useGasPrice({ chainId: chain.id, query: { refetchInterval: 8000 } });
  const { prefs, preset } = usePrefs();
  const v = useVault();
  const path = usePathname();
  const term = useIsTerminal();
  const pulse = path.startsWith("/terminal") || (term && path.startsWith("/pulse"));
  const tab = (href: string, label: string, on: boolean, icon: React.ReactNode) => (
    <Link href={href} className={`flex items-center gap-1.5 hover:text-fg ${on ? "text-fg" : ""}`}>{icon}{label}</Link>
  );
  const synced = data ? data.head - data.cursor < 50 : false;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 hidden h-8 items-center gap-4 border-t border-line bg-bg/95 px-4 font-mono text-[11px] text-muted backdrop-blur lg:flex">
      {term ? (
        <>
          <WalletChip compact />
          <span className="h-3 w-px bg-line" />
          {pulse ? (
            <button onClick={() => dispatchEvent(new Event("keel-tracker"))} className="flex items-center gap-1.5 hover:text-fg" title="Show / hide wallet tracker">
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /></svg>
              Tracker
            </button>
          ) : (
            tab("/tracker/", "Tracker", path.startsWith("/tracker"), <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /></svg>)
          )}
          {tab("/pulse/", "Pulse", pulse, <span className="h-1.5 w-1.5 rounded-full bg-up" />)}
          {tab("/portfolio/", "PnL", path.startsWith("/portfolio"), <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 17l6-6 4 4 8-8" /></svg>)}
          <span className="h-3 w-px bg-line" />
          <span className="flex items-center gap-1.5"><span className="text-up">⚡</span>P{prefs.active + 1} {preset.amount} ETH</span>
        </>
      ) : (
        <>
          <span className="flex items-center gap-1.5"><span className="text-up">⚡</span>P{prefs.active + 1} {preset.amount} ETH · {preset.slippage}%</span>
      <Link href="/wallets/" className={`flex items-center gap-1.5 hover:text-fg ${v.data ? "text-up" : ""}`} title="Trading wallet vault">
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="10" rx="2" /><path d={v.data ? "M8 11V7a4 4 0 0 1 7.5-2" : "M8 11V7a4 4 0 0 1 8 0v4"} /></svg>
        {!v.exists ? "No vault" : v.data ? `Vault · ${v.data.wallets.length} wallet${v.data.wallets.length === 1 ? "" : "s"}` : "Vault locked"}
      </Link>
        </>
      )}
      <button onClick={() => dispatchEvent(new Event("keel-search"))} className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-panel px-3 py-0.5 hover:border-accent hover:text-fg">
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        Search tokens, pairs, wallets
        <kbd className="rounded border border-line px-1 text-[10px]">Ctrl K</kbd>
      </button>
      <span className="ml-auto">ETH <span className="text-fg">${data?.ethUsd ? data.ethUsd.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "…"}</span></span>
      <span>Block <span className="text-fg">#{block.data?.toLocaleString() ?? "…"}</span></span>
      <span>Gas <span className="text-fg">{gas.data ? (Number(gas.data) / 1e9).toFixed(4) : "…"}</span> gwei</span>
      <span className={`flex items-center gap-1.5 ${synced ? "text-up" : "text-warn"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${synced ? "animate-pulse bg-up" : "bg-warn"}`} />
        {term ? (synced ? "Connection is stable" : "Syncing…") : synced ? "live" : "syncing"}
      </span>
      <Link href={term ? "https://keelfun.app/docs/" : "/docs/"} className="hover:text-fg">Docs</Link>
      {SOCIALS.x && <a href={SOCIALS.x} target="_blank" rel="noreferrer" className="hover:text-fg" aria-label="X">𝕏</a>}
    </div>
  );
}
