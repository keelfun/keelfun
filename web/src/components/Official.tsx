"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchPoolsByToken, type BasePool } from "@/lib/basePools";
import type { Net } from "@/lib/net";
import { useState } from "react";

export const KEEL_CA = "0x2a2791927af5877723be6026e6fb0966d3df0147";

export const OFFICIAL = new Set(
  (process.env.NEXT_PUBLIC_OFFICIAL_TOKENS || KEEL_CA).toLowerCase().split(",").map((s) => s.trim()),
);
export const isOfficial = (a?: string | null) => !!a && OFFICIAL.has(a.toLowerCase());

export function OfficialBadge({ address, label = false, size = 14 }: { address?: string | null; label?: boolean; size?: number }) {
  if (!isOfficial(address)) return null;
  const icon = (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size }} className="shrink-0" aria-hidden>
      <path fill="#0000FF" d="M12 1.5l2.6 1.9 3.2-.1 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.1z" />
      <path d="m7.8 12.2 2.8 2.8 5.6-5.8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (!label) return <span title="Official Keelfun token" className="inline-flex shrink-0 align-[-2px]">{icon}</span>;
  return (
    <span title="Official Keelfun token" className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#0000FF]/60 bg-[#0000FF]/15 py-0.5 pl-0.5 pr-2 text-[11px] font-semibold text-accent-fg">
      {icon}Official
    </span>
  );
}

export function pinOfficial<T>(list: T[] | undefined, addr: (x: T) => string): T[] | undefined {
  if (!list) return list;
  return [...list.filter((x) => isOfficial(addr(x))), ...list.filter((x) => !isOfficial(addr(x)))];
}

export function useOfficialPools(net: Net, on = true) {
  return useQuery({
    queryKey: ["official-pools", net],
    queryFn: () => fetchPoolsByToken([...OFFICIAL], net),
    enabled: on && net === "base" && OFFICIAL.size > 0,
    staleTime: 30000,
    refetchInterval: 60000,
  }).data;
}

export function withPinned(list: BasePool[] | undefined, pinned: BasePool[] | undefined) {
  if (!list || !pinned?.length) return pinOfficial(list, (p) => p.token.address);
  const keys = new Set(pinned.map((p) => p.token.address.toLowerCase()));
  return [...pinned, ...list.filter((p) => !keys.has(p.token.address.toLowerCase()))];
}

export function KeelCA({ className = "", short = false }: { className?: string; short?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(KEEL_CA).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    });
  };
  return (
    <div className={`inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-bg/60 py-1 pl-1 pr-1 text-xs backdrop-blur ${className}`}>
      <a href={`/token/?a=${KEEL_CA}`} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#0000FF] px-2 py-0.5 font-semibold text-white">
        $KEEL
      </a>
      <span className="shrink-0 text-dim">CA</span>
      <button onClick={copy} title="Copy contract address" className="min-w-0 shrink truncate font-mono text-fg/90 hover:text-fg">
        {short ? `${KEEL_CA.slice(0, 6)}…${KEEL_CA.slice(-4)}` : KEEL_CA}
      </button>
      <button onClick={copy} className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted hover:text-fg">
        {done ? "Copied" : "Copy"}
      </button>
      <a href={`https://basescan.org/token/${KEEL_CA}`} target="_blank" rel="noreferrer" className="shrink-0 pr-1.5 text-[11px] text-accent-fg hover:underline">
        <span className="hidden sm:inline">Basescan </span>↗
      </a>
    </div>
  );
}
