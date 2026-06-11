import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal";
import { portalPolicyWhere } from "@/lib/domain/portal-scope";
import { LOB_LABELS } from "@/lib/labels";
import { fmtDateInput } from "@/lib/domain/dates";
import { portalSubmitClaim } from "../../actions";

export const dynamic = "force-dynamic";

export default async function PortalNewClaimPage() {
  const session = await requirePortalSession();

  const policies = await prisma.policy.findMany({
    where: { ...portalPolicyWhere(session.clientId), status: { in: ["ACTIVE", "BOUND", "RENEWED", "EXPIRED"] } },
    select: { id: true, policyNumber: true, lineOfBusiness: true },
    orderBy: { expirationDate: "desc" },
  });

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/portal/claims" className="inline-flex items-center gap-1 text-navy-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> All claims
        </Link>
      </p>
      <div className="mb-5">
        <h1 className="page-title">Report a claim</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          First notice of loss — your agency team will review it and contact you, usually within
          one business day. For emergencies, call us directly.
        </p>
      </div>

      <div className="card-pad max-w-xl">
        {policies.length === 0 ? (
          <p className="text-sm text-slate-600">No policies available to report a claim against — please contact the agency.</p>
        ) : (
          <form action={portalSubmitClaim} className="space-y-4">
            <div>
              <label className="label" htmlFor="fnol-policy">Policy involved</label>
              <select id="fnol-policy" name="policyId" className="input" required defaultValue="">
                <option value="" disabled>
                  Select a policy…
                </option>
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {LOB_LABELS[p.lineOfBusiness]} — {p.policyNumber}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="fnol-date">Date of loss</label>
              <input
                id="fnol-date"
                name="dateOfLoss"
                type="date"
                className="input"
                max={fmtDateInput(new Date())}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="fnol-description">What happened?</label>
              <textarea
                id="fnol-description"
                name="description"
                rows={5}
                className="input"
                minLength={10}
                required
                placeholder="Describe the loss — what, where, who was involved, any injuries or damage"
              />
            </div>
            <div>
              <label className="label" htmlFor="fnol-phone">Best callback number (optional)</label>
              <input id="fnol-phone" name="phone" type="tel" className="input" autoComplete="tel" />
            </div>
            <button type="submit" className="btn-primary w-full justify-center py-2.5 sm:w-auto">
              Submit claim report
            </button>
          </form>
        )}
      </div>
    </>
  );
}
