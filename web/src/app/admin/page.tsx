"use client";
import { useEffect, useState } from "react";
import { formatUnits, isAddress } from "viem";
import { useAccount, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { Em, PageHero } from "@/components/PageHero";
import { launchHookAbi } from "@/lib/abis";
import { ADDR, chain, DEPLOYED, EXPLORER, PAIRS } from "@/lib/config";
import { errMsg, useConfirm, useEnsureWallet } from "@/lib/tx";

export default function AdminPage() {
  const { address } = useAccount();
  const ensureWallet = useEnsureWallet();
  const confirm = useConfirm();
  const { writeContractAsync } = useWriteContract();
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const owner = useReadContract({ address: ADDR.hook, abi: launchHookAbi, functionName: "owner", chainId: chain.id, query: { enabled: DEPLOYED } });
  const accrued = useReadContracts({
    contracts: PAIRS.map((p) => ({ address: ADDR.hook, abi: launchHookAbi, functionName: "platformAccrued", args: [p.address], chainId: chain.id }) as const),
    query: { enabled: DEPLOYED, refetchInterval: 10_000 },
  });
  const ownerAddr = owner.data as `0x${string}` | undefined;
  const isOwner = !!address && !!ownerAddr && address.toLowerCase() === ownerAddr.toLowerCase();
  const amounts = PAIRS.map((_, i) => (accrued.data?.[i]?.result as bigint | undefined) ?? 0n);
  const fmt = (v: bigint, d: number) => Number(formatUnits(v, d)).toLocaleString(undefined, { maximumFractionDigits: 8 });

  useEffect(() => {
    if (address && !to) setTo(address);
  }, [address, to]);

  async function withdraw(i: number) {
    const p = PAIRS[i];
    setMsg(null);
    try {
      setBusy(p.symbol);
      await ensureWallet();
      const h = await writeContractAsync({
        address: ADDR.hook, abi: launchHookAbi, functionName: "withdrawPlatformFees", args: [p.address, to as `0x${string}`], chainId: chain.id,
      });
      await confirm(h);
      setMsg({ ok: true, text: `Sent ${fmt(amounts[i], p.decimals)} ${p.symbol} to ${to.slice(0, 6)}…${to.slice(-4)}` });
      accrued.refetch();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHero title={<>Platform <Em>fees</Em></>} sub="Protocol fees collect in the Keelfun hook, per pair asset. Only the hook owner can withdraw them." />
      <div className="mx-auto max-w-xl rounded-3xl border border-line bg-panel p-5">
        <p className="text-xs text-dim">Ready to withdraw</p>
        <ul className="mt-3 divide-y divide-line">
          {PAIRS.map((p, i) => (
            <li key={p.symbol} className="flex items-center gap-3 py-3">
              <img src={p.logo} alt="" className="h-7 w-7 rounded-full" />
              <p className="flex-1 font-serif text-2xl">
                {fmt(amounts[i], p.decimals)} <span className="text-base text-muted">{p.symbol}</span>
              </p>
              {isOwner && (
                <button
                  onClick={() => withdraw(i)}
                  disabled={!!busy || amounts[i] === 0n || !isAddress(to)}
                  className="h-9 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {busy === p.symbol ? "…" : "Withdraw"}
                </button>
              )}
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Hook</dt>
            <dd><a href={`${EXPLORER}/address/${ADDR.hook}`} target="_blank" rel="noreferrer" className="font-mono text-accent hover:underline">{ADDR.hook.slice(0, 8)}…{ADDR.hook.slice(-6)}</a></dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Owner</dt>
            <dd className="font-mono">{ownerAddr ? `${ownerAddr.slice(0, 8)}…${ownerAddr.slice(-6)}` : "–"}</dd>
          </div>
        </dl>
        {!address ? (
          <div className="mt-6"><ConnectButton /></div>
        ) : !isOwner ? (
          <p className="mt-6 rounded-xl border border-line bg-bg/60 p-3 text-sm text-muted">The connected wallet isn&apos;t the hook owner, so it can&apos;t withdraw.</p>
        ) : (
          <label className="mt-6 block text-xs text-dim">
            Send to
            <input value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="0x…" className="mt-1 h-11 w-full rounded-xl border border-line bg-bg/60 px-3 font-mono text-sm text-fg outline-none focus:border-accent/50" />
          </label>
        )}
        {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-up" : "text-down"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
