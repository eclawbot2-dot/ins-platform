"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStr, fStrOpt, fBool } from "@/lib/form";
import { nextRefNumber, REF_PREFIXES } from "@/lib/domain/numbers";
import { LOB_LABELS } from "@/lib/labels";

export async function createHolder(formData: FormData) {
  await requireSession();
  await prisma.certificateHolder.create({
    data: {
      name: fStr(formData, "name") || "Unnamed holder",
      addressLine1: fStrOpt(formData, "addressLine1"),
      addressLine2: fStrOpt(formData, "addressLine2"),
      city: fStrOpt(formData, "city"),
      state: fStrOpt(formData, "state"),
      zip: fStrOpt(formData, "zip"),
      email: fStrOpt(formData, "email"),
    },
  });
  revalidatePath("/certificates/holders");
  redirect(`/certificates/holders?toast=${encodeURIComponent("Holder added")}`);
}

/**
 * Issue a certificate: client + holder + the client's selected policies
 * become coverage rows (snapshot of carrier/policy/dates/limits at
 * issuance, the ACORD 25 way).
 */
export async function issueCertificate(formData: FormData) {
  const session = await requireSession();
  const clientId = fStr(formData, "clientId");
  const holderId = fStr(formData, "holderId");
  if (!clientId || !holderId) {
    redirect(`/certificates/new?toastError=${encodeURIComponent("Client and holder are required")}`);
  }

  const policyIds = formData.getAll("policyIds").map(String).filter(Boolean);
  if (policyIds.length === 0) {
    redirect(`/certificates/new?clientId=${clientId}&toastError=${encodeURIComponent("Select at least one policy")}`);
  }

  const policies = await prisma.policy.findMany({
    where: { id: { in: policyIds }, clientId },
    include: { carrier: { select: { name: true } } },
  });
  if (policies.length === 0) {
    redirect(`/certificates/new?clientId=${clientId}&toastError=${encodeURIComponent("Selected policies not found for this client")}`);
  }

  const existing = await prisma.certificate.findMany({ select: { certNumber: true } });
  const certNumber = nextRefNumber(REF_PREFIXES.certificate, existing.map((c) => c.certNumber));

  const certificate = await prisma.certificate.create({
    data: {
      certNumber,
      clientId,
      holderId,
      policyId: policies[0]!.id,
      descriptionOfOps: fStrOpt(formData, "descriptionOfOps"),
      additionalInsured: fBool(formData, "additionalInsured"),
      waiverOfSubrogation: fBool(formData, "waiverOfSubrogation"),
      issuedById: session.userId,
      coverages: {
        create: policies.map((p) => ({
          policyId: p.id,
          coverageType: LOB_LABELS[p.lineOfBusiness],
          carrierName: p.carrier.name,
          policyNumber: p.policyNumber,
          effectiveDate: p.effectiveDate,
          expirationDate: p.expirationDate,
          limitsText: fStr(formData, `limits-${p.id}`) || "Per policy terms",
        })),
      },
    },
  });
  await audit({ userId: session.userId, action: "COI_ISSUE", entityType: "Certificate", entityId: certificate.id, detail: certNumber });
  redirect(`/certificates/${certificate.id}?toast=${encodeURIComponent(`Certificate ${certNumber} issued`)}`);
}
