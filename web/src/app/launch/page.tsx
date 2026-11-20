"use client";
/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { encodeAbiParameters, erc20Abi, getContractAddress, isAddress, keccak256, maxUint256, parseEventLogs, parseUnits, toHex } from "viem";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useBalance, usePublicClient, useWriteContract } from "wagmi";
import { launchFactoryAbi } from "@/lib/abis";
import { api, saveMetadata, uploadImage, type Stats } from "@/lib/api";
import { ADDR, chain, DEPLOYED, launchCap, PAIRS, platformBpsFor, SUPPLY_TIERS } from "@/lib/config";
import { fmtEth, fmtPrice, fmtUsd } from "@/lib/format";
import { PairLogo, PairPicker, shortName } from "@/components/PairPicker";
import { errMsg, useConfirm, useEnsureWallet } from "@/lib/tx";

const input =
  "h-12 w-full rounded-2xl border border-line bg-panel px-4 text-sm outline-none placeholder:text-dim focus:border-accent/60";


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

function Field({ label, hint, children, group }: { label: string; hint?: string; children: React.ReactNode; group?: boolean }) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className="block">
      <span className="mb-2 flex items-baseline justify-between text-sm font-medium text-fg">
        <span>{label}</span>
        {hint && <span className="text-dim">{hint}</span>}
      </span>
      {children}
    </Tag>
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
  const [pairIdx, setPairIdx] = useState(0);
  const [picker, setPicker] = useState(false);
  const [buyBps, setBuyBps] = useState(300);
  const [sellBps, setSellBps] = useState(300);
  const [alloc, setAlloc] = useState({ creator: 100, holders: 0, burn: 0 });
  const [split, setSplitMode] = useState(false);
  const [splits, setSplits] = useState<Split[]>([{ address: "", pct: "50" }, { address: "", pct: "50" }]);
  const [antiSnipe, setAntiSnipe] = useState(true);
  const [editable, setEditable] = useState(true);
  const [vanity, setVanity] = useState("");
  const [buy, setBuy] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const client = usePublicClient({ chainId: chain.id });

  const pair = PAIRS[pairIdx];
  const native = pair.symbol === "ETH";
  const allocTotal = alloc.creator + alloc.holders + alloc.burn;
  const buyAmt = Number(buy || 0);
  const splitTotal = splits.reduce((a, s) => a + Number(s.pct || 0), 0);
  const splitOk =
    alloc.creator === 0 ||
    !split ||
    (splits.every((s) => isAddress(s.address) && Number(s.pct) > 0) &&
      Math.abs(splitTotal - 100) < 1e-9 &&
      new Set(splits.map((s) => s.address.toLowerCase())).size === splits.length);
  const valid =
    name.trim().length > 0 && name.length <= 32 && /^[A-Za-z0-9]{1,10}$/.test(symbol) && buyAmt >= 0 && allocTotal === 100 && splitOk;
  const allocLabel =
    [alloc.creator && `${alloc.creator}% creator`, alloc.holders && `${alloc.holders}% holders`, alloc.burn && `${alloc.burn}% burn`]
      .filter(Boolean)
      .join(" · ") || "–";

  function setShare(k: keyof typeof alloc, v: number) {
    setAlloc((a) => ({ ...a, [k]: Math.max(0, Math.min(100, Math.round(v))) }));
  }

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

  /** Finds a CREATE2 salt whose token address sorts above the pair asset and ends with the vanity suffix. */
  async function mineSalt(account: `0x${string}`, initHash: `0x${string}`) {
    const want = vanity.toLowerCase();
    const pairN = BigInt(pair.address);
    const start = BigInt(Math.floor(Math.random() * 2 ** 48)) << 32n;
    for (let i = 0; ; i++) {
      const salt = toHex(start + BigInt(i), { size: 32 });
      const s = keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [account, salt]));
      const addr = getContractAddress({ opcode: "CREATE2", from: ADDR.factory, salt: s, bytecodeHash: initHash });
      if (BigInt(addr) > pairN && (!want || addr.toLowerCase().endsWith(want))) return salt;
      if (i % 2000 === 1999) {
        setStep(`Finding your address… ${(i + 1).toLocaleString()} tries`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || step || !client) return;
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
      const recipients = alloc.creator === 0 ? [] : split ? splits.map((s) => s.address as `0x${string}`) : [account];
      const bps = alloc.creator === 0 ? [] : split ? splits.map((s) => Math.round(Number(s.pct) * 100)) : [10_000];
      if (alloc.creator > 0 && split) bps[bps.length - 1] += 10_000 - bps.reduce((a, b) => a + b, 0);
      const devBuy = buy ? parseUnits(buy, pair.decimals) : 0n;
      if (!native && devBuy > 0n) {
        const allowance = await client.readContract({ address: pair.address, abi: erc20Abi, functionName: "allowance", args: [account, ADDR.factory] });
        if (allowance < devBuy) {
          setStep(`Approve ${pair.symbol} in wallet…`);
          await confirm(await writeContractAsync({ address: pair.address, abi: erc20Abi, functionName: "approve", args: [ADDR.factory, maxUint256], chainId: chain.id }));
        }
      }
      setStep("Finding your address…");
      const tokenName = name.trim();
      const tokenSymbol = symbol.toUpperCase();
      const initHash = await client.readContract({
        address: ADDR.factory, abi: launchFactoryAbi, functionName: "tokenInitCodeHash",
        args: [tokenName, tokenSymbol, tier, pair.address, alloc.holders > 0],
      });
      const salt = await mineSalt(account, initHash);
      setStep("Confirm in wallet…");
      const hash = await writeContractAsync({
        address: ADDR.factory,
        abi: launchFactoryAbi,
        functionName: "launch",
        args: [
          {
            name: tokenName,
            symbol: tokenSymbol,
            metadataURI: uri,
            supplyTier: tier,
            pair: pair.address,
            buyBps,
            sellBps,
            creatorBps: alloc.creator * 100,
            holdersBps: alloc.holders * 100,
            burnBps: alloc.burn * 100,
            antiSnipe,
            editable,
            recipients,
            shares: bps,
            salt,
            devBuy,
            minTokensOut: 0n,
          },
        ],
        value: native ? devBuy : 0n,
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


  const [devBuy, setDevBuy] = useState(false);
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => api<Stats>("/stats"), refetchInterval: 60_000 });
  const ethUsd = stats.data?.ethUsd ?? 0;
  const supply = SUPPLY_TIERS[tier];
  const cap = launchCap(pair);
  const startPriceEth = cap / supply;
  const pairUsd = native ? ethUsd : pair.symbol === "USDC" ? 1 : pair.symbol === "cbBTC" ? (stats.data?.btcUsd ?? 0) : (pair.usd ?? 0);
  const usd = (v: number) => (pairUsd > 0 ? fmtUsd(v * pairUsd) : null);
  const capLabel = `${cap.toLocaleString(undefined, { maximumSignificantDigits: 4 })} ${pair.symbol}`;

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
                <Field label="Paired asset *" hint="Uniswap v4" group>
                  <div className="grid grid-cols-3 gap-2">
                    {PAIRS.slice(0, 3).map((pr, i) => (
                      <button
                        key={pr.symbol}
                        type="button"
                        onClick={() => {
                          setPairIdx(i);
                          setBuy("");
                        }}
                        className={`flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-medium transition-colors ${
                          pairIdx === i ? "border-accent bg-accent/10" : "border-line bg-panel text-muted hover:border-line-2"
                        }`}
                      >
                        <img src={pr.logo} alt="" className="h-5 w-5 rounded-full" />
                        {pr.symbol}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPicker(true)}
                    className={`mt-2 flex h-12 w-full items-center gap-3 rounded-2xl border bg-panel px-4 text-left text-sm transition-colors ${pairIdx >= 3 ? "border-accent bg-accent/10" : "border-line text-muted hover:border-line-2"}`}
                  >
                    {pairIdx >= 3 ? (
                      <>
                        <PairLogo p={pair} size={22} />
                        <span className="font-medium text-fg">{pair.symbol}</span>
                        <span className="min-w-0 truncate text-dim">{shortName(pair)}</span>
                      </>
                    ) : (
                      <span className="min-w-0 truncate">Stocks, crypto &amp; Base memes ({PAIRS.length - 3})</span>
                    )}
                    <span className="ml-auto shrink-0 text-dim">▾</span>
                  </button>
                  {picker && (
                    <PairPicker
                      pairs={PAIRS.slice(3).map((p, k) => ({ p, i: k + 3 }))}
                      onClose={() => setPicker(false)}
                      onPick={(i) => {
                        setPairIdx(i);
                        setBuy("");
                        setPicker(false);
                      }}
                    />
                  )}
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

          <Section n={2} title="Token Taxes" sub={`Tax applies to buys and sells through the launch pool and includes the protocol fee. It is paid in ${pair.symbol} and fixed at launch. Ordinary wallet transfers are untaxed.`}>
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["Buy tax", buyBps, setBuyBps],
                    ["Sell tax", sellBps, setSellBps],
                  ] as const
                ).map(([label, v, set]) => (
                  <div key={label} className="rounded-2xl border border-line bg-panel p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-medium">{label}</span>
                      <span className="font-mono text-lg">{v / 100}%</span>
                    </div>
                    <input type="range" min={100} max={1000} step={50} value={v} onChange={(e) => set(Number(e.target.value))} className="mt-3 w-full accent-accent" />
                    <div className="mt-1 flex justify-between text-[11px] text-dim">
                      <span>1%</span>
                      <span>protocol {platformBpsFor(v) / 100}% included</span>
                      <span>10%</span>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-sm font-medium">Tax allocation</span>
                  <span className={`text-xs ${allocTotal === 100 ? "text-dim" : "text-down"}`}>
                    {allocTotal === 100 ? "fully allocated" : `${100 - allocTotal}% left to allocate`}
                  </span>
                </div>
                <div className="space-y-3">
                  {(
                    [
                      ["creator", "Creator funds", "To your wallet, or split between up to 4 wallets"],
                      ["holders", "Holder dividends", `Paid in ${pair.symbol} to every holder, pro-rata`],
                      ["burn", "Burn allocation", "Buys the token back from the pool and burns it"],
                    ] as const
                  ).map(([k, label, sub]) => (
                    <div key={k} className="rounded-2xl border border-line bg-panel p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{label}</p>
                          <p className="text-xs text-dim">{sub}</p>
                        </div>
                        <div className="relative w-20 shrink-0">
                          <input
                            className="h-10 w-full rounded-xl border border-line bg-bg px-3 pr-7 text-right font-mono text-sm outline-none focus:border-accent/60"
                            inputMode="numeric"
                            value={alloc[k]}
                            onChange={(e) => setShare(k, Number(e.target.value.replace(/[^0-9]/g, "") || 0))}
                          />
                          <span className="absolute top-2.5 right-3 text-xs text-dim">%</span>
                        </div>
                      </div>
                      <input type="range" min={0} max={100} step={5} value={alloc[k]} onChange={(e) => setShare(k, Number(e.target.value))} className="mt-3 w-full accent-accent" />
                    </div>
                  ))}
                </div>
              </div>
              {alloc.creator > 0 && (
                <div className="rounded-2xl border border-line bg-panel p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">Creator funds recipient</p>
                    <button type="button" onClick={() => setSplitMode(!split)} className="text-xs text-accent hover:underline">
                      {split ? "Use my wallet" : "Split between wallets"}
                    </button>
                  </div>
                  {!split ? (
                    <p className="mt-1 font-mono text-xs break-all text-muted">{address ?? "Your connected wallet"}</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {splits.map((sp, i) => (
                        <div key={i} className="flex gap-2">
                          <input className={`${input} bg-bg font-mono text-xs`} value={sp.address} onChange={(e) => setSplit(i, { address: e.target.value.trim() })} placeholder="0x… wallet" />
                          <div className="relative w-24 shrink-0">
                            <input className={`${input} bg-bg pr-7 font-mono`} inputMode="decimal" value={sp.pct} onChange={(e) => setSplit(i, { pct: e.target.value.replace(/[^0-9.]/g, "") })} />
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
              )}
            </div>
          </Section>

          <Section n={3} title="Launch Options">
            <div className="space-y-3">
              <Toggle on={devBuy} set={(v) => { setDevBuy(v); if (!v) setBuy(""); }} label="Include Dev Buy" sub="Buy tokens as part of the launch, in the same transaction. Tax-free." />
              {devBuy && (
                <div className="rounded-2xl border border-line bg-panel p-4">
                  <Field label={`Amount (${pair.symbol})`} hint={native && bal ? `balance ${fmtEth(Number(bal.formatted))}` : undefined}>
                    <div className="relative">
                      <input className={`${input} bg-bg pr-14 font-mono`} inputMode="decimal" value={buy} onChange={(e) => setBuy(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.0" />
                      <span className="absolute top-3.5 right-4 text-xs text-dim">{pair.symbol}</span>
                    </div>
                  </Field>
                  <div className="mt-2 flex gap-2">
                    {pair.presets.map((v) => (
                      <button key={v} type="button" onClick={() => setBuy(v)} className="rounded-lg border border-line px-2.5 py-1 font-mono text-xs text-muted hover:text-fg">{v}</button>
                    ))}
                  </div>
                </div>
              )}
              <Toggle on={antiSnipe} set={setAntiSnipe} label="Enable anti-sniping" sub="Buys start with a 90% fee that drops to 0 over 60 seconds. The dev buy skips it." />
              <Toggle on={editable} set={setEditable} label="Metadata editable after launch" sub="Let the creator update the image, description and links later. Turn off to lock them forever." />
              <div className="rounded-2xl border border-line bg-panel p-4">
                <p className="text-sm font-medium">
                  Vanity address <span className="text-xs font-normal text-dim">(optional)</span>
                </p>
                <p className="text-xs text-dim">Token address ending in up to 4 hex characters, found in your browser before you confirm.</p>
                <div className="mt-3 flex h-11 items-center gap-1 rounded-xl border border-line bg-bg px-3 font-mono text-sm">
                  <span className="text-muted">0x…</span>
                  <input
                    value={vanity}
                    maxLength={4}
                    onChange={(e) => setVanity(e.target.value.replace(/[^0-9a-fA-F]/g, "").toLowerCase())}
                    placeholder="beef"
                    className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-dim"
                  />
                </div>
              </div>
            </div>
            <p className="mt-5 text-xs leading-relaxed text-dim">The token and its Uniswap v4 market go live together, priced in {pair.symbol}. The fixed supply is minted once and seeded into a pool whose liquidity stays locked forever.</p>
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
                <p className="text-sm text-muted">{(symbol || "TOKEN").toUpperCase()}/{pair.symbol}</p>
              </div>
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">NEW</span>
            </div>
            <p className="mt-4 line-clamp-3 text-sm text-fg/80">{description || "Fixed-supply token trading on a locked Uniswap v4 pool."}</p>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted">Start price</p>
                <p className="mt-1 font-medium">≈ {usd(startPriceEth) ?? `${fmtPrice(startPriceEth)} ${pair.symbol}`}</p>
                <p className="mt-0.5 text-xs text-dim">{fmtPrice(startPriceEth)} {pair.symbol}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Launch cap</p>
                <p className="mt-1 font-medium">≈ {usd(cap) ?? capLabel}</p>
                <p className="mt-0.5 text-xs text-dim">{capLabel}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-panel-2 px-2.5 py-1 text-xs"><img src={pair.logo} alt="" className="h-4 w-4 rounded-full" />{pair.symbol}</span>
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
                  ["Launch market cap", `≈ ${usd(cap) ?? capLabel}`],
                  ["Buy / sell tax", `${buyBps / 100}% / ${sellBps / 100}%`],
                  ["Protocol (included)", `${platformBpsFor(buyBps) / 100}% / ${platformBpsFor(sellBps) / 100}%`],
                  ["Allocation", allocLabel],
                  ["Dev buy", buyAmt ? `${buyAmt} ${pair.symbol}` : "None"],
                  ["Paired asset", pair.symbol],
                  ["Token address", vanity ? `0x…${vanity}` : "random"],
                  ["Metadata", editable ? "editable" : "locked"],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <button type="submit" disabled={!valid || !!step || !DEPLOYED} className="mt-5 h-14 w-full rounded-full bg-accent-2 text-base font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40">
              {!DEPLOYED ? "Contracts not deployed yet" : step ?? (address ? "Launch token" : "Connect wallet")}
            </button>
            <p className="mt-3 text-center text-xs text-dim">You&apos;ll confirm the transaction in your wallet. Nothing is minted until you submit.</p>
            {error && <p className="mt-3 text-xs text-down">{error}</p>}
            {!splitOk && <p className="mt-3 text-xs text-dim">Split needs unique valid wallets totaling 100%.</p>}
            {allocTotal !== 100 && <p className="mt-3 text-xs text-down">Tax allocation must add up to 100%.</p>}
          </div>
        </aside>
      </form>
    </div>
  );
}
