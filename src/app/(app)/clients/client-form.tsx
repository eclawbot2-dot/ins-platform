import type { Client, User } from "@prisma/client";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { CLIENT_STATUS_LABELS } from "@/lib/labels";
import { fmtDateInput } from "@/lib/domain/dates";

export function ClientForm({
  client,
  users,
  action,
  submitLabel,
}: {
  client?: Client | null;
  users: Pick<User, "id" | "name" | "role">[];
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
}) {
  const producers = users.filter((u) => u.role !== "CSR");
  const csrs = users;
  return (
    <form action={action} className="card-pad max-w-3xl space-y-5">
      <FormGrid cols={3}>
        <Field label="Type" required>
          <Select
            name="type"
            defaultValue={client?.type ?? "INDIVIDUAL"}
            options={[
              { value: "INDIVIDUAL", label: "Individual" },
              { value: "BUSINESS", label: "Business" },
            ]}
          />
        </Field>
        <Field label="Status" required>
          <Select
            name="status"
            defaultValue={client?.status ?? "PROSPECT"}
            options={Object.entries(CLIENT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <Field label="Source">
          <input name="source" defaultValue={client?.source ?? ""} className="input" placeholder="Referral, website…" />
        </Field>
      </FormGrid>
      <FormGrid cols={3}>
        <Field label="First name">
          <input name="firstName" defaultValue={client?.firstName ?? ""} className="input" />
        </Field>
        <Field label="Last name">
          <input name="lastName" defaultValue={client?.lastName ?? ""} className="input" />
        </Field>
        <Field label="Business name" hint="Used as display name for business clients">
          <input name="businessName" defaultValue={client?.businessName ?? ""} className="input" />
        </Field>
      </FormGrid>
      <FormGrid cols={3}>
        <Field label="Email">
          <input type="email" name="email" defaultValue={client?.email ?? ""} className="input" />
        </Field>
        <Field label="Phone">
          <input name="phone" defaultValue={client?.phone ?? ""} className="input" />
        </Field>
        <Field label="Date of birth">
          <input type="date" name="dateOfBirth" defaultValue={fmtDateInput(client?.dateOfBirth)} className="input" />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="Address line 1">
          <input name="addressLine1" defaultValue={client?.addressLine1 ?? ""} className="input" />
        </Field>
        <Field label="Address line 2">
          <input name="addressLine2" defaultValue={client?.addressLine2 ?? ""} className="input" />
        </Field>
      </FormGrid>
      <FormGrid cols={3}>
        <Field label="City">
          <input name="city" defaultValue={client?.city ?? ""} className="input" />
        </Field>
        <Field label="State">
          <input name="state" defaultValue={client?.state ?? ""} className="input" maxLength={2} placeholder="SC" />
        </Field>
        <Field label="ZIP">
          <input name="zip" defaultValue={client?.zip ?? ""} className="input" />
        </Field>
      </FormGrid>
      <FormGrid cols={3}>
        <Field label="Industry" hint="Business clients">
          <input name="industry" defaultValue={client?.industry ?? ""} className="input" />
        </Field>
        <Field label="Producer">
          <Select
            name="producerId"
            allowEmpty
            emptyLabel="Unassigned"
            defaultValue={client?.producerId ?? ""}
            options={producers.map((u) => ({ value: u.id, label: u.name }))}
          />
        </Field>
        <Field label="CSR / account manager">
          <Select
            name="csrId"
            allowEmpty
            emptyLabel="Unassigned"
            defaultValue={client?.csrId ?? ""}
            options={csrs.map((u) => ({ value: u.id, label: u.name }))}
          />
        </Field>
      </FormGrid>
      <Field label="Notes">
        <textarea name="notes" defaultValue={client?.notes ?? ""} rows={3} className="input" />
      </Field>
      <button type="submit" className="btn-primary">
        {submitLabel}
      </button>
    </form>
  );
}
