"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStr, fStrOpt, fNumOpt, fDate, fEnum, fBool } from "@/lib/form";
import { surplusLinesTax } from "@/lib/domain/surplus-lines";
import { toNum } from "@/lib/money";
import type { SurplusLinesStatus } from "@prisma/client";

const STATUSES: SurplusLinesStatus[] = ["PENDING", "FILED", "EXEMPT", "VOID"];

/**
 * Create / update the surplus-lines filing record for a policy. The
 * filing IS the marker that a policy is surplus-lines (E&S). Tax is
 * auto-computed from premium × rate when a rate is supplied and no
 * explicit tax was entered.
 */
export async function upsertSurplusFiling(policyId: string, formData: FormData) {
  const session = await requireSession();

  const policy = await prisma.policy.findUnique({ where: { id: policyId }, select: { id: true, premium: true } });
  if (!policy) redirect(`/policies?toastError=${encodeURIComponent("Policy not found")}`);

  const taxRatePct = fNumOpt(formData, "taxRatePct");
  let surplusLinesTaxAmt = fNumOpt(formData, "surplusLinesTax");
  if (surplusLinesTaxAmt == null && taxRatePct != null) {
    surplusLinesTaxAmt = surplusLinesTax(toNum(policy.premium), taxRatePct);
  }

  const status = fEnum(formData, "status", STATUSES, "PENDING");
  const filedAt = status === "FILED" ? (fDate(formData, "filedAt") ?? new Date()) : fDate(formData, "filedAt");

  const data = {
    state: fStr(formData, "state").toUpperCase() || "—",
    status,
    filingNumber: fStrOpt(formData, "filingNumber"),
    surplusLinesTax: surplusLinesTaxAmt,
    stampingFee: fNumOpt(formData, "stampingFee"),
    taxRatePct,
    diligentSearchDone: fBool(formData, "diligentSearchDone"),
    affidavitOnFile: fBool(formData, "affidavitOnFile"),
    filedAt,
    dueDate: fDate(formData, "dueDate"),
    notes: fStrOpt(formData, "notes"),
  };

  await prisma.surplusLinesFiling.upsert({
    where: { policyId },
    update: data,
    create: { policyId, ...data },
  });
  await audit({ userId: session.userId, action: "SURPLUS_FILING_UPSERT", entityType: "Policy", entityId: policyId, detail: status });
  revalidatePath(`/policies/${policyId}`);
  redirect(`/policies/${policyId}?toast=${encodeURIComponent("Surplus-lines filing saved")}`);
}

export async function deleteSurplusFiling(policyId: string) {
  const session = await requireSession();
  await prisma.surplusLinesFiling.deleteMany({ where: { policyId } });
  await audit({ userId: session.userId, action: "SURPLUS_FILING_DELETE", entityType: "Policy", entityId: policyId });
  revalidatePath(`/policies/${policyId}`);
  redirect(`/policies/${policyId}?toast=${encodeURIComponent("Surplus-lines filing removed")}`);
}

/** Quick "mark filed" from the compliance worklist. */
export async function markSurplusFiled(filingId: string) {
  const session = await requireSession();
  await prisma.surplusLinesFiling.update({
    where: { id: filingId },
    data: { status: "FILED", filedAt: new Date() },
  });
  await audit({ userId: session.userId, action: "SURPLUS_FILING_MARK_FILED", entityType: "SurplusLinesFiling", entityId: filingId });
  revalidatePath("/compliance/surplus-lines");
  redirect(`/compliance/surplus-lines?toast=${encodeURIComponent("Filing marked filed")}`);
}
