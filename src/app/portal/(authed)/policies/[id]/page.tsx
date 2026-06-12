import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal";
import { portalPolicyWhere } from "@/lib/domain/portal-scope";
import { Badge } from "@/components/ui/badge";
import { DetailItem } from "@/components/ui/page-header";
import { BILLING_LABELS, LOB_LABELS, POLICY_STATUS_LABELS, policyStatusTone } from "@/lib/labels";
import { fmtMoney, fmtMoneyCents } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";
import { loadPolicyExisting } from "@/lib/domain/policy-detail";
import { CoverageScheduleTable, RiskItems } from "@/components/policy/coverage-schedule";

export const dynamic = "force-dynamic";

export default async function PortalPolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePortalSession();
  const { id } = await params;

  // findFirst with the clientId-scoped where — a foreign policy id 404s.
  const policy = await prisma.policy.findFirst({
    where: { id, ...portalPolicyWhere(session.clientId) },
    include: {
      carrier: { select: { name: true, phone: true } },
      endorsements: { orderBy: { effectiveDate: "desc" } },
      documents: { where: { visibleToClient: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!policy) notFound();

  // Read-only coverage schedule + risk items for the client (no VIN/loan #).
  const existing = await loadPolicyExisting(policy.id);
  const hasRiskItems =
    (existing.vehicles?.length ?? 0) +
      (existing.dwellings?.length ?? 0) +
      (existing.scheduledItems?.length ?? 0) +
      (existing.watercraft?.length ?? 0) +
      (existing.locations?.length ?? 0) >
    0;

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/portal/policies" className="inline-flex items-center gap-1 text-navy-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> All policies
        </Link>
      </p>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="page-title">{LOB_LABELS[policy.lineOfBusiness]}</h1>
          <p className="mt-0.5 text-sm text-slate-500">Policy {policy.policyNumber}</p>
        </div>
        <Badge tone={policyStatusTone(policy.status)}>{POLICY_STATUS_LABELS[policy.status]}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card-pad">
          <h2 className="section-title mb-3">Policy summary</h2>
          <dl className="grid grid-cols-2 gap-3">
            <DetailItem label="Carrier">{policy.carrier.name}</DetailItem>
            <DetailItem label="Carrier phone">{policy.carrier.phone}</DetailItem>
            <DetailItem label="Annual premium">{fmtMoney(policy.premium)}</DetailItem>
            <DetailItem label="Billing">{BILLING_LABELS[policy.billingType]}</DetailItem>
            <DetailItem label="Effective">{fmtDate(policy.effectiveDate)}</DetailItem>
            <DetailItem label="Expires">{fmtDate(policy.expirationDate)}</DetailItem>
          </dl>
          {policy.status === "CANCELLED" && policy.cancellationReason ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              Cancelled: {policy.cancellationReason}
            </p>
          ) : null}
        </div>

        <div className="card-pad">
          <h2 className="section-title mb-3">Documents</h2>
          {policy.documents.length === 0 ? (
            <p className="text-sm text-slate-500">
              No shared documents for this policy yet — contact us if you need a copy of anything.
            </p>
          ) : (
            <ul className="space-y-2">
              {policy.documents.map((d) => (
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

      <div className="card-pad mt-4">
        <h2 className="section-title mb-3">Coverage schedule</h2>
        <CoverageScheduleTable coverages={existing.coverages ?? []} />
      </div>

      {hasRiskItems ? (
        <div className="card-pad mt-4">
          <h2 className="section-title mb-3">Insured items</h2>
          <RiskItems items={existing} />
        </div>
      ) : null}

      {policy.endorsements.length > 0 ? (
        <div className="card-pad mt-4">
          <h2 className="section-title mb-3">Endorsements</h2>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Effective</th>
                  <th>Description</th>
                  <th className="text-right">Premium change</th>
                </tr>
              </thead>
              <tbody>
                {policy.endorsements.map((e) => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.effectiveDate)}</td>
                    <td>{e.description}</td>
                    <td className="text-right">{fmtMoneyCents(e.premiumChange)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="card-pad mt-4">
        <h2 className="section-title mb-2">Need a change?</h2>
        <p className="text-sm text-slate-600">
          To add a vehicle, change coverage, or ask a question about this policy,{" "}
          <Link href="/portal/profile" className="text-navy-600 hover:underline">
            send us a request
          </Link>{" "}
          or call your agency team — changes are not final until confirmed by the agency.
        </p>
      </div>
    </>
  );
}
