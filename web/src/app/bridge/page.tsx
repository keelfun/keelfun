"use client";
import { useEffect, useState } from "react";
import { formatEther, isAddress, parseEther } from "viem";
import { useAccount, useBalance, useConnect, useSendTransaction, useSwitchChain } from "wagmi";
import { Em, Faq, PageHero } from "@/components/PageHero";
import { chain, RPC_URL } from "@/lib/config";
import { errMsg } from "@/lib/tx";
import { BRIDGE_CHAINS, wagmiConfig } from "@/lib/wagmi";

type Cid = (typeof wagmiConfig)["chains"][number]["id"];
const RELAY = "https://api.relay.link";
const SLUG: Record<number, string> = { 1: "ethereum", 42161: "arbitrum", 10: "optimism", 59144: "linea", 8453: "base", 84532: "base" };
const logo = (id: number) => `https://icons.llamao.fi/icons/chains/rsz_${SLUG[id] ?? "base"}.jpg`;
const Logo = ({ id, size = 20 }: { id: number; size?: number }) => (
  <img src={logo(id)} alt="" width={size} height={size} className="shrink-0 rounded-full" style={{ width: size, height: size }} />
);
const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dEaD";

type Quote = {
  requestId?: string;
  message?: string;
  steps: { kind: string; items: { data: { to: `0x${string}`; data: `0x${string}`; value?: string; chainId: number } }[] }[];
  details?: { currencyOut?: { amountFormatted?: string }; timeEstimate?: number };
  fees?: { relayer?: { amountFormatted?: string; amountUsd?: string } };
};

