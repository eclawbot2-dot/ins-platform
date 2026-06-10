/**
 * Marketing analytics — lead-source ROI and campaign performance.
 * Pure aggregation over plain rows so the math is unit-testable; the
 * /marketing page adapts Prisma rows into these shapes.
 */

import { roundMoney } from "@/lib/money";

export type RoiLead = {
  source: string | null;
  /** Lead reached CONVERTED (became a client). */
  converted: boolean;
  /** New-business premium bound for the client this lead became. */
  boundPremium: number;
};

export type SourceRoiRow = {
  source: string;
  leads: number;
  converted: number;
  /** leads → converted, 0–100 one decimal. */
  conversionPct: number;
  boundPremium: number;
  premiumPerLead: number;
};

export function normalizeSource(source: string | null | undefined): string {
  const s = source?.trim().toLowerCase();
  return s && s.length > 0 ? s : "unknown";
}

/** Aggregate leads by normalized source. Sorted by bound premium desc. */
export function leadSourceRoi(leads: ReadonlyArray<RoiLead>): SourceRoiRow[] {
  const map = new Map<string, SourceRoiRow>();
  for (const lead of leads) {
    const source = normalizeSource(lead.source);
    const row =
      map.get(source) ?? { source, leads: 0, converted: 0, conversionPct: 0, boundPremium: 0, premiumPerLead: 0 };
    row.leads += 1;
    if (lead.converted) row.converted += 1;
    row.boundPremium = roundMoney(row.boundPremium + lead.boundPremium);
    map.set(source, row);
  }
  const rows = Array.from(map.values()).sort((a, b) => b.boundPremium - a.boundPremium);
  for (const row of rows) {
    row.conversionPct = row.leads === 0 ? 0 : Math.round((row.converted / row.leads) * 1000) / 10;
    row.premiumPerLead = row.leads === 0 ? 0 : roundMoney(row.boundPremium / row.leads);
  }
  return rows;
}

export type CampaignPerformance = {
  campaignId: string;
  name: string;
  channel: string;
  budget: number | null;
  leads: number;
  converted: number;
  boundPremium: number;
  /** Bound premium per budget dollar; null when no budget set. */
  premiumPerDollar: number | null;
};

export function campaignPerformance(
  campaigns: ReadonlyArray<{ id: string; name: string; channel: string; budget: number | null }>,
  leads: ReadonlyArray<RoiLead & { campaignId: string | null }>,
): CampaignPerformance[] {
  return campaigns
    .map((c) => {
      const mine = leads.filter((l) => l.campaignId === c.id);
      const converted = mine.filter((l) => l.converted).length;
      const boundPremium = roundMoney(mine.reduce((acc, l) => acc + l.boundPremium, 0));
      return {
        campaignId: c.id,
        name: c.name,
        channel: c.channel,
        budget: c.budget,
        leads: mine.length,
        converted,
        boundPremium,
        premiumPerDollar: c.budget && c.budget > 0 ? roundMoney(boundPremium / c.budget) : null,
      };
    })
    .sort((a, b) => b.boundPremium - a.boundPremium);
}
