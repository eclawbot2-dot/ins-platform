/**
 * Renewal (X-date) pipeline logic. Pure functions over expiration
 * dates: bucketing for the dashboard (30/60/90), which policies need a
 * renewal record, and next-term date computation.
 */

import { addYears, daysUntil } from "./dates";
import type { PolicyStatus } from "@prisma/client";

export type RenewalBucket = "OVERDUE" | "30" | "60" | "90" | "LATER";

/** Bucket an expiration date relative to `asOf` for the dashboard tiles. */
export function renewalBucket(expirationDate: Date, asOf: Date = new Date()): RenewalBucket {
  const days = daysUntil(expirationDate, asOf);
  if (days < 0) return "OVERDUE";
  if (days <= 30) return "30";
  if (days <= 60) return "60";
  if (days <= 90) return "90";
  return "LATER";
}

/** Statuses that participate in the renewal pipeline. */
export const RENEWABLE_STATUSES: PolicyStatus[] = ["ACTIVE", "BOUND"];

/**
 * Does this policy need a renewal record created? Active/bound policies
 * expiring within `windowDays` (default 90) that don't already have one.
 */
export function needsRenewalRecord(
  policy: { status: PolicyStatus; expirationDate: Date },
  hasRenewalRecord: boolean,
  asOf: Date = new Date(),
  windowDays = 90,
): boolean {
  if (hasRenewalRecord) return false;
  if (!RENEWABLE_STATUSES.includes(policy.status)) return false;
  const days = daysUntil(policy.expirationDate, asOf);
  return days <= windowDays;
}

/** Next annual term [effective, expiration) following the current one. */
export function nextTerm(effectiveDate: Date, expirationDate: Date): { effectiveDate: Date; expirationDate: Date } {
  return {
    effectiveDate: expirationDate,
    expirationDate: addYears(expirationDate, 1),
  };
}

/**
 * Premium change % between expiring and renewal terms — the number the
 * remarketing decision hangs on. Returns null when expiring premium is 0.
 */
export function premiumChangePct(expiringPremium: number, renewalPremium: number): number | null {
  if (!Number.isFinite(expiringPremium) || expiringPremium === 0) return null;
  return Math.round(((renewalPremium - expiringPremium) / expiringPremium) * 1000) / 10;
}

/**
 * Remarket trigger: a renewal premium increase at/above `thresholdPct`
 * (default 10%) flags the account for remarketing.
 */
export function shouldRemarket(expiringPremium: number, renewalPremium: number, thresholdPct = 10): boolean {
  const change = premiumChangePct(expiringPremium, renewalPremium);
  if (change == null) return false;
  return change >= thresholdPct;
}
