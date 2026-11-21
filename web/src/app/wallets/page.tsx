"use client";
import { useRef, useState } from "react";
import { formatEther, parseEther } from "viem";
import { useAccount, useBalance, useSendTransaction, useSignMessage } from "wagmi";
import { chain, EXPLORER } from "@/lib/config";
import { shortAddr } from "@/lib/format";
import { errMsg, useConfirm, useEnsureWallet } from "@/lib/tx";
import {
  createVault, deleteVault, exportBackup, lock, restoreBackup, unlock, useVault, vaultActions, vaultClient, vaultMessage, vaultPublic, type VaultWallet,
} from "@/lib/vault";

const btn = "h-10 rounded-xl px-4 text-sm font-semibold disabled:opacity-40";

function Row({ w, i, groups, onErr }: { w: VaultWallet; i: number; groups: number[][]; onErr: (m: string) => void }) {
  const { address } = useAccount();
  const bal = useBalance({ address: w.address, chainId: chain.id, query: { refetchInterval: 8000 } });
  const ensure = useEnsureWallet();
  const confirm = useConfirm();
  const { sendTransactionAsync } = useSendTransaction();
  const [fund, setFund] = useState("");
  const [busy, setBusy] = useState("");
  const [show, setShow] = useState(false);
  const [name, setName] = useState(w.name);
  const run = async (label: string, f: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await f();
      bal.refetch();
    } catch (e) {
      onErr(errMsg(e));
    } finally {
      setBusy("");
    }
  };
  const deposit = () =>
    run("Funding…", async () => {
      await ensure();
      const h = await sendTransactionAsync({ to: w.address, value: parseEther(fund || "0"), chainId: chain.id });
      await confirm(h);
      setFund("");
    });
  const withdraw = () =>
    run("Withdrawing…", async () => {
      const to = address ?? (await ensure());
      const pub = vaultPublic();
      const b = await pub.getBalance({ address: w.address });
      const fees = await pub.estimateFeesPerGas();
      const gas = 21_000n * ((fees.maxFeePerGas ?? 0n) * 2n);
      if (b <= gas) throw new Error("Balance too low to cover gas");
      const h = await vaultClient(w).sendTransaction({ to, value: b - gas, maxFeePerGas: fees.maxFeePerGas! * 2n, maxPriorityFeePerGas: fees.maxPriorityFeePerGas });
      await pub.waitForTransactionReceipt({ hash: h });
    });
  const eth = bal.data ? Number(formatEther(bal.data.value)) : 0;
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== w.name && vaultActions.rename(i, name || w.name)} className="w-36 rounded-md bg-transparent text-sm font-semibold outline-none focus:bg-bg" />
        <button onClick={() => navigator.clipboard.writeText(w.address)} className="rounded-md border border-line px-2 py-0.5 font-mono text-xs text-muted hover:text-fg" title="Copy address">{shortAddr(w.address)}</button>
        <a href={`${EXPLORER}/address/${w.address}`} target="_blank" rel="noreferrer" className="text-xs text-dim hover:text-fg">↗</a>
        <span className="ml-auto font-mono text-sm">{eth.toLocaleString(undefined, { maximumFractionDigits: 6 })} ETH</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {[0, 1, 2].map((g) => (
          <button key={g} onClick={() => vaultActions.toggleGroup(g, i)} className={`h-7 rounded-md border px-2 font-mono text-xs ${groups[g]?.includes(i) ? "border-accent bg-accent/15 text-accent" : "border-line text-dim hover:text-fg"}`}>P{g + 1}</button>
        ))}
        <label className="ml-auto flex h-8 items-center gap-1 rounded-lg border border-line bg-bg px-2">
          <input value={fund} onChange={(e) => setFund(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.01" inputMode="decimal" className="w-16 bg-transparent font-mono text-xs outline-none" />
          <span className="text-[11px] text-dim">ETH</span>
        </label>
        <button onClick={deposit} disabled={!!busy || !Number(fund)} className="h-8 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-ink disabled:opacity-40">Fund</button>
        <button onClick={withdraw} disabled={!!busy || eth === 0} className="h-8 rounded-lg border border-line px-3 text-xs text-muted hover:text-fg disabled:opacity-40">Withdraw all</button>
        <button onClick={() => setShow((v) => !v)} className="h-8 rounded-lg border border-line px-3 text-xs text-muted hover:text-fg">{show ? "Hide key" : "Export key"}</button>
        <button
          onClick={() => (eth > 0 ? onErr("Withdraw the balance before removing this wallet") : confirm2(`Remove ${w.name}? Its key is deleted from the vault.`) && vaultActions.remove(i))}
          className="h-8 rounded-lg border border-line px-3 text-xs text-down/80 hover:text-down"
        >
          Remove
        </button>
      </div>
      {busy && <p className="mt-2 text-xs text-muted">{busy}</p>}
      {show && (
        <p className="mt-3 break-all rounded-lg border border-warn/40 bg-warn/5 p-2 font-mono text-[11px] text-warn">
          {w.pk}
          <span className="mt-1 block font-sans text-dim">Anyone with this key controls the wallet. Never share it.</span>
        </p>
      )}
    </div>
  );
}
const confirm2 = (m: string) => window.confirm(m);

