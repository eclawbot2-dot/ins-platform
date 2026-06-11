"use client";

/**
 * Google Drive-style Card/List view toggle (spec §1-5).
 *
 * Both views are passed in fully rendered (they can be server-rendered
 * ReactNodes — forms, links and server actions keep working); this
 * wrapper only owns which one is visible. The choice persists per
 * entity in localStorage (e.g. `clientsViewMode`) and defaults to
 * Card view. Switching views never resets search/filter state because
 * those live in the URL / parent.
 */

import { useEffect, useState, type ReactNode } from "react";
import { LayoutGrid, List } from "lucide-react";

export type ViewMode = "cards" | "list";

export function ViewToggleButtons({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  const btn = (active: boolean) =>
    `inline-flex h-8 w-9 cursor-pointer items-center justify-center transition first:rounded-l-lg last:rounded-r-lg ${
      active ? "bg-navy-700 text-white" : "bg-white text-slate-500 hover:bg-slate-50 hover:text-navy-700"
    }`;
  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-slate-300" role="group" aria-label="View mode">
      <button
        type="button"
        className={btn(mode === "cards")}
        aria-label="Card view"
        title="Card view"
        aria-pressed={mode === "cards"}
        onClick={() => onChange("cards")}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={btn(mode === "list")}
        aria-label="List view"
        title="List view"
        aria-pressed={mode === "list"}
        onClick={() => onChange("list")}
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useViewMode(storageKey: string, defaultMode: ViewMode = "cards") {
  const [mode, setMode] = useState<ViewMode>(defaultMode);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "cards" || saved === "list") setMode(saved);
    } catch {
      /* keep default */
    }
  }, [storageKey]);
  const change = (m: ViewMode) => {
    setMode(m);
    try {
      window.localStorage.setItem(storageKey, m);
    } catch {
      /* ignore */
    }
  };
  return [mode, change] as const;
}

export function ViewToggle({
  storageKey,
  toolbar,
  cards,
  list,
}: {
  /** localStorage key, e.g. "clientsViewMode". */
  storageKey: string;
  /** Optional search/filter controls rendered left of the toggle. */
  toolbar?: ReactNode;
  cards: ReactNode;
  list: ReactNode;
}) {
  const [mode, setMode] = useViewMode(storageKey);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">{toolbar}</div>
        <ViewToggleButtons mode={mode} onChange={setMode} />
      </div>
      {mode === "cards" ? cards : list}
    </>
  );
}
