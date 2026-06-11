import Link from "next/link";
import type { ReactNode } from "react";
import { SortableHeader, ariaSort } from "@/components/ui/sortable";
import { buildSortHref, type SortState } from "@/lib/sort";

export type Column<T> = {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  className?: string;
  /** Column participates in click-to-sort (requires DataTable `sort`). */
  sortable?: boolean;
};

/** URL-driven sort config: the page orders the FULL dataset server-side
 *  (before pagination) and the headers link back with ?sort=&dir=. */
export type TableSort = SortState & {
  basePath: string;
  /** Current search/filter params to preserve in header links. */
  params?: Record<string, string | undefined>;
  sortParam?: string;
  dirParam?: string;
};

/** Sortable <th> for hand-rolled tables (renewals, compliance, reports…). */
export function ThSort({
  k,
  label,
  sort,
  className,
}: {
  k: string;
  label: ReactNode;
  sort: TableSort;
  className?: string;
}) {
  const active = sort.sortKey === k;
  return (
    <th className={className} aria-sort={ariaSort(active, sort.sortDir)}>
      <SortableHeader
        label={label}
        active={active}
        direction={sort.sortDir}
        href={buildSortHref(sort.basePath, sort.params ?? {}, k, sort, sort.sortParam, sort.dirParam)}
      />
    </th>
  );
}

/**
 * Server-rendered list table. Search/filter/pagination/sort live in the
 * URL (see SearchBar / Pagination / SortableHeader); the page queries
 * Prisma with those params and hands the rows here.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  emptyMessage = "No records found.",
  sort,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey?: (row: T) => string;
  rowHref?: (row: T) => string | null;
  emptyMessage?: ReactNode;
  sort?: TableSort;
}) {
  const keyOf = (row: T, i: number) => (rowKey ? rowKey(row) : String((row as { id?: unknown }).id ?? i));
  return (
    <div className="card overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            {columns.map((c) => {
              const sortable = Boolean(sort && c.sortable);
              const active = Boolean(sort && sort.sortKey === c.key);
              return (
                <th key={c.key} className={c.className} aria-sort={sortable ? ariaSort(active, sort!.sortDir) : undefined}>
                  {sortable ? (
                    <SortableHeader
                      label={c.header}
                      active={active}
                      direction={sort!.sortDir}
                      href={buildSortHref(sort!.basePath, sort!.params ?? {}, c.key, sort!, sort!.sortParam, sort!.dirParam)}
                    />
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-slate-400">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => {
              const href = rowHref?.(row) ?? null;
              return (
                <tr key={keyOf(row, i)}>
                  {columns.map((c, ci) => {
                    const content = c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "");
                    return (
                      <td key={c.key} className={c.className}>
                        {href && ci === 0 ? (
                          <Link href={href} className="font-medium text-navy-700 hover:underline">
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
