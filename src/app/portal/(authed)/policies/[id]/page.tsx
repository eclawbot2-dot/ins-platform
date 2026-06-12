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
import { lobHasIdCard } from "@/lib/documents/id-card";
import { ENDORSEMENT_REQUEST_TYPE_LABELS } from "@/lib/labels";
import { CoverageScheduleTable, RiskItems } from "@/components/policy/coverage-schedule";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { portalRequestEndorsement } from "../../actions";

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
          {lobHasIdCard(policy.lineOfBusiness) ? (
            <a
              href={`/api/portal/id-card/${policy.id}`}
              target="_blank"
              rel="noopener"
              className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:underline"
            >
              <Download className="h-4 w-4" /> Print auto ID card
            </a>
          ) : null}
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
        <h2 className="section-title mb-2">Request a policy change</h2>
        <p className="mb-3 text-sm text-slate-600">
          Add a vehicle, change a limit, update a lienholder, or change your address. We&apos;ll review and submit it to
          the carrier — changes are not final until confirmed by the agency.
        </p>
        <form action={portalRequestEndorsement.bind(null, policy.id)} className="space-y-3">
          <FormGrid>
            <Field label="Change type" required>
              <Select
                name="requestType"
                options={Object.entries(ENDORSEMENT_REQUEST_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </Field>
            <Field label="Requested effective date">
              <input type="date" name="effectiveDate" className="input" />
            </Field>
          </FormGrid>
          <Field label="Details" required>
            <textarea name="summary" rows={3} required className="input" placeholder="e.g. Add my new 2024 Honda CR-V, VIN 1HG...; remove the 2016 Civic." />
          </Field>
          <button type="submit" className="btn-primary">Send change request</button>
        </form>
      </div>
    </>
  );
}
