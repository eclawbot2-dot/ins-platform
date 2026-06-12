/**
 * Deterministic coverage gap-rule engine (AI Compare — backbone).
 *
 * This is the part of the compare tool that has REAL value with NO API
 * key: given a structured set of coverages for a line of business, it
 * compares them against (a) the per-LOB coverage-template baseline from
 * Wave A (what a complete policy of this line SHOULD carry) and (b) a
 * maintainable set of best-practice thresholds (auto liability minimums,
 * UM/UIM presence, homeowners replacement-cost / water-backup, umbrella
 * when assets warrant, etc).
 *
 * Output is a list of findings (MISSING / UNDER_LIMIT / PRESENT_OK /
 * INFO) each with a severity and a plain-English "why it matters", plus
 * an overall 0–100 coverage score and letter grade. The AI layer ENRICHES
 * the narrative on top of this; the rules provide the deterministic
 * skeleton so staff who key coverages by hand still get a real gap report.
 *
 * Pure data + functions — unit-tested in tests/coverage-gap-rules.test.ts.
 * No DB, no network, no `Decimal` — callers pass plain numbers.
 */

import type { LineOfBusiness } from "@prisma/client";
import { coveragesForLob } from "@/lib/domain/coverage-templates";

/** A single extracted coverage line, normalized to plain numbers. */
export type AnalyzedCoverage = {
  /** Template code if known (e.g. "BI", "COV_A"); else a free label key. */
  code?: string | null;
  label: string;
  /** Single limit amount where applicable (USD). */
  limitAmount?: number | null;
  /** Free-text limit (e.g. "100/300/100") when not a single number. */
  limitText?: string | null;
  /** Per-occurrence limit (liability). */
  perOccurrence?: number | null;
  /** Aggregate limit (liability). */
  aggregate?: number | null;
  /** Deductible amount (USD). */
  deductibleAmount?: number | null;
  deductibleText?: string | null;
};

/** Optional context that sharpens the rules (assets → umbrella, etc). */
export type GapContext = {
  /** Estimated household net worth / assets at risk (USD), if known. */
  estimatedAssets?: number | null;
  /** Whether an umbrella policy exists elsewhere (suppresses the umbrella gap). */
  hasUmbrella?: boolean;
  /** Dwelling replacement cost (USD) for HOME under-insurance checks. */
  dwellingReplacementCost?: number | null;
  /** Free-text exposures note (flood-prone, teen driver, home business…). */
  notes?: string | null;
};

export type GapSeverity = "critical" | "high" | "medium" | "low" | "info";

export type GapFindingKind = "MISSING" | "UNDER_LIMIT" | "PRESENT_OK" | "INFO";

export type GapFinding = {
  /** Stable key for de-dup / UI. */
  key: string;
  kind: GapFindingKind;
  severity: GapSeverity;
  /** Coverage code or rule key this finding is about. */
  code: string;
  /** Human label of the coverage / topic. */
  label: string;
  /** Plain-English explanation of why it matters. */
  detail: string;
  /** What we found (e.g. "100/300", "no UM coverage"), when relevant. */
  found?: string;
  /** What good looks like (e.g. "≥ 100/300/100"). */
  recommended?: string;
};

export type GapAnalysisResult = {
  lineOfBusiness: LineOfBusiness;
  findings: GapFinding[];
  /** 0–100. Higher is better-rounded coverage. */
  score: number;
  /** Letter grade derived from the score. */
  grade: "A" | "B" | "C" | "D" | "F";
  /** Count of MISSING/UNDER_LIMIT findings by severity. */
  gapCount: number;
};

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Parse a split-limit string like "100/300/100" or "$100k/$300k" into
 * its component thousands. Returns null when it isn't a split limit.
 * Numbers are interpreted in THOUSANDS when ≤ 1000 (insurance shorthand),
 * otherwise taken literally (e.g. "100000/300000").
 */
