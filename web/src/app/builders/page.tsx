"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSignMessage } from "wagmi";
import { Em, PageHero } from "@/components/PageHero";
import { api } from "@/lib/api";
import { BRAND } from "@/lib/config";
import { fmtValue } from "@/lib/format";
import { errMsg, useEnsureWallet } from "@/lib/tx";

type Builder = {
  code: string; name: string; url: string | null; kind: string | null; description: string | null;
  approved: boolean; tokens: number; volumeEth: number; shareEth: number;
};
const KINDS = ["Launch site", "Terminal", "Bot", "Agent", "Other"];
const SITE = "https://keelfun.app";

function builderMessage(code: string, payout: string) {
  return `Keel Builders\n\nCode: ${code}\nPayout wallet: ${payout.toLowerCase()}\n\nI accept the Keel Builders terms. This signature costs no gas and moves no funds.`;
}

const TERMS: [string, string, string][] = [
  ["25%", `of ${BRAND}'s platform fee on every trade in the tokens launched through your product`, "$0.10 of every $100 traded at the 1% tier"],
  ["90 days", "from each token's launch", "through whatever interface it is traded"],
  ["Weekly", "paid in ETH on Base from the treasury", "each Monday's week, after 48 hours of review"],
  ["Public", "statements, line by line", "anyone can recompute them from the chain"],
];

const STEPS: [string, React.ReactNode][] = [
  ["Register", "Pick a code and sign the terms with the wallet you want paid. Signing costs no gas and moves no funds."],
  ["Add your code", <>Send launches to <span className="font-mono text-fg/80">keelfun.app/launch/?ref=code</span>, or add <span className="font-mono text-fg/80">&quot;builder&quot;: &quot;code&quot;</span> to the metadata your product posts.</>],
  ["Get approved", "We look at your product, usually within a few days. What you earn until then is held for you, not lost."],
  ["Get paid", "Each Monday a week closes. After 48 hours of review its statements are published, and you're paid in ETH."],
];

const input = "h-10 w-full rounded-lg border border-line bg-bg/60 px-3 text-sm outline-none placeholder:text-dim focus:border-accent/50";

function Join() {
  const ensure = useEnsureWallet();
  const { signMessageAsync } = useSignMessage();
  const qc = useQueryClient();
  const [f, setF] = useState({ code: "", name: "", url: "", kind: KINDS[0], description: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const code = f.code.trim().toLowerCase();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!/^[a-z0-9-]{3,24}$/.test(code)) return setErr("Code: 3-24 letters, numbers or dashes");
    if (!f.name.trim()) return setErr("Name your product");
    setBusy(true);
    try {
      const payout = await ensure();
      const signature = await signMessageAsync({ message: builderMessage(code, payout) });
      await api("/builders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, code, payout, signature }) });
      setDone(code);
      qc.invalidateQueries({ queryKey: ["builders"] });
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const link = `${SITE}/launch/?ref=${done}`;
    return (
      <div className="rounded-2xl border border-line bg-panel p-5">
        <p className="font-serif text-3xl">You&apos;re registered as <Em>{done}</Em></p>
        <p className="mt-2 text-sm text-muted">Send launches through this link, or add the metadata field to the launches your product makes.</p>
        <div className="mt-4 space-y-2 font-mono text-xs">
          {[link, `"builder": "${done}"`].map((v) => (
            <button key={v} onClick={() => navigator.clipboard.writeText(v)} className="block w-full truncate rounded-lg border border-line bg-bg/60 px-3 py-2.5 text-left hover:border-accent/50">
              {v}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-line bg-panel p-5 sm:grid-cols-2">
      <input className={input} placeholder="Code, e.g. mybot" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
      <input className={input} placeholder="Product name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input className={input} placeholder="Website or X link" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
      <select className={input} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
        {KINDS.map((k) => <option key={k}>{k}</option>)}
      </select>
      <textarea className={`${input} h-20 py-2 sm:col-span-2`} placeholder="What does your product do? (optional)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button disabled={busy} className="h-10 rounded-lg bg-fg px-5 text-sm font-medium text-bg hover:bg-white disabled:opacity-50">
          {busy ? "Sign in your wallet…" : "Sign and join"}
        </button>
        <span className="text-xs text-dim">The wallet you sign with is the one we pay.</span>
      </div>
      {err && <p className="text-sm text-down sm:col-span-2">{err}</p>}
    </form>
  );
}

export default function BuildersPage() {
  const { data } = useQuery({ queryKey: ["builders"], queryFn: () => api<{ builders: Builder[]; ethUsd: number }>("/builders"), refetchInterval: 15_000 });
  const list = data?.builders ?? [];
  const usd = data?.ethUsd ?? 0;
  return (
    <div>
      <PageHero
        title={<>Build on <Em>{BRAND}</Em></>}
        sub={`${BRAND} Builders rewards products that bring new launches to ${BRAND}: earn a share of the platform fee from every token launched through your product.`}
      >
        <a href="#join" className="mt-7 inline-block rounded-lg bg-fg px-5 py-2.5 text-sm font-medium text-bg hover:bg-white">Join the programme</a>
      </PageHero>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {TERMS.map(([v, k, sub]) => (
          <div key={v} className="border-t border-line pt-3">
            <p className="font-serif text-5xl">{v}</p>
            <p className="mt-2 text-sm text-fg/85">{k}</p>
            <p className="mt-1 text-xs text-dim">{sub}</p>
          </div>
        ))}
      </div>

      <section className="relative mt-16 overflow-hidden rounded-2xl border border-line">
        <img src="/art/band.webp" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[70%_50%] opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/70 to-transparent" />
        <div className="relative max-w-xl p-6 sm:p-10">
          <p className="font-serif text-4xl leading-tight sm:text-5xl">A token that trades <Em>$1,000,000</Em> in its first 90 days earns you <Em>$1,000</Em>.</p>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Your share is of the platform fee each trade actually paid, through whatever interface it was made. You&apos;re paid for bringing the token, never for trading it. At higher fee tiers the platform fee, and your share, is larger.
          </p>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="font-serif text-4xl">Four steps</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([t, d], i) => (
            <div key={t} className="border-t border-line pt-3">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-line-2 font-mono text-xs">{i + 1}</span>
              <p className="mt-3 font-medium">{t}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="join" className="mt-16 scroll-mt-24">
        <h2 className="mb-4 font-serif text-4xl">Join the programme</h2>
        <Join />
      </section>

      <section className="mt-16">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-4xl">Builders on {BRAND}</h2>
          <p className="text-xs text-dim">{list.reduce((a, b) => a + b.tokens, 0)} tokens launched through builders</p>
        </div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-panel text-left text-xs text-dim">
              <tr><th className="px-4 py-2.5 font-normal">Builder</th><th className="font-normal">Tokens launched</th><th className="font-normal">Volume</th><th className="pr-4 text-right font-normal">Builder share</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((b) => (
                <tr key={b.code}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{b.url ? <a href={/^https?:/.test(b.url) ? b.url : `https://${b.url}`} target="_blank" rel="noreferrer" className="hover:underline">{b.name}</a> : b.name}</p>
                    <p className="max-w-md truncate text-xs text-dim">{b.kind}{b.description ? ` · ${b.description}` : ""}{b.approved ? "" : " · in review"}</p>
                  </td>
                  <td>{b.tokens}</td>
                  <td>{fmtValue(b.volumeEth, usd)}</td>
                  <td className="pr-4 text-right">{b.shareEth.toFixed(4)} ETH</td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-muted">No builders yet. <a href="#join" className="text-accent-fg hover:underline">Be the first.</a></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
