export const THEME_KEYS = ["bg", "panel", "panel-2", "line", "line-2", "accent", "accent-2", "accent-soft", "accent-ink"] as const;
export type ThemeColors = Record<(typeof THEME_KEYS)[number], string>;
const mk = (v: string): ThemeColors => Object.fromEntries(v.split(" ").map((c, i) => [THEME_KEYS[i], c])) as ThemeColors;

export const THEMES: { id: string; name: string; colors: ThemeColors }[] = [
  { id: "keel", name: "Keel", colors: mk("#05070d #0b0f1a #111727 #1c2436 #27314a #3d7bff #7fd4ff #bcd3ff #ffffff") },
  { id: "dark", name: "Dark", colors: mk("#0a0a0b #111113 #18181b #232327 #2e2e33 #7cb7ff #a9d4ff #cfe4ff #06121f") },
  { id: "dusk", name: "Dusk", colors: mk("#070818 #0d0f24 #14173a #1f2350 #2a2f66 #5b6cff #8f9bff #c5ccff #ffffff") },
  { id: "astro", name: "Astro", colors: mk("#0a0716 #120d24 #1a1433 #261d48 #32275c #8b5cf6 #c4a5ff #ddd0ff #ffffff") },
  { id: "neo", name: "Neo", colors: mk("#050a08 #0a1410 #101d17 #18291f #22382b #34d399 #8af0c4 #c4f5df #04140c") },
  { id: "crimson", name: "Crimson", colors: mk("#0a0606 #140c0c #1d1212 #2b1a1a #3a2323 #ef4444 #ff8a7a #ffc9c2 #ffffff") },
];

export type StoredTheme = { id: string; colors?: ThemeColors };
export const THEME_STORAGE = "keel-theme";

export function applyTheme(t: StoredTheme) {
  const el = document.documentElement;
  for (const k of THEME_KEYS) el.style.removeProperty(`--color-${k}`);
  delete el.dataset.theme;
  if (t.id === "custom" && t.colors) {
    for (const k of THEME_KEYS) if (t.colors[k]) el.style.setProperty(`--color-${k}`, t.colors[k]);
  } else if (t.id !== "keel") el.dataset.theme = t.id;
}

export const THEME_BOOT = `try{var t=JSON.parse(localStorage.getItem("${THEME_STORAGE}")||"null");if(t){var e=document.documentElement;if(t.id==="custom"&&t.colors){for(var k in t.colors)e.style.setProperty("--color-"+k,t.colors[k])}else if(t.id&&t.id!=="keel")e.dataset.theme=t.id}}catch(_){}`;
