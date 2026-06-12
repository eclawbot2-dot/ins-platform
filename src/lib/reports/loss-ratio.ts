/**
 * Loss-ratio + by-LOB / by-carrier profitability report (Wave B).
 *
 * Incurred (paid + reserve from Claim) vs written premium, grouped by
 * carrier and by line of business, with each group's loss ratio + a
 * high-loss flag. The domain math lives in domain/loss-ratio; this layer
 * just queries and groups.
 */

import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { LOB_LABELS } from "@/lib/labels";
import {
  finalizeRow,
  lossRatioPct,
  lossTier,
  type LossRatioAccumulator,
  type LossRatioRow,
} from "@/lib/domain/loss-ratio";
import type { LineOfBusiness } from "@prisma/client";

export type LossRatioReport = {
  byCarrier: LossRatioRow[];
  byLob: LossRatioRow[];
  overall: {
    premium: number;
    incurred: number;
    paid: number;
    reserve: number;
    claimCount: number;
    policyCount: number;
    lossRatioPct: number | null;
    highLossGroups: number;
  };
};

function emptyAcc(): LossRatioAccumulator {
  return { premium: 0, policyCount: 0, claimCount: 0, paid: 0, reserve: 0 };
}

/**
 * Build the loss-ratio report across all in-force / historical policies
 * that carry premium (everything but QUOTE shells). Premium is the
 * policy's written premium; incurred loss is summed from its claims.
 */
export async function lossRatioReport(): Promise<LossRatioReport> {
  const policies = await prisma.policy.findMany({
    where: { status: { not: "QUOTE" } },
    select: {
      id: true,
      premium: true,
      lineOfBusiness: true,
      carrier: { select: { name: true } },
      claims: { select: { paidAmount: true, reserveAmount: true } },
    },
  });

  const carrierAccs = new Map<string, LossRatioAccumulator>();
  const lobAccs = new Map<LineOfBusiness, LossRatioAccumulator>();
  const overall = emptyAcc();

  for (const p of policies) {
    const premium = toNum(p.premium);
    let paid = 0;
    let reserve = 0;
    for (const c of p.claims) {
      paid += toNum(c.paidAmount);
      reserve += toNum(c.reserveAmount);
    }
    const claimCount = p.claims.length;

    const carrierName = p.carrier.name;
    const cAcc = carrierAccs.get(carrierName) ?? emptyAcc();
    cAcc.premium += premium;
    cAcc.policyCount += 1;
    cAcc.claimCount += claimCount;
    cAcc.paid += paid;
    cAcc.reserve += reserve;
    carrierAccs.set(carrierName, cAcc);

    const lAcc = lobAccs.get(p.lineOfBusiness) ?? emptyAcc();
    lAcc.premium += premium;
    lAcc.policyCount += 1;
    lAcc.claimCount += claimCount;
    lAcc.paid += paid;
    lAcc.reserve += reserve;
    lobAccs.set(p.lineOfBusiness, lAcc);

    overall.premium += premium;
    overall.policyCount += 1;
    overall.claimCount += claimCount;
    overall.paid += paid;
    overall.reserve += reserve;
  }

  const byCarrier = Array.from(carrierAccs.entries())
    .map(([name, acc]) => finalizeRow(name, name, acc))
    .sort((a, b) => (b.lossRatioPct ?? -1) - (a.lossRatioPct ?? -1));

  const byLob = Array.from(lobAccs.entries())
    .map(([lob, acc]) => finalizeRow(lob, LOB_LABELS[lob], acc))
    .sort((a, b) => (b.lossRatioPct ?? -1) - (a.lossRatioPct ?? -1));

  const overallIncurred = overall.paid + overall.reserve;
  const overallRatio = lossRatioPct(overallIncurred, overall.premium);
  const highLossGroups =
    byCarrier.filter((r) => r.tier === "HIGH").length + byLob.filter((r) => r.tier === "HIGH").length;
  void lossTier;

  return {
    byCarrier,
    byLob,
    overall: {
      premium: Math.round(overall.premium * 100) / 100,
      incurred: Math.round(overallIncurred * 100) / 100,
      paid: Math.round(overall.paid * 100) / 100,
      reserve: Math.round(overall.reserve * 100) / 100,
      claimCount: overall.claimCount,
      policyCount: overall.policyCount,
      lossRatioPct: overallRatio,
      highLossGroups,
    },
  };
}
