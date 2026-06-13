import Link from "next/link";
import { notFound } from "next/navigation";
import { CreditCard, FileBadge, Pencil, Plus, RefreshCw, RotateCcw } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, DetailItem } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import {
  BILLING_LABELS,
  CLAIM_STATUS_LABELS,
  ENDORSEMENT_REQUEST_STATUS_LABELS,
  ENDORSEMENT_REQUEST_TYPE_LABELS,
  LOB_LABELS,
  POLICY_STATUS_LABELS,
  SURPLUS_LINES_STATUS_LABELS,
  SIGNATURE_STATUS_LABELS,
  claimStatusTone,
  endorsementRequestStatusTone,
  lobSegment,
  policyStatusTone,
  surplusLinesStatusTone,
  signatureStatusTone,
} from "@/lib/labels";
import { fmtMoney, fmtMoneyCents, fmtPct, toNum } from "@/lib/money";
import { fmtDate, fmtDateInput } from "@/lib/domain/dates";
import { loadPolicyExisting } from "@/lib/domain/policy-detail";
import { reinstatementEligibility } from "@/lib/domain/reinstatement";
import { lobHasIdCard } from "@/lib/documents/id-card";
import { lobHasEoi } from "@/lib/documents/eoi";
import { CoverageScheduleTable, RiskItems } from "@/components/policy/coverage-schedule";
import {
  activatePolicy,
  addEndorsement,
  bindPolicy,
  cancelPolicy,
  createEndorsementRequest,
  nonRenewPolicy,
  processEndorsementRequest,
  reinstatePolicy,
  renewPolicy,
  setEndorsementRequestStatus,
  setSplits,
} from "../actions";
import { upsertSurplusFiling } from "../surplus-actions";

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
      endorsementRequests: {
        orderBy: { createdAt: "desc" },
        include: { requestedBy: { select: { name: true } }, processedBy: { select: { name: true } } },
      },
      reinstatements: { orderBy: { reinstatedAt: "desc" }, include: { reinstatedBy: { select: { name: true } } } },
      surplusLinesFiling: true,
      signatureRequests: { orderBy: { createdAt: "desc" }, take: 10 },
      documents: true,
    },
  });
  if (!policy) notFound();

  const eligibility = reinstatementEligibility({
    status: policy.status,
    cancelledAt: policy.cancelledAt,
    expirationDate: policy.expirationDate,
  });

  const [producers, existing] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, role: { in: ["ADMIN", "PRODUCER"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    loadPolicyExisting(policy.id),
  ]);
  const hasRiskItems =
    (existing.vehicles?.length ?? 0) +
      (existing.drivers?.length ?? 0) +
      (existing.dwellings?.length ?? 0) +
      (existing.scheduledItems?.length ?? 0) +
      (existing.watercraft?.length ?? 0) +
      (existing.locations?.length ?? 0) >
    0;

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
            {lobHasIdCard(policy.lineOfBusiness) ? (
              <a href={`/api/documents/id-card/${policy.id}`} target="_blank" rel="noopener" className="btn">
                <CreditCard className="h-4 w-4" /> ID cards
              </a>
            ) : null}
            {lobHasEoi(policy.lineOfBusiness) && (isOpen || policy.status === "RENEWED") ? (
              <Link href={`/eoi/new?policyId=${policy.id}`} className="btn">
                <FileBadge className="h-4 w-4" /> Issue EOI
              </Link>
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
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">Coverage schedule ({existing.coverages?.length ?? 0})</h2>
              <Link href={`/policies/${policy.id}/edit`} className="text-xs text-navy-700 hover:underline">
                Edit coverages →
              </Link>
            </div>
            <CoverageScheduleTable coverages={existing.coverages ?? []} />
          </div>

          {hasRiskItems ? (
            <div className="card-pad">
              <h2 className="section-title mb-3">Risk items</h2>
              <RiskItems items={existing} staff />
            </div>
          ) : null}

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

          <div id="endorsement-requests" className="card-pad">
            <h2 className="section-title mb-3">Endorsement requests ({policy.endorsementRequests.length})</h2>
            <ul className="mb-4 space-y-3">
              {policy.endorsementRequests.map((r) => (
                <li key={r.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">
                      {ENDORSEMENT_REQUEST_TYPE_LABELS[r.requestType]} — {r.summary}
                    </span>
                    <Badge tone={endorsementRequestStatusTone(r.status)}>{ENDORSEMENT_REQUEST_STATUS_LABELS[r.status]}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {r.source === "PORTAL" ? "Client portal" : r.requestedBy?.name ?? "Staff"} ·{" "}
                    {fmtDate(r.createdAt)}
                    {r.effectiveDate ? ` · eff. ${fmtDate(r.effectiveDate)}` : ""}
                    {r.declineReason ? ` · declined: ${r.declineReason}` : ""}
                  </div>
                  {r.notes ? <p className="mt-1 text-xs text-slate-500">{r.notes}</p> : null}
                  {r.status !== "COMPLETED" && r.status !== "DECLINED" ? (
                    <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-2">
                      {["IN_REVIEW", "SUBMITTED_TO_CARRIER"].map((next) =>
                        next !== r.status ? (
                          <form key={next} action={setEndorsementRequestStatus.bind(null, r.id)}>
                            <input type="hidden" name="status" value={next} />
                            <button type="submit" className="btn btn-sm">
                              {ENDORSEMENT_REQUEST_STATUS_LABELS[next as keyof typeof ENDORSEMENT_REQUEST_STATUS_LABELS]}
                            </button>
                          </form>
                        ) : null,
                      )}
                      <form action={setEndorsementRequestStatus.bind(null, r.id)} className="flex items-end gap-1">
                        <input type="hidden" name="status" value="DECLINED" />
                        <input name="declineReason" placeholder="Decline reason" className="input w-40" />
                        <button type="submit" className="btn btn-sm btn-danger">Decline</button>
                      </form>
                      {isOpen ? (
                        <form action={processEndorsementRequest.bind(null, r.id)} className="flex flex-wrap items-end gap-1">
                          <input
                            type="date"
                            name="effectiveDate"
                            defaultValue={fmtDateInput(r.effectiveDate ?? new Date())}
                            className="input w-36"
                            title="Effective date"
                          />
                          <input name="premiumChange" type="number" step="0.01" placeholder="Δ premium/yr" className="input w-28" title="Annualized premium change" />
                          <button type="submit" className="btn btn-sm btn-primary">Apply endorsement</button>
                        </form>
                      ) : null}
                    </div>
                  ) : r.endorsementId ? (
                    <div className="mt-1 text-xs text-emerald-600">Endorsement applied{r.processedBy ? ` by ${r.processedBy.name}` : ""}.</div>
                  ) : null}
                </li>
              ))}
              {policy.endorsementRequests.length === 0 ? (
                <li className="text-sm text-slate-400">No endorsement requests.</li>
              ) : null}
            </ul>
            <form action={createEndorsementRequest.bind(null, policy.id)} className="space-y-3 border-t border-slate-100 pt-3">
              <FormGrid cols={3}>
                <Field label="Change type" required>
                  <Select
                    name="requestType"
                    options={Object.entries(ENDORSEMENT_REQUEST_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                  />
                </Field>
                <Field label="Requested effective date">
                  <input type="date" name="effectiveDate" className="input" />
                </Field>
                <Field label="Summary" required>
                  <input name="summary" required className="input" placeholder="Add 2024 Ford Transit (VIN …4821)" />
                </Field>
              </FormGrid>
              <input name="notes" placeholder="Notes (optional)" className="input" />
              <button type="submit" className="btn btn-sm">
                <Plus className="h-3.5 w-3.5" /> Log endorsement request
              </button>
            </form>
          </div>

          {policy.reinstatements.length > 0 ? (
            <div className="card-pad">
              <h2 className="section-title mb-3">Reinstatement history</h2>
              <ul className="space-y-2 text-sm">
                {policy.reinstatements.map((r) => (
                  <li key={r.id} className="border-b border-slate-100 pb-2 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{r.reason}</span>
                      <span className="text-xs text-slate-500">{fmtDate(r.reinstatedAt)}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Cancelled {fmtDate(r.cancelledAt)} · {r.lapseDays}-day lapse
                      {r.reinstatedBy ? ` · ${r.reinstatedBy.name}` : ""}
                    </div>
                    {r.lapseHandling ? <p className="mt-0.5 text-xs text-slate-400">{r.lapseHandling}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

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

          {policy.status === "CANCELLED" ? (
            <div className="card-pad">
              <h2 className="section-title mb-3">
                <RotateCcw className="mr-1 inline h-4 w-4" /> Reinstate policy
              </h2>
              {eligibility.eligible ? (
                <form action={reinstatePolicy.bind(null, policy.id)} className="space-y-3">
                  <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{eligibility.reason}</p>
                  <Field label="Reason" required>
                    <input name="reason" required defaultValue="Payment received — reinstated per carrier" className="input" />
                  </Field>
                  <Field label="Lapse handling note">
                    <input name="lapseHandling" className="input" placeholder="Auto-filled from the computed lapse if blank" />
                  </Field>
                  <ConfirmButton
                    className="btn-primary w-full justify-center"
                    message="Reinstate this policy to ACTIVE? A reinstatement record will be created."
                  >
                    Reinstate to active
                  </ConfirmButton>
                </form>
              ) : (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{eligibility.reason}</p>
              )}
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

          <div className="card-pad">
            <h2 className="section-title mb-3">Surplus-lines filing</h2>
            {policy.surplusLinesFiling ? (
              <p className="mb-3 text-xs">
                <Badge tone={surplusLinesStatusTone(policy.surplusLinesFiling.status)}>
                  {SURPLUS_LINES_STATUS_LABELS[policy.surplusLinesFiling.status]}
                </Badge>{" "}
                <span className="ml-1 text-slate-500">{policy.surplusLinesFiling.state}{policy.surplusLinesFiling.filingNumber ? ` · #${policy.surplusLinesFiling.filingNumber}` : ""}</span>
              </p>
            ) : (
              <p className="mb-3 text-xs text-slate-500">
                Non-admitted / E&S placement? Record the state surplus-lines filing here.
              </p>
            )}
            <form action={upsertSurplusFiling.bind(null, policy.id)} className="space-y-3">
              <FormGrid cols={2}>
                <Field label="State" required>
                  <input name="state" defaultValue={policy.surplusLinesFiling?.state ?? ""} required className="input" placeholder="MA" />
                </Field>
                <Field label="Status">
                  <Select
                    name="status"
                    defaultValue={policy.surplusLinesFiling?.status ?? "PENDING"}
                    options={Object.entries(SURPLUS_LINES_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                  />
                </Field>
                <Field label="Filing #">
                  <input name="filingNumber" defaultValue={policy.surplusLinesFiling?.filingNumber ?? ""} className="input" />
                </Field>
                <Field label="Tax rate %">
                  <input name="taxRatePct" type="number" step="0.001" defaultValue={policy.surplusLinesFiling?.taxRatePct ? toNum(policy.surplusLinesFiling.taxRatePct) : ""} className="input" />
                </Field>
                <Field label="SL tax ($)">
                  <input name="surplusLinesTax" type="number" step="0.01" defaultValue={policy.surplusLinesFiling?.surplusLinesTax ? toNum(policy.surplusLinesFiling.surplusLinesTax) : ""} className="input" />
                </Field>
                <Field label="Stamping fee ($)">
                  <input name="stampingFee" type="number" step="0.01" defaultValue={policy.surplusLinesFiling?.stampingFee ? toNum(policy.surplusLinesFiling.stampingFee) : ""} className="input" />
                </Field>
                <Field label="Due date">
                  <input name="dueDate" type="date" defaultValue={fmtDateInput(policy.surplusLinesFiling?.dueDate)} className="input" />
                </Field>
                <Field label="Filed date">
                  <input name="filedAt" type="date" defaultValue={fmtDateInput(policy.surplusLinesFiling?.filedAt)} className="input" />
                </Field>
              </FormGrid>
              <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="diligentSearchDone" defaultChecked={policy.surplusLinesFiling?.diligentSearchDone ?? false} /> Diligent search done
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="affidavitOnFile" defaultChecked={policy.surplusLinesFiling?.affidavitOnFile ?? false} /> Affidavit on file
                </label>
              </div>
              <Field label="Notes">
                <input name="notes" defaultValue={policy.surplusLinesFiling?.notes ?? ""} className="input" />
              </Field>
              <div className="flex items-center gap-2">
                <button type="submit" className="btn btn-sm">Save filing</button>
                <Link href="/compliance/surplus-lines" className="text-xs text-navy-700 hover:underline">Worklist →</Link>
              </div>
            </form>
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-3">E-signature requests</h2>
            <ul className="mb-3 space-y-2">
              {policy.signatureRequests.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/signatures/${s.id}`} className="truncate font-medium text-navy-700 hover:underline">{s.title}</Link>
                  <Badge tone={signatureStatusTone(s.status)}>{SIGNATURE_STATUS_LABELS[s.status]}</Badge>
                </li>
              ))}
              {policy.signatureRequests.length === 0 ? <li className="text-sm text-slate-400">No signature requests.</li> : null}
            </ul>
            <Link href={`/signatures/new?policyId=${policy.id}&clientId=${policy.client.id}`} className="text-xs text-navy-700 hover:underline">
              Send for signature →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
