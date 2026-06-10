/**
 * Producer payables — allocate reconciled carrier-statement commission
 * to producers via each policy's split rules. Unmatched lines can't be
 * allocated (no policy → no splits) and are reported separately.
 */

import { prisma } from "@/lib/prisma";
import { splitAmounts } from "@/lib/domain/commissions";
import { toNum, roundMoney } from "@/lib/money";

export type PayableRow = {
  producerId: string;
  producerName: string;
  lineCount: number;
  commission: number;
};

export type PayablesReport = {
  rows: PayableRow[];
  unallocatedAmount: number;
  unallocatedCount: number;
  totalAllocated: number;
};

export async function producerPayables(args: { from?: Date; to?: Date } = {}): Promise<PayablesReport> {
  const lines = await prisma.commissionStatementLine.findMany({
    where: {
      statement: {
        statementDate: {
          ...(args.from ? { gte: args.from } : {}),
          ...(args.to ? { lte: args.to } : {}),
        },
      },
    },
    include: {
      policy: { include: { splits: { include: { producer: { select: { id: true, name: true } } } }, producer: { select: { id: true, name: true } } } },
    },
  });

  const byProducer = new Map<string, PayableRow>();
  let unallocatedAmount = 0;
  let unallocatedCount = 0;

  for (const line of lines) {
    const amount = toNum(line.commissionAmount);
    if (!line.policy) {
      unallocatedAmount = roundMoney(unallocatedAmount + amount);
      unallocatedCount += 1;
      continue;
    }
    const splits =
      line.policy.splits.length > 0
        ? line.policy.splits.map((s) => ({ producerId: s.producerId, pct: toNum(s.pct), name: s.producer.name }))
        : [{ producerId: line.policy.producer.id, pct: 100, name: line.policy.producer.name }];
    const shares = splitAmounts(amount, splits);
    for (const share of shares) {
      const name = splits.find((s) => s.producerId === share.producerId)?.name ?? "Unknown";
      const existing = byProducer.get(share.producerId) ?? { producerId: share.producerId, producerName: name, lineCount: 0, commission: 0 };
      existing.lineCount += 1;
      existing.commission = roundMoney(existing.commission + share.amount);
      byProducer.set(share.producerId, existing);
    }
  }

  const rows = Array.from(byProducer.values()).sort((a, b) => b.commission - a.commission);
  return {
    rows,
    unallocatedAmount,
    unallocatedCount,
    totalAllocated: roundMoney(rows.reduce((acc, r) => acc + r.commission, 0)),
  };
}
