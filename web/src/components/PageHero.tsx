export function PageHero({ title, sub, children }: { title: React.ReactNode; sub: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="relative left-1/2 mb-8 w-screen -translate-x-1/2 overflow-hidden">
      <img src="/art/hero.webp" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[30%_18%] opacity-85" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg/85 via-bg/35 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/20 via-transparent to-bg" />
      <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-14 sm:px-6 sm:pb-12 sm:pt-24">
        <h1 className="font-serif text-5xl leading-[1.02] tracking-tight sm:text-7xl">{title}</h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-fg/80 sm:text-base">{sub}</p>
        {children}
      </div>
    </section>
  );
}

export function Em({ children }: { children: React.ReactNode }) {
  return <em className="text-accent-soft">{children}</em>;
}

export function Num({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 border-t border-line pt-6">
      <span className="font-serif text-5xl text-fg/40">{n}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Faq({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map(([q, a]) => (
        <details key={q} className="group py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm text-fg">
            {q}
            <span className="text-dim transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{a}</div>
        </details>
      ))}
    </div>
  );
}
