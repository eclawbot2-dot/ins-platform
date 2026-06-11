import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal";
import { portalClaimWhere } from "@/lib/domain/portal-scope";
import { Badge } from "@/components/ui/badge";
import { DetailItem } from "@/components/ui/page-header";
import { CLAIM_STATUS_LABELS, claimStatusTone, LOB_LABELS } from "@/lib/labels";
import { fmtDate } from "@/lib/domain/dates";

export const dynamic = "force-dynamic";

export default async function PortalClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePortalSession();
  const { id } = await params;

  const claim = await prisma.claim.findFirst({
    where: { id, ...portalClaimWhere(session.clientId) },
    include: {
      policy: { select: { policyNumber: true, lineOfBusiness: true, carrier: { select: { name: true } } } },
      documents: { where: { visibleToClient: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!claim) notFound();

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/portal/claims" className="inline-flex items-center gap-1 text-navy-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> All claims
        </Link>
      </p>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="page-title">Claim {claim.claimNumber}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {LOB_LABELS[claim.policy.lineOfBusiness]} · {claim.policy.policyNumber} · {claim.policy.carrier.name}
          </p>
        </div>
        <Badge tone={claimStatusTone(claim.status)}>{CLAIM_STATUS_LABELS[claim.status]}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-pad">
          <h2 className="section-title mb-3">Details</h2>
          <dl className="grid grid-cols-2 gap-3">
            <DetailItem label="Date of loss">{fmtDate(claim.dateOfLoss)}</DetailItem>
            <DetailItem label="Reported">{fmtDate(claim.reportedAt)}</DetailItem>
            <DetailItem label="Carrier claim #">{claim.carrierClaimRef}</DetailItem>
            <DetailItem label="Closed">{claim.closedAt ? fmtDate(claim.closedAt) : "—"}</DetailItem>
          </dl>
          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{claim.description}</p>
        </div>

        <div className="space-y-4">
          <div className="card-pad">
            <h2 className="section-title mb-3">Adjuster</h2>
            {claim.adjusterName ? (
              <p className="text-sm text-slate-700">
                {claim.adjusterName}
                {claim.adjusterPhone ? ` · ${claim.adjusterPhone}` : ""}
                {claim.adjusterEmail ? ` · ${claim.adjusterEmail}` : ""}
              </p>
            ) : (
              <p className="text-sm text-slate-500">An adjuster has not been assigned yet.</p>
            )}
          </div>
          <div className="card-pad">
            <h2 className="section-title mb-3">Documents</h2>
            {claim.documents.length === 0 ? (
              <p className="text-sm text-slate-500">No shared documents for this claim.</p>
            ) : (
              <ul className="space-y-2">
                {claim.documents.map((d) => (
                  <li key={d.id}>
                    <a
                      href={`/api/portal/documents/${d.id}`}
                      className="inline-flex items-center gap-1.5 text-sm text-navy-600 hover:underline"
                    >
                      <Download className="h-4 w-4" /> {d.fileName}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
