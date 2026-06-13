import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, DetailItem } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { GROUP_PLAN_TYPE_LABELS, RATE_BASIS_LABELS } from "@/lib/labels";
import { fmtMoney } from "@/lib/money";
import { fmtDate, fmtDateInput } from "@/lib/domain/dates";
import { toNum } from "@/lib/money";
import { updateGroupPlan, deleteGroupPlan } from "../actions";

export const dynamic = "force-dynamic";

export default async function GroupPlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = await prisma.groupPlan.findUnique({
    where: { id },
    include: { client: { select: { id: true, name: true } } },
  });
  if (!plan) notFound();

  const enrollPct = plan.eligibleCount > 0 ? Math.round((plan.enrolledCount / plan.eligibleCount) * 100) : null;

  return (
    <>
      <PageHeader
        title={plan.planName}
        description={
          <>
            {GROUP_PLAN_TYPE_LABELS[plan.planType]} · <Link href={`/clients/${plan.client.id}`} className="text-navy-700 hover:underline">{plan.client.name}</Link>
            {" · "}
            {plan.active ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card-pad">
          <h2 className="section-title mb-3">Summary</h2>
          <dl className="grid grid-cols-2 gap-3">
            <DetailItem label="Carrier">{plan.carrierName}</DetailItem>
            <DetailItem label="Group #">{plan.groupNumber}</DetailItem>
            <DetailItem label="Effective">{fmtDate(plan.effectiveDate)}</DetailItem>
            <DetailItem label="Renews">{fmtDate(plan.renewalDate)}</DetailItem>
            <DetailItem label="Eligible">{plan.eligibleCount}</DetailItem>
            <DetailItem label="Enrolled">{plan.enrolledCount}{enrollPct != null ? ` (${enrollPct}%)` : ""}</DetailItem>
            <DetailItem label="Rate basis">{RATE_BASIS_LABELS[plan.rateBasis]}</DetailItem>
            <DetailItem label="Monthly premium">{plan.monthlyPremium ? fmtMoney(plan.monthlyPremium) : "—"}</DetailItem>
          </dl>
          {plan.notes ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{plan.notes}</p> : null}
        </div>

        <div className="card-pad">
          <h2 className="section-title mb-3">Edit plan</h2>
          <form action={updateGroupPlan.bind(null, plan.id)} className="space-y-4">
            <FormGrid cols={2}>
              <Field label="Plan name" required>
                <input name="planName" defaultValue={plan.planName} required className="input" />
              </Field>
              <Field label="Plan type">
                <Select name="planType" defaultValue={plan.planType} options={Object.entries(GROUP_PLAN_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
              </Field>
              <Field label="Carrier">
                <input name="carrierName" defaultValue={plan.carrierName ?? ""} className="input" />
              </Field>
              <Field label="Group #">
                <input name="groupNumber" defaultValue={plan.groupNumber ?? ""} className="input" />
              </Field>
              <Field label="Effective date">
                <input name="effectiveDate" type="date" defaultValue={fmtDateInput(plan.effectiveDate)} className="input" />
              </Field>
              <Field label="Renewal date">
                <input name="renewalDate" type="date" defaultValue={fmtDateInput(plan.renewalDate)} className="input" />
              </Field>
              <Field label="Eligible count">
                <input name="eligibleCount" type="number" min="0" defaultValue={plan.eligibleCount} className="input" />
              </Field>
              <Field label="Enrolled count">
                <input name="enrolledCount" type="number" min="0" defaultValue={plan.enrolledCount} className="input" />
              </Field>
              <Field label="Rate basis">
                <Select name="rateBasis" defaultValue={plan.rateBasis} options={Object.entries(RATE_BASIS_LABELS).map(([value, label]) => ({ value, label }))} />
              </Field>
              <Field label="Monthly premium ($)">
                <input name="monthlyPremium" type="number" step="0.01" defaultValue={plan.monthlyPremium ? toNum(plan.monthlyPremium) : ""} className="input" />
              </Field>
            </FormGrid>
            <Field label="Notes">
              <textarea name="notes" defaultValue={plan.notes ?? ""} rows={2} className="input" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="active" defaultChecked={plan.active} /> Active
            </label>
            <button type="submit" className="btn-primary">Save plan</button>
          </form>
          <form action={deleteGroupPlan.bind(null, plan.id)} className="mt-3 border-t border-slate-100 pt-3">
            <ConfirmButton message="Delete this group plan?">Delete plan</ConfirmButton>
          </form>
        </div>
      </div>
    </>
  );
}
