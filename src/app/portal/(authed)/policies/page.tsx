import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal";
import { portalPolicyWhere } from "@/lib/domain/portal-scope";
import { Badge } from "@/components/ui/badge";
import { ViewToggle } from "@/components/ui/view-toggle";
import { LOB_LABELS, POLICY_STATUS_LABELS, policyStatusTone } from "@/lib/labels";
import { fmtMoney, toNum } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";
import { PortalPoliciesList, type PortalPolicyRow } from "./policies-list";

export const dynamic = "force-dynamic";

export default async function PortalPoliciesPage() {
  const session = await requirePortalSession();

  const policies = await prisma.policy.findMany({
    where: portalPolicyWhere(session.clientId),
    include: { carrier: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { expirationDate: "desc" }],
  });

  const listRows: PortalPolicyRow[] = policies.map((p) => ({
    id: p.id,
    lobLabel: LOB_LABELS[p.lineOfBusiness],
    policyNumber: p.policyNumber,
    carrierName: p.carrier.name,
    statusLabel: POLICY_STATUS_LABELS[p.status],
    statusTone: policyStatusTone(p.status),
    effectiveAt: p.effectiveDate.getTime(),
    effectiveFmt: fmtDate(p.effectiveDate),
    expiresAt: p.expirationDate.getTime(),
    expiresFmt: fmtDate(p.expirationDate),
    premium: toNum(p.premium),
    premiumFmt: fmtMoney(p.premium),
  }));

  return (
    <>
      <div className="mb-5">
        <h1 className="page-title">Your policies</h1>
        <p className="mt-0.5 text-sm text-slate-500">Coverage, carriers and policy periods.</p>
      </div>

      {policies.length === 0 ? (
        <div className="card-pad text-sm text-slate-600">No policies on file yet.</div>
      ) : (
        <ViewToggle
          storageKey="portalPoliciesViewMode"
          list={<PortalPoliciesList rows={listRows} />}
          cards={
            <div className="grid grid-cols-1 gap-3">
              {policies.map((p) => (
                <Link key={p.id} href={`/portal/policies/${p.id}`} className="card-pad transition hover:border-navy-300 hover:shadow">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-navy-700">{LOB_LABELS[p.lineOfBusiness]}</div>
                      <div className="mt-0.5 text-sm text-slate-500">
                        {p.policyNumber} · {p.carrier.name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {fmtDate(p.effectiveDate)} – {fmtDate(p.expirationDate)}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge tone={policyStatusTone(p.status)}>{POLICY_STATUS_LABELS[p.status]}</Badge>
                      <div className="mt-1.5 text-sm font-semibold text-slate-800">{fmtMoney(p.premium)}<span className="font-normal text-slate-500"> /yr</span></div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          }
        />
      )}
    </>
  );
}
