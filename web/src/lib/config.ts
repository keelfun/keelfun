import { defineChain, type Address } from "viem";
import { STOCK_PAIRS } from "./stockPairs";

const eth = { name: "Ether", symbol: "ETH", decimals: 18 } as const;

export const base = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: eth,
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
  blockExplorers: { default: { name: "Basescan", url: "https://basescan.org" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11", blockCreated: 5022 } },
});

export const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: eth,
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
  blockExplorers: { default: { name: "Basescan", url: "https://sepolia.basescan.org" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11", blockCreated: 1059647 } },
  testnet: true,
});

export const localChain = defineChain({
  id: 31337,
  name: "Local devnet",
  nativeCurrency: eth,
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 8453);
export const chain = [base, baseSepolia, localChain].find((c) => c.id === chainId) ?? base;
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || chain.rpcUrls.default.http[0];
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const EXPLORER = (process.env.NEXT_PUBLIC_EXPLORER || chain.blockExplorers?.default.url || "").replace(/\/$/, "");
export const BRAND = process.env.NEXT_PUBLIC_BRAND || "Keelfun";
export const SOCIALS = {
  x: process.env.NEXT_PUBLIC_X_URL || "https://x.com/Keelfunxyz",
  github: process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/keelfun/keelfun",
};

const zero = "0x0000000000000000000000000000000000000000";
export const ADDR = {
  factory: (process.env.NEXT_PUBLIC_FACTORY || (chainId === 8453 ? "0xDC802747d6c5271e2fC8a51bc52D279bDb80b463" : zero)) as Address,
  hook: (process.env.NEXT_PUBLIC_HOOK || (chainId === 8453 ? "0xD7aDF63eDeb2e784bb949d9f848f9aE2D104A8Cc" : zero)) as Address,
  router: (process.env.NEXT_PUBLIC_ROUTER || (chainId === 8453 ? "0x9AfFc874A3DCd94DF5Bd6eB23d4f48687f47B648" : zero)) as Address,
  poolManager: (process.env.NEXT_PUBLIC_POOL_MANAGER || "0x498581ff718922c3f8e6a244956af099b2652b2b") as Address,
};
export const DEPLOYED = ADDR.factory !== zero;

export const BASE_SUPPLY = 1_000_000_000;
export const SUPPLY_TIERS = [1e9, 1e10, 1e11, 1e12];
/** Protocol slice (bps of the trade) of a 1%-10% tax: 0.4% at 1%, +0.1% per extra 1%, capped at 1%. */
export function platformBpsFor(taxBps: number) {
  return Math.min(100, 40 + Math.floor((taxBps - 100) / 10));
}
export const FEE_TIERS = [100, 200, 300, 500, 1000].map((bps) => ({ bps, platformBps: platformBpsFor(bps) }));

export type PairInfo = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  tick: number;
  logo: string;
  presets: readonly string[];
  stock?: boolean;
  usd?: number;
};
/** Pair assets the factory allows. `tick` is the launch start tick for a 1B supply. */
export const PAIRS: PairInfo[] = [
  { address: zero as Address, symbol: "ETH", name: "Ether", decimals: 18, tick: 200_200, logo: "https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg", presets: ["0.01", "0.05", "0.1", "0.5"] },
  { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", name: "USD Coin", decimals: 6, tick: 402_000, logo: "https://coin-images.coingecko.com/coins/images/6319/large/usdc.png", presets: ["10", "50", "100", "500"] },
  { address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", symbol: "cbBTC", name: "Coinbase Wrapped BTC", decimals: 8, tick: 466_200, logo: "https://coin-images.coingecko.com/coins/images/40143/large/cbbtc.webp", presets: ["0.0001", "0.0005", "0.001", "0.005"] },
  ...STOCK_PAIRS,
];
export function pairInfo(address?: string | null): PairInfo {
  return PAIRS.find((p) => p.address.toLowerCase() === (address ?? zero).toLowerCase()) ?? PAIRS[0];
}
/** Opening market cap in pair units (same for every supply tier). */
export function launchCap(p: PairInfo) {
  return 1e9 * Math.pow(1.0001, -p.tick) * 10 ** (18 - p.decimals);
}
export const SNIPE = { startBps: 9000, seconds: 60 };
export function snipeBpsAt(launchedAt: number, now: number) {
  const dt = now - launchedAt;
  return dt >= SNIPE.seconds || dt < 0 ? 0 : Math.round((SNIPE.startBps * (SNIPE.seconds - dt)) / SNIPE.seconds);
}
export const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID || process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";
