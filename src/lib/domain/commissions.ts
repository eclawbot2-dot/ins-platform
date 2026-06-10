/**
 * Commission math — expected commission, schedule lookup, producer
 * splits, and carrier-statement reconciliation. Pure functions; all
 * amounts are plain numbers in dollars (callers convert Decimal via
 * toNum()).
 */

import { roundMoney } from "@/lib/money";
import type { LineOfBusiness } from "@prisma/client";

// ── Expected commission ──────────────────────────────────────────────

/** premium × rate% → commission dollars, rounded to cents. */
export function expectedCommission(premium: number, ratePct: number): number {
  if (!Number.isFinite(premium) || !Number.isFinite(ratePct)) return 0;
  return roundMoney(premium * (ratePct / 100));
}

export type ScheduleRate = {
  lineOfBusiness: LineOfBusiness;
  newPct: number;
  renewalPct: number;
};

/**
 * Look up the commission rate for (lob, new-vs-renewal) on a carrier's
 * schedule. Returns null when the carrier has no schedule for the LOB —
 * callers fall back to a manually entered rate.
 */
export function scheduleRateFor(
  schedules: ReadonlyArray<ScheduleRate>,
  lob: LineOfBusiness,
  isNewBusiness: boolean,
): number | null {
  const row = schedules.find((s) => s.lineOfBusiness === lob);
  if (!row) return null;
  return isNewBusiness ? row.newPct : row.renewalPct;
}

// ── Producer splits ──────────────────────────────────────────────────

export type SplitInput = { producerId: string; pct: number };
export type SplitAmount = { producerId: string; pct: number; amount: number };

/** True iff split percentages are each in (0, 100] and sum to exactly 100. */
export function validateSplits(splits: ReadonlyArray<SplitInput>): boolean {
  if (splits.length === 0) return false;
  if (splits.some((s) => !Number.isFinite(s.pct) || s.pct <= 0 || s.pct > 100)) return false;
  const sum = splits.reduce((acc, s) => acc + s.pct, 0);
  return Math.abs(sum - 100) < 0.001;
}

/**
 * Allocate a commission amount across producer splits. Rounds each
 * share to cents and assigns the residual cent(s) to the LARGEST share
 * so the parts always sum exactly to the whole.
 */
export function splitAmounts(total: number, splits: ReadonlyArray<SplitInput>): SplitAmount[] {
  if (splits.length === 0) return [];
  const shares = splits.map((s) => ({
    producerId: s.producerId,
    pct: s.pct,
    amount: roundMoney(total * (s.pct / 100)),
  }));
  const allocated = roundMoney(shares.reduce((acc, s) => acc + s.amount, 0));
  const residual = roundMoney(total - allocated);
  if (residual !== 0) {
    const largest = shares.reduce((max, s) => (s.pct > max.pct ? s : max), shares[0]!);
    largest.amount = roundMoney(largest.amount + residual);
  }
  return shares;
}

// ── Statement reconciliation ─────────────────────────────────────────

/** Variance below this many dollars is treated as a rounding match. */
export const VARIANCE_TOLERANCE = 1.0;

export type ReconcilablePolicy = {
  id: string;
  policyNumber: string;
  expectedCommission: number;
};

export type StatementLineInput = {
  policyNumber: string;
  commissionAmount: number;
};

export type ReconcileResult = {
  policyId: string | null;
  matchStatus: "UNMATCHED" | "MATCHED" | "VARIANCE";
  varianceAmount: number | null;
};

/** Normalize a policy number for matching: trim, uppercase, drop spaces/dashes. */
export function normalizePolicyNumber(n: string): string {
  return n.trim().toUpperCase().replace(/[\s-]/g, "");
}

/**
 * Reconcile one statement line against the expected-commission table.
 *   - no policy with that number          → UNMATCHED
 *   - |actual - expected| <= tolerance    → MATCHED (variance null)
 *   - otherwise                           → VARIANCE (variance = actual - expected)
 */
export function reconcileLine(
  line: StatementLineInput,
  policies: ReadonlyArray<ReconcilablePolicy>,
  tolerance: number = VARIANCE_TOLERANCE,
): ReconcileResult {
  const wanted = normalizePolicyNumber(line.policyNumber);
  const policy = policies.find((p) => normalizePolicyNumber(p.policyNumber) === wanted);
  if (!policy) return { policyId: null, matchStatus: "UNMATCHED", varianceAmount: null };
  const variance = roundMoney(line.commissionAmount - policy.expectedCommission);
  if (Math.abs(variance) <= tolerance) {
    return { policyId: policy.id, matchStatus: "MATCHED", varianceAmount: null };
  }
  return { policyId: policy.id, matchStatus: "VARIANCE", varianceAmount: variance };
}

/** Summarize a reconciled statement for the header strip. */
export function reconcileSummary(
  results: ReadonlyArray<{ matchStatus: string; varianceAmount: number | null }>,
): { total: number; matched: number; variance: number; unmatched: number; netVariance: number } {
  let matched = 0;
  let variance = 0;
  let unmatched = 0;
  let netVariance = 0;
  for (const r of results) {
    if (r.matchStatus === "MATCHED") matched += 1;
    else if (r.matchStatus === "VARIANCE") {
      variance += 1;
      netVariance += r.varianceAmount ?? 0;
    } else unmatched += 1;
  }
  return { total: results.length, matched, variance, unmatched, netVariance: roundMoney(netVariance) };
}
