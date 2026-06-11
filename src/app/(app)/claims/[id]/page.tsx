import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, DetailItem } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { CLAIM_STATUS_LABELS, LOB_LABELS, claimStatusTone } from "@/lib/labels";
import { fmtMoneyCents, toNum } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";
import { addClaimNote, addClaimTask, setClaimStatus, updateClaim } from "../actions";
import type { ClaimStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Allowed transitions from each status (the agency-side workflow). */
const NEXT: Record<ClaimStatus, ClaimStatus[]> = {
  REPORTED: ["OPEN", "CLOSED"],
  OPEN: ["UNDER_REVIEW", "CLOSED"],
  UNDER_REVIEW: ["APPROVED", "DENIED"],
  APPROVED: ["CLOSED"],
  DENIED: ["CLOSED", "UNDER_REVIEW"],
  CLOSED: ["OPEN"],
};

export default async function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claim = await prisma.claim.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      policy: { include: { carrier: { select: { name: true } } } },
      activities: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      tasks: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, orderBy: { dueDate: "asc" }, include: { assignedTo: { select: { name: true } } } },
      documents: true,
    },
  });
  if (!claim) notFound();

  const users = await prisma.user.findMany({ where: { active: true, role: { not: "CLIENT" } }, select: { id: true, name: true }, orderBy: { name: "asc" } });

  return (
    <>
      <PageHeader
        title={
          <>
            {claim.claimNumber} <Badge tone={claimStatusTone(claim.status)}>{CLAIM_STATUS_LABELS[claim.status]}</Badge>
          </>
        }
        description={`${claim.client.name} · ${claim.policy.policyNumber} (${LOB_LABELS[claim.policy.lineOfBusiness]}, ${claim.policy.carrier.name})`}
        actions={
          <div className="flex gap-2">
            {NEXT[claim.status].map((next) => (
              <form key={next} action={setClaimStatus.bind(null, claim.id, next)}>
                {next === "DENIED" || next === "CLOSED" ? (
                  <ConfirmButton
                    className={next === "DENIED" ? "btn-danger" : "btn"}
                    message={`Move this claim to ${CLAIM_STATUS_LABELS[next]}?`}
                  >
                    → {CLAIM_STATUS_LABELS[next]}
                  </ConfirmButton>
                ) : (
                  <button type="submit" className="btn">
                    → {CLAIM_STATUS_LABELS[next]}
                  </button>
                )}
              </form>
            ))}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <div className="card-pad">
            <h2 className="section-title mb-3">Claim details</h2>
            <dl className="grid grid-cols-2 gap-3">
              <DetailItem label="Client">
                <Link href={`/clients/${claim.client.id}`} className="text-navy-700 hover:underline">
                  {claim.client.name}
                </Link>
              </DetailItem>
              <DetailItem label="Policy">
                <Link href={`/policies/${claim.policy.id}`} className="text-navy-700 hover:underline">
                  {claim.policy.policyNumber}
                </Link>
              </DetailItem>
              <DetailItem label="Date of loss">{fmtDate(claim.dateOfLoss)}</DetailItem>
              <DetailItem label="Reported">{fmtDate(claim.reportedAt)}</DetailItem>
              <DetailItem label="Carrier claim ref">{claim.carrierClaimRef}</DetailItem>
              <DetailItem label="Closed">{claim.closedAt ? fmtDate(claim.closedAt) : "—"}</DetailItem>
              <DetailItem label="Reserve">{claim.reserveAmount ? fmtMoneyCents(claim.reserveAmount) : "—"}</DetailItem>
              <DetailItem label="Paid">{claim.paidAmount ? fmtMoneyCents(claim.paidAmount) : "—"}</DetailItem>
            </dl>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{claim.description}</p>
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-3">Update claim</h2>
            <form action={updateClaim.bind(null, claim.id)} className="space-y-4">
              <Field label="Description">
                <textarea name="description" defaultValue={claim.description} rows={2} className="input" />
              </Field>
              <FormGrid cols={3}>
                <Field label="Carrier claim ref">
                  <input name="carrierClaimRef" defaultValue={claim.carrierClaimRef ?? ""} className="input" />
                </Field>
                <Field label="Reserve ($)">
                  <input name="reserveAmount" type="number" step="0.01" defaultValue={claim.reserveAmount ? toNum(claim.reserveAmount) : ""} className="input" />
                </Field>
                <Field label="Paid ($)">
                  <input name="paidAmount" type="number" step="0.01" defaultValue={claim.paidAmount ? toNum(claim.paidAmount) : ""} className="input" />
                </Field>
                <Field label="Adjuster name">
                  <input name="adjusterName" defaultValue={claim.adjusterName ?? ""} className="input" />
                </Field>
                <Field label="Adjuster phone">
                  <input name="adjusterPhone" defaultValue={claim.adjusterPhone ?? ""} className="input" />
                </Field>
                <Field label="Adjuster email">
                  <input name="adjusterEmail" defaultValue={claim.adjusterEmail ?? ""} className="input" />
                </Field>
              </FormGrid>
              <button type="submit" className="btn-primary">
                Save claim
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card-pad">
            <h2 className="section-title mb-3">Follow-up tasks</h2>
            <ul className="mb-4 space-y-2">
              {claim.tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between text-sm">
                  <span>{t.title}</span>
                  <span className="text-xs text-slate-500">
                    {t.assignedTo?.name ?? "Unassigned"} · {fmtDate(t.dueDate)}
                  </span>
                </li>
              ))}
              {claim.tasks.length === 0 ? <li className="text-sm text-slate-400">No open tasks.</li> : null}
            </ul>
            <form action={addClaimTask.bind(null, claim.id)} className="space-y-3 border-t border-slate-100 pt-3">
              <input name="title" placeholder="Task title" required className="input" />
              <FormGrid>
                <Field label="Due date">
                  <input type="date" name="dueDate" className="input" />
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
            <h2 className="section-title mb-3">Notes</h2>
            <form action={addClaimNote.bind(null, claim.id)} className="mb-4 space-y-3 border-b border-slate-100 pb-4">
              <input name="subject" placeholder="Subject" required className="input" />
              <textarea name="body" placeholder="Details" rows={2} className="input" />
              <button type="submit" className="btn btn-sm">
                <Plus className="h-3.5 w-3.5" /> Add note
              </button>
            </form>
            <ul className="space-y-3">
              {claim.activities.map((a) => (
                <li key={a.id} className="border-b border-slate-100 pb-2 text-sm last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{a.subject}</span>
                    <span className="text-xs text-slate-400">{fmtDate(a.createdAt)}</span>
                  </div>
                  {a.body ? <p className="mt-1 text-xs text-slate-500">{a.body}</p> : null}
                  <div className="text-xs text-slate-400">{a.user.name}</div>
                </li>
              ))}
              {claim.activities.length === 0 ? <li className="text-sm text-slate-400">No notes.</li> : null}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
