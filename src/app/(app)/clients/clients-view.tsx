"use client";

/**
 * Clients — Card/List view toggle (spec drive-view-sortable-tables §1-5).
 *
 * The page filters server-side (?q=&status= stay in the URL, so search
 * works identically in both views and survives view switches); this
 * component owns: view mode (persisted as `clientsViewMode`), sorting
 * (persisted as `clientsSortKey`/`clientsSortDirection`, real values —
 * dates by date, counts/premium numerically) and pagination, applied
 * strictly filter → sort → paginate → render.
 */

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SortableHeader, useSortableData } from "@/components/ui/sortable";
import { ViewToggleButtons, useViewMode } from "@/components/ui/view-toggle";
import { ariaSort, type SortAccessor } from "@/lib/sort";

export type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  statusLabel: string;
  type: string;
  city: string | null;
  state: string | null;
  producerName: string | null;
  policiesCount: number;
  activePremium: number;
  activePremiumFmt: string;
  addedAt: number; // epoch ms — real value for sorting
  addedDateFmt: string;
};

const PAGE_SIZE = 25;

const ACCESSORS: Record<string, SortAccessor<ClientRow>> = {
  name: (c) => c.name,
  email: (c) => c.email,
  phone: (c) => c.phone,
  policies: (c) => c.policiesCount,
  added: (c) => c.addedAt,
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function statusTone(status: string) {
  return status === "ACTIVE" ? "green" : status === "PROSPECT" ? "blue" : "slate";
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-100 text-xs font-semibold text-navy-700">
      {initials(name) || "?"}
    </span>
  );
}

export function ClientsView({ clients, toolbar, emptyMessage }: { clients: ClientRow[]; toolbar: ReactNode; emptyMessage: ReactNode }) {
  const router = useRouter();
  const [mode, setMode] = useViewMode("clientsViewMode");
  const { sorted, sortKey, sortDirection, requestSort } = useSortableData(clients, ACCESSORS, {
    storagePrefix: "clients",
  });
  const [pageState, setPage] = useState(1);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(pageState, pages);
  const visible = useMemo(() => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [sorted, page]);

  const header = (key: string, label: string) => (
    <th aria-sort={ariaSort(sortKey === key, sortDirection)}>
      <SortableHeader label={label} active={sortKey === key} direction={sortDirection} onClick={() => requestSort(key)} />
    </th>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">{toolbar}</div>
        <ViewToggleButtons mode={mode} onChange={setMode} />
      </div>

      {sorted.length === 0 ? (
        <div className="card px-3 py-10 text-center text-sm text-slate-400">{emptyMessage}</div>
      ) : mode === "cards" ? (
        /* ── Card view ────────────────────────────────────────────── */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`} className="card-pad block transition hover:border-navy-300 hover:shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={c.name} />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-navy-700">{c.name}</div>
                    <div className="text-xs text-slate-500">
                      {c.type === "BUSINESS" ? "Business" : "Individual"}
                      {c.city ? ` · ${c.city}${c.state ? `, ${c.state}` : ""}` : ""}
                    </div>
                  </div>
                </div>
                <Badge tone={statusTone(c.status)}>{c.statusLabel}</Badge>
              </div>
              <div className="mt-3 space-y-0.5 text-sm text-slate-600">
                <div className="truncate">{c.email ?? "—"}</div>
                <div>{c.phone ?? "—"}</div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                <span>
                  {c.policiesCount} {c.policiesCount === 1 ? "policy" : "policies"} · {c.activePremiumFmt}
                </span>
                <span>Added {c.addedDateFmt}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* ── Compact Drive-style list view ────────────────────────── */
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                {header("name", "Client")}
                {header("email", "Email")}
                {header("phone", "Phone")}
                {header("policies", "Policies")}
                {header("added", "Added")}
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr
                  key={c.id}
                  className="h-14 cursor-pointer"
                  onClick={() => router.push(`/clients/${c.id}`)}
                >
                  <td>
                    <span className="flex items-center gap-3">
                      <Avatar name={c.name} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-navy-700">{c.name}</span>
                        <span className="block text-xs text-slate-400">{c.statusLabel}</span>
                      </span>
                    </span>
                  </td>
                  <td className="text-slate-600">{c.email ?? "—"}</td>
                  <td className="whitespace-nowrap text-slate-600">{c.phone ?? "—"}</td>
                  <td>{c.policiesCount}</td>
                  <td className="whitespace-nowrap">{c.addedDateFmt}</td>
                  <td className="text-right">
                    <span className="inline-flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Link href={`/clients/${c.id}`} className="btn btn-sm">
                        View
                      </Link>
                      <Link href={`/clients/${c.id}/edit`} className="btn btn-sm" aria-label={`Edit ${c.name}`}>
                        <Pencil className="h-3 w-3" /> Edit
                      </Link>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
          <div>
            Page {page} of {pages} · {sorted.length} records
          </div>
          <div className="flex gap-2">
            {page > 1 ? (
              <button type="button" className="btn btn-sm" onClick={() => setPage(page - 1)}>
                ← Prev
              </button>
            ) : null}
            {page < pages ? (
              <button type="button" className="btn btn-sm" onClick={() => setPage(page + 1)}>
                Next →
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
