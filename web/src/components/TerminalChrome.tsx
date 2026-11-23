"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { TokenAvatar } from "./TokenAvatar";
import { fetchBasePools, fetchPoolsByToken } from "@/lib/basePools";
import { chain } from "@/lib/config";
import { fmtPct, fmtUsd } from "@/lib/format";
import { useSet } from "@/lib/sets";
import { useVault } from "@/lib/vault";

const MULTICALL = "0xcA11bde05977b3631167028862bE2a173976CA11";
const ethBalAbi = [{ type: "function", name: "getEthBalance", stateMutability: "view", inputs: [{ name: "addr", type: "address" }], outputs: [{ name: "balance", type: "uint256" }] }] as const;

export function useVaultBalance() {
  const v = useVault();
  const ws = v.data?.wallets ?? [];
  const r = useReadContracts({
    contracts: ws.map((w) => ({ address: MULTICALL, abi: ethBalAbi, functionName: "getEthBalance", args: [w.address], chainId: chain.id }) as const),
    query: { enabled: ws.length > 0, refetchInterval: 15000 },
  });
  const total = (r.data ?? []).reduce((s, x) => s + (x.status === "success" ? Number(x.result) / 1e18 : 0), 0);
  return { v, n: ws.length, total };
}

const WalletIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M16 15h2" /></svg>
);

export function WalletChip({ compact = false }: { compact?: boolean }) {
  const { v, n, total } = useVaultBalance();
  const label = !v.exists ? "Set up wallets" : v.data ? null : "Unlock vault";
  if (compact)
    return (
      <Link href="/wallets/" title="Trading wallets" className={`flex items-center gap-1.5 hover:text-fg ${v.data ? "text-fg" : ""}`}>
        <WalletIcon className="h-3 w-3" />
        {label ?? <>{n} <span className="text-muted">· Ξ {total.toFixed(4)}</span></>}
      </Link>
    );
  return (
    <Link href="/wallets/" title="Trading wallets" className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium ${v.data ? "border border-line text-fg hover:bg-panel-2" : "bg-fg text-bg hover:opacity-90"}`}>
      <WalletIcon />
      {label ? <span className="hidden sm:inline">{label}</span> : <>
        <span className="font-mono">{n}</span>
        <span className="hidden h-4 w-px bg-line sm:block" />
        <span className="hidden font-mono text-muted sm:inline">Ξ {total.toFixed(4)}</span>
      </>}
    </Link>
  );
}

export function TickerStrip() {
  const watch = useSet("keel-watch");
  const { data } = useQuery({
    queryKey: ["ticker-strip", watch.join()],
    queryFn: () => (watch.length ? fetchPoolsByToken(watch) : fetchBasePools("trending")),
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const items = (data ?? []).slice(0, 24);
  return (
    <div className="no-scrollbar flex h-8 items-center gap-5 overflow-x-auto border-t border-line px-4 text-xs">
      <span className={`flex shrink-0 items-center gap-1.5 ${watch.length ? "text-warn" : "text-dim"}`} title={watch.length ? "Your watchlist" : "Star tokens in Pulse to build your watchlist"}>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={watch.length ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></svg>
        <span className="text-dim">{watch.length ? "Watchlist" : "Trending"}</span>
      </span>
      {items.map((p) => (
        <Link key={p.pool} href={`/pair/?p=${p.pool}`} className="flex shrink-0 items-center gap-1.5 text-muted hover:text-fg">
          <TokenAvatar src={p.token.image} symbol={p.token.symbol} size={16} />
          <span className="font-medium text-fg">{p.token.symbol}</span>
          <span className="font-mono">{fmtUsd(p.mcUsd)}</span>
          <span className={`font-mono ${p.chg24 >= 0 ? "text-up" : "text-down"}`}>{fmtPct(p.chg24 / 100)}</span>
        </Link>
      ))}
    </div>
  );
}
