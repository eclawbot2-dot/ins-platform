"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fStr, fStrOpt, fNumOpt, fDate, fEnum } from "@/lib/form";
import { ALL_LOBS } from "@/lib/labels";
import type { OpportunityStage } from "@prisma/client";

const STAGES: OpportunityStage[] = ["NEW", "CONTACTED", "QUOTING", "PROPOSAL", "BOUND", "LOST"];

export async function createOpportunity(formData: FormData) {
  const session = await requireSession();
  const clientId = fStrOpt(formData, "clientId");
  const opp = await prisma.opportunity.create({
    data: {
      name: fStr(formData, "name") || "New opportunity",
      stage: fEnum(formData, "stage", STAGES, "NEW"),
      lineOfBusiness: fEnum(formData, "lineOfBusiness", ALL_LOBS, "AUTO"),
      premiumEstimate: fNumOpt(formData, "premiumEstimate"),
      expectedCloseDate: fDate(formData, "expectedCloseDate"),
      clientId,
      ownerId: fStrOpt(formData, "ownerId") ?? session.userId,
    },
  });
  redirect(`/opportunities?toast=${encodeURIComponent(`Opportunity "${opp.name}" created`)}`);
}

export async function moveOpportunity(id: string, stage: OpportunityStage, formData: FormData) {
  await requireSession();
  const lostReason = stage === "LOST" ? (fStrOpt(formData, "lostReason") ?? "Not specified") : null;
  await prisma.opportunity.update({
    where: { id },
    data: { stage, lostReason },
  });
  revalidatePath("/opportunities");
  redirect(`/opportunities?toast=${encodeURIComponent(`Moved to ${stage}`)}`);
}

export async function updateOpportunity(id: string, formData: FormData) {
  await requireSession();
  await prisma.opportunity.update({
    where: { id },
    data: {
      name: fStr(formData, "name") || "Opportunity",
      stage: fEnum(formData, "stage", STAGES, "NEW"),
      lineOfBusiness: fEnum(formData, "lineOfBusiness", ALL_LOBS, "AUTO"),
      premiumEstimate: fNumOpt(formData, "premiumEstimate"),
      expectedCloseDate: fDate(formData, "expectedCloseDate"),
      lostReason: fStrOpt(formData, "lostReason"),
      ownerId: fStrOpt(formData, "ownerId") ?? undefined,
    },
  });
  revalidatePath("/opportunities");
  redirect(`/opportunities?toast=${encodeURIComponent("Opportunity updated")}`);
}
