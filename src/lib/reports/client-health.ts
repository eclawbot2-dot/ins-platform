/**
 * Client-health signal assembly + agency-wide at-risk worklist (Wave B).
 *
 * Pulls the raw signals (policy mix, recent claims, AR lateness, recent
 * cancellations, renewal proximity, tenure) for a client and runs the
 * pure scorer. The worklist scores every active client and surfaces the
 * watch/at-risk tiers.
 */

import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { clientHealth, type ClientHealth, type ClientHealthSignals } from "@/lib/domain/client-health";
import { daysBetween, daysUntil } from "@/lib/domain/dates";
import { openBalance } from "@/lib/domain/aging";
import type { DecimalLike } from "@/lib/money";

const ACTIVE_STATUSES: ("ACTIVE" | "BOUND" | "RENEWED")[] = ["ACTIVE", "BOUND", "RENEWED"];
const OPEN_INVOICE_STATUSES: ("SENT" | "PARTIAL")[] = ["SENT", "PARTIAL"];

/** Months between two dates (approx, for tenure). */
function monthsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor(daysBetween(from, to) / 30.44));
}

type ClientForHealth = {
  id: string;
  createdAt: Date;
  policies: { status: string; expirationDate: Date; cancelledAt: Date | null; updatedAt: Date }[];
  claims: { reportedAt: Date }[];
  invoices: { status: string; amount: DecimalLike; paidAmount: DecimalLike; dueDate: Date }[];
};

const HEALTH_INCLUDE = {
  policies: { select: { status: true, expirationDate: true, cancelledAt: true, updatedAt: true } },
  claims: { select: { reportedAt: true } },
  invoices: { select: { status: true, amount: true, paidAmount: true, dueDate: true } },
} as const;

/** Derive the scoring signals from a loaded client record. */
export function signalsFor(client: ClientForHealth, asOf: Date = new Date()): ClientHealthSignals {
  const yearAgo = new Date(asOf.getTime() - 365 * 86400000);

  const activePolicyCount = client.policies.filter((p) => ACTIVE_STATUSES.includes(p.status as "ACTIVE")).length;

  const recentClaimCount = client.claims.filter((c) => c.reportedAt >= yearAgo).length;

  const recentCancellations = client.policies.filter(
    (p) => (p.status === "CANCELLED" || p.status === "NON_RENEWED") && p.updatedAt >= yearAgo,
  ).length;

  let pastDueAmount = 0;
  let maxDaysPastDue = 0;
  for (const inv of client.invoices) {
    if (!OPEN_INVOICE_STATUSES.includes(inv.status as "SENT")) continue;
    const bal = openBalance({ amount: toNum(inv.amount), paidAmount: toNum(inv.paidAmount) });
    if (bal <= 0) continue;
    const overdue = daysBetween(inv.dueDate, asOf);
    if (overdue > 0) {
      pastDueAmount += bal;
      if (overdue > maxDaysPastDue) maxDaysPastDue = overdue;
    }
  }

  const upcomingRenewals = client.policies
    .filter((p) => ACTIVE_STATUSES.includes(p.status as "ACTIVE"))
    .map((p) => daysUntil(p.expirationDate, asOf))
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);
  const daysToNearestRenewal = upcomingRenewals.length ? upcomingRenewals[0]! : null;

  return {
    activePolicyCount,
    recentClaimCount,
    pastDueAmount: Math.round(pastDueAmount * 100) / 100,
    maxDaysPastDue,
    recentCancellations,
    daysToNearestRenewal,
    tenureMonths: monthsBetween(client.createdAt, asOf),
  };
}

/** Health for a single client (client-360 surface). */
export async function clientHealthFor(clientId: string): Promise<{ health: ClientHealth; signals: ClientHealthSignals } | null> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, createdAt: true, ...HEALTH_INCLUDE } });
  if (!client) return null;
  const signals = signalsFor(client);
  return { health: clientHealth(signals), signals };
}

export type AtRiskRow = {
  clientId: string;
  clientName: string;
  producerName: string | null;
  score: number;
  tier: ClientHealth["tier"];
  topFactor: string | null;
  activePolicyCount: number;
  pastDueAmount: number;
  recentClaimCount: number;
};

/** Agency-wide at-risk worklist — watch + at-risk tiers, worst first. */
export async function atRiskWorklist(): Promise<AtRiskRow[]> {
  const clients = await prisma.client.findMany({
    where: { status: { in: ["ACTIVE", "INACTIVE"] } },
    select: { id: true, name: true, createdAt: true, producer: { select: { name: true } }, ...HEALTH_INCLUDE },
  });

  const rows: AtRiskRow[] = [];
  for (const c of clients) {
    const signals = signalsFor(c);
    const health = clientHealth(signals);
    if (health.tier === "HEALTHY") continue;
    const topFactor = health.factors.slice().sort((a, b) => b.penalty - a.penalty)[0]?.label ?? null;
    rows.push({
      clientId: c.id,
      clientName: c.name,
      producerName: c.producer?.name ?? null,
      score: health.score,
      tier: health.tier,
      topFactor,
      activePolicyCount: signals.activePolicyCount,
      pastDueAmount: signals.pastDueAmount,
      recentClaimCount: signals.recentClaimCount,
    });
  }

  return rows.sort((a, b) => a.score - b.score);
}
