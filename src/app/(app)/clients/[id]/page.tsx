import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, DetailItem } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import {
  CLIENT_STATUS_LABELS,
  CLAIM_STATUS_LABELS,
  LOB_LABELS,
  POLICY_STATUS_LABELS,
  TOUCHPOINT_CATEGORY_LABELS,
  TOUCHPOINT_STATUS_LABELS,
  claimStatusTone,
  policyStatusTone,
  touchpointCategoryTone,
  touchpointStatusTone,
} from "@/lib/labels";
import { updateClientCommPrefs } from "../../touchpoints/actions";
import { fmtMoney, fmtMoneyCents, toNum } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";
import { xDateBucket } from "@/lib/domain/xdates";
import { ALL_LOBS, lobSegment, LOB_LABELS as LOB_NAMES } from "@/lib/labels";
import { inviteState } from "@/lib/domain/portal-invite";
import { crossSellForClient } from "@/lib/reports/cross-sell";
import { clientHealthFor } from "@/lib/reports/client-health";
import { HEALTH_TIER_LABELS, healthTierTone } from "@/lib/domain/client-health";
import {
  addClientActivity,
  addClientTask,
  addContact,
  addPriorPolicy,
  deleteContact,
  deletePriorPolicy,
  disablePortalUser,
  invitePortalUser,
  resendPortalInvite,
  revokePortalInvite,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      producer: { select: { name: true } },
      csr: { select: { name: true } },
      contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      policies: { include: { carrier: { select: { name: true } } }, orderBy: { expirationDate: "desc" } },
      claims: { orderBy: { reportedAt: "desc" } },
      invoices: { orderBy: { issueDate: "desc" } },
      certificates: { include: { holder: { select: { name: true } } }, orderBy: { issuedAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
      activities: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 25 },
      tasks: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, orderBy: { dueDate: "asc" }, include: { assignedTo: { select: { name: true } } } },
      portalUsers: { select: { id: true, email: true, name: true, active: true, lastLoginAt: true }, orderBy: { createdAt: "asc" } },
      portalInvites: { orderBy: { createdAt: "desc" }, take: 10 },
      priorPolicies: { orderBy: { expirationDate: "asc" } },
      scheduledTouchpoints: { include: { template: { select: { name: true, category: true } } }, orderBy: { createdAt: "desc" }, take: 25 },
      commPrefs: true,
    },
  });
  if (!client) notFound();

  const [users, crossSell, healthResult] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, role: { not: "CLIENT" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    crossSellForClient(client.id),
    clientHealthFor(client.id),
  ]);
  const health = healthResult?.health ?? null;

  const activePremium = client.policies
    .filter((p) => p.status === "ACTIVE" || p.status === "BOUND")
    .reduce((acc, p) => acc + toNum(p.premium), 0);

  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {client.name}
            {health ? (
              <Badge tone={healthTierTone(health.tier)}>
                {HEALTH_TIER_LABELS[health.tier]} · {health.score}
              </Badge>
            ) : null}
          </span>
        }
        description={`${client.type === "BUSINESS" ? "Business" : "Individual"} client · ${CLIENT_STATUS_LABELS[client.status]}`}
        actions={
          <>
            <Link href={`/quotes/new?clientId=${client.id}`} className="btn">
              <Plus className="h-4 w-4" /> Quote request
            </Link>
            <Link href={`/policies/new?clientId=${client.id}`} className="btn">
              <Plus className="h-4 w-4" /> Policy
            </Link>
            <Link href={`/clients/${client.id}/edit`} className="btn-primary">
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left column: profile + contacts */}
        <div className="space-y-6">
          <div className="card-pad">
            <h2 className="section-title mb-3">Profile</h2>
            <dl className="grid grid-cols-2 gap-3">
              <DetailItem label="Email">{client.email}</DetailItem>
              <DetailItem label="Phone">{client.phone}</DetailItem>
              <DetailItem label="Address">
                {client.addressLine1
                  ? `${client.addressLine1}${client.addressLine2 ? `, ${client.addressLine2}` : ""}, ${client.city ?? ""} ${client.state ?? ""} ${client.zip ?? ""}`
                  : "—"}
              </DetailItem>
              <DetailItem label="Date of birth">{client.dateOfBirth ? fmtDate(client.dateOfBirth) : "—"}</DetailItem>
              <DetailItem label="Industry">{client.industry}</DetailItem>
              <DetailItem label="Source">{client.source}</DetailItem>
              <DetailItem label="Producer">{client.producer?.name}</DetailItem>
              <DetailItem label="CSR">{client.csr?.name}</DetailItem>
              <DetailItem label="Active premium">{fmtMoney(activePremium)}</DetailItem>
              <DetailItem label="Client since">{fmtDate(client.createdAt)}</DetailItem>
            </dl>
            {client.notes ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{client.notes}</p> : null}
          </div>

          {health ? (
            <div className="card-pad">
              <h2 className="section-title mb-3">Retention health</h2>
              <div className="flex items-center gap-3">
                <div className="text-3xl font-semibold tabular-nums text-slate-900">{health.score}</div>
                <div>
                  <Badge tone={healthTierTone(health.tier)}>{HEALTH_TIER_LABELS[health.tier]}</Badge>
                  <div className="mt-0.5 text-xs text-slate-500">0–100 health score (higher is healthier)</div>
                </div>
              </div>
              {health.factors.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  {health.factors
                    .slice()
                    .sort((a, b) => b.penalty - a.penalty)
                    .map((f) => (
                      <li key={f.label} className="flex items-center justify-between">
                        <span>{f.label}</span>
                        <span className="font-medium text-red-500">−{f.penalty}</span>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-emerald-600">No risk signals — a healthy, well-rounded account.</p>
              )}
            </div>
          ) : null}

          {crossSell.length > 0 ? (
            <div className="card-pad">
              <h2 className="section-title mb-1">Cross-sell opportunities</h2>
              <p className="mb-3 text-xs text-slate-400">Account-rounding gaps from this client&apos;s coverage + X-dates.</p>
              <ul className="space-y-2">
                {crossSell.map((s) => (
                  <li key={s.key} className="border-b border-slate-100 pb-2 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-800">{s.title}</span>
                      <span className="shrink-0 text-xs text-slate-500">≈ {fmtMoney(s.estPremium)}/yr</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{s.rationale}</p>
                    <Link
                      href={`/quotes/new?clientId=${client.id}&lineOfBusiness=${s.lob}`}
                      className="mt-1 inline-block text-xs text-navy-700 hover:underline"
                    >
                      Start a {LOB_NAMES[s.lob]} quote →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="card-pad">
            <h2 className="section-title mb-3">Contacts</h2>
            <ul className="space-y-2">
              {client.contacts.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2 text-sm last:border-0">
                  <div>
                    <div className="font-medium text-slate-800">
                      {c.name} {c.isPrimary ? <Badge tone="blue">Primary</Badge> : null}
                    </div>
                    <div className="text-xs text-slate-500">
                      {[c.title, c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <form action={deleteContact.bind(null, client.id, c.id)}>
                    <ConfirmButton message={`Remove contact "${c.name}"?`}>Remove</ConfirmButton>
                  </form>
                </li>
              ))}
              {client.contacts.length === 0 ? <li className="text-sm text-slate-400">No contacts.</li> : null}
            </ul>
            <form action={addContact.bind(null, client.id)} className="mt-4 space-y-3 border-t border-slate-100 pt-3">
              <FormGrid>
                <input name="name" placeholder="Name" required className="input" />
                <input name="title" placeholder="Title" className="input" />
                <input name="email" placeholder="Email" type="email" className="input" />
                <input name="phone" placeholder="Phone" className="input" />
              </FormGrid>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="isPrimary" /> Primary contact
              </label>
              <button type="submit" className="btn btn-sm">
                <Plus className="h-3.5 w-3.5" /> Add contact
              </button>
            </form>
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-3">Portal access</h2>
            <ul className="space-y-2">
              {client.portalUsers.map((u) => (
                <li key={u.id} className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2 text-sm last:border-0">
                  <div>
                    <div className="font-medium text-slate-800">
                      {u.email} {u.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}
                    </div>
                    <div className="text-xs text-slate-500">
                      {u.lastLoginAt ? `Last sign-in ${fmtDate(u.lastLoginAt)}` : "Never signed in"}
                    </div>
                  </div>
                  {u.active ? (
                    <form action={disablePortalUser.bind(null, client.id, u.id)}>
                      <ConfirmButton message={`Disable portal access for ${u.email}?`}>Disable</ConfirmButton>
                    </form>
                  ) : null}
                </li>
              ))}
              {client.portalInvites
                .filter((i) => inviteState(i) === "valid")
                .map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2 text-sm last:border-0">
                    <div>
                      <div className="font-medium text-slate-800">
                        {i.email} <Badge tone="amber">Invited</Badge>
                      </div>
                      <div className="text-xs text-slate-500">Expires {fmtDate(i.expiresAt)}</div>
                    </div>
                    <div className="flex gap-1.5">
                      <form action={resendPortalInvite.bind(null, client.id, i.id)}>
                        <button type="submit" className="btn btn-sm">Resend</button>
                      </form>
                      <form action={revokePortalInvite.bind(null, client.id, i.id)}>
                        <ConfirmButton message={`Revoke the portal invitation for ${i.email}?`}>Revoke</ConfirmButton>
                      </form>
                    </div>
                  </li>
                ))}
              {client.portalUsers.length === 0 && client.portalInvites.filter((i) => inviteState(i) === "valid").length === 0 ? (
                <li className="text-sm text-slate-400">No portal access yet.</li>
              ) : null}
            </ul>
            <form action={invitePortalUser.bind(null, client.id)} className="mt-4 space-y-3 border-t border-slate-100 pt-3">
              <input
                name="email"
                type="email"
                required
                placeholder="Email to invite"
                defaultValue={client.email ?? ""}
                className="input"
              />
              <button type="submit" className="btn btn-sm">
                <Plus className="h-3.5 w-3.5" /> Invite to portal
              </button>
            </form>
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-3">Open tasks</h2>
            <ul className="space-y-2">
              {client.tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-800">{t.title}</span>
                  <span className="text-xs text-slate-500">
                    {t.assignedTo?.name ?? "Unassigned"} · {fmtDate(t.dueDate)}
                  </span>
                </li>
              ))}
              {client.tasks.length === 0 ? <li className="text-sm text-slate-400">No open tasks.</li> : null}
            </ul>
            <form action={addClientTask.bind(null, client.id)} className="mt-4 space-y-3 border-t border-slate-100 pt-3">
              <input name="title" placeholder="Task title" required className="input" />
              <FormGrid>
                <Field label="Due date" required>
                  <input type="date" name="dueDate" required className="input" />
                </Field>
                <Field label="Assign to">
                  <Select name="assignedToId" allowEmpty emptyLabel="Unassigned" options={users.map((u) => ({ value: u.id, label: u.name }))} />
                </Field>
              </FormGrid>
              <button type="submit" className="btn btn-sm">
                <Plus className="h-3.5 w-3.5" /> Add task
              </button>
            </form>
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-1">X-dates (prior coverage)</h2>
            <p className="mb-3 text-xs text-slate-400">Competitor policy expirations — the cross-sell / win-back trigger.</p>
            <ul className="space-y-2">
              {client.priorPolicies.map((x) => {
                const bucket = xDateBucket(x.expirationDate);
                const tone = bucket === "OVERDUE" ? "red" : bucket === "DUE_30" ? "amber" : bucket === "DUE_60" ? "violet" : "slate";
                return (
                  <li key={x.id} className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2 text-sm last:border-0">
                    <div>
                      <div className="font-medium text-slate-800">
                        {LOB_LABELS[x.lineOfBusiness]} {x.currentCarrier ? <span className="text-slate-500">· {x.currentCarrier}</span> : null}
                      </div>
                      <div className="text-xs text-slate-500">
                        X-date {fmtDate(x.expirationDate)}
                        {x.currentPremium != null ? ` · ${fmtMoney(x.currentPremium)}/yr` : ""}
                      </div>
                      {x.notes ? <div className="mt-0.5 text-xs text-slate-400">{x.notes}</div> : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={tone}>{bucket === "OVERDUE" ? "Overdue" : fmtDate(x.expirationDate)}</Badge>
                      <form action={deletePriorPolicy.bind(null, client.id, x.id)}>
                        <ConfirmButton message="Remove this X-date?">Remove</ConfirmButton>
                      </form>
                    </div>
                  </li>
                );
              })}
              {client.priorPolicies.length === 0 ? <li className="text-sm text-slate-400">No X-dates recorded.</li> : null}
            </ul>
            <form action={addPriorPolicy.bind(null, client.id)} className="mt-4 space-y-3 border-t border-slate-100 pt-3">
              <FormGrid>
                <Field label="Line of business" required>
                  <Select
                    name="lineOfBusiness"
                    defaultValue="AUTO"
                    options={ALL_LOBS.map((l) => ({ value: l, label: `${LOB_LABELS[l]} (${lobSegment(l)})` }))}
                  />
                </Field>
                <Field label="Current carrier">
                  <input name="currentCarrier" placeholder="e.g. State Farm" className="input" />
                </Field>
                <Field label="Current premium ($/yr)">
                  <input name="currentPremium" type="number" step="0.01" min="0" className="input" />
                </Field>
                <Field label="X-date (expiration)" required>
                  <input type="date" name="expirationDate" required className="input" />
                </Field>
              </FormGrid>
              <input name="notes" placeholder="Notes (optional)" className="input" />
              <button type="submit" className="btn btn-sm">
                <Plus className="h-3.5 w-3.5" /> Add X-date
              </button>
            </form>
          </div>
        </div>

        {/* Middle/right: policies, claims, invoices, certs, docs, timeline */}
        <div className="space-y-6 xl:col-span-2">
          <div className="card-pad">
            <h2 className="section-title mb-3">Policies ({client.policies.length})</h2>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Policy #</th>
                    <th>Line</th>
                    <th>Carrier</th>
                    <th>Status</th>
                    <th>Term</th>
                    <th className="text-right">Premium</th>
                  </tr>
                </thead>
                <tbody>
                  {client.policies.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/policies/${p.id}`} className="font-medium text-navy-700 hover:underline">
                          {p.policyNumber}
                        </Link>
                      </td>
                      <td>{LOB_LABELS[p.lineOfBusiness]}</td>
                      <td>{p.carrier.name}</td>
                      <td>
                        <Badge tone={policyStatusTone(p.status)}>{POLICY_STATUS_LABELS[p.status]}</Badge>
                      </td>
                      <td className="whitespace-nowrap">
                        {fmtDate(p.effectiveDate)} – {fmtDate(p.expirationDate)}
                      </td>
                      <td className="text-right">{fmtMoney(p.premium)}</td>
                    </tr>
                  ))}
                  {client.policies.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400">
                        No policies.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="card-pad">
              <h2 className="section-title mb-3">Claims ({client.claims.length})</h2>
              <ul className="space-y-2">
                {client.claims.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <Link href={`/claims/${c.id}`} className="font-medium text-navy-700 hover:underline">
                      {c.claimNumber}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {fmtDate(c.dateOfLoss)}
                      <Badge tone={claimStatusTone(c.status)}>{CLAIM_STATUS_LABELS[c.status]}</Badge>
                    </span>
                  </li>
                ))}
                {client.claims.length === 0 ? <li className="text-sm text-slate-400">No claims.</li> : null}
              </ul>
            </div>

            <div className="card-pad">
              <h2 className="section-title mb-3">Invoices ({client.invoices.length})</h2>
              <ul className="space-y-2">
                {client.invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between text-sm">
                    <Link href={`/accounting/invoices/${inv.id}`} className="font-medium text-navy-700 hover:underline">
                      {inv.invoiceNumber}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {fmtMoneyCents(inv.amount)}
                      <Badge tone={inv.status === "PAID" ? "green" : inv.status === "VOID" ? "slate" : "amber"}>{inv.status}</Badge>
                    </span>
                  </li>
                ))}
                {client.invoices.length === 0 ? <li className="text-sm text-slate-400">No invoices.</li> : null}
              </ul>
            </div>

            <div className="card-pad">
              <h2 className="section-title mb-3">Certificates ({client.certificates.length})</h2>
              <ul className="space-y-2">
                {client.certificates.map((cert) => (
                  <li key={cert.id} className="flex items-center justify-between text-sm">
                    <Link href={`/certificates/${cert.id}`} className="font-medium text-navy-700 hover:underline">
                      {cert.certNumber}
                    </Link>
                    <span className="text-xs text-slate-500">{cert.holder.name}</span>
                  </li>
                ))}
                {client.certificates.length === 0 ? <li className="text-sm text-slate-400">No certificates.</li> : null}
              </ul>
            </div>

            <div className="card-pad">
              <h2 className="section-title mb-3">Documents ({client.documents.length})</h2>
              <ul className="space-y-2">
                {client.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between text-sm">
                    <a href={`/api/documents/${d.id}/download`} className="font-medium text-navy-700 hover:underline">
                      {d.fileName}
                    </a>
                    <span className="text-xs text-slate-500">{fmtDate(d.createdAt)}</span>
                  </li>
                ))}
                {client.documents.length === 0 ? <li className="text-sm text-slate-400">No documents.</li> : null}
              </ul>
              <Link href={`/documents?clientId=${client.id}`} className="mt-3 inline-block text-xs text-navy-700 hover:underline">
                Upload via Documents →
              </Link>
            </div>
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-3">Activity timeline</h2>
            <form action={addClientActivity.bind(null, client.id)} className="mb-4 space-y-3 border-b border-slate-100 pb-4">
              <FormGrid cols={3}>
                <Select
                  name="type"
                  options={[
                    { value: "NOTE", label: "Note" },
                    { value: "CALL", label: "Call" },
                    { value: "EMAIL", label: "Email" },
                    { value: "MEETING", label: "Meeting" },
                  ]}
                />
                <input name="subject" placeholder="Subject" required className="input sm:col-span-2" />
              </FormGrid>
              <textarea name="body" placeholder="Details (optional)" rows={2} className="input" />
              <button type="submit" className="btn btn-sm">
                <Plus className="h-3.5 w-3.5" /> Log activity
              </button>
            </form>
            <ul className="space-y-3">
              {client.activities.map((a) => (
                <li key={a.id} className="border-b border-slate-100 pb-2 text-sm last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">
                      <Badge tone="slate">{a.type}</Badge> {a.subject}
                    </span>
                    <span className="text-xs text-slate-400">{fmtDate(a.createdAt)}</span>
                  </div>
                  {a.body ? <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{a.body}</p> : null}
                  <div className="text-xs text-slate-400">{a.user.name}</div>
                </li>
              ))}
              {client.activities.length === 0 ? <li className="text-sm text-slate-400">No activity yet.</li> : null}
            </ul>
          </div>

          {/* Communication timeline (lifecycle touchpoints) */}
          <div className="card-pad">
            <h2 className="section-title mb-1">Communication timeline</h2>
            <p className="mb-3 text-xs text-slate-400">Proactive appreciation + anticipatory touchpoints — scheduled, sent, skipped.</p>
            <ul className="space-y-2">
              {client.scheduledTouchpoints.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2 text-sm last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800">
                      <Badge tone={touchpointCategoryTone(t.template.category)}>{TOUCHPOINT_CATEGORY_LABELS[t.template.category]}</Badge>{" "}
                      {t.template.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t.sentAt ? `Sent ${fmtDate(t.sentAt)}` : `Scheduled ${fmtDate(t.scheduledFor)}`}
                      {t.failureReason ? ` · ${t.failureReason}` : ""}
                    </div>
                  </div>
                  <Badge tone={touchpointStatusTone(t.status)}>{TOUCHPOINT_STATUS_LABELS[t.status]}</Badge>
                </li>
              ))}
              {client.scheduledTouchpoints.length === 0 ? (
                <li className="text-sm text-slate-400">No communications yet.</li>
              ) : null}
            </ul>
          </div>

          {/* Communication preferences (opt-outs / DNC / channel / quiet hours) */}
          <div className="card-pad">
            <h2 className="section-title mb-1">Communication preferences</h2>
            <p className="mb-3 text-xs text-slate-400">Honored by the engine at send time (CAN-SPAM). Do-not-contact blocks everything except legally-required notices.</p>
            <form action={updateClientCommPrefs.bind(null, client.id)} className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-red-600">
                <input type="checkbox" name="doNotContact" defaultChecked={client.commPrefs?.doNotContact ?? false} /> Do not contact
              </label>
              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-sm text-slate-600">
                {([
                  ["optOnboarding", "Onboarding"],
                  ["optRenewal", "Renewal"],
                  ["optPayment", "Payment"],
                  ["optClaim", "Claim"],
                  ["optAppreciation", "Appreciation"],
                  ["optSatisfaction", "Satisfaction"],
                  ["optOffboarding", "Offboarding"],
                ] as const).map(([name, label]) => (
                  <label key={name} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name={name}
                      defaultChecked={(client.commPrefs?.[name] as boolean | undefined) ?? true}
                    />{" "}
                    {label}
                  </label>
                ))}
              </div>
              <FormGrid cols={3}>
                <Field label="Channel">
                  <Select
                    name="preferredChannel"
                    defaultValue={client.commPrefs?.preferredChannel ?? "EMAIL"}
                    options={[{ value: "EMAIL", label: "Email" }, { value: "SMS", label: "SMS (dormant)" }]}
                  />
                </Field>
                <Field label="Quiet from (hr)">
                  <input name="quietHoursStart" type="number" min="0" max="23" defaultValue={client.commPrefs?.quietHoursStart ?? 8} className="input" />
                </Field>
                <Field label="Quiet until (hr)">
                  <input name="quietHoursEnd" type="number" min="0" max="24" defaultValue={client.commPrefs?.quietHoursEnd ?? 20} className="input" />
                </Field>
              </FormGrid>
              <button type="submit" className="btn btn-sm">Save preferences</button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