export function parseSplitLimit(text: string | null | undefined): number[] | null {
  if (!text) return null;
  const parts = text
    .split("/")
    .map((p) => p.replace(/[^0-9.kKmM]/g, "").trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const nums = parts.map((p) => {
    const m = /^([0-9.]+)([kKmM]?)$/.exec(p);
    if (!m) return NaN;
    let n = parseFloat(m[1]!);
    const suffix = m[2]?.toLowerCase();
    if (suffix === "m") n *= 1_000_000;
    else if (suffix === "k") n *= 1_000;
    else if (n <= 1000) n *= 1_000; // bare shorthand: 100 → 100,000
    return n;
  });
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return nums;
}

/** Coverage codes a policy actually carries (with a usable value). */
function presentCodes(coverages: AnalyzedCoverage[]): Set<string> {
  const set = new Set<string>();
  for (const c of coverages) {
    const hasValue =
      (c.limitAmount != null && c.limitAmount > 0) ||
      (c.perOccurrence != null && c.perOccurrence > 0) ||
      (c.aggregate != null && c.aggregate > 0) ||
      (c.limitText != null && c.limitText.trim() !== "") ||
      (c.deductibleAmount != null && c.deductibleAmount > 0) ||
      (c.deductibleText != null && c.deductibleText.trim() !== "");
    if (hasValue && c.code) set.add(c.code);
  }
  return set;
}

function findByCode(coverages: AnalyzedCoverage[], code: string): AnalyzedCoverage | undefined {
  return coverages.find((c) => c.code === code);
}

const SEVERITY_WEIGHT: Record<GapSeverity, number> = {
  critical: 28,
  high: 16,
  medium: 8,
  low: 3,
  info: 0,
};

function gradeFor(score: number): GapAnalysisResult["grade"] {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

const fmtUsd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : `$${n.toLocaleString("en-US")}`;

// ── Line-specific best-practice rules ────────────────────────────────

/** AUTO: liability minimums, UM/UIM, med-pay, comp/coll. */
function autoRules(cov: AnalyzedCoverage[], ctx: GapContext, out: GapFinding[]): void {
  // Bodily injury — recommend at least 100/300.
  const bi = findByCode(cov, "BI");
  const biSplit = parseSplitLimit(bi?.limitText);
  if (!bi || (!biSplit && bi.limitAmount == null)) {
    out.push({
      key: "auto-bi-missing",
      kind: "MISSING",
      severity: "critical",
      code: "BI",
      label: "Bodily injury liability",
      detail:
        "No bodily-injury liability limit found. This is the core auto coverage — it pays for injuries you cause to others and is required to drive legally in nearly every state.",
      recommended: "≥ 100/300",
    });
  } else if (biSplit && (biSplit[0]! < 100_000 || (biSplit[1] ?? 0) < 300_000)) {
    out.push({
      key: "auto-bi-low",
      kind: "UNDER_LIMIT",
      severity: "high",
      code: "BI",
      label: "Bodily injury liability",
      detail:
        "Bodily-injury limits are below the 100/300 the agency recommends. A serious at-fault accident can easily exceed low state-minimum limits, exposing personal assets.",
      found: `${Math.round(biSplit[0]! / 1000)}/${Math.round((biSplit[1] ?? 0) / 1000)}`,
      recommended: "≥ 100/300",
    });
  } else {
    out.push({ key: "auto-bi-ok", kind: "PRESENT_OK", severity: "info", code: "BI", label: "Bodily injury liability", detail: "Liability limits meet the recommended 100/300 baseline." });
  }

  // UM/UIM presence.
  const um = findByCode(cov, "UM");
  const umSplit = parseSplitLimit(um?.limitText);
  if (!um || (!umSplit && um.limitAmount == null)) {
    out.push({
      key: "auto-um-missing",
      kind: "MISSING",
      severity: "high",
      code: "UM",
      label: "Uninsured/underinsured motorist",
      detail:
        "No uninsured/underinsured motorist coverage found. Roughly 1 in 8 drivers is uninsured — UM/UIM pays YOUR injuries when an at-fault driver can't.",
      recommended: "Match BI limits",
    });
  } else {
    out.push({ key: "auto-um-ok", kind: "PRESENT_OK", severity: "info", code: "UM", label: "Uninsured/underinsured motorist", detail: "UM/UIM coverage is in place." });
  }

  // Medical payments.
  if (!findByCode(cov, "MED")) {
    out.push({
      key: "auto-med-missing",
      kind: "MISSING",
      severity: "low",
      code: "MED",
      label: "Medical payments",
      detail: "No medical-payments coverage — a low-cost add-on that covers medical bills for you and your passengers regardless of fault.",
      recommended: "$5,000",
    });
  }

  // Comp/collision — informational (older paid-off cars may drop these).
  const hasComp = findByCode(cov, "COMP");
  const hasColl = findByCode(cov, "COLL");
  if (!hasComp || !hasColl) {
    out.push({
      key: "auto-physical-damage",
      kind: "INFO",
      severity: "info",
      code: hasComp ? "COLL" : "COMP",
      label: "Physical damage (comp/collision)",
      detail:
        "Comprehensive and/or collision coverage is not present. This is fine for an older paid-off vehicle, but if the car is financed or leased the lender requires it — confirm with the client.",
    });
  }
}

/** HOME: dwelling presence/adequacy, replacement cost, liability, water backup, umbrella when assets warrant. */
function homeRules(cov: AnalyzedCoverage[], ctx: GapContext, out: GapFinding[]): void {
  const covA = findByCode(cov, "COV_A");
  if (!covA || (covA.limitAmount == null && !covA.limitText)) {
    out.push({
      key: "home-cova-missing",
      kind: "MISSING",
      severity: "critical",
      code: "COV_A",
      label: "Coverage A — Dwelling",
      detail: "No dwelling (Coverage A) limit found. This is the amount available to rebuild the home — the foundation of a homeowners policy.",
    });
  } else if (
    ctx.dwellingReplacementCost != null &&
    covA.limitAmount != null &&
    covA.limitAmount > 0 &&
    covA.limitAmount < ctx.dwellingReplacementCost * 0.9
  ) {
    out.push({
      key: "home-cova-underinsured",
      kind: "UNDER_LIMIT",
      severity: "high",
      code: "COV_A",
      label: "Coverage A — Dwelling",
      detail:
        "The dwelling limit is more than 10% below the estimated cost to rebuild. After a total loss the homeowner would have to cover the shortfall out of pocket; many policies also penalize underinsurance via a coinsurance clause.",
      found: fmtUsd(covA.limitAmount),
      recommended: `≥ ${fmtUsd(Math.round(ctx.dwellingReplacementCost))}`,
    });
  } else {
    out.push({ key: "home-cova-ok", kind: "PRESENT_OK", severity: "info", code: "COV_A", label: "Coverage A — Dwelling", detail: "Dwelling limit is present." });
  }

  // Personal liability (Coverage E).
  const covE = findByCode(cov, "COV_E");
  if (!covE || (covE.limitAmount == null && !covE.limitText)) {
    out.push({
      key: "home-cove-missing",
      kind: "MISSING",
      severity: "high",
      code: "COV_E",
      label: "Coverage E — Personal liability",
      detail: "No personal-liability limit found. This protects against lawsuits for injuries or property damage you're responsible for — recommend at least $300,000.",
      recommended: "≥ $300,000",
    });
  } else if (covE.limitAmount != null && covE.limitAmount > 0 && covE.limitAmount < 300_000) {
    out.push({
      key: "home-cove-low",
      kind: "UNDER_LIMIT",
      severity: "medium",
      code: "COV_E",
      label: "Coverage E — Personal liability",
      detail: "Personal-liability limit is below the recommended $300,000. Raising it is inexpensive and is a prerequisite for most umbrella policies.",
      found: fmtUsd(covE.limitAmount),
      recommended: "≥ $300,000",
    });
  }

  // Water/sewer backup endorsement — commonly missing, commonly painful.
  const hasWaterBackup = cov.some(
    (c) => /water.?back|sewer|sump|drain/i.test(c.label) || c.code === "WATER_BACKUP",
  );
  if (!hasWaterBackup) {
    out.push({
      key: "home-water-backup",
      kind: "MISSING",
      severity: "medium",
      code: "WATER_BACKUP",
      label: "Water/sewer backup",
      detail:
        "No water/sewer backup endorsement detected. A standard homeowners policy excludes backup of sewers and drains — a frequent and expensive basement claim. This is a low-cost endorsement.",
    });
  }

  // Wind/hail deductible — info (coastal exposure).
  if (!findByCode(cov, "WIND_HAIL") && /coast|wind|hail|hurricane/i.test(ctx.notes ?? "")) {
    out.push({
      key: "home-wind-hail",
      kind: "INFO",
      severity: "info",
      code: "WIND_HAIL",
      label: "Wind/hail deductible",
      detail: "Coastal/wind exposure noted but no separate wind/hail deductible found — confirm whether wind is covered under the all-perils deductible or excluded.",
    });
  }

  // Flood is excluded from HO — surface when flood-prone.
  if (/flood|coastal|surge|fema|low.?lying/i.test(ctx.notes ?? "")) {
    out.push({
      key: "home-flood-excluded",
      kind: "MISSING",
      severity: "high",
      code: "FLOOD",
      label: "Flood (separate policy)",
      detail: "Homeowners policies exclude flood. A flood-exposed note is on file — recommend a separate NFIP or private flood policy.",
    });
  }

  // Umbrella recommendation when assets warrant.
  if (!ctx.hasUmbrella && (ctx.estimatedAssets ?? 0) >= 500_000) {
    out.push({
      key: "home-umbrella-rec",
      kind: "MISSING",
      severity: "medium",
      code: "UMBRELLA",
      label: "Personal umbrella",
      detail:
        "Estimated assets at or above $500,000 with no umbrella on file. A $1M umbrella sits above the home and auto liability for a low premium and protects accumulated wealth from a large judgment.",
      recommended: "≥ $1M umbrella",
    });
  }
}

/** Renters/Condo — lighter personal-lines checks. */
function rentersRules(cov: AnalyzedCoverage[], _ctx: GapContext, out: GapFinding[]): void {
  if (!findByCode(cov, "COV_C")) {
    out.push({
      key: "renters-covc-missing",
      kind: "MISSING",
      severity: "high",
      code: "COV_C",
      label: "Coverage C — Personal property",
      detail: "No personal-property limit found — the core of a renters policy. It replaces belongings after a covered loss.",
    });
  }
  if (!findByCode(cov, "COV_E")) {
    out.push({
      key: "renters-cove-missing",
      kind: "MISSING",
      severity: "medium",
      code: "COV_E",
      label: "Coverage E — Personal liability",
      detail: "No personal-liability coverage found — recommend at least $100,000 for tenant liability.",
      recommended: "≥ $100,000",
    });
  }
}

/** General liability / BOP — occurrence + aggregate adequacy. */
function glRules(cov: AnalyzedCoverage[], _ctx: GapContext, out: GapFinding[]): void {
  const occ = findByCode(cov, "GL_OCC");
  if (!occ || (occ.limitAmount == null && occ.perOccurrence == null)) {
    out.push({
      key: "gl-occ-missing",
      kind: "MISSING",
      severity: "critical",
      code: "GL_OCC",
      label: "Each occurrence",
      detail: "No per-occurrence general-liability limit found — recommend at least $1,000,000 per occurrence.",
      recommended: "≥ $1,000,000",
    });
  } else {
    const v = occ.limitAmount ?? occ.perOccurrence ?? 0;
    if (v > 0 && v < 1_000_000) {
      out.push({
        key: "gl-occ-low",
        kind: "UNDER_LIMIT",
        severity: "high",
        code: "GL_OCC",
        label: "Each occurrence",
        detail: "Per-occurrence GL limit is below the $1M most contracts and landlords require.",
        found: fmtUsd(v),
        recommended: "≥ $1,000,000",
      });
    }
  }
  const agg = findByCode(cov, "GL_AGG");
  if (!agg) {
    out.push({
      key: "gl-agg-missing",
      kind: "MISSING",
      severity: "medium",
      code: "GL_AGG",
      label: "General aggregate",
      detail: "No general aggregate limit found — recommend at least $2,000,000.",
      recommended: "≥ $2,000,000",
    });
  }
}

const LINE_RULES: Partial<
  Record<LineOfBusiness, (cov: AnalyzedCoverage[], ctx: GapContext, out: GapFinding[]) => void>
> = {
  AUTO: autoRules,
  COMMERCIAL_AUTO: autoRules,
  MOTORCYCLE: autoRules,
  RV: autoRules,
  HOME: homeRules,
  CONDO: homeRules,
  RENTERS: rentersRules,
  GENERAL_LIABILITY: glRules,
  BOP: glRules,
};

// ── Template-driven baseline gap detection ───────────────────────────

/**
 * Compare the present coverages against the line's coverage template:
 * any template coverage with no matching present code is flagged MISSING
 * (low severity by default — line-specific rules upgrade the important
 * ones). This makes EVERY line — even those without a bespoke rule set —
 * produce a meaningful "what's missing vs a complete policy" report.
 */
function templateGaps(
  lob: LineOfBusiness,
  present: Set<string>,
  alreadyFlagged: Set<string>,
  out: GapFinding[],
): void {
  for (const tpl of coveragesForLob(lob)) {
    // Deductibles aren't "missing coverage" — skip those rows.
    if (tpl.code === "DEDUCT" || tpl.shape === "deductible") continue;
    if (present.has(tpl.code)) continue;
    if (alreadyFlagged.has(tpl.code)) continue;
    out.push({
      key: `tpl-${lob}-${tpl.code}`,
      kind: "MISSING",
      severity: "low",
      code: tpl.code,
      label: tpl.label,
      detail: `${tpl.label} is part of a complete ${lob.replace(/_/g, " ").toLowerCase()} policy but was not found on this one. Confirm whether it was declined or simply not listed.`,
    });
  }
}

// ── Scoring ──────────────────────────────────────────────────────────

/**
 * Score = 100 minus weighted penalties for each MISSING/UNDER_LIMIT
 * finding, clamped to 0–100. PRESENT_OK and INFO findings carry no
 * penalty. The weights are tuned so a single critical gap drops a policy
 * out of the A range and several gaps push it to D/F.
 */
function scoreFindings(findings: GapFinding[]): number {
  let penalty = 0;
  for (const f of findings) {
    if (f.kind === "MISSING" || f.kind === "UNDER_LIMIT") {
      penalty += SEVERITY_WEIGHT[f.severity];
    }
  }
  return Math.max(0, Math.min(100, 100 - penalty));
}

// ── Public entry ─────────────────────────────────────────────────────

/**
 * Run the deterministic gap analysis for a line of business given its
 * extracted coverages. Pure — no DB, no network.
 */
export function analyzeGaps(
  lob: LineOfBusiness,
  coverages: AnalyzedCoverage[],
  ctx: GapContext = {},
): GapAnalysisResult {
  const findings: GapFinding[] = [];
  const present = presentCodes(coverages);

  // 1. Line-specific best-practice rules (the high-value checks).
  LINE_RULES[lob]?.(coverages, ctx, findings);

  // 2. Template baseline — anything in the standard schedule not present.
  const flagged = new Set(findings.map((f) => f.code));
  templateGaps(lob, present, flagged, findings);

  // De-dup by key (defensive — rules + template shouldn't collide but
  // an upgraded finding must win over a low-severity template gap).
  const byKey = new Map<string, GapFinding>();
  for (const f of findings) {
    const existing = byKey.get(f.key);
    if (!existing) byKey.set(f.key, f);
  }
  // Collapse duplicate codes: keep the most severe finding per code so a
  // template "MISSING low" never shadows a rule "MISSING critical".
  const order: GapSeverity[] = ["critical", "high", "medium", "low", "info"];
  const byCode = new Map<string, GapFinding>();
  for (const f of byKey.values()) {
    const prev = byCode.get(f.code);
    if (!prev || order.indexOf(f.severity) < order.indexOf(prev.severity)) {
      byCode.set(f.code, f);
    }
  }
  const finalFindings = [...byCode.values()].sort(
    (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity),
  );

  const score = scoreFindings(finalFindings);
  const gapCount = finalFindings.filter(
    (f) => f.kind === "MISSING" || f.kind === "UNDER_LIMIT",
  ).length;

  return {
    lineOfBusiness: lob,
    findings: finalFindings,
    score,
    grade: gradeFor(score),
    gapCount,
  };
}

/**
 * Build deterministic cross-sell / coverage-improvement recommendations
 * from a gap result. These are the concrete next steps surfaced to the
 * client/staff (the AI layer can add prose, but these stand alone).
 */
export type CoverageRecommendation = {
  key: string;
  title: string;
  detail: string;
  severity: GapSeverity;
};

export function recommendationsFromGaps(result: GapAnalysisResult): CoverageRecommendation[] {
  return result.findings
    .filter((f) => f.kind === "MISSING" || f.kind === "UNDER_LIMIT")
    .slice(0, 8)
    .map((f) => ({
      key: f.key,
      title:
        f.kind === "UNDER_LIMIT"
          ? `Increase ${f.label}${f.recommended ? ` to ${f.recommended}` : ""}`
          : `Add ${f.label}`,
      detail: f.detail,
      severity: f.severity,
    }));
}
