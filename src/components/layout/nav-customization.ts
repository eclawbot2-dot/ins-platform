"use client";

/**
 * Per-user sidebar personalization: reorder + hide of nav groups and items.
 *
 * Persistence is client-only (localStorage, key `ins:nav:customization`) — no
 * database migration. Every storage access is guarded with a `typeof window`
 * check so this module is import-safe from server components too. Components
 * read the saved prefs in a `useEffect` (never during render) so first paint
 * matches the server-rendered default order and there is no hydration
 * mismatch; once the effect runs the saved order/hidden set is applied.
 *
 * Node ids are stable + globally unique:
 *   group → the section title                    (parentKey ROOT_KEY)
 *   item  → `${groupTitle}::${href}`             (parentKey groupTitle)
 */

import { useCallback, useEffect, useState } from "react";

export const STORAGE_KEY = "ins:nav:customization";
export const ROOT_KEY = "__root__";

/** Cross-component sync: dispatched on `window` whenever prefs change. */
const SYNC_EVENT = "ins:nav:customization:changed";

export type NavCustomization = {
  /** parentKey → ordered child ids (only parents the user reordered). */
  order: Record<string, string[]>;
  /** hidden node ids (groups / items). */
  hidden: string[];
};

export function emptyNavCustomization(): NavCustomization {
  return { order: {}, hidden: [] };
}

export function itemIdOf(groupTitle: string, href: string): string {
  return `${groupTitle}::${href}`;
}

/** Defensive parse of an unknown JSON value into a NavCustomization. */
function coerce(value: unknown): NavCustomization {
  const raw = (value ?? {}) as Partial<NavCustomization>;
  const order: Record<string, string[]> = {};
  if (raw.order && typeof raw.order === "object") {
    for (const [k, v] of Object.entries(raw.order as Record<string, unknown>)) {
      if (Array.isArray(v)) order[k] = v.filter((x): x is string => typeof x === "string");
    }
  }
  const hidden = Array.isArray(raw.hidden)
    ? raw.hidden.filter((x): x is string => typeof x === "string")
    : [];
  return { order, hidden };
}

export function readCustomization(): NavCustomization {
  if (typeof window === "undefined") return emptyNavCustomization();
  try {
    const json = window.localStorage.getItem(STORAGE_KEY);
    if (!json) return emptyNavCustomization();
    return coerce(JSON.parse(json));
  } catch {
    return emptyNavCustomization();
  }
}

export function writeCustomization(next: NavCustomization): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage full / disabled — ignore, prefs are best-effort */
  }
  window.dispatchEvent(new Event(SYNC_EVENT));
}

/**
 * Stable reorder: nodes whose id is in `savedOrder` come first, in saved
 * order; everything else keeps its default relative order, appended.
 * Tolerates ids that were added/removed since the order was saved.
 */
export function applyOrder<T>(nodes: T[], idOf: (t: T) => string, savedOrder?: string[]): T[] {
  if (!savedOrder || savedOrder.length === 0) return nodes;
  const pos = new Map(savedOrder.map((id, i) => [id, i] as const));
  return nodes
    .map((n, i) => ({ n, i }))
    .sort((a, b) => {
      const pa = pos.has(idOf(a.n)) ? pos.get(idOf(a.n))! : Number.MAX_SAFE_INTEGER;
      const pb = pos.has(idOf(b.n)) ? pos.get(idOf(b.n))! : Number.MAX_SAFE_INTEGER;
      return pa !== pb ? pa - pb : a.i - b.i;
    })
    .map((x) => x.n);
}

export function isHidden(c: NavCustomization, id: string): boolean {
  return c.hidden.includes(id);
}

export type NavChange =
  | { type: "reorder"; parentKey: string; order: string[] }
  | { type: "hide"; id: string }
  | { type: "unhide"; id: string }
  | { type: "reset" };

/** Pure reducer — apply a change to a customization, returning a new value. */
export function reduceCustomization(c: NavCustomization, change: NavChange): NavCustomization {
  switch (change.type) {
    case "reorder":
      return { ...c, order: { ...c.order, [change.parentKey]: change.order } };
    case "hide":
      return c.hidden.includes(change.id)
        ? c
        : { ...c, hidden: [...c.hidden, change.id] };
    case "unhide":
      return { ...c, hidden: c.hidden.filter((h) => h !== change.id) };
    case "reset":
      return emptyNavCustomization();
    default:
      return c;
  }
}

/**
 * Shared hook: hydration-safe access to the nav customization.
 *
 * Starts at the empty default (matching the server render), reads localStorage
 * after mount, and re-reads whenever any component mutates prefs (same tab via
 * a custom event, other tabs via the native `storage` event). `mounted` lets
 * callers render the default order on first paint and avoid SSR/CSR mismatch.
 */
export function useNavCustomization(): {
  custom: NavCustomization;
  mounted: boolean;
  apply: (change: NavChange) => void;
} {
  const [custom, setCustom] = useState<NavCustomization>(emptyNavCustomization);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCustom(readCustomization());
    const onChange = () => setCustom(readCustomization());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) onChange();
    };
    window.addEventListener(SYNC_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SYNC_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const apply = useCallback((change: NavChange) => {
    const next = reduceCustomization(readCustomization(), change);
    setCustom(next);
    writeCustomization(next);
  }, []);

  return { custom, mounted, apply };
}
