import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { SearchBar, Pagination, PAGE_SIZE, parsePage } from "@/components/ui/list-controls";
import { Badge } from "@/components/ui/badge";
import { CLAIM_STATUS_LABELS, LOB_LABELS, claimStatusTone } from "@/lib/labels";
import { fmtMoney } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";
import type { ClaimStatus, Prisma } from "@prisma/client";

export const metadata = { title: "Claims" };
export const dynamic = "force-dynamic";

const STATUSES: ClaimStatus[] = ["REPORTED", "OPEN", "UNDER_REVIEW", "APPROVED", "DENIED", "CLOSED"];

export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q, status, page: pageRaw } = await searchParams;
  const page = parsePage(pageRaw);
  const statusFilter = STATUSES.includes(status as ClaimStatus) ? (status as ClaimStatus) : undefined;

  const where: Prisma.ClaimWhereInput = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(q
      ? {
          OR: [
            { claimNumber: { contains: q, mode: "insensitive" } },
            { carrierClaimRef: { contains: q, mode: "insensitive" } },
            { client: { name: { contains: q, mode: "insensitive" } } },
            { policy: { policyNumber: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [claims, total] = await Promise.all([
    prisma.claim.findMany({
      where,
      orderBy: { reportedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        client: { select: { name: true } },
        policy: { select: { policyNumber: true, lineOfBusiness: true, carrier: { select: { name: true } } } },
      },
    }),
    prisma.claim.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Claims"
        description="FNOL entry and claim advocacy tracking."
        actions={
          <Link href="/claims/new" className="btn-primary">
            <Plus className="h-4 w-4" /> File FNOL
          </Link>
        }
      />
      <div className="mb-4">
        <SearchBar action="/claims" q={q} placeholder="Search claim #, client, policy…">
          <select name="status" defaultValue={statusFilter ?? ""} className="input w-40">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {CLAIM_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </SearchBar>
      </div>
      <DataTable
        rows={claims}
        rowHref={(c) => `/claims/${c.id}`}
        emptyMessage="No claims match."
        columns={[
          { key: "claimNumber", header: "Claim #" },
          { key: "client", header: "Client", render: (c) => c.client.name },
          { key: "policy", header: "Policy", render: (c) => c.policy.policyNumber },
          { key: "lob", header: "Line", render: (c) => LOB_LABELS[c.policy.lineOfBusiness] },
          { key: "carrier", header: "Carrier", render: (c) => c.policy.carrier.name },
          {
            key: "status",
            header: "Status",
            render: (c) => <Badge tone={claimStatusTone(c.status)}>{CLAIM_STATUS_LABELS[c.status]}</Badge>,
          },
          { key: "dol", header: "Date of loss", render: (c) => fmtDate(c.dateOfLoss) },
          { key: "reserve", header: "Reserve", className: "text-right", render: (c) => (c.reserveAmount ? fmtMoney(c.reserveAmount) : "—") },
          { key: "paid", header: "Paid", className: "text-right", render: (c) => (c.paidAmount ? fmtMoney(c.paidAmount) : "—") },
        ]}
      />
      <div className="mt-3">
        <Pagination basePath="/claims" page={page} total={total} params={{ q, status: statusFilter }} />
      </div>
    </>
  );
}
