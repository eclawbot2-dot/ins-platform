import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightCircle, Plus, UserCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, DetailItem } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { FormGrid, Select } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { LEAD_STATUS_LABELS, LOB_LABELS, leadStatusTone } from "@/lib/labels";
import { leadGrade } from "@/lib/domain/lead-scoring";
import { fmtDate } from "@/lib/domain/dates";
import { addLeadActivity, convertLead, setLeadStatus } from "../actions";
import { LeadForm } from "../lead-form";
import { updateLead } from "../actions";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { name: true } },
      campaign: { select: { name: true } },
      client: { select: { id: true, name: true } },
      activities: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      tasks: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, orderBy: { dueDate: "asc" } },
      quoteRequests: { select: { id: true, lineOfBusiness: true, status: true } },
    },
  });
  if (!lead) notFound();

  const [users, campaigns] = await Promise.all([
    prisma.user.findMany({ where: { active: true, role: { not: "CLIENT" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.campaign.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title={`${lead.firstName} ${lead.lastName}`}
        description={
          <>
            Lead · <Badge tone={leadStatusTone(lead.status)}>{LEAD_STATUS_LABELS[lead.status]}</Badge>{" "}
            <Badge tone={lead.score >= 70 ? "green" : lead.score >= 50 ? "blue" : "slate"}>
              Score {lead.score} ({leadGrade(lead.score)})
            </Badge>
          </>
        }
        actions={
          <>
            {lead.status !== "CONVERTED" && !lead.clientId ? (
              <form action={convertLead.bind(null, lead.id)}>
                <button type="submit" className="btn-primary">
                  <UserCheck className="h-4 w-4" /> Convert to client
                </button>
              </form>
            ) : lead.client ? (
              <Link href={`/clients/${lead.client.id}`} className="btn">
                <ArrowRightCircle className="h-4 w-4" /> View client {lead.client.name}
              </Link>
            ) : null}
            {lead.status !== "LOST" && lead.status !== "CONVERTED" ? (
              <form action={setLeadStatus.bind(null, lead.id, "LOST")}>
                <ConfirmButton className="btn-danger" message="Mark this lead as lost?">
                  Mark lost
                </ConfirmButton>
              </form>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <div className="card-pad">
            <h2 className="section-title mb-3">Details</h2>
            <dl className="grid grid-cols-2 gap-3">
              <DetailItem label="Email">{lead.email}</DetailItem>
              <DetailItem label="Phone">{lead.phone}</DetailItem>
              <DetailItem label="ZIP">{lead.zip}</DetailItem>
              <DetailItem label="Line of business">{lead.lineOfBusiness ? LOB_LABELS[lead.lineOfBusiness] : "—"}</DetailItem>
              <DetailItem label="Source">{lead.source}</DetailItem>
              <DetailItem label="Campaign">{lead.campaign?.name}</DetailItem>
              <DetailItem label="Assigned to">{lead.assignedTo?.name}</DetailItem>
              <DetailItem label="Created">{fmtDate(lead.createdAt)}</DetailItem>
            </dl>
            {lead.message ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{lead.message}</p> : null}
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-3">Activity</h2>
            <form action={addLeadActivity.bind(null, lead.id)} className="mb-4 space-y-3 border-b border-slate-100 pb-4">
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
              {lead.activities.map((a) => (
                <li key={a.id} className="border-b border-slate-100 pb-2 text-sm last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">
                      <Badge tone="slate">{a.type}</Badge> {a.subject}
                    </span>
                    <span className="text-xs text-slate-400">{fmtDate(a.createdAt)}</span>
                  </div>
                  {a.body ? <p className="mt-1 text-xs text-slate-500">{a.body}</p> : null}
                </li>
              ))}
              {lead.activities.length === 0 ? <li className="text-sm text-slate-400">No activity yet.</li> : null}
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card-pad">
            <h2 className="section-title mb-3">Edit lead</h2>
          </div>
          <LeadForm lead={lead} users={users} campaigns={campaigns} action={updateLead.bind(null, lead.id)} submitLabel="Save changes" />
        </div>
      </div>
    </>
  );
}
