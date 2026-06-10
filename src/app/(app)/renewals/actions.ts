"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fStrOpt } from "@/lib/form";
import { addDays } from "@/lib/domain/dates";
import { needsRenewalRecord } from "@/lib/domain/renewals";
import type { RenewalStatus } from "@prisma/client";

/**
 * Scan the book and create Renewal records (+ a renewal task) for
 * active/bound policies expiring within 90 days that don't have one.
 */
export async function generateRenewals() {
  const session = await requireSession();
  const now = new Date();
  const horizon = addDays(now, 90);
  const candidates = await prisma.policy.findMany({
    where: {
      status: { in: ["ACTIVE", "BOUND"] },
      expirationDate: { lte: horizon },
    },
    include: { renewals: { select: { id: true, expirationDate: true } }, client: { select: { name: true } }, csr: { select: { id: true } } },
  });

  let created = 0;
  for (const p of candidates) {
    const hasRecord = p.renewals.some((r) => r.expirationDate.getTime() === p.expirationDate.getTime());
    if (!needsRenewalRecord({ status: p.status, expirationDate: p.expirationDate }, hasRecord, now)) continue;
    const renewal = await prisma.renewal.create({
      data: {
        policyId: p.id,
        expirationDate: p.expirationDate,
        status: "PENDING_REVIEW",
        assignedToId: p.csrId ?? p.producerId,
      },
    });
    await prisma.task.create({
      data: {
        title: `Review renewal: ${p.policyNumber} (${p.client.name})`,
        dueDate: addDays(p.expirationDate, -45),
        priority: "HIGH",
        renewalId: renewal.id,
        policyId: p.id,
        assignedToId: p.csrId ?? p.producerId,
        createdById: session.userId,
      },
    });
    created += 1;
  }
  revalidatePath("/renewals");
  redirect(`/renewals?toast=${encodeURIComponent(`${created} renewal record(s) created`)}`);
}

export async function setRenewalStatus(id: string, status: RenewalStatus, formData: FormData) {
  await requireSession();
  await prisma.renewal.update({
    where: { id },
    data: { status, notes: fStrOpt(formData, "notes") ?? undefined },
  });
  revalidatePath("/renewals");
  redirect(`/renewals?toast=${encodeURIComponent(`Renewal marked ${status.replace(/_/g, " ").toLowerCase()}`)}`);
}

export async function assignRenewal(id: string, formData: FormData) {
  await requireSession();
  await prisma.renewal.update({
    where: { id },
    data: { assignedToId: fStrOpt(formData, "assignedToId") },
  });
  revalidatePath("/renewals");
  redirect(`/renewals?toast=${encodeURIComponent("Renewal assigned")}`);
}
