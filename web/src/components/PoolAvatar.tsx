"use client";
/* eslint-disable @next/next/no-img-element */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TokenAvatar } from "./TokenAvatar";

export type TokenMeta = { lp: string | null; image: string | null };

export const LAUNCHPADS: Record<string, { name: string; site: string }> = {
  keelfun: { name: "Keelfun", site: "keelfun.app" },
  clanker: { name: "Clanker", site: "clanker.world" },
  zora: { name: "Zora", site: "zora.co" },
  bankr: { name: "Bankr", site: "bankr.bot" },
  doppler: { name: "Doppler", site: "doppler.lol" },
  virtuals: { name: "Virtuals", site: "app.virtuals.io" },
  o1: { name: "o1", site: "o1.exchange" },
  mintclub: { name: "Mint Club", site: "mint.club" },
  baseline: { name: "Baseline", site: "baseline.markets" },
  flaunch: { name: "Flaunch", site: "flaunch.gg" },
};
const DEX_LP: Record<string, string> = {
  bankr: "bankr", "o1-launchpad": "o1", "virtuals-base": "virtuals", "virtuals-unicorn-base": "virtuals", "mint-club-base": "mintclub", "baseline-base": "baseline",
};
export const lpIcon = (id: string) => `https://www.google.com/s2/favicons?domain=${LAUNCHPADS[id]?.site ?? `${id}.com`}&sz=64`;

let queue: { a: string; res: (m: TokenMeta) => void }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
function flush() {
  timer = null;
  const q = queue;
  queue = [];
  for (let i = 0; i < q.length; i += 25) {
    const part = q.slice(i, i + 25);
    api<Record<string, TokenMeta>>(`/meta?a=${[...new Set(part.map((x) => x.a))].join(",")}`)
      .then((m) => part.forEach((x) => x.res(m[x.a] ?? { lp: null, image: null })))
      .catch(() => part.forEach((x) => x.res({ lp: null, image: null })));
  }
}
const loadMeta = (a: string) =>
  new Promise<TokenMeta>((res) => {
    queue.push({ a, res });
    timer ??= setTimeout(flush, 60);
  });

export function useTokenMeta(address: string) {
  const a = address.toLowerCase();
  return useQuery({ queryKey: ["tmeta", a], queryFn: () => loadMeta(a), staleTime: 3600_000, gcTime: 3600_000, retry: false }).data;
}

const O1_PREFIX = "0xb20000000000000000000";

export function launchpadOf(dex: string, m?: TokenMeta, address = "") {
  return m?.lp ?? DEX_LP[dex] ?? (address.toLowerCase().startsWith(O1_PREFIX) ? "o1" : null);
}

export function LaunchpadChip({ id }: { id: string }) {
  const lp = LAUNCHPADS[id];
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-panel-2/60 px-1.5 py-px text-[10px] text-muted" title={`Launched on ${lp?.name ?? id}`}>
      <img src={lpIcon(id)} alt="" className="h-3 w-3 rounded-full" />
      {lp?.name ?? id[0].toUpperCase() + id.slice(1)}
    </span>
  );
}

export function PoolAvatar({ token, dex, dexLabel, size }: { token: { address: string; symbol: string; image: string | null }; dex: string; dexLabel: string; size: number }) {
  const m = useTokenMeta(token.address);
  const lp = launchpadOf(dex, m, token.address);
  return (
    <div className="relative shrink-0">
      <TokenAvatar src={token.image ?? m?.image} symbol={token.symbol} size={size} />
      {lp ? (
        <img src={lpIcon(lp)} alt={LAUNCHPADS[lp]?.name ?? lp} title={`Launched on ${LAUNCHPADS[lp]?.name ?? lp}`} className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-bg ring-2 ring-bg" />
      ) : (
        <span className="absolute -bottom-1 -right-1 rounded bg-bg px-1 font-mono text-[9px] text-muted ring-1 ring-line">{dexLabel}</span>
      )}
    </div>
  );
}

export function useLaunchpad(address: string, dex: string) {
  return launchpadOf(dex, useTokenMeta(address), address);
}
