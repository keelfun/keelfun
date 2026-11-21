"use client";
import { useEffect, useState } from "react";
import { createPublicClient, createWalletClient, fallback, http, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { chain, RPC_URL } from "./config";
import { BASE_RPCS } from "./wagmi";

export type VaultWallet = { name: string; pk: Hex; address: `0x${string}` };
export type TokenMeta = { address: `0x${string}`; symbol: string; name: string; decimals: number; image: string | null; keel?: boolean };
export type VaultAct = { ts: number; wallet: string; side: "buy" | "sell"; symbol: string; token: string; eth?: number; hash: string };
export type VaultData = {
  wallets: VaultWallet[];
  groups: number[][];
  mode: "total" | "each";
  tokens?: Record<string, TokenMeta[]>;
  activity?: VaultAct[];
};
type Stored = { v: 1; kind: "sig" | "password"; owner?: string; salt: string; iv: string; ct: string; created: number };

const KEY = "keel-vault";
const EVT = "keel-vault";
const LOCK_MS = 60 * 60 * 1000;
export const vaultMessage = (owner: string) =>
  `Keelfun vault\n\nSign to unlock your Keelfun trading wallets on this device. This costs no gas and moves no funds.\n\nOwner: ${owner.toLowerCase()}`;

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const enc = new TextEncoder();

let cryptoKey: CryptoKey | null = null;
let data: VaultData | null = null;
let lockTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  dispatchEvent(new Event(EVT));
}
function touch() {
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = setTimeout(lock, LOCK_MS);
}
export function stored(): Stored | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    return s?.v === 1 && s.ct ? s : null;
  } catch {
    return null;
  }
}

async function keyFromSig(sig: string, salt: Uint8Array<ArrayBuffer>) {
  const raw = await crypto.subtle.digest("SHA-256", new Uint8Array([...enc.encode(sig.toLowerCase()), ...salt]));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function keyFromPassword(pw: string, salt: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function persist() {
  const s = stored();
  if (!s || !cryptoKey || !data) return;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, enc.encode(JSON.stringify(data))));
  localStorage.setItem(KEY, JSON.stringify({ ...s, iv: b64(iv), ct: b64(ct) }));
}

export async function createVault(kind: "sig" | "password", secret: string, owner?: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  cryptoKey = kind === "sig" ? await keyFromSig(secret, salt) : await keyFromPassword(secret, salt);
  data = { wallets: [newWallet("Wallet 1")], groups: [[0], [0], [0]], mode: "total" };
  localStorage.setItem(KEY, JSON.stringify({ v: 1, kind, owner: owner?.toLowerCase(), salt: b64(salt), iv: "", ct: "x", created: Date.now() } satisfies Stored));
  await persist();
  touch();
  emit();
}

export async function unlock(secret: string) {
  const s = stored();
  if (!s) throw new Error("No vault on this device");
  const salt = unb64(s.salt);
  const k = s.kind === "sig" ? await keyFromSig(secret, salt) : await keyFromPassword(secret, salt);
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(s.iv) }, k, unb64(s.ct));
    data = JSON.parse(new TextDecoder().decode(pt));
    cryptoKey = k;
  } catch {
    throw new Error(s.kind === "sig" ? "Could not unlock. Sign with the same wallet that created the vault (smart wallets that sign differently each time need a password vault)." : "Wrong password");
  }
  touch();
  emit();
}

export function lock() {
  cryptoKey = null;
  data = null;
  emit();
}

export function deleteVault() {
  localStorage.removeItem(KEY);
  lock();
}

function newWallet(name: string): VaultWallet {
  const pk = generatePrivateKey();
  return { name, pk, address: privateKeyToAccount(pk).address };
}

async function update(fn: (d: VaultData) => VaultData) {
  if (!data) throw new Error("Vault is locked");
  data = fn(data);
  await persist();
  touch();
  emit();
}

export const vaultActions = {
  add: () => update((d) => ({ ...d, wallets: [...d.wallets, newWallet(`Wallet ${d.wallets.length + 1}`)] })),
  importKey: (pk: string, name?: string) => {
    const k = (pk.trim().startsWith("0x") ? pk.trim() : `0x${pk.trim()}`) as Hex;
    if (!/^0x[0-9a-fA-F]{64}$/.test(k)) throw new Error("Not a valid private key");
    const address = privateKeyToAccount(k).address;
    return update((d) => (d.wallets.some((w) => w.address === address) ? d : { ...d, wallets: [...d.wallets, { name: name || `Imported ${d.wallets.length + 1}`, pk: k, address }] }));
  },
  rename: (i: number, name: string) => update((d) => ({ ...d, wallets: d.wallets.map((w, j) => (j === i ? { ...w, name } : w)) })),
  remove: (i: number) =>
    update((d) => ({ ...d, wallets: d.wallets.filter((_, j) => j !== i), groups: d.groups.map((g) => g.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x))) })),
  toggleGroup: (g: number, i: number) => update((d) => ({ ...d, groups: d.groups.map((x, j) => (j !== g ? x : x.includes(i) ? x.filter((y) => y !== i) : [...x, i].sort())) })),
  setMode: (mode: "total" | "each") => update((d) => ({ ...d, mode })),
  record: (wallet: string, t: TokenMeta, act: Omit<VaultAct, "ts" | "wallet" | "symbol" | "token">) =>
    update((d) => {
      const k = wallet.toLowerCase();
      const list = d.tokens?.[k] ?? [];
      const has = list.some((x) => x.address.toLowerCase() === t.address.toLowerCase());
      return {
        ...d,
        tokens: { ...d.tokens, [k]: has ? list : [...list, t] },
        activity: [{ ts: Date.now(), wallet: k, symbol: t.symbol, token: t.address.toLowerCase(), ...act }, ...(d.activity ?? [])].slice(0, 200),
      };
    }),
};

export function exportBackup() {
  const s = localStorage.getItem(KEY);
  if (!s) throw new Error("No vault");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([s], { type: "application/json" }));
  a.download = `keelfun-vault-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

export async function restoreBackup(f: File) {
  const s = JSON.parse(await f.text());
  if (s?.v !== 1 || !s.ct || !s.salt || !s.iv) throw new Error("Not a Keelfun vault backup");
  lock();
  localStorage.setItem(KEY, JSON.stringify(s));
  emit();
}

export const vaultTransport = () => fallback([...BASE_RPCS.map((u) => http(u)), http(RPC_URL)]);
export const vaultPublic = () => createPublicClient({ chain, transport: vaultTransport() });
export function vaultClient(w: VaultWallet) {
  touch();
  return createWalletClient({ account: privateKeyToAccount(w.pk), chain, transport: vaultTransport() });
}

/** Wallets used by quick buy for a preset, with the ETH amount each one spends. */
export function vaultPlan(preset: number, amount: number): { w: VaultWallet; amount: number }[] {
  if (!data) return [];
  const ws = (data.groups[preset] ?? []).map((i) => data!.wallets[i]).filter(Boolean);
  if (!ws.length) return [];
  return ws.map((w) => ({ w, amount: data!.mode === "each" ? amount : amount / ws.length }));
}

export function useVault() {
  const [state, setState] = useState<{ exists: boolean; kind?: "sig" | "password"; owner?: string; data: VaultData | null }>({ exists: false, data: null });
  useEffect(() => {
    const f = () => {
      const s = stored();
      setState({ exists: !!s, kind: s?.kind, owner: s?.owner, data });
    };
    f();
    addEventListener(EVT, f);
    return () => removeEventListener(EVT, f);
  }, []);
  return state;
}
