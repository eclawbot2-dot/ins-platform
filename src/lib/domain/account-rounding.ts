/**
 * Account-rounding / cross-sell engine (Wave B).
 *
 * Given a client's active lines of business (plus any prior-policy
 * X-dates we've captured), surface the standard cross-sell gaps an
 * agency works: monoline accounts, auto-without-home, home-without-
 * umbrella, the missing flood line in a flood note, etc. Output is a
 * ranked list of read-only suggestions with a rationale and an estimated
 * premium opportunity, so the client-360 panel and the agency-wide
 * worklist can both rank by dollars.
 *
 * Pure data + functions — unit-tested in tests/account-rounding.test.ts.
 */

import type { LineOfBusiness } from "@prisma/client";
import { PERSONAL_LOBS } from "@/lib/labels";

export type CrossSellInput = {
  /** Distinct LOBs the client currently has ACTIVE/BOUND/RENEWED with us. */
  activeLobs: LineOfBusiness[];
  /** Competitor lines we know about (from PriorPolicy X-dates). */
  priorLobs?: LineOfBusiness[];
  /** Whether the client is a business (commercial) account. */
  isBusiness?: boolean;
  /** Free-text notes hinting at exposures (e.g. "flood-prone", "teen driver"). */
  notes?: string | null;
};

export type CrossSellSuggestion = {
  /** Stable key for de-dup / one-click quote creation. */
  key: string;
  /** The line of business to propose. */
  lob: LineOfBusiness;
  /** Short title for the panel. */
  title: string;
  /** Why we're suggesting it. */
  rationale: string;
  /** Rough annual premium opportunity (USD) to rank by. */
  estPremium: number;
  /** 1 = highest priority signal. */
  priority: number;
};

/** Typical annual premium per line — coarse, for ranking only. */
const EST_PREMIUM: Partial<Record<LineOfBusiness, number>> = {
  AUTO: 1800,
  HOME: 2400,
  RENTERS: 300,
  UMBRELLA: 550,
  FLOOD: 700,
  LIFE: 1200,
  VALUABLE_ARTICLES: 450,
  PET: 400,
  BOAT: 800,
  MOTORCYCLE: 600,
  IDENTITY_THEFT: 180,
  GENERAL_LIABILITY: 5000,
  COMMERCIAL_PROPERTY: 6000,
  BOP: 3200,
  WORKERS_COMP: 8000,
  COMMERCIAL_AUTO: 6500,
  COMMERCIAL_UMBRELLA: 3500,
  CYBER: 2200,
  PROFESSIONAL: 3800,
  EPLI: 2500,
};

function est(lob: LineOfBusiness): number {
  return EST_PREMIUM[lob] ?? 1000;
}

function has(lobs: Set<LineOfBusiness>, lob: LineOfBusiness): boolean {
  return lobs.has(lob);
}

const FLOOD_HINT = /flood|coastal|wind|hurricane|low.?lying|flood.?prone|fema|surge/i;

/**
 * Produce ranked cross-sell suggestions for a client. Pure; no DB.
 * Suggestions are de-duplicated by LOB and sorted by priority then by
 * estimated premium (descending).
 */
