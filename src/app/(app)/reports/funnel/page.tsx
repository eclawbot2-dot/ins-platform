import { Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { conversionFunnel, winRate } from "@/lib/domain/pipeline";
import { STAGE_LABELS } from "@/lib/labels";

export const metadata = { title: "Pipeline funnel" };
export const dynamic = "force-dynamic";

export default async function FunnelReportPage() {
  const opportunities = await prisma.opportunity.findMany({ select: { stage: true } });
  const stages = opportunities.map((o) => o.stage);
  const funnel = conversionFunnel(stages);
  const rate = winRate(stages);
  const lost = stages.filter((s) => s === "LOST").length;
  const max = Math.max(1, ...funnel.map((f) => f.count));

  return (
    <>
      <PageHeader
        title="Pipeline conversion funnel"
        description="How many opportunities reached at least each stage. LOST counts only toward the total."
        actions={
          <a href="/api/reports/funnel" className="btn">
            <Download className="h-4 w-4" /> Export CSV
          </a>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Total opportunities" value={stages.length} />
        <StatCard label="Win rate" value={rate == null ? "—" : `${rate}%`} sub="Bound / decided" tone={rate != null && rate >= 50 ? "good" : "default"} />
        <StatCard label="Lost" value={lost} tone={lost > 0 ? "warn" : "default"} />
      </div>

      <div className="card-pad">
        <div className="space-y-3">
          {funnel.map((f) => (
            <div key={f.stage}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-800">{STAGE_LABELS[f.stage]}</span>
                <span className="text-slate-500">
                  {f.count} · {f.reachedPct}%
                </span>
              </div>
              <div className="h-5 w-full overflow-hidden rounded bg-slate-100">
                <div
                  className={`h-full rounded ${f.stage === "BOUND" ? "bg-emerald-500" : "bg-navy-500"}`}
                  style={{ width: `${(f.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
