"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fStr, fStrOpt, fNumOpt, fDate, fEnum } from "@/lib/form";
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
  await prisma.referral.create({
    data: {
      referrerName: fStr(formData, "referrerName") || "Unknown referrer",
      clientId: fStrOpt(formData, "clientId"),
      leadId: fStrOpt(formData, "leadId"),
      rewardAmount: fNumOpt(formData, "rewardAmount"),
      notes: fStrOpt(formData, "notes"),
    },
  });
  revalidatePath("/marketing");
  redirect(`/marketing?toast=${encodeURIComponent("Referral recorded")}`);
}

export async function deleteReferral(id: string) {
  await requireSession();
  await prisma.referral.delete({ where: { id } });
  revalidatePath("/marketing");
  redirect(`/marketing?toast=${encodeURIComponent("Referral removed")}`);
}
