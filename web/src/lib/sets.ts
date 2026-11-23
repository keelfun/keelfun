"use client";
import { useEffect, useState } from "react";

export const SETS_EVT = "keel-sets";
export function readSet(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}
export function useSet(key: string) {
  const [s, setS] = useState<string[]>([]);
  useEffect(() => {
    const f = () => setS(readSet(key));
    f();
    addEventListener(SETS_EVT, f);
    addEventListener("storage", f);
    return () => (removeEventListener(SETS_EVT, f), removeEventListener("storage", f));
  }, [key]);
  return s;
}
export function pushRecent(pool: string) {
  const x = pool.toLowerCase();
  localStorage.setItem("keel-recent", JSON.stringify([x, ...readSet("keel-recent").filter((y) => y !== x)].slice(0, 30)));
  dispatchEvent(new Event(SETS_EVT));
}
