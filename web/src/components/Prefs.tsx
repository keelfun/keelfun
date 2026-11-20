"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LANGS, tr, type Lang } from "@/lib/i18n";
import { THEMES, THEME_KEYS, THEME_STORAGE, applyTheme, type StoredTheme, type ThemeColors } from "@/lib/theme";

const LANG_STORAGE = "keel-lang";
const originals = new WeakMap<Node, string>();
const applied = new WeakMap<Node, string>();
const attrOrig = new WeakMap<Element, string>();
let current: Lang = "en";

function translateText(n: Text) {
  const v = n.nodeValue ?? "";
  if (applied.get(n) !== v) originals.set(n, v);
  const orig = originals.get(n) ?? v;
  const key = orig.trim();
  if (!key) return;
  const t = tr(key, current);
  const next = t ? orig.replace(key, t) : orig;
  if (next !== v) n.nodeValue = next;
  applied.set(n, next);
}

function translateEl(el: Element) {
  if (!el.hasAttribute("placeholder")) return;
  const v = el.getAttribute("placeholder") ?? "";
  let o = attrOrig.get(el);
  if (o === undefined || (v !== o && !isTranslation(o, v))) {
    o = v;
    attrOrig.set(el, v);
  }
  const next = tr(o, current) ?? o;
  if (next !== v) el.setAttribute("placeholder", next);
}
function isTranslation(orig: string, v: string) {
  return LANGS.some((l) => tr(orig, l.id) === v);
}

function walk(root: Node) {
  if (root.nodeType === 3) return translateText(root as Text);
  if (root.nodeType !== 1) return;
  const el = root as Element;
  if (el.closest("script,style,code,pre,[data-no-i18n]")) return;
  translateEl(el);
  el.querySelectorAll("[placeholder]").forEach(translateEl);
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest("script,style,code,pre,[data-no-i18n]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let n: Node | null;
  while ((n = w.nextNode())) translateText(n as Text);
}

let observer: MutationObserver | null = null;
function setLang(l: Lang) {
  current = l;
  document.documentElement.lang = l;
  walk(document.body);
  if (!observer) {
    observer = new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === "characterData") translateText(m.target as Text);
        else if (m.type === "attributes") translateEl(m.target as Element);
        else m.addedNodes.forEach(walk);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["placeholder"] });
  }
}

function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[85dvh] w-full flex-col rounded-t-2xl border border-line bg-panel sm:max-w-lg sm:rounded-2xl">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-2 sm:hidden" />
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-xl leading-none text-muted hover:text-fg">×</button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex items-center gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

const iconBtn = "flex h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs text-muted hover:text-fg";

