import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { lossRatioReport } from "@/lib/reports/loss-ratio";
import { fmtMoney } from "@/lib/money";
import type { LossRatioRow, LossTier } from "@/lib/domain/loss-ratio";

export const metadata = { title: "Loss ratio" };
export const dynamic = "force-dynamic";

function tierTone(t: LossTier): "green" | "amber" | "red" {
  return t === "HIGH" ? "red" : t === "ELEVATED" ? "amber" : "green";
}

function LossTable({ title, rows, groupHead }: { title: string; rows: LossRatioRow[]; groupHead: string }) {
  return (
    <div className="card overflow-x-auto">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="section-title">{title}</h2>
      </div>
      <table className="table-base">
        <thead>
          <tr>
            <th>{groupHead}</th>
            <th className="text-right">Policies</th>
            <th className="text-right">Written premium</th>
            <th className="text-right">Claims</th>
            <th className="text-right">Paid</th>
            <th className="text-right">Reserve</th>
            <th className="text-right">Incurred</th>
            <th className="text-right">Loss ratio</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-6 text-center text-slate-400">No data.</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.key}>
                <td className="font-medium text-slate-800">{r.label}</td>
                <td className="text-right">{r.policyCount}</td>
                <td className="text-right">{fmtMoney(r.premium)}</td>
                <td className="text-right">{r.claimCount}</td>
                <td className="text-right">{fmtMoney(r.paid)}</td>
                <td className="text-right">{fmtMoney(r.reserve)}</td>
                <td className="text-right">{fmtMoney(r.incurred)}</td>
                <td className="text-right">
                  {r.lossRatioPct == null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <Badge tone={tierTone(r.tier)}>{r.lossRatioPct}%</Badge>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default async function LossRatioReportPage() {
  const report = await lossRatioReport();
  const { overall } = report;

  return (
    <>
      <PageHeader
        title="Loss ratio &amp; profitability"
        description="Incurred losses (paid + reserve) vs written premium by carrier and line of business. High-loss groups (≥70%) are flagged."
        actions={
          <div className="flex gap-2">
            <a href="/api/reports/loss-ratio?by=carrier" className="btn">
              <Download className="h-4 w-4" /> Carrier CSV
            </a>
            <a href="/api/reports/loss-ratio?by=lob" className="btn">
              <Download className="h-4 w-4" /> LOB CSV
            </a>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Written premium" value={fmtMoney(overall.premium)} />
        <StatCard label="Incurred losses" value={fmtMoney(overall.incurred)} sub={`${overall.claimCount} claims`} />
        <StatCard
          label="Overall loss ratio"
          value={overall.lossRatioPct == null ? "—" : `${overall.lossRatioPct}%`}
          tone={overall.lossRatioPct != null && overall.lossRatioPct >= 70 ? "danger" : overall.lossRatioPct != null && overall.lossRatioPct >= 50 ? "warn" : "good"}
          sub="Incurred / written premium"
        />
        <StatCard label="High-loss groups" value={overall.highLossGroups} tone={overall.highLossGroups > 0 ? "danger" : "good"} />
      </div>

      <div className="space-y-6">
        <LossTable title="By carrier" rows={report.byCarrier} groupHead="Carrier" />
        <LossTable title="By line of business" rows={report.byLob} groupHead="Line of business" />
      </div>
    </>
  );
}
