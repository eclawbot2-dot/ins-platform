import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, DetailItem } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { ALL_LOBS, APPOINTMENT_LABELS, CARRIER_APPETITE_LABELS, LOB_LABELS, POLICY_STATUS_LABELS, carrierAppetiteTone, policyStatusTone } from "@/lib/labels";
import { fmtMoney, fmtPct, toNum } from "@/lib/money";
import { fmtDate, fmtDateInput } from "@/lib/domain/dates";
import { addCarrierContact, deleteAppetite, deleteCarrierContact, deleteSchedule, updateCarrier, upsertAppetite, upsertSchedule } from "../actions";

const APPETITE_OPTIONS = Object.entries(CARRIER_APPETITE_LABELS).map(([value, label]) => ({ value, label }));

export const dynamic = "force-dynamic";

export default async function CarrierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const carrier = await prisma.carrier.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { name: "asc" } },
      schedules: { orderBy: { lineOfBusiness: "asc" } },
      appetites: { orderBy: { lineOfBusiness: "asc" } },
      policies: {
        where: { status: { in: ["ACTIVE", "BOUND"] } },
        include: { client: { select: { name: true } } },
        orderBy: { expirationDate: "asc" },
        take: 50,
      },
      statements: { orderBy: { statementDate: "desc" }, take: 10 },
    },
  });
  if (!carrier) notFound();

  const book = carrier.policies.reduce((acc, p) => acc + toNum(p.premium), 0);

  return (
    <>
      <PageHeader
        title={carrier.name}
        description={
          <>
            {carrier.isMga ? "MGA / wholesaler" : "Carrier"} ·{" "}
            <Badge tone={carrier.appointmentStatus === "APPOINTED" ? "green" : "slate"}>
              {APPOINTMENT_LABELS[carrier.appointmentStatus]}
            </Badge>
          </>
        }
        actions={
          carrier.portalUrl ? (
            <a href={carrier.portalUrl} target="_blank" rel="noreferrer" className="btn">
              <ExternalLink className="h-4 w-4" /> Carrier portal
            </a>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <div className="card-pad">
            <h2 className="section-title mb-3">Edit carrier</h2>
            <form action={updateCarrier.bind(null, carrier.id)} className="space-y-4">
              <FormGrid cols={3}>
                <Field label="Name" required>
                  <input name="name" defaultValue={carrier.name} required className="input" />
                </Field>
                <Field label="NAIC code">
                  <input name="naicCode" defaultValue={carrier.naicCode ?? ""} className="input" />
                </Field>
                <Field label="AM Best rating">
                  <input name="amBestRating" defaultValue={carrier.amBestRating ?? ""} className="input" />
                </Field>
                <Field label="Portal URL">
                  <input name="portalUrl" defaultValue={carrier.portalUrl ?? ""} className="input" />
                </Field>
                <Field label="Phone">
                  <input name="phone" defaultValue={carrier.phone ?? ""} className="input" />
                </Field>
                <Field label="Payment terms (days)">
                  <input name="paymentTermsDays" type="number" defaultValue={carrier.paymentTermsDays} className="input" />
                </Field>
                <Field label="Appointment status">
                  <Select
                    name="appointmentStatus"
                    defaultValue={carrier.appointmentStatus}
                    options={Object.entries(APPOINTMENT_LABELS).map(([value, label]) => ({ value, label }))}
                  />
                </Field>
                <Field label="Appointed">
                  <input type="date" name="appointedAt" defaultValue={fmtDateInput(carrier.appointedAt)} className="input" />
                </Field>
                <Field label="Appointment expires">
                  <input type="date" name="appointmentExpiresAt" defaultValue={fmtDateInput(carrier.appointmentExpiresAt)} className="input" />
                </Field>
              </FormGrid>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="isMga" defaultChecked={carrier.isMga} /> MGA / wholesaler
              </label>
              <Field label="Notes">
                <textarea name="notes" defaultValue={carrier.notes ?? ""} rows={2} className="input" />
              </Field>
              <div className="border-t border-slate-100 pt-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Underwriting & binding authority
                </h3>
                <FormGrid cols={2}>
                  <Field label="UW guidelines URL">
                    <input name="uwGuidelinesUrl" type="url" defaultValue={carrier.uwGuidelinesUrl ?? ""} className="input" placeholder="https://…" />
                  </Field>
                  <Field label="Binding authority limit ($)">
                    <input name="bindingAuthorityLimit" type="number" step="0.01" defaultValue={carrier.bindingAuthorityLimit ? toNum(carrier.bindingAuthorityLimit) : ""} className="input" />
                  </Field>
                </FormGrid>
                <Field label="UW guidelines notes">
                  <textarea name="uwGuidelinesNotes" defaultValue={carrier.uwGuidelinesNotes ?? ""} rows={2} className="input" placeholder="Class restrictions, referral triggers…" />
                </Field>
                <Field label="Binding authority notes">
                  <textarea name="bindingAuthorityNotes" defaultValue={carrier.bindingAuthorityNotes ?? ""} rows={2} className="input" placeholder="What we can bind vs. must refer…" />
                </Field>
              </div>
              <button type="submit" className="btn-primary">
                Save carrier
              </button>
            </form>
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-3">Carrier contacts</h2>
            <ul className="mb-4 space-y-2">
              {carrier.contacts.map((c) => (
                <li key={c.id} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm last:border-0">
                  <div>
                    <span className="font-medium text-slate-800">{c.name}</span>
                    <span className="ml-2 text-xs text-slate-500">{[c.role, c.email, c.phone].filter(Boolean).join(" · ")}</span>
                  </div>
                  <form action={deleteCarrierContact.bind(null, carrier.id, c.id)}>
                    <ConfirmButton message={`Remove carrier contact "${c.name}"?`}>Remove</ConfirmButton>
                  </form>
                </li>
              ))}
              {carrier.contacts.length === 0 ? <li className="text-sm text-slate-400">No contacts.</li> : null}
            </ul>
            <form action={addCarrierContact.bind(null, carrier.id)} className="space-y-3">
              <FormGrid>
                <input name="name" placeholder="Name" required className="input" />
                <input name="role" placeholder="Role (underwriter, marketing rep…)" className="input" />
                <input name="email" type="email" placeholder="Email" className="input" />
                <input name="phone" placeholder="Phone" className="input" />
              </FormGrid>
              <button type="submit" className="btn btn-sm">
                <Plus className="h-3.5 w-3.5" /> Add contact
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card-pad">
            <h2 className="section-title mb-3">Commission schedule (new % / renewal %)</h2>
            <div className="mb-4 overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Line of business</th>
                  <th className="text-right">New</th>
                  <th className="text-right">Renewal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {carrier.schedules.map((s) => (
                  <tr key={s.id}>
                    <td>{LOB_LABELS[s.lineOfBusiness]}</td>
                    <td className="text-right">{fmtPct(s.newPct)}</td>
                    <td className="text-right">{fmtPct(s.renewalPct)}</td>
                    <td className="text-right">
                      <form action={deleteSchedule.bind(null, carrier.id, s.id)}>
                        <ConfirmButton message={`Remove the ${LOB_LABELS[s.lineOfBusiness]} commission row?`}>
                          Remove
                        </ConfirmButton>
                      </form>
                    </td>
                  </tr>
                ))}
                {carrier.schedules.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-400">
                      No schedule rows.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            </div>
            <form action={upsertSchedule.bind(null, carrier.id)} className="flex flex-wrap items-end gap-2">
              <Field label="LOB">
                <Select name="lineOfBusiness" options={ALL_LOBS.map((l) => ({ value: l, label: LOB_LABELS[l] }))} />
              </Field>
              <Field label="New %">
                <input name="newPct" type="number" step="0.01" min="0" max="100" required className="input w-24" />
              </Field>
              <Field label="Renewal %">
                <input name="renewalPct" type="number" step="0.01" min="0" max="100" required className="input w-24" />
              </Field>
              <button type="submit" className="btn">
                Save row
              </button>
            </form>
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-3">Appetite / eligibility by line</h2>
            <div className="mb-4 overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Line of business</th>
                    <th>Appetite</th>
                    <th>States</th>
                    <th>Class notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {carrier.appetites.map((a) => (
                    <tr key={a.id}>
                      <td>{LOB_LABELS[a.lineOfBusiness]}</td>
                      <td>
                        <Badge tone={carrierAppetiteTone(a.appetite)}>{CARRIER_APPETITE_LABELS[a.appetite]}</Badge>
                      </td>
                      <td className="text-xs">{a.states ?? "All"}</td>
                      <td className="max-w-[16rem] truncate text-xs text-slate-500" title={a.classNotes ?? ""}>{a.classNotes ?? "—"}</td>
                      <td className="text-right">
                        <form action={deleteAppetite.bind(null, carrier.id, a.id)}>
                          <ConfirmButton message={`Remove the ${LOB_LABELS[a.lineOfBusiness]} appetite row?`}>Remove</ConfirmButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                  {carrier.appetites.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-400">No appetite rows — add lines this carrier writes so they surface in the market finder.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <form action={upsertAppetite.bind(null, carrier.id)} className="space-y-3">
              <FormGrid cols={2}>
                <Field label="LOB">
                  <Select name="lineOfBusiness" options={ALL_LOBS.map((l) => ({ value: l, label: LOB_LABELS[l] }))} />
                </Field>
                <Field label="Appetite">
                  <Select name="appetite" defaultValue="STANDARD" options={APPETITE_OPTIONS} />
                </Field>
                <Field label="States (CSV, blank = all)">
                  <input name="states" className="input" placeholder="MA, NH, RI" />
                </Field>
                <Field label="Class notes">
                  <input name="classNotes" className="input" placeholder="No coastal; TIV < $5M" />
                </Field>
              </FormGrid>
              <button type="submit" className="btn btn-sm">Save appetite</button>
            </form>
            <p className="mt-3 text-xs text-slate-500">
              <Link href="/markets" className="text-navy-700 hover:underline">Open the market finder →</Link>
            </p>
          </div>

          <div className="card-pad">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">Active book — {fmtMoney(book)}</h2>
              <Link href={`/policies?q=${encodeURIComponent(carrier.name)}`} className="text-xs text-navy-700 hover:underline">
                All policies →
              </Link>
            </div>
            <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Policy #</th>
                  <th>Client</th>
                  <th>Line</th>
                  <th>Status</th>
                  <th className="text-right">Premium</th>
                </tr>
              </thead>
              <tbody>
                {carrier.policies.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/policies/${p.id}`} className="font-medium text-navy-700 hover:underline">
                        {p.policyNumber}
                      </Link>
                    </td>
                    <td>{p.client.name}</td>
                    <td>{LOB_LABELS[p.lineOfBusiness]}</td>
                    <td>
                      <Badge tone={policyStatusTone(p.status)}>{POLICY_STATUS_LABELS[p.status]}</Badge>
                    </td>
                    <td className="text-right">{fmtMoney(p.premium)}</td>
                  </tr>
                ))}
                {carrier.policies.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">
                      No active policies.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            </div>
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-3">Recent commission statements</h2>
            <ul className="space-y-2">
              {carrier.statements.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <Link href={`/commissions/${s.id}`} className="font-medium text-navy-700 hover:underline">
                    {s.periodLabel ?? fmtDate(s.statementDate)}
                  </Link>
                  <span className="text-xs text-slate-500">{fmtMoney(s.totalAmount)}</span>
                </li>
              ))}
              {carrier.statements.length === 0 ? <li className="text-sm text-slate-400">No statements.</li> : null}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card-pad text-sm">
          <DetailItem label="Payment terms">{carrier.paymentTermsDays} days</DetailItem>
        </div>
        <div className="card-pad text-sm">
          <DetailItem label="Appointed">{carrier.appointedAt ? fmtDate(carrier.appointedAt) : "—"}</DetailItem>
        </div>
        <div className="card-pad text-sm">
          <DetailItem label="Appointment expires">
            {carrier.appointmentExpiresAt ? fmtDate(carrier.appointmentExpiresAt) : "—"}
          </DetailItem>
        </div>
        <div className="card-pad text-sm">
          <DetailItem label="Phone">{carrier.phone}</DetailItem>
        </div>
      </div>
    </>
  );
}
