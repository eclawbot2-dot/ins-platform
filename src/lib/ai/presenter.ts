/**
 * Read-side presenter for a stored PolicyAnalysis row — safely narrows
 * the opaque JSON blobs (gapsJson, recommendationsJson, extractedJson)
 * into typed shapes the report UI can render. All accessors are
 * defensive: a malformed/empty blob yields empty arrays, never a throw.
 */

import type { GapAnalysisResult, GapFinding, CoverageRecommendation } from "@/lib/ai/coverage-gap-rules";
import type { CrossSellSuggestion } from "@/lib/domain/account-rounding";
import type { ExtractedPolicy } from "@/lib/ai/extract";

export type ReportView = {
  findings: GapFinding[];
  score: number | null;
  grade: GapAnalysisResult["grade"] | null;
  recommendations: CoverageRecommendation[];
  crossSell: CrossSellSuggestion[];
  extracted: ExtractedPolicy | null;
};

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function presentReport(row: {
  gapsJson: unknown;
  recommendationsJson: unknown;
  extractedJson: unknown;
  score: number | null;
}): ReportView {
  const gaps = (row.gapsJson ?? null) as GapAnalysisResult | null;
  const recs = (row.recommendationsJson ?? null) as
    | { recommendations?: unknown; crossSell?: unknown }
    | null;
  const extracted = (row.extractedJson ?? null) as ExtractedPolicy | null;

  return {
    findings: gaps ? asArray<GapFinding>(gaps.findings) : [],
    score: row.score ?? gaps?.score ?? null,
    grade: gaps?.grade ?? null,
    recommendations: recs ? asArray<CoverageRecommendation>(recs.recommendations) : [],
    crossSell: recs ? asArray<CrossSellSuggestion>(recs.crossSell) : [],
    extracted: extracted && typeof extracted === "object" && "coverages" in extracted ? extracted : null,
  };
}

/** Tone for a gap severity badge. */
export function severityTone(sev: GapFinding["severity"]): "red" | "amber" | "blue" | "slate" {
  switch (sev) {
    case "critical":
      return "red";
    case "high":
      return "red";
    case "medium":
      return "amber";
    case "low":
      return "blue";
    default:
      return "slate";
  }
}

/** Tailwind-ish color for the big score ring/number. */
export function scoreTone(score: number | null): "good" | "warn" | "bad" | "neutral" {
  if (score == null) return "neutral";
  if (score >= 80) return "good";
  if (score >= 60) return "warn";
  return "bad";
}
