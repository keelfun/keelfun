import Link from "next/link";
import { BRAND, SOCIALS } from "@/lib/config";
import { Logo } from "./Header";
import { Socials } from "./Socials";

const COLS: [string, [string, string][]][] = [
  [BRAND, [["Discover", "/"], ["Launch a token", "/launch/"], ["Swap", "/swap/"], ["Bridge", "/bridge/"], ["Portfolio", "/portfolio/"], ["Buyback", "/buyback/"], ["Flywheel", "/flywheel/"], ["Revenue", "/revenue/"], ["Builders", "/builders/"]]],
  ["Learn", [[`How ${BRAND} works`, "/docs/"], ["Fees, explained", "/docs/"], ["Holder rewards", "/docs/"]]],
  ["Build", [["Developer API", "/api/"], [`Build on ${BRAND}`, "/builders/"], ["Builder programme", "/builders/#join"], ["Platform fees", "/admin/"]]],
];

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2">
            <Logo className="h-6 w-6" />
            <span className="font-serif text-2xl">{BRAND}</span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            Fair launches on Base. Every trade settles in a Uniswap v4 pool, and {BRAND} never holds your funds.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <Socials />
            {SOCIALS.x && (
              <a href={SOCIALS.x} target="_blank" rel="noreferrer" className="text-sm text-muted hover:text-fg">
                @{SOCIALS.x.split("/").pop()}
              </a>
            )}
          </div>
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
  );
}
