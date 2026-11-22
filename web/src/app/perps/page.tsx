"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CandlestickSeries, ColorType, createChart, HistogramSeries, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { useAccount, useWalletClient } from "wagmi";
import { CATS, fetchAccount, fetchBook, fetchCandles, fetchMarkets, fetchTrades, hlAgent, hlPx, hlSz, hlUser, type Cat, type Market } from "@/lib/hl";
import { fmtCompact, fmtPrice, shortAddr } from "@/lib/format";
import { TokenAvatar } from "@/components/TokenAvatar";
import { errMsg, useEnsureWallet } from "@/lib/tx";
import { useVault, vaultActions } from "@/lib/vault";

const css = (v: string, fb: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb;
const usd = (n: number) => (Math.abs(n) >= 1e4 ? `$${fmtCompact(n)}` : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
const px = (n: number) => (n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 1 }) : fmtPrice(n));
const SLIP = 0.05;

function CoinIcon({ coin, size = 18 }: { coin: string; size?: number }) {
  const name = coin.replace(/^[a-z]+:/, "");
  const srcs = [coin, ...(/^k[A-Z]/.test(name) ? [name.slice(1)] : [])].map((c) => `https://app.hyperliquid.xyz/coins/${c}.svg`);
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [coin]);
  if (i >= srcs.length) return <TokenAvatar symbol={name.replace(/^k(?=[A-Z])/, "")} size={size} className="!rounded-full" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={srcs[i]} alt="" loading="lazy" width={size} height={size} onError={() => setI((n) => n + 1)} className="shrink-0 rounded-full" style={{ width: size, height: size }} />;
}
const TF = [
  ["1m", 6 * 3600e3],
  ["5m", 24 * 3600e3],
  ["15m", 3 * 86400e3],
  ["1h", 12 * 86400e3],
  ["4h", 45 * 86400e3],
  ["1d", 300 * 86400e3],
] as const;

function Chart({ coin }: { coin: string }) {
  const [tf, setTf] = useState(2);
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const cs = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const vs = useRef<ISeriesApi<"Histogram"> | null>(null);
  const { data } = useQuery({ queryKey: ["hl-candles", coin, tf], queryFn: () => fetchCandles(coin, TF[tf][0], TF[tf][1]), refetchInterval: 10000 });
  useEffect(() => {
    if (!el.current) return;
    const up = css("--color-up", "#2ee6a6"), down = css("--color-down", "#ff5c7a"), line = css("--color-line", "#1c2436"), accent = css("--color-accent-fg", "#3c8aff");
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: css("--color-muted", "#8a93ab"), fontFamily: "var(--font-geist-mono)", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: `${line}80` }, horzLines: { color: `${line}80` } },
      rightPriceScale: { borderColor: line },
      timeScale: { borderColor: line, timeVisible: true },
      crosshair: { vertLine: { color: accent, labelBackgroundColor: accent }, horzLine: { color: accent, labelBackgroundColor: accent } },
    });
    cs.current = c.addSeries(CandlestickSeries, { upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down, priceFormat: { type: "custom", minMove: 1e-9, formatter: px } });
    vs.current = c.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" } });
    c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chart.current = c;
    return () => c.remove();
  }, []);
  useEffect(() => {
    if (!data || !cs.current || !vs.current) return;
    const up = css("--color-up", "#2ee6a6"), down = css("--color-down", "#ff5c7a");
    cs.current.setData(data.map((d) => ({ time: (d.t / 1000) as UTCTimestamp, open: +d.o, high: +d.h, low: +d.l, close: +d.c })));
    vs.current.setData(data.map((d) => ({ time: (d.t / 1000) as UTCTimestamp, value: +d.v, color: +d.c >= +d.o ? `${up}40` : `${down}40` })));
  }, [data]);
  useEffect(() => void chart.current?.timeScale().fitContent(), [coin, tf, !!data]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-0.5 border-b border-line px-2 py-1">
        {TF.map(([l], i) => (
          <button key={l} onClick={() => setTf(i)} className={`h-6 rounded-md px-2 font-mono text-xs ${tf === i ? "bg-panel-2 text-fg" : "text-dim hover:text-fg"}`}>{l}</button>
        ))}
      </div>
      <div ref={el} className="h-[320px] w-full lg:h-auto lg:min-h-[300px] lg:flex-1" />
    </div>
  );
}

