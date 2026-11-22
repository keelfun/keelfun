import Link from "next/link";
import { BRAND, SOCIALS } from "@/lib/config";
import { Logo } from "./Header";
import { Socials } from "./Socials";
import { BASE_DOCS, BuiltOnBase } from "./BuiltOnBase";

const T = "https://terminal.keelfun.app";
const COLS: [string, [string, string][]][] = [
  ["Launchpad", [["Discover", "/"], ["Launch a token", "/launch/"], ["Swap", "/swap/"], ["Bridge", "/bridge/"], ["Portfolio", "/portfolio/"]]],
  ["Terminal", [["Pulse", `${T}/`], ["Base trending", `${T}/discover/`], ["Hyperliquid", `${T}/perps/`], ["Wallets", `${T}/wallets/`], ["Traders", `${T}/traders/`], ["Chain", `${T}/chain/`]]],
  ["Protocol", [["Buyback", "/buyback/"], ["Flywheel", "/flywheel/"], ["Revenue", "/revenue/"], ["Platform fees", "/admin/"]]],
  ["Learn", [[`How ${BRAND} works`, "/docs/"], ["Fees, explained", "/docs/"], ["Holder rewards", "/docs/"], ["Developer API", "/api/"]]],
  ["Build", [[`Build on ${BRAND}`, "/builders/"], ["Builder programme", "/builders/#join"], ["Build on Base ↗", BASE_DOCS], ["Base ecosystem ↗", "https://www.base.org/ecosystem"]]],
];

export function Footer() {
  return (
    <>
    <footer className="site-footer border-t border-line">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-12 sm:px-6 sm:grid-cols-3 lg:grid-cols-[1.6fr_repeat(5,1fr)]">
        <div className="col-span-2 sm:col-span-3 lg:col-span-1">
          <div className="flex items-center gap-2">
            <Logo className="h-6 w-6" />
            <span className="font-serif text-2xl">{BRAND}</span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            Fair launches on Base. Every trade settles in a Uniswap v4 pool, and {BRAND} never holds your funds.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <Socials />
          </div>
          <BuiltOnBase className="mt-4" />
        </div>
        {COLS.map(([title, links]) => (
          <div key={title}>
            <p className="text-sm text-dim">{title}</p>
            <ul className="mt-3 space-y-2.5">
              {links.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="text-sm text-fg/85 hover:text-fg">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-7xl flex-col gap-1 border-t border-line px-4 py-5 text-xs text-dim sm:flex-row sm:justify-between sm:px-6">
        <span>{BRAND} · Uniswap v4 · liquidity locked from block one</span>
        <span>© {new Date().getFullYear()} {BRAND}</span>
      </div>
    </footer>
    <footer className="term-footer hidden border-t border-line">
      <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-xs text-dim">
        <span className="flex items-center gap-2"><Logo className="h-4 w-4" />{BRAND} Terminal · Base</span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="https://keelfun.app/" className="hover:text-fg">{BRAND} ↗</Link>
          <Link href="https://keelfun.app/docs/" className="hover:text-fg">Docs</Link>
          <Link href="https://keelfun.app/api/" className="hover:text-fg">API</Link>
          <Socials />
        </span>
      </div>
    </footer>
    </>
  );
}
