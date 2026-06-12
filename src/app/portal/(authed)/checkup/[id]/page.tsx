import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal";
import { FlashToast } from "@/components/ui/toast";
import { CoverageReport } from "@/components/compare/report";
import { presentReport } from "@/lib/ai/presenter";
import { requestReview } from "../actions";

export const dynamic = "force-dynamic";

export default async function PortalCheckupResult({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePortalSession();
  const { id } = await params;
  // Strict client scoping — only the session client's own analyses.
  const row = await prisma.policyAnalysis.findFirst({
    where: { id, clientId: session.clientId, source: "CLIENT_PORTAL" },
  });
  if (!row) notFound();

  const view = presentReport(row);

  return (
    <>
      <FlashToast />
      <Link href="/portal/checkup" className="mb-3 inline-flex items-center gap-1 text-sm text-navy-700 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to checkups
      </Link>
      <h1 className="page-title mb-4">Your coverage report</h1>

      <CoverageReport
        view={view}
        summaryText={row.summaryText}
        lineOfBusiness={row.lineOfBusiness}
        carrierName={row.carrierName}
      />

      <div className="mt-8 rounded-xl bg-navy-800 p-5 text-white">
        <h2 className="text-lg font-semibold">Have questions about these gaps?</h2>
        <p className="mt-1 text-sm text-slate-200">
          Request a personal review and one of our agents will reach out to walk through your options.
        </p>
        <form action={requestReview} className="mt-3">
          <input type="hidden" name="analysisId" value={row.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-gold-400 px-4 py-2 text-sm font-semibold text-navy-900 hover:bg-gold-300"
          >
            Request a coverage review
          </button>
        </form>
      </div>
    </>
  );
}
