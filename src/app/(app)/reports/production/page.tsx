import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { producerProduction } from "@/lib/reports/production";
import { fmtMoney, roundMoney } from "@/lib/money";
import { startOfYear } from "@/lib/domain/dates";

export const metadata = { title: "Producer production" };
export const dynamic = "force-dynamic";

export default async function ProductionReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const fromDate = from ? new Date(`${from}T00:00:00Z`) : startOfYear(new Date());
  const toDate = to ? new Date(`${to}T23:59:59Z`) : undefined;
  const rows = await producerProduction({ from: fromDate, to: toDate });

  const totalPremium = roundMoney(rows.reduce((acc, r) => acc + r.writtenPremium, 0));
  const totalCommission = roundMoney(rows.reduce((acc, r) => acc + r.commission, 0));

  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);

  return (
    <>
      <PageHeader
        title="Producer production"
        description="Premium and commission credited through split rules, by policy effective date. Defaults to YTD."
        actions={
          <a href={`/api/reports/production?${qs}`} className="btn">
            <Download className="h-4 w-4" /> Export CSV
          </a>
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="label">From (effective date)</label>
          <input type="date" name="from" defaultValue={from ?? ""} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" name="to" defaultValue={to ?? ""} className="input" />
        </div>
        <button type="submit" className="btn">Apply</button>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Written premium" value={fmtMoney(totalPremium)} />
        <StatCard label="Commission" value={fmtMoney(totalCommission)} />
        <StatCard label="Producers" value={rows.length} />
      </div>

      <DataTable
        rows={rows}
        rowKey={(r) => r.producerId}
        emptyMessage="No production in this period."
        columns={[
          { key: "producerName", header: "Producer" },
          { key: "policyCount", header: "Policies" },
          { key: "newPolicyCount", header: "New business" },
          { key: "writtenPremium", header: "Written premium", className: "text-right", render: (r) => fmtMoney(r.writtenPremium) },
          { key: "commission", header: "Commission", className: "text-right", render: (r) => fmtMoney(r.commission) },
        ]}
      />
    </>
  );
}