async function getQuote(user: string, recipient: string, from: number, to: number, wei: string, signal?: AbortSignal) {
  const r = await fetch(`${RELAY}/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      user, recipient, originChainId: from, destinationChainId: to,
      originCurrency: ZERO, destinationCurrency: ZERO, amount: wei, tradeType: "EXACT_INPUT",
    }),
  });
  const q = (await r.json()) as Quote;
  if (!r.ok) throw new Error(q.message || "No route for this amount");
  return q;
}

const num = (s?: string, d = 6) => (s ? Number(s).toLocaleString(undefined, { maximumFractionDigits: d }) : "–");

export default function BridgePage() {
  const { address, chainId, isConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const [dir, setDir] = useState<"in" | "out">("in");
  const [other, setOther] = useState<number>(BRIDGE_CHAINS[1].id);
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [qErr, setQErr] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null);

  const otherName = BRIDGE_CHAINS.find((c) => c.id === other)!.name;
  const from = dir === "in" ? other : chain.id;
  const dest = dir === "in" ? chain.id : other;
  const fromName = dir === "in" ? otherName : chain.name;
  const destName = dir === "in" ? chain.name : otherName;
  const bal = useBalance({ address, chainId: from as Cid, query: { enabled: !!address, refetchInterval: 10_000 } });
  let wei = 0n;
  try {
    wei = amount && Number(amount) > 0 ? parseEther(amount as `${number}`) : 0n;
  } catch {}
  const weiStr = wei.toString();
  const recipient = to.trim() || address || "";
  const badTo = !!to.trim() && !isAddress(to.trim());

  useEffect(() => {
    setQuote(null);
    setQErr("");
    if (weiStr === "0" || badTo) return;
    const user = address ?? DEAD;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      getQuote(user, isAddress(recipient) ? recipient : user, from, dest, weiStr, ctl.signal)
        .then(setQuote)
        .catch((e) => !ctl.signal.aborted && setQErr(errMsg(e)));
    }, 400);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [weiStr, from, dest, address, recipient, badTo]);

  async function go() {
    setMsg(null);
    let hash = "";
    try {
      let addr = address;
      if (!isConnected || !addr) {
        const c = connectors[0];
        if (!c) throw new Error("No wallet found. Install MetaMask, Rabby or another browser wallet.");
        addr = (await connectAsync({ connector: c })).accounts[0];
      }
      setBusy("Getting a fresh quote…");
      const q = await getQuote(addr!, to.trim() || addr!, from, dest, weiStr);
      if (chainId !== from) {
        setBusy(`Switch to ${fromName} in your wallet…`);
        await switchChainAsync({ chainId: from as Cid });
      }
      for (const s of q.steps) {
        if (s.kind !== "transaction") continue;
        for (const it of s.items) {
          setBusy("Confirm in your wallet…");
          hash = await sendTransactionAsync({
            to: it.data.to, data: it.data.data, value: BigInt(it.data.value || "0"), chainId: it.data.chainId as Cid,
          });
        }
      }
      const link = `https://relay.link/transaction/${hash}`;
      setBusy(`Bridging to ${destName}…`);
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const st = (await fetch(`${RELAY}/intents/status/v2?requestId=${q.requestId}`).then((r) => r.json()).catch(() => ({}))) as { status?: string };
        if (st.status === "success") {
          setMsg({ ok: true, text: `Arrived on ${destName}.`, link });
          setAmount("");
          return;
        }
        if (st.status === "failure" || st.status === "refund")
          throw new Error(st.status === "refund" ? "The bridge refunded your funds" : "The bridge failed");
      }
      setMsg({ ok: true, text: "Sent. It's still on its way; track it on Relay.", link });
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e), link: hash ? `https://relay.link/transaction/${hash}` : undefined });
    } finally {
      setBusy("");
    }
  }

  const balEth = bal.data ? Number(formatEther(bal.data.value)) : null;
  const tooMuch = bal.data ? wei > bal.data.value : false;
  const label = busy || (!isConnected ? "Connect wallet" : wei === 0n ? "Enter an amount" : tooMuch ? `Not enough ETH on ${fromName}` : qErr ? "No route" : !quote ? "Getting a quote…" : `Bridge to ${destName}`);
  const disabled = !!busy || (isConnected && (wei === 0n || tooMuch || !quote || badTo));

  return (
    <div>
      <PageHero title={<>The <Em>bridge</Em></>} sub={`Bring ETH from another chain. One signature puts it on ${chain.name}, usually in under a minute.`} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <div className="mb-4 flex gap-1 border-b border-line">
            {(["in", "out"] as const).map((d) => (
              <button key={d} onClick={() => setDir(d)} className={`-mb-px border-b-2 px-3 pb-2 text-sm ${dir === d ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"}`}>
                {d === "in" ? "Deposit" : "Withdraw"}
              </button>
            ))}
          </div>
          <p className="mb-2 text-xs text-dim">{dir === "in" ? "From" : "To"} chain</p>
          <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
            {BRIDGE_CHAINS.map((c) => (
              <button key={c.id} onClick={() => setOther(c.id)} className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${other === c.id ? "border-accent/60 bg-accent/10 text-fg" : "border-line text-muted hover:text-fg"}`}>
                <Logo id={c.id} />
                {c.name}
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-line bg-bg/60 p-4">
            <div className="flex items-center justify-between text-xs text-dim">
              <span className="flex items-center gap-1.5"><Logo id={from} size={16} />From {fromName}</span>
              {balEth != null && (
                <button onClick={() => setAmount(String(Math.max(0, balEth * 0.98).toFixed(6)))} className="hover:text-fg">
                  Balance {num(String(balEth), 5)} ETH · Max
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" inputMode="decimal" className="min-w-0 flex-1 bg-transparent font-serif text-4xl outline-none placeholder:text-dim" />
              <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-panel-2 py-1 pl-1 pr-3 text-sm font-medium"><Logo id={1} size={24} />ETH</span>
            </div>
          </div>
          <div className="my-2 text-center text-dim">↓</div>
          <div className="rounded-xl border border-line bg-bg/60 p-4">
            <p className="flex items-center gap-1.5 text-xs text-dim"><Logo id={dest} size={16} />To {destName}</p>
            <div className="mt-2 flex items-center gap-3">
              <p className="min-w-0 flex-1 truncate font-serif text-4xl text-fg/90">{quote ? num(quote.details?.currencyOut?.amountFormatted) : "0"}</p>
              <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-panel-2 py-1 pl-1 pr-3 text-sm font-medium"><Logo id={1} size={24} />ETH</span>
            </div>
          </div>
          <label className="mt-4 block text-xs text-dim">
            Recipient on {destName} <span className="text-dim/70">(optional, defaults to your wallet)</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={address ?? "0x…"} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-bg/60 px-3 font-mono text-sm text-fg outline-none placeholder:text-dim focus:border-accent/50" />
          </label>
          {badTo && <p className="mt-1 text-xs text-down">That isn&apos;t a valid address.</p>}
          <div className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted">Fee</span><span>{quote?.fees?.relayer ? `${num(quote.fees.relayer.amountFormatted)} ETH ($${num(quote.fees.relayer.amountUsd, 2)})` : "–"}</span></div>
            <div className="flex justify-between"><span className="text-muted">Time</span><span>{quote?.details?.timeEstimate != null ? `about ${Math.max(1, quote.details.timeEstimate)}s` : "–"}</span></div>
            <div className="flex justify-between"><span className="text-muted">Route</span><span>Relay</span></div>
          </div>
          {qErr && <p className="mt-3 text-xs text-down">{qErr}</p>}
          <button onClick={go} disabled={disabled} className="mt-4 h-11 w-full rounded-lg bg-fg text-sm font-medium text-bg hover:bg-white disabled:opacity-50">
            {label}
          </button>
          {msg && (
            <p className={`mt-3 text-sm ${msg.ok ? "text-up" : "text-down"}`}>
              {msg.text}{" "}
              {msg.link && <a href={msg.link} target="_blank" rel="noreferrer" className="underline">View on Relay</a>}
            </p>
          )}
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-panel p-4 text-sm">
            <p className="flex items-center gap-2 font-medium"><Logo id={chain.id} />{chain.name} in your wallet</p>
            <p className="mt-1 text-muted">Most wallets already have {chain.name}. If yours doesn&apos;t, add it with these details.</p>
            <dl className="mt-3 space-y-1.5 font-mono text-xs">
              <div className="flex justify-between gap-3"><dt className="text-dim">RPC</dt><dd className="truncate">{RPC_URL}</dd></div>
              <div className="flex justify-between"><dt className="text-dim">Chain ID</dt><dd>{chain.id}</dd></div>
              <div className="flex justify-between"><dt className="text-dim">Currency</dt><dd>ETH</dd></div>
            </dl>
            <button onClick={() => navigator.clipboard.writeText(RPC_URL)} className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-fg">Copy the RPC URL</button>
          </div>
          <div className="rounded-2xl border border-line bg-panel p-4 text-sm">
            <p className="font-medium">How it works</p>
            <ol className="mt-2 space-y-2 text-muted">
              <li>1 · You send ETH on the chain you&apos;re leaving, in one transaction.</li>
              <li>2 · Relay&apos;s solvers pay you out on the other side, usually within seconds.</li>
              <li>3 · Your ETH is in your own wallet, ready to launch or trade.</li>
            </ol>
          </div>
        </div>
      </div>
      <section className="mt-16 grid gap-8 lg:grid-cols-[1fr_2fr]">
        <h2 className="font-serif text-4xl">Questions</h2>
        <Faq
          items={[
            ["Does Keel hold my money?", "No. You sign the transaction from your own wallet and Relay delivers the ETH to the address you chose. Keel never takes custody of it."],
            ["How long does it take?", "Usually seconds to a minute in both directions. If a route fails, Relay refunds you on the chain you sent from."],
            ["Can I send from an exchange?", "Withdraw ETH from the exchange straight to your wallet on Base. Most exchanges support Base withdrawals, so you may not need a bridge at all."],
            ["What does it cost?", "The fee shown above, plus the gas of the transaction you sign. Keel adds nothing on top."],
          ]}
        />
      </section>
    </div>
  );
}
