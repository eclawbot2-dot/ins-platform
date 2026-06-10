import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { LOB_LABELS } from "@/lib/labels";
import { createClaim } from "../actions";

export const metadata = { title: "File FNOL" };
export const dynamic = "force-dynamic";

export default async function NewClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ policyId?: string }>;
}) {
  const { policyId } = await searchParams;
  const policies = await prisma.policy.findMany({
    where: { status: { in: ["ACTIVE", "BOUND", "RENEWED", "EXPIRED", "CANCELLED"] } },
    include: { client: { select: { name: true } } },
    orderBy: { expirationDate: "desc" },
    take: 500,
  });
  return (
    <>
      <PageHeader title="File FNOL" description="First notice of loss — opens a claim and a follow-up task." />
      <form action={createClaim} className="card-pad max-w-2xl space-y-4">
        <Field label="Policy" required>
          <Select
            name="policyId"
            defaultValue={policyId}
            options={policies.map((p) => ({
              value: p.id,
              label: `${p.policyNumber} — ${p.client.name} (${LOB_LABELS[p.lineOfBusiness]})`,
            }))}
          />
        </Field>
        <FormGrid>
          <Field label="Date of loss" required>
            <input type="date" name="dateOfLoss" required className="input" />
          </Field>
          <Field label="Carrier claim ref">
            <input name="carrierClaimRef" className="input" placeholder="Assigned later if unknown" />
          </Field>
        </FormGrid>
        <Field label="Loss description" required>
          <textarea name="description" rows={3} required className="input" placeholder="What happened, where, extent of damage…" />
        </Field>
        <FormGrid cols={3}>
          <Field label="Adjuster name">
            <input name="adjusterName" className="input" />
          </Field>
          <Field label="Adjuster phone">
            <input name="adjusterPhone" className="input" />
          </Field>
          <Field label="Adjuster email">
            <input name="adjusterEmail" type="email" className="input" />
          </Field>
        </FormGrid>
        <Field label="Initial reserve ($)">
          <input name="reserveAmount" type="number" step="0.01" min="0" className="input" />
        </Field>
        <button type="submit" className="btn-primary">
          Report claim
        </button>
      </form>
    </>
  );
}
