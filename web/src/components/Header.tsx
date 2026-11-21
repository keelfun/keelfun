"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BRAND, chain } from "@/lib/config";
import { ConnectButton } from "./ConnectButton";
import { LangButton, ThemeButton } from "./Prefs";
import { SearchK } from "./SearchK";

export const TERMINAL_URL = "https://terminal.keelfun.app";
const TERM = [
  { href: "/", label: "Pulse", desc: "New, trending and top Base pairs, live" },
  { href: "/trending/", label: "Trending", desc: "Trending tokens on Base" },
  { href: "/traders/", label: "Traders", desc: "PnL leaderboard" },
  { href: "/chain/", label: "Chain", desc: "Base volume by DEX" },
  { href: "/portfolio/", label: "Portfolio", desc: "Any wallet, read-only" },
  { href: "/wallets/", label: "Wallets", desc: "Trading wallets for one-click buys" },
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

function MoreMenu({ active }: { active: (h: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  const on = MORE.some((m) => active(m.href));
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button onClick={() => setOpen((v) => !v)} onMouseEnter={() => setOpen(true)} className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm xl:px-2.5 ${on ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}>
        More <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 pt-1">
          <div className="w-44 rounded-xl border border-line bg-panel p-1 shadow-2xl">
            {MORE.map((m) => (
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

function TerminalHeader({ active }: { active: (h: string) => boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="flex h-14 items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Logo className="h-7 w-7" />
          <span className="text-[15px] font-semibold tracking-tight">
            {BRAND} <span className="font-normal italic text-accent-soft">Terminal</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-0.5 lg:flex">
          {TERM.map((n) => (
            <Link key={n.href} href={n.href} className={`rounded-lg px-2.5 py-1.5 text-sm ${active(n.href) ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
          <a href="https://keelfun.app/" className="hidden h-9 items-center rounded-lg border border-line px-3 text-sm text-muted hover:text-fg sm:flex">{BRAND} ↗</a>
          <a href="https://keelfun.app/launch/" className="hidden h-9 items-center whitespace-nowrap rounded-lg border border-accent/40 px-3 text-sm font-medium text-accent hover:bg-accent/10 xl:flex">+ Launch</a>
          <SearchK />
          <LangButton />
          <ThemeButton />
          <ConnectButton />
        </div>
      </div>
      <nav className="no-scrollbar flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 lg:hidden">
        {TERM.map((n) => (
          <Link key={n.href} href={n.href} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm ${active(n.href) ? "bg-panel-2 text-fg" : "text-muted"}`}>
            {n.label}
          </Link>
        ))}
        <a href="https://keelfun.app/" className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-accent">{BRAND} ↗</a>
      </nav>
    </header>
  );
}
