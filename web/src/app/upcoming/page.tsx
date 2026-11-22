"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useSignMessage } from "wagmi";
import { Em, PageHero } from "@/components/PageHero";
import { TokenAvatar } from "@/components/TokenAvatar";
import { api, uploadImage } from "@/lib/api";
import { PAIRS, pairInfo } from "@/lib/config";
import { shortAddr } from "@/lib/format";
import { errMsg, useEnsureWallet } from "@/lib/tx";

export type Scheduled = {
  id: string; creator: string; name: string; symbol: string; description: string | null; image: string | null; pair: string | null;
  website: string | null; x: string | null; telegram: string | null; launch_at: number; created: number; token: string | null;
};

const scheduleMessage = (symbol: string, at: number, creator: string) =>
  `Keelfun scheduled launch\nTicker: $${symbol}\nTime: ${new Date(at * 1000).toISOString()}\nCreator: ${creator.toLowerCase()}`;

function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Countdown({ s }: { s: number }) {
  if (s <= 0) return <span className="text-up">Launch window open</span>;
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (
    <span className="font-mono">
      {d > 0 && `${d}d `}
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(sec).padStart(2, "0")}
    </span>
  );
}

function Card({ l, now, me }: { l: Scheduled; now: number; me?: string }) {
  const p = pairInfo(l.pair);
  const left = l.launch_at - now;
  const mine = !!me && me.toLowerCase() === l.creator;
  const links = [["Web", l.website], ["X", l.x], ["TG", l.telegram]].filter(([, u]) => u) as [string, string][];
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-center gap-3">
        <TokenAvatar src={l.image} symbol={l.symbol} size={48} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{l.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            ${l.symbol}
            <span className="flex items-center gap-1 rounded-full bg-panel-2 px-1.5 py-0.5"><img src={p.logo} alt="" className="h-3 w-3 rounded-full" />{p.symbol}</span>
          </p>
        </div>
      </div>
      {l.description && <p className="mt-3 line-clamp-2 text-xs text-muted">{l.description}</p>}
      <div className="mt-4 flex items-end justify-between gap-2">
        <div>
          <p className="text-[11px] text-dim">{l.token ? "Launched" : "Launches in"}</p>
          <p className="text-lg">{l.token ? <span className="text-up">Live</span> : <Countdown s={left} />}</p>
          <p className="text-[11px] text-dim">{new Date(l.launch_at * 1000).toLocaleString()}</p>
        </div>
        <div className="flex gap-1.5">
          {links.map(([k, u]) => (
            <a key={k} href={u.startsWith("http") ? u : `https://${u}`} target="_blank" rel="noreferrer" className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted hover:text-fg">{k}</a>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs">
        <Link href={`/portfolio/?w=${l.creator}`} className="font-mono text-dim hover:text-accent">by {shortAddr(l.creator)}</Link>
        {l.token ? (
          <Link href={`/token/?a=${l.token}`} className="rounded-lg bg-accent px-3 py-1.5 font-medium text-white">Trade</Link>
        ) : mine && left <= 0 ? (
          <Link href={`/launch/?s=${l.id}`} className="rounded-lg bg-accent px-3 py-1.5 font-medium text-white">Launch now</Link>
        ) : mine ? (
          <span className="text-dim">Your launch</span>
        ) : null}
      </div>
    </div>
  );
}

function ScheduleForm({ onDone }: { onDone: () => void }) {
  const ensure = useEnsureWallet();
  const { signMessageAsync } = useSignMessage();
  const [f, setF] = useState({ name: "", symbol: "", description: "", pair: PAIRS[0].address as string, website: "", x: "", telegram: "", at: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const at = f.at ? Math.floor(new Date(f.at).getTime() / 1000) : 0;
  const ok = f.name.trim() && /^[A-Za-z0-9]{1,10}$/.test(f.symbol) && at > Date.now() / 1000 + 60;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok || busy) return;
    setErr(null);
    try {
      setBusy("Connecting…");
      const creator = (await ensure()).toLowerCase();
      let image = "";
      if (file) (setBusy("Uploading image…"), (image = await uploadImage(file)));
      const symbol = f.symbol.toUpperCase();
      setBusy("Sign in wallet…");
      const signature = await signMessageAsync({ message: scheduleMessage(symbol, at, creator) });
      setBusy("Saving…");
      await api("/scheduled", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...f, symbol, creator, image, launchAt: at, signature, pair: f.pair === PAIRS[0].address ? "" : f.pair }),
      });
      onDone();
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusy(null);
  };
  const inp = "h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent";
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-line bg-panel p-4 sm:grid-cols-2">
      <input className={inp} placeholder="Token name" maxLength={32} value={f.name} onChange={set("name")} />
      <input className={inp} placeholder="Ticker" maxLength={10} value={f.symbol} onChange={set("symbol")} />
      <textarea className={`${inp} h-20 py-2 sm:col-span-2`} placeholder="Description (optional)" maxLength={500} value={f.description} onChange={set("description")} />
      <label className="text-xs text-muted">
        Launch time (your local time)
        <input type="datetime-local" className={`${inp} mt-1`} value={f.at} onChange={set("at")} />
      </label>
      <label className="text-xs text-muted">
        Pair
        <select className={`${inp} mt-1`} value={f.pair} onChange={set("pair")}>
          {PAIRS.map((p) => <option key={p.address} value={p.address}>{p.symbol}</option>)}
        </select>
      </label>
      <label className="text-xs text-muted sm:col-span-2">
        Image (optional)
        <input type="file" accept="image/*" className="mt-1 block w-full text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <input className={inp} placeholder="Website (optional)" value={f.website} onChange={set("website")} />
      <input className={inp} placeholder="X (optional)" value={f.x} onChange={set("x")} />
      <input className={inp} placeholder="Telegram (optional)" value={f.telegram} onChange={set("telegram")} />
      <button disabled={!ok || !!busy} className="h-10 rounded-lg bg-accent text-sm font-medium text-white disabled:opacity-40">{busy ?? "Sign & schedule"}</button>
      {err && <p className="text-xs text-down sm:col-span-2">{err}</p>}
      <p className="text-[11px] text-dim sm:col-span-2">Scheduling is free and only needs a signature. When the time comes, open this page with the same wallet and press Launch now to deploy it on Base.</p>
    </form>
  );
}

