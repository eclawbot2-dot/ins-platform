"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClientUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStr, fStrOpt, fDate, fEnum } from "@/lib/form";
import { validateFnol } from "@/lib/domain/fnol";
import { portalPolicyWhere } from "@/lib/domain/portal-scope";
import { nextRefNumber, REF_PREFIXES } from "@/lib/domain/numbers";
import { addDays } from "@/lib/domain/dates";
import { ENDORSEMENT_REQUEST_TYPE_LABELS } from "@/lib/labels";
import type { EndorsementRequestType } from "@prisma/client";

const ER_TYPES = Object.keys(ENDORSEMENT_REQUEST_TYPE_LABELS) as EndorsementRequestType[];

/**
 * Portal server actions. EVERY action re-derives the clientId from the
 * session (requireClientUser) and scopes its queries with it — ids
 * arriving in the form body are validated against that scope, never
 * trusted.
 */

async function staffAssigneeFor(clientId: string): Promise<string | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { csrId: true, producerId: true },
  });
  if (client?.csrId) return client.csrId;
  if (client?.producerId) return client.producerId;
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return admin?.id ?? null;
}

/** FNOL from the portal — creates a REPORTED claim + staff follow-up task. */
export async function portalSubmitClaim(formData: FormData) {
  const session = await requireClientUser();
  const clientId = session.clientId;

  // Owned-policy list comes from a clientId-scoped query; the form's
  // policyId must be in it (validateFnol) or the submission is rejected.
  const ownedPolicies = await prisma.policy.findMany({
    where: portalPolicyWhere(clientId),
    select: { id: true, policyNumber: true, csrId: true, producerId: true, client: { select: { name: true } } },
  });
  const result = validateFnol(
    {
      policyId: fStr(formData, "policyId"),
      dateOfLoss: fDate(formData, "dateOfLoss"),
      description: fStr(formData, "description"),
    },
    ownedPolicies.map((p) => p.id),
  );
  if (!result.ok) {
    redirect(`/portal/claims/new?toastError=${encodeURIComponent(result.error)}`);
  }

  const policy = ownedPolicies.find((p) => p.id === result.value.policyId)!;
  const phone = fStrOpt(formData, "phone");

  const existing = await prisma.claim.findMany({ select: { claimNumber: true } });
  const claimNumber = nextRefNumber(REF_PREFIXES.claim, existing.map((c) => c.claimNumber));

  const claim = await prisma.claim.create({
    data: {
      claimNumber,
      policyId: policy.id,
      clientId,
      status: "REPORTED",
      dateOfLoss: result.value.dateOfLoss,
      description: result.value.description,
    },
  });

  await prisma.task.create({
    data: {
      title: `Portal FNOL: ${claimNumber} (${policy.client.name})`,
      detail: [
        `Reported via client portal by ${session.user?.email ?? "client user"}.`,
        phone ? `Callback phone: ${phone}` : null,
        `Policy: ${policy.policyNumber}`,
      ]
        .filter(Boolean)
        .join("\n"),
      dueDate: addDays(new Date(), 1),
      priority: "HIGH",
      claimId: claim.id,
      clientId,
      assignedToId: policy.csrId ?? policy.producerId,
    },
  });
  await audit({
    userId: session.userId,
    action: "PORTAL_CLAIM_FNOL",
    entityType: "Claim",
    entityId: claim.id,
    detail: claimNumber,
  });

  redirect(`/portal/claims?toast=${encodeURIComponent(`Claim ${claimNumber} reported — we'll be in touch shortly`)}`);
}

/** Certificate (COI) request — creates a staff task with holder details. */
export async function portalRequestCertificate(formData: FormData) {
  const session = await requireClientUser();
  const clientId = session.clientId;

  const holderName = fStr(formData, "holderName");
  if (!holderName) {
    redirect(`/portal/certificates?toastError=${encodeURIComponent("Enter the certificate holder's name")}`);
  }

  // Optional policy reference — only honored if the client owns it.
  const policyId = fStrOpt(formData, "policyId");
  const policy = policyId
    ? await prisma.policy.findFirst({ where: { id: policyId, ...portalPolicyWhere(clientId) }, select: { id: true, policyNumber: true } })
    : null;

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  const detail = [
    `Requested via client portal by ${session.user?.email ?? "client user"}.`,
    `Holder: ${holderName}`,
    fStrOpt(formData, "holderAddress") ? `Address: ${fStr(formData, "holderAddress")}` : null,
    fStrOpt(formData, "holderEmail") ? `Holder email: ${fStr(formData, "holderEmail")}` : null,
    policy ? `Policy: ${policy.policyNumber}` : null,
    fStrOpt(formData, "operations") ? `Description of operations: ${fStr(formData, "operations")}` : null,
    fStrOpt(formData, "additionalInsured") ? "Additional insured requested" : null,
  ]
    .filter(Boolean)
    .join("\n");

  const task = await prisma.task.create({
    data: {
      title: `Portal COI request: ${holderName} (${client?.name ?? "client"})`,
      detail,
      dueDate: addDays(new Date(), 1),
      priority: "HIGH",
      clientId,
      policyId: policy?.id ?? null,
      assignedToId: await staffAssigneeFor(clientId),
    },
  });
  await audit({
    userId: session.userId,
    action: "PORTAL_COI_REQUEST",
    entityType: "Task",
    entityId: task.id,
    detail: holderName,
  });

  redirect(`/portal/certificates?toast=${encodeURIComponent("Certificate request sent — we'll email it to the holder shortly")}`);
}

/** Profile-change request — message → staff task (no direct data edits). */
export async function portalRequestProfileChange(formData: FormData) {
  const session = await requireClientUser();
  const clientId = session.clientId;

  const message = fStr(formData, "message");
  if (message.length < 5) {
    redirect(`/portal/profile?toastError=${encodeURIComponent("Tell us what needs to change")}`);
  }

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  const task = await prisma.task.create({
    data: {
      title: `Portal profile change: ${client?.name ?? "client"}`,
      detail: `Requested via client portal by ${session.user?.email ?? "client user"}.\n\n${message}`,
      dueDate: addDays(new Date(), 2),
      priority: "NORMAL",
      clientId,
      assignedToId: await staffAssigneeFor(clientId),
    },
  });
  await audit({
    userId: session.userId,
    action: "PORTAL_PROFILE_CHANGE_REQUEST",
    entityType: "Task",
    entityId: task.id,
  });

  redirect(`/portal/profile?toast=${encodeURIComponent("Request sent — we'll confirm once it's updated")}`);
}

/**
 * Structured endorsement request from the portal. Scoped to the client's
 * OWN policy (re-derived from the session); creates an EndorsementRequest
 * (source PORTAL) plus a staff follow-up task. Replaces the old free-text
 * "send us a request" note for policy changes.
 */
export async function portalRequestEndorsement(policyId: string, formData: FormData) {
  const session = await requireClientUser();
  const clientId = session.clientId;

  const policy = await prisma.policy.findFirst({
    where: { id: policyId, ...portalPolicyWhere(clientId) },
    select: { id: true, policyNumber: true, csrId: true, producerId: true, client: { select: { name: true } } },
  });
  if (!policy) {
    redirect(`/portal/policies?toastError=${encodeURIComponent("Policy not found")}`);
  }

  const summary = fStr(formData, "summary");
  if (summary.length < 5) {
    redirect(`/portal/policies/${policyId}?toastError=${encodeURIComponent("Tell us what change you need")}`);
  }
  const requestType = fEnum(formData, "requestType", ER_TYPES, "OTHER");

  const req = await prisma.endorsementRequest.create({
    data: {
      policyId: policy.id,
      requestType,
      summary,
      effectiveDate: fDate(formData, "effectiveDate"),
      source: "PORTAL",
      status: "REQUESTED",
      requestedById: session.userId,
    },
  });
  await prisma.task.create({
    data: {
      title: `Portal endorsement request: ${ENDORSEMENT_REQUEST_TYPE_LABELS[requestType]} (${policy.client.name})`,
      detail: [
        `Requested via client portal by ${session.user?.email ?? "client user"}.`,
        `Policy: ${policy.policyNumber}`,
        `Change: ${summary}`,
      ].join("\n"),
      dueDate: addDays(new Date(), 1),
      priority: "HIGH",
      policyId: policy.id,
      clientId,
      assignedToId: policy.csrId ?? policy.producerId,
    },
  });
  await audit({
    userId: session.userId,
    action: "PORTAL_ENDORSEMENT_REQUEST",
    entityType: "EndorsementRequest",
    entityId: req.id,
    detail: summary,
  });

  redirect(`/portal/policies/${policyId}?toast=${encodeURIComponent("Change request sent — we'll review and confirm shortly")}`);
}
