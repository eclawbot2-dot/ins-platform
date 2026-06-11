import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { retentionReport } from "@/lib/reports/retention";
import { fmtMoney } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";
import { ThSort } from "@/components/ui/data-table";
import { applySort, parseSortParams } from "@/lib/sort";

export const metadata = { title: "Retention" };
export const dynamic = "force-dynamic";

export default async function RetentionReportPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const { sort, dir } = await searchParams;
  const sortState = parseSortParams(sort, dir, ["policyNumber", "client", "lob", "carrier", "premium", "expired", "outcome"]);
  const tableSort = { ...sortState, basePath: "/reports/retention" };
  const report = await retentionReport(365);
  const sortedRows = applySort(
    report.rows,
    {
      policyNumber: (r) => r.policyNumber,
      client: (r) => r.clientName,
      lob: (r) => r.lineOfBusiness,
      carrier: (r) => r.carrierName,
      premium: (r) => r.premium,
      expired: (r) => r.expirationDate,
      outcome: (r) => r.outcome,
    },
    sortState,
  );

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
              <ThSort k="policyNumber" label="Policy #" sort={tableSort} />
              <ThSort k="client" label="Client" sort={tableSort} />
              <ThSort k="lob" label="LOB" sort={tableSort} />
              <ThSort k="carrier" label="Carrier" sort={tableSort} />
              <ThSort k="premium" label="Premium" sort={tableSort} className="text-right" />
              <ThSort k="expired" label="Expired" sort={tableSort} />
              <ThSort k="outcome" label="Outcome" sort={tableSort} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-slate-400">
                  No expired terms in the window yet.
                </td>
              </tr>
            ) : (
              sortedRows.map((r) => (
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
