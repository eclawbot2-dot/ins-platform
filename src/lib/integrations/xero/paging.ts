/**
 * Xero paged-GET helper + date normalization. The Accounting API caps
 * list endpoints at 100 records per page; pull routines walk pages
 * until a short page. Ported from gcon.
 */

export const XERO_PAGE_SIZE = 100;
export const XERO_MAX_PAGES_PER_RUN = 50;

/**
 * Normalize a Xero JSON date — ISO-8601 or the legacy .NET
 * "/Date(1518685950940+0000)/" form — to a Date. Returns null when
 * unparseable.
 */
export function xeroDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = /\/Date\((\d+)(?:[+-]\d{4})?\)\//.exec(raw);
  const d = m ? new Date(Number(m[1])) : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Same normalization, as ISO string (for If-Modified-Since markers). */
export function xeroDateToIso(raw: string | null | undefined): string | null {
  const d = xeroDate(raw);
  return d ? d.toISOString() : null;
}

export async function xeroGetAllPages<T>(args: {
  /** Endpoint URL WITHOUT the page param (other query params allowed). */
  url: URL;
  headers: Record<string, string>;
  /** JSON response key holding the record array, e.g. "Invoices". */
  listKey: string;
  maxPages?: number;
}): Promise<{ rows: T[]; truncated: boolean; notModified: boolean }> {
  const maxPages = args.maxPages ?? XERO_MAX_PAGES_PER_RUN;
  const rows: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const u = new URL(args.url.toString());
    u.searchParams.set("page", String(page));
    const res = await fetch(u, { headers: args.headers });
    if (res.status === 304) {
      return { rows, truncated: false, notModified: page === 1 };
    }
    if (!res.ok) throw new Error(`xero ${args.listKey} pull ${res.status}`);
    const json = (await res.json()) as Record<string, unknown>;
    const batch = (json[args.listKey] as T[] | undefined) ?? [];
    rows.push(...batch);
    if (batch.length < XERO_PAGE_SIZE) return { rows, truncated: false, notModified: false };
  }
  return { rows, truncated: true, notModified: false };
}
