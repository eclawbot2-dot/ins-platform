import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck, Phone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/lib/brand";
import { presentReport } from "@/lib/ai/presenter";
import { CoverageReport } from "@/components/compare/report";

export const metadata = { title: "Your Coverage Report" };
export const dynamic = "force-dynamic";

/**
 * Public results page — reachable by the anonymous submitter via the
 * unguessable cuid in the URL. ONLY PUBLIC_UPLOAD rows are exposed here;
 * portal/staff analyses are never viewable on this public surface.
 */
export default async function CompareResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await prisma.policyAnalysis.findFirst({
    where: { id, source: "PUBLIC_UPLOAD" },
  });
  if (!row) notFound();

  const view = presentReport(row);
  const analyzed = row.status === "ANALYZED";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-navy-800 text-white">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-4 py-4 sm:px-6">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-navy-700 ring-1 ring-gold-400/40">
            <ShieldCheck className="h-5 w-5 text-gold-400" />
          </span>
          <div>
            <div className="text-sm font-bold tracking-wide">{BRAND.name}</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-gold-300">Your Coverage Report</div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-2xl font-bold text-slate-900">
          {row.uploaderName ? `${row.uploaderName.split(/\s+/)[0]}, here's your report` : "Your coverage report"}
        </h1>
        <p className="mb-6 text-sm text-slate-600">
          {analyzed
            ? "A plain-English review of your current coverage, with gaps and recommendations."
            : "Thanks — our team is reviewing your policy and will reach out with your free coverage report."}
        </p>

        {analyzed ? (
          <CoverageReport
            view={view}
            summaryText={row.summaryText}
            lineOfBusiness={row.lineOfBusiness}
            carrierName={row.carrierName}
          />
        ) : (
          <div className="card-pad text-sm text-slate-600">
            <p>
              Your policy has been submitted for a free coverage report. One of our agents will personally review it and
              get back to you — usually within one business day.
            </p>
          </div>
        )}

        {/* Talk-to-an-agent CTA */}
        <div className="mt-8 rounded-xl bg-navy-800 p-5 text-white">
          <h2 className="text-lg font-semibold">Want to close these gaps?</h2>
          <p className="mt-1 text-sm text-slate-200">
            One of our licensed agents can walk you through your options and quote any coverage you&apos;re missing — no
            pressure, no cost.
          </p>
          <a
            href={`tel:${BRAND.phone.replace(/[^0-9]/g, "")}`}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gold-400 px-4 py-2 text-sm font-semibold text-navy-900 hover:bg-gold-300"
          >
            <Phone className="h-4 w-4" /> Talk to an agent · {BRAND.phone}
          </a>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          <Link href="/compare" className="hover:underline">
            Analyze another policy
          </Link>{" "}
          · {BRAND.name}
        </p>
      </main>
    </div>
  );
}
