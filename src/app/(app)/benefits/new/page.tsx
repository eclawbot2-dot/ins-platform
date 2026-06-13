import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { GROUP_PLAN_TYPE_LABELS, RATE_BASIS_LABELS } from "@/lib/labels";
import { createGroupPlan } from "../actions";

export const metadata = { title: "New group plan" };
export const dynamic = "force-dynamic";

export default async function NewGroupPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  if (!clientId) notFound();
  const employer = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!employer) notFound();

  return (
    <>
      <PageHeader title={`New group plan — ${employer.name}`} description="Track a group benefits plan at a summary level." />

      <div className="card-pad max-w-2xl">
        <form action={createGroupPlan.bind(null, employer.id)} className="space-y-4">
          <FormGrid cols={2}>
            <Field label="Plan name" required>
              <input name="planName" required className="input" placeholder="2026 Group Medical PPO" />
            </Field>
            <Field label="Plan type">
              <Select name="planType" defaultValue="GROUP_HEALTH" options={Object.entries(GROUP_PLAN_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
            </Field>
            <Field label="Carrier">
              <input name="carrierName" className="input" />
            </Field>
            <Field label="Group #">
              <input name="groupNumber" className="input" />
            </Field>
            <Field label="Effective date" required>
              <input name="effectiveDate" type="date" required className="input" />
            </Field>
            <Field label="Renewal date">
              <input name="renewalDate" type="date" className="input" />
            </Field>
            <Field label="Eligible count">
              <input name="eligibleCount" type="number" min="0" defaultValue={0} className="input" />
            </Field>
            <Field label="Enrolled count">
              <input name="enrolledCount" type="number" min="0" defaultValue={0} className="input" />
            </Field>
            <Field label="Rate basis">
              <Select name="rateBasis" defaultValue="PEPM" options={Object.entries(RATE_BASIS_LABELS).map(([value, label]) => ({ value, label }))} />
            </Field>
            <Field label="Monthly premium ($)">
              <input name="monthlyPremium" type="number" step="0.01" className="input" />
            </Field>
          </FormGrid>
          <Field label="Notes">
            <textarea name="notes" rows={2} className="input" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="active" defaultChecked /> Active
          </label>
          <button type="submit" className="btn-primary">Create plan</button>
        </form>
      </div>
    </>
  );
}
