"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND, chain } from "@/lib/config";
import { ConnectButton } from "./ConnectButton";
import { LangButton, ThemeButton } from "./Prefs";

const NAV = [
  { href: "/", label: "Discover" },
  { href: "/launch/", label: "Launch" },
  { href: "/swap/", label: "Swap" },
  { href: "/portfolio/", label: "Portfolio" },
  { href: "/buyback/", label: "Buyback" },
  { href: "/flywheel/", label: "Flywheel" },
  { href: "/revenue/", label: "Revenue" },
  { href: "/bridge/", label: "Bridge" },
  { href: "/builders/", label: "Builders" },
  { href: "/docs/", label: "Docs" },
  { href: "/api/", label: "API" },
];

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
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href.replace(/\/$/, "")));
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Logo className="h-7 w-7" />
          <span className="text-[15px] font-semibold tracking-tight">{BRAND}</span>
        </Link>
        <nav className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-lg px-2 py-1.5 text-sm transition-colors xl:px-2.5 ${active(n.href) ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}
            >
              {n.label}
            </Link>
          ))}
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
          <LangButton />
          <ThemeButton />
          <ConnectButton />
        </div>
      </div>
      <nav className="no-scrollbar flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 [mask-image:linear-gradient(to_right,black_85%,transparent)] lg:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm ${active(n.href) ? "bg-panel-2 text-fg" : "text-muted"}`}
          >
            {n.label}
          </Link>
        ))}
        {chain.testnet && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 px-2 font-mono text-[11px] text-warn">testnet</span>
        )}
      </nav>
    </header>
  );
}
