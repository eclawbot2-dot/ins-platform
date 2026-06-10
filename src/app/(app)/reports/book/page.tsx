import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { bookOfBusiness, type BookGroupBy } from "@/lib/reports/book";
import { fmtMoney, fmtPct } from "@/lib/money";

export const metadata = { title: "Book of business" };
export const dynamic = "force-dynamic";

const GROUPS: Array<{ key: BookGroupBy; label: string }> = [
  { key: "carrier", label: "By carrier" },
  { key: "lob", label: "By line of business" },
  { key: "producer", label: "By producer" },
];

export default async function BookReportPage({ searchParams }: { searchParams: Promise<{ by?: string }> }) {
  const { by: byRaw } = await searchParams;
  const by: BookGroupBy = byRaw === "lob" || byRaw === "producer" ? byRaw : "carrier";
  const report = await bookOfBusiness(by);

  return (
    <>
      <PageHeader
        title="Book of business"
        description="Active + bound policies — premium and expected commission."
        actions={
          <a href={`/api/reports/book?by=${by}`} className="btn">
            <Download className="h-4 w-4" /> Export CSV
          </a>
        }
      />

      <div className="mb-4 flex gap-2">
        {GROUPS.map((g) => (
          <Link key={g.key} href={`/reports/book?by=${g.key}`} className={`btn btn-sm ${by === g.key ? "btn-primary" : ""}`}>
            {g.label}
          </Link>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Total book premium" value={fmtMoney(report.totalPremium)} />
        <StatCard label="Policies in force" value={report.totalPolicies} />
        <StatCard label={GROUPS.find((g) => g.key === by)!.label.replace("By ", "Groups: ")} value={report.rows.length} />
      </div>

      <DataTable
        rows={report.rows}
        rowKey={(r) => r.group}
        emptyMessage="No active policies in the book."
        columns={[
          { key: "group", header: GROUPS.find((g) => g.key === by)!.label.replace("By ", "") },
          { key: "policyCount", header: "Policies" },
          { key: "premium", header: "Premium", className: "text-right", render: (r) => fmtMoney(r.premium) },
          { key: "commission", header: "Expected commission", className: "text-right", render: (r) => fmtMoney(r.commission) },
          { key: "sharePct", header: "Share of book", className: "text-right", render: (r) => fmtPct(r.sharePct) },
        ]}
      />
    </>
  );
}
