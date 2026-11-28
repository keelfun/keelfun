"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchPoolsByToken, type BasePool } from "@/lib/basePools";
import type { Net } from "@/lib/net";

export const OFFICIAL = new Set(
  (process.env.NEXT_PUBLIC_OFFICIAL_TOKENS || "0x2a2791927af5877723be6026e6fb0966d3df0147").toLowerCase().split(",").map((s) => s.trim()),
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