export default function WalletsPage() {
  const v = useVault();
  const ensure = useEnsureWallet();
  const { signMessageAsync } = useSignMessage();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [mode, setMode] = useState<"" | "password">("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [imp, setImp] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const act = async (f: () => Promise<unknown>) => {
    setErr("");
    setBusy(true);
    try {
      await f();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const withWallet = () =>
    act(async () => {
      const owner = await ensure();
      const sig = await signMessageAsync({ message: vaultMessage(owner) });
      if (v.exists) await unlock(sig);
      else await createVault("sig", sig, owner);
    });
  const withPassword = () =>
    act(async () => {
      if (v.exists) return unlock(pw);
      if (pw.length < 8) throw new Error("Use at least 8 characters");
      if (pw !== pw2) throw new Error("Passwords don't match");
      await createVault("password", pw);
    });
  const d = v.data;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <h1 className="text-xl font-bold italic">Wallets</h1>
      {!d ? (
        <div className="space-y-4">
          <h2 className="font-semibold">{v.exists ? "Unlock your vault" : "Unlock with your wallet, no password"}</h2>
          <p className="text-sm leading-relaxed text-muted">
            Keelfun keeps your trading wallets in an encrypted vault in this browser. Connect your own wallet (MetaMask, Rabby, Coinbase) and sign to unlock it. Trading wallets buy in one click, with no wallet popup.
          </p>
          {(!v.exists || v.kind === "sig") && (
            <button onClick={withWallet} disabled={busy} className={`${btn} w-full bg-fg text-bg`}>{busy ? "Waiting for signature…" : v.exists ? "Unlock with wallet" : "Continue with wallet"}</button>
          )}
          {(!v.exists && mode !== "password") && (
            <button onClick={() => setMode("password")} className={`${btn} w-full border border-line text-fg`}>Use a password instead</button>
          )}
          {((!v.exists && mode === "password") || v.kind === "password") && (
            <div className="space-y-2 rounded-2xl border border-line bg-panel p-4">
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent" />
              {!v.exists && <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Repeat password" className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent" />}
              <button onClick={withPassword} disabled={busy || !pw} className={`${btn} w-full bg-accent text-accent-ink`}>{busy ? "…" : v.exists ? "Unlock" : "Create vault"}</button>
            </div>
          )}
          <ul className="space-y-1.5 text-xs text-dim">
            <li>✓ Keys are generated and encrypted in your browser. Keelfun servers never see a key or the signature that unlocks it.</li>
            <li>✓ Download an encrypted backup to restore the vault on another device.</li>
            <li>✓ The vault locks itself after an hour of inactivity.</li>
          </ul>
          <div className="flex flex-wrap gap-4 text-sm">
            <button onClick={() => file.current?.click()} className="text-muted underline-offset-4 hover:text-fg hover:underline">Restore from an encrypted file</button>
            {v.exists && <button onClick={() => confirm2("Delete the vault from this browser? Without a backup the keys are lost.") && deleteVault()} className="text-down/80 hover:text-down">Delete vault on this device</button>}
          </div>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && act(() => restoreBackup(e.target.files![0]))} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm text-up"><span className="h-1.5 w-1.5 rounded-full bg-up" />Unlocked · {d.wallets.length} wallet{d.wallets.length === 1 ? "" : "s"}</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <button onClick={() => act(vaultActions.add)} className="h-8 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-ink">+ New wallet</button>
              <button onClick={() => act(async () => exportBackup())} className="h-8 rounded-lg border border-line px-3 text-xs text-muted hover:text-fg">Download backup</button>
              <button onClick={lock} className="h-8 rounded-lg border border-line px-3 text-xs text-muted hover:text-fg">Lock</button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel p-4 text-sm">
            <span className="text-muted">Quick buy amount is</span>
            <div className="flex rounded-lg border border-line p-0.5 text-xs">
              {(["total", "each"] as const).map((m) => (
                <button key={m} onClick={() => vaultActions.setMode(m)} className={`rounded-md px-2.5 py-1 ${d.mode === m ? "bg-panel-2 text-fg" : "text-muted"}`}>{m === "total" ? "Total (split)" : "Each wallet"}</button>
              ))}
            </div>
            <span className="text-xs text-dim">Wallets tagged P1/P2/P3 buy when that preset is active. Untagged presets use your connected wallet.</span>
          </div>
          {d.wallets.map((w, i) => (
            <Row key={w.address} w={w} i={i} groups={d.groups} onErr={setErr} />
          ))}
          <div className="flex gap-2">
            <input value={imp} onChange={(e) => setImp(e.target.value)} placeholder="Import a private key (0x…)" type="password" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 font-mono text-xs outline-none focus:border-accent" />
            <button onClick={() => act(async () => (await vaultActions.importKey(imp), setImp("")))} disabled={!imp} className="h-10 rounded-lg border border-line px-4 text-sm disabled:opacity-40">Import</button>
          </div>
          <p className="text-xs leading-relaxed text-dim">Trading wallets are hot wallets kept in this browser. Only fund them with what you plan to trade, and keep a backup file somewhere safe. Clearing browser data without a backup loses the keys.</p>
        </div>
      )}
      {err && <p className="rounded-lg border border-down/40 bg-down/5 p-3 text-sm text-down">{err}</p>}
    </div>
  );
}
