/**
 * Commission revenue report — carrier-statement commission received
 * per month (the agency's actual revenue line). Pure monthly bucketing
 * shared with the premium trend (trailingMonths/monthKey).
 */

import { prisma } from "@/lib/prisma";
import { roundMoney, toNum } from "@/lib/money";
import { monthKey, trailingMonths } from "./trend";

export type CommissionMonth = {
  month: string;
  commission: number;
  lineCount: number;
};

export function monthlyCommission(
  lines: ReadonlyArray<{ statementDate: Date; amount: number }>,
  months = 12,
  asOf: Date = new Date(),
): CommissionMonth[] {
  const keys = trailingMonths(months, asOf);
  const map = new Map<string, CommissionMonth>(keys.map((k) => [k, { month: k, commission: 0, lineCount: 0 }]));
  for (const line of lines) {
    const row = map.get(monthKey(line.statementDate));
    if (!row) continue;
    row.commission = roundMoney(row.commission + line.amount);
    row.lineCount += 1;
  }
  return keys.map((k) => map.get(k)!);
}

export async function commissionRevenue(months = 12): Promise<CommissionMonth[]> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const lines = await prisma.commissionStatementLine.findMany({
    where: { statement: { statementDate: { gte: start } } },
    select: { commissionAmount: true, statement: { select: { statementDate: true } } },
  });
  return monthlyCommission(
    lines.map((l) => ({ statementDate: l.statement.statementDate, amount: toNum(l.commissionAmount) })),
    months,
    now,
  );
}
