import type { Carrier, Client, Policy, User } from "@prisma/client";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { ALL_LOBS, BILLING_LABELS, LOB_LABELS, POLICY_STATUS_LABELS, lobSegment } from "@/lib/labels";
import { fmtDateInput } from "@/lib/domain/dates";
import { toNum } from "@/lib/money";

export function PolicyForm({
  policy,
  clients,
  carriers,
  users,
  defaults,
  action,
  submitLabel,
}: {
  policy?: Policy | null;
  clients: Pick<Client, "id" | "name">[];
  carriers: Pick<Carrier, "id" | "name">[];
  users: Pick<User, "id" | "name" | "role">[];
  defaults?: { clientId?: string };
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
}) {
  const producers = users.filter((u) => u.role !== "CSR");
  return (
    <form action={action} className="card-pad max-w-3xl space-y-5">
      <FormGrid cols={3}>
        <Field label="Policy number" required>
          <input name="policyNumber" defaultValue={policy?.policyNumber ?? ""} required className="input" />
        </Field>
        <Field label="Client" required>
          <Select
            name="clientId"
            defaultValue={policy?.clientId ?? defaults?.clientId}
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Field>
        <Field label="Carrier" required>
          <Select name="carrierId" defaultValue={policy?.carrierId} options={carriers.map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
        <Field label="MGA / wholesaler">
          <input name="mga" defaultValue={policy?.mga ?? ""} className="input" />
        </Field>
        <Field label="Line of business" required>
          <Select
            name="lineOfBusiness"
            defaultValue={policy?.lineOfBusiness ?? "AUTO"}
            options={ALL_LOBS.map((l) => ({ value: l, label: `${LOB_LABELS[l]} (${lobSegment(l)})` }))}
          />
        </Field>
        <Field label="Status" required>
          <Select
            name="status"
            defaultValue={policy?.status ?? "QUOTE"}
            options={Object.entries(POLICY_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <Field label="Billing type" required>
          <Select
            name="billingType"
            defaultValue={policy?.billingType ?? "DIRECT_BILL"}
            options={Object.entries(BILLING_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <Field label="Annual premium ($)" required>
          <input name="premium" type="number" step="0.01" min="0" defaultValue={policy ? toNum(policy.premium) : ""} required className="input" />
        </Field>
        <Field label="Commission rate (%)" required hint="Commission $ computed automatically">
          <input
            name="commissionRatePct"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={policy ? toNum(policy.commissionRatePct) : ""}
            required
            className="input"
          />
        </Field>
        <Field label="Effective date" required>
          <input type="date" name="effectiveDate" defaultValue={fmtDateInput(policy?.effectiveDate)} required className="input" />
        </Field>
        <Field label="Expiration date" required>
          <input type="date" name="expirationDate" defaultValue={fmtDateInput(policy?.expirationDate)} required className="input" />
        </Field>
        <Field label="Producer" required>
          <Select name="producerId" defaultValue={policy?.producerId} options={producers.map((u) => ({ value: u.id, label: u.name }))} />
        </Field>
        <Field label="CSR">
          <Select
            name="csrId"
            allowEmpty
            emptyLabel="Unassigned"
            defaultValue={policy?.csrId ?? ""}
            options={users.map((u) => ({ value: u.id, label: u.name }))}
          />
        </Field>
      </FormGrid>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" name="isNewBusiness" defaultChecked={policy?.isNewBusiness ?? true} /> New business (vs renewal)
      </label>
      <Field label="Notes">
        <textarea name="notes" defaultValue={policy?.notes ?? ""} rows={3} className="input" />
      </Field>
      <button type="submit" className="btn-primary">
        {submitLabel}
      </button>
    </form>
  );
}
