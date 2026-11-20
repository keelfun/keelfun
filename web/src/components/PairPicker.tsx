"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { PairInfo } from "@/lib/config";

export type PairKind = "stocks" | "crypto" | "memes";

export function pairKind(p: PairInfo): PairKind {
  if (p.stock) return "stocks";
  if (p.logo.includes("basestonk.io")) return "memes";
  return "crypto";
}

export function shortName(p: PairInfo) {
  return p.name.replace(/\s*\((Coinbase )?Tokenized Stocks?\)/i, "").replace(/, Inc\.?$|,? Inc\.?$/i, "");
}

export function PairLogo({ p, size = 24 }: { p: PairInfo; size?: number }) {
  const [bad, setBad] = useState(false);
  return p.logo && !bad ? (
    <img src={p.logo} alt="" onError={() => setBad(true)} className="shrink-0 rounded-full bg-panel-2 object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-panel-2 text-[10px] font-medium text-muted" style={{ width: size, height: size }}>
      {p.symbol.slice(0, 2)}
    </span>
  );
}

const TABS: { k: PairKind | "all"; label: string }[] = [
  { k: "all", label: "All" },
  { k: "stocks", label: "Stocks" },
  { k: "crypto", label: "Crypto" },
  { k: "memes", label: "Memes" },
];

export function PairPicker({ pairs, onPick, onClose }: { pairs: { p: PairInfo; i: number }[]; onPick: (i: number) => void; onClose: () => void }) {
  const [tab, setTab] = useState<PairKind | "all">("all");
  const [q, setQ] = useState("");
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: pairs.length, stocks: 0, crypto: 0, memes: 0 };
    pairs.forEach(({ p }) => c[pairKind(p)]++);
    return c;
  }, [pairs]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return pairs.filter(
      ({ p }) =>
        (tab === "all" || pairKind(p) === tab) &&
        (!s || p.symbol.toLowerCase().includes(s) || p.name.toLowerCase().includes(s) || p.address.toLowerCase() === s),
    );
  }, [pairs, tab, q]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-t-3xl border border-line bg-panel p-4 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-medium">Select paired asset</p>
          <button type="button" onClick={onClose} className="text-muted hover:text-fg">✕</button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-bg p-1">
          {TABS.map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setTab(t.k)}
              className={`h-8 rounded-lg text-xs font-medium sm:text-sm ${tab === t.k ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}
            >
              {t.label} <span className="text-dim">{counts[t.k]}</span>
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, ticker or address"
          className="mt-3 h-11 w-full rounded-xl border border-line bg-bg/60 px-3 text-sm outline-none placeholder:text-dim focus:border-accent/50"
        />
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {list.map(({ p, i }) => (
            <button key={p.address} type="button" onClick={() => onPick(i)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-panel-2">
              <PairLogo p={p} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.symbol}</p>
                <p className="truncate text-xs text-dim">{shortName(p)}</p>
              </div>
              {p.usd ? <span className="shrink-0 text-xs text-muted">${p.usd >= 1 ? p.usd.toFixed(2) : p.usd.toPrecision(3)}</span> : null}
            </button>
          ))}
          {list.length === 0 && <p className="py-8 text-center text-sm text-muted">No pairs found.</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
