"use client";
import { useEffect, useState } from "react";
import { formatEther, isAddress } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { Em, PageHero } from "@/components/PageHero";
import { launchHookAbi } from "@/lib/abis";
import { ADDR, chain, DEPLOYED, EXPLORER } from "@/lib/config";
import { fmtEth } from "@/lib/format";
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
  const accrued = useReadContract({
    address: ADDR.hook, abi: launchHookAbi, functionName: "platformAccrued", chainId: chain.id,
    query: { enabled: DEPLOYED, refetchInterval: 10_000 },
  });
  const ownerAddr = owner.data as `0x${string}` | undefined;
  const amount = (accrued.data as bigint | undefined) ?? 0n;
  const isOwner = !!address && !!ownerAddr && address.toLowerCase() === ownerAddr.toLowerCase();

  useEffect(() => {
    if (address && !to) setTo(address);
  }, [address, to]);

  async function withdraw() {
    setMsg(null);
    try {
      setBusy("Connecting…");
      await ensureWallet();
      setBusy("Confirm in your wallet…");
      const h = await writeContractAsync({
        address: ADDR.hook, abi: launchHookAbi, functionName: "withdrawPlatformFees", args: [to as `0x${string}`], chainId: chain.id,
      });
      setBusy("Withdrawing…");
      await confirm(h);
      setMsg({ ok: true, text: `Sent ${fmtEth(Number(formatEther(amount)))} to ${to.slice(0, 6)}…${to.slice(-4)}` });
      accrued.refetch();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHero title={<>Platform <Em>fees</Em></>} sub="Platform fees collect in the Keel hook. Only the hook owner can withdraw them." />
      <div className="mx-auto max-w-xl rounded-3xl border border-line bg-panel p-5">
        <p className="text-xs text-dim">Ready to withdraw</p>
        <p className="mt-1 font-serif text-5xl">{fmtEth(Number(formatEther(amount)))}</p>
        <dl className="mt-5 space-y-2 text-sm">
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
          <div className="mt-6 space-y-3">
            <label className="block text-xs text-dim">
              Send to
              <input value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="0x…" className="mt-1 h-11 w-full rounded-xl border border-line bg-bg/60 px-3 font-mono text-sm text-fg outline-none focus:border-accent/50" />
            </label>
            <button
              onClick={withdraw}
              disabled={!!busy || amount === 0n || !isAddress(to)}
              className="h-12 w-full rounded-2xl bg-accent font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ?? (amount === 0n ? "Nothing to withdraw" : !isAddress(to) ? "Enter a valid address" : "Withdraw")}
            </button>
          </div>
        )}
        {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-up" : "text-down"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
