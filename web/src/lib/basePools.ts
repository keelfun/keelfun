import { erc20Abi } from "viem";
import { vaultPublic } from "./vault";
import { NETS, normAddr, type Net } from "./net";
export type BasePool = {
  net: Net; pool: string; dex: string; createdAt: number; quote: string;
  token: { address: string; symbol: string; name: string; image: string | null; decimals: number };
  priceUsd: number; mcUsd: number; liqUsd: number; vol24: number; chg5m: number; chg1h: number; chg6h: number; chg24: number; buys: number; sells: number; traders: number;
};

const GT = "https://api.geckoterminal.com/api/v2";
const PATHS: Record<string, (g: string) => string> = {
  new: (g) => `/networks/${g}/new_pools?include=base_token,dex`,
  trending: (g) => `/networks/${g}/trending_pools?include=base_token,dex`,
  top: (g) => `/networks/${g}/pools?sort=h24_volume_usd_desc&include=base_token,dex`,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type GtPool = { attributes: Record<string, any>; relationships: Record<string, { data?: { id: string } }> };
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

const inflight = new Map<string, Promise<unknown>>();
const ttl = (path: string) => (path.includes("/ohlcv/") ? 60_000 : path.endsWith("/trades") ? 20_000 : path.includes("/pools/") ? 30_000 : 45_000);
const LIMIT = 24; // GeckoTerminal free tier is ~30 req/min per IP; stay under it across all tabs
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function store<T>(k: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(k) || "null");
  } catch {
    return null;
  }
}
function put(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    for (const x of Object.keys(localStorage)) if (x.startsWith("gt:/")) localStorage.removeItem(x);
  }
}
/** Waits for a slot in the shared per-minute budget; false if none frees up soon. */
async function slot(): Promise<boolean> {
  for (let i = 0; i < 4; i++) {
    const now = Date.now();
    if ((store<number>("gt:backoff") ?? 0) > now) return false;
    const recent = (store<number[]>("gt:calls") ?? []).filter((t) => now - t < 60_000);
    if (recent.length < LIMIT) {
      put("gt:calls", [...recent, now]);
      return true;
    }
    await sleep(Math.min(3000, recent[0] + 60_000 - now));
  }
  return false;
}

async function gt<T>(path: string, fallback?: () => Promise<T>): Promise<T> {
  const key = `gt:${path}`;
  const cached = store<{ t: number; v: T }>(key);
  if (cached && Date.now() - cached.t < ttl(path)) return cached.v;
  if (inflight.has(path)) return inflight.get(path) as Promise<T>;
  const job = (async () => {
    let r: Response | null = null;
    if (await slot()) {
      try {
        r = await fetch(`${GT}${path}`, { headers: { accept: "application/json" } });
      } catch {}
      if (r?.status === 429) put("gt:backoff", Date.now() + 30_000);
    }
    if (!r?.ok) {
      if (fallback) {
        try {
          const v = await fallback();
          put(key, { t: Date.now(), v });
          return v;
        } catch {}
      }
      if (cached) return cached.v;
      throw new Error(!r || r.status === 429 ? "Rate limited, retrying…" : r.status === 404 ? "Not found" : "Data source busy, retrying…");
    }
    const v = (await r.json()) as T;
    put(key, { t: Date.now(), v });
    return v;
  })().finally(() => inflight.delete(path));
  inflight.set(path, job);
  return job;
}

