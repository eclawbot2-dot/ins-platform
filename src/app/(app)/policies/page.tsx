import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { SearchBar, Pagination, PAGE_SIZE, parsePage } from "@/components/ui/list-controls";
import { Badge } from "@/components/ui/badge";
import { ALL_LOBS, BILLING_LABELS, LOB_LABELS, POLICY_STATUS_LABELS, policyStatusTone } from "@/lib/labels";
import { fmtMoney } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";
import type { LineOfBusiness, PolicyStatus, Prisma } from "@prisma/client";

export const metadata = { title: "Policies" };
export const dynamic = "force-dynamic";

const STATUSES: PolicyStatus[] = ["QUOTE", "BOUND", "ACTIVE", "RENEWED", "CANCELLED", "EXPIRED", "NON_RENEWED"];

export default async function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; lob?: string; page?: string }>;
}) {
  const { q, status, lob, page: pageRaw } = await searchParams;
  const page = parsePage(pageRaw);
  const statusFilter = STATUSES.includes(status as PolicyStatus) ? (status as PolicyStatus) : undefined;
  const lobFilter = ALL_LOBS.includes(lob as LineOfBusiness) ? (lob as LineOfBusiness) : undefined;

  const where: Prisma.PolicyWhereInput = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(lobFilter ? { lineOfBusiness: lobFilter } : {}),
    ...(q
      ? {
          OR: [
            { policyNumber: { contains: q, mode: "insensitive" } },
            { client: { name: { contains: q, mode: "insensitive" } } },
            { carrier: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [policies, total] = await Promise.all([
    prisma.policy.findMany({
      where,
      orderBy: { expirationDate: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        client: { select: { name: true } },
        carrier: { select: { name: true } },
        producer: { select: { name: true } },
      },
    }),
    prisma.policy.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Policies"
        description="Full lifecycle: quote, bind, active, renew, cancel."
        actions={
          <Link href="/policies/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New policy
          </Link>
        }
      />
      <div className="mb-4">
        <SearchBar action="/policies" q={q} placeholder="Search number, client, carrier…">
          <select name="status" defaultValue={statusFilter ?? ""} className="input w-36">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {POLICY_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select name="lob" defaultValue={lobFilter ?? ""} className="input w-44">
            <option value="">All lines</option>
            {ALL_LOBS.map((l) => (
              <option key={l} value={l}>
                {LOB_LABELS[l]}
              </option>
            ))}
          </select>
        </SearchBar>
      </div>
      <DataTable
        rows={policies}
        rowHref={(p) => `/policies/${p.id}`}
        emptyMessage={
          q || statusFilter || lobFilter ? (
            "No policies match your search."
          ) : (
            <span>
              No policies yet.{" "}
              <Link href="/policies/new" className="font-medium text-navy-700 hover:underline">
                Create the first policy →
              </Link>
            </span>
          )
        }
        columns={[
          { key: "policyNumber", header: "Policy #" },
          { key: "client", header: "Client", render: (p) => p.client.name },
          { key: "lob", header: "Line", className: "hidden md:table-cell", render: (p) => LOB_LABELS[p.lineOfBusiness] },
          { key: "carrier", header: "Carrier", className: "hidden md:table-cell", render: (p) => p.carrier.name },
          {
            key: "status",
            header: "Status",
            render: (p) => <Badge tone={policyStatusTone(p.status)}>{POLICY_STATUS_LABELS[p.status]}</Badge>,
          },
          { key: "billing", header: "Billing", className: "hidden lg:table-cell", render: (p) => BILLING_LABELS[p.billingType] },
          {
            key: "term",
            header: "Term",
            render: (p) => (
              <span className="whitespace-nowrap">
                {fmtDate(p.effectiveDate)} – {fmtDate(p.expirationDate)}
              </span>
            ),
          },
          { key: "premium", header: "Premium", className: "text-right", render: (p) => fmtMoney(p.premium) },
          { key: "producer", header: "Producer", className: "hidden lg:table-cell", render: (p) => p.producer.name },
        ]}
      />
      <div className="mt-3">
        <Pagination basePath="/policies" page={page} total={total} params={{ q, status: statusFilter, lob: lobFilter }} />
      </div>
    </>
  );
}
