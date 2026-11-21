"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { erc20Abi, formatEther, formatUnits, maxUint256, parseUnits } from "viem";
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { launchRouterAbi, launchTokenAbi } from "@/lib/abis";
import type { Token } from "@/lib/api";
import { ADDR, chain, DEPLOYED, pairInfo, snipeBpsAt } from "@/lib/config";
import { fmtCompact, fmtEth } from "@/lib/format";
import { errMsg, useConfirm, useEnsureWallet } from "@/lib/tx";
import { TokenAvatar } from "./TokenAvatar";

function useDebounced<T>(v: T, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

function safeParse(v: string, decimals = 18): bigint {
  try {
    return v && Number(v) > 0 ? parseUnits(v, decimals) : 0n;
  } catch {
    return 0n;
  }
}

export function TradePanel({ token, defaultSide = "buy" }: { token: Token; defaultSide?: "buy" | "sell" }) {
  const { address } = useAccount();
  const client = usePublicClient({ chainId: chain.id });
  const ensureWallet = useEnsureWallet();
  const confirm = useConfirm();
  const { writeContractAsync } = useWriteContract();
  const pair = pairInfo(token.pair);
  const native = pair.symbol === "ETH";
  const [side, setSide] = useState<"buy" | "sell">(defaultSide);
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(5);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const eth = useBalance({ address, chainId: chain.id, query: { refetchInterval: 6000 } });
  const tokBal = useReadContract({
    address: token.address, abi: launchTokenAbi, functionName: "balanceOf", args: [address!], chainId: chain.id,
    query: { enabled: !!address, refetchInterval: 6000 },
  });
  const allowance = useReadContract({
    address: token.address, abi: launchTokenAbi, functionName: "allowance", args: [address!, ADDR.router], chainId: chain.id,
    query: { enabled: !!address },
  });

  const pairBal = useReadContract({
    address: pair.address, abi: erc20Abi, functionName: "balanceOf", args: [address!], chainId: chain.id,
    query: { enabled: !!address && !native, refetchInterval: 6000 },
  });
  const pairAllowance = useReadContract({
    address: pair.address, abi: erc20Abi, functionName: "allowance", args: [address!, ADDR.router], chainId: chain.id,
    query: { enabled: !!address && !native },
  });

  const amountIn = safeParse(useDebounced(amount), side === "buy" ? pair.decimals : 18);
  const quote = useQuery({
    queryKey: ["quote", token.address, side, amountIn.toString()],
    enabled: amountIn > 0n && !!client && DEPLOYED,
    retry: false,
    refetchInterval: 8000,
    queryFn: async () => {
      const { result } = await client!.simulateContract({
        address: ADDR.router,
        abi: launchRouterAbi,
        functionName: side === "buy" ? "quoteBuy" : "quoteSell",
        args: [token.address, amountIn],
      });
      return { used: result[0], out: result[1] };
    },
  });

  const snipeBps = token.antiSnipe ? snipeBpsAt(token.createdAt, now) : 0;
  const feePct = Math.min(9900, (side === "buy" ? token.buyBps + snipeBps : token.sellBps)) / 100;
  const balance = side === "buy" ? (native ? eth.data?.value : (pairBal.data as bigint | undefined)) ?? 0n : (tokBal.data as bigint | undefined) ?? 0n;
  const insufficient = !!address && amountIn > balance;
  const presets = side === "buy" ? [...pair.presets] : ["25", "50", "75", "100"];

  function preset(p: string) {
    setMsg(null);
    if (side === "buy") return setAmount(p);
    const bal = (tokBal.data as bigint | undefined) ?? 0n;
    setAmount(formatEther((bal * BigInt(p)) / 100n));
  }

  async function submit() {
    if (amountIn === 0n || busy) return;
    setMsg(null);
    try {
      setBusy("Connecting…");
      const account = await ensureWallet();
      const out = quote.data?.out ?? 0n;
      const minOut = (out * BigInt(Math.round((100 - slippage) * 100))) / 10_000n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      if (side === "sell" && ((allowance.data as bigint | undefined) ?? 0n) < amountIn) {
        setBusy("Approve in wallet…");
        const h = await writeContractAsync({
          address: token.address, abi: launchTokenAbi, functionName: "approve", args: [ADDR.router, maxUint256], chainId: chain.id,
        });
        setBusy("Approving…");
        await confirm(h);
        await allowance.refetch();
      }
      if (side === "buy" && !native && ((pairAllowance.data as bigint | undefined) ?? 0n) < amountIn) {
        setBusy("Approve in wallet…");
        const h = await writeContractAsync({
          address: pair.address, abi: erc20Abi, functionName: "approve", args: [ADDR.router, maxUint256], chainId: chain.id,
        });
        setBusy("Approving…");
        await confirm(h);
        await pairAllowance.refetch();
      }
      setBusy("Confirm in wallet…");
      const hash =
        side === "buy"
          ? await writeContractAsync({
              address: ADDR.router, abi: launchRouterAbi, functionName: "buy",
              args: [token.address, amountIn, minOut, account, deadline], value: native ? amountIn : 0n, chainId: chain.id,
            })
          : await writeContractAsync({
              address: ADDR.router, abi: launchRouterAbi, functionName: "sell",
              args: [token.address, amountIn, minOut, account, deadline], chainId: chain.id,
            });
      setBusy(side === "buy" ? "Buying…" : "Selling…");
      await confirm(hash);
      setMsg({ ok: true, text: side === "buy" ? `Bought ${token.symbol}` : `Sold ${token.symbol}` });
      setAmount("");
      eth.refetch();
      pairBal.refetch();
      tokBal.refetch();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(null);
    }
  }

  const payEth = side === "buy";
  const outNum = quote.data ? Number(formatUnits(quote.data.out, side === "buy" ? 18 : pair.decimals)) : 0;
  const outText = quote.data
    ? payEth ? fmtCompact(outNum) : outNum.toLocaleString(undefined, { maximumFractionDigits: 6 })
    : quote.isFetching ? "…" : "0";
  const label = !DEPLOYED
    ? "Swaps open soon"
    : busy ?? (!address ? "Connect wallet" : amountIn === 0n ? "Enter an amount" : insufficient ? `Not enough ${payEth ? pair.symbol : token.symbol}` : "Swap");
  const pill = (eth: boolean) => (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-panel-2 py-1 pl-1 pr-3 text-sm font-medium">
      {eth ? <img src={pair.logo} alt="" className="h-6 w-6 rounded-full" /> : <TokenAvatar src={token.image} symbol={token.symbol} size={24} />}
      {eth ? pair.symbol : token.symbol}
    </span>
  );
  return (
    <div className="rounded-3xl border border-line bg-panel p-2">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-medium">Swap</span>
        <label className="flex items-center gap-1.5 text-xs text-dim">
          Slippage
          <select value={slippage} onChange={(e) => setSlippage(Number(e.target.value))} className="rounded-md border border-line bg-bg px-1.5 py-0.5 text-fg outline-none">
            {[1, 3, 5, 10, 20].map((v) => (
              <option key={v} value={v}>{v}%</option>
            ))}
          </select>
        </label>
      </div>
      <div className="rounded-2xl border border-transparent bg-bg/70 p-4 focus-within:border-line-2">
        <p className="text-xs text-dim">You pay</p>
        <div className="mt-2 flex items-center gap-3">
          <input
            value={amount}
            onChange={(e) => {
              setMsg(null);
              setAmount(e.target.value.replace(/[^0-9.]/g, ""));
            }}
            placeholder="0"
            inputMode="decimal"
            className="w-0 min-w-0 flex-1 bg-transparent text-4xl outline-none placeholder:text-dim"
          />
          {pill(payEth)}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-dim">
          <div className="flex gap-1">
            {presets.map((p) => (
              <button key={p} onClick={() => preset(p)} className="rounded-md border border-line px-1.5 py-0.5 hover:text-fg">
                {payEth ? p : p === "100" ? "Max" : `${p}%`}
              </button>
            ))}
          </div>
          {address && (
            <span className="truncate font-mono">
              Balance {payEth ? `${Number(formatUnits(balance, pair.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${pair.symbol}` : fmtCompact(Number(formatEther(balance)))}
            </span>
          )}
        </div>
      </div>
      <div className="relative z-10 -my-3.5 flex justify-center">
        <button
          aria-label="Switch direction"
          onClick={() => {
            setSide(payEth ? "sell" : "buy");
            setAmount("");
            setMsg(null);
          }}
          className="flex h-10 w-10 items-center justify-center rounded-xl border-4 border-panel bg-panel-2 text-lg text-muted transition-colors hover:text-accent"
        >
          ↓
        </button>
      </div>
      <div className="rounded-2xl bg-bg/70 p-4">
        <p className="text-xs text-dim">You receive</p>
        <div className="mt-2 flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-4xl text-fg/90">{outText}</p>
          {pill(!payEth)}
        </div>
      </div>
      <div className="space-y-1.5 px-3 py-3 text-xs">
        <div className="flex justify-between text-muted"><span>Trade fee</span><span>{feePct}%</span></div>
        <div className="flex justify-between text-muted"><span>Max slippage</span><span>{slippage}%</span></div>
        {snipeBps > 0 && payEth && (
          <p className="rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-1.5 text-warn">Anti-snipe active: buys pay an extra {snipeBps / 100}% right now.</p>
        )}
      </div>
      <button
        onClick={() => (!address ? ensureWallet().catch(() => {}) : submit())}
        disabled={!DEPLOYED || !!busy || (!!address && (amountIn === 0n || insufficient))}
        className="h-14 w-full rounded-2xl bg-accent text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {label}
      </button>
      {msg && <p className={`px-3 pt-2 text-sm ${msg.ok ? "text-up" : "text-down"}`}>{msg.text}</p>}
    </div>
  );
}
