/**
 * Per-client retention / at-risk health score (Wave B).
 *
 * A 0–100 health score (higher = healthier) built from signals already
 * in the DB: claims frequency, AR/payment lateness, single-policy
 * concentration, renewal proximity, tenure, and recent cancellations.
 * The score starts at 100 and deducts weighted penalties; the tier
 * buckets it into healthy / watch / at-risk for worklists.
 *
 * Pure scoring function — unit-tested in tests/client-health.test.ts.
 */

export type ClientHealthSignals = {
  /** Count of active/bound policies with us. */
  activePolicyCount: number;
  /** Claims opened in the trailing 12 months. */
  recentClaimCount: number;
  /** Open AR balance past due (USD) across the client's invoices. */
  pastDueAmount: number;
  /** Max days past due on any open invoice (0 if none). */
  maxDaysPastDue: number;
  /** Policies that cancelled or non-renewed in the trailing 12 months. */
  recentCancellations: number;
  /** Days until the client's nearest policy renewal (null = none upcoming). */
  daysToNearestRenewal: number | null;
  /** Whole months the client has been with the agency. */
  tenureMonths: number;
};

export type HealthTier = "HEALTHY" | "WATCH" | "AT_RISK";

export type ClientHealth = {
  score: number; // 0–100, higher = healthier
  tier: HealthTier;
  /** Per-signal penalty breakdown (positive numbers = points deducted). */
  factors: Array<{ label: string; penalty: number }>;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Compute a client's health. Deterministic and side-effect-free.
 * Tiers: >=70 healthy, 45–69 watch, <45 at-risk.
 */
export function clientHealth(s: ClientHealthSignals): ClientHealth {
  const factors: Array<{ label: string; penalty: number }> = [];
  const push = (label: string, penalty: number) => {
    if (penalty > 0) factors.push({ label, penalty: Math.round(penalty) });
  };

  // Single-policy concentration — monoline accounts churn the easiest.
  if (s.activePolicyCount <= 0) {
    push("No active policies", 35);
  } else if (s.activePolicyCount === 1) {
    push("Single-policy account", 18);
  } else if (s.activePolicyCount === 2) {
    push("Only two lines", 6);
  }

  // Claims frequency — each recent claim is a loss-ratio and friction signal.
  push("Recent claims", clamp(s.recentClaimCount * 8, 0, 24));

  // AR lateness — both how late and how much.
  if (s.maxDaysPastDue > 90) push("Severely past-due balance", 22);
  else if (s.maxDaysPastDue > 60) push("60+ days past due", 16);
  else if (s.maxDaysPastDue > 30) push("30+ days past due", 10);
  else if (s.maxDaysPastDue > 0) push("Past-due balance", 5);
  if (s.pastDueAmount >= 5000) push("Large open balance", 8);
  else if (s.pastDueAmount >= 1000) push("Open balance", 4);

  // Recent cancellations / non-renewals — the loudest churn signal.
  push("Recent cancellations", clamp(s.recentCancellations * 18, 0, 40));

  // Renewal proximity — an imminent renewal raises the urgency of attention.
  if (s.daysToNearestRenewal != null && s.daysToNearestRenewal >= 0) {
    if (s.daysToNearestRenewal <= 30) push("Renewal within 30 days", 8);
    else if (s.daysToNearestRenewal <= 60) push("Renewal within 60 days", 4);
  }

  // Tenure — long-standing clients are stickier (a credit, not a penalty);
  // brand-new clients carry a small onboarding-risk penalty instead.
  let tenureCredit = 0;
  if (s.tenureMonths >= 36) tenureCredit = 5;
  else if (s.tenureMonths >= 12) tenureCredit = 3;
  else if (s.tenureMonths < 3) push("Newly onboarded", 5);

  const totalPenalty = factors.reduce((acc, f) => acc + f.penalty, 0);
  const score = clamp(100 - totalPenalty + tenureCredit, 0, 100);
  const tier: HealthTier = score >= 70 ? "HEALTHY" : score >= 45 ? "WATCH" : "AT_RISK";

  return { score, tier, factors };
}

export const HEALTH_TIER_LABELS: Record<HealthTier, string> = {
  HEALTHY: "Healthy",
  WATCH: "Watch",
  AT_RISK: "At risk",
};

export function healthTierTone(t: HealthTier): "green" | "amber" | "red" {
  switch (t) {
    case "HEALTHY": return "green";
    case "WATCH": return "amber";
    case "AT_RISK": return "red";
  }
}
