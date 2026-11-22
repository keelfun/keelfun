"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { formatUnits, isAddress } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { Em, PageHero } from "@/components/PageHero";
import { TokenAvatar } from "@/components/TokenAvatar";
import { useClaim } from "@/components/FeesCard";
import { launchHookAbi, launchTokenAbi } from "@/lib/abis";
import { api, usePortfolio, type Portfolio, type Token } from "@/lib/api";
import { useVault } from "@/lib/vault";
import { ADDR, EXPLORER, chain, pairInfo } from "@/lib/config";
import { fmtCompact, fmtUsd, shortAddr, timeAgo } from "@/lib/format";

const th = "pb-3 text-left text-xs font-normal text-dim";
const amt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: v >= 1 ? 4 : 6 });
const usdOf = (t: Token, raw: bigint, ethUsd: number) => Number(formatUnits(raw, t.pairDecimals)) * t.pairEth * ethUsd;

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="border-t border-line pt-5">
      <p className="text-xs text-dim">{label}</p>
      <p className="mt-4 font-mono text-2xl text-fg sm:text-3xl">{value}</p>
      <p className="mt-4 text-xs text-dim">{sub}</p>
    </div>
  );
}

function Skeleton({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="border-t border-line/60">
          <td className="py-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-panel-2" />
              <div className="space-y-2">
                <div className="h-2.5 w-28 rounded bg-panel-2" />
                <div className="h-2 w-16 rounded bg-panel-2/70" />
              </div>
            </div>
          </td>
          {Array.from({ length: cols - 1 }, (_, j) => (
            <td key={j} className="py-4">
              <div className="ml-auto h-2.5 w-14 rounded bg-panel-2" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-bg/40 via-bg/80 to-bg/40 text-center text-sm">{children}</div>;
}

function TokenCell({ t, sub }: { t: { address: string; image: string | null; symbol: string; name: string }; sub?: React.ReactNode }) {
  return (
    <Link href={`/token/?a=${t.address}`} className="flex min-w-0 items-center gap-3 hover:text-accent">
      <TokenAvatar src={t.image} symbol={t.symbol} size={36} />
      <div className="min-w-0">
        <p className="truncate text-sm">{t.name}</p>
        <p className="truncate font-mono text-xs text-dim">{sub ?? `$${t.symbol}`}</p>
      </div>
    </Link>
  );
}

function ClaimBtn({ t, kind, disabled, onDone }: { t: Token; kind: "route" | "holder"; disabled: boolean; onDone: () => unknown }) {
  const { busy, err, run } = useClaim(t, onDone);
  return (
    <span className="inline-flex flex-col items-end">
      <button onClick={() => run(kind)} disabled={!!busy || disabled} className="h-7 rounded-md bg-accent px-3 text-xs font-semibold text-accent-ink disabled:opacity-30">
        {busy ? "…" : "Claim"}
      </button>
      {err && <span className="mt-1 max-w-40 truncate text-[11px] text-down">{err}</span>}
    </span>
  );
}

function useEarnings(data: Portfolio | undefined, wallet?: `0x${string}`) {
  const held = (data?.holdings ?? []).map((h) => h.token).filter((t) => t.holdersBps > 0);
  const created = data?.created ?? [];
  const q = useReadContracts({
    contracts: [
      ...held.map((t) => ({ address: t.address, abi: launchTokenAbi, functionName: "claimable", args: [wallet!], chainId: chain.id }) as const),
      ...created.map((t) => ({ address: ADDR.hook, abi: launchHookAbi, functionName: "accrued", args: [t.address, wallet!], chainId: chain.id }) as const),
    ],
    query: { enabled: !!wallet && held.length + created.length > 0, refetchInterval: 10000 },
  });
  const val = (i: number) => (q.data?.[i]?.result as bigint | undefined) ?? 0n;
  const holder = new Map(held.map((t, i) => [t.address.toLowerCase(), val(i)]));
  const route = new Map(created.map((t, i) => [t.address.toLowerCase(), val(held.length + i)]));
  return { holder, route, loaded: !!q.data || held.length + created.length === 0, refetch: q.refetch };
}

const WATCH_KEY = "keel-watch-addrs";

function merge(list: Portfolio[]): Portfolio | undefined {
  if (!list.length) return undefined;
  const h = new Map<string, Portfolio["holdings"][number]>();
  for (const p of list)
    for (const x of p.holdings) {
      const k = x.token.address.toLowerCase();
      const c = h.get(k);
      h.set(k, c ? { ...c, amount: c.amount + x.amount, valueEth: c.valueEth + x.valueEth, valueUsd: c.valueUsd + x.valueUsd } : x);
    }
  return {
    holdings: [...h.values()].sort((a, b) => b.valueEth - a.valueEth),
    created: list.flatMap((p) => p.created),
    trades: list.flatMap((p) => p.trades).sort((a, b) => b.ts - a.ts),
    ethUsd: list[0].ethUsd,
  };
}

function WalletBar({ current }: { current: string }) {
  const router = useRouter();
  const { address } = useAccount();
  const v = useVault();
  const [watch, setWatch] = useState<string[]>([]);
  const [input, setInput] = useState("");
  useEffect(() => {
    try {
      setWatch(JSON.parse(localStorage.getItem(WATCH_KEY) || "[]"));
    } catch {}
  }, []);
  const save = (n: string[]) => (setWatch(n), localStorage.setItem(WATCH_KEY, JSON.stringify(n)));
  const go = (w: string) => router.push(w ? `/portfolio/?w=${w}` : "/portfolio/");
  const add = () => {
    const a = input.trim().toLowerCase();
    if (!isAddress(a)) return;
    if (!watch.includes(a)) save([...watch, a]);
    setInput("");
    go(a);
  };
  const chip = (on: boolean) =>
    `flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs ${on ? "border-accent text-accent" : "border-line text-muted hover:text-fg"}`;
  const vw = v.data?.wallets ?? [];
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      {address && <button onClick={() => go("")} className={chip(current === "" || current === address.toLowerCase())}>Connected</button>}
      {vw.length > 0 && (
        <button onClick={() => go("vault")} className={chip(current === "vault")}>All trading wallets ({vw.length})</button>
      )}
      {vw.map((w) => (
        <button key={w.address} onClick={() => go(w.address.toLowerCase())} className={chip(current === w.address.toLowerCase())}>
          {w.name}
        </button>
      ))}
      {v.exists && !v.data && <Link href="/wallets/" className={chip(false)}>Unlock vault for trading wallets</Link>}
      {watch.map((w) => (
        <span key={w} className={chip(current === w)}>
          <button onClick={() => go(w)} className="font-mono">{shortAddr(w)}</button>
          <button onClick={() => (save(watch.filter((x) => x !== w)), current === w && go(""))} className="text-dim hover:text-down" aria-label="Remove">×</button>
        </span>
      ))}
      <form onSubmit={(e) => (e.preventDefault(), add())} className="flex h-8 items-center rounded-lg border border-line bg-bg/60 pl-2.5">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Watch any address 0x…" className="w-52 sm:w-72 bg-transparent font-mono text-xs outline-none placeholder:text-dim" />
        <button disabled={!isAddress(input.trim())} className="px-2.5 text-xs text-accent disabled:text-dim">+ Watch</button>
      </form>
    </div>
  );
}

function PortfolioView() {
  const params = useSearchParams();
  const { address } = useAccount();
  const viewing = params.get("w");
  const v = useVault();
  const agg = viewing === "vault";
  const vaultAddrs = agg ? (v.data?.wallets ?? []).map((w) => w.address.toLowerCase()) : [];
  const wallet = (agg ? undefined : viewing && isAddress(viewing) ? viewing : address) as `0x${string}` | undefined;
  const own = !!address && wallet?.toLowerCase() === address.toLowerCase();
  const one = usePortfolio(wallet);
  const many = useQueries({
    queries: vaultAddrs.map((a) => ({ queryKey: ["portfolio", a], queryFn: () => api<Portfolio>(`/portfolio/${a}`), refetchInterval: 15000 })),
  });
  const manyData = many.every((q) => q.data) ? merge(many.map((q) => q.data!)) : undefined;
  const data = agg ? manyData : one.data;
  const isLoading = agg ? many.some((q) => q.isLoading) : one.isLoading;
  const e = useEarnings(data, wallet);
  const ethUsd = data?.ethUsd ?? 0;
  const ready = (!!wallet || agg) && !!data;

  const holdUsd = data?.holdings.reduce((a, h) => a + h.valueEth * ethUsd, 0) ?? 0;
  const earnedUsd = data?.holdings.reduce((a, h) => a + usdOf(h.token, e.holder.get(h.token.address.toLowerCase()) ?? 0n, ethUsd), 0) ?? 0;
  const feesUsd = data?.created.reduce((a, t) => a + usdOf(t, e.route.get(t.address.toLowerCase()) ?? 0n, ethUsd), 0) ?? 0;
  const dash = <span className="text-dim">—</span>;

  return (
    <>
      <PageHero
        title={<>{agg ? "Trading wallets" : own || !wallet ? "Your" : shortAddr(wallet)} <Em>portfolio</Em></>}
        sub="What you hold and what it has paid you, the tokens you launched and the fees they pay you."
      >
        <WalletBar current={agg ? "vault" : (viewing ?? "").toLowerCase()} />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          {agg ? <p className="text-xs text-dim">{vaultAddrs.length} trading wallets combined</p> : wallet ? <p className="font-mono text-xs text-dim">{shortAddr(wallet)}</p> : <span />}
          <Link href="/launch/" className="rounded-lg border border-line bg-bg/60 px-4 py-2 text-sm hover:border-accent">
            Launch a token
          </Link>
        </div>
      </PageHero>

      <div className="space-y-16 pb-16">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          <Stat label="Holdings" value={ready ? fmtUsd(holdUsd) : dash} sub="the tokens you hold" />
          <Stat label="Earned from holding" value={ready && e.loaded ? fmtUsd(earnedUsd) : dash} sub="paid to you and still to come" />
          <Stat label="Creator fees to claim" value={ready && e.loaded ? fmtUsd(feesUsd) : dash} sub="from tokens that pay you" />
          <Stat label="Launched" value={ready ? data.created.length : dash} sub="the tokens you created" />
        </div>

        <section>
          <h2 className="mb-6 font-serif text-4xl">Holdings</h2>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr>
                  <th className={th}>Token</th>
                  <th className={`${th} !text-right`}>Balance</th>
                  <th className={`${th} !text-right`}>Value</th>
                  <th className={`${th} !text-right`}>Earned</th>
                </tr>
              </thead>
              <tbody className="font-mono text-sm">
                {ready && data.holdings.length ? (
                  data.holdings.map((h) => {
                    const p = pairInfo(h.token.pair);
                    const raw = e.holder.get(h.token.address.toLowerCase()) ?? 0n;
                    return (
                      <tr key={h.token.address} className="border-t border-line/60">
                        <td className="py-3.5"><TokenCell t={h.token} /></td>
                        <td className="py-3.5 text-right">{fmtCompact(h.amount)}</td>
                        <td className="py-3.5 text-right">{fmtUsd(h.valueEth * ethUsd)}</td>
                        <td className="py-3.5 text-right">
                          {h.token.holdersBps > 0 ? (
                            <div className="flex items-center justify-end gap-3">
                              <span>{amt(Number(formatUnits(raw, p.decimals)))} <span className="text-dim">{p.symbol}</span></span>
                              {own && <ClaimBtn t={h.token} kind="holder" disabled={raw === 0n} onDone={e.refetch} />}
                            </div>
                          ) : (
                            <span className="text-dim">no dividends</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <Skeleton cols={4} />
                )}
              </tbody>
            </table>
            {!wallet && !agg ? (
              <Empty>
                <p>Connect a wallet to see your portfolio.</p>
                <ConnectButton />
              </Empty>
            ) : isLoading ? (
              <Empty><p className="text-dim">Loading…</p></Empty>
            ) : ready && !data.holdings.length ? (
              <Empty><p className="text-dim">No holdings yet. <Link href="/" className="text-accent hover:underline">Explore markets →</Link></p></Empty>
            ) : null}
          </div>
        </section>

        {ready && data.created.length > 0 && (
          <section>
            <h2 className="mb-6 font-serif text-4xl">Launched</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr>
                    <th className={th}>Token</th>
                    <th className={`${th} !text-right`}>Market cap</th>
                    <th className={`${th} !text-right`}>Lifetime fees</th>
                    <th className={`${th} !text-right`}>To claim</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-sm">
                  {data.created.map((t) => {
                    const p = pairInfo(t.pair);
                    const raw = e.route.get(t.address.toLowerCase()) ?? 0n;
                    return (
                      <tr key={t.address} className="border-t border-line/60">
                        <td className="py-3.5"><TokenCell t={t} sub={`$${t.symbol} · ${p.symbol} · ${timeAgo(t.createdAt)}`} /></td>
                        <td className="py-3.5 text-right">{fmtUsd(t.fdvEth * ethUsd)}</td>
                        <td className="py-3.5 text-right">{fmtUsd(t.routeFeesEth * ethUsd)}</td>
                        <td className="py-3.5 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <span>{amt(Number(formatUnits(raw, p.decimals)))} <span className="text-dim">{p.symbol}</span></span>
                            {own && <ClaimBtn t={t} kind="route" disabled={raw === 0n} onDone={e.refetch} />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-6 font-serif text-4xl">Trades</h2>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>Token</th>
                  <th className={`${th} !text-right`}>Side</th>
                  <th className={`${th} !text-right`}>Tokens</th>
                  <th className={`${th} !text-right`}>Paid or received</th>
                  <th className={`${th} !text-right`}>Transaction</th>
                </tr>
              </thead>
              <tbody className="font-mono text-sm">
                {ready && data.trades.length ? (
                  data.trades.map((r) => {
                    const p = pairInfo(r.pair);
                    return (
                      <tr key={r.id} className="border-t border-line/60">
                        <td className="py-3.5"><TokenCell t={{ address: r.token, image: r.image, symbol: r.symbol, name: r.name }} /></td>
                        <td className={`py-3.5 text-right ${r.isBuy ? "text-up" : "text-down"}`}>{r.isBuy ? "Buy" : "Sell"}</td>
                        <td className="py-3.5 text-right">{fmtCompact(r.tokens)}</td>
                        <td className="py-3.5 text-right">{amt(r.pairAmount ?? r.eth)} <span className="text-dim">{r.pair ? p.symbol : "ETH"}</span></td>
                        <td className="py-3.5 text-right">
                          <a href={`${EXPLORER}/tx/${r.tx}`} target="_blank" rel="noreferrer" className="text-dim hover:text-accent">
                            {timeAgo(r.ts)} ↗
                          </a>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <Skeleton cols={5} rows={4} />
                )}
              </tbody>
            </table>
            {!(ready && data.trades.length) && (
              <Empty><p className="text-muted">Your buys and sells in every Keelfun market, newest first.</p></Empty>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

export default function PortfolioPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Loading…</p>}>
      <PortfolioView />
    </Suspense>
  );
}
