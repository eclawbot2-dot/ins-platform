/**
 * Premium proration — earned premium, pro-rata and short-rate return
 * premium on cancellation. Day counts use UTC day math (see dates.ts)
 * so leap years are handled naturally: a 2024 annual term has 366 days
 * and each day earns 1/366 of premium.
 */

import { roundMoney } from "@/lib/money";
import { termDays, daysBetween } from "./dates";

/** Industry-standard short-rate cancellation penalty (10% of unearned). */
export const SHORT_RATE_PENALTY = 0.1;

/**
 * Premium earned from `effective` through `asOf` (exclusive), clamped
 * to [0, premium]. asOf before effective → 0; after expiration → full.
 */
export function earnedPremium(premium: number, effective: Date, expiration: Date, asOf: Date): number {
  const total = termDays(effective, expiration);
  if (total <= 0) return 0;
  const elapsed = Math.min(Math.max(daysBetween(effective, asOf), 0), total);
  return roundMoney(premium * (elapsed / total));
}

/** Unearned premium at `asOf` — the flat complement of earnedPremium. */
export function unearnedPremium(premium: number, effective: Date, expiration: Date, asOf: Date): number {
  return roundMoney(premium - earnedPremium(premium, effective, expiration, asOf));
}

/**
 * Return premium on a PRO-RATA cancellation (carrier- or
 * insurer-initiated): the full unearned premium comes back.
 */
export function proRataReturn(premium: number, effective: Date, expiration: Date, cancelDate: Date): number {
  return unearnedPremium(premium, effective, expiration, cancelDate);
}

/**
 * Return premium on a SHORT-RATE cancellation (insured-initiated):
 * unearned premium less the short-rate penalty.
 */
export function shortRateReturn(
  premium: number,
  effective: Date,
  expiration: Date,
  cancelDate: Date,
  penalty: number = SHORT_RATE_PENALTY,
): number {
  const unearned = unearnedPremium(premium, effective, expiration, cancelDate);
  return roundMoney(unearned * (1 - penalty));
}

/**
 * Prorated additional/return premium for a mid-term endorsement: the
 * annualized change × remaining-term fraction.
 */
export function prorateEndorsement(
  annualizedChange: number,
  effective: Date,
  expiration: Date,
  endorsementDate: Date,
): number {
  const total = termDays(effective, expiration);
  if (total <= 0) return 0;
  const remaining = Math.min(Math.max(daysBetween(endorsementDate, expiration), 0), total);
  return roundMoney(annualizedChange * (remaining / total));
}
