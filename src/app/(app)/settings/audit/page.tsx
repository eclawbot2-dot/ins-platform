import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { SearchBar, Pagination, PAGE_SIZE, parsePage } from "@/components/ui/list-controls";
import { ThSort } from "@/components/ui/data-table";
import { parseSortParams, type SortDirection } from "@/lib/sort";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

// Server-side sort: orders the FULL dataset before pagination.
const SORTS: Record<string, (d: SortDirection) => Prisma.AuditLogOrderByWithRelationInput> = {
  when: (d) => ({ createdAt: d }),
  actor: (d) => ({ user: { name: d } }),
  action: (d) => ({ action: d }),
  entity: (d) => ({ entityType: d }),
  ip: (d) => ({ ip: d }),
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; sort?: string; dir?: string }>;
}) {
  const { q, page: pageRaw, sort, dir } = await searchParams;
  const sortState = parseSortParams(sort, dir, Object.keys(SORTS));
  const tableSort = { ...sortState, basePath: "/settings/audit", params: { q } };
  const page = parsePage(pageRaw);

  const where: Prisma.AuditLogWhereInput = q
    ? {
        OR: [
          { action: { contains: q, mode: "insensitive" } },
          { actorEmail: { contains: q, mode: "insensitive" } },
          { entityType: { contains: q, mode: "insensitive" } },
          { detail: { contains: q, mode: "insensitive" } },
          { user: { is: { name: { contains: q, mode: "insensitive" } } } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: sortState.sortKey ? SORTS[sortState.sortKey](sortState.sortDir) : { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Logins and critical changes, newest first."
        actions={<Link href="/settings" className="btn">← Settings</Link>}
      />

      <div className="mb-4">
        <SearchBar action="/settings/audit" q={q} placeholder="Search action, user, entity…" />
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <ThSort k="when" label="When (UTC)" sort={tableSort} />
              <ThSort k="actor" label="Actor" sort={tableSort} />
              <ThSort k="action" label="Action" sort={tableSort} />
              <ThSort k="entity" label="Entity" sort={tableSort} />
              <th>Detail</th>
              <ThSort k="ip" label="IP" sort={tableSort} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-slate-400">No audit entries.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-xs">{dateFmt.format(r.createdAt)}</td>
                  <td>{r.user?.name ?? r.actorEmail ?? "system"}</td>
                  <td className="font-mono text-xs">{r.action}</td>
                  <td className="text-xs">{r.entityType ? `${r.entityType}${r.entityId ? ` (${r.entityId.slice(0, 8)}…)` : ""}` : "—"}</td>
                  <td className="max-w-xs truncate text-xs text-slate-500">{r.detail ?? ""}</td>
                  <td className="text-xs text-slate-400">{r.ip ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <Pagination basePath="/settings/audit" page={page} total={total} params={{ q, sort, dir }} />
      </div>
    </>
  );
}
