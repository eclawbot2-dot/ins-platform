/**
 * Table sorting helpers — pure, shared by server pages (URL-driven sort
 * via SortableHeader links) and client components (useSortableData).
 *
 * Order of operations everywhere: load data → apply search/filter →
 * apply sort → paginate → render. `sortRows` never mutates its input.
 */

export type SortDirection = "asc" | "desc";

/** Real values only — dates sort by time, numbers numerically. */
export type SortValue = string | number | Date | boolean | null | undefined;

export type SortAccessor<T> = (row: T) => SortValue;

function rank(v: SortValue): number {
  // null/undefined/empty always sort last regardless of direction sign
  // handled in compare below; rank just classifies emptiness.
  return v == null || v === "" ? 1 : 0;
}

/**
 * Compare two sort values by their real types:
 * dates by epoch, numbers/booleans numerically, strings
 * case-insensitively. Mixed/empty values sort last.
 */
export function compareSortValues(a: SortValue, b: SortValue): number {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 1) return 0;

  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : NaN;
    const tb = b instanceof Date ? b.getTime() : NaN;
    if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.isNaN(ta) ? (Number.isNaN(tb) ? 0 : 1) : -1;
    return ta - tb;
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), "en", { sensitivity: "base", numeric: true });
}

/** Sort a COPY of `rows` (stable) by the accessor in the given direction.
 *  Empty values stay last in BOTH directions (Drive-style). */
export function sortRows<T>(rows: readonly T[], accessor: SortAccessor<T>, direction: SortDirection): T[] {
  const sign = direction === "desc" ? -1 : 1;
  return rows
    .map((row, i) => ({ row, i, v: accessor(row) }))
    .sort((x, y) => {
      const rx = rank(x.v);
      const ry = rank(y.v);
      if (rx !== ry) return rx - ry; // empties last, direction-independent
      if (rx === 1) return x.i - y.i;
      const c = compareSortValues(x.v, y.v);
      return c !== 0 ? sign * c : x.i - y.i; // stable
    })
    .map((e) => e.row);
}

export type SortState = { sortKey?: string; sortDir: SortDirection };

/** Parse `?sort=&dir=` style params; unknown keys are ignored. */
export function parseSortParams(
  sortRaw: string | undefined,
  dirRaw: string | undefined,
  allowedKeys: readonly string[],
): SortState {
  const sortKey = sortRaw && allowedKeys.includes(sortRaw) ? sortRaw : undefined;
  const sortDir: SortDirection = dirRaw === "desc" ? "desc" : "asc";
  return { sortKey, sortDir };
}

/** Next direction when a header is clicked: asc → desc → asc… */
export function nextDirection(active: boolean, current: SortDirection): SortDirection {
  return active && current === "asc" ? "desc" : "asc";
}

/**
 * Build the href for a sortable header link. Preserves the other query
 * params (search/filters), resets pagination, toggles direction when
 * the column is already active. `sortParam`/`dirParam` allow several
 * independent tables on one page (e.g. ?eoSort=…&eoDir=…).
 */
export function buildSortHref(
  basePath: string,
  params: Record<string, string | undefined>,
  key: string,
  state: SortState,
  sortParam = "sort",
  dirParam = "dir",
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== "page" && k !== sortParam && k !== dirParam) sp.set(k, v);
  }
  sp.set(sortParam, key);
  sp.set(dirParam, nextDirection(state.sortKey === key, state.sortDir));
  return `${basePath}?${sp.toString()}`;
}

/** Sort rows with a map of per-key accessors; no-op when key is unset/unknown. */
export function applySort<T>(
  rows: readonly T[],
  accessors: Record<string, SortAccessor<T>>,
  state: SortState,
): T[] {
  if (!state.sortKey || !accessors[state.sortKey]) return [...rows];
  return sortRows(rows, accessors[state.sortKey], state.sortDir);
}
