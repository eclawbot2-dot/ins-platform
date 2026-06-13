"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStr, fStrOpt, fNum, fNumOpt, fDate, fEnum, fBool } from "@/lib/form";
import { addYears } from "@/lib/domain/dates";
import type { GroupPlanType, RateBasis } from "@prisma/client";

const PLAN_TYPES: GroupPlanType[] = [
  "GROUP_HEALTH",
  "GROUP_DENTAL",
  "GROUP_VISION",
  "GROUP_LIFE",
  "GROUP_DISABILITY",
  "GROUP_ACCIDENT",
  "OTHER",
];
const RATE_BASES: RateBasis[] = ["PEPM", "PMPM", "COMPOSITE", "AGE_BANDED", "OTHER"];

function planDataFrom(formData: FormData) {
  const effectiveDate = fDate(formData, "effectiveDate") ?? new Date();
  return {
    planType: fEnum(formData, "planType", PLAN_TYPES, "GROUP_HEALTH"),
    planName: fStr(formData, "planName") || "Group plan",
    carrierName: fStrOpt(formData, "carrierName"),
    groupNumber: fStrOpt(formData, "groupNumber"),
    effectiveDate,
    renewalDate: fDate(formData, "renewalDate") ?? addYears(effectiveDate, 1),
    eligibleCount: Math.max(0, Math.round(fNum(formData, "eligibleCount", 0))),
    enrolledCount: Math.max(0, Math.round(fNum(formData, "enrolledCount", 0))),
    rateBasis: fEnum(formData, "rateBasis", RATE_BASES, "PEPM"),
    monthlyPremium: fNumOpt(formData, "monthlyPremium"),
    notes: fStrOpt(formData, "notes"),
    active: fBool(formData, "active"),
  };
}

export async function createGroupPlan(clientId: string, formData: FormData) {
  const session = await requireSession();
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) redirect(`/benefits?toastError=${encodeURIComponent("Employer client not found")}`);

  const plan = await prisma.groupPlan.create({ data: { clientId, ...planDataFrom(formData) } });
  // Flag the employer as a benefits client.
  await prisma.client.update({ where: { id: clientId }, data: { hasBenefits: true } });
  await audit({ userId: session.userId, action: "GROUP_PLAN_CREATE", entityType: "GroupPlan", entityId: plan.id, detail: plan.planName });
  redirect(`/benefits/${plan.id}?toast=${encodeURIComponent("Group plan created")}`);
}

export async function updateGroupPlan(id: string, formData: FormData) {
  const session = await requireSession();
  await prisma.groupPlan.update({ where: { id }, data: planDataFrom(formData) });
  await audit({ userId: session.userId, action: "GROUP_PLAN_UPDATE", entityType: "GroupPlan", entityId: id });
  revalidatePath(`/benefits/${id}`);
  redirect(`/benefits/${id}?toast=${encodeURIComponent("Group plan updated")}`);
}

export async function deleteGroupPlan(id: string) {
  const session = await requireSession();
  const plan = await prisma.groupPlan.findUnique({ where: { id }, select: { clientId: true } });
  await prisma.groupPlan.delete({ where: { id } });
  // Clear the benefits flag if the employer has no remaining plans.
  if (plan) {
    const remaining = await prisma.groupPlan.count({ where: { clientId: plan.clientId } });
    if (remaining === 0) await prisma.client.update({ where: { id: plan.clientId }, data: { hasBenefits: false } });
  }
  await audit({ userId: session.userId, action: "GROUP_PLAN_DELETE", entityType: "GroupPlan", entityId: id });
  redirect(`/benefits?toast=${encodeURIComponent("Group plan removed")}`);
}
