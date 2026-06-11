import Link from "next/link";
import { Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { fmtMoney, toNum } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";
import { applySort, parseSortParams } from "@/lib/sort";
import { createStatement } from "./actions";

export const metadata = { title: "Commissions" };
export const dynamic = "force-dynamic";

export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const { sort, dir } = await searchParams;
  const sortState = parseSortParams(sort, dir, ["carrier", "period", "date", "total", "lines", "status"]);
  const [statements, carriers] = await Promise.all([
    prisma.commissionStatement.findMany({
      orderBy: { statementDate: "desc" },
      include: {
        carrier: { select: { name: true } },
        lines: { select: { matchStatus: true } },
      },
    }),
    prisma.carrier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Commission statements"
        description="Carrier statement entry, CSV import, and reconciliation against expected commissions."
        actions={
          <Link href="/commissions/payables" className="btn">
            <Wallet className="h-4 w-4" /> Producer payables
          </Link>
        }
      />

      <DataTable
        rows={applySort(
          statements,
          {
            carrier: (s) => s.carrier.name,
            period: (s) => s.statementDate,
            date: (s) => s.statementDate,
            total: (s) => toNum(s.totalAmount),
            lines: (s) => s.lines.length,
            status: (s) => s.status,
          },
          sortState,
        )}
        rowHref={(s) => `/commissions/${s.id}`}
        sort={{ ...sortState, basePath: "/commissions" }}
        emptyMessage="No statements yet — create one below."
        columns={[
          { key: "carrier", header: "Carrier", sortable: true, render: (s) => s.carrier.name },
          { key: "period", header: "Period", sortable: true, render: (s) => s.periodLabel ?? fmtDate(s.statementDate) },
          { key: "date", header: "Statement date", sortable: true, render: (s) => fmtDate(s.statementDate) },
          { key: "total", header: "Total", className: "text-right", sortable: true, render: (s) => fmtMoney(s.totalAmount) },
          { key: "lines", header: "Lines", sortable: true, render: (s) => s.lines.length },
          {
            key: "recon",
            header: "Reconciliation",
            render: (s) => {
              const matched = s.lines.filter((l) => l.matchStatus === "MATCHED").length;
              const varianceCt = s.lines.filter((l) => l.matchStatus === "VARIANCE").length;
              const unmatched = s.lines.filter((l) => l.matchStatus === "UNMATCHED").length;
              return (
                <span className="flex gap-1.5">
                  <Badge tone="green">{matched} ok</Badge>
                  {varianceCt > 0 ? <Badge tone="amber">{varianceCt} var</Badge> : null}
                  {unmatched > 0 ? <Badge tone="red">{unmatched} unm</Badge> : null}
                </span>
              );
            },
          },
          {
            key: "status",
            header: "Status",
            sortable: true,
            render: (s) => (
              <Badge tone={s.status === "RECONCILED" ? "green" : s.status === "RECONCILING" ? "amber" : "slate"}>{s.status}</Badge>
            ),
          },
        ]}
      />

      <div className="card-pad mt-6 max-w-2xl">
        <h2 className="section-title mb-3">New statement</h2>
        <form action={createStatement} className="space-y-4">
          <FormGrid>
            <Field label="Carrier" required>
              <Select name="carrierId" options={carriers.map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
            <Field label="Statement date" required>
              <input type="date" name="statementDate" required className="input" />
            </Field>
            <Field label="Period label">
              <input name="periodLabel" className="input" placeholder="May 2026" />
            </Field>
            <Field label="Statement total ($)" required>
              <input name="totalAmount" type="number" step="0.01" required className="input" />
            </Field>
          </FormGrid>
          <Field label="Notes">
            <input name="notes" className="input" />
          </Field>
          <button type="submit" className="btn-primary">
            Create statement
          </button>
        </form>
      </div>
    </>
  );
}
