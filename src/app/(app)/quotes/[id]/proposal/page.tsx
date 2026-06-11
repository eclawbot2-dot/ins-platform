import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/ui/print-button";
import { LOB_LABELS } from "@/lib/labels";
import { fmtMoneyCents, toNum } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";

export const metadata = { title: "Proposal" };
export const dynamic = "force-dynamic";

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [qr, agency] = await Promise.all([
    prisma.quoteRequest.findUnique({
      where: { id },
      include: {
        client: true,
        lead: true,
        owner: { select: { name: true, email: true, phone: true } },
        quotes: {
          where: { status: { not: "DECLINED" } },
          include: { carrier: { select: { name: true, amBestRating: true } } },
          orderBy: { premium: "asc" },
        },
      },
    }),
    prisma.agencyProfile.findUnique({ where: { id: "agency" } }),
  ]);
  if (!qr) notFound();

  const subjectName = qr.client?.name ?? (qr.lead ? `${qr.lead.firstName} ${qr.lead.lastName}` : "—");
  const lowest = qr.quotes.length > 0 ? Math.min(...qr.quotes.map((q) => toNum(q.premium))) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/quotes/${qr.id}`} className="btn">
          ← Back to quote request
        </Link>
        <PrintButton label="Print proposal" />
      </div>

      <div className="print-page card bg-white p-10">
        <div className="mb-8 flex items-start justify-between border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{agency?.name ?? BRAND.name}</h1>
            <p className="text-sm text-slate-500">
              {[agency?.addressLine1, agency?.city, agency?.state, agency?.zip].filter(Boolean).join(", ")}
              {agency?.phone ? ` · ${agency.phone}` : ""}
            </p>
          </div>
          <div className="text-right text-sm text-slate-500">
            <div className="font-semibold text-slate-700">Insurance proposal</div>
            <div>{fmtDate(new Date())}</div>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900">Prepared for {subjectName}</h2>
          <p className="text-sm text-slate-600">
            Coverage: {LOB_LABELS[qr.lineOfBusiness]}
            {qr.effectiveDate ? ` · Proposed effective ${fmtDate(qr.effectiveDate)}` : ""}
          </p>
        </div>

        <table className="mb-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-300 text-left">
              <th className="py-2 pr-4 font-semibold text-slate-700">Carrier</th>
              <th className="py-2 pr-4 font-semibold text-slate-700">AM Best</th>
              <th className="py-2 pr-4 font-semibold text-slate-700">Coverage summary</th>
              <th className="py-2 text-right font-semibold text-slate-700">Annual premium</th>
            </tr>
          </thead>
          <tbody>
            {qr.quotes.map((q) => (
              <tr key={q.id} className="border-b border-slate-100">
                <td className="py-2.5 pr-4 font-medium text-slate-800">
                  {q.carrier.name}
                  {lowest != null && toNum(q.premium) === lowest ? (
                    <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                      Recommended
                    </span>
                  ) : null}
                </td>
                <td className="py-2.5 pr-4">{q.carrier.amBestRating ?? "—"}</td>
                <td className="py-2.5 pr-4 text-slate-600">{q.coverageSummary ?? "—"}</td>
                <td className="py-2.5 text-right font-semibold">{fmtMoneyCents(q.premium)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {qr.notes ? (
          <div className="mb-6">
            <h3 className="mb-1 text-sm font-semibold text-slate-700">Notes</h3>
            <p className="whitespace-pre-wrap text-sm text-slate-600">{qr.notes}</p>
          </div>
        ) : null}

        <div className="border-t border-slate-200 pt-4 text-xs text-slate-500">
          <p>
            Prepared by {qr.owner.name}
            {qr.owner.email ? ` · ${qr.owner.email}` : ""}
            {qr.owner.phone ? ` · ${qr.owner.phone}` : ""}
          </p>
          <p className="mt-2">
            Premiums shown are carrier-quoted estimates and subject to underwriting review, final rating, and binding
            confirmation. Coverage is not bound until confirmed in writing by the agency.
          </p>
        </div>
      </div>
    </div>
  );
}
