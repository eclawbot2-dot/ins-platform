"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStr, fStrOpt, fNum, fDate, fEnum, fBool } from "@/lib/form";
import { expectedCommission, validateSplits } from "@/lib/domain/commissions";
import { proRataReturn, shortRateReturn, prorateEndorsement } from "@/lib/domain/proration";
import { addYears } from "@/lib/domain/dates";
import { ALL_LOBS } from "@/lib/labels";
import { toNum, roundMoney } from "@/lib/money";
import type { BillingType, PolicyStatus } from "@prisma/client";

const BILLING: BillingType[] = ["AGENCY_BILL", "DIRECT_BILL"];
const STATUSES: PolicyStatus[] = ["QUOTE", "BOUND", "ACTIVE", "RENEWED", "CANCELLED", "EXPIRED", "NON_RENEWED"];

function policyDataFrom(formData: FormData) {
  const premium = fNum(formData, "premium");
  const commissionRatePct = fNum(formData, "commissionRatePct");
  const effectiveDate = fDate(formData, "effectiveDate") ?? new Date();
  const expirationDate = fDate(formData, "expirationDate") ?? addYears(effectiveDate, 1);
  return {
    policyNumber: fStr(formData, "policyNumber"),
    clientId: fStr(formData, "clientId"),
    carrierId: fStr(formData, "carrierId"),
    mga: fStrOpt(formData, "mga"),
    lineOfBusiness: fEnum(formData, "lineOfBusiness", ALL_LOBS, "AUTO"),
    status: fEnum(formData, "status", STATUSES, "QUOTE"),
    billingType: fEnum(formData, "billingType", BILLING, "DIRECT_BILL"),
    premium,
    commissionRatePct,
    commissionAmount: expectedCommission(premium, commissionRatePct),
    isNewBusiness: fBool(formData, "isNewBusiness"),
    effectiveDate,
    expirationDate,
    producerId: fStr(formData, "producerId"),
    csrId: fStrOpt(formData, "csrId"),
    notes: fStrOpt(formData, "notes"),
  };
}

export async function createPolicy(formData: FormData) {
  const session = await requireSession();
  const data = policyDataFrom(formData);
  if (!data.policyNumber || !data.clientId || !data.carrierId || !data.producerId) {
    redirect(`/policies/new?toastError=${encodeURIComponent("Policy number, client, carrier and producer are required")}`);
  }
  const exists = await prisma.policy.findUnique({ where: { policyNumber: data.policyNumber } });
  if (exists) {
    redirect(`/policies/new?toastError=${encodeURIComponent(`Policy number ${data.policyNumber} already exists`)}`);
  }
  const policy = await prisma.policy.create({
    data: { ...data, boundAt: data.status === "BOUND" || data.status === "ACTIVE" ? new Date() : null },
  });
  // Default 100% split to the producer.
  await prisma.policyProducerSplit.create({
    data: { policyId: policy.id, producerId: data.producerId, pct: 100 },
  });
  await audit({ userId: session.userId, action: "POLICY_CREATE", entityType: "Policy", entityId: policy.id, detail: policy.policyNumber });
  redirect(`/policies/${policy.id}?toast=${encodeURIComponent("Policy created")}`);
}

export async function updatePolicy(id: string, formData: FormData) {
  const session = await requireSession();
  const data = policyDataFrom(formData);
  await prisma.policy.update({ where: { id }, data });
  await audit({ userId: session.userId, action: "POLICY_UPDATE", entityType: "Policy", entityId: id });
  redirect(`/policies/${id}?toast=${encodeURIComponent("Policy updated")}`);
}

export async function bindPolicy(id: string) {
  const session = await requireSession();
  await prisma.policy.update({ where: { id }, data: { status: "BOUND", boundAt: new Date() } });
  await audit({ userId: session.userId, action: "POLICY_BIND", entityType: "Policy", entityId: id });
  redirect(`/policies/${id}?toast=${encodeURIComponent("Policy bound")}`);
}

export async function activatePolicy(id: string) {
  const session = await requireSession();
  await prisma.policy.update({ where: { id }, data: { status: "ACTIVE" } });
  await audit({ userId: session.userId, action: "POLICY_ACTIVATE", entityType: "Policy", entityId: id });
  redirect(`/policies/${id}?toast=${encodeURIComponent("Policy active")}`);
}

export async function cancelPolicy(id: string, formData: FormData) {
  const session = await requireSession();
  const policy = await prisma.policy.findUnique({ where: { id } });
  if (!policy) redirect(`/policies?toastError=${encodeURIComponent("Policy not found")}`);
  const cancelDate = fDate(formData, "cancelledAt") ?? new Date();
  const reason = fStr(formData, "cancellationReason") || "Not specified";
  const method = fStr(formData, "method"); // PRO_RATA | SHORT_RATE
  const premium = toNum(policy.premium);
  const returned =
    method === "SHORT_RATE"
      ? shortRateReturn(premium, policy.effectiveDate, policy.expirationDate, cancelDate)
      : proRataReturn(premium, policy.effectiveDate, policy.expirationDate, cancelDate);
  await prisma.policy.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: cancelDate, cancellationReason: `${reason} (${method === "SHORT_RATE" ? "short-rate" : "pro-rata"} return ≈ $${returned.toFixed(2)})` },
  });
  await audit({ userId: session.userId, action: "POLICY_CANCEL", entityType: "Policy", entityId: id, detail: reason });
  redirect(`/policies/${id}?toast=${encodeURIComponent(`Policy cancelled — return premium ≈ $${returned.toFixed(2)}`)}`);
}

