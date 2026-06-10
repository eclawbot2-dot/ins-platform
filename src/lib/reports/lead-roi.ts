/**
 * Lead-source ROI data wrapper — adapts Prisma leads (+ the policies
 * bound for the clients they converted into) onto the pure marketing
 * analytics in domain/marketing.
 */

import { prisma } from "@/lib/prisma";
import { toNum, roundMoney } from "@/lib/money";
import {
  campaignPerformance,
  leadSourceRoi,
  type CampaignPerformance,
  type RoiLead,
  type SourceRoiRow,
} from "@/lib/domain/marketing";

export type LeadRoiData = {
  sources: SourceRoiRow[];
  campaigns: CampaignPerformance[];
};

export async function leadRoi(): Promise<LeadRoiData> {
  const [leads, campaigns] = await Promise.all([
    prisma.lead.findMany({
      select: {
        source: true,
        status: true,
        campaignId: true,
        client: {
          select: {
            policies: {
              where: { isNewBusiness: true, status: { notIn: ["QUOTE"] } },
              select: { premium: true },
            },
          },
        },
      },
    }),
    prisma.campaign.findMany({ select: { id: true, name: true, channel: true, budget: true } }),
  ]);

  const plain: Array<RoiLead & { campaignId: string | null }> = leads.map((l) => ({
    source: l.source,
    converted: l.status === "CONVERTED" || l.client != null,
    boundPremium: roundMoney((l.client?.policies ?? []).reduce((acc, p) => acc + toNum(p.premium), 0)),
    campaignId: l.campaignId,
  }));

  return {
    sources: leadSourceRoi(plain),
    campaigns: campaignPerformance(
      campaigns.map((c) => ({ id: c.id, name: c.name, channel: c.channel, budget: c.budget ? toNum(c.budget) : null })),
      plain,
    ),
  };
}
