"use client";

/**
 * Wraps a nav group or item and adds a right-click context menu to move it
 * up/down among its siblings or hide it. Left-click still navigates/expands
 * normally — we only intercept the context (right-click) event. The menu is
 * portaled to <body> at the cursor and closes on outside click, scroll,
 * Escape, and resize.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { NavChange } from "./nav-customization";

type Kind = "group" | "item";

export function NavContextMenu({
  kind,
  id,
  parentKey,
  siblings,
  label,
  apply,
  as: Tag = "div",
  className,
  children,
}: {
  kind: Kind;
  id: string;
  parentKey: string;
  siblings: string[];
  label: string;
  apply: (change: NavChange) => void;
  /** Wrapper element — use "li" when nesting directly inside a <ul>. */
  as?: "div" | "li";
  className?: string;
  children: React.ReactNode;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const idx = siblings.indexOf(id);
  const canUp = idx > 0;
  const canDown = idx >= 0 && idx < siblings.length - 1;

  function move(dir: -1 | 1) {
    setMenu(null);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= siblings.length) return;
    const next = [...siblings];
    [next[idx], next[j]] = [next[j], next[idx]];
    apply({ type: "reorder", parentKey, order: next });
  }

  function hide() {
    setMenu(null);
    apply({ type: "hide", id });
  }

  const kindLabel = kind === "group" ? "Group" : "Item";
  const itemCls =
    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-35 disabled:hover:bg-transparent";

  return (
    <Tag
      onContextMenu={(e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      data-nav-id={id}
      className={className}
    >
      {children}
      {menu && mounted
        ? createPortal(
            <div
              className="fixed z-[200] min-w-48 rounded-lg border border-white/10 bg-[#0b162b] p-1 shadow-2xl"
              style={{
                left: Math.min(menu.x, window.innerWidth - 210),
                top: Math.min(menu.y, window.innerHeight - 140),
              }}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              role="menu"
            >
              <div className="truncate px-2 py-1 text-[10px] uppercase tracking-wide text-slate-500">
                {kindLabel}: {label}
              </div>
              <button type="button" className={itemCls} disabled={!canUp} onClick={() => move(-1)}>
                ↑ Move up
              </button>
              <button type="button" className={itemCls} disabled={!canDown} onClick={() => move(1)}>
                ↓ Move down
              </button>
              <div className="my-1 border-t border-white/5" />
              <button
                type="button"
                className={`${itemCls} text-rose-300 hover:bg-rose-500/10`}
                onClick={hide}
              >
                ⊘ Hide this {kind}
              </button>
            </div>,
            document.body,
          )
        : null}
    </Tag>
  );
}