export function LangButton() {
  const [lang, setL] = useState<Lang>("en");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const s = localStorage.getItem(LANG_STORAGE) as Lang | null;
    if (s && LANGS.some((l) => l.id === s)) {
      setL(s);
      if (s !== "en") setLang(s);
    }
  }, []);
  const pick = (l: Lang) => {
    setL(l);
    localStorage.setItem(LANG_STORAGE, l);
    setLang(l);
    setOpen(false);
  };
  return (
    <>
      <button onClick={() => setOpen(true)} className={iconBtn} aria-label="Language" data-no-i18n>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h8M8 3v2m2.5 0c-1 4-3.5 7-6.5 9m2-5c1 2 3 4 5 5" /><path d="m12 21 4.5-10L21 21m-7.5-3h6" /></svg>
        <span className="hidden font-mono uppercase sm:inline">{lang}</span>
      </button>
      {open && (
        <Sheet title="Select language" onClose={() => setOpen(false)}>
          <div className="space-y-1" data-no-i18n>
            {LANGS.map((l) => (
              <button key={l.id} onClick={() => pick(l.id)} className={`flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left text-[15px] ${lang === l.id ? "bg-panel-2 text-accent-soft" : "hover:bg-panel-2"}`}>
                {l.label}
                {lang === l.id && <span className="text-accent-soft">✓</span>}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

function Preview({ c }: { c: ThemeColors }) {
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-line" style={{ background: `linear-gradient(120deg, ${c.accent}, ${c["accent-2"]})` }}>
      <div className="absolute bottom-0 right-0 h-[72%] w-[84%] rounded-tl-lg border-l border-t" style={{ background: c.bg, borderColor: c["line-2"] }}>
        <div className="border-b" style={{ borderColor: c.line, height: "28%" }} />
        <div className="absolute right-[8%] top-[9%] flex gap-1">
          <span className="h-1.5 w-4 rounded-full" style={{ background: c["panel-2"] }} />
          <span className="h-1.5 w-4 rounded-full" style={{ background: c.accent }} />
        </div>
        <div className="absolute bottom-0 left-[12%] h-[45%] w-[80%] rounded-t border-l border-r border-t" style={{ borderColor: c.line, background: c.panel }} />
      </div>
    </div>
  );
}

export function ThemeButton() {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<StoredTheme>({ id: "keel" });
  const [msg, setMsg] = useState("");
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(THEME_STORAGE) || "null");
      if (s?.id) setSel(s);
    } catch {}
  }, []);
  const choose = (t: StoredTheme) => {
    setSel(t);
    applyTheme(t);
    localStorage.setItem(THEME_STORAGE, JSON.stringify(t));
  };
  const colors = sel.id === "custom" && sel.colors ? sel.colors : (THEMES.find((t) => t.id === sel.id) ?? THEMES[0]).colors;
  const exportTheme = async () => {
    const body = JSON.stringify({ keelTheme: 1, name: THEMES.find((t) => t.id === sel.id)?.name ?? "Custom", colors }, null, 2);
    try {
      await navigator.clipboard.writeText(body);
    } catch {}
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    a.download = "keel-theme.json";
    a.click();
    setMsg("Theme copied and downloaded");
  };
  const importTheme = async (f?: File) => {
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const c = j.colors ?? j;
      const ok = THEME_KEYS.filter((k) => typeof c[k] === "string" && /^#[0-9a-f]{3,8}$/i.test(c[k]));
      if (ok.length < 4) throw new Error();
      const merged = { ...THEMES[0].colors, ...Object.fromEntries(ok.map((k) => [k, c[k]])) } as ThemeColors;
      choose({ id: "custom", colors: merged });
      setMsg("Theme imported");
    } catch {
      setMsg("Not a valid theme file");
    }
  };
  return (
    <>
      <button onClick={() => { setMsg(""); setOpen(true); }} className={iconBtn} aria-label="Theme">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.2-4-7.7-9-7.7Z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="7" r="1" /></svg>
      </button>
      {open && (
        <Sheet
          title="Customize Theme"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button onClick={exportTheme} className="h-9 rounded-full bg-panel-2 px-4 text-sm font-semibold hover:bg-line">Export</button>
              <button onClick={() => file.current?.click()} className="h-9 rounded-full bg-panel-2 px-4 text-sm font-semibold hover:bg-line">Import</button>
              <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { importTheme(e.target.files?.[0]); e.target.value = ""; }} />
              <button onClick={() => setOpen(false)} className="ml-auto h-9 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink">Done</button>
            </>
          }
        >
          <p className="mb-3 text-sm text-muted">Theme</p>
          <div className="grid grid-cols-3 gap-3">
            {THEMES.map((t) => (
              <button key={t.id} onClick={() => choose({ id: t.id })} className={`rounded-2xl p-1.5 text-center ${sel.id === t.id ? "ring-2 ring-accent" : "ring-1 ring-line hover:ring-line-2"}`}>
                <Preview c={t.colors} />
                <span className={`mt-2 block text-sm ${sel.id === t.id ? "text-fg" : "text-muted"}`} data-no-i18n>{t.name}</span>
              </button>
            ))}
            {sel.id === "custom" && sel.colors && (
              <button className="rounded-2xl p-1.5 text-center ring-2 ring-accent">
                <Preview c={sel.colors} />
                <span className="mt-2 block text-sm text-fg" data-no-i18n>Custom</span>
              </button>
            )}
          </div>
          {msg && <p className="mt-4 text-xs text-muted">{msg}</p>}
        </Sheet>
      )}
    </>
  );
}
