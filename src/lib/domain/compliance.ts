/**
 * Compliance helpers — license / appointment / E&O expiration alerting
 * and CE-credit progress. Dashboard surfaces anything expiring within
 * ALERT_WINDOW_DAYS.
 */

import { daysUntil } from "./dates";

export const ALERT_WINDOW_DAYS = 60;

export type ExpirationSeverity = "EXPIRED" | "CRITICAL" | "WARNING" | "OK";

/**
 * Severity of an expiration date:
 *   expired            → EXPIRED
 *   within 30 days     → CRITICAL
 *   within window (60) → WARNING
 *   otherwise          → OK
 */
export function expirationSeverity(
  expiresAt: Date,
  asOf: Date = new Date(),
  windowDays: number = ALERT_WINDOW_DAYS,
): ExpirationSeverity {
  const days = daysUntil(expiresAt, asOf);
  if (days < 0) return "EXPIRED";
  if (days <= 30) return "CRITICAL";
  if (days <= windowDays) return "WARNING";
  return "OK";
}

export function isExpiringSoon(expiresAt: Date, asOf: Date = new Date(), windowDays = ALERT_WINDOW_DAYS): boolean {
  return expirationSeverity(expiresAt, asOf, windowDays) !== "OK";
}

export type CeProgress = {
  earned: number;
  required: number;
  remaining: number;
  pct: number;
  complete: boolean;
};

/** CE-hours progress toward a license's requirement. */
export function ceProgress(earnedHours: number, requiredHours: number): CeProgress {
  const earned = Math.max(0, earnedHours);
  const required = Math.max(0, requiredHours);
  const remaining = Math.max(0, required - earned);
  const pct = required === 0 ? 100 : Math.min(100, Math.round((earned / required) * 100));
  return { earned, required, remaining, pct, complete: remaining === 0 };
}
