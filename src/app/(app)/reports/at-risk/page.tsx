import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { atRiskWorklist } from "@/lib/reports/client-health";
import { HEALTH_TIER_LABELS, healthTierTone } from "@/lib/domain/client-health";
import { fmtMoney } from "@/lib/money";

export const metadata = { title: "At-risk clients" };
export const dynamic = "force-dynamic";

export default async function AtRiskReportPage() {
  const rows = await atRiskWorklist();
  const atRisk = rows.filter((r) => r.tier === "AT_RISK").length;
  const watch = rows.filter((r) => r.tier === "WATCH").length;

  return (
    <>
      <PageHeader
        title="At-risk clients"
        description="Retention worklist — clients scored watch or at-risk from claims, AR lateness, concentration, renewal proximity, and recent cancellations."
        actions={
          <a href="/api/reports/at-risk" className="btn">
            <Download className="h-4 w-4" /> Export CSV
          </a>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="At risk" value={atRisk} tone={atRisk > 0 ? "danger" : "good"} />
        <StatCard label="Watch" value={watch} tone={watch > 0 ? "warn" : "default"} />
        <StatCard label="Flagged clients" value={rows.length} />
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Client</th>
              <th>Producer</th>
              <th className="text-right">Score</th>
              <th>Tier</th>
              <th>Top risk factor</th>
              <th className="text-right">Policies</th>
              <th className="text-right">Past due</th>
              <th className="text-right">Claims (12mo)</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sm text-slate-400">
                  No at-risk clients — the whole book is healthy.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.clientId}>
                  <td>
                    <Link href={`/clients/${r.clientId}`} className="font-medium text-navy-700 hover:underline">
                      {r.clientName}
                    </Link>
                  </td>
                  <td>{r.producerName ?? "—"}</td>
                  <td className="text-right font-semibold tabular-nums">{r.score}</td>
                  <td>
                    <Badge tone={healthTierTone(r.tier)}>{HEALTH_TIER_LABELS[r.tier]}</Badge>
                  </td>
                  <td className="text-slate-600">{r.topFactor ?? "—"}</td>
                  <td className="text-right">{r.activePolicyCount}</td>
                  <td className="text-right">{r.pastDueAmount > 0 ? fmtMoney(r.pastDueAmount) : "—"}</td>
                  <td className="text-right">{r.recentClaimCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
