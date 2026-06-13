import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { householdSummary } from "@/lib/reports/household";
import {
  HOUSEHOLD_ROLE_LABELS,
  LOB_LABELS,
  POLICY_STATUS_LABELS,
  policyStatusTone,
} from "@/lib/labels";
import { fmtMoney } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";
import { updateHousehold, linkClientToHousehold, unlinkClientFromHousehold } from "../actions";

export const dynamic = "force-dynamic";

const HOUSEHOLD_ROLES = Object.keys(HOUSEHOLD_ROLE_LABELS) as (keyof typeof HOUSEHOLD_ROLE_LABELS)[];

export default async function HouseholdDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const summary = await householdSummary(id);
  if (!summary) notFound();

  // Candidate clients to add: not already in a household.
  const candidates = await prisma.client.findMany({
    where: { householdId: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 500,
  });

  const cs = summary.crossSell;

  return (
    <>
      <PageHeader
        title={summary.name}
        description={`Household · ${summary.members.length} member${summary.members.length === 1 ? "" : "s"} · ${fmtMoney(summary.totalPremium)} combined premium`}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left: members + edit + cross-sell */}
        <div className="space-y-6">
          <div className="card-pad">
            <h2 className="section-title mb-3">Members</h2>
            <ul className="space-y-2">
              {summary.members.map((m) => (
                <li key={m.clientId} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 text-sm last:border-0">
                  <div className="min-w-0">
                    <Link href={`/clients/${m.clientId}`} className="font-medium text-navy-700 hover:underline">
                      {m.name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {HOUSEHOLD_ROLE_LABELS[m.role as keyof typeof HOUSEHOLD_ROLE_LABELS]}
                      {summary.primaryClientId === m.clientId ? " · primary" : ""} · {m.policyCount} policy(ies) · {fmtMoney(m.premium)}
                    </div>
                  </div>
                  <form action={unlinkClientFromHousehold.bind(null, summary.id, m.clientId)}>
                    <ConfirmButton message={`Remove ${m.name} from this household?`}>Remove</ConfirmButton>
                  </form>
                </li>
              ))}
              {summary.members.length === 0 ? <li className="text-sm text-slate-400">No members yet.</li> : null}
            </ul>

            <form action={linkClientToHousehold.bind(null, summary.id)} className="mt-4 space-y-3 border-t border-slate-100 pt-3">
              <FormGrid>
                <Field label="Add client">
                  <Select
                    name="clientId"
                    options={[{ value: "", label: "Select a client…" }, ...candidates.map((c) => ({ value: c.id, label: c.name }))]}
                  />
                </Field>
                <Field label="Role">
                  <Select name="householdRole" defaultValue="OTHER" options={HOUSEHOLD_ROLES.map((r) => ({ value: r, label: HOUSEHOLD_ROLE_LABELS[r] }))} />
                </Field>
              </FormGrid>
              <button type="submit" className="btn btn-sm">
                <Plus className="h-3.5 w-3.5" /> Add member
              </button>
            </form>
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-3">Household settings</h2>
            <form action={updateHousehold.bind(null, summary.id)} className="space-y-4">
              <Field label="Name" required>
                <input name="name" defaultValue={summary.name} required className="input" />
              </Field>
              <Field label="Primary member">
                <Select
                  name="primaryClientId"
                  defaultValue={summary.primaryClientId ?? ""}
                  options={[{ value: "", label: "None" }, ...summary.members.map((m) => ({ value: m.clientId, label: m.name }))]}
                />
              </Field>
              <Field label="Notes">
                <textarea name="notes" defaultValue={summary.notes ?? ""} rows={2} className="input" />
              </Field>
              <button type="submit" className="btn-primary">Save household</button>
            </form>
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-1">Cross-sell across the household</h2>
            {cs.multiPolicyDiscountOpportunity ? (
              <p className="mb-3 rounded-lg bg-gold-50 px-3 py-2 text-xs text-navy-800">
                Multi-policy / multi-member discount opportunity — {cs.policyCarryingMembers} members carry policies. Consolidate for a household bundle.
              </p>
            ) : null}
            {cs.suggestions.length === 0 ? (
              <p className="text-sm text-slate-500">No open rounds — the household book is well-rounded.</p>
            ) : (
              <ul className="space-y-2">
                {cs.suggestions.map((s) => (
                  <li key={s.key} className="border-b border-slate-100 pb-2 text-sm last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800">{s.title}</span>
                      <span className="text-xs text-slate-500">{fmtMoney(s.estPremium)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{s.rationale}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: combined policy book */}
        <div className="space-y-6 xl:col-span-2">
          <div className="card-pad">
            <h2 className="section-title mb-3">Combined policy book ({summary.policies.length})</h2>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Policy #</th>
                    <th>Member</th>
                    <th>Line</th>
                    <th>Carrier</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th className="text-right">Premium</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.policies.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/policies/${p.id}`} className="font-medium text-navy-700 hover:underline">
                          {p.policyNumber}
                        </Link>
                      </td>
                      <td>{p.clientName}</td>
                      <td>{LOB_LABELS[p.lineOfBusiness]}</td>
                      <td>{p.carrierName}</td>
                      <td>
                        <Badge tone={policyStatusTone(p.status)}>{POLICY_STATUS_LABELS[p.status]}</Badge>
                      </td>
                      <td>{fmtDate(p.expirationDate)}</td>
                      <td className="text-right">{fmtMoney(p.premium)}</td>
                    </tr>
                  ))}
                  {summary.policies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-slate-400">No policies across the household.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-3">Combined lines of business</h2>
            <div className="flex flex-wrap gap-2">
              {cs.combinedLobs.length === 0 ? (
                <span className="text-sm text-slate-400">No active lines.</span>
              ) : (
                cs.combinedLobs.map((lob) => (
                  <Badge key={lob} tone="slate">{LOB_LABELS[lob]}</Badge>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
