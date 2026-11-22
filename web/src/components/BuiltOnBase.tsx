import Link from "next/link";

export const BASE_BLUE = "#0000FF";
export const BASE_DOCS = "https://docs.base.org/get-started/base";

export function BaseMark({ className = "h-4 w-4" }: { className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-[3px] ${className}`} style={{ background: BASE_BLUE }} />;
}

export function BuiltOnBase({ className = "" }: { className?: string }) {
  return (
    <a
      href="https://base.org"
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-2 rounded-full border border-line bg-panel/60 px-3 py-1.5 text-xs font-medium text-fg/90 hover:border-[#0000FF] hover:text-fg ${className}`}
    >
      <BaseMark className="h-3.5 w-3.5" />
      Built on Base
    </a>
  );
}

export function BuildOnBaseCta() {
  return (
    <section className="mx-auto mt-12 max-w-7xl">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-panel px-6 py-14 text-center sm:px-10 sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: "radial-gradient(60% 80% at 50% 0%, rgba(0,0,255,.45), transparent 70%)" }}
        />
        <div className="relative">
          <BuiltOnBase />
          <h2 className="mt-5 font-serif text-4xl leading-tight sm:text-5xl">Start building on Base.</h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-fg/75">
            Build on the open economy. Fast, liquid and always on. Launch your token on Keelfun in one transaction.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <a
              href={BASE_DOCS}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
              style={{ background: BASE_BLUE }}
            >
              <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-[3px] bg-white" />
              Build on Base
            </a>
            <Link href="/launch/" className="rounded-full border border-line-2 px-5 py-2.5 text-sm font-medium text-fg hover:bg-fg/5">
              Launch a token
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
