"use client";
import { useState } from "react";
import { Em, PageHero } from "@/components/PageHero";
import { ADDR, API_URL, BRAND, EXPLORER } from "@/lib/config";

const BASE = API_URL || "https://api.keelfun.app";

const ENDPOINTS: [string, string, string][] = [
  ["GET", "/stats", "Totals: tokens, volume, trades, platform fees, ETH/BTC price and indexer head."],
  ["GET", "/tokens?sort=trending&q=&limit=48&offset=0", "Token list. sort: trending, new, top, holders. q searches name, ticker or address. creator filters by wallet."],
  ["GET", "/tokens/{address}", "One token: pair, taxes, split, supply, price, FDV, liquidity, volume, holders."],
  ["GET", "/tokens/{address}/trades?limit=50", "Latest trades. Amounts in the pair asset (pairAmount) and ETH value (eth)."],
  ["GET", "/tokens/{address}/holders", "Top 100 holders with share of supply. The v4 pool, dead address and creator are labelled."],
  ["GET", "/tokens/{address}/fees", "Fee activity: buy/sell tax per trade, creator claims, holder dividends and buyback burns."],
  ["GET", "/tokens/{address}/candles?res=60", "OHLCV candles. res in seconds: 15, 60, 300, 900, 3600, 14400, 86400."],
  ["GET", "/portfolio/{wallet}", "Balances, created tokens and claimable fees for a wallet."],
  ["GET", "/revenue", "Platform revenue, creator fees, dividends, burns, revenue per pair and daily series."],
  ["GET", "/flywheel", "Buyback totals, top tokens by market cap and recent buyback burns."],
  ["GET", "/builders", "Registered builders and the volume they routed."],
];

const LAUNCH = `import { createWalletClient, custom, parseEther } from "viem";
import { base } from "viem/chains";

const factory = "${ADDR.factory}";
// launch(LaunchParams) — see contracts/src/LaunchFactory.sol
await wallet.writeContract({
  address: factory, abi: launchFactoryAbi, functionName: "launch", chain: base,
  args: [{
    name: "My Token", symbol: "MYT", metadataURI: "", supplyTier: 0,
    pair: "0x0000000000000000000000000000000000000000", // ETH, or any enabled pair
    buyBps: 300, sellBps: 300, creatorBps: 10000, holdersBps: 0, burnBps: 0,
    antiSnipe: true, editable: true, recipients: [me], shares: [10000],
    salt, devBuy: 0n, minTokensOut: 0n,
  }],
  value: 0n,
});`;

function Code({ code, label = "terminal" }: { code: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-[#070a12]">
      <div className="flex items-center justify-between border-b border-line px-4 py-2 font-mono text-xs text-dim">
        <span>{label}</span>
        <button onClick={() => navigator.clipboard.writeText(code).then(() => { setOk(true); setTimeout(() => setOk(false), 1200); })} className="hover:text-fg">{ok ? "Copied" : "Copy"}</button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-fg/85"><code>{code}</code></pre>
    </div>
  );
}

export default function ApiPage() {
  return (
    <div>
      <PageHero title={<>Developer <Em>API</Em></>} sub={`Read ${BRAND} market data over plain HTTP. No key, no signup: every endpoint is public JSON with CORS enabled. Launching and trading happen on-chain, signed by your own wallet.`} />
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-8">
          <section>
            <h2 className="font-serif text-3xl">Quickstart</h2>
            <p className="mt-2 text-sm text-muted">Base URL <code className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-fg">{BASE}</code>. Responses are JSON. Errors come back as <code className="font-mono">{`{ "error": string }`}</code> with a 4xx/5xx status. Please cache and poll gently.</p>
            <div className="mt-4">
              <Code code={`# No key, no signup. Just call it.\ncurl ${BASE}/tokens?sort=new\n\n# One token, its trades and fee activity\ncurl ${BASE}/tokens/0x…/trades\ncurl ${BASE}/tokens/0x…/fees`} />
            </div>
          </section>
          <section>
            <h2 className="font-serif text-3xl">Endpoints</h2>
            <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-panel">
              {ENDPOINTS.map(([m, path, d]) => (
                <div key={path} className="p-4">
                  <p className="flex flex-wrap items-center gap-2 font-mono text-sm">
                    <span className="rounded bg-up/15 px-1.5 py-0.5 text-[11px] font-medium text-up">{m}</span>
                    <span className="break-all text-fg">{path}</span>
                  </p>
                  <p className="mt-1.5 text-sm text-muted">{d}</p>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2 className="font-serif text-3xl">Launching yourself</h2>
            <p className="mt-2 text-sm text-muted">There is no launch endpoint to trust: call the Factory directly from your wallet. The token address must sort above the pair asset, so mine a <code className="font-mono">salt</code> against the Factory&apos;s token init code hash first (the {BRAND} launch page does this in the browser). Indexed launches show up in the API within a minute.</p>
            <div className="mt-4"><Code code={LAUNCH} label="launch.ts" /></div>
          </section>
        </div>
        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-line bg-panel p-5">
            <p className="text-sm font-semibold">Contracts · Base</p>
            {([["Factory", ADDR.factory], ["Hook", ADDR.hook], ["Router", ADDR.router], ["PoolManager", ADDR.poolManager]] as const).map(([k, a]) => (
              <div key={k} className="mt-3">
                <p className="text-xs text-dim">{k}</p>
                <a href={EXPLORER ? `${EXPLORER}/address/${a}` : undefined} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-accent-fg hover:underline">{a}</a>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-line bg-panel p-5 text-sm text-muted">
            <p className="font-semibold text-fg">Source</p>
            <p className="mt-2">Contracts, indexer and this site are open source on <a href="https://github.com/keelfun/keelfun" target="_blank" rel="noreferrer" className="text-accent-fg hover:underline">GitHub</a>.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
