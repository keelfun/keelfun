"use client";
import { useEffect, useState } from "react";
import { erc20Abi, formatUnits, parseUnits } from "viem";
import { useAccount, useBalance, useReadContract, useSendTransaction } from "wagmi";
import { chain } from "@/lib/config";
import { errMsg, useConfirm, useEnsureWallet } from "@/lib/tx";

type Cur = { address: string; symbol: string; name: string; decimals: number; logo?: string };
const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const RELAY = "https://api.relay.link";
const ETH: Cur = { address: ZERO, symbol: "ETH", name: "Ether", decimals: 18, logo: "https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg" };
const USDC: Cur = { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", name: "USD Coin", decimals: 6, logo: "https://coin-images.coingecko.com/coins/images/6319/large/usdc.png" };

type Quote = {
  message?: string;
  steps: { kind: string; items: { data: { to: `0x${string}`; data: `0x${string}`; value?: string } }[] }[];
  details?: { currencyOut?: { amountFormatted?: string; amountUsd?: string }; currencyIn?: { amountUsd?: string } };
  fees?: { relayer?: { amountUsd?: string } };
};

async function search(term: string): Promise<Cur[]> {
  const body: Record<string, unknown> = { chainIds: [chain.id], limit: 25 };
  if (/^0x[0-9a-fA-F]{40}$/.test(term)) body.address = term;
  else if (term) body.term = term;
  else body.verified = true;
  const r = await fetch(`${RELAY}/currencies/v2`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json()) as { address: string; symbol: string; name: string; decimals: number; metadata?: { logoURI?: string } }[];
  return Array.isArray(j) ? j.map((c) => ({ address: c.address.toLowerCase(), symbol: c.symbol, name: c.name, decimals: c.decimals, logo: c.metadata?.logoURI })) : [];
}

async function getQuote(user: string, a: Cur, b: Cur, amount: string, signal?: AbortSignal) {
  const r = await fetch(`${RELAY}/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      user, recipient: user, originChainId: chain.id, destinationChainId: chain.id,
      originCurrency: a.address, destinationCurrency: b.address, amount, tradeType: "EXACT_INPUT",
    }),
  });
  const q = (await r.json()) as Quote;
  if (!r.ok) throw new Error(q.message || "No route for this pair");
  return q;
}

function Icon({ c, size = 24 }: { c: Cur; size?: number }) {
  return c.logo ? (
    <img src={c.logo} alt="" className="shrink-0 rounded-full bg-panel-2" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-panel-2 text-[10px]" style={{ width: size, height: size }}>{c.symbol.slice(0, 2)}</span>
  );
}

function useBal(c: Cur, address?: `0x${string}`) {
  const native = c.address === ZERO;
  const eth = useBalance({ address, chainId: chain.id, query: { enabled: !!address && native, refetchInterval: 8000 } });
  const tok = useReadContract({
    address: c.address as `0x${string}`, abi: erc20Abi, functionName: "balanceOf", args: [address ?? DEAD], chainId: chain.id,
    query: { enabled: !!address && !native, refetchInterval: 8000 },
  });
  return { value: native ? eth.data?.value : (tok.data as bigint | undefined), refetch: () => (native ? eth.refetch() : tok.refetch()) };
}

function Picker({ onPick, onClose }: { onPick: (c: Cur) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Cur[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      search(q.trim())
        .then((l) => live && setList(q.trim() ? l : [ETH, ...l.filter((c) => c.address !== ZERO)]))
        .catch(() => live && setList([]))
        .finally(() => live && setLoading(false));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-t-3xl border border-line bg-panel p-4 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-medium">Select a token</p>
          <button onClick={onClose} className="text-muted hover:text-fg">✕</button>
        </div>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or paste address" className="mt-3 h-11 w-full rounded-xl border border-line bg-bg/60 px-3 text-sm outline-none placeholder:text-dim focus:border-accent/50" />
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {list.map((c) => (
            <button key={c.address} onClick={() => onPick(c)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-panel-2">
              <Icon c={c} size={32} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.symbol}</p>
                <p className="truncate text-xs text-dim">{c.name}</p>
              </div>
            </button>
          ))}
          {!loading && list.length === 0 && <p className="py-8 text-center text-sm text-muted">No tokens found.</p>}
          {loading && <p className="py-8 text-center text-sm text-muted">Searching…</p>}
        </div>
      </div>
    </div>
  );
}

export function AnySwap() {
  const { address } = useAccount();
  const ensureWallet = useEnsureWallet();
  const confirm = useConfirm();
  const { sendTransactionAsync } = useSendTransaction();
  const [pay, setPay] = useState<Cur>(ETH);
  const [get, setGet] = useState<Cur>(USDC);
  const [pick, setPick] = useState<"pay" | "get" | null>(null);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [qErr, setQErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const bal = useBal(pay, address);
  const balGet = useBal(get, address);

  let wei = 0n;
  try {
    wei = amount && Number(amount) > 0 ? parseUnits(amount, pay.decimals) : 0n;
  } catch {}
  const weiStr = wei.toString();
  const insufficient = !!address && bal.value != null && wei > bal.value;

  useEffect(() => {
    setQuote(null);
    setQErr("");
    if (weiStr === "0" || pay.address === get.address) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      getQuote(address ?? DEAD, pay, get, weiStr, ctl.signal)
        .then(setQuote)
        .catch((e) => !ctl.signal.aborted && setQErr(errMsg(e)));
    }, 400);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [weiStr, pay, get, address]);

  function choose(c: Cur) {
    if (pick === "pay") {
      if (c.address === get.address) setGet(pay);
      setPay(c);
    } else {
      if (c.address === pay.address) setPay(get);
      setGet(c);
    }
    setPick(null);
    setAmount("");
    setMsg(null);
  }

  async function submit() {
    setMsg(null);
    try {
      setBusy("Connecting…");
      const user = await ensureWallet();
      setBusy("Getting a fresh quote…");
      const q = await getQuote(user, pay, get, weiStr);
      for (const s of q.steps) {
        if (s.kind !== "transaction") continue;
        for (const it of s.items) {
          setBusy("Confirm in your wallet…");
          const h = await sendTransactionAsync({ to: it.data.to, data: it.data.data, value: BigInt(it.data.value || "0"), chainId: chain.id });
          setBusy("Waiting for confirmation…");
          await confirm(h);
        }
      }
      setMsg({ ok: true, text: `Swapped ${amount} ${pay.symbol} for ${get.symbol}` });
      setAmount("");
      bal.refetch();
      balGet.refetch();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(null);
    }
  }

  const out = quote?.details?.currencyOut?.amountFormatted;
  const fmt = (v?: bigint, d = 18) => (v == null ? "–" : Number(formatUnits(v, d)).toLocaleString(undefined, { maximumFractionDigits: 6 }));
  const label = busy ?? (!address ? "Connect wallet" : wei === 0n ? "Enter an amount" : insufficient ? `Not enough ${pay.symbol}` : qErr ? "No route" : !quote ? "Getting a quote…" : "Swap");
  const tokenBtn = (c: Cur, side: "pay" | "get") => (
    <button onClick={() => setPick(side)} className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-panel-2 py-1 pl-1 pr-2.5 text-sm font-medium hover:border-line-2">
      <Icon c={c} />
      {c.symbol}
      <span className="text-xs text-dim">▾</span>
    </button>
  );

  return (
    <div className="rounded-3xl border border-line bg-panel p-2">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-medium">Swap</span>
        <span className="text-xs text-dim">Any token on {chain.name}</span>
      </div>
      <div className="rounded-2xl border border-transparent bg-bg/70 p-4 focus-within:border-line-2">
        <p className="text-xs text-dim">You pay</p>
        <div className="mt-2 flex items-center gap-3">
          <input value={amount} onChange={(e) => { setMsg(null); setAmount(e.target.value.replace(/[^0-9.]/g, "")); }} placeholder="0" inputMode="decimal" className="min-w-0 flex-1 bg-transparent text-4xl outline-none placeholder:text-dim" />
          {tokenBtn(pay, "pay")}
        </div>
        <div className="mt-2 flex justify-between text-xs text-dim">
          <span>{quote?.details?.currencyIn?.amountUsd ? `$${Number(quote.details.currencyIn.amountUsd).toFixed(2)}` : ""}</span>
          {address && (
            <button onClick={() => bal.value != null && setAmount(formatUnits(pay.address === ZERO ? (bal.value * 98n) / 100n : bal.value, pay.decimals))} className="font-mono hover:text-fg">
              Balance {fmt(bal.value, pay.decimals)} · Max
            </button>
          )}
        </div>
      </div>
      <div className="relative z-10 -my-3.5 flex justify-center">
        <button aria-label="Switch direction" onClick={() => { setPay(get); setGet(pay); setAmount(""); setMsg(null); }} className="flex h-10 w-10 items-center justify-center rounded-xl border-4 border-panel bg-panel-2 text-lg text-muted transition-colors hover:text-accent">↓</button>
      </div>
      <div className="rounded-2xl bg-bg/70 p-4">
        <p className="text-xs text-dim">You receive</p>
        <div className="mt-2 flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-4xl text-fg/90">{out ? Number(out).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "0"}</p>
          {tokenBtn(get, "get")}
        </div>
        <div className="mt-2 flex justify-between text-xs text-dim">
          <span>{quote?.details?.currencyOut?.amountUsd ? `$${Number(quote.details.currencyOut.amountUsd).toFixed(2)}` : ""}</span>
          {address && <span className="font-mono">Balance {fmt(balGet.value, get.decimals)}</span>}
        </div>
      </div>
      <div className="space-y-1.5 px-3 py-3 text-xs text-muted">
        <div className="flex justify-between"><span>Route</span><span>Relay · best price on {chain.name}</span></div>
        {quote?.fees?.relayer?.amountUsd && <div className="flex justify-between"><span>Network fee</span><span>${Number(quote.fees.relayer.amountUsd).toFixed(2)}</span></div>}
        {qErr && <p className="text-down">{qErr}</p>}
      </div>
      <button
        onClick={() => (!address ? ensureWallet().catch(() => {}) : submit())}
        disabled={!!busy || (!!address && (wei === 0n || insufficient || !quote))}
        className="h-14 w-full rounded-2xl bg-accent text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {label}
      </button>
      {msg && <p className={`px-3 pt-2 text-sm ${msg.ok ? "text-up" : "text-down"}`}>{msg.text}</p>}
      {pick && <Picker onPick={choose} onClose={() => setPick(null)} />}
    </div>
  );
}