function Book({ m, onPx }: { m: Market; onPx: (p: string) => void }) {
  const [tab, setTab] = useState<"book" | "trades">("book");
  const book = useQuery({ queryKey: ["hl-book", m.coin], queryFn: () => fetchBook(m.coin), refetchInterval: 2000, enabled: tab === "book" });
  const trades = useQuery({ queryKey: ["hl-trades", m.coin], queryFn: () => fetchTrades(m.coin), refetchInterval: 3000, enabled: tab === "trades" });
  const [bids, asks] = book.data?.levels ?? [[], []];
  const a = asks.slice(0, 11).reverse();
  const b = bids.slice(0, 11);
  const max = Math.max(1, ...a.map((x) => +x.sz), ...b.map((x) => +x.sz));
  const spread = asks[0] && bids[0] ? +asks[0].px - +bids[0].px : 0;
  const row = (l: { px: string; sz: string }, side: "b" | "a") => (
    <button key={side + l.px} onClick={() => onPx(l.px)} className="relative grid w-full grid-cols-3 px-3 py-[2px] text-right font-mono text-[11px] hover:bg-panel-2">
      <span className={`absolute inset-y-0 right-0 ${side === "b" ? "bg-up/10" : "bg-down/10"}`} style={{ width: `${(+l.sz / max) * 100}%` }} />
      <span className={`relative text-left ${side === "b" ? "text-up" : "text-down"}`}>{px(+l.px)}</span>
      <span className="relative text-muted">{fmtCompact(+l.sz)}</span>
      <span className="relative text-dim">{fmtCompact(+l.sz * +l.px)}</span>
    </button>
  );
  return (
    <div className="flex min-h-0 flex-col border-line lg:w-64 lg:border-l">
      <div className="flex gap-3 border-b border-line px-3 pt-2 text-xs">
        {(["book", "trades"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 pb-1.5 capitalize ${tab === t ? "border-accent text-fg" : "border-transparent text-muted"}`}>{t === "book" ? "Order book" : "Trades"}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 px-3 py-1 text-right text-[10px] text-dim"><span className="text-left">Price</span><span>Size</span><span>Total $</span></div>
      {tab === "book" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          {a.map((l) => row(l, "a"))}
          <div className="flex justify-between border-y border-line px-3 py-1 font-mono text-[11px]"><span className="text-fg">{px(m.mid)}</span><span className="text-dim">spread {px(spread)}</span></div>
          {b.map((l) => row(l, "b"))}
        </div>
      ) : (
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          {trades.data?.slice(0, 40).map((t) => (
            <div key={t.tid} className="grid grid-cols-3 px-3 py-[2px] text-right font-mono text-[11px]">
              <span className={`text-left ${t.side === "B" ? "text-up" : "text-down"}`}>{px(+t.px)}</span>
              <span className="text-muted">{fmtCompact(+t.sz)}</span>
              <span className="text-dim">{new Date(t.time).toLocaleTimeString([], { hour12: false })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function useHlAccount() {
  const { address } = useAccount();
  return useQuery({ queryKey: ["hl-acct", address], queryFn: () => fetchAccount(address!), enabled: !!address, refetchInterval: 5000 });
}

function useAgent() {
  const { address } = useAccount();
  const v = useVault();
  const acct = useHlAccount();
  const agent = address ? v.data?.hl?.[address.toLowerCase()] : undefined;
  const approved = !!agent && !!acct.data?.agents.includes(agent.address.toLowerCase());
  return { agent, approved, vault: v, acct };
}

function OrderForm({ m, limitPx, setLimitPx }: { m: Market; limitPx: string; setLimitPx: (p: string) => void }) {
  const { address } = useAccount();
  const ensure = useEnsureWallet();
  const { data: wc } = useWalletClient();
  const qc = useQueryClient();
  const { agent, approved, vault, acct } = useAgent();
  const [buy, setBuy] = useState(true);
  const [type, setType] = useState<"market" | "limit">("market");
  const [size, setSize] = useState("");
  const [lev, setLev] = useState(5);
  const [reduce, setReduce] = useState(false);
  const [tpsl, setTpsl] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  useEffect(() => setLev((l) => Math.min(l, m.maxLev)), [m.maxLev]);
  const free = m.dex ? acct.data?.withdrawableXyz ?? 0 : acct.data?.withdrawable ?? 0;
  const entry = type === "limit" ? Number(limitPx) || m.mark : m.mark;
  const usdSize = Number(size) || 0;

  const enable = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const owner = await ensure();
      if (!vault.data) throw new Error("Unlock your vault on the Wallets page first");
      if (!wc) throw new Error("Wallet not ready, try again");
      const pk = generatePrivateKey();
      const a = privateKeyToAccount(pk);
      await hlUser(wc).approveAgent({ agentAddress: a.address, agentName: "keelfun" });
      await vaultActions.setHl(owner, { pk, address: a.address });
      await qc.invalidateQueries({ queryKey: ["hl-acct"] });
      setMsg({ ok: true, t: "Trading enabled. Orders now sign with your Keelfun agent key." });
    } catch (e) {
      setMsg({ ok: false, t: errMsg(e) });
    }
    setBusy(false);
  };

  const place = async () => {
    if (!agent) return;
    setMsg(null);
    if (usdSize < 10) return setMsg({ ok: false, t: "Minimum order is $10" });
    if (type === "limit" && !(Number(limitPx) > 0)) return setMsg({ ok: false, t: "Enter a limit price" });
    if (!confirm(`${buy ? "Long" : "Short"} ${m.name} $${usdSize.toFixed(2)} at ${lev}x (${type}) on Hyperliquid mainnet. Perps can be liquidated and you can lose your margin. Continue?`)) return;
    setBusy(true);
    try {
      const c = hlAgent(agent.pk);
      if (!reduce) await c.updateLeverage({ asset: m.asset, isCross: !m.isolatedOnly, leverage: lev });
      const p = type === "market" ? m.mid * (buy ? 1 + SLIP : 1 - SLIP) : Number(limitPx);
      const s = hlSz(usdSize / entry, m.szDecimals);
      if (!(Number(s) > 0)) throw new Error("Size too small");
      const orders: Parameters<typeof c.order>[0]["orders"] = [
        { a: m.asset, b: buy, p: hlPx(p, m.szDecimals), s, r: reduce, t: { limit: { tif: type === "market" ? "FrontendMarket" : "Gtc" } } },
      ];
      const trig = (v: string, kind: "tp" | "sl") => {
        const x = Number(v);
        if (!(x > 0)) return;
        orders.push({ a: m.asset, b: !buy, p: hlPx(x * (buy ? 1 - 0.1 : 1 + 0.1), m.szDecimals), s, r: true, t: { trigger: { isMarket: true, triggerPx: hlPx(x, m.szDecimals), tpsl: kind } } });
      };
      if (tpsl && !reduce) (trig(tp, "tp"), trig(sl, "sl"));
      const r = await c.order({ orders, grouping: orders.length > 1 ? "normalTpsl" : "na" });
      const st = r.response.data.statuses[0] as { filled?: { totalSz: string; avgPx: string }; resting?: { oid: number } };
      setMsg({ ok: true, t: st.filled ? `Filled ${st.filled.totalSz} ${m.name} @ ${px(+st.filled.avgPx)}` : `Order placed${st.resting ? ` (#${st.resting.oid})` : ""}` });
      setSize("");
      qc.invalidateQueries({ queryKey: ["hl-acct"] });
    } catch (e) {
      setMsg({ ok: false, t: errMsg(e) });
    }
    setBusy(false);
  };

  const input = "w-full bg-transparent font-mono text-sm outline-none";
  return (
    <div className="flex flex-col gap-3 p-3 lg:w-72 lg:border-l lg:border-line">
      <div className="grid grid-cols-2 rounded-lg border border-line p-0.5 text-sm font-semibold">
        <button onClick={() => setBuy(true)} className={`rounded-md py-1.5 ${buy ? "bg-up/20 text-up" : "text-muted"}`}>Long</button>
        <button onClick={() => setBuy(false)} className={`rounded-md py-1.5 ${!buy ? "bg-down/20 text-down" : "text-muted"}`}>Short</button>
      </div>
      <div className="flex gap-3 text-xs">
        {(["market", "limit"] as const).map((t) => (
          <button key={t} onClick={() => setType(t)} className={`capitalize ${type === t ? "text-fg" : "text-muted hover:text-fg"}`}>{t}</button>
        ))}
        <span className="ml-auto text-dim">{m.isolatedOnly ? "Isolated" : "Cross"}</span>
      </div>
      {type === "limit" && (
        <label className="flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2 focus-within:border-accent">
          <span className="text-xs text-dim">Price</span>
          <input value={limitPx} onChange={(e) => setLimitPx(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder={px(m.mid)} className={input} />
          <button onClick={() => setLimitPx(hlPx(m.mid, m.szDecimals))} className="text-[11px] text-accent-fg">Mid</button>
        </label>
      )}
      <label className="flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2 focus-within:border-accent">
        <span className="text-xs text-dim">Size</span>
        <input value={size} onChange={(e) => setSize(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0" className={input} />
        <span className="text-xs text-dim">USD</span>
      </label>
      <div className="grid grid-cols-4 gap-1">
        {[25, 50, 75, 100].map((p) => (
          <button key={p} onClick={() => setSize(((free * lev * p) / 100).toFixed(2))} className="rounded-md border border-line py-1 font-mono text-[11px] text-muted hover:text-fg">{p}%</button>
        ))}
      </div>
      <div>
        <div className="flex justify-between text-xs"><span className="text-muted">Leverage</span><span className="font-mono">{lev}x</span></div>
        <input type="range" min={1} max={m.maxLev} value={lev} onChange={(e) => setLev(Number(e.target.value))} className="mt-1 w-full accent-[var(--color-accent)]" />
      </div>
      <div className="flex gap-4 text-xs">
        <label className="flex items-center gap-1.5 text-muted"><input type="checkbox" checked={reduce} onChange={(e) => setReduce(e.target.checked)} />Reduce only</label>
        <label className="flex items-center gap-1.5 text-muted"><input type="checkbox" checked={tpsl} onChange={(e) => setTpsl(e.target.checked)} />TP / SL</label>
      </div>
      {tpsl && !reduce && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-1 rounded-lg border border-line bg-bg px-2 py-1.5"><span className="text-[11px] text-up">TP</span><input value={tp} onChange={(e) => setTp(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className={input} /></label>
          <label className="flex items-center gap-1 rounded-lg border border-line bg-bg px-2 py-1.5"><span className="text-[11px] text-down">SL</span><input value={sl} onChange={(e) => setSl(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className={input} /></label>
        </div>
      )}
      <div className="space-y-1 font-mono text-[11px] text-dim">
        <div className="flex justify-between"><span>Available</span><span className="text-muted">{usd(free)}</span></div>
        <div className="flex justify-between"><span>Margin required</span><span className="text-muted">{usd(usdSize / lev)}</span></div>
        <div className="flex justify-between"><span>Size</span><span className="text-muted">{usdSize ? hlSz(usdSize / entry, m.szDecimals) : "0"} {m.name}</span></div>
      </div>
      {!address ? (
        <button onClick={() => ensure().catch((e) => setMsg({ ok: false, t: errMsg(e) }))} className="rounded-lg bg-accent py-2.5 text-sm font-semibold text-white">Connect wallet</button>
      ) : !vault.data ? (
        <Link href="/wallets/" className="rounded-lg bg-accent py-2.5 text-center text-sm font-semibold text-white">{vault.exists ? "Unlock vault to trade" : "Set up wallets to trade"}</Link>
      ) : !approved ? (
        <button disabled={busy} onClick={enable} className="rounded-lg bg-accent py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Confirm in wallet…" : "Enable trading"}</button>
      ) : (
        <button disabled={busy} onClick={place} className={`rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${buy ? "bg-up" : "bg-down"}`}>
          {busy ? "Placing…" : `${buy ? "Long" : "Short"} ${m.name}`}
        </button>
      )}
      {msg && <p className={`break-words text-xs ${msg.ok ? "text-up" : "text-down"}`}>{msg.t}</p>}
      <p className="text-[11px] leading-relaxed text-dim">
        Trades on your Hyperliquid account ({address ? shortAddr(address) : "connected wallet"}). Enable trading approves a Keelfun agent key, stored encrypted in your vault, that can place orders but cannot withdraw. Fund it with USDC on{" "}
        <a href="https://app.hyperliquid.xyz/portfolio" target="_blank" rel="noreferrer" className="text-accent-fg">Hyperliquid ↗</a>. Perps are high risk.
      </p>
    </div>
  );
}

function AccountPanel({ markets, onPick }: { markets: Market[]; onPick: (coin: string) => void }) {
  const [tab, setTab] = useState<"pos" | "ord">("pos");
  const { address } = useAccount();
  const { agent, approved, acct } = useAgent();
  const qc = useQueryClient();
  const [err, setErr] = useState("");
  const byCoin = useMemo(() => new Map(markets.map((m) => [m.coin, m])), [markets]);
  const run = async (f: (c: ReturnType<typeof hlAgent>) => Promise<unknown>) => {
    if (!agent || !approved) return setErr("Enable trading first");
    setErr("");
    try {
      await f(hlAgent(agent.pk));
      qc.invalidateQueries({ queryKey: ["hl-acct"] });
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  const d = acct.data;
  return (
    <div className="border-t border-line">
      <div className="flex items-center gap-4 border-b border-line px-3 pt-2 text-xs">
        <button onClick={() => setTab("pos")} className={`-mb-px border-b-2 pb-1.5 ${tab === "pos" ? "border-accent text-fg" : "border-transparent text-muted"}`}>Positions {d ? `(${d.positions.length})` : ""}</button>
        <button onClick={() => setTab("ord")} className={`-mb-px border-b-2 pb-1.5 ${tab === "ord" ? "border-accent text-fg" : "border-transparent text-muted"}`}>Open orders {d ? `(${d.orders.length})` : ""}</button>
        {d && <span className="ml-auto pb-1.5 font-mono text-dim">Account value <span className="text-fg">{usd(d.value)}</span></span>}
      </div>
      {err && <p className="px-3 py-1 text-xs text-down">{err}</p>}
      <div className="max-h-56 overflow-auto">
        {!address ? (
          <p className="p-6 text-center text-xs text-dim">Connect a wallet to see positions.</p>
        ) : tab === "pos" ? (
          <table className="w-full min-w-[640px] text-right font-mono text-[11px]">
            <thead className="text-dim"><tr>{["Market", "Size", "Value", "Entry", "Mark", "PnL (ROE)", "Liq.", ""].map((h, i) => <th key={i} className={`px-3 py-1.5 font-normal ${i === 0 ? "text-left" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>
              {d?.positions.map((p) => {
                const m = byCoin.get(p.coin);
                const long = Number(p.szi) > 0;
                const pnl = Number(p.unrealizedPnl);
                return (
                  <tr key={p.coin} className="border-t border-line">
                    <td className="px-3 py-1.5 text-left"><button onClick={() => onPick(p.coin)} className={`inline-flex items-center gap-1.5 ${long ? "text-up" : "text-down"}`}><CoinIcon coin={p.coin} size={16} />{p.coin.replace(/^xyz:/, "")} {p.leverage.value}x</button></td>
                    <td className="px-3">{Math.abs(+p.szi)}</td>
                    <td className="px-3">{usd(+p.positionValue)}</td>
                    <td className="px-3">{px(+p.entryPx)}</td>
                    <td className="px-3">{m ? px(m.mark) : "—"}</td>
                    <td className={`px-3 ${pnl >= 0 ? "text-up" : "text-down"}`}>{usd(pnl)} ({(Number(p.returnOnEquity) * 100).toFixed(1)}%)</td>
                    <td className="px-3">{p.liquidationPx ? px(+p.liquidationPx) : "—"}</td>
                    <td className="px-3">
                      {m && (
                        <button
                          onClick={() => run((c) => c.order({ orders: [{ a: m.asset, b: !long, p: hlPx(m.mid * (long ? 1 - SLIP : 1 + SLIP), m.szDecimals), s: String(Math.abs(+p.szi)), r: true, t: { limit: { tif: "FrontendMarket" } } }], grouping: "na" }))}
                          className="rounded border border-line px-2 py-0.5 text-muted hover:text-fg"
                        >
                          Close
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {d && !d.positions.length && <tr><td colSpan={8} className="p-6 text-center text-dim">No open positions.</td></tr>}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[560px] text-right font-mono text-[11px]">
            <thead className="text-dim"><tr>{["Market", "Type", "Side", "Size", "Price", "Trigger", ""].map((h, i) => <th key={i} className={`px-3 py-1.5 font-normal ${i === 0 ? "text-left" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>
              {d?.orders.map((o) => {
                const m = byCoin.get(o.coin);
                return (
                  <tr key={o.oid} className="border-t border-line">
                    <td className="px-3 py-1.5 text-left"><span className="inline-flex items-center gap-1.5"><CoinIcon coin={o.coin} size={16} />{o.coin.replace(/^xyz:/, "")}</span></td>
                    <td className="px-3">{o.orderType}{o.reduceOnly ? " · RO" : ""}</td>
                    <td className={`px-3 ${o.side === "B" ? "text-up" : "text-down"}`}>{o.side === "B" ? "Long" : "Short"}</td>
                    <td className="px-3">{o.sz}</td>
                    <td className="px-3">{px(+o.limitPx)}</td>
                    <td className="px-3">{o.isTrigger ? px(+o.triggerPx) : "—"}</td>
                    <td className="px-3">{m && <button onClick={() => run((c) => c.cancel({ cancels: [{ a: m.asset, o: o.oid }] }))} className="rounded border border-line px-2 py-0.5 text-muted hover:text-fg">Cancel</button>}</td>
                  </tr>
                );
              })}
              {d && !d.orders.length && <tr><td colSpan={7} className="p-6 text-center text-dim">No open orders.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function PerpsPage() {
  const { data: markets, error } = useQuery({ queryKey: ["hl-markets"], queryFn: fetchMarkets, refetchInterval: 5000 });
  const [coin, setCoin] = useState("BTC");
  const [cat, setCat] = useState<Cat>("All");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [limitPx, setLimitPx] = useState("");
  const m = markets?.find((x) => x.coin === coin);
  const list = (markets ?? []).filter((x) => (cat === "All" || x.cat === cat) && x.name.toLowerCase().includes(q.toLowerCase()));
  useEffect(() => setLimitPx(""), [coin]);
  return (
    <div className="relative left-1/2 -mb-20 w-screen -translate-x-1/2 border-t border-line lg:pb-8">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-3 py-2">
        <div className="flex rounded-lg border border-line p-0.5 text-xs">
          <span className="rounded-md bg-panel-2 px-2.5 py-1">Perps</span>
          <span className="cursor-not-allowed px-2.5 py-1 text-dim" title="Coming soon">Predictions</span>
        </div>
        <div className="relative">
          <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-lg font-bold">
            <CoinIcon coin={coin} size={24} />
            {m?.name ?? coin}-USD <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] font-normal text-muted">{m ? `${m.maxLev}x` : ""}</span> <span className="text-xs text-muted">▾</span>
          </button>
          {open && (
            <div className="absolute left-0 top-full z-50 mt-2 w-[min(92vw,640px)] max-sm:fixed max-sm:inset-x-2 max-sm:top-12 max-sm:mt-0 max-sm:w-auto rounded-xl border border-line bg-panel shadow-2xl">
              <div className="flex flex-wrap items-center gap-2 border-b border-line p-2">
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${markets?.length ?? ""} markets`} className="h-8 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 text-sm outline-none focus:border-accent" />
                <div className="no-scrollbar flex gap-1 overflow-x-auto">
                  {CATS.map((c) => (
                    <button key={c} onClick={() => setCat(c)} className={`shrink-0 rounded-md px-2 py-1 text-xs ${cat === c ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}>{c}</button>
                  ))}
                </div>
              </div>
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full text-right font-mono text-xs">
                  <thead className="sticky top-0 bg-panel text-dim"><tr>{["Market", "Price", "24h", "Funding", "Volume", "OI"].map((h, i) => <th key={h} className={`px-3 py-1.5 font-normal ${i === 0 ? "text-left" : ""} ${i > 3 ? "hidden sm:table-cell" : ""}`}>{h}</th>)}</tr></thead>
                  <tbody>
                    {list.map((x) => (
                      <tr key={x.coin} onClick={() => (setCoin(x.coin), setOpen(false))} className="cursor-pointer border-t border-line hover:bg-panel-2">
                        <td className="px-3 py-1.5 text-left"><span className="inline-flex items-center gap-2"><CoinIcon coin={x.coin} /><span className="text-fg">{x.name}</span></span> <span className="text-[10px] text-dim">{x.maxLev}x{x.dex ? " · " + x.cat : ""}</span></td>
                        <td className="px-3">{px(x.mark)}</td>
                        <td className={`px-3 ${x.change >= 0 ? "text-up" : "text-down"}`}>{x.change >= 0 ? "+" : ""}{x.change.toFixed(2)}%</td>
                        <td className="px-3 text-muted">{(x.funding * 100).toFixed(4)}%</td>
                        <td className="hidden px-3 text-muted sm:table-cell">{usd(x.vol)}</td>
                        <td className="hidden px-3 text-muted sm:table-cell">{usd(x.oi)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        {m && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs">
            <span className="text-base text-fg">{px(m.mark)}</span>
            <span><span className="text-dim">24h </span><span className={m.change >= 0 ? "text-up" : "text-down"}>{m.change >= 0 ? "+" : ""}{m.change.toFixed(2)}%</span></span>
            <span><span className="text-dim">Funding </span><span className={m.funding >= 0 ? "text-up" : "text-down"}>{(m.funding * 100).toFixed(4)}%</span></span>
            <span><span className="text-dim">Vol </span>{usd(m.vol)}</span>
            <span><span className="text-dim">OI </span>{usd(m.oi)}</span>
          </div>
        )}
      </div>
      {error && !markets && <p className="p-6 text-center text-sm text-down">{errMsg(error)}</p>}
      {!markets && !error && <p className="p-10 text-center text-sm text-dim">Loading Hyperliquid markets…</p>}
      {m && markets && (
        <div className="flex flex-col lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col lg:min-h-[calc(100dvh-12rem)]">
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <Chart key={m.coin} coin={m.coin} />
              <Book m={m} onPx={setLimitPx} />
            </div>
            <AccountPanel markets={markets} onPick={setCoin} />
          </div>
          <OrderForm m={m} limitPx={limitPx} setLimitPx={setLimitPx} />
        </div>
      )}
    </div>
  );
}
