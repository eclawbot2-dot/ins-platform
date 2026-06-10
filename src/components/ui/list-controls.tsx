import Link from "next/link";
import { Search } from "lucide-react";

/**
 * GET-form search box — submits ?q= to the current path. Optional
 * select filters render alongside; everything stays server-side.
 */
export function SearchBar({
  action,
  q,
  placeholder = "Search…",
  filters,
  children,
}: {
  action: string;
  q?: string;
  placeholder?: string;
  /** Hidden fields to preserve, e.g. { status: "ACTIVE" }. */
  filters?: Record<string, string | undefined>;
  /** Extra filter controls (selects) rendered inside the form. */
  children?: React.ReactNode;
}) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input name="q" defaultValue={q ?? ""} placeholder={placeholder} className="input w-64 pl-8" />
      </div>
      {filters
        ? Object.entries(filters).map(([k, v]) =>
            v ? <input key={k} type="hidden" name={k} value={v} /> : null,
          )
        : null}
      {children}
      <button type="submit" className="btn">
        Filter
      </button>
    </form>
  );
}

export const PAGE_SIZE = 25;

export function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function Pagination({
  basePath,
  page,
  total,
  params,
}: {
  basePath: string;
  page: number;
  total: number;
  params?: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  const qs = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <div className="flex items-center justify-between text-sm text-slate-500">
      <div>
        Page {page} of {pages} · {total} records
      </div>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className="btn btn-sm" href={qs(page - 1)}>
            ← Prev
          </Link>
        ) : null}
        {page < pages ? (
          <Link className="btn btn-sm" href={qs(page + 1)}>
            Next →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
