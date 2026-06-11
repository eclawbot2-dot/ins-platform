import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { SearchBar, Pagination, PAGE_SIZE, parsePage } from "@/components/ui/list-controls";
import { Badge } from "@/components/ui/badge";
import { LEAD_STATUS_LABELS, LOB_LABELS, leadStatusTone } from "@/lib/labels";
import { leadGrade } from "@/lib/domain/lead-scoring";
import { fmtDate } from "@/lib/domain/dates";
import type { LeadStatus, Prisma } from "@prisma/client";

export const metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

const STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q, status, page: pageRaw } = await searchParams;
  const page = parsePage(pageRaw);
  const statusFilter = STATUSES.includes(status as LeadStatus) ? (status as LeadStatus) : undefined;

  const where: Prisma.LeadWhereInput = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { source: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { assignedTo: { select: { name: true } }, campaign: { select: { name: true } } },
    }),
    prisma.lead.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Leads"
        description="Inbound and manually entered leads with scoring."
        actions={
          <Link href="/leads/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New lead
          </Link>
        }
      />
      <div className="mb-4">
        <SearchBar action="/leads" q={q} placeholder="Search name, email, source…">
          <select name="status" defaultValue={statusFilter ?? ""} className="input w-40">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </SearchBar>
      </div>
      <DataTable
        rows={leads}
        rowHref={(l) => `/leads/${l.id}`}
        emptyMessage={
          q || statusFilter ? (
            "No leads match your search."
          ) : (
            <span>
              No leads yet.{" "}
              <Link href="/leads/new" className="font-medium text-indigo-700 hover:underline">
                Add a lead →
              </Link>
            </span>
          )
        }
        columns={[
          { key: "name", header: "Name", render: (l) => `${l.firstName} ${l.lastName}` },
          {
            key: "score",
            header: "Score",
            render: (l) => (
              <Badge tone={l.score >= 70 ? "green" : l.score >= 50 ? "blue" : l.score >= 30 ? "amber" : "slate"}>
                {l.score} · {leadGrade(l.score)}
              </Badge>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (l) => <Badge tone={leadStatusTone(l.status)}>{LEAD_STATUS_LABELS[l.status]}</Badge>,
          },
          {
            key: "lob",
            header: "Line",
            className: "hidden md:table-cell",
            render: (l) => (l.lineOfBusiness ? LOB_LABELS[l.lineOfBusiness] : "—"),
          },
          { key: "source", header: "Source", className: "hidden md:table-cell", render: (l) => l.source ?? "—" },
          { key: "campaign", header: "Campaign", className: "hidden lg:table-cell", render: (l) => l.campaign?.name ?? "—" },
          { key: "assigned", header: "Assigned", className: "hidden lg:table-cell", render: (l) => l.assignedTo?.name ?? "—" },
          { key: "created", header: "Created", render: (l) => fmtDate(l.createdAt) },
        ]}
      />
      <div className="mt-3">
        <Pagination basePath="/leads" page={page} total={total} params={{ q, status: statusFilter }} />
      </div>
    </>
  );
}
