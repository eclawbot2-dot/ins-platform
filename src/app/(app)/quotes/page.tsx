import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { LOB_LABELS } from "@/lib/labels";
import { fmtDate } from "@/lib/domain/dates";
import { applySort, parseSortParams } from "@/lib/sort";
import type { QuoteRequestStatus } from "@prisma/client";

export const metadata = { title: "Quoting" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<QuoteRequestStatus, "blue" | "violet" | "amber" | "green" | "red"> = {
  OPEN: "blue",
  QUOTED: "violet",
  PRESENTED: "amber",
  BOUND: "green",
  LOST: "red",
};

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string; dir?: string }>;
}) {
  const { status, sort, dir } = await searchParams;
  const sortState = parseSortParams(sort, dir, ["for", "lob", "status", "quotes", "effective", "owner", "created"]);
  const statuses: QuoteRequestStatus[] = ["OPEN", "QUOTED", "PRESENTED", "BOUND", "LOST"];
  const statusFilter = statuses.includes(status as QuoteRequestStatus) ? (status as QuoteRequestStatus) : undefined;

  const requests = await prisma.quoteRequest.findMany({
    where: statusFilter ? { status: statusFilter } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      client: { select: { id: true, name: true } },
      lead: { select: { id: true, firstName: true, lastName: true } },
      owner: { select: { name: true } },
      quotes: { select: { id: true } },
    },
  });

  // Filter (where) → sort (copy) → render.
  const sorted = applySort(
    requests,
    {
      for: (r) => r.client?.name ?? (r.lead ? `${r.lead.firstName} ${r.lead.lastName}` : null),
      lob: (r) => LOB_LABELS[r.lineOfBusiness],
      status: (r) => r.status,
      quotes: (r) => r.quotes.length,
      effective: (r) => r.effectiveDate,
      owner: (r) => r.owner.name,
      created: (r) => r.createdAt,
    },
    sortState,
  );

  return (
    <>
      <PageHeader
        title="Quote requests"
        description="Multi-carrier quoting and bind."
        actions={
          <Link href="/quotes/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New quote request
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/quotes" className={`btn btn-sm ${!statusFilter ? "border-navy-300 bg-navy-50" : ""}`}>
          All
        </Link>
        {statuses.map((s) => (
          <Link key={s} href={`/quotes?status=${s}`} className={`btn btn-sm ${statusFilter === s ? "border-navy-300 bg-navy-50" : ""}`}>
            {s}
          </Link>
        ))}
      </div>
      <DataTable
        rows={sorted}
        rowHref={(r) => `/quotes/${r.id}`}
        sort={{ ...sortState, basePath: "/quotes", params: { status: statusFilter } }}
        emptyMessage="No quote requests."
        columns={[
          {
            key: "for",
            header: "For",
            sortable: true,
            render: (r) => r.client?.name ?? (r.lead ? `${r.lead.firstName} ${r.lead.lastName} (lead)` : "—"),
          },
          { key: "lob", header: "Line", sortable: true, render: (r) => LOB_LABELS[r.lineOfBusiness] },
          { key: "status", header: "Status", sortable: true, render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
          { key: "quotes", header: "Quotes", sortable: true, render: (r) => r.quotes.length },
          { key: "effective", header: "Target effective", sortable: true, render: (r) => (r.effectiveDate ? fmtDate(r.effectiveDate) : "—") },
          { key: "owner", header: "Owner", sortable: true, render: (r) => r.owner.name },
          { key: "created", header: "Created", sortable: true, render: (r) => fmtDate(r.createdAt) },
        ]}
      />
    </>
  );
}
