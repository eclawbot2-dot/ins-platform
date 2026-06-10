/**
 * Retention report — policy terms that expired in the trailing window,
 * classified renewed vs lost (domain/retention), with the headline
 * retention rate plus the per-policy outcome rows for the table.
 */

import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { classifyOutcome, retentionRate } from "@/lib/domain/retention";
import { addDays } from "@/lib/domain/dates";
import { LOB_LABELS } from "@/lib/labels";

export type RetentionOutcomeRow = {
  policyId: string;
  policyNumber: string;
  clientName: string;
  lineOfBusiness: string;
  carrierName: string;
  premium: number;
  expirationDate: Date;
  outcome: "RENEWED" | "LOST";
};

export type RetentionReport = {
  rate: number | null;
  renewed: number;
  lost: number;
  windowDays: number;
  rows: RetentionOutcomeRow[];
};

export async function retentionReport(windowDays = 365): Promise<RetentionReport> {
  const now = new Date();
  const windowStart = addDays(now, -windowDays);
  const policies = await prisma.policy.findMany({
    where: { expirationDate: { gte: windowStart, lte: now }, status: { notIn: ["QUOTE"] } },
    select: {
      id: true,
      policyNumber: true,
      status: true,
      premium: true,
      lineOfBusiness: true,
      expirationDate: true,
      client: { select: { name: true } },
      carrier: { select: { name: true } },
      renewedBy: { select: { id: true } },
    },
    orderBy: { expirationDate: "desc" },
  });

  const rows: RetentionOutcomeRow[] = [];
  for (const p of policies) {
    const outcome = classifyOutcome({ status: p.status, hasRenewalPolicy: p.renewedBy.length > 0 });
    if (!outcome) continue; // term not yet decided
    rows.push({
      policyId: p.id,
      policyNumber: p.policyNumber,
      clientName: p.client.name,
      lineOfBusiness: LOB_LABELS[p.lineOfBusiness],
      carrierName: p.carrier.name,
      premium: toNum(p.premium),
      expirationDate: p.expirationDate,
      outcome,
    });
  }

  const renewed = rows.filter((r) => r.outcome === "RENEWED").length;
  const lost = rows.filter((r) => r.outcome === "LOST").length;
  return { rate: retentionRate({ renewed, lost }), renewed, lost, windowDays, rows };
}
