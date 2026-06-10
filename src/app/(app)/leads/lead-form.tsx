import type { Campaign, Lead, User } from "@prisma/client";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { ALL_LOBS, LEAD_STATUS_LABELS, LOB_LABELS } from "@/lib/labels";

export function LeadForm({
  lead,
  users,
  campaigns,
  action,
  submitLabel,
}: {
  lead?: Lead | null;
  users: Pick<User, "id" | "name">[];
  campaigns: Pick<Campaign, "id" | "name">[];
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
}) {
  return (
    <form action={action} className="card-pad max-w-3xl space-y-5">
      <FormGrid>
        <Field label="First name" required>
          <input name="firstName" defaultValue={lead?.firstName ?? ""} required className="input" />
        </Field>
        <Field label="Last name" required>
          <input name="lastName" defaultValue={lead?.lastName ?? ""} required className="input" />
        </Field>
        <Field label="Email">
          <input type="email" name="email" defaultValue={lead?.email ?? ""} className="input" />
        </Field>
        <Field label="Phone">
          <input name="phone" defaultValue={lead?.phone ?? ""} className="input" />
        </Field>
        <Field label="ZIP">
          <input name="zip" defaultValue={lead?.zip ?? ""} className="input" />
        </Field>
        <Field label="Line of business">
          <Select
            name="lineOfBusiness"
            allowEmpty
            defaultValue={lead?.lineOfBusiness ?? ""}
            options={ALL_LOBS.map((l) => ({ value: l, label: LOB_LABELS[l] }))}
          />
        </Field>
        <Field label="Source">
          <input name="source" defaultValue={lead?.source ?? ""} className="input" placeholder="Referral, website, event…" />
        </Field>
        <Field label="Campaign">
          <Select
            name="campaignId"
            allowEmpty
            defaultValue={lead?.campaignId ?? ""}
            options={campaigns.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Field>
        <Field label="Assigned to">
          <Select
            name="assignedToId"
            allowEmpty
            emptyLabel="Unassigned"
            defaultValue={lead?.assignedToId ?? ""}
            options={users.map((u) => ({ value: u.id, label: u.name }))}
          />
        </Field>
        {lead ? (
          <Field label="Status">
            <Select
              name="status"
              defaultValue={lead.status}
              options={Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Field>
        ) : null}
      </FormGrid>
      <Field label="Message / notes">
        <textarea name="message" defaultValue={lead?.message ?? ""} rows={3} className="input" />
      </Field>
      <button type="submit" className="btn-primary">
        {submitLabel}
      </button>
    </form>
  );
}
