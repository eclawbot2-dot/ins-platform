"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStr, fStrOpt, fNumOpt, fDate } from "@/lib/form";
import { nextRefNumber, REF_PREFIXES } from "@/lib/domain/numbers";
import { addDays } from "@/lib/domain/dates";
import type { ClaimStatus } from "@prisma/client";

/** FNOL — first notice of loss. */
export async function createClaim(formData: FormData) {
  const session = await requireSession();
  const policyId = fStr(formData, "policyId");
  const policy = await prisma.policy.findUnique({ where: { id: policyId }, include: { client: true } });
  if (!policy) redirect(`/claims/new?toastError=${encodeURIComponent("Select a valid policy")}`);

  const existing = await prisma.claim.findMany({ select: { claimNumber: true } });
  const claimNumber = nextRefNumber(REF_PREFIXES.claim, existing.map((c) => c.claimNumber));

  const claim = await prisma.claim.create({
    data: {
      claimNumber,
      policyId,
      clientId: policy.clientId,
      carrierClaimRef: fStrOpt(formData, "carrierClaimRef"),
      dateOfLoss: fDate(formData, "dateOfLoss") ?? new Date(),
      description: fStr(formData, "description") || "Loss reported",
      adjusterName: fStrOpt(formData, "adjusterName"),
      adjusterPhone: fStrOpt(formData, "adjusterPhone"),
      adjusterEmail: fStrOpt(formData, "adjusterEmail"),
      reserveAmount: fNumOpt(formData, "reserveAmount"),
    },
  });

  // FNOL follow-up task.
  await prisma.task.create({
    data: {
      title: `Claim follow-up: ${claimNumber} (${policy.client.name})`,
      dueDate: addDays(new Date(), 3),
      priority: "HIGH",
      claimId: claim.id,
      clientId: policy.clientId,
      assignedToId: policy.csrId ?? policy.producerId,
      createdById: session.userId,
    },
  });
  await audit({ userId: session.userId, action: "CLAIM_FNOL", entityType: "Claim", entityId: claim.id, detail: claimNumber });
  redirect(`/claims/${claim.id}?toast=${encodeURIComponent(`Claim ${claimNumber} reported`)}`);
}

export async function updateClaim(id: string, formData: FormData) {
  await requireSession();
  await prisma.claim.update({
    where: { id },
    data: {
      carrierClaimRef: fStrOpt(formData, "carrierClaimRef"),
      description: fStr(formData, "description") || undefined,
      adjusterName: fStrOpt(formData, "adjusterName"),
      adjusterPhone: fStrOpt(formData, "adjusterPhone"),
      adjusterEmail: fStrOpt(formData, "adjusterEmail"),
      reserveAmount: fNumOpt(formData, "reserveAmount"),
      paidAmount: fNumOpt(formData, "paidAmount"),
    },
  });
  revalidatePath(`/claims/${id}`);
  redirect(`/claims/${id}?toast=${encodeURIComponent("Claim updated")}`);
}

export async function setClaimStatus(id: string, status: ClaimStatus) {
  const session = await requireSession();
  await prisma.claim.update({
    where: { id },
    data: { status, closedAt: status === "CLOSED" ? new Date() : null },
  });
  await audit({ userId: session.userId, action: "CLAIM_STATUS", entityType: "Claim", entityId: id, detail: status });
  revalidatePath(`/claims/${id}`);
  redirect(`/claims/${id}?toast=${encodeURIComponent(`Status: ${status.replace(/_/g, " ").toLowerCase()}`)}`);
}

export async function addClaimNote(id: string, formData: FormData) {
  const session = await requireSession();
  await prisma.activity.create({
    data: {
      claimId: id,
      userId: session.userId,
      type: "NOTE",
      subject: fStr(formData, "subject") || "Claim note",
      body: fStrOpt(formData, "body"),
    },
  });
  revalidatePath(`/claims/${id}`);
  redirect(`/claims/${id}?toast=${encodeURIComponent("Note added")}`);
}

export async function addClaimTask(id: string, formData: FormData) {
  const session = await requireSession();
  const claim = await prisma.claim.findUnique({ where: { id }, select: { clientId: true } });
  await prisma.task.create({
    data: {
      claimId: id,
      clientId: claim?.clientId,
      title: fStr(formData, "title") || "Claim follow-up",
      dueDate: fDate(formData, "dueDate") ?? addDays(new Date(), 7),
      priority: "NORMAL",
      assignedToId: fStrOpt(formData, "assignedToId"),
      createdById: session.userId,
    },
  });
  revalidatePath(`/claims/${id}`);
  redirect(`/claims/${id}?toast=${encodeURIComponent("Task created")}`);
}
