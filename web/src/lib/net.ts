"use client";
import { useEffect, useState } from "react";

export type Net = "base" | "eth" | "solana";
export type NetInfo = { id: Net; label: string; gt: string; ds: string; relay: number; explorer: string; explorerName: string; logo: string };
export const NETS: Record<Net, NetInfo> = {
  base: { id: "base", label: "Base", gt: "base", ds: "base", relay: 8453, explorer: "https://basescan.org", explorerName: "Basescan", logo: "https://icons.llamao.fi/icons/chains/rsz_base.jpg" },
  eth: { id: "eth", label: "Ethereum", gt: "eth", ds: "ethereum", relay: 1, explorer: "https://etherscan.io", explorerName: "Etherscan", logo: "https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg" },
  solana: { id: "solana", label: "Solana", gt: "solana", ds: "solana", relay: 792703809, explorer: "https://solscan.io", explorerName: "Solscan", logo: "https://icons.llamao.fi/icons/chains/rsz_solana.jpg" },
};
export const NET_LIST = Object.values(NETS);
const KEY = "keel-net";
const EVT = "keel-net";
const isNet = (v: unknown): v is Net => v === "base" || v === "eth" || v === "solana";
const terminal = () => typeof location !== "undefined" && (location.hostname.startsWith("terminal.") || location.hostname === "localhost");

/** Network the terminal is browsing. The main site and launchpad are always Base. */
export function getNet(): Net {
  if (!terminal()) return "base";
  try {
    const v = localStorage.getItem(KEY);
    return isNet(v) ? v : "base";
  } catch {
    return "base";
  }
}
export function setNet(n: Net) {
  if (getNet() === n) return;
  localStorage.setItem(KEY, n);
  dispatchEvent(new Event(EVT));
}
export function parseNet(v: string | null | undefined): Net | null {
  return isNet(v) ? v : null;
}
export function useNet(): Net {
  const [n, setN] = useState<Net>("base");
  useEffect(() => {
    const f = () => setN(getNet());
    f();
    addEventListener(EVT, f);
    addEventListener("storage", f);
    return () => (removeEventListener(EVT, f), removeEventListener("storage", f));
  }, []);
  return n;
}

/** Solana addresses are case-sensitive; EVM ones are compared lowercased. */
export const normAddr = (a: string) => (/^0x/i.test(a) ? a.toLowerCase() : a);
export const isEvmAddr = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);
export const isSolAddr = (a: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
export const addrOnNet = (a: string, n: Net) => (n === "solana" ? isSolAddr(a) : isEvmAddr(a));

export const explorerToken = (n: Net, a: string) => `${NETS[n].explorer}/token/${a}`;
export const explorerTx = (n: Net, h: string) => `${NETS[n].explorer}/tx/${h}`;
export const explorerAddr = (n: Net, a: string) => `${NETS[n].explorer}/${n === "solana" ? "account" : "address"}/${a}`;
export const pairHref = (pool: string, n: Net) => `/pair/?p=${pool}${n === "base" ? "" : `&n=${n}`}`;
export const tokenHref = (t: string, n: Net) => `/pair/?t=${t}${n === "base" ? "" : `&n=${n}`}`;
