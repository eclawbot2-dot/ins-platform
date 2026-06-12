"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStr, fStrOpt, fNumOpt, fEnum } from "@/lib/form";
import { nextRefNumber } from "@/lib/domain/numbers";
import { eoiKindForLob } from "@/lib/documents/eoi";
import type { EoiHolderInterest } from "@prisma/client";

const INTERESTS: EoiHolderInterest[] = ["MORTGAGEE", "LOSS_PAYEE", "ADDITIONAL_INTEREST", "LENDER"];

/**
 * Issue an Evidence of Property (ACORD 27/28-style). Snapshots the
 * policy/carrier/limits + lender holder details at issuance, mirroring
 * the certificate-issuance pattern.
 */
export async function issueEoi(formData: FormData) {
  const session = await requireSession();
  const policyId = fStr(formData, "policyId");
  const holderName = fStr(formData, "holderName");
  if (!policyId || !holderName) {
    redirect(`/eoi/new?toastError=${encodeURIComponent("Policy and holder name are required")}`);
  }

  const policy = await prisma.policy.findUnique({
    where: { id: policyId },
    include: { carrier: { select: { name: true } }, client: { select: { id: true } } },
  });
  if (!policy) {
    redirect(`/eoi/new?toastError=${encodeURIComponent("Policy not found")}`);
  }

  const existing = await prisma.evidenceOfProperty.findMany({ select: { eoiNumber: true } });
  const eoiNumber = nextRefNumber("EOI", existing.map((e) => e.eoiNumber));

  const eoi = await prisma.evidenceOfProperty.create({
    data: {
      eoiNumber,
      kind: eoiKindForLob(policy.lineOfBusiness),
      clientId: policy.client.id,
      policyId: policy.id,
      carrierName: policy.carrier.name,
      policyNumber: policy.policyNumber,
      effectiveDate: policy.effectiveDate,
      expirationDate: policy.expirationDate,
      propertyAddress: fStrOpt(formData, "propertyAddress"),
      coverageALimit: fNumOpt(formData, "coverageALimit"),
      deductibleText: fStrOpt(formData, "deductibleText"),
      holderName,
      holderInterest: fEnum(formData, "holderInterest", INTERESTS, "MORTGAGEE"),
      holderAddress: fStrOpt(formData, "holderAddress"),
      loanNumber: fStrOpt(formData, "loanNumber"),
      remarks: fStrOpt(formData, "remarks"),
      issuedById: session.userId,
    },
  });
  await audit({ userId: session.userId, action: "EOI_ISSUE", entityType: "EvidenceOfProperty", entityId: eoi.id, detail: eoiNumber });
  redirect(`/eoi/${eoi.id}?toast=${encodeURIComponent(`Evidence of property ${eoiNumber} issued`)}`);
}
