import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { retentionReport } from "@/lib/reports/retention";
import { fmtMoney } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";

export const metadata = { title: "Retention" };
export const dynamic = "force-dynamic";

export default async function RetentionReportPage() {
  const report = await retentionReport(365);

  return (
    <>
      <PageHeader
        title="Retention"
        description="Policy terms that expired in the trailing 12 months, classified renewed vs lost."
        actions={
          <a href="/api/reports/retention" className="btn">
            <Download className="h-4 w-4" /> Export CSV
          </a>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Retention rate"
          value={report.rate == null ? "—" : `${report.rate}%`}
          tone={report.rate != null && report.rate >= 85 ? "good" : report.rate != null && report.rate < 70 ? "danger" : "default"}
          sub="Renewed / (renewed + lost)"
        />
        <StatCard label="Renewed" value={report.renewed} tone="good" />
        <StatCard label="Lost" value={report.lost} tone={report.lost > 0 ? "warn" : "default"} />
        <StatCard label="Decided terms" value={report.rows.length} />
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Policy #</th>
              <th>Client</th>
              <th>LOB</th>
              <th>Carrier</th>
              <th className="text-right">Premium</th>
              <th>Expired</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-slate-400">
                  No expired terms in the window yet.
                </td>
              </tr>
            ) : (
              report.rows.map((r) => (
                <tr key={r.policyId}>
                  <td>
                    <Link href={`/policies/${r.policyId}`} className="font-medium text-navy-700 hover:underline">
                      {r.policyNumber}
                    </Link>
                  </td>
                  <td>{r.clientName}</td>
                  <td>{r.lineOfBusiness}</td>
                  <td>{r.carrierName}</td>
                  <td className="text-right">{fmtMoney(r.premium)}</td>
                  <td>{fmtDate(r.expirationDate)}</td>
                  <td>
                    <Badge tone={r.outcome === "RENEWED" ? "green" : "red"}>{r.outcome}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
