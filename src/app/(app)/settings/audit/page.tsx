import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { SearchBar, Pagination, PAGE_SIZE, parsePage } from "@/components/ui/list-controls";
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

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageRaw } = await searchParams;
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
      orderBy: { createdAt: "desc" },
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
              <th>When (UTC)</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Detail</th>
              <th>IP</th>
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
        <Pagination basePath="/settings/audit" page={page} total={total} params={{ q }} />
      </div>
    </>
  );
}
