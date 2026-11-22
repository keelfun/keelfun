"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BRAND, chain } from "@/lib/config";
import { ConnectButton } from "./ConnectButton";
import { LangButton, ThemeButton } from "./Prefs";
import { SearchK } from "./SearchK";
import { useVault } from "@/lib/vault";

export const TERMINAL_URL = "https://terminal.keelfun.app";
const TERM = [
  { href: "/discover/", label: "Discover", desc: "Trending tokens on Base" },
  { href: "/", label: "Pulse", desc: "New, trending and top Base pairs, live" },
  { href: "/traders/", label: "Traders", desc: "PnL leaderboard" },
  { href: "/chain/", label: "Chain", desc: "Base volume by DEX" },
  { href: "/perps/", label: "Hyperliquid", desc: "Perps on Hyperliquid" },
  { href: "/portfolio/", label: "Portfolio", desc: "Your wallets, or any address" },
  { href: "/wallets/", label: "Wallets", desc: "Trading wallets for one-click buys" },
];
const TERM_MORE = [
  { href: "/upcoming/", label: "Upcoming launches" },
  { href: "/buyback/", label: "Buyback & burn" },
  { href: "https://keelfun.app/", label: "Keelfun ↗" },
];
const PRIMARY = [
  { href: "/", label: "Discover" },
  { href: "/launch/", label: "Launch" },
  { href: "/swap/", label: "Swap" },
  { href: "/portfolio/", label: "Portfolio" },
  { href: "/bridge/", label: "Bridge" },
];
const MORE = [
  { href: "/buyback/", label: "Buyback" },
  { href: "/flywheel/", label: "Flywheel" },
  { href: "/revenue/", label: "Revenue" },
  { href: "/builders/", label: "Builders" },
  { href: "/docs/", label: "Docs" },
  { href: "/api/", label: "API" },
];
const NAV = [...PRIMARY, ...MORE];

