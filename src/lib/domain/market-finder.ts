/**
 * Market finder (Wave D-final) — pure ranking logic.
 *
 * Given a target LOB (and optionally a state), rank the carriers a
 * producer can actually place the risk with. Inputs are the per-carrier
 * appetite rows joined with appointment status and the commission
 * schedule; output is an eligibility-ranked list so a producer can pick
 * the market that both WANTS the risk and pays the best.
 */

import type { AppointmentStatus, CarrierAppetite, LineOfBusiness } from "@prisma/client";

export type MarketCarrierInput = {
  carrierId: string;
  carrierName: string;
  appointmentStatus: AppointmentStatus;
  appetite: CarrierAppetite | null; // null = no appetite row for this LOB
  states: string | null; // comma-separated; null = all
  classNotes: string | null;
  newPct: number | null; // commission new %
  renewalPct: number | null;
  isMga: boolean;
};

export type MarketCarrierResult = MarketCarrierInput & {
  /** True when the carrier is appointed AND not a DECLINE appetite. */
  eligible: boolean;
  /** Ranking score (higher = better market). */
  score: number;
  /** Short eligibility reason for the UI. */
  reason: string;
};

const APPETITE_SCORE: Record<CarrierAppetite, number> = {
  PREFERRED: 40,
  STANDARD: 25,
  RESTRICTED: 10,
  DECLINE: -100,
};

/** Does this appetite row cover the requested state? Null states = all. */
export function appetiteCoversState(states: string | null, state: string | null): boolean {
  if (!states) return true;
  if (!state) return true; // no state filter requested
  const set = states
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return set.length === 0 || set.includes(state.trim().toUpperCase());
}

/**
 * Rank carriers for a target LOB/state. Appointed carriers with a
 * non-DECLINE appetite (or no appetite row at all, which is treated as
 * "unknown/standard") are eligible; preferred + higher commission rank
 * first. DECLINE rows and non-appointed carriers are returned too but
 * marked ineligible and sorted last, so a producer sees the full picture.
 */
export function rankMarkets(
  carriers: ReadonlyArray<MarketCarrierInput>,
  opts: { state?: string | null } = {},
): MarketCarrierResult[] {
  const state = opts.state ?? null;

  const scored = carriers.map((c): MarketCarrierResult => {
    const appointed = c.appointmentStatus === "APPOINTED";
    const stateOk = appetiteCoversState(c.states, state);
    const appetite = c.appetite;
    const declined = appetite === "DECLINE";

    let eligible = appointed && !declined && stateOk;
    let reason: string;
    if (!appointed) {
      reason = "Not appointed";
      eligible = false;
    } else if (declined) {
      reason = "Carrier declines this class";
    } else if (!stateOk) {
      reason = "Outside filed states";
      eligible = false;
    } else if (!appetite) {
      reason = "Appointed (no appetite row — confirm with underwriting)";
    } else {
      reason = appetite === "PREFERRED" ? "Preferred market" : appetite === "RESTRICTED" ? "Restricted / referral" : "Standard market";
    }

    let score = 0;
    if (appointed) score += 20;
    if (appetite) score += APPETITE_SCORE[appetite];
    else score += 15; // appointed, unknown appetite
    if (!stateOk) score -= 50;
    // Commission tilt: best new % nudges the ranking (max ~+15).
    score += Math.min(15, (c.newPct ?? 0) / 2);

    return { ...c, eligible, score, reason };
  });

  return scored.sort((a, b) => {
    // Eligible first, then by score, then by name for stability.
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.carrierName.localeCompare(b.carrierName);
  });
}

/** Count of eligible markets in a ranked list. */
export function eligibleCount(results: ReadonlyArray<MarketCarrierResult>): number {
  return results.filter((r) => r.eligible).length;
}

export type _LobMarker = LineOfBusiness; // re-export anchor for callers