/* DexScreener (300 req/min) as a fallback when GeckoTerminal is rate limited. */
const DS = "https://api.dexscreener.com";
type DsPair = Record<string, any>;
async function ds<T>(path: string): Promise<T> {
  const r = await fetch(`${DS}${path}`);
  if (!r.ok) throw new Error(`dexscreener ${r.status}`);
  return r.json();
}
/** Converts DexScreener pairs into the GeckoTerminal list shape so normalize() handles both. */
function dsToGt(pairs: DsPair[], net: Net = "base"): GtList {
  const pre = NETS[net].gt;
  const included: { id: string; attributes: Record<string, any> }[] = [];
  const data = pairs
    .filter((p) => p.chainId === NETS[net].ds)
    .map((p): GtPool => {
      const bt = p.baseToken ?? {};
      const qt = p.quoteToken ?? {};
      const bid = `${pre}_${normAddr(String(bt.address))}`;
      const qid = `${pre}_${normAddr(String(qt.address))}`;
      included.push({ id: bid, attributes: { address: bt.address, symbol: bt.symbol, name: bt.name, image_url: p.info?.imageUrl ?? null } });
      included.push({ id: qid, attributes: { address: qt.address, symbol: qt.symbol, name: qt.name, image_url: null } });
      const lbl = (p.labels?.[0] ?? "").toLowerCase();
      const dex = p.dexId === "uniswap" && lbl ? `uniswap-${lbl}-${pre}` : p.dexId === "aerodrome" ? "aerodrome-base" : String(p.dexId);
      return {
        attributes: {
          address: normAddr(String(p.pairAddress)),
          name: `${bt.symbol} / ${qt.symbol}`,
          pool_created_at: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : null,
          base_token_price_usd: p.priceUsd,
          market_cap_usd: p.marketCap,
          fdv_usd: p.fdv,
          reserve_in_usd: p.liquidity?.usd,
          volume_usd: p.volume,
          price_change_percentage: p.priceChange,
          transactions: p.txns,
        },
        relationships: { base_token: { data: { id: bid } }, quote_token: { data: { id: qid } }, dex: { data: { id: dex } } },
      };
    });
  return { data, included };
}

type GtList = { data?: GtPool[]; included?: { id: string; attributes: Record<string, any> }[] };

/** DexScreener has no per-chain pool feed; build one from its boosted/latest token lists for that chain. */
async function dsList(kind: string, net: Net): Promise<GtList> {
  const c = NETS[net].ds;
  const lists = await Promise.all(
    (kind === "new" ? ["/token-profiles/latest/v1", "/token-boosts/latest/v1"] : ["/token-boosts/top/v1", "/token-boosts/latest/v1", "/token-profiles/latest/v1"]).map((u) =>
      ds<{ chainId: string; tokenAddress: string }[]>(u).catch(() => [])
    )
  );
  const addrs = [...new Set(lists.flat().filter((x) => x.chainId === c).map((x) => x.tokenAddress))].slice(0, 30);
  if (!addrs.length) return { data: [], included: [] };
  const pairs = await ds<DsPair[]>(`/tokens/v1/${c}/${addrs.join(",")}`);
  const best = new Map<string, DsPair>();
  for (const x of pairs) {
    const k = String(x.baseToken?.address);
    if (!addrs.includes(k)) continue;
    if ((best.get(k)?.liquidity?.usd ?? -1) < (x.liquidity?.usd ?? 0)) best.set(k, x);
  }
  const score = (x: DsPair) => (kind === "new" ? x.pairCreatedAt ?? 0 : kind === "top" ? x.volume?.h24 ?? 0 : (x.txns?.h1?.buys ?? 0) + (x.txns?.h1?.sells ?? 0));
  return dsToGt([...best.values()].sort((a, b) => score(b) - score(a)), net);
}

export async function fetchBasePools(kind: string, q = "", duration = "1h", net: Net = "base"): Promise<BasePool[]> {
  const g = NETS[net].gt;
  const path = q ? `/search/pools?query=${encodeURIComponent(q)}&network=${g}&include=base_token,dex` : `${PATHS[kind](g)}${kind === "trending" ? `&duration=${duration}` : ""}`;
  return normalize(await gt<GtList>(path, q ? async () => dsToGt((await ds<{ pairs?: DsPair[] }>(`/latest/dex/search?q=${encodeURIComponent(q)}`)).pairs ?? [], net) : () => dsList(kind, net)), net);
}

