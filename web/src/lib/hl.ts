import { ExchangeClient, HttpTransport } from "@nktkas/hyperliquid";
import type { AbstractWallet } from "@nktkas/hyperliquid/signing";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const INFO = "https://api.hyperliquid.xyz/info";
export async function hlInfo<T>(body: object): Promise<T> {
  const r = await fetch(INFO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Hyperliquid ${r.status}`);
  return r.json();
}

export const CATS = ["All", "Crypto", "Stocks", "Indices", "Commodities", "FX", "Pre-IPO"] as const;
export type Cat = (typeof CATS)[number];
const IDX = new Set("XYZ100 SP500 JP225 KR200 NIFTY EWY EWJ EWZ EWT SMH XLE XBI SOXL MAGS TLT DXY VIX IBOV KORU URNM".split(" "));
const COM = new Set("GOLD SILVER CL COPPER NATGAS URANIUM ALUMINIUM PLATINUM PALLADIUM BRENTOIL CORN WHEAT TTF HO".split(" "));
const FX = new Set("JPY EUR GBP KRW".split(" "));
const PRE = new Set("ANT SPCX MINIMAX ZHIPU UNITREE CXMT YMTC SHEIN OURA KSTR".split(" "));
const catOf = (n: string): Cat => (IDX.has(n) ? "Indices" : COM.has(n) ? "Commodities" : FX.has(n) ? "FX" : PRE.has(n) ? "Pre-IPO" : "Stocks");

export type Market = {
  coin: string; name: string; dex: "" | "xyz"; asset: number; szDecimals: number; maxLev: number; isolatedOnly: boolean; cat: Cat;
  mark: number; mid: number; prev: number; change: number; funding: number; vol: number; oi: number;
};

export async function fetchMarkets(): Promise<Market[]> {
  const [[m0, c0], [m1, c1]] = await Promise.all([
    hlInfo<[any, any[]]>({ type: "metaAndAssetCtxs" }),
    hlInfo<[any, any[]]>({ type: "metaAndAssetCtxs", dex: "xyz" }),
  ]);
  const map = (m: any, c: any[], dex: "" | "xyz", base: number): Market[] =>
    m.universe
      .map((u: any, i: number) => ({ u, c: c[i], i }))
      .filter((x: any) => !x.u.isDelisted && x.c && Number(x.c.markPx) > 0)
      .map(({ u, c, i }: any) => {
        const name = String(u.name).replace(/^xyz:/, "");
        const mark = Number(c.markPx) || 0;
        const prev = Number(c.prevDayPx) || 0;
        return {
          coin: u.name, name, dex, asset: base + i, szDecimals: u.szDecimals, maxLev: u.maxLeverage,
          isolatedOnly: !!u.onlyIsolated || u.marginMode === "strictIsolated" || u.marginMode === "noCross",
          cat: dex ? catOf(name) : "Crypto",
          mark, mid: Number(c.midPx) || mark, prev, change: prev ? (mark / prev - 1) * 100 : 0,
          funding: Number(c.funding) || 0, vol: Number(c.dayNtlVlm) || 0, oi: (Number(c.openInterest) || 0) * mark,
        };
      });
  // builder-deployed perp dex assets: 100000 + dexIndex * 10000 + index (xyz is dex 1)
  return [...map(m0, c0, "", 0), ...map(m1, c1, "xyz", 110000)].sort((a, b) => b.vol - a.vol);
}

export type Candle = { t: number; o: string; h: string; l: string; c: string; v: string };
export const fetchCandles = (coin: string, interval: string, ms: number) =>
  hlInfo<Candle[]>({ type: "candleSnapshot", req: { coin, interval, startTime: Date.now() - ms, endTime: Date.now() } });
export type Level = { px: string; sz: string; n: number };
export const fetchBook = (coin: string) => hlInfo<{ levels: [Level[], Level[]] }>({ type: "l2Book", coin });
export type Trade = { side: "B" | "A"; px: string; sz: string; time: number; hash: string; tid: number };
export const fetchTrades = (coin: string) => hlInfo<Trade[]>({ type: "recentTrades", coin });

export type Position = { coin: string; szi: string; entryPx: string; positionValue: string; unrealizedPnl: string; returnOnEquity: string; liquidationPx: string | null; leverage: { type: string; value: number }; marginUsed: string };
export type Account = { marginSummary: { accountValue: string; totalNtlPos: string }; withdrawable: string; assetPositions: { position: Position }[] };
export type OpenOrder = { coin: string; side: "B" | "A"; limitPx: string; sz: string; oid: number; timestamp: number; orderType: string; reduceOnly: boolean; triggerPx: string; isTrigger: boolean };
export async function fetchAccount(user: string) {
  const [a0, a1, o0, o1, agents] = await Promise.all([
    hlInfo<Account>({ type: "clearinghouseState", user }),
    hlInfo<Account>({ type: "clearinghouseState", user, dex: "xyz" }),
    hlInfo<OpenOrder[]>({ type: "frontendOpenOrders", user }),
    hlInfo<OpenOrder[]>({ type: "frontendOpenOrders", user, dex: "xyz" }),
    hlInfo<{ name: string; address: string; validUntil: number }[]>({ type: "extraAgents", user }),
  ]);
  return {
    value: Number(a0.marginSummary.accountValue) + Number(a1.marginSummary.accountValue),
    withdrawable: Number(a0.withdrawable),
    withdrawableXyz: Number(a1.withdrawable),
    positions: [...a0.assetPositions, ...a1.assetPositions].map((p) => p.position).filter((p) => Number(p.szi) !== 0),
    orders: [...o0, ...o1],
    agents: agents.map((a) => a.address.toLowerCase()),
  };
}

const trim = (s: string) => (s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s);
/** Hyperliquid price rules: max 5 significant figures and max (6 - szDecimals) decimals; integers always allowed. */
export function hlPx(x: number, szDecimals: number) {
  if (x >= 1e5) return String(Math.round(x));
  return trim(Number(x.toPrecision(5)).toFixed(Math.max(0, 6 - szDecimals)));
}
export const hlSz = (x: number, d: number) => trim((Math.floor(x * 10 ** d) / 10 ** d).toFixed(d));

const transport = new HttpTransport();
export const hlAgent = (pk: Hex) => new ExchangeClient({ transport, wallet: privateKeyToAccount(pk) });
export const hlUser = (wallet: AbstractWallet) =>
  new ExchangeClient({ transport, wallet, signatureChainId: "0x2105" });
