import Link from "next/link";
import type { ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  className?: string;
};

/**
 * Server-rendered list table. Search/filter/pagination live in the URL
 * (see SearchBar / Pagination); the page queries Prisma with those
 * params and hands the rows here.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  emptyMessage = "No records found.",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey?: (row: T) => string;
  rowHref?: (row: T) => string | null;
  emptyMessage?: ReactNode;
}) {
  const keyOf = (row: T, i: number) => (rowKey ? rowKey(row) : String((row as { id?: unknown }).id ?? i));
  return (
    <div className="card overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.className}>
                {c.header}
              </th>
            ))}
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
                          <Link href={href} className="font-medium text-indigo-700 hover:underline">
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
