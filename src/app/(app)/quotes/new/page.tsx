import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { ALL_LOBS, LOB_LABELS } from "@/lib/labels";
import { createQuoteRequest } from "../actions";

export const metadata = { title: "New quote request" };
export const dynamic = "force-dynamic";

export default async function NewQuoteRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; leadId?: string }>;
}) {
  const { clientId, leadId } = await searchParams;
  const [clients, leads, users] = await Promise.all([
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.lead.findMany({
      where: { status: { notIn: ["CONVERTED", "LOST"] } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="New quote request" description="Open a multi-carrier quoting round for a client or lead." />
      <form action={createQuoteRequest} className="card-pad max-w-2xl space-y-4">
        <FormGrid>
          <Field label="Client" hint="Pick a client OR a lead">
            <Select name="clientId" allowEmpty defaultValue={clientId ?? ""} options={clients.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="Lead">
            <Select
              name="leadId"
              allowEmpty
              defaultValue={leadId ?? ""}
              options={leads.map((l) => ({ value: l.id, label: `${l.firstName} ${l.lastName}` }))}
            />
          </Field>
          <Field label="Line of business" required>
            <Select name="lineOfBusiness" options={ALL_LOBS.map((l) => ({ value: l, label: LOB_LABELS[l] }))} />
          </Field>
          <Field label="Target effective date">
            <input type="date" name="effectiveDate" className="input" />
          </Field>
          <Field label="Owner">
            <Select name="ownerId" allowEmpty emptyLabel="Me" options={users.map((u) => ({ value: u.id, label: u.name }))} />
          </Field>
        </FormGrid>
        <Field label="Notes / risk details">
          <textarea name="notes" rows={3} className="input" />
        </Field>
        <button type="submit" className="btn-primary">
          Create quote request
        </button>
      </form>
    </>
  );
}
