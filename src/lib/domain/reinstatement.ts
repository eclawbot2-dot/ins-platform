/**
 * Reinstatement window logic (Wave B).
 *
 * A cancelled policy can be reinstated — returned to ACTIVE — within a
 * reasonable window after the cancellation date, provided the term has
 * not yet expired. Carriers commonly allow reinstatement within 30 days
 * of cancellation (sometimes with a lapse in coverage for the gap).
 * These are pure functions so they can be unit-tested and reused by the
 * staff action + detail page.
 */

import { daysBetween } from "./dates";

/** Default carrier reinstatement window, in days from the cancellation date. */
export const REINSTATEMENT_WINDOW_DAYS = 30;

export type ReinstatementEligibilityInput = {
  status: string;
  /** Cancellation date (when the policy went CANCELLED). */
  cancelledAt: Date | null | undefined;
  /** Policy term end — a fully-expired term can't be reinstated. */
  expirationDate: Date;
  /** Window length in days; defaults to REINSTATEMENT_WINDOW_DAYS. */
  windowDays?: number;
};

export type ReinstatementEligibility = {
  eligible: boolean;
  /** Days elapsed since cancellation (>= 0), null when not cancelled. */
  lapseDays: number | null;
  /** Days remaining in the reinstatement window (negative = window closed). */
  daysLeftInWindow: number | null;
  reason: string;
};

/**
 * Can this policy be reinstated as of `asOf`? Eligible only when it is
 * CANCELLED, the cancellation was within the window, and the policy term
 * has not yet ended. `lapseDays` is the coverage gap to record.
 */
export function reinstatementEligibility(
  input: ReinstatementEligibilityInput,
  asOf: Date = new Date(),
): ReinstatementEligibility {
  const windowDays = input.windowDays ?? REINSTATEMENT_WINDOW_DAYS;

  if (input.status !== "CANCELLED") {
    return { eligible: false, lapseDays: null, daysLeftInWindow: null, reason: "Only cancelled policies can be reinstated" };
  }
  if (!input.cancelledAt) {
    return { eligible: false, lapseDays: null, daysLeftInWindow: null, reason: "No cancellation date on record" };
  }

  const lapseDays = Math.max(0, daysBetween(input.cancelledAt, asOf));
  const daysLeftInWindow = windowDays - lapseDays;

  if (daysBetween(asOf, input.expirationDate) < 0) {
    return {
      eligible: false,
      lapseDays,
      daysLeftInWindow,
      reason: "Policy term has expired — write new business instead",
    };
  }
  if (daysLeftInWindow < 0) {
    return {
      eligible: false,
      lapseDays,
      daysLeftInWindow,
      reason: `Reinstatement window closed (${lapseDays} days since cancellation, limit ${windowDays})`,
    };
  }
  return {
    eligible: true,
    lapseDays,
    daysLeftInWindow,
    reason:
      lapseDays === 0
        ? "Eligible — no lapse in coverage"
        : `Eligible — ${lapseDays}-day lapse (${daysLeftInWindow} days left in window)`,
  };
}

/** A standard lapse-handling note from the computed lapse. */
export function lapseHandlingNote(lapseDays: number): string {
  if (lapseDays <= 0) return "No lapse in coverage — continuous from cancellation date.";
  return `${lapseDays}-day lapse: coverage gap from cancellation to reinstatement is excluded; new losses covered from the reinstatement date forward.`;
}
