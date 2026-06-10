/**
 * Premium trend — new vs renewal written premium per month over a
 * trailing window. monthlyTrend() is pure; the wrapper feeds it
 * policies whose effective date falls in the window.
 */

import { roundMoney, toNum } from "@/lib/money";

export type TrendPolicy = {
  effectiveDate: Date;
  premium: number;
  isNewBusiness: boolean;
};

export type TrendMonth = {
  /** "2026-06" */
  month: string;
  newPremium: number;
  renewalPremium: number;
  total: number;
};

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The trailing `months` month-keys ending at (and including) asOf's month. */
export function trailingMonths(months: number, asOf: Date = new Date()): string[] {
  const out: string[] = [];
  const y = asOf.getUTCFullYear();
  const m = asOf.getUTCMonth();
  for (let i = months - 1; i >= 0; i--) {
    out.push(monthKey(new Date(Date.UTC(y, m - i, 1))));
  }
  return out;
}

/** Pure monthly new-vs-renewal aggregation over the trailing window. */
export function monthlyTrend(policies: ReadonlyArray<TrendPolicy>, months = 12, asOf: Date = new Date()): TrendMonth[] {
  const keys = trailingMonths(months, asOf);
  const map = new Map<string, TrendMonth>(keys.map((k) => [k, { month: k, newPremium: 0, renewalPremium: 0, total: 0 }]));
  for (const p of policies) {
    const row = map.get(monthKey(p.effectiveDate));
    if (!row) continue; // outside the window
    if (p.isNewBusiness) row.newPremium = roundMoney(row.newPremium + p.premium);
    else row.renewalPremium = roundMoney(row.renewalPremium + p.premium);
    row.total = roundMoney(row.newPremium + row.renewalPremium);
  }
  return keys.map((k) => map.get(k)!);
}

export async function premiumTrend(months = 12): Promise<TrendMonth[]> {
  const { prisma } = await import("@/lib/prisma");
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const policies = await prisma.policy.findMany({
    where: { status: { notIn: ["QUOTE"] }, effectiveDate: { gte: start } },
    select: { effectiveDate: true, premium: true, isNewBusiness: true },
  });
  return monthlyTrend(
    policies.map((p) => ({ effectiveDate: p.effectiveDate, premium: toNum(p.premium), isNewBusiness: p.isNewBusiness })),
    months,
    now,
  );
}