function normalize(j: GtList, net: Net = "base"): BasePool[] {
  const inc = new Map((j.included ?? []).map((x) => [x.id, x.attributes]));
  const seen = new Set<string>();
  return (j.data ?? [])
    .map((p) => {
      const a = p.attributes;
      const bid = p.relationships.base_token?.data?.id ?? "";
      const bt = inc.get(bid) ?? {};
      const tx = a.transactions?.h24 ?? {};
      const [base, quote] = String(a.name ?? "").split(" / ");
      return {
        net,
        pool: normAddr(String(a.address)),
        dex: p.relationships.dex?.data?.id ?? "",
        createdAt: Math.floor(Date.parse(a.pool_created_at) / 1000) || 0,
        quote: (quote ?? "").split(" ")[0],
        token: {
          address: normAddr(String(bt.address ?? bid.replace(/^[a-z0-9-]+_/, ""))),
          symbol: String(bt.symbol ?? base ?? "?"),
          name: String(bt.name ?? base ?? ""),
          image: bt.image_url && !String(bt.image_url).includes("missing") ? String(bt.image_url) : null,
          decimals: num(bt.decimals) || (net === "solana" ? 6 : 18),
        },
        priceUsd: num(a.base_token_price_usd),
        mcUsd: num(a.market_cap_usd) || num(a.fdv_usd),
        liqUsd: num(a.reserve_in_usd),
        vol24: num(a.volume_usd?.h24),
        chg5m: num(a.price_change_percentage?.m5),
        chg1h: num(a.price_change_percentage?.h1),
        chg6h: num(a.price_change_percentage?.h6),
        chg24: num(a.price_change_percentage?.h24),
        buys: num(tx.buys),
        sells: num(tx.sells),
        traders: num(tx.buyers) + num(tx.sellers),
      };
    })
    .filter((p) => (seen.has(p.token.address) ? false : (seen.add(p.token.address), true)));
}

export type PoolDetail = BasePool & { quoteAddress: string; quoteImage: string | null; feePct: number; lockedPct: number | null; vol1h: number; vol6h: number; buys1h: number; sells1h: number };

export async function fetchPool(pool: string, net: Net = "base"): Promise<PoolDetail> {
  const j = await gt<{ data: GtPool; included?: { id: string; attributes: Record<string, any> }[] }>(`/networks/${NETS[net].gt}/pools/${pool}?include=base_token,quote_token,dex`, async () => {
    const l = dsToGt((await ds<{ pairs?: DsPair[] }>(`/latest/dex/pairs/${NETS[net].ds}/${pool}`)).pairs ?? [], net);
    if (!l.data?.length) throw new Error("Not found");
    const bt = l.included?.find((x) => x.id === l.data![0].relationships.base_token?.data?.id);
    if (bt && net === "base") bt.attributes.decimals = await vaultPublic().readContract({ address: bt.attributes.address, abi: erc20Abi, functionName: "decimals" }).catch(() => 18);
    return { data: l.data[0], included: l.included };
  });
  const [base] = normalize({ data: [j.data], included: j.included }, net);
  const a = j.data.attributes;
  const qid = j.data.relationships.quote_token?.data?.id ?? "";
  const qt = (j.included ?? []).find((x) => x.id === qid)?.attributes ?? {};
  return {
    ...base,
    quoteAddress: normAddr(String(qt.address ?? qid.replace(/^[a-z0-9-]+_/, ""))),
    quoteImage: qt.image_url && !String(qt.image_url).includes("missing") ? String(qt.image_url) : null,
    feePct: num(a.pool_fee_percentage),
    lockedPct: a.locked_liquidity_percentage == null ? null : num(a.locked_liquidity_percentage),
    vol1h: num(a.volume_usd?.h1),
    vol6h: num(a.volume_usd?.h6),
    buys1h: num(a.transactions?.h1?.buys),
    sells1h: num(a.transactions?.h1?.sells),
  };
}

export type Ohlcv = { time: number; open: number; high: number; low: number; close: number; volume: number };
export async function fetchOhlcv(pool: string, tf: "minute" | "hour" | "day", aggregate: number, net: Net = "base"): Promise<Ohlcv[]> {
  const j = await gt<{ data: { attributes: { ohlcv_list: number[][] } } }>(`/networks/${NETS[net].gt}/pools/${pool}/ohlcv/${tf}?aggregate=${aggregate}&limit=300&currency=usd`);
  return j.data.attributes.ohlcv_list.map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume })).sort((x, y) => x.time - y.time);
}

