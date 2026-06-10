import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { premiumTrend } from "@/lib/reports/trend";
import { fmtMoney, roundMoney } from "@/lib/money";

export const metadata = { title: "Premium trend" };
export const dynamic = "force-dynamic";

export default async function TrendReportPage() {
  const months = await premiumTrend(12);
  const totalNew = roundMoney(months.reduce((acc, m) => acc + m.newPremium, 0));
  const totalRenewal = roundMoney(months.reduce((acc, m) => acc + m.renewalPremium, 0));
  const max = Math.max(1, ...months.map((m) => m.total));

  return (
    <>
      <PageHeader
        title="New vs renewal premium trend"
        description="Written premium by policy effective month, trailing 12 months."
        actions={
          <a href="/api/reports/trend" className="btn">
            <Download className="h-4 w-4" /> Export CSV
          </a>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="New business (12 mo)" value={fmtMoney(totalNew)} tone="good" />
        <StatCard label="Renewal (12 mo)" value={fmtMoney(totalRenewal)} />
        <StatCard label="Total written" value={fmtMoney(totalNew + totalRenewal)} />
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Month</th>
              <th className="text-right">New business</th>
              <th className="text-right">Renewal</th>
              <th className="text-right">Total</th>
              <th className="w-1/3">Mix</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <td className="font-medium">{m.month}</td>
                <td className="text-right text-emerald-700">{fmtMoney(m.newPremium)}</td>
                <td className="text-right text-indigo-700">{fmtMoney(m.renewalPremium)}</td>
                <td className="text-right font-medium">{fmtMoney(m.total)}</td>
                <td>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-emerald-500" style={{ width: `${(m.newPremium / max) * 100}%` }} />
                    <div className="h-full bg-indigo-500" style={{ width: `${(m.renewalPremium / max) * 100}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        <span className="mr-3 inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> New business</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-indigo-500" /> Renewal</span>
      </p>
    </>
  );
}
