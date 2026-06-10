/**
 * Retention metrics — policy retention rate over a period, the
 * headline number every agency owner watches.
 */

export type RetentionInput = {
  /** Policies whose terms expired in the period and were renewed. */
  renewed: number;
  /** Policies whose terms expired in the period and were lost
   *  (cancelled / non-renewed / expired without renewal). */
  lost: number;
};

/** renewed / (renewed + lost) as a 0–100 percentage; null when no expirations. */
export function retentionRate({ renewed, lost }: RetentionInput): number | null {
  const total = renewed + lost;
  if (total === 0) return null;
  return Math.round((renewed / total) * 1000) / 10;
}

export type PolicyOutcome = {
  status: string;
  /** Did a renewal policy chain off this one? */
  hasRenewalPolicy: boolean;
};

/**
 * Classify an expired-term policy as renewed vs lost. RENEWED status or
 * a renewal policy chained off it counts as retained; CANCELLED /
 * NON_RENEWED / EXPIRED without a successor counts as lost. Still-
 * active terms are excluded (return null).
 */
export function classifyOutcome(p: PolicyOutcome): "RENEWED" | "LOST" | null {
  if (p.status === "RENEWED" || p.hasRenewalPolicy) return "RENEWED";
  if (p.status === "CANCELLED" || p.status === "NON_RENEWED" || p.status === "EXPIRED") return "LOST";
  return null;
}
