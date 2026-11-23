"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { NET_LIST, NETS, setNet, useNet } from "@/lib/net";
import { connectSol, disconnectSol, setSolAddress, useSol } from "@/lib/sol";
import { shortAddr } from "@/lib/format";
import { errMsg } from "@/lib/tx";

/** Terminal network switch. Launchpad stays on Base; this only changes the markets the terminal shows. */
export function NetPicker() {
  const net = useNet();
  const sol = useSol();
  const [open, setOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [err, setErr] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    addEventListener("mousedown", f);
    return () => removeEventListener("mousedown", f);
  }, [open]);
  const n = NETS[net];
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-2 text-xs font-medium hover:border-muted sm:px-2.5" title={`${n.label} markets`}>
        <img src={n.logo} alt="" className="h-4 w-4 rounded-full" />
        <span className="hidden xl:inline">{n.label}</span>
        <svg viewBox="0 0 24 24" className="h-3 w-3 text-dim" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="fixed left-2 right-2 top-14 z-50 rounded-xl border border-line bg-panel p-1.5 shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-72">
          {NET_LIST.map((x) => (
            <button
              key={x.id}
              onClick={() => (setNet(x.id), x.id !== "solana" && setOpen(false))}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-panel-2 ${x.id === net ? "bg-panel-2" : ""}`}
            >
              <img src={x.logo} alt="" className="h-5 w-5 rounded-full" />
              <span className="flex-1">{x.label}</span>
              {x.id === net && <span className="text-accent-fg">✓</span>}
            </button>
          ))}
          {net === "solana" && (
            <div className="mt-1.5 border-t border-line px-2.5 pb-1 pt-2.5 text-xs">
              <p className="mb-2 text-dim">Buys are paid with ETH on Base from your trading wallets and delivered to this Solana address. Sells go to SOL through Jupiter.</p>
              {sol.address ? (
                <div className="flex items-center gap-2">
                  <span className="font-mono">{shortAddr(sol.address)}</span>
                  <span className={sol.canSign ? "text-up" : "text-dim"}>{sol.canSign ? "connected" : "receive only"}</span>
                  <button onClick={() => disconnectSol()} className="ml-auto text-muted hover:text-fg">Disconnect</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <button onClick={() => connectSol().then(() => setErr(""), (e) => setErr(errMsg(e)))} className="h-8 w-full rounded-lg bg-accent font-semibold text-accent-ink hover:opacity-90">Connect Phantom</button>
                  <div className="flex gap-1.5">
                    <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="or paste a Solana address" className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 font-mono outline-none focus:border-accent" />
                    <button onClick={() => { try { setSolAddress(paste); setErr(""); } catch (e) { setErr(errMsg(e)); } }} className="h-8 rounded-lg border border-line px-2.5 hover:border-muted">Save</button>
                  </div>
                </div>
              )}
              {err && <p className="mt-1.5 text-down">{err}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
