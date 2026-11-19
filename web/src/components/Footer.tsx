import Link from "next/link";
import { BRAND } from "@/lib/config";
import { Logo } from "./Header";
import { Socials } from "./Socials";

const COLS: [string, [string, string][]][] = [
  [BRAND, [["Discover", "/"], ["Launch a token", "/launch/"], ["Portfolio", "/portfolio/"]]],
  ["Learn", [[`How ${BRAND} works`, "/docs/"], ["Fees, explained", "/docs/"], ["Holder rewards", "/docs/"]]],
];

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <Logo className="h-6 w-6" />
            <span className="font-serif text-2xl">{BRAND}</span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            Fair launches on Base. Every trade settles in a Uniswap v4 pool, and {BRAND} never holds your funds.
          </p>
          <Socials className="mt-4" />
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
      <div className="mx-auto flex max-w-7xl justify-between border-t border-line px-4 py-5 text-xs text-dim sm:px-6">
        <span>{BRAND} · Uniswap v4 · liquidity locked from block one</span>
        <span>© {new Date().getFullYear()} {BRAND}</span>
      </div>
    </footer>
  );
}
