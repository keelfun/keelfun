import { defineChain, type Address } from "viem";

const eth = { name: "Ether", symbol: "ETH", decimals: 18 } as const;

export const base = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: eth,
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
  blockExplorers: { default: { name: "Basescan", url: "https://basescan.org" } },
});

export const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: eth,
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
  blockExplorers: { default: { name: "Basescan", url: "https://sepolia.basescan.org" } },
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
export const BRAND = process.env.NEXT_PUBLIC_BRAND || "Keel";
export const SOCIALS = {
  x: process.env.NEXT_PUBLIC_X_URL || "https://x.com/Keelfunxyz",
  github: process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/volleyfun3",
};

const zero = "0x0000000000000000000000000000000000000000";
export const ADDR = {
  factory: (process.env.NEXT_PUBLIC_FACTORY || (chainId === 8453 ? "0x736dE2DbC4468F8224c63a11355980fB33949387" : zero)) as Address,
  hook: (process.env.NEXT_PUBLIC_HOOK || (chainId === 8453 ? "0x7fA1311D29603211365b34a35eEF99208f06A8CC" : zero)) as Address,
  router: (process.env.NEXT_PUBLIC_ROUTER || (chainId === 8453 ? "0x7c3Afc67Ce06C2bBFEfB580243F6aD01948C0473" : zero)) as Address,
  poolManager: (process.env.NEXT_PUBLIC_POOL_MANAGER || "0x498581ff718922c3f8e6a244956af099b2652b2b") as Address,
};
export const DEPLOYED = ADDR.factory !== zero;

export const BASE_SUPPLY = 1_000_000_000;
export const SUPPLY_TIERS = [1e9, 1e10, 1e11, 1e12];
export const FEE_TIERS = [
  { bps: 100, platformBps: 40 },
  { bps: 200, platformBps: 50 },
  { bps: 300, platformBps: 60 },
  { bps: 500, platformBps: 75 },
  { bps: 1000, platformBps: 100 },
];
export const SNIPE = { startBps: 9000, seconds: 60 };
export function snipeBpsAt(launchedAt: number, now: number) {
  const dt = now - launchedAt;
  return dt >= SNIPE.seconds || dt < 0 ? 0 : Math.round((SNIPE.startBps * (SNIPE.seconds - dt)) / SNIPE.seconds);
}
export const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID || "";
