import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/form";
import { LOB_LABELS, RENEWAL_STATUS_LABELS, renewalStatusTone } from "@/lib/labels";
import { fmtMoney, toNum } from "@/lib/money";
import { ThSort } from "@/components/ui/data-table";
import { applySort, parseSortParams } from "@/lib/sort";
import { fmtDate, daysUntil } from "@/lib/domain/dates";
import { renewalBucket } from "@/lib/domain/renewals";
import { assignRenewal, generateRenewals, setRenewalStatus } from "./actions";
import type { RenewalStatus } from "@prisma/client";

export const metadata = { title: "Renewals" };
export const dynamic = "force-dynamic";

const OPEN_STATUSES: RenewalStatus[] = ["PENDING_REVIEW", "REMARKETING", "QUOTED"];

export default async function RenewalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string; dir?: string }>;
}) {
  const { status, sort, dir } = await searchParams;
  const sortState = parseSortParams(sort, dir, ["policy", "client", "line", "premium", "xdate", "days", "status", "assigned"]);
  const allStatuses: RenewalStatus[] = ["PENDING_REVIEW", "REMARKETING", "QUOTED", "RENEWED", "LOST"];
  const statusFilter = allStatuses.includes(status as RenewalStatus) ? (status as RenewalStatus) : undefined;

  const [renewals, users] = await Promise.all([
    prisma.renewal.findMany({
      where: statusFilter ? { status: statusFilter } : { status: { in: OPEN_STATUSES } },
      orderBy: { expirationDate: "asc" },
      include: {
        policy: {
          include: { client: { select: { id: true, name: true } }, carrier: { select: { name: true } } },
        },
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.user.findMany({ where: { active: true, role: { not: "CLIENT" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const now = new Date();
  // Filter (where) → sort (copy) → render.
  const sortedRenewals = applySort(
    renewals,
    {
      policy: (r) => r.policy.policyNumber,
      client: (r) => r.policy.client.name,
      line: (r) => LOB_LABELS[r.policy.lineOfBusiness],
      premium: (r) => toNum(r.policy.premium),
      xdate: (r) => r.expirationDate,
      days: (r) => r.expirationDate,
      status: (r) => RENEWAL_STATUS_LABELS[r.status],
      assigned: (r) => r.assignedTo?.name,
    },
    sortState,
  );
  const tableSort = { ...sortState, basePath: "/renewals", params: { status: statusFilter } };
  const open = renewals.filter((r) => OPEN_STATUSES.includes(r.status));
  const overdue = open.filter((r) => renewalBucket(r.expirationDate, now) === "OVERDUE").length;
  const due30 = open.filter((r) => renewalBucket(r.expirationDate, now) === "30").length;
  const due60 = open.filter((r) => renewalBucket(r.expirationDate, now) === "60").length;
  const due90 = open.filter((r) => renewalBucket(r.expirationDate, now) === "90").length;

  return (
    <>
      <PageHeader
        title="Renewals"
        description="X-date pipeline: review, remarket, quote, renew."
        actions={
          <form action={generateRenewals}>
            <button type="submit" className="btn-primary">
              <RefreshCw className="h-4 w-4" /> Generate renewals (90-day scan)
            </button>
          </form>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Overdue" value={overdue} tone={overdue > 0 ? "danger" : "default"} />
        <StatCard label="Due ≤ 30 days" value={due30} tone={due30 > 0 ? "warn" : "default"} />
        <StatCard label="31–60 days" value={due60} />
        <StatCard label="61–90 days" value={due90} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/renewals" className={`btn btn-sm ${!statusFilter ? "border-navy-300 bg-navy-50" : ""}`}>
          Open
        </Link>
        {allStatuses.map((s) => (
          <Link key={s} href={`/renewals?status=${s}`} className={`btn btn-sm ${statusFilter === s ? "border-navy-300 bg-navy-50" : ""}`}>
            {RENEWAL_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <ThSort k="policy" label="Policy" sort={tableSort} />
              <ThSort k="client" label="Client" sort={tableSort} />
              <ThSort k="line" label="Line / carrier" sort={tableSort} />
              <ThSort k="premium" label="Premium" sort={tableSort} className="text-right" />
              <ThSort k="xdate" label="X-date" sort={tableSort} />
              <ThSort k="days" label="Days" sort={tableSort} />
              <ThSort k="status" label="Status" sort={tableSort} />
              <ThSort k="assigned" label="Assigned" sort={tableSort} />
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRenewals.map((r) => {
              const days = daysUntil(r.expirationDate, now);
              return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/policies/${r.policy.id}`} className="font-medium text-navy-700 hover:underline">
                      {r.policy.policyNumber}
                    </Link>
                  </td>
                  <td>
                    <Link href={`/clients/${r.policy.client.id}`} className="text-navy-700 hover:underline">
                      {r.policy.client.name}
                    </Link>
                  </td>
                  <td className="text-xs">
                    {LOB_LABELS[r.policy.lineOfBusiness]}
                    <br />
                    <span className="text-slate-400">{r.policy.carrier.name}</span>
                  </td>
                  <td className="text-right">{fmtMoney(r.policy.premium)}</td>
                  <td>{fmtDate(r.expirationDate)}</td>
                  <td>
                    <Badge tone={days < 0 ? "red" : days <= 30 ? "amber" : "slate"}>{days < 0 ? `${-days}d over` : `${days}d`}</Badge>
                  </td>
                  <td>
                    <Badge tone={renewalStatusTone(r.status)}>{RENEWAL_STATUS_LABELS[r.status]}</Badge>
                  </td>
                  <td>
                    <form action={assignRenewal.bind(null, r.id)} className="flex items-center gap-1">
                      <Select
                        name="assignedToId"
                        allowEmpty
                        emptyLabel="Unassigned"
                        defaultValue={r.assignedToId ?? ""}
                        options={users.map((u) => ({ value: u.id, label: u.name }))}
                      />
                      <button type="submit" className="btn btn-sm">
                        Set
                      </button>
                    </form>
                  </td>
                  <td>
                    {OPEN_STATUSES.includes(r.status) ? (
                      <div className="flex flex-wrap gap-1">
                        {r.status !== "REMARKETING" ? (
                          <form action={setRenewalStatus.bind(null, r.id, "REMARKETING")}>
                            <button className="btn btn-sm" type="submit">
                              Remarket
                            </button>
                          </form>
                        ) : null}
                        {r.status !== "QUOTED" ? (
                          <form action={setRenewalStatus.bind(null, r.id, "QUOTED")}>
                            <button className="btn btn-sm" type="submit">
                              Quoted
                            </button>
                          </form>
                        ) : null}
                        <form action={setRenewalStatus.bind(null, r.id, "LOST")}>
                          <button className="btn btn-sm text-red-600" type="submit">
                            Lost
                          </button>
                        </form>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Use “Renew” on the policy page</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {sortedRenewals.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-400">
                  No renewals in this view — run the 90-day scan.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
