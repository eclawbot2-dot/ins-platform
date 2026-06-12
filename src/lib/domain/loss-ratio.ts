/**
 * Loss-ratio math (Wave B). Pure functions for the loss-ratio report.
 *
 * Incurred = paid + outstanding reserve. Loss ratio = incurred / earned
 * (or written) premium, as a percentage. A line/carrier is "high loss"
 * once the ratio crosses a threshold (the industry rule of thumb is a
 * 60–70% loss ratio before expenses).
 */

import { roundMoney } from "@/lib/money";

export const HIGH_LOSS_RATIO_PCT = 70;
export const ELEVATED_LOSS_RATIO_PCT = 50;

export type LossClaim = {
  paidAmount: number;
  reserveAmount: number;
};

/** Incurred loss for a single claim = paid + reserve. */
export function incurred(claim: LossClaim): number {
  return roundMoney(Math.max(0, claim.paidAmount) + Math.max(0, claim.reserveAmount));
}

/** Loss ratio as a 0+ percentage; null when there's no premium to divide by. */
export function lossRatioPct(incurredTotal: number, premium: number): number | null {
  if (premium <= 0) return null;
  return Math.round((incurredTotal / premium) * 1000) / 10;
}

export type LossTier = "LOW" | "ELEVATED" | "HIGH";

export function lossTier(ratioPct: number | null): LossTier {
  if (ratioPct == null) return "LOW";
  if (ratioPct >= HIGH_LOSS_RATIO_PCT) return "HIGH";
  if (ratioPct >= ELEVATED_LOSS_RATIO_PCT) return "ELEVATED";
  return "LOW";
}

export type LossRatioRow = {
  key: string;
  label: string;
  premium: number; // written/earned premium for the group
  policyCount: number;
  claimCount: number;
  paid: number;
  reserve: number;
  incurred: number;
  lossRatioPct: number | null;
  tier: LossTier;
};

export type LossRatioAccumulator = {
  premium: number;
  policyCount: number;
  claimCount: number;
  paid: number;
  reserve: number;
};

/** Finalize an accumulator into a report row. */
export function finalizeRow(key: string, label: string, acc: LossRatioAccumulator): LossRatioRow {
  const inc = roundMoney(acc.paid + acc.reserve);
  const ratio = lossRatioPct(inc, acc.premium);
  return {
    key,
    label,
    premium: roundMoney(acc.premium),
    policyCount: acc.policyCount,
    claimCount: acc.claimCount,
    paid: roundMoney(acc.paid),
    reserve: roundMoney(acc.reserve),
    incurred: inc,
    lossRatioPct: ratio,
    tier: lossTier(ratio),
  };
}
