import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus, RefreshCw } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, DetailItem } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import {
  BILLING_LABELS,
  CLAIM_STATUS_LABELS,
  LOB_LABELS,
  POLICY_STATUS_LABELS,
  claimStatusTone,
  lobSegment,
  policyStatusTone,
} from "@/lib/labels";
import { fmtMoney, fmtMoneyCents, fmtPct, toNum } from "@/lib/money";
import { fmtDate, fmtDateInput } from "@/lib/domain/dates";
import {
  activatePolicy,
  addEndorsement,
  bindPolicy,
  cancelPolicy,
  nonRenewPolicy,
  renewPolicy,
  setSplits,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function PolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const policy = await prisma.policy.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      carrier: { select: { id: true, name: true } },
      producer: { select: { id: true, name: true } },
      csr: { select: { name: true } },
      renewalOf: { select: { id: true, policyNumber: true } },
      renewedBy: { select: { id: true, policyNumber: true } },
      endorsements: { orderBy: { effectiveDate: "desc" } },
      claims: { orderBy: { reportedAt: "desc" } },
      splits: { include: { producer: { select: { name: true } } } },
      invoices: { orderBy: { issueDate: "desc" } },
      certificates: { include: { holder: { select: { name: true } } } },
      documents: true,
    },
  });
  if (!policy) notFound();

  const producers = await prisma.user.findMany({
    where: { active: true, role: { in: ["ADMIN", "PRODUCER"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const isOpen = policy.status === "ACTIVE" || policy.status === "BOUND";

  return (
    <>
      <PageHeader
        title={
          <>
            {policy.policyNumber}{" "}
            <Badge tone={policyStatusTone(policy.status)}>{POLICY_STATUS_LABELS[policy.status]}</Badge>
          </>
        }
        description={`${LOB_LABELS[policy.lineOfBusiness]} (${lobSegment(policy.lineOfBusiness)}) · ${policy.carrier.name}`}
        actions={
          <>
            {policy.status === "QUOTE" ? (
              <form action={bindPolicy.bind(null, policy.id)}>
                <button type="submit" className="btn-primary">
                  Bind policy
                </button>
              </form>
            ) : null}
            {policy.status === "BOUND" ? (
              <form action={activatePolicy.bind(null, policy.id)}>
                <button type="submit" className="btn-primary">
                  Mark active
                </button>
              </form>
            ) : null}
            {isOpen ? (
              <form action={nonRenewPolicy.bind(null, policy.id)}>
                <button type="submit" className="btn">
                  Non-renew
                </button>
              </form>
            ) : null}
            <Link href={`/policies/${policy.id}/edit`} className="btn">
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <div className="card-pad">
            <h2 className="section-title mb-3">Policy details</h2>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <DetailItem label="Client">
                <Link href={`/clients/${policy.client.id}`} className="text-navy-700 hover:underline">
                  {policy.client.name}
                </Link>
              </DetailItem>
              <DetailItem label="Carrier">
                <Link href={`/carriers/${policy.carrier.id}`} className="text-navy-700 hover:underline">
                  {policy.carrier.name}
                </Link>
              </DetailItem>
              <DetailItem label="MGA">{policy.mga}</DetailItem>
              <DetailItem label="Billing">{BILLING_LABELS[policy.billingType]}</DetailItem>
              <DetailItem label="Premium">{fmtMoneyCents(policy.premium)}</DetailItem>
              <DetailItem label="Commission">
                {fmtMoneyCents(policy.commissionAmount)} ({fmtPct(policy.commissionRatePct)})
              </DetailItem>
              <DetailItem label="Effective">{fmtDate(policy.effectiveDate)}</DetailItem>
              <DetailItem label="Expires">{fmtDate(policy.expirationDate)}</DetailItem>
              <DetailItem label="Business">{policy.isNewBusiness ? "New business" : "Renewal"}</DetailItem>
              <DetailItem label="Producer">{policy.producer.name}</DetailItem>
              <DetailItem label="CSR">{policy.csr?.name}</DetailItem>
              <DetailItem label="Bound at">{policy.boundAt ? fmtDate(policy.boundAt) : "—"}</DetailItem>
              {policy.renewalOf ? (
                <DetailItem label="Renewal of">
                  <Link href={`/policies/${policy.renewalOf.id}`} className="text-navy-700 hover:underline">
                    {policy.renewalOf.policyNumber}
                  </Link>
                </DetailItem>
              ) : null}
              {policy.renewedBy.length > 0 ? (
                <DetailItem label="Renewed by">
                  {policy.renewedBy.map((r) => (
                    <Link key={r.id} href={`/policies/${r.id}`} className="text-navy-700 hover:underline">
                      {r.policyNumber}
                    </Link>
                  ))}
                </DetailItem>
              ) : null}
              {policy.cancelledAt ? (
                <DetailItem label="Cancelled">
                  {fmtDate(policy.cancelledAt)} — {policy.cancellationReason}
                </DetailItem>
              ) : null}
            </dl>
            {policy.notes ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{policy.notes}</p> : null}
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-3">Endorsements ({policy.endorsements.length})</h2>
            <ul className="mb-4 space-y-2">
              {policy.endorsements.map((e) => (
                <li key={e.id} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm last:border-0">
                  <span className="text-slate-800">{e.description}</span>
                  <span className="text-xs text-slate-500">
                    {fmtDate(e.effectiveDate)} · {toNum(e.premiumChange) >= 0 ? "+" : ""}
                    {fmtMoneyCents(e.premiumChange)}
                  </span>
                </li>
              ))}
              {policy.endorsements.length === 0 ? <li className="text-sm text-slate-400">No endorsements.</li> : null}
            </ul>
            {isOpen ? (
              <form action={addEndorsement.bind(null, policy.id)} className="space-y-3 border-t border-slate-100 pt-3">
                <FormGrid cols={3}>
                  <Field label="Description" required>
                    <input name="description" required className="input" placeholder="Add scheduled equipment" />
                  </Field>
                  <Field label="Effective date" required>
                    <input type="date" name="effectiveDate" required className="input" />
                  </Field>
                  <Field label="Annualized premium change ($)" hint="Prorated for remaining term">
                    <input name="premiumChange" type="number" step="0.01" className="input" />
                  </Field>
                </FormGrid>
                <button type="submit" className="btn btn-sm">
                  <Plus className="h-3.5 w-3.5" /> Add endorsement
                </button>
              </form>
            ) : null}
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-3">Producer splits</h2>
            <ul className="mb-3 space-y-1 text-sm">
              {policy.splits.map((s) => (
                <li key={s.id} className="flex justify-between">
                  <span>{s.producer.name}</span>
                  <span className="font-medium">{fmtPct(s.pct, 0)} · {fmtMoneyCents(toNum(policy.commissionAmount) * (toNum(s.pct) / 100))}</span>
                </li>
              ))}
            </ul>
            <form action={setSplits.bind(null, policy.id)} className="space-y-2 border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-500">Replace splits (must sum to 100%):</p>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-2">
                  <Select
                    name={`producerId${i}`}
                    allowEmpty
                    defaultValue={policy.splits[i]?.producerId ?? ""}
                    options={producers.map((u) => ({ value: u.id, label: u.name }))}
                  />
                  <input
                    name={`pct${i}`}
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    defaultValue={policy.splits[i] ? toNum(policy.splits[i]!.pct) : ""}
                    placeholder="%"
                    className="input w-24"
                  />
                </div>
              ))}
              <button type="submit" className="btn btn-sm">
                Save splits
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          {isOpen ? (
            <div className="card-pad">
              <h2 className="section-title mb-3">
                <RefreshCw className="mr-1 inline h-4 w-4" /> Renew policy
              </h2>
              <form action={renewPolicy.bind(null, policy.id)} className="space-y-3">
                <Field label="New policy number" required>
                  <input name="policyNumber" defaultValue={`${policy.policyNumber}-R`} required className="input" />
                </Field>
                <Field label="Renewal premium ($)">
                  <input name="premium" type="number" step="0.01" min="0" defaultValue={toNum(policy.premium)} className="input" />
                </Field>
                <Field label="Commission rate (%)">
                  <input name="commissionRatePct" type="number" step="0.01" defaultValue={toNum(policy.commissionRatePct)} className="input" />
                </Field>
                <button type="submit" className="btn-primary w-full justify-center">
                  Renew for next term
                </button>
              </form>
            </div>
          ) : null}

          {isOpen ? (
            <div className="card-pad">
              <h2 className="section-title mb-3">Cancel policy</h2>
              <form action={cancelPolicy.bind(null, policy.id)} className="space-y-3">
                <Field label="Cancellation date" required>
                  <input type="date" name="cancelledAt" defaultValue={fmtDateInput(new Date())} required className="input" />
                </Field>
                <Field label="Reason" required>
                  <input name="cancellationReason" required className="input" placeholder="Non-payment, rewritten, sold…" />
                </Field>
                <Field label="Return method">
                  <Select
                    name="method"
                    options={[
                      { value: "PRO_RATA", label: "Pro-rata (carrier-initiated)" },
                      { value: "SHORT_RATE", label: "Short-rate (insured-initiated, 10% penalty)" },
                    ]}
                  />
                </Field>
                <ConfirmButton
                  className="btn-danger w-full justify-center"
                  message="Cancel this policy? Return premium is computed from the date and method above."
                >
                  Cancel policy
                </ConfirmButton>
              </form>
            </div>
          ) : null}

          <div className="card-pad">
            <h2 className="section-title mb-3">Claims ({policy.claims.length})</h2>
            <ul className="space-y-2">
              {policy.claims.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <Link href={`/claims/${c.id}`} className="font-medium text-navy-700 hover:underline">
                    {c.claimNumber}
                  </Link>
                  <Badge tone={claimStatusTone(c.status)}>{CLAIM_STATUS_LABELS[c.status]}</Badge>
                </li>
              ))}
              {policy.claims.length === 0 ? <li className="text-sm text-slate-400">No claims.</li> : null}
            </ul>
            <Link href={`/claims/new?policyId=${policy.id}`} className="mt-3 inline-block text-xs text-navy-700 hover:underline">
              File FNOL →
            </Link>
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-3">Invoices ({policy.invoices.length})</h2>
            <ul className="space-y-2">
              {policy.invoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between text-sm">
                  <Link href={`/accounting/invoices/${inv.id}`} className="font-medium text-navy-700 hover:underline">
                    {inv.invoiceNumber}
                  </Link>
                  <span className="text-xs text-slate-500">{fmtMoneyCents(inv.amount)}</span>
                </li>
              ))}
              {policy.invoices.length === 0 ? <li className="text-sm text-slate-400">No invoices.</li> : null}
            </ul>
            {policy.billingType === "AGENCY_BILL" ? (
              <Link href={`/accounting/invoices/new?policyId=${policy.id}`} className="mt-3 inline-block text-xs text-navy-700 hover:underline">
                Create agency-bill invoice →
              </Link>
            ) : null}
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-3">Certificates ({policy.certificates.length})</h2>
            <ul className="space-y-2">
              {policy.certificates.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <Link href={`/certificates/${c.id}`} className="font-medium text-navy-700 hover:underline">
                    {c.certNumber}
                  </Link>
                  <span className="text-xs text-slate-500">{c.holder.name}</span>
                </li>
              ))}
              {policy.certificates.length === 0 ? <li className="text-sm text-slate-400">No certificates.</li> : null}
            </ul>
            <Link href={`/certificates/new?policyId=${policy.id}`} className="mt-3 inline-block text-xs text-navy-700 hover:underline">
              Issue COI →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