export default function UpcomingPage() {
  const { address } = useAccount();
  const qc = useQueryClient();
  const now = useNow();
  const [tab, setTab] = useState<"soon" | "live" | "mine">("soon");
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["scheduled"],
    queryFn: () => api<{ scheduled: Scheduled[] }>("/scheduled"),
    refetchInterval: 20000,
  });
  const all = data?.scheduled ?? [];
  const list = all.filter((l) =>
    tab === "live" ? !!l.token : tab === "mine" ? !!address && l.creator === address.toLowerCase() : !l.token,
  );
  return (
    <>
      <PageHero title={<>Upcoming <Em>launches</Em></>} sub="Tokens scheduled to launch on Keelfun. Set a reminder, or schedule your own.">
        <div className="mt-6">
          <button onClick={() => setOpen((v) => !v)} className="rounded-lg border border-line bg-bg/60 px-4 py-2 text-sm hover:border-accent">
            {open ? "Close" : "+ Schedule a launch"}
          </button>
        </div>
      </PageHero>
      <div className="space-y-5 pb-16">
        {open && <ScheduleForm onDone={() => (setOpen(false), setTab("mine"), qc.invalidateQueries({ queryKey: ["scheduled"] }))} />}
        <div className="flex gap-5 border-b border-line text-sm">
          {([["soon", "Upcoming"], ["live", "Launched"], ["mine", "Mine"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`-mb-px pb-2.5 ${tab === k ? "border-b-2 border-fg" : "text-muted hover:text-fg"}`}>{l}</button>
          ))}
        </div>
        {isLoading ? (
          <p className="py-16 text-center text-sm text-muted">Loading…</p>
        ) : list.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((l) => <Card key={l.id} l={l} now={now} me={address} />)}
          </div>
        ) : (
          <p className="rounded-2xl border border-line py-16 text-center text-sm text-muted">
            {tab === "soon" ? "No launches scheduled yet. Be the first." : tab === "live" ? "No scheduled launch has gone live yet." : "You haven't scheduled a launch."}
          </p>
        )}
      </div>
    </>
  );
}
