"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { TokenAvatar } from "./TokenAvatar";
import { api, type Token } from "@/lib/api";
import { fetchBasePools } from "@/lib/basePools";
import { isSolAddr, NETS, pairHref, tokenHref, useNet } from "@/lib/net";
import { fmtUsd, shortAddr } from "@/lib/format";
import { OfficialBadge } from "./Official";

type Item = { key: string; href: string; img: string | null; title: string; sub: string; right?: string; tag: string; addr?: string };

export function SearchK({ wide = false }: { wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [sel, setSel] = useState(0);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") || (wide && e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement | null)?.tagName ?? ""))) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") setOpen(false);
    };
    addEventListener("keydown", k);
    const o = () => setOpen(true);
    addEventListener("keel-search", o);
    return () => removeEventListener("keydown", k);
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 20);
    else setQ("");
  }, [open]);
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const net = useNet();
  const isAddr = /^0x[0-9a-fA-F]{40}$/.test(dq);
  const isSol = net === "solana" && isSolAddr(dq);
  const keel = useQuery({ queryKey: ["k-search", dq], queryFn: () => api<{ tokens: Token[]; ethUsd: number }>(`/tokens?sort=top&q=${encodeURIComponent(dq)}&limit=6`), enabled: open && dq.length > 0 });
  const base = useQuery({ queryKey: ["b-search", net, dq], queryFn: () => fetchBasePools("", dq, "1h", net), enabled: open && dq.length > 1, retry: 1 });
  const items: Item[] = [];
  if (isAddr) {
    items.push({ key: "w", href: `/portfolio/?w=${dq}`, img: null, title: "Open wallet", sub: shortAddr(dq), tag: "Wallet" });
    items.push({ key: "t", href: tokenHref(dq.toLowerCase(), net === "solana" ? "base" : net), img: null, title: "Open token", sub: shortAddr(dq), tag: "Token" });
  }
  if (isSol) items.push({ key: "t", href: tokenHref(dq, "solana"), img: null, title: "Open token", sub: shortAddr(dq), tag: "Solana" });
  for (const t of keel.data?.tokens ?? [])
    items.push({ key: `k${t.address}`, href: `/token/?a=${t.address}`, img: t.image, title: t.symbol, sub: t.name, right: fmtUsd(t.fdvEth * (keel.data?.ethUsd ?? 0)), tag: "Keelfun", addr: t.address });
  for (const p of (base.data ?? []).slice(0, 8))
    items.push({ key: `b${p.pool}`, href: pairHref(p.pool, p.net), img: p.token.image, title: `${p.token.symbol} / ${p.quote}`, sub: p.token.name, right: fmtUsd(p.mcUsd), tag: NETS[p.net].label, addr: p.token.address });
  const go = (h: string) => {
    setOpen(false);
    router.push(h);
  };
  return (
    <>
      <button onClick={() => setOpen(true)} className={`flex h-9 items-center gap-2 rounded-lg border border-line px-2.5 text-xs text-muted hover:text-fg ${wide ? "md:w-48 xl:w-72" : ""}`} aria-label="Search">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span className={`hidden truncate ${wide ? "md:inline" : "2xl:inline"}`}>{wide ? "Search by token or CA…" : "Search"}</span>
        <kbd className={`ml-auto hidden rounded border border-line px-1 font-mono text-[10px] ${wide ? "md:inline" : "2xl:inline"}`}>{wide ? "/" : "Ctrl K"}</kbd>
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 px-3 pt-[12vh]" onClick={() => setOpen(false)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
              <div className="flex items-center gap-2 border-b border-line px-4">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-dim" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <input
                  ref={input}
                  value={q}
                  onChange={(e) => (setQ(e.target.value), setSel(0))}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(items.length - 1, s + 1)));
                    if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
                    if (e.key === "Enter" && items[sel]) go(items[sel].href);
                  }}
                  placeholder="Search tokens, pairs or paste an address…"
                  className="h-12 flex-1 bg-transparent text-sm outline-none"
                />
                <kbd className="rounded border border-line px-1.5 font-mono text-[10px] text-dim">Esc</kbd>
              </div>
              <div className="max-h-[55vh] overflow-y-auto p-1.5">
                {items.map((it, i) => (
                  <button key={it.key} onMouseEnter={() => setSel(i)} onClick={() => go(it.href)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${sel === i ? "bg-panel-2" : ""}`}>
                    <TokenAvatar src={it.img} symbol={it.title} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">{it.title}<OfficialBadge address={it.addr} /></p>
                      <p className="truncate text-xs text-dim">{it.sub}</p>
                    </div>
                    {it.right && <span className="font-mono text-xs text-muted">{it.right}</span>}
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${it.tag === "Keelfun" ? "bg-accent/15 text-accent-fg" : "bg-panel-2 text-muted"}`}>{it.tag}</span>
                  </button>
                ))}
                {!dq && <p className="px-3 py-6 text-center text-xs text-dim">Search Keelfun tokens and every pair on Base. Paste a wallet to open its portfolio.</p>}
                {dq && base.isError && <p className="px-3 py-2 text-center text-xs text-dim">Base search is busy, try again in a few seconds.</p>}
                {dq && !items.length && !keel.isFetching && !base.isFetching && !base.isError && <p className="px-3 py-6 text-center text-xs text-dim">Nothing found.</p>}
                {dq && (keel.isFetching || base.isFetching) && <p className="px-3 py-2 text-center text-xs text-dim">Searching…</p>}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
