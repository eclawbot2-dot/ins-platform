/**
 * Producer production report — written premium, policy count, and
 * commission per producer over a period (by policy effective date).
 * Commission is allocated through split rules (allocateProduction is
 * pure / unit-testable); premium follows the same split percentages so
 * shared accounts credit both producers proportionally.
 */

import { prisma } from "@/lib/prisma";
import { roundMoney, toNum } from "@/lib/money";
import { splitAmounts } from "@/lib/domain/commissions";

export type ProductionPolicy = {
  premium: number;
  commissionAmount: number;
  isNewBusiness: boolean;
  producerId: string;
  producerName: string;
  splits: Array<{ producerId: string; producerName: string; pct: number }>;
};

export type ProductionRow = {
  producerId: string;
  producerName: string;
  policyCount: number;
  newPolicyCount: number;
  writtenPremium: number;
  commission: number;
};

/** Pure allocation of production across producers via split rules. */
export function allocateProduction(policies: ReadonlyArray<ProductionPolicy>): ProductionRow[] {
  const map = new Map<string, ProductionRow>();
  const rowFor = (id: string, name: string): ProductionRow => {
    const existing = map.get(id);
    if (existing) return existing;
    const fresh: ProductionRow = {
      producerId: id,
      producerName: name,
      policyCount: 0,
      newPolicyCount: 0,
      writtenPremium: 0,
      commission: 0,
    };
    map.set(id, fresh);
    return fresh;
  };

  for (const p of policies) {
    const splits =
      p.splits.length > 0
        ? p.splits
        : [{ producerId: p.producerId, producerName: p.producerName, pct: 100 }];
    const premiumShares = splitAmounts(p.premium, splits);
    const commissionShares = splitAmounts(p.commissionAmount, splits);
    for (const split of splits) {
      const row = rowFor(split.producerId, split.producerName);
      row.policyCount += 1;
      if (p.isNewBusiness) row.newPolicyCount += 1;
      row.writtenPremium = roundMoney(
        row.writtenPremium + (premiumShares.find((s) => s.producerId === split.producerId)?.amount ?? 0),
      );
      row.commission = roundMoney(
        row.commission + (commissionShares.find((s) => s.producerId === split.producerId)?.amount ?? 0),
      );
    }
  }
  return Array.from(map.values()).sort((a, b) => b.writtenPremium - a.writtenPremium);
}

export async function producerProduction(args: { from?: Date; to?: Date } = {}): Promise<ProductionRow[]> {
  const policies = await prisma.policy.findMany({
    where: {
      status: { notIn: ["QUOTE"] },
      effectiveDate: {
        ...(args.from ? { gte: args.from } : {}),
        ...(args.to ? { lte: args.to } : {}),
      },
    },
    select: {
      premium: true,
      commissionAmount: true,
      isNewBusiness: true,
      producer: { select: { id: true, name: true } },
      splits: { select: { pct: true, producer: { select: { id: true, name: true } } } },
    },
  });
  return allocateProduction(
    policies.map((p) => ({
      premium: toNum(p.premium),
      commissionAmount: toNum(p.commissionAmount),
      isNewBusiness: p.isNewBusiness,
      producerId: p.producer.id,
      producerName: p.producer.name,
      splits: p.splits.map((s) => ({ producerId: s.producer.id, producerName: s.producer.name, pct: toNum(s.pct) })),
    })),
  );
}
