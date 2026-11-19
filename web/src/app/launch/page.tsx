"use client";
/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { isAddress, parseEther, parseEventLogs } from "viem";
import { useAccount, useBalance, useWriteContract } from "wagmi";
import { launchFactoryAbi } from "@/lib/abis";
import { Em, PageHero } from "@/components/PageHero";
import { saveMetadata, uploadImage } from "@/lib/api";
import { ADDR, chain, DEPLOYED, FEE_TIERS, SUPPLY_TIERS } from "@/lib/config";
import { fmtEth } from "@/lib/format";
import { errMsg, useConfirm, useEnsureWallet } from "@/lib/tx";

const input =
  "h-11 w-full rounded-xl border border-line bg-panel-2 px-3 text-sm outline-none placeholder:text-dim focus:border-accent/60";

function Section({ n, title, sub, children }: { n: number; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-xs text-accent">{n}</span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-dim">{sub}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-xs text-muted">
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
          <p className="font-mono text-sm">{o.label}</p>
          {o.sub && <p className="mt-0.5 text-[11px] text-dim">{o.sub}</p>}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, set, label, sub }: { on: boolean; set: (v: boolean) => void; label: string; sub: string }) {
  return (
    <button type="button" onClick={() => set(!on)} className="flex w-full items-center justify-between gap-4 rounded-xl border border-line bg-panel-2 p-3 text-left">
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

  return (
    <div className="mx-auto max-w-5xl">
      <PageHero
        title={<>Launch a <Em>token</Em></>}
        sub={`One transaction on ${chain.name}. The full supply goes into a Uniswap v4 pool and the LP is locked forever. No presale, no team allocation.`}
      />

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Section n={1} title="Identity" sub="Name, ticker, image and links">
            <div className="space-y-4">
              <div className="flex gap-4">
                <label className="flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line-2 bg-panel-2 text-2xl text-dim hover:border-accent/60">
                  {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : "+"}
                  <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
                </label>
                <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_140px]">
                  <Field label="Name" hint={`${name.length}/32`}>
                    <input className={input} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Blue Whale" />
                  </Field>
                  <Field label="Ticker">
                    <input
                      className={`${input} font-mono uppercase`}
                      value={symbol}
                      maxLength={10}
                      onChange={(e) => setSymbol(e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
                      placeholder="WHALE"
                    />
                  </Field>
                </div>
              </div>
              <Field label="Description" hint="optional">
                <textarea
                  className={`${input} h-20 resize-none py-2.5`}
                  value={description}
                  maxLength={600}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this token about?"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className={input} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website (optional)" />
                <input className={input} value={x} onChange={(e) => setX(e.target.value)} placeholder="X link (optional)" />
                <input className={input} value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="Telegram (optional)" />
                <input className={input} value={discord} onChange={(e) => setDiscord(e.target.value)} placeholder="Discord (optional)" />
              </div>
            </div>
          </Section>

          <Section n={2} title="Market" sub="Paired with ETH on Base · Uniswap v4">
            <Field label="Total supply">
              <Pills
                value={tier}
                onChange={setTier}
                options={SUPPLY_TIERS.map((s, i) => ({ v: i, label: SUPPLY_LABELS[i], sub: s.toLocaleString("en-US") }))}
              />
            </Field>
            <p className="mt-2 text-[11px] text-dim">Same starting market cap for every supply, only the unit price changes.</p>
          </Section>

          <Section n={3} title="Fees" sub="Charged in ETH on every buy and sell">
            <div className="space-y-4">
              <Field label="Trade fee">
                <Pills
                  value={feeBps}
                  onChange={setFeeBps}
                  options={FEE_TIERS.map((f) => ({ v: f.bps, label: `${f.bps / 100}%`, sub: `${(f.bps - f.platformBps) / 100}% to you` }))}
                />
              </Field>
              <Field label="Fees go to">
                <Pills
                  value={route}
                  onChange={setRoute}
                  options={[
                    { v: "creator", label: "Creator", sub: "your wallet" },
                    { v: "holders", label: "Holders", sub: "pro-rata ETH" },
                    { v: "split", label: "Split", sub: "up to 4 wallets" },
                  ]}
                />
              </Field>
              {route === "split" && (
                <div className="space-y-2">
                  {splits.map((s, i) => (
                    <div key={i} className="flex gap-2">
                      <input className={`${input} font-mono text-xs`} value={s.address} onChange={(e) => setSplit(i, { address: e.target.value.trim() })} placeholder="0x… wallet" />
                      <div className="relative w-24 shrink-0">
                        <input className={`${input} pr-6 font-mono`} inputMode="decimal" value={s.pct} onChange={(e) => setSplit(i, { pct: e.target.value.replace(/[^0-9.]/g, "") })} />
                        <span className="absolute top-3 right-2.5 text-xs text-dim">%</span>
                      </div>
                      {splits.length > 2 && (
                        <button type="button" className="px-1 text-dim hover:text-down" onClick={() => setSplits(splits.filter((_, j) => j !== i))}>
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between text-xs">
                    {splits.length < 4 ? (
                      <button type="button" className="text-accent hover:underline" onClick={() => setSplits([...splits, { address: "", pct: "0" }])}>
                        + Add wallet
                      </button>
                    ) : (
                      <span />
                    )}
                    <span className={Math.abs(splitTotal - 100) < 1e-9 ? "text-dim" : "text-down"}>total {splitTotal}%</span>
                  </div>
                </div>
              )}
              {route === "holders" && (
                <p className="text-xs leading-relaxed text-dim">
                  {routePct}% of every trade is paid in ETH to everyone holding the token, pro-rata to their balance. Holders claim anytime.
                </p>
              )}
            </div>
          </Section>

          <Section n={4} title="Anti-snipe" sub="Protects the first minute">
            <Toggle on={antiSnipe} set={setAntiSnipe} label="Snipe tax" sub="Buys pay 90% tax at launch, decaying to 0 over 60 seconds" />
          </Section>

          <Section n={5} title="First buy" sub="Optional, in the launch transaction, tax-free">
            <Field label="Amount" hint={bal ? `balance ${fmtEth(Number(bal.formatted))}` : undefined}>
              <div className="relative">
                <input className={`${input} pr-14 font-mono`} inputMode="decimal" value={buy} onChange={(e) => setBuy(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.0" />
                <span className="absolute top-3 right-3 text-xs text-dim">ETH</span>
              </div>
            </Field>
            <div className="mt-2 flex gap-2">
              {["0.01", "0.05", "0.1", "0.5"].map((p) => (
                <button key={p} type="button" onClick={() => setBuy(p)} className="rounded-lg border border-line px-2.5 py-1 font-mono text-xs text-muted hover:text-fg">
                  {p}
                </button>
              ))}
            </div>
          </Section>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-line bg-panel p-5">
            <p className="text-xs text-dim">Preview</p>
            <div className="mt-3 flex items-center gap-3">
              {preview ? (
                <img src={preview} alt="" className="h-12 w-12 rounded-xl object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-panel-2 font-mono text-xs text-dim">{symbol.slice(0, 3) || "?"}</div>
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold">{name || "Token name"}</p>
                <p className="font-mono text-xs text-muted">${symbol.toUpperCase() || "TICKER"}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 border-t border-line pt-4 font-mono text-xs">
              <div className="flex justify-between"><dt className="text-dim">Network</dt><dd>{chain.name}</dd></div>
              <div className="flex justify-between"><dt className="text-dim">Pair</dt><dd>ETH · Uniswap v4</dd></div>
              <div className="flex justify-between"><dt className="text-dim">Supply</dt><dd>{SUPPLY_LABELS[tier]}</dd></div>
              <div className="flex justify-between"><dt className="text-dim">Trade fee</dt><dd>{feeBps / 100}%</dd></div>
              <div className="flex justify-between"><dt className="text-dim">→ {routeLabel}</dt><dd className="text-accent">{routePct}%</dd></div>
              <div className="flex justify-between"><dt className="text-dim">→ Platform</dt><dd>{fee.platformBps / 100}%</dd></div>
              <div className="flex justify-between"><dt className="text-dim">Anti-snipe</dt><dd>{antiSnipe ? "60s" : "off"}</dd></div>
              <div className="flex justify-between"><dt className="text-dim">First buy</dt><dd>{buyEth ? `${buyEth} ETH` : "none"}</dd></div>
              <div className="flex justify-between"><dt className="text-dim">LP</dt><dd className="text-accent">locked forever</dd></div>
            </dl>
            <button
              type="submit"
              disabled={!valid || !!step || !DEPLOYED}
              className="mt-5 h-12 w-full rounded-xl bg-accent text-sm font-semibold text-accent-ink transition-opacity disabled:opacity-40"
            >
              {!DEPLOYED ? "Contracts not deployed yet" : step ?? (address ? "Launch token" : "Connect & launch")}
            </button>
            {error && <p className="mt-3 text-xs text-down">{error}</p>}
            {route === "split" && !splitOk && <p className="mt-3 text-xs text-dim">Split needs unique valid wallets totaling 100%.</p>}
          </div>
        </aside>
      </form>
    </div>
  );
}
