export type BasePool = {
  pool: string; dex: string; createdAt: number; quote: string;
  token: { address: string; symbol: string; name: string; image: string | null; decimals: number };
  priceUsd: number; mcUsd: number; liqUsd: number; vol24: number; chg5m: number; chg1h: number; chg6h: number; chg24: number; buys: number; sells: number; traders: number;
};

const GT = "https://api.geckoterminal.com/api/v2";
const PATHS: Record<string, string> = {
  new: "/networks/base/new_pools?include=base_token,dex",
  trending: "/networks/base/trending_pools?include=base_token,dex",
  top: "/networks/base/pools?sort=h24_volume_usd_desc&include=base_token,dex",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type GtPool = { attributes: Record<string, any>; relationships: Record<string, { data?: { id: string } }> };
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

const inflight = new Map<string, Promise<unknown>>();
async function gt<T>(path: string): Promise<T> {
  const key = `gt:${path}`;
  let cached: { t: number; v: T } | null = null;
  try {
    cached = JSON.parse(sessionStorage.getItem(key) || "null");
  } catch {}
  if (cached && Date.now() - cached.t < 15_000) return cached.v;
  if (inflight.has(path)) return inflight.get(path) as Promise<T>;
  const job = (async () => {
    let r: Response | null = null;
    try {
      r = await fetch(`${GT}${path}`, { headers: { accept: "application/json" } });
    } catch {}
    if (!r?.ok) {
      if (cached) return cached.v;
      throw new Error(!r || r.status === 429 ? "Rate limited, retrying…" : r.status === 404 ? "Not found" : "Data source busy, retrying…");
    }
    const v = (await r.json()) as T;
    try {
      sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v }));
    } catch {}
    return v;
  })().finally(() => inflight.delete(path));
  inflight.set(path, job);
  return job;
}

type GtList = { data?: GtPool[]; included?: { id: string; attributes: Record<string, any> }[] };

export async function fetchBasePools(kind: string, q = "", duration = "1h"): Promise<BasePool[]> {
  const path = q ? `/search/pools?query=${encodeURIComponent(q)}&network=base&include=base_token,dex` : `${PATHS[kind]}${kind === "trending" ? `&duration=${duration}` : ""}`;
  return normalize(await gt<GtList>(path));
}

function normalize(j: GtList): BasePool[] {
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
        pool: String(a.address),
        dex: p.relationships.dex?.data?.id ?? "",
        createdAt: Math.floor(Date.parse(a.pool_created_at) / 1000) || 0,
        quote: (quote ?? "").split(" ")[0],
        token: {
          address: String(bt.address ?? bid.replace(/^base_/, "")).toLowerCase(),
          symbol: String(bt.symbol ?? base ?? "?"),
          name: String(bt.name ?? base ?? ""),
          image: bt.image_url && !String(bt.image_url).includes("missing") ? String(bt.image_url) : null,
          decimals: num(bt.decimals) || 18,
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

export async function fetchPool(pool: string): Promise<PoolDetail> {
  const j = await gt<{ data: GtPool; included?: { id: string; attributes: Record<string, any> }[] }>(`/networks/base/pools/${pool}?include=base_token,quote_token,dex`);
  const [base] = normalize({ data: [j.data], included: j.included });
  const a = j.data.attributes;
  const qid = j.data.relationships.quote_token?.data?.id ?? "";
  const qt = (j.included ?? []).find((x) => x.id === qid)?.attributes ?? {};
  return {
    ...base,
    quoteAddress: String(qt.address ?? qid.replace(/^base_/, "")).toLowerCase(),
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
export async function fetchOhlcv(pool: string, tf: "minute" | "hour" | "day", aggregate: number): Promise<Ohlcv[]> {
  const j = await gt<{ data: { attributes: { ohlcv_list: number[][] } } }>(`/networks/base/pools/${pool}/ohlcv/${tf}?aggregate=${aggregate}&limit=300&currency=usd`);
  return j.data.attributes.ohlcv_list.map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume })).sort((x, y) => x.time - y.time);
}

export type PoolTrade = { tx: string; ts: number; from: string; kind: "buy" | "sell"; tokenAmount: number; usd: number; priceUsd: number };
export async function fetchPoolTrades(pool: string, token: string): Promise<PoolTrade[]> {
  const j = await gt<{ data: { attributes: Record<string, any> }[] }>(`/networks/base/pools/${pool}/trades`);
  return j.data.map(({ attributes: a }) => {
    const buy = a.kind === "buy";
    const tokIsTo = String(a.to_token_address).toLowerCase() === token;
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

export async function fetchTokenTopPool(token: string): Promise<string | null> {
  const j = await gt<GtList>(`/networks/base/tokens/${token}/pools?page=1`);
  return j.data?.[0]?.attributes.address ?? null;
}

export const DEX_LABEL: Record<string, string> = {
  "uniswap-v4-base": "Uni v4", "uniswap-v3-base": "Uni v3", "uniswap-v2-base": "Uni v2", "aerodrome-base": "Aero",
  "aero-slipstream-base": "Aero CL", "pancakeswap-v3-base": "Pancake", "sushiswap-v3-base": "Sushi", "baseswap": "BaseSwap",
};
