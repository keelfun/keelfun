"use client";
/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { isAddress, parseEther, parseEventLogs } from "viem";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useBalance, useWriteContract } from "wagmi";
import { launchFactoryAbi } from "@/lib/abis";
import { api, saveMetadata, uploadImage, type Stats } from "@/lib/api";
import { ADDR, chain, DEPLOYED, FEE_TIERS, SUPPLY_TIERS } from "@/lib/config";
import { fmtEth, fmtPrice, fmtUsd } from "@/lib/format";
import { errMsg, useConfirm, useEnsureWallet } from "@/lib/tx";

const input =
  "h-12 w-full rounded-2xl border border-line bg-panel px-4 text-sm outline-none placeholder:text-dim focus:border-accent/60";

// Every supply tier starts at the same market cap: tokens per ETH at the factory's start tick (200200).
const START_CAP_ETH = 1e9 / Math.pow(1.0001, 200200);

function Section({ n, title, sub, children }: { n: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="pt-2">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-panel-2 px-1.5 font-mono text-xs text-muted">{String(n).padStart(2, "0")}</span>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      {sub && <p className="-mt-2 mb-5 max-w-2xl text-sm leading-relaxed text-muted">{sub}</p>}
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-baseline justify-between text-sm font-medium text-fg">
        <span>{label}</span>
        {hint && <span className="text-dim">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Pills<T extends string | number>({ options, value, onChange }: { options: { v: T; label: string; sub?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          onClick={() => onChange(o.v)}
          className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
            value === o.v ? "border-accent bg-accent/10 text-fg" : "border-line bg-panel-2 text-muted hover:border-line-2"
          }`}
        >
          <p className="truncate text-sm font-medium">{o.label}</p>
          {o.sub && <p className="mt-0.5 truncate text-[11px] text-dim">{o.sub}</p>}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, set, label, sub }: { on: boolean; set: (v: boolean) => void; label: string; sub: string }) {
  return (
    <button type="button" onClick={() => set(!on)} className="flex w-full items-center justify-between gap-4 rounded-2xl border border-line bg-panel p-4 text-left hover:border-line-2">
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-dim">{sub}</span>
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-line-2"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-4.5" : "left-0.5"}`} />
      </span>
    </button>
  );
}

const SUPPLY_LABELS = ["1B", "10B", "100B", "1T"];

type Split = { address: string; pct: string };

export default function LaunchPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { data: bal } = useBalance({ address, chainId: chain.id });
  const ensureWallet = useEnsureWallet();
  const confirm = useConfirm();
  const { writeContractAsync } = useWriteContract();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [x, setX] = useState("");
  const [telegram, setTelegram] = useState("");
  const [discord, setDiscord] = useState("");
  const [tier, setTier] = useState(0);
  const [feeBps, setFeeBps] = useState(100);
  const [route, setRoute] = useState<"creator" | "holders" | "split">("creator");
  const [splits, setSplits] = useState<Split[]>([{ address: "", pct: "50" }, { address: "", pct: "50" }]);
  const [antiSnipe, setAntiSnipe] = useState(true);
  const [buy, setBuy] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fee = FEE_TIERS.find((f) => f.bps === feeBps)!;
  const routePct = (fee.bps - fee.platformBps) / 100;
  const buyEth = Number(buy || 0);
  const splitTotal = splits.reduce((a, s) => a + Number(s.pct || 0), 0);
  const splitOk =
    route !== "split" ||
    (splits.every((s) => isAddress(s.address) && Number(s.pct) > 0) &&
      Math.abs(splitTotal - 100) < 1e-9 &&
      new Set(splits.map((s) => s.address.toLowerCase())).size === splits.length);
  const valid = name.trim().length > 0 && name.length <= 32 && /^[A-Za-z0-9]{1,10}$/.test(symbol) && buyEth >= 0 && splitOk;

  function pickFile(f: File | null) {
    setError(null);
    if (f && f.size > 1_000_000) return setError("Image must be under 1 MB");
    if (f && !/^image\/(png|jpeg|gif|webp)$/.test(f.type)) return setError("Use a PNG, JPG, GIF or WEBP image");
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function setSplit(i: number, patch: Partial<Split>) {
    setSplits((s) => s.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || step) return;
    setError(null);
    try {
      setStep("Connecting wallet…");
      const account = await ensureWallet();
      let image = "";
      if (file) {
        setStep("Uploading image…");
        image = await uploadImage(file);
      }
      setStep("Saving metadata…");
      const meta: Record<string, string> = { description, image, website, x, telegram, discord };
      const qs = new URLSearchParams(window.location.search).get("ref");
      if (qs) localStorage.setItem("keel-ref", qs);
      const builder = (qs || localStorage.getItem("keel-ref") || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
      if (builder.length >= 3) meta.builder = builder;
      const uri = await saveMetadata(Object.fromEntries(Object.entries(meta).filter(([, v]) => v.trim())));
      const recipients =
        route === "holders" ? [] : route === "creator" ? [account] : splits.map((s) => s.address as `0x${string}`);
      const bps = route === "split" ? splits.map((s) => Math.round(Number(s.pct) * 100)) : route === "creator" ? [10_000] : [];
      if (route === "split") bps[bps.length - 1] += 10_000 - bps.reduce((a, b) => a + b, 0);
      setStep("Confirm in wallet…");
      const hash = await writeContractAsync({
        address: ADDR.factory,
        abi: launchFactoryAbi,
        functionName: "launch",
        args: [
          {
            name: name.trim(),
            symbol: symbol.toUpperCase(),
            metadataURI: uri,
            supplyTier: tier,
            feeBps,
            antiSnipe,
            holders: route === "holders",
            recipients,
            shares: bps,
            minTokensOut: 0n,
          },
        ],
        value: parseEther(buy || "0"),
        chainId: chain.id,
      });
      setStep("Launching…");
      const receipt = await confirm(hash);
      const [ev] = parseEventLogs({ abi: launchFactoryAbi, logs: receipt.logs, eventName: "TokenLaunched" });
      router.push(`/token/?a=${ev.args.token}`);
    } catch (err) {
      setError(errMsg(err));
      setStep(null);
    }
  }

  const routeLabel = route === "holders" ? "Holders" : route === "creator" ? "You" : `${splits.length} wallets`;

  const [devBuy, setDevBuy] = useState(false);
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => api<Stats>("/stats"), refetchInterval: 60_000 });
  const ethUsd = stats.data?.ethUsd ?? 0;
  const supply = SUPPLY_TIERS[tier];
  const startPriceEth = START_CAP_ETH / supply;
  const usd = (eth: number) => (ethUsd > 0 ? fmtUsd(eth * ethUsd) : null);

  return (
    <div className="mx-auto max-w-7xl pt-8 sm:pt-12">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Launch a token</h1>
      <p className="mt-2 text-sm text-muted sm:text-base">Mint a fixed-supply token and seed its locked Uniswap v4 pool on {chain.name} in one transaction.</p>

      <form onSubmit={submit} className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_480px]">
        <div className="min-w-0 space-y-10">
          <Section n={1} title="Token Identity">
            <div className="grid gap-5 sm:grid-cols-[220px_minmax(0,1fr)]">
              <label className="mx-auto flex aspect-square w-40 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-line-2 bg-panel text-sm text-muted hover:border-accent/60 sm:w-[220px]">
                {preview ? (
                  <img src={preview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="m4 18 5-5 4 4 3-3 4 4" /></svg>
                    <span>Logo</span>
                  </>
                )}
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
              </label>
              <div className="min-w-0 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Token name *" hint={`${name.length}/32`}>
                    <input className={input} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Token name" />
                  </Field>
                  <Field label="Token symbol *">
                    <input className={`${input} uppercase`} value={symbol} maxLength={10} onChange={(e) => setSymbol(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} placeholder="TOKEN" />
                  </Field>
                </div>
                <Field label="Paired asset *">
                  <div className={`${input} flex items-center gap-2.5`}>
                    <img src="https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg" alt="" className="h-6 w-6 rounded-full" />
                    <span className="font-medium">ETH</span>
                    <span className="ml-auto rounded-full bg-panel-2 px-2.5 py-0.5 text-xs text-muted">Uniswap v4</span>
                  </div>
                </Field>
                <details className="group rounded-2xl border border-line bg-panel" open>
                  <summary className="flex h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium">
                    Market details
                    <span className="ml-auto rounded-full bg-up/15 px-2.5 py-0.5 text-xs text-up">Launch enabled</span>
                    <span className="text-dim transition-transform group-open:rotate-180">▾</span>
                  </summary>
                  <div className="border-t border-line p-4">
                    <p className="mb-2 text-xs text-muted">Total supply</p>
                    <Pills value={tier} onChange={setTier} options={SUPPLY_TIERS.map((_, i) => ({ v: i, label: SUPPLY_LABELS[i], sub: "tokens" }))} />
                    <p className="mt-2 text-xs text-dim">Every supply starts at the same market cap. Only the unit price changes.</p>
                  </div>
                </details>
              </div>
            </div>
            <div className="mt-5 space-y-5">
              <Field label="Description" hint="optional">
                <textarea className={`${input} h-28 resize-y py-3`} value={description} maxLength={600} onChange={(e) => setDescription(e.target.value)} placeholder="What is this token about?" />
              </Field>
              <div>
                <p className="mb-2 text-sm font-medium">Links (optional)</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ["https://", website, setWebsite, "yourproject.xyz"],
                      ["x.com/", x, setX, "yourproject"],
                      ["t.me/", telegram, setTelegram, "yourproject"],
                    ] as const
                  ).map(([pre, v, set, ph]) => (
                    <div key={pre} className={`${input} flex items-center gap-0.5`}>
                      <span className="text-muted">{pre}</span>
                      <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-dim" value={v.replace(/^https?:\/\/(www\.)?(x\.com\/|twitter\.com\/|t\.me\/)?/, "")} onChange={(e) => set(e.target.value ? `https://${pre === "https://" ? "" : pre}${e.target.value.replace(/^https?:\/\//, "")}` : "")} placeholder={ph} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section n={2} title="Token Taxes" sub={`The trade fee applies to every buy and sell through the launch pool and includes the protocol fee. It is paid in ETH and fixed at launch. Ordinary wallet transfers are untaxed.`}>
            <div className="space-y-6">
              <Field label="Trade fee" hint={`protocol takes ${fee.platformBps / 100}% of it`}>
                <Pills value={feeBps} onChange={setFeeBps} options={FEE_TIERS.map((f) => ({ v: f.bps, label: `${f.bps / 100}%`, sub: `${(f.bps - f.platformBps) / 100}% to you` }))} />
              </Field>
              <Field label="Tax allocation" hint={`${routePct}% of each trade after protocol`}>
                <Pills
                  value={route}
                  onChange={setRoute}
                  options={[
                    { v: "creator", label: "Creator funds", sub: "your wallet" },
                    { v: "holders", label: "Holder dividends", sub: "ETH, pro-rata" },
                    { v: "split", label: "Split wallets", sub: "up to 4 wallets" },
                  ]}
                />
              </Field>
              {route === "creator" && (
                <div className="rounded-2xl border border-line bg-panel p-4 text-sm">
                  <p className="font-medium">Creator funds recipient</p>
                  <p className="mt-1 font-mono text-xs text-muted">{address ?? "Your connected wallet"}</p>
                </div>
              )}
              {route === "holders" && (
                <p className="text-sm leading-relaxed text-muted">{routePct}% of every trade is paid in ETH to everyone holding the token, pro-rata to their balance. Holders claim anytime.</p>
              )}
              {route === "split" && (
                <div className="space-y-2">
                  {splits.map((sp, i) => (
                    <div key={i} className="flex gap-2">
                      <input className={`${input} font-mono text-xs`} value={sp.address} onChange={(e) => setSplit(i, { address: e.target.value.trim() })} placeholder="0x… wallet" />
                      <div className="relative w-24 shrink-0">
                        <input className={`${input} pr-7 font-mono`} inputMode="decimal" value={sp.pct} onChange={(e) => setSplit(i, { pct: e.target.value.replace(/[^0-9.]/g, "") })} />
                        <span className="absolute top-3.5 right-3 text-xs text-dim">%</span>
                      </div>
                      {splits.length > 2 && (
                        <button type="button" className="px-1 text-dim hover:text-down" onClick={() => setSplits(splits.filter((_, j) => j !== i))}>×</button>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between text-xs">
                    {splits.length < 4 ? (
                      <button type="button" className="text-accent hover:underline" onClick={() => setSplits([...splits, { address: "", pct: "0" }])}>+ Add wallet</button>
                    ) : (
                      <span />
                    )}
                    <span className={Math.abs(splitTotal - 100) < 1e-9 ? "text-dim" : "text-down"}>total {splitTotal}%</span>
                  </div>
                </div>
              )}
            </div>
          </Section>

          <Section n={3} title="Launch Options">
            <div className="space-y-3">
              <Toggle on={devBuy} set={(v) => { setDevBuy(v); if (!v) setBuy(""); }} label="Include Dev Buy" sub="Buy tokens as part of the launch, in the same transaction. Tax-free." />
              {devBuy && (
                <div className="rounded-2xl border border-line bg-panel p-4">
                  <Field label="Amount" hint={bal ? `balance ${fmtEth(Number(bal.formatted))}` : undefined}>
                    <div className="relative">
                      <input className={`${input} bg-bg pr-14 font-mono`} inputMode="decimal" value={buy} onChange={(e) => setBuy(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.0" />
                      <span className="absolute top-3.5 right-4 text-xs text-dim">ETH</span>
                    </div>
                  </Field>
                  <div className="mt-2 flex gap-2">
                    {["0.01", "0.05", "0.1", "0.5"].map((v) => (
                      <button key={v} type="button" onClick={() => setBuy(v)} className="rounded-lg border border-line px-2.5 py-1 font-mono text-xs text-muted hover:text-fg">{v}</button>
                    ))}
                  </div>
                </div>
              )}
              <Toggle on={antiSnipe} set={setAntiSnipe} label="Enable anti-sniping" sub="Buys start with a 90% fee that drops to 0 over 60 seconds. The dev buy skips it." />
            </div>
            <p className="mt-5 text-xs leading-relaxed text-dim">The token and its Uniswap v4 market go live together, priced in ETH. The fixed supply is minted once and seeded into a pool whose liquidity stays locked forever.</p>
          </Section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-3xl border border-line bg-panel p-5">
            <p className="text-xs text-muted">Live preview</p>
            <div className="mt-3 flex items-center gap-3">
              {preview ? (
                <img src={preview} alt="" className="h-12 w-12 rounded-xl object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-lg font-semibold text-white">{(symbol || name || "T").slice(0, 1).toUpperCase()}</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">{name || "Your token"}</p>
                <p className="text-sm text-muted">{(symbol || "TOKEN").toUpperCase()}/ETH</p>
              </div>
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">NEW</span>
            </div>
            <p className="mt-4 line-clamp-3 text-sm text-fg/80">{description || "Fixed-supply token trading on a locked Uniswap v4 pool."}</p>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted">Start price</p>
                <p className="mt-1 font-medium">≈ {usd(startPriceEth) ?? `${fmtPrice(startPriceEth)} ETH`}</p>
                <p className="mt-0.5 text-xs text-dim">{fmtPrice(startPriceEth)} ETH</p>
              </div>
              <div>
                <p className="text-xs text-muted">Launch cap</p>
                <p className="mt-1 font-medium">≈ {usd(START_CAP_ETH) ?? fmtEth(START_CAP_ETH)}</p>
                <p className="mt-0.5 text-xs text-dim">{START_CAP_ETH.toFixed(4)} ETH</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-panel-2 px-2.5 py-1 text-xs"><img src="https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg" alt="" className="h-4 w-4 rounded-full" />ETH</span>
              <span className="rounded-full bg-up/15 px-2.5 py-1 text-xs text-up">LP locked</span>
              {antiSnipe && <span className="rounded-full bg-panel-2 px-2.5 py-1 text-xs text-muted">Anti-snipe</span>}
            </div>
          </div>

          <div className="rounded-3xl border border-line bg-panel p-5">
            <dl className="space-y-3 text-sm">
              {(
                [
                  ["Fixed supply", SUPPLY_LABELS[tier]],
                  ["Pool model", "Locked pool"],
                  ["Launch market cap", `≈ ${usd(START_CAP_ETH) ?? fmtEth(START_CAP_ETH)}`],
                  ["Trade fee", `${feeBps / 100}%`],
                  [`→ ${routeLabel}`, `${routePct}%`],
                  ["→ Protocol", `${fee.platformBps / 100}%`],
                  ["Dev buy", buyEth ? `${buyEth} ETH` : "None"],
                  ["Paired asset", "ETH"],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <button type="submit" disabled={!valid || !!step || !DEPLOYED} className="mt-5 h-14 w-full rounded-full bg-[#7fd4ff] text-base font-semibold text-[#05070d] transition-opacity hover:opacity-90 disabled:opacity-40">
              {!DEPLOYED ? "Contracts not deployed yet" : step ?? (address ? "Launch token" : "Connect wallet")}
            </button>
            <p className="mt-3 text-center text-xs text-dim">You&apos;ll confirm the transaction in your wallet. Nothing is minted until you submit.</p>
            {error && <p className="mt-3 text-xs text-down">{error}</p>}
            {route === "split" && !splitOk && <p className="mt-3 text-xs text-dim">Split needs unique valid wallets totaling 100%.</p>}
          </div>
        </aside>
      </form>
    </div>
  );
}
