/**
 * Household grouping logic (Wave D-final) — pure aggregation.
 *
 * A household is the family/unit view. Two pure concerns live here:
 *
 *   1. householdCrossSell — run account-rounding ACROSS every member's
 *      combined book (so an auto on dad + a home on mom surfaces the
 *      umbrella round ONCE for the household, not a false monoline flag
 *      per person), plus a multi-policy / multi-member discount nudge.
 *
 *   2. dedupHouseholdRecipients — the touchpoint engine must not send the
 *      same household-level appreciation (holiday, anniversary, NPS) to
 *      two people in the same house. This picks ONE recipient per
 *      household for the de-duplicated categories.
 */

import type { LineOfBusiness, TouchpointCategory } from "@prisma/client";
import {
  crossSellSuggestions,
  type CrossSellSuggestion,
} from "./account-rounding";

export type HouseholdMemberBook = {
  clientId: string;
  clientName: string;
  isBusiness: boolean;
  notes?: string | null;
  activeLobs: LineOfBusiness[];
  priorLobs?: LineOfBusiness[];
};

export type HouseholdCrossSell = {
  /** De-duplicated union of every member's active LOBs. */
  combinedLobs: LineOfBusiness[];
  /** Ranked suggestions for the household as a whole. */
  suggestions: CrossSellSuggestion[];
  /** True when 2+ members each have a policy but aren't on a multi-policy discount yet. */
  multiPolicyDiscountOpportunity: boolean;
  memberCount: number;
  policyCarryingMembers: number;
};

/**
 * Account-rounding across a household. We union every member's active
 * LOBs and run the engine ONCE so cross-member rounds (umbrella from a
 * split auto/home, e.g.) surface and per-member monoline false-positives
 * are suppressed. A multi-policy-discount opportunity is flagged when 2+
 * members each carry at least one policy.
 */
export function householdCrossSell(members: ReadonlyArray<HouseholdMemberBook>): HouseholdCrossSell {
  const combined = new Set<LineOfBusiness>();
  const prior = new Set<LineOfBusiness>();
  const notes: string[] = [];
  let anyBusiness = false;
  let policyCarryingMembers = 0;

  for (const m of members) {
    if (m.activeLobs.length > 0) policyCarryingMembers += 1;
    for (const lob of m.activeLobs) combined.add(lob);
    for (const lob of m.priorLobs ?? []) prior.add(lob);
    if (m.notes) notes.push(m.notes);
    if (m.isBusiness) anyBusiness = true;
  }

  const combinedLobs = Array.from(combined);
  const suggestions = crossSellSuggestions({
    activeLobs: combinedLobs,
    priorLobs: Array.from(prior),
    isBusiness: anyBusiness,
    notes: notes.join(" \n "),
  });

  return {
    combinedLobs,
    suggestions,
    multiPolicyDiscountOpportunity: policyCarryingMembers >= 2,
    memberCount: members.length,
    policyCarryingMembers,
  };
}

/**
 * Categories whose touchpoints are household-level and must NOT
 * double-send to members of the same household. Transactional categories
 * (RENEWAL, PAYMENT, CLAIM — tied to a specific policy/invoice/claim that
 * belongs to ONE member) are intentionally NOT de-duplicated.
 */
export const HOUSEHOLD_DEDUP_CATEGORIES: TouchpointCategory[] = [
  "APPRECIATION",
  "SATISFACTION",
];

export function isHouseholdDedupCategory(category: TouchpointCategory): boolean {
  return HOUSEHOLD_DEDUP_CATEGORIES.includes(category);
}

export type DedupCandidate = {
  clientId: string;
  householdId: string | null;
  /** Lower = preferred recipient (e.g. PRIMARY role ranks 0). */
  preferenceRank: number;
};

/**
 * Given the candidate recipients for ONE household-level template run,
 * return the set of clientIds that SHOULD receive it. Clients with no
 * household pass through untouched; within a household, only the single
 * highest-preference member (lowest rank, ties broken by clientId for
 * determinism) is kept.
 */
export function dedupHouseholdRecipients(
  candidates: ReadonlyArray<DedupCandidate>,
): Set<string> {
  const keep = new Set<string>();
  const bestByHousehold = new Map<string, DedupCandidate>();

  for (const c of candidates) {
    if (!c.householdId) {
      keep.add(c.clientId);
      continue;
    }
    const current = bestByHousehold.get(c.householdId);
    if (
      !current ||
      c.preferenceRank < current.preferenceRank ||
      (c.preferenceRank === current.preferenceRank && c.clientId < current.clientId)
    ) {
      bestByHousehold.set(c.householdId, c);
    }
  }
  for (const winner of bestByHousehold.values()) keep.add(winner.clientId);
  return keep;
}

/** Preference rank by household role — PRIMARY wins, then spouse/partner, etc. */
export function householdRoleRank(role: string): number {
  switch (role) {
    case "PRIMARY": return 0;
    case "SPOUSE": return 1;
    case "PARTNER": return 2;
    case "PARENT": return 3;
    case "CHILD": return 4;
    case "DEPENDENT": return 5;
    default: return 6;
  }
}
