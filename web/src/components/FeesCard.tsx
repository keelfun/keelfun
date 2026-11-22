"use client";
import { useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { launchHookAbi, launchTokenAbi } from "@/lib/abis";
import type { Token } from "@/lib/api";
import { ADDR, chain, pairInfo, platformBpsFor } from "@/lib/config";
import { fmtCompact, fmtValue, shortAddr } from "@/lib/format";
import { errMsg, useConfirm, useEnsureWallet } from "@/lib/tx";

export function useClaimable(t: Token, wallet?: `0x${string}`) {
  const q = { enabled: !!wallet, refetchInterval: 8000 };
  const route = useReadContract({
    address: ADDR.hook, abi: launchHookAbi, functionName: "accrued", args: [t.address, wallet!], chainId: chain.id, query: q,
  });
  const holder = useReadContract({
    address: t.address, abi: launchTokenAbi, functionName: "claimable", args: [wallet!], chainId: chain.id,
    query: { ...q, enabled: !!wallet && t.holdersBps > 0 },
  });
  const pending = useReadContract({
    address: ADDR.hook, abi: launchHookAbi, functionName: "holdersPending", args: [t.address], chainId: chain.id,
    query: { refetchInterval: 8000, enabled: t.holdersBps > 0 },
  });
  const burn = useReadContract({
    address: ADDR.hook, abi: launchHookAbi, functionName: "burnPending", args: [t.address], chainId: chain.id,
    query: { refetchInterval: 8000, enabled: t.burnBps > 0 },
  });
  return {
    route: (route.data as bigint | undefined) ?? 0n,
    holder: (holder.data as bigint | undefined) ?? 0n,
    pending: (pending.data as bigint | undefined) ?? 0n,
    burn: (burn.data as bigint | undefined) ?? 0n,
    refetch: () => Promise.all([route.refetch(), holder.refetch(), pending.refetch(), burn.refetch()]),
  };
}

export function useClaim(t: Token, onDone: () => unknown) {
  const ensureWallet = useEnsureWallet();
  const confirm = useConfirm();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function run(kind: "route" | "holder" | "flush" | "burn") {
    setErr(null);
    setBusy(kind);
    try {
      const account = await ensureWallet();
      const h =
        kind === "route"
          ? await writeContractAsync({ address: ADDR.hook, abi: launchHookAbi, functionName: "claim", args: [t.address], chainId: chain.id })
          : kind === "flush"
            ? await writeContractAsync({ address: ADDR.hook, abi: launchHookAbi, functionName: "flushHolders", args: [t.address], chainId: chain.id })
            : kind === "burn"
              ? await writeContractAsync({ address: ADDR.hook, abi: launchHookAbi, functionName: "burn", args: [t.address], chainId: chain.id })
              : await writeContractAsync({ address: t.address, abi: launchTokenAbi, functionName: "claim", args: [account], chainId: chain.id });
      await confirm(h);
      await onDone();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
    }
  }
  return { busy, err, run };
}

const btn = "h-8 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-ink disabled:opacity-40";
const ghost = "w-full rounded-lg border border-line-2 py-1.5 text-xs text-muted hover:text-fg disabled:opacity-40";

export function FeesCard({ t, ethUsd }: { t: Token; ethUsd: number }) {
  const { address } = useAccount();
  const c = useClaimable(t, address);
  const { busy, err, run } = useClaim(t, c.refetch);
  const pair = pairInfo(t.pair);
  const fmtP = (v: bigint) => `${Number(formatUnits(v, pair.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${pair.symbol}`;
  const alloc = [
    { k: "Creator", v: t.creatorBps, c: "bg-accent" },
    { k: "Holders", v: t.holdersBps, c: "bg-up" },
    { k: "Burn", v: t.burnBps, c: "bg-warn" },
  ].filter((a) => a.v > 0);
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-3">
      <dt className="text-dim">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm">Taxes</p>
        <p className="font-mono text-sm text-accent-fg">
          buy {t.buyBps / 100}% · sell {t.sellBps / 100}%
        </p>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-line">
        {alloc.map((a) => (
          <div key={a.k} className={a.c} style={{ width: `${a.v / 100}%` }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 font-mono text-[11px] text-dim">
        {alloc.map((a) => (
          <span key={a.k}>
            {a.k} {a.v / 100}%
          </span>
        ))}
      </div>
      <p className="mt-1 font-mono text-[11px] text-dim">
        protocol {platformBpsFor(t.buyBps) / 100}% buy · {platformBpsFor(t.sellBps) / 100}% sell, included
      </p>
      {t.creatorBps > 0 && t.recipients.length > 0 && (
        <ul className="mt-3 space-y-1 font-mono text-xs">
          {t.recipients.map((r) => (
            <li key={r.address} className="flex justify-between">
              <span className="text-muted">{shortAddr(r.address)}</span>
              <span>{r.bps / 100}%</span>
            </li>
          ))}
        </ul>
      )}
      <dl className="mt-3 space-y-1.5 border-t border-line pt-3 font-mono text-xs">
        {row("Paid out", fmtValue(t.routeFeesEth, ethUsd))}
        {t.burnBps > 0 && row("Bought back + burned", fmtCompact(t.buybackBurned ?? 0))}
        {row("Pair", pair.symbol)}
        {row("Supply", t.supply.toLocaleString("en-US"))}
        {row("Anti-snipe", t.antiSnipe ? "90% → 0 in 60s" : "off")}
        {row("Metadata", t.editable ? "editable by creator" : "locked")}
        {row("Total volume", fmtValue(t.volumeEth, ethUsd))}
        {row("LP", <span className="text-accent-fg">locked forever</span>)}
      </dl>
      {(address || c.burn > 0n) && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          {address && c.route > 0n && (
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-mono text-sm">{fmtP(c.route)}</p>
                <p className="text-[11px] text-dim">your creator fees</p>
              </div>
              <button className={btn} disabled={!!busy} onClick={() => run("route")}>
                {busy === "route" ? "…" : "Claim"}
              </button>
            </div>
          )}
          {address && t.holdersBps > 0 && (
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-mono text-sm">{fmtP(c.holder)}</p>
                <p className="text-[11px] text-dim">your holder dividends</p>
              </div>
              <button className={btn} disabled={!!busy || c.holder === 0n} onClick={() => run("holder")}>
                {busy === "holder" ? "…" : "Claim"}
              </button>
            </div>
          )}
          {t.holdersBps > 0 && c.pending > 0n && (
            <button className={ghost} disabled={!!busy} onClick={() => run("flush")}>
              {busy === "flush" ? "…" : `Distribute ${fmtP(c.pending)} to holders`}
            </button>
          )}
          {t.burnBps > 0 && c.burn > 0n && (
            <button className={ghost} disabled={!!busy} onClick={() => run("burn")}>
              {busy === "burn" ? "…" : `Buy back + burn with ${fmtP(c.burn)}`}
            </button>
          )}
          {err && <p className="text-[11px] text-down">{err}</p>}
        </div>
      )}
    </div>
  );
}