export async function nonRenewPolicy(id: string) {
  const session = await requireSession();
  await prisma.policy.update({ where: { id }, data: { status: "NON_RENEWED" } });
  await audit({ userId: session.userId, action: "POLICY_NON_RENEW", entityType: "Policy", entityId: id });
  redirect(`/policies/${id}?toast=${encodeURIComponent("Marked non-renewed")}`);
}

export async function addEndorsement(policyId: string, formData: FormData) {
  await requireSession();
  const policy = await prisma.policy.findUnique({ where: { id: policyId } });
  if (!policy) redirect(`/policies?toastError=${encodeURIComponent("Policy not found")}`);
  const effectiveDate = fDate(formData, "effectiveDate") ?? new Date();
  const annualized = fNum(formData, "premiumChange");
  const prorated = prorateEndorsement(annualized, policy.effectiveDate, policy.expirationDate, effectiveDate);
  const newPremium = roundMoney(toNum(policy.premium) + prorated);
  await prisma.$transaction([
    prisma.endorsement.create({
      data: {
        policyId,
        effectiveDate,
        description: fStr(formData, "description") || "Endorsement",
        premiumChange: prorated,
      },
    }),
    prisma.policy.update({
      where: { id: policyId },
      data: {
        premium: newPremium,
        commissionAmount: expectedCommission(newPremium, toNum(policy.commissionRatePct)),
      },
    }),
  ]);
  revalidatePath(`/policies/${policyId}`);
  redirect(`/policies/${policyId}?toast=${encodeURIComponent(`Endorsement added (prorated $${prorated.toFixed(2)})`)}`);
}

/** Replace the policy's producer splits. Percentages must sum to 100. */
export async function setSplits(policyId: string, formData: FormData) {
  await requireSession();
  const splits: Array<{ producerId: string; pct: number }> = [];
  for (let i = 0; i < 4; i++) {
    const producerId = fStr(formData, `producerId${i}`);
    const pct = fNum(formData, `pct${i}`);
    if (producerId && pct > 0) splits.push({ producerId, pct });
  }
  if (!validateSplits(splits)) {
    redirect(`/policies/${policyId}?toastError=${encodeURIComponent("Split percentages must be >0 and sum to exactly 100")}`);
  }
  await prisma.$transaction([
    prisma.policyProducerSplit.deleteMany({ where: { policyId } }),
    prisma.policyProducerSplit.createMany({ data: splits.map((s) => ({ policyId, ...s })) }),
  ]);
  revalidatePath(`/policies/${policyId}`);
  redirect(`/policies/${policyId}?toast=${encodeURIComponent("Producer splits updated")}`);
}

/**
 * Renew a policy: create the next-term policy chained via renewalOf,
 * mark the old term RENEWED, and complete any renewal record.
 */
export async function renewPolicy(id: string, formData: FormData) {
  const session = await requireSession();
  const policy = await prisma.policy.findUnique({ where: { id } });
  if (!policy) redirect(`/policies?toastError=${encodeURIComponent("Policy not found")}`);
  const premium = fNum(formData, "premium") || toNum(policy.premium);
  const ratePct = fNum(formData, "commissionRatePct") || toNum(policy.commissionRatePct);
  const newNumber = fStr(formData, "policyNumber") || `${policy.policyNumber}-R`;

  const exists = await prisma.policy.findUnique({ where: { policyNumber: newNumber } });
  if (exists) {
    redirect(`/policies/${id}?toastError=${encodeURIComponent(`Policy number ${newNumber} already exists`)}`);
  }

  const renewal = await prisma.policy.create({
    data: {
      policyNumber: newNumber,
      clientId: policy.clientId,
      carrierId: policy.carrierId,
      mga: policy.mga,
      lineOfBusiness: policy.lineOfBusiness,
      status: "ACTIVE",
      billingType: policy.billingType,
      premium,
      commissionRatePct: ratePct,
      commissionAmount: expectedCommission(premium, ratePct),
      isNewBusiness: false,
      effectiveDate: policy.expirationDate,
      expirationDate: addYears(policy.expirationDate, 1),
      boundAt: new Date(),
      producerId: policy.producerId,
      csrId: policy.csrId,
      renewalOfId: policy.id,
    },
  });
  await prisma.policyProducerSplit.create({ data: { policyId: renewal.id, producerId: policy.producerId, pct: 100 } });
  await prisma.policy.update({ where: { id }, data: { status: "RENEWED" } });
  await prisma.renewal.updateMany({
    where: { policyId: id, status: { notIn: ["RENEWED", "LOST"] } },
    data: { status: "RENEWED" },
  });
  await audit({ userId: session.userId, action: "POLICY_RENEW", entityType: "Policy", entityId: id, detail: `→ ${renewal.policyNumber}` });
  redirect(`/policies/${renewal.id}?toast=${encodeURIComponent(`Renewed as ${renewal.policyNumber}`)}`);
}
