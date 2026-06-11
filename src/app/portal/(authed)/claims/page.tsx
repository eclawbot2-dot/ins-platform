import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal";
import { portalClaimWhere } from "@/lib/domain/portal-scope";
import { Badge } from "@/components/ui/badge";
import { CLAIM_STATUS_LABELS, claimStatusTone, LOB_LABELS } from "@/lib/labels";
import { fmtDate } from "@/lib/domain/dates";

export const dynamic = "force-dynamic";

export default async function PortalClaimsPage() {
  const session = await requirePortalSession();

  const claims = await prisma.claim.findMany({
    where: portalClaimWhere(session.clientId),
    include: { policy: { select: { policyNumber: true, lineOfBusiness: true } } },
    orderBy: { reportedAt: "desc" },
  });

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Claims</h1>
          <p className="mt-0.5 text-sm text-slate-500">Track existing claims or report a new loss.</p>
        </div>
        <Link href="/portal/claims/new" className="btn-primary">
          <Plus className="h-4 w-4" /> Report a claim
        </Link>
      </div>

      {claims.length === 0 ? (
        <div className="card-pad text-sm text-slate-600">
          No claims on file — we hope it stays that way. If something happens, report it here and
          your agency team will take it from there.
        </div>
      ) : (
        <div className="grid gap-3">
          {claims.map((c) => (
            <Link key={c.id} href={`/portal/claims/${c.id}`} className="card-pad transition hover:border-navy-300 hover:shadow">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-navy-700">{c.claimNumber}</div>
                  <div className="mt-0.5 text-sm text-slate-600">{c.description}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {LOB_LABELS[c.policy.lineOfBusiness]} · {c.policy.policyNumber} · Loss {fmtDate(c.dateOfLoss)}
                  </div>
                </div>
                <Badge tone={claimStatusTone(c.status)}>{CLAIM_STATUS_LABELS[c.status]}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
