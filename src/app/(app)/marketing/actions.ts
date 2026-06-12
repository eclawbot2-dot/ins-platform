"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fStr, fStrOpt, fNumOpt, fDate, fEnum } from "@/lib/form";
import { scheduleTouchpoint } from "@/lib/touchpoint-engine";
import type { CampaignChannel } from "@prisma/client";

const CHANNELS: CampaignChannel[] = [
  "REFERRAL", "WEB", "SOCIAL", "EMAIL", "DIRECT_MAIL", "EVENT", "PAID_SEARCH", "OTHER",
];

export async function createCampaign(formData: FormData) {
  await requireSession();
  await prisma.campaign.create({
    data: {
      name: fStr(formData, "name") || "Untitled campaign",
      channel: fEnum(formData, "channel", CHANNELS, "OTHER"),
      budget: fNumOpt(formData, "budget"),
      startDate: fDate(formData, "startDate"),
      endDate: fDate(formData, "endDate"),
      notes: fStrOpt(formData, "notes"),
    },
  });
  revalidatePath("/marketing");
  redirect(`/marketing?toast=${encodeURIComponent("Campaign created")}`);
}

export async function deleteCampaign(id: string) {
  await requireSession();
  await prisma.campaign.delete({ where: { id } });
  revalidatePath("/marketing");
  redirect(`/marketing?toast=${encodeURIComponent("Campaign deleted")}`);
}

export async function addReferral(formData: FormData) {
  await requireSession();
  const clientId = fStrOpt(formData, "clientId");
  const referral = await prisma.referral.create({
    data: {
      referrerName: fStr(formData, "referrerName") || "Unknown referrer",
      clientId,
      leadId: fStrOpt(formData, "leadId"),
      rewardAmount: fNumOpt(formData, "rewardAmount"),
      notes: fStrOpt(formData, "notes"),
    },
  });
  // Thank a referring CLIENT in real time (only when the referrer is a known client).
  if (clientId) await scheduleTouchpoint("referral-thankyou", clientId, { related: { type: "Referral", id: referral.id }, anchorKey: `referral:${referral.id}` });
  revalidatePath("/marketing");
  redirect(`/marketing?toast=${encodeURIComponent("Referral recorded")}`);
}

export async function deleteReferral(id: string) {
  await requireSession();
  await prisma.referral.delete({ where: { id } });
  revalidatePath("/marketing");
  redirect(`/marketing?toast=${encodeURIComponent("Referral removed")}`);
}