function MoreMenu({ active, items = MORE }: { active: (h: string) => boolean; items?: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  const on = items.some((m) => active(m.href));
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button onClick={() => setOpen((v) => !v)} onMouseEnter={() => setOpen(true)} className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm xl:px-2.5 ${on ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}>
        More <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 pt-1">
          <div className="w-44 rounded-xl border border-line bg-panel p-1 shadow-2xl">
            {items.map((m) => (
              <Link key={m.href} href={m.href} className={`block rounded-lg px-3 py-2 text-sm ${active(m.href) ? "bg-panel-2 text-fg" : "text-muted hover:bg-panel-2 hover:text-fg"}`}>
                {m.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TerminalMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button onClick={() => setOpen((v) => !v)} onMouseEnter={() => setOpen(true)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-muted hover:text-fg xl:px-2.5">
        Terminal <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 pt-1">
          <div className="w-64 rounded-xl border border-line bg-panel p-1 shadow-2xl">
            {TERM.map((m) => (
              <a key={m.href} href={`${TERMINAL_URL}${m.href}`} className="block rounded-lg px-3 py-2 hover:bg-panel-2">
                <span className="block text-sm text-fg">{m.label}</span>
                <span className="block text-xs text-dim">{m.desc}</span>
              </a>
            ))}
            <a href={TERMINAL_URL} className="mt-1 block rounded-lg border-t border-line px-3 py-2 text-xs text-accent hover:bg-panel-2">Open terminal.keelfun.app ↗</a>
          </div>
        </div>
      )}
    </div>
  );
}

export function useIsTerminal() {
  const [t, setT] = useState(false);
  useEffect(() => setT(location.hostname.startsWith("terminal.")), []);
  return t;
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-accent" />
      <path fill="#fff" d="M16.6 5.5v10.3h8.2z" />
      <path fill="#fff" fillOpacity=".55" d="M15 8.5v7.3H9.4z" />
      <path fill="#fff" d="M5.5 18h21l-3.6 4.6H9.1z" />
      <path fill="#0b1640" d="M14.2 22.6h3.6L16 27.5z" />
    </svg>
  );
}

export function Header() {
  const path = usePathname();
  const term = useIsTerminal();
  const active = (href: string) =>
    href === "/" ? path === "/" || (term && path.startsWith("/terminal")) : path.startsWith(href.replace(/\/$/, ""));
  if (term) return <TerminalHeader active={active} />;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Logo className="h-7 w-7" />
          <span className="text-[15px] font-semibold tracking-tight">{BRAND}</span>
        </Link>
        <nav className="hidden items-center gap-0.5 lg:flex">
          <Link href="/" className={`rounded-lg px-2 py-1.5 text-sm transition-colors xl:px-2.5 ${active("/") ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}>Discover</Link>
          <TerminalMenu />
          {PRIMARY.slice(1).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-lg px-2 py-1.5 text-sm transition-colors xl:px-2.5 ${active(n.href) ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}
            >
              {n.label}
            </Link>
          ))}
          <MoreMenu active={active} />
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 font-mono text-[11px] text-muted xl:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${chain.testnet ? "bg-warn" : "bg-accent"}`} />
            {chain.name}
          </span>
          <Link
            href="/launch/"
            className="hidden h-9 items-center whitespace-nowrap rounded-lg border border-accent/40 px-3 text-sm font-medium text-accent hover:bg-accent/10 sm:flex lg:hidden xl:flex"
          >
            + Launch
          </Link>
          <SearchK />
          <LangButton />
          <ThemeButton />
          <ConnectButton />
        </div>
      </div>
      <nav className="no-scrollbar flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 [mask-image:linear-gradient(to_right,black_85%,transparent)] lg:hidden">
        {NAV.map((n, i) => (
          <span key={n.href} className="contents">
            <Link href={n.href} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm ${active(n.href) ? "bg-panel-2 text-fg" : "text-muted"}`}>
              {n.label}
            </Link>
            {i === 0 && (
              <a href={TERMINAL_URL} className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-accent">Terminal ↗</a>
            )}
          </span>
        ))}
        {chain.testnet && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 px-2 font-mono text-[11px] text-warn">testnet</span>
        )}
      </nav>
    </header>
  );
}

function GearMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-label="Settings" className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted hover:text-fg">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 flex items-center gap-2 rounded-xl border border-line bg-panel p-2 shadow-2xl">
          <span className="text-xs text-dim">Language</span>
          <LangButton />
          <span className="ml-1 text-xs text-dim">Theme</span>
          <ThemeButton />
        </div>
      )}
    </div>
  );
}

function VaultButton() {
  const v = useVault();
  const n = v.data?.wallets.length ?? 0;
  const label = !v.exists ? "Set up wallets" : v.data ? `${n} wallet${n === 1 ? "" : "s"}` : "Unlock vault";
  return (
    <Link href="/wallets/" className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium ${v.data ? "border border-line text-fg hover:bg-panel-2" : "bg-fg text-bg hover:opacity-90"}`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M16 15h2" /></svg>
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}

function TerminalHeader({ active }: { active: (h: string) => boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="flex h-14 items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Logo className="h-7 w-7" />
          <span className="text-[15px] font-semibold tracking-tight">{BRAND}</span>
        </Link>
        <nav className="hidden items-center gap-0.5 lg:flex">
          {TERM.map((n) => (
            <Link key={n.href} href={n.href} className={`rounded-lg px-2.5 py-1.5 text-sm ${active(n.href) ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}>
              {n.label}
            </Link>
          ))}
          <MoreMenu active={active} items={TERM_MORE} />
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
          <SearchK wide />
          <a href="https://keelfun.app/launch/" aria-label="Launch a token" title="Launch a token" className="hidden h-9 w-9 items-center justify-center rounded-full border border-accent/40 text-accent hover:bg-accent/10 sm:flex">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z" /><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5" /></svg>
          </a>
          <GearMenu />
          <VaultButton />
          <ConnectButton />
        </div>
      </div>
      <nav className="no-scrollbar flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 lg:hidden">
        {[...TERM, ...TERM_MORE].map((n) => (
          <Link key={n.href} href={n.href} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm ${active(n.href) ? "bg-panel-2 text-fg" : "text-muted"}`}>
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