export function crossSellSuggestions(input: CrossSellInput): CrossSellSuggestion[] {
  const active = new Set(input.activeLobs);
  const prior = new Set(input.priorLobs ?? []);
  const isBusiness = input.isBusiness ?? false;
  const notes = input.notes ?? "";
  const out: CrossSellSuggestion[] = [];

  const add = (s: Omit<CrossSellSuggestion, "estPremium"> & { estPremium?: number }) => {
    if (active.has(s.lob)) return; // already written with us
    if (out.some((o) => o.lob === s.lob)) return; // de-dup
    out.push({ ...s, estPremium: s.estPremium ?? est(s.lob) });
  };

  const personalCount = input.activeLobs.filter((l) => (PERSONAL_LOBS as string[]).includes(l)).length;

  if (!isBusiness) {
    // ── Personal-lines rounding ──
    const hasAuto = has(active, "AUTO");
    const hasHome = has(active, "HOME") || has(active, "CONDO");
    const hasRenters = has(active, "RENTERS");

    // Auto + Home but no Umbrella → the classic umbrella round.
    if (hasAuto && hasHome && !has(active, "UMBRELLA")) {
      add({
        key: "umbrella-from-auto-home",
        lob: "UMBRELLA",
        title: "Add a personal umbrella",
        rationale: "Has both auto and home with us — a $1M umbrella is inexpensive and closes the excess-liability gap.",
        priority: 1,
      });
    }

    // Has home but no flood, with a flood-prone note → flood.
    if (hasHome && !has(active, "FLOOD") && FLOOD_HINT.test(notes)) {
      add({
        key: "flood-from-home-note",
        lob: "FLOOD",
        title: "Add flood coverage",
        rationale: "Homeowners on file in a flood-exposed area — homeowners excludes flood; quote NFIP/private flood.",
        priority: 1,
      });
    }

    // Auto-only → suggest home or renters (own vs rent unknown → renters is the low-friction round).
    if (hasAuto && !hasHome && !hasRenters) {
      add({
        key: "home-from-auto",
        lob: "HOME",
        title: "Cross-sell homeowners",
        rationale: "Auto-only client — bundle a homeowners policy for a multi-policy discount and stickier retention.",
        priority: 2,
      });
      add({
        key: "renters-from-auto",
        lob: "RENTERS",
        title: "Offer renters (if renting)",
        rationale: "If they rent rather than own, a renters policy still earns the auto bundle discount.",
        priority: 3,
      });
    }

    // Home but no auto → cross-sell auto.
    if (hasHome && !hasAuto) {
      add({
        key: "auto-from-home",
        lob: "AUTO",
        title: "Cross-sell auto",
        rationale: "Homeowners on file without auto — moving the auto here unlocks the multi-policy discount.",
        priority: 2,
      });
    }

    // Has home/auto but no life → life is the standard round-out.
    if ((hasHome || hasAuto) && !has(active, "LIFE")) {
      add({
        key: "life-roundout",
        lob: "LIFE",
        title: "Review life insurance",
        rationale: "Established P&C household with no life line — schedule a needs-analysis conversation.",
        priority: 4,
      });
    }
  } else {
    // ── Commercial rounding ──
    const hasGL = has(active, "GENERAL_LIABILITY") || has(active, "BOP");
    const hasProp = has(active, "COMMERCIAL_PROPERTY") || has(active, "BOP");
    const hasWC = has(active, "WORKERS_COMP");
    const hasAuto = has(active, "COMMERCIAL_AUTO");

    if (hasGL && !hasWC) {
      add({
        key: "wc-from-gl",
        lob: "WORKERS_COMP",
        title: "Add workers' comp",
        rationale: "GL/BOP on file but no workers' comp — most businesses with employees are statutorily required to carry it.",
        priority: 1,
      });
    }
    if ((hasGL || hasProp) && !hasAuto) {
      add({
        key: "comm-auto-from-gl",
        lob: "COMMERCIAL_AUTO",
        title: "Add commercial auto",
        rationale: "Commercial account without an auto line — confirm owned/hired/non-owned auto exposure.",
        priority: 2,
      });
    }
    if (hasGL && !has(active, "COMMERCIAL_UMBRELLA")) {
      add({
        key: "comm-umbrella-from-gl",
        lob: "COMMERCIAL_UMBRELLA",
        title: "Add a commercial umbrella",
        rationale: "Primary GL in place — an excess/umbrella layer is a low-friction round for higher-limit contracts.",
        priority: 3,
      });
    }
    if ((hasGL || hasProp) && !has(active, "CYBER")) {
      add({
        key: "cyber-roundout",
        lob: "CYBER",
        title: "Add cyber liability",
        rationale: "No cyber line on a commercial account — nearly every business has a data/ransomware exposure.",
        priority: 4,
      });
    }
  }

  // ── X-date win-backs: competitor lines we don't write yet ──
  for (const lob of prior) {
    if (active.has(lob)) continue;
    add({
      key: `xdate-${lob}`,
      lob,
      title: `Win back ${lob.replace(/_/g, " ").toLowerCase()}`,
      rationale: "Competitor coverage on file (X-date captured) — quote it at their renewal to consolidate the account.",
      priority: 2,
    });
  }

  // ── Mono-line flag: a single line is a retention risk and a round-out opportunity ──
  if (input.activeLobs.length === 1 && !isBusiness && personalCount === 1) {
    // The specific suggestions above already cover most monoline cases;
    // this is a catch-all nudge if nothing fired.
    if (out.length === 0) {
      out.push({
        key: "monoline-review",
        lob: input.activeLobs[0]!,
        title: "Mono-line account — schedule a coverage review",
        rationale: "Single policy with us. Mono-line clients lapse the easiest; a full review usually surfaces a round-out.",
        estPremium: est(input.activeLobs[0]!) * 0.5,
        priority: 5,
      });
    }
  }

  return out.sort((a, b) => a.priority - b.priority || b.estPremium - a.estPremium);
}

/** Total estimated premium opportunity across a suggestion list. */
export function totalOpportunity(suggestions: ReadonlyArray<CrossSellSuggestion>): number {
  return suggestions.reduce((acc, s) => acc + s.estPremium, 0);
}
