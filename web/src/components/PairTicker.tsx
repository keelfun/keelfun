import { PAIRS } from "@/lib/config";

const fmtUsd = (v: number) =>
  v >= 1000 ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : v >= 1 ? `$${v.toFixed(2)}` : `$${v.toPrecision(3)}`;

export function PairTicker() {
  const items = PAIRS.filter((p) => p.logo);
  return (
    <div className="relative left-1/2 mb-6 w-screen -translate-x-1/2 overflow-hidden border-y border-line bg-panel/40 py-2.5 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div className="anim-marquee flex w-max gap-7">
        {[0, 1].map((k) => (
          <div key={k} aria-hidden={k === 1} className="flex shrink-0 gap-7">
            {items.map((p) => (
              <span key={p.address} className="flex items-center gap-2 whitespace-nowrap text-xs">
                <img src={p.logo} alt="" loading="lazy" className="h-5 w-5 rounded-full bg-panel-2 object-cover" />
                <span className="font-medium text-fg">{p.symbol}</span>
                {p.usd ? <span className="font-mono text-muted">{fmtUsd(p.usd)}</span> : <span className="text-dim">pair</span>}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
