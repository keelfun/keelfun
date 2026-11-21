export type BasePool = {
  pool: string; dex: string; createdAt: number; quote: string;
  token: { address: string; symbol: string; name: string; image: string | null; decimals: number };
  priceUsd: number; mcUsd: number; liqUsd: number; vol24: number; chg5m: number; chg1h: number; chg24: number; buys: number; sells: number; traders: number;
};

const GT = "https://api.geckoterminal.com/api/v2";
const PATHS: Record<string, string> = {
  new: "/networks/base/new_pools?include=base_token,dex",
  trending: "/networks/base/trending_pools?include=base_token,dex&duration=1h",
  top: "/networks/base/pools?sort=h24_volume_usd_desc&include=base_token,dex",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type GtPool = { attributes: Record<string, any>; relationships: Record<string, { data?: { id: string } }> };
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

export async function fetchBasePools(kind: string, q = ""): Promise<BasePool[]> {
  const url = q ? `${GT}/search/pools?query=${encodeURIComponent(q)}&network=base&include=base_token,dex` : `${GT}${PATHS[kind]}`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(r.status === 429 ? "Rate limited, retrying…" : "Data source busy, retrying…");
  const j = (await r.json()) as { data?: GtPool[]; included?: { id: string; attributes: Record<string, any> }[] };
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
        chg24: num(a.price_change_percentage?.h24),
        buys: num(tx.buys),
        sells: num(tx.sells),
        traders: num(tx.buyers) + num(tx.sellers),
      };
    })
    .filter((p) => (seen.has(p.token.address) ? false : (seen.add(p.token.address), true)));
}
