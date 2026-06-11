"use client";

/**
 * Shared sortable-table pieces (spec: drive-view-sortable-tables §6-10).
 *
 * - <SortableHeader> — header cell content. Two modes:
 *   • `href` (server tables): a Link that round-trips ?sort=&dir= so the
 *     server can order the FULL dataset before pagination.
 *   • `onClick` (client tables): plain button driven by useSortableData.
 * - useSortableData — client-side sort state (sortKey/sortDirection) with
 *   optional localStorage persistence; always sorts a copy, after the
 *   caller has already filtered.
 */

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  applySort,
  nextDirection,
  type SortAccessor,
  type SortDirection,
} from "@/lib/sort";

export function SortableHeader({
  label,
  active,
  direction,
  href,
  onClick,
}: {
  label: ReactNode;
  active: boolean;
  direction: SortDirection;
  href?: string;
  onClick?: () => void;
}) {
  const aria = `Sort by ${typeof label === "string" ? label : "column"}${
    active ? ` (currently ${direction === "asc" ? "ascending" : "descending"})` : ""
  }`;
  const inner = (
    <>
      <span>{label}</span>
      {active ? (
        direction === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5 shrink-0 text-gold-500" aria-hidden />
        ) : (
          <ArrowDown className="h-3.5 w-3.5 shrink-0 text-gold-500" aria-hidden />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 shrink-0 text-slate-300 transition group-hover:text-slate-400" aria-hidden />
      )}
    </>
  );
  const cls = `group inline-flex cursor-pointer select-none items-center gap-1 uppercase tracking-wide transition hover:text-navy-700 ${
    active ? "text-navy-800" : ""
  }`;
  if (href) {
    return (
      <Link href={href} aria-label={aria} title={aria} className={cls} prefetch={false}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={aria} title={aria} className={cls}>
      {inner}
    </button>
  );
}

/** aria-sort value for the <th> that hosts a SortableHeader. */
export function ariaSort(active: boolean, direction: SortDirection): "ascending" | "descending" | undefined {
  return active ? (direction === "asc" ? "ascending" : "descending") : undefined;
}

export function useSortableData<T>(
  rows: readonly T[],
  accessors: Record<string, SortAccessor<T>>,
  options: {
    /** localStorage key prefix, e.g. "clients" → clientsSortKey/clientsSortDirection. */
    storagePrefix?: string;
    defaultKey?: string;
    defaultDirection?: SortDirection;
  } = {},
) {
  const { storagePrefix, defaultKey, defaultDirection = "asc" } = options;
  const [sortKey, setSortKey] = useState<string | undefined>(defaultKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDirection);

  // Restore persisted sort after mount (avoids SSR hydration mismatch).
  useEffect(() => {
    if (!storagePrefix) return;
    try {
      const k = window.localStorage.getItem(`${storagePrefix}SortKey`);
      const d = window.localStorage.getItem(`${storagePrefix}SortDirection`);
      if (k && accessors[k]) setSortKey(k);
      if (d === "asc" || d === "desc") setSortDirection(d);
    } catch {
      /* private mode etc. — keep defaults */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storagePrefix]);

  const requestSort = (key: string) => {
    const dir = nextDirection(sortKey === key, sortDirection);
    setSortKey(key);
    setSortDirection(dir);
    if (storagePrefix) {
      try {
        window.localStorage.setItem(`${storagePrefix}SortKey`, key);
        window.localStorage.setItem(`${storagePrefix}SortDirection`, dir);
      } catch {
        /* ignore */
      }
    }
  };

  const sorted = useMemo(
    () => applySort(rows, accessors, { sortKey, sortDir: sortDirection }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sortKey, sortDirection],
  );

  return { sorted, sortKey, sortDirection, requestSort };
}
