"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { TokenAvatar } from "./TokenAvatar";
import { api, type Portfolio } from "@/lib/api";
import { pairInfo } from "@/lib/config";
import { fmtCompact, shortAddr, timeAgo } from "@/lib/format";

export function Tracker({ onClose, full = false }: { onClose?: () => void; full?: boolean }) {
  const [wallets, setWallets] = useState<string[]>([]);
  const [input, setInput] = useState("");
  useEffect(() => {
    try {
      setWallets(JSON.parse(localStorage.getItem("keel-tracked") || "[]"));
    } catch {}
  }, []);
  const save = (w: string[]) => (setWallets(w), localStorage.setItem("keel-tracked", JSON.stringify(w)));
  const add = () => {
    const w = input.trim().toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(w) && !wallets.includes(w)) save([...wallets, w]);
    setInput("");
  };
  const qs = useQueries({
    queries: wallets.map((w) => ({ queryKey: ["portfolio", w], queryFn: () => api<Portfolio>(`/portfolio/${w}`), refetchInterval: 8000 })),
  });
  const feed = qs
    .flatMap((q, i) => (q.data?.trades ?? []).map((r) => ({ ...r, wallet: wallets[i] })))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 60);
  return (
    <aside className={full ? "flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-line bg-panel" : "hidden w-72 shrink-0 flex-col border-r border-line xl:flex"}>
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <h2 className="text-sm font-semibold">Wallet tracker</h2>
        {onClose && <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Close">×</button>}
      </div>
      <div className="flex gap-1.5 border-b border-line p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="0x… wallet"
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 font-mono text-xs outline-none focus:border-accent"
        />
        <button onClick={add} className="h-8 rounded-md bg-accent px-3 text-xs font-semibold text-accent-ink">Add</button>
      </div>
      {wallets.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-line p-2">
          {wallets.map((w) => (
            <span key={w} className="inline-flex items-center gap-1 rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
              <Link href={`/portfolio/?w=${w}`} className="hover:text-fg">{shortAddr(w)}</Link>
              <button onClick={() => save(wallets.filter((x) => x !== w))} className="hover:text-down">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {wallets.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs leading-relaxed text-muted">Track a wallet to see what it buys and sells on Keelfun.</p>
        ) : feed.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-dim">No trades from tracked wallets yet.</p>
        ) : (
          feed.map((r) => (
            <Link key={r.id + r.wallet} href={`/token/?a=${r.token}`} className="flex items-center gap-2 border-b border-line/60 px-3 py-2 text-xs hover:bg-panel-2/60">
              <TokenAvatar src={r.image} symbol={r.symbol} size={24} />
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  <span className={r.isBuy ? "text-up" : "text-down"}>{r.isBuy ? "Buy" : "Sell"}</span> ${r.symbol}
                </p>
                <p className="font-mono text-[10px] text-dim">{shortAddr(r.wallet)} · {timeAgo(r.ts)} ago</p>
              </div>
              <span className="font-mono text-[11px] text-muted">{fmtCompact(r.pairAmount ?? r.eth, 4)} {r.pair ? pairInfo(r.pair).symbol : "ETH"}</span>
            </Link>
          ))
        )}
      </div>
    </aside>
  );
}
