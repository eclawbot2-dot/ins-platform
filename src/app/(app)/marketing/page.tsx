import Link from "next/link";
import { Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { fmtMoney, fmtMoneyCents } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";
import { humanize } from "@/lib/labels";
import { leadRoi } from "@/lib/reports/lead-roi";
import { addReferral, createCampaign, deleteCampaign, deleteReferral } from "./actions";

export const metadata = { title: "Marketing" };
export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const [roi, campaigns, referrals, clients, leads] = await Promise.all([
    leadRoi(),
    prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, include: { leads: { select: { id: true } } } }),
    prisma.referral.findMany({
      orderBy: { createdAt: "desc" },
      include: { client: { select: { id: true, name: true } }, lead: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.lead.findMany({ select: { id: true, firstName: true, lastName: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const campaignPerf = new Map(roi.campaigns.map((c) => [c.campaignId, c]));

  return (
    <>
      <PageHeader
        title="Marketing"
        description="Campaigns, lead-source ROI, and referral tracking."
        actions={
          <a href="/api/reports/lead-roi" className="btn">
            <Download className="h-4 w-4" /> Export source ROI CSV
          </a>
        }
      />

      {/* ── Lead-source ROI ───────────────────────────────────────── */}
      <h2 className="section-title mb-3">Lead-source ROI</h2>
      <div className="card mb-8 overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Source</th>
              <th className="text-right">Leads</th>
              <th className="text-right">Converted</th>
              <th className="text-right">Conversion</th>
              <th className="text-right">Bound premium</th>
              <th className="text-right">Premium / lead</th>
            </tr>
          </thead>
          <tbody>
            {roi.sources.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-slate-400">No leads yet.</td>
              </tr>
            ) : (
              roi.sources.map((s) => (
                <tr key={s.source}>
                  <td className="font-medium capitalize">{s.source}</td>
                  <td className="text-right">{s.leads}</td>
                  <td className="text-right">{s.converted}</td>
                  <td className="text-right">{s.conversionPct}%</td>
                  <td className="text-right">{fmtMoney(s.boundPremium)}</td>
                  <td className="text-right">{fmtMoney(s.premiumPerLead)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Campaigns ─────────────────────────────────────────────── */}
      <h2 className="section-title mb-3">Campaigns</h2>
      <div className="card mb-4 overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Channel</th>
              <th>Dates</th>
              <th className="text-right">Budget</th>
              <th className="text-right">Leads</th>
              <th className="text-right">Converted</th>
              <th className="text-right">Bound premium</th>
              <th className="text-right">Premium / $</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-sm text-slate-400">No campaigns yet — create one below.</td>
              </tr>
            ) : (
              campaigns.map((c) => {
                const perf = campaignPerf.get(c.id);
                return (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}</td>
                    <td><Badge tone="slate">{humanize(c.channel)}</Badge></td>
                    <td className="text-xs">
                      {c.startDate ? fmtDate(c.startDate) : "—"} – {c.endDate ? fmtDate(c.endDate) : "open"}
                    </td>
                    <td className="text-right">{c.budget ? fmtMoney(c.budget) : "—"}</td>
                    <td className="text-right">{perf?.leads ?? c.leads.length}</td>
                    <td className="text-right">{perf?.converted ?? 0}</td>
                    <td className="text-right">{fmtMoney(perf?.boundPremium ?? 0)}</td>
                    <td className="text-right">{perf?.premiumPerDollar != null ? `${perf.premiumPerDollar}x` : "—"}</td>
                    <td className="text-right">
                      <form action={deleteCampaign.bind(null, c.id)}>
                        <button type="submit" className="btn btn-sm">Delete</button>
                      </form>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="card-pad mb-8 max-w-3xl">
        <h3 className="section-title mb-3">New campaign</h3>
        <form action={createCampaign} className="space-y-4">
          <FormGrid cols={3}>
            <Field label="Name" required>
              <input name="name" required className="input" />
            </Field>
            <Field label="Channel">
              <Select
                name="channel"
                options={["REFERRAL", "WEB", "SOCIAL", "EMAIL", "DIRECT_MAIL", "EVENT", "PAID_SEARCH", "OTHER"].map((c) => ({
                  value: c,
                  label: humanize(c),
                }))}
              />
            </Field>
            <Field label="Budget ($)">
              <input name="budget" type="number" step="0.01" className="input" />
            </Field>
            <Field label="Start">
              <input name="startDate" type="date" className="input" />
            </Field>
            <Field label="End">
              <input name="endDate" type="date" className="input" />
            </Field>
            <Field label="Notes">
              <input name="notes" className="input" />
            </Field>
          </FormGrid>
          <button type="submit" className="btn-primary">Create campaign</button>
        </form>
      </div>

      {/* ── Referrals ─────────────────────────────────────────────── */}
      <h2 className="section-title mb-3">Referrals</h2>
      <div className="card mb-4 overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Referrer</th>
              <th>Referred</th>
              <th className="text-right">Reward</th>
              <th>Recorded</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {referrals.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-slate-400">No referrals tracked yet.</td>
              </tr>
            ) : (
              referrals.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.referrerName}</td>
                  <td>
                    {r.client ? (
                      <Link href={`/clients/${r.client.id}`} className="text-indigo-700 hover:underline">
                        {r.client.name}
                      </Link>
                    ) : r.lead ? (
                      <Link href={`/leads/${r.lead.id}`} className="text-indigo-700 hover:underline">
                        {r.lead.firstName} {r.lead.lastName} (lead)
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-right">{r.rewardAmount ? fmtMoneyCents(r.rewardAmount) : "—"}</td>
                  <td>{fmtDate(r.createdAt)}</td>
                  <td className="text-xs text-slate-500">{r.notes ?? "—"}</td>
                  <td className="text-right">
                    <form action={deleteReferral.bind(null, r.id)}>
                      <button type="submit" className="btn btn-sm">Remove</button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="card-pad max-w-3xl">
        <h3 className="section-title mb-3">Record referral</h3>
        <form action={addReferral} className="space-y-4">
          <FormGrid cols={3}>
            <Field label="Referrer name" required>
              <input name="referrerName" required className="input" />
            </Field>
            <Field label="Referred client">
              <Select name="clientId" allowEmpty options={clients.map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
            <Field label="Referred lead">
              <Select
                name="leadId"
                allowEmpty
                options={leads.map((l) => ({ value: l.id, label: `${l.firstName} ${l.lastName}` }))}
              />
            </Field>
            <Field label="Reward ($)">
              <input name="rewardAmount" type="number" step="0.01" className="input" />
            </Field>
            <Field label="Notes">
              <input name="notes" className="input" />
            </Field>
          </FormGrid>
          <button type="submit" className="btn-primary">Record referral</button>
        </form>
      </div>
    </>
  );
}
