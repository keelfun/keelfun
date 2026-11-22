import { Em, PageHero } from "@/components/PageHero";
import { ADDR, BRAND, chain, DEPLOYED, EXPLORER } from "@/lib/config";

const SECTIONS: [string, string][] = [
  [
    "Launching",
    "Pick a name, ticker, image and supply (1B, 10B, 100B or 1T) and send one transaction on Base. The factory mints the fixed supply, opens a Uniswap v4 pool against ETH and puts the whole supply in it as single-sided liquidity. There is no mint function, no presale and no team allocation. If you set a first buy, it executes inside the same transaction, before anyone else can trade.",
  ],
  [
    "Locked liquidity",
    "The liquidity position is owned by the factory contract, which has no code path to remove it. Once a token launches, its pool can't be rugged.",
  ],
  [
    "Fees",
    "The creator picks a trade fee of 1%, 2%, 3%, 5% or 10%, paid in ETH on every buy and sell. The platform keeps a small slice (0.4% / 0.5% / 0.6% / 0.75% / 1%) and the rest goes where the creator chose: the creator wallet, up to 4 split wallets, or all holders pro-rata. Wallet fees are claimed from the token or portfolio page; holder fees are claimed by each holder from the token page.",
  ],
  [
    "Anti-snipe",
    "If anti-snipe is on, buys in the first 60 seconds pay an extra tax that starts at 90% and falls linearly to 0. The tax goes to the same fee route. The creator's first buy in the launch transaction is exempt.",
  ],
  [
    "Holder rewards",
    "With the holders route, fees are pushed into the token contract and split across every wallet by balance. The pool, the dead address and the contracts are excluded, so only real holders earn. Anyone can trigger a distribution; each holder claims their own ETH.",
  ],
  [
    "Trading",
    "Trades go through a small router that swaps directly against the v4 PoolManager with slippage and deadline protection. Because the pools are standard v4 pools, any v4-aware aggregator can route to them too.",
  ],
];

export default function Docs() {
  const contracts: [string, string][] = [
    ["Factory", ADDR.factory],
    ["Hook", ADDR.hook],
    ["Router", ADDR.router],
    ["Uniswap v4 PoolManager", ADDR.poolManager],
  ];
  return (
    <div>
      <PageHero title={<>How {BRAND} <Em>works</Em></>} sub={`${BRAND} is a fair-launch token launchpad on ${chain.name}, built on Uniswap v4 hooks.`} />
      <div className="mx-auto max-w-3xl">
      <div className="space-y-3">
        {SECTIONS.map(([h, p]) => (
          <section key={h} className="rounded-2xl border border-line bg-panel p-5">
            <h2 className="font-semibold">{h}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{p}</p>
          </section>
        ))}
      </div>
      <h2 className="mt-10 font-semibold">Contracts · {chain.name}</h2>
      <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-panel">
        {contracts.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 border-t border-line px-4 py-3 first:border-0 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-muted">{k}</span>
            {DEPLOYED || k.startsWith("Uniswap") ? (
              EXPLORER ? (
                <a href={`${EXPLORER}/address/${v}`} target="_blank" rel="noreferrer" className="break-all font-mono text-xs hover:text-accent-fg">
                  {v}
                </a>
              ) : (
                <span className="break-all font-mono text-xs">{v}</span>
              )
            ) : (
              <span className="font-mono text-xs text-dim">not deployed yet</span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-dim">
        {chain.testnet
          ? "These contracts run on a testnet. Don't send real funds to them."
          : "Contracts are unaudited. Only trade what you can afford to lose."}
      </p>
      </div>
    </div>
  );
}
