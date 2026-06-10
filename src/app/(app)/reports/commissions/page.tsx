import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { commissionRevenue } from "@/lib/reports/commission-revenue";
import { fmtMoneyCents, roundMoney } from "@/lib/money";

export const metadata = { title: "Commission revenue" };
export const dynamic = "force-dynamic";

export default async function CommissionRevenueReportPage() {
  const months = await commissionRevenue(12);
  const total = roundMoney(months.reduce((acc, m) => acc + m.commission, 0));
  const max = Math.max(1, ...months.map((m) => m.commission));
  const nonZero = months.filter((m) => m.commission > 0);
  const avg = nonZero.length === 0 ? 0 : roundMoney(total / nonZero.length);

  return (
    <>
      <PageHeader
        title="Commission revenue"
        description="Commission from carrier statements per statement month, trailing 12 months."
        actions={
          <a href="/api/reports/commissions" className="btn">
            <Download className="h-4 w-4" /> Export CSV
          </a>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Total (12 mo)" value={fmtMoneyCents(total)} />
        <StatCard label="Avg active month" value={fmtMoneyCents(avg)} />
        <StatCard label="Statement lines" value={months.reduce((acc, m) => acc + m.lineCount, 0)} />
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Month</th>
              <th className="text-right">Commission</th>
              <th className="text-right">Lines</th>
              <th className="w-1/3"></th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <td className="font-medium">{m.month}</td>
                <td className="text-right">{fmtMoneyCents(m.commission)}</td>
                <td className="text-right">{m.lineCount}</td>
                <td>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(m.commission / max) * 100}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
