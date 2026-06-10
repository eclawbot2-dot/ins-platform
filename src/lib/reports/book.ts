/**
 * Book-of-business report — active/bound premium grouped by carrier,
 * line of business, or producer. The grouping itself is pure
 * (groupBook) so it's unit-testable; the wrapper fetches from Prisma.
 */

import { roundMoney, toNum } from "@/lib/money";
import { LOB_LABELS } from "@/lib/labels";

export type BookGroupBy = "carrier" | "lob" | "producer";

export type BookPolicyRow = {
  carrierName: string;
  lineOfBusiness: string;
  producerName: string;
  premium: number;
  commissionAmount: number;
};

export type BookRow = {
  group: string;
  policyCount: number;
  premium: number;
  commission: number;
  /** Share of total book premium, 0–100 with one decimal. */
  sharePct: number;
};

/** Pure grouping/aggregation over plain policy rows. */
export function groupBook(policies: ReadonlyArray<BookPolicyRow>, by: BookGroupBy): BookRow[] {
  const keyOf = (p: BookPolicyRow) =>
    by === "carrier" ? p.carrierName : by === "lob" ? p.lineOfBusiness : p.producerName;
  const total = policies.reduce((acc, p) => acc + p.premium, 0);
  const map = new Map<string, BookRow>();
  for (const p of policies) {
    const key = keyOf(p);
    const row = map.get(key) ?? { group: key, policyCount: 0, premium: 0, commission: 0, sharePct: 0 };
    row.policyCount += 1;
    row.premium = roundMoney(row.premium + p.premium);
    row.commission = roundMoney(row.commission + p.commissionAmount);
    map.set(key, row);
  }
  const rows = Array.from(map.values()).sort((a, b) => b.premium - a.premium);
  for (const row of rows) {
    row.sharePct = total === 0 ? 0 : Math.round((row.premium / total) * 1000) / 10;
  }
  return rows;
}

export async function bookOfBusiness(by: BookGroupBy): Promise<{ rows: BookRow[]; totalPremium: number; totalPolicies: number }> {
  // Lazy import keeps this module pure-importable for unit tests.
  const { prisma } = await import("@/lib/prisma");
  const policies = await prisma.policy.findMany({
    where: { status: { in: ["ACTIVE", "BOUND"] } },
    select: {
      premium: true,
      commissionAmount: true,
      lineOfBusiness: true,
      carrier: { select: { name: true } },
      producer: { select: { name: true } },
    },
  });
  const plain: BookPolicyRow[] = policies.map((p) => ({
    carrierName: p.carrier.name,
    lineOfBusiness: LOB_LABELS[p.lineOfBusiness],
    producerName: p.producer.name,
    premium: toNum(p.premium),
    commissionAmount: toNum(p.commissionAmount),
  }));
  return {
    rows: groupBook(plain, by),
    totalPremium: roundMoney(plain.reduce((acc, p) => acc + p.premium, 0)),
    totalPolicies: plain.length,
  };
}
