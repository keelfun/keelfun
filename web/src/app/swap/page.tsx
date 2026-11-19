"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { isAddress } from "viem";
import { Em, PageHero } from "@/components/PageHero";
import { AnySwap } from "@/components/AnySwap";
import { TokenAvatar } from "@/components/TokenAvatar";
import { TradePanel } from "@/components/TradePanel";
import { useToken, useTokens } from "@/lib/api";
import { BRAND, chain, DEPLOYED } from "@/lib/config";
import { fmtValue, shortAddr } from "@/lib/format";

function SwapView() {
  const router = useRouter();
  const params = useSearchParams();
  const addr = params.get("a")?.toLowerCase();
  const [paste, setPaste] = useState("");
  const { data: one, error } = useToken(addr);
  const { data: list } = useTokens("trending");
  const tokens = list?.tokens ?? [];
  const usd = list?.ethUsd ?? one?.ethUsd ?? 0;
  const pick = (a: string) => router.replace(`/swap/?a=${a.toLowerCase()}`, { scroll: false });
  const t = one?.token;

  return (
    <div>
      <PageHero
        title={<Em>Swap</Em>}
        sub={`Swap any token on ${chain.name} at the best route, or trade ${BRAND} tokens straight against their Uniswap v4 pools.`}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-panel p-4">
            <p className="text-xs text-dim">Open a {BRAND} token pool: paste its contract address</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (isAddress(paste.trim())) pick(paste.trim());
              }}
              className="mt-2 flex gap-2"
            >
              <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="0x…" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg/60 px-3 font-mono text-sm outline-none placeholder:text-dim focus:border-accent/50" />
              <button disabled={!isAddress(paste.trim())} className="h-10 rounded-lg bg-fg px-4 text-sm font-medium text-bg disabled:opacity-40">Open</button>
            </form>
            {addr && error && <p className="mt-2 text-xs text-down">That isn&apos;t a {BRAND} token.</p>}
          </div>
          {addr && one?.token ? (
            <>
              <Link href="/swap/" className="inline-block text-sm text-accent hover:underline">← Swap any token</Link>
              <TradePanel token={one.token} />
            </>
          ) : (
            <AnySwap />
          )}
        </div>
        <div className="space-y-4">
          {t && (
            <div className="rounded-2xl border border-line bg-panel p-4">
              <p className="text-xs text-dim">About {t.symbol}</p>
              <div className="mt-3 flex items-center gap-3">
                <TokenAvatar src={t.image} symbol={t.symbol} size={40} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="font-mono text-xs text-dim">{shortAddr(t.address)}</p>
                </div>
              </div>
              {t.description && <p className="mt-3 line-clamp-3 text-sm text-muted">{t.description}</p>}
              <Link href={`/token/?a=${t.address}`} className="mt-3 inline-block text-sm text-accent hover:underline">Chart, holders and trades →</Link>
            </div>
          )}
          <div className="rounded-2xl border border-line bg-panel p-4">
            <p className="text-xs text-dim">Trending on {BRAND}</p>
            <div className="mt-2 divide-y divide-line">
              {tokens.slice(0, 6).map((x) => (
                <button key={x.address} onClick={() => pick(x.address)} className="flex w-full items-center gap-3 py-2.5 text-left hover:opacity-80">
                  <TokenAvatar src={x.image} symbol={x.symbol} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{x.symbol}</p>
                    <p className="font-mono text-[11px] text-dim">{shortAddr(x.address)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">{fmtValue(x.fdvEth, usd)}</p>
                    <p className="text-[11px] text-dim">FDV</p>
                  </div>
                </button>
              ))}
              {tokens.length === 0 && <p className="py-4 text-sm text-muted">Nothing trending yet.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SwapPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Loading…</p>}>
      <SwapView />
    </Suspense>
  );
}
