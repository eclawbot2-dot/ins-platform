/**
 * X-date (prior-policy expiration) logic — the cross-sell / win-back
 * trigger. A PriorPolicy's `expirationDate` is when a prospect's or
 * client's competitor coverage lapses; that's the moment to fire a
 * remarketing touch. Pure functions; unit-tested in tests/xdates.test.ts.
 */

import { daysUntil } from "./dates";

/** Window buckets for the "X-dates due" worklist + dashboard tile. */
export type XDateBucket = "OVERDUE" | "DUE_30" | "DUE_60" | "DUE_90" | "LATER";

/**
 * Bucket an X-date relative to `asOf`. An X-date in the past is OVERDUE
 * (the renewal window has opened — act now, the competitor policy is
 * about to / has lapsed).
 */
export function xDateBucket(expirationDate: Date, asOf: Date = new Date()): XDateBucket {
  const days = daysUntil(expirationDate, asOf);
  if (days < 0) return "OVERDUE";
  if (days <= 30) return "DUE_30";
  if (days <= 60) return "DUE_60";
  if (days <= 90) return "DUE_90";
  return "LATER";
}

/**
 * Is an X-date "due" within `windowDays` (default 90)? Includes overdue
 * X-dates (negative days) since those are the highest-priority touches.
 */
export function isXDateDue(expirationDate: Date, asOf: Date = new Date(), windowDays = 90): boolean {
  return daysUntil(expirationDate, asOf) <= windowDays;
}

export type XDateLike = { expirationDate: Date };

/**
 * Filter + sort a set of X-dates to the ones due within `windowDays`,
 * soonest (most overdue) first — the worklist order.
 */
export function dueXDates<T extends XDateLike>(items: ReadonlyArray<T>, asOf: Date = new Date(), windowDays = 90): T[] {
  return items
    .filter((x) => isXDateDue(x.expirationDate, asOf, windowDays))
    .sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime());
}

/** Count X-dates per bucket for the dashboard tile (e.g. "2 / 3 / 1"). */
export function bucketCounts<T extends XDateLike>(
  items: ReadonlyArray<T>,
  asOf: Date = new Date(),
): Record<XDateBucket, number> {
  const counts: Record<XDateBucket, number> = { OVERDUE: 0, DUE_30: 0, DUE_60: 0, DUE_90: 0, LATER: 0 };
  for (const x of items) counts[xDateBucket(x.expirationDate, asOf)] += 1;
  return counts;
}