export type PoolTrade = { tx: string; ts: number; from: string; kind: "buy" | "sell"; tokenAmount: number; usd: number; priceUsd: number };
export async function fetchPoolTrades(pool: string, token: string, net: Net = "base"): Promise<PoolTrade[]> {
  const j = await gt<{ data: { attributes: Record<string, any> }[] }>(`/networks/${NETS[net].gt}/pools/${pool}/trades`);
  return j.data.map(({ attributes: a }) => {
    const buy = a.kind === "buy";
    const tokIsTo = normAddr(String(a.to_token_address)) === normAddr(token);
    return {
      tx: String(a.tx_hash),
      ts: Math.floor(Date.parse(a.block_timestamp) / 1000),
      from: String(a.tx_from_address),
      kind: buy ? "buy" : "sell",
      tokenAmount: num(tokIsTo ? a.to_token_amount : a.from_token_amount),
      usd: num(a.volume_in_usd),
      priceUsd: num(tokIsTo ? a.price_to_in_usd : a.price_from_in_usd),
    };
  });
}

export async function fetchTokenTopPool(token: string, net: Net = "base"): Promise<string | null> {
  const j = await gt<GtList>(`/networks/${NETS[net].gt}/tokens/${token}/pools?page=1`, async () =>
    dsToGt((await ds<DsPair[]>(`/token-pairs/v1/${NETS[net].ds}/${token}`)).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)), net),
  );
  const a = j.data?.[0]?.attributes.address;
  return a ? normAddr(String(a)) : null;
}

export const DEX_LABEL: Record<string, string> = {
  "uniswap-v4-base": "Uni v4", "uniswap-v3-base": "Uni v3", "uniswap-v2-base": "Uni v2", "aerodrome-base": "Aero",
  "aero-slipstream-base": "Aero CL", "uniswap_v2": "Uni v2", "uniswap_v3": "Uni v3", "uniswap-v4-ethereum": "Uni v4", "uniswap-v4-eth": "Uni v4",
  "raydium": "Raydium", "raydium-clmm": "Raydium CL", "raydium-launchlab": "LaunchLab", "pump-fun": "Pump", "pumpswap": "PumpSwap", "meteora": "Meteora", "meteora-dlmm": "Meteora", "meteora-damm-v2": "Meteora", "orca": "Orca", "pancakeswap-v3-base": "Pancake", "sushiswap-v3-base": "Sushi", "baseswap": "BaseSwap",
};

/** USD prices for Base tokens (DexScreener, highest-liquidity pair per token). */
export async function tokenPrices(addrs: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const liq: Record<string, number> = {};
  for (let i = 0; i < addrs.length; i += 30) {
    try {
      for (const p of await ds<DsPair[]>(`/tokens/v1/base/${addrs.slice(i, i + 30).join(",")}`)) {
        const a = String(p.baseToken?.address).toLowerCase();
        const l = p.liquidity?.usd ?? 0;
        if (addrs.includes(a) && l >= (liq[a] ?? -1)) (liq[a] = l), (out[a] = Number(p.priceUsd) || 0);
      }
    } catch {}
  }
  return out;
}

export async function fetchPoolsByToken(addrs: string[], net: Net = "base"): Promise<BasePool[]> {
  if (!addrs.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < addrs.length; i += 30) chunks.push(addrs.slice(i, i + 30));
  const pairs = (await Promise.all(chunks.map((c) => ds<DsPair[]>(`/tokens/v1/${NETS[net].ds}/${c.join(",")}`).catch(() => [] as DsPair[])))).flat();
  pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  const out = normalize(dsToGt(pairs, net), net);
  return addrs.map((a) => out.find((p) => p.token.address === a)).filter(Boolean) as BasePool[];
}

export async function fetchPoolsByAddr(pools: string[], net: Net = "base"): Promise<BasePool[]> {
  if (!pools.length) return [];
  const r = await ds<{ pairs?: DsPair[] }>(`/latest/dex/pairs/${NETS[net].ds}/${pools.slice(0, 30).join(",")}`);
  const out = normalize(dsToGt(r.pairs ?? [], net), net);
  return pools.map((p) => out.find((x) => x.pool === p)).filter(Boolean) as BasePool[];
}
