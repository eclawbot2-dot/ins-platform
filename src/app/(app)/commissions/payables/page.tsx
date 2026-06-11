import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { producerPayables } from "@/lib/reports/payables";
import { fmtMoneyCents } from "@/lib/money";
import { applySort, parseSortParams } from "@/lib/sort";

export const metadata = { title: "Producer payables" };
export const dynamic = "force-dynamic";

export default async function PayablesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; sort?: string; dir?: string }>;
}) {
  const { from, to, sort, dir } = await searchParams;
  const sortState = parseSortParams(sort, dir, ["producerName", "lineCount", "commission"]);
  const fromDate = from ? new Date(`${from}T00:00:00Z`) : undefined;
  const toDate = to ? new Date(`${to}T23:59:59Z`) : undefined;
  const report = await producerPayables({ from: fromDate, to: toDate });

  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);

  return (
    <>
      <PageHeader
        title="Producer payables"
        description="Carrier-statement commission allocated by policy split rules."
        actions={
          <a href={`/api/reports/payables?${qs}`} className="btn">
            <Download className="h-4 w-4" /> Export CSV
          </a>
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="label">From (statement date)</label>
          <input type="date" name="from" defaultValue={from ?? ""} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" name="to" defaultValue={to ?? ""} className="input" />
        </div>
        <button type="submit" className="btn">
          Apply
        </button>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Total allocated" value={fmtMoneyCents(report.totalAllocated)} />
        <StatCard
          label="Unallocated"
          value={fmtMoneyCents(report.unallocatedAmount)}
          sub={`${report.unallocatedCount} unmatched line(s)`}
          tone={report.unallocatedCount > 0 ? "warn" : "default"}
        />
        <StatCard label="Producers" value={report.rows.length} />
      </div>

      <DataTable
        rows={applySort(
          report.rows,
          { producerName: (r) => r.producerName, lineCount: (r) => r.lineCount, commission: (r) => r.commission },
          sortState,
        )}
        rowKey={(r) => r.producerId}
        sort={{ ...sortState, basePath: "/commissions/payables", params: { from, to } }}
        emptyMessage="No reconciled statement lines in this period."
        columns={[
          { key: "producerName", header: "Producer", sortable: true },
          { key: "lineCount", header: "Statement lines", sortable: true },
          { key: "commission", header: "Payable commission", className: "text-right", sortable: true, render: (r) => fmtMoneyCents(r.commission) },
        ]}
      />
      <p className="mt-3 text-xs text-slate-400">
        Unmatched statement lines cannot be allocated to producers — reconcile statements first.
      </p>
    </>
  );
}
