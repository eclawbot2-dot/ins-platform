import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { PageHeader, DetailItem } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { FlashToast } from "@/components/ui/toast";
import { CoverageReport } from "@/components/compare/report";
import { presentReport } from "@/lib/ai/presenter";
import { LOB_LABELS } from "@/lib/labels";
import { fmtDate } from "@/lib/domain/dates";
import { createOpportunityFromAnalysis } from "../actions";
import { ManualKeyForm } from "./manual-key-form";

export const metadata = { title: "Analysis detail" };
export const dynamic = "force-dynamic";

export default async function AnalysisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const row = await prisma.policyAnalysis.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      lead: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!row) notFound();

  const view = presentReport(row);
  const analyzed = row.status === "ANALYZED";
  const needsKeying = row.status === "MANUAL_REVIEW" || row.status === "PENDING";

  return (
    <>
      <FlashToast />
      <Link href="/tools/coverage-analysis" className="mb-3 inline-flex items-center gap-1 text-sm text-navy-700 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to coverage analysis
      </Link>
      <PageHeader
        title={row.uploaderName ?? row.client?.name ?? "Coverage analysis"}
        description={`${row.source.replace(/_/g, " ").toLowerCase()} · submitted ${fmtDate(row.createdAt)}`}
        actions={
          analyzed ? (
            <form action={createOpportunityFromAnalysis}>
              <input type="hidden" name="analysisId" value={row.id} />
              <button type="submit" className="btn-primary">
                Create opportunity
              </button>
            </form>
          ) : null
        }
      />

      <div className="mb-5 card-pad">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <DetailItem label="Status">
            <Badge tone={analyzed ? "green" : needsKeying ? "amber" : "slate"}>
              {row.status.replace(/_/g, " ").toLowerCase()}
            </Badge>
          </DetailItem>
          <DetailItem label="Line">{row.lineOfBusiness ? LOB_LABELS[row.lineOfBusiness] : "—"}</DetailItem>
          <DetailItem label="Carrier">{row.carrierName ?? "—"}</DetailItem>
          <DetailItem label="Contact">
            {row.uploaderEmail ?? "—"}
            {row.client ? (
              <Link href={`/clients/${row.client.id}`} className="block text-navy-700 hover:underline">
                {row.client.name}
              </Link>
            ) : null}
          </DetailItem>
        </dl>
        {row.fileName ? (
          <p className="mt-3 text-xs text-slate-500">
            Attached file: <span className="font-medium">{row.fileName}</span>
          </p>
        ) : null}
      </div>

      {analyzed ? (
        <CoverageReport
          view={view}
          summaryText={row.summaryText}
          lineOfBusiness={row.lineOfBusiness}
          carrierName={row.carrierName}
        />
      ) : needsKeying ? (
        <section className="card-pad">
          <h2 className="mb-1 text-base font-semibold text-slate-900">Key the coverages to run the gap analysis</h2>
          <p className="mb-4 text-sm text-slate-500">
            AI extraction is unavailable (or didn&apos;t run). Pick the line of business and enter the coverages from the
            submitted policy — the deterministic gap rules produce a full report immediately.
          </p>
          <ManualKeyForm analysisId={row.id} defaultLob={row.lineOfBusiness ?? null} />
        </section>
      ) : (
        <div className="card-pad text-sm text-slate-600">Analysis is still processing.</div>
      )}
    </>
  );
}
