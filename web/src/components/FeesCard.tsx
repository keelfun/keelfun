"use client";
import { useState } from "react";
import { formatEther } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { launchHookAbi, launchTokenAbi } from "@/lib/abis";
import type { Token } from "@/lib/api";
import { ADDR, chain, FEE_TIERS } from "@/lib/config";
import { fmtEth, fmtValue, shortAddr } from "@/lib/format";
import { errMsg, useConfirm, useEnsureWallet } from "@/lib/tx";

export function useClaimable(t: Token, wallet?: `0x${string}`) {
  const q = { enabled: !!wallet, refetchInterval: 8000 };
  const route = useReadContract({
    address: ADDR.hook, abi: launchHookAbi, functionName: "accrued", args: [t.address, wallet!], chainId: chain.id, query: q,
  });
  const holder = useReadContract({
    address: t.address, abi: launchTokenAbi, functionName: "claimable", args: [wallet!], chainId: chain.id,
    query: { ...q, enabled: !!wallet && t.holdersRoute },
  });
  const pending = useReadContract({
    address: ADDR.hook, abi: launchHookAbi, functionName: "holdersPending", args: [t.address], chainId: chain.id,
    query: { refetchInterval: 8000, enabled: t.holdersRoute },
  });
  return {
    route: (route.data as bigint | undefined) ?? 0n,
    holder: (holder.data as bigint | undefined) ?? 0n,
    pending: (pending.data as bigint | undefined) ?? 0n,
    refetch: () => Promise.all([route.refetch(), holder.refetch(), pending.refetch()]),
  };
}

export function useClaim(t: Token, onDone: () => unknown) {
  const ensureWallet = useEnsureWallet();
  const confirm = useConfirm();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function run(kind: "route" | "holder" | "flush") {
    setErr(null);
    setBusy(kind);
    try {
      const account = await ensureWallet();
      const h =
        kind === "route"
          ? await writeContractAsync({ address: ADDR.hook, abi: launchHookAbi, functionName: "claim", args: [t.address], chainId: chain.id })
          : kind === "flush"
            ? await writeContractAsync({ address: ADDR.hook, abi: launchHookAbi, functionName: "flushHolders", args: [t.address], chainId: chain.id })
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

export function FeesCard({ t, ethUsd }: { t: Token; ethUsd: number }) {
  const { address } = useAccount();
  const c = useClaimable(t, address);
  const { busy, err, run } = useClaim(t, c.refetch);
  const platform = FEE_TIERS.find((f) => f.bps === t.feeBps)?.platformBps ?? 0;
  const mine = Number(formatEther(t.holdersRoute ? c.holder : c.route));
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm">Fees</p>
        <p className="font-mono text-sm text-accent">{t.feeBps / 100}% / trade</p>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-line">
        <div className="bg-accent" style={{ width: `${((t.feeBps - platform) / t.feeBps) * 100}%` }} />
        <div className="bg-line-2" style={{ width: `${(platform / t.feeBps) * 100}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-dim">
        <span>{t.holdersRoute ? "holders" : "creator route"} {(t.feeBps - platform) / 100}%</span>
        <span>platform {platform / 100}%</span>
      </div>
      {!t.holdersRoute && t.recipients.length > 0 && (
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
        <div className="flex justify-between"><dt className="text-dim">Paid to {t.holdersRoute ? "holders" : "route"}</dt><dd>{fmtValue(t.routeFeesEth, ethUsd)}</dd></div>
        <div className="flex justify-between"><dt className="text-dim">Supply</dt><dd>{t.supply.toLocaleString("en-US")}</dd></div>
        <div className="flex justify-between"><dt className="text-dim">Anti-snipe</dt><dd>{t.antiSnipe ? "90% → 0 in 60s" : "off"}</dd></div>
        <div className="flex justify-between"><dt className="text-dim">Pool ETH</dt><dd>{fmtEth(t.poolEth)}</dd></div>
        <div className="flex justify-between"><dt className="text-dim">Total volume</dt><dd>{fmtValue(t.volumeEth, ethUsd)}</dd></div>
        <div className="flex justify-between"><dt className="text-dim">LP</dt><dd className="text-accent">locked forever</dd></div>
      </dl>
      {address && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-mono text-sm">{fmtEth(mine)}</p>
              <p className="text-[11px] text-dim">your claimable</p>
            </div>
            <button className={btn} disabled={!!busy || mine === 0} onClick={() => run(t.holdersRoute ? "holder" : "route")}>
              {busy === "holder" || busy === "route" ? "…" : "Claim"}
            </button>
          </div>
          {t.holdersRoute && c.pending > 0n && (
            <button
              className="w-full rounded-lg border border-line-2 py-1.5 text-xs text-muted hover:text-fg disabled:opacity-40"
              disabled={!!busy}
              onClick={() => run("flush")}
            >
              {busy === "flush" ? "…" : `Distribute ${fmtEth(Number(formatEther(c.pending)))} to holders`}
            </button>
          )}
          {err && <p className="text-[11px] text-down">{err}</p>}
        </div>
      )}
    </div>
  );
}
