"use client";

/**
 * Footer control for the sidebar customization: lists the user's hidden
 * groups/items with a one-click restore, plus a reset-to-default that clears
 * BOTH the hidden set and any saved order. When nothing is hidden it shows a
 * faint hint that right-click customizes.
 */

import { useState } from "react";
import { NAV_SECTIONS } from "./nav-data";
import { itemIdOf, useNavCustomization } from "./nav-customization";

type HiddenNode = { id: string; label: string; kind: string };

/**
 * Resolve every hideable node's id → friendly label/kind, so a hidden id can
 * be shown with its real name (independent of current order/visibility).
 */
function buildLabelIndex(): Map<string, HiddenNode> {
  const index = new Map<string, HiddenNode>();
  for (const section of NAV_SECTIONS) {
    index.set(section.title, { id: section.title, label: section.title, kind: "group" });
    for (const item of section.items) {
      const id = itemIdOf(section.title, item.href);
      index.set(id, { id, label: `${section.title} · ${item.label}`, kind: "item" });
    }
  }
  return index;
}

export function NavCustomizeFooter() {
  const { custom, mounted, apply } = useNavCustomization();
  const [open, setOpen] = useState(false);

  // Render nothing customization-specific until mounted, to keep first paint
  // identical to the server render (the hint below is the mounted default).
  const index = buildLabelIndex();
  const hidden: HiddenNode[] = mounted
    ? custom.hidden.map(
        (id) => index.get(id) ?? { id, label: id, kind: "hidden" },
      )
    : [];

  if (hidden.length === 0) {
    return (
      <div className="px-2 pb-1 text-[10px] leading-relaxed text-slate-600">
        Right-click any group or item to move or hide it.
      </div>
    );
  }

  return (
    <div className="px-1 pb-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 transition hover:bg-white/5"
      >
        <span className="text-slate-600">{open ? "▾" : "▸"}</span>
        <span className="flex-1">Hidden nav ({hidden.length})</span>
      </button>
      {open ? (
        <div className="mt-1 space-y-0.5">
          {hidden.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between gap-2 rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-white/5"
            >
              <span className="min-w-0 truncate">
                <span className="text-slate-600">{h.kind}</span> · {h.label}
              </span>
              <button
                type="button"
                onClick={() => apply({ type: "unhide", id: h.id })}
                className="shrink-0 text-sky-300 transition hover:text-sky-200"
              >
                restore
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => apply({ type: "reset" })}
            className="mt-1 w-full rounded border border-white/10 px-2 py-1 text-[11px] text-slate-400 transition hover:bg-white/5"
          >
            Reset nav to default
          </button>
        </div>
      ) : null}
    </div>
  );
}
