/**
 * Coverage-analysis engine — the orchestrator that turns extracted /
 * keyed policy data into a complete report: plain-English summary, gap
 * analysis (MISSING + UNDER_LIMIT with severity), concrete coverage
 * recommendations + cross-sell, and an overall coverage score / grade.
 *
 * The DETERMINISTIC gap-rule engine (coverage-gap-rules.ts) is the
 * backbone — it produces the findings, score, and recommendations with
 * NO network and NO API key. The AI layer ENRICHES the narrative (a warm,
 * human summary paragraph) when a key is present; with no key the summary
 * falls back to a deterministic template built from the same findings.
 *
 * Pure orchestration over the rule engine + a single optional AI call.
 * Never throws — AI failures degrade to the deterministic narrative.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LineOfBusiness } from "@prisma/client";
import { getAiClient, AI_MODEL } from "@/lib/ai/client";
import {
  analyzeGaps,
  recommendationsFromGaps,
  type AnalyzedCoverage,
  type GapContext,
  type GapAnalysisResult,
  type CoverageRecommendation,
} from "@/lib/ai/coverage-gap-rules";
import { crossSellSuggestions, type CrossSellSuggestion } from "@/lib/domain/account-rounding";
import { LOB_LABELS, PERSONAL_LOBS } from "@/lib/labels";
import { log } from "@/lib/log";

export type CoverageAnalysisInput = {
  lineOfBusiness: LineOfBusiness;
  carrierName?: string | null;
  coverages: AnalyzedCoverage[];
  context?: GapContext;
  /** LOBs the client already has (for cross-sell). */
  activeLobs?: LineOfBusiness[];
  /** Whether this is a commercial account (for cross-sell). */
  isBusiness?: boolean;
};

export type CoverageAnalysisResult = {
  summaryText: string;
  gaps: GapAnalysisResult;
  recommendations: CoverageRecommendation[];
  crossSell: CrossSellSuggestion[];
  score: number;
  grade: GapAnalysisResult["grade"];
  /** Whether the summary prose was produced by the AI (vs the template). */
  aiNarrative: boolean;
};

const GRADE_BLURB: Record<GapAnalysisResult["grade"], string> = {
  A: "well-rounded — the major coverages are present at solid limits",
  B: "solid, with a few improvements worth considering",
  C: "adequate but with meaningful gaps to close",
  D: "underinsured in several important areas",
  F: "significantly underinsured — several core protections are missing",
};

/**
 * Deterministic fallback summary built from the gap findings. Used when
 * no API key is present, or when the AI call fails. Always available.
 */
function templateSummary(input: CoverageAnalysisInput, gaps: GapAnalysisResult): string {
  const lobLabel = LOB_LABELS[input.lineOfBusiness] ?? input.lineOfBusiness;
  const carrier = input.carrierName ? ` with ${input.carrierName}` : "";
  const presentCount = gaps.findings.filter((f) => f.kind === "PRESENT_OK").length;
  const missing = gaps.findings.filter((f) => f.kind === "MISSING");
  const under = gaps.findings.filter((f) => f.kind === "UNDER_LIMIT");

  const parts: string[] = [];
  parts.push(
    `This ${lobLabel} policy${carrier} scores ${gaps.score}/100 (grade ${gaps.grade}) — ${GRADE_BLURB[gaps.grade]}.`,
  );
  if (presentCount > 0) {
    parts.push(`${presentCount} key coverage${presentCount === 1 ? "" : "s"} look in good shape.`);
  }
  if (under.length > 0) {
    parts.push(
      `${under.length} coverage${under.length === 1 ? " is" : "s are"} below recommended limits: ${under
        .map((f) => f.label)
        .join(", ")}.`,
    );
  }
  if (missing.length > 0) {
    parts.push(
      `${missing.length} recommended coverage${missing.length === 1 ? " appears" : "s appear"} to be missing: ${missing
        .slice(0, 6)
        .map((f) => f.label)
        .join(", ")}${missing.length > 6 ? ", and others" : ""}.`,
    );
  }
  if (missing.length === 0 && under.length === 0) {
    parts.push("No significant gaps were detected against the standard coverage checklist for this line.");
  }
  return parts.join(" ");
}

/**
 * Ask the model to write a warm, accurate plain-English summary GROUNDED
 * in the deterministic findings (so it cannot hallucinate coverages or
 * prices). Returns null on any failure — caller falls back to the
 * template summary.
 */
async function aiSummary(
  input: CoverageAnalysisInput,
  gaps: GapAnalysisResult,
): Promise<string | null> {
  const client = getAiClient();
  if (!client) return null;

  const lobLabel = LOB_LABELS[input.lineOfBusiness] ?? input.lineOfBusiness;
  const facts = {
    lineOfBusiness: lobLabel,
    carrier: input.carrierName ?? "unknown",
    score: gaps.score,
    grade: gaps.grade,
    coveragesPresent: gaps.findings.filter((f) => f.kind === "PRESENT_OK").map((f) => f.label),
    gapsMissing: gaps.findings.filter((f) => f.kind === "MISSING").map((f) => ({ label: f.label, why: f.detail })),
    gapsUnderLimit: gaps.findings
      .filter((f) => f.kind === "UNDER_LIMIT")
      .map((f) => ({ label: f.label, found: f.found, recommended: f.recommended })),
  };

  try {
    const msg = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 800,
      thinking: { type: "adaptive" },
      system:
        "You are a friendly, plain-spoken insurance advisor writing a SHORT (3–5 sentence) summary of a coverage review " +
        "for a customer. Base every statement ONLY on the JSON facts provided — never invent coverages, limits, prices, " +
        "or carriers. Lead with the overall picture, then the most important gaps, in warm but honest language. " +
        "Do not use markdown headings or bullet lists; write flowing prose. End with one encouraging next-step sentence.",
      messages: [
        {
          role: "user",
          content: `Write the summary from these facts:\n\n${JSON.stringify(facts, null, 2)}`,
        },
      ],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) return null;
    log.info("AI coverage summary generated", { module: "ai-compare", lob: input.lineOfBusiness });
    return text;
  } catch (err) {
    log.warn("AI coverage summary failed — using template", { module: "ai-compare" }, err);
    return null;
  }
}

/**
 * Run the full analysis. The gap engine + recommendations + cross-sell
 * are deterministic and always populated; the summary prose is AI when a
 * key is present, deterministic otherwise.
 */
export async function analyzeCoverage(input: CoverageAnalysisInput): Promise<CoverageAnalysisResult> {
  const gaps = analyzeGaps(input.lineOfBusiness, input.coverages, input.context ?? {});
  const recommendations = recommendationsFromGaps(gaps);

  const isBusiness =
    input.isBusiness ?? !(PERSONAL_LOBS as string[]).includes(input.lineOfBusiness);
  const activeLobs = input.activeLobs ?? [input.lineOfBusiness];
  const crossSell = crossSellSuggestions({
    activeLobs,
    isBusiness,
    notes: input.context?.notes ?? null,
  });

  const ai = await aiSummary(input, gaps);
  const summaryText = ai ?? templateSummary(input, gaps);

  return {
    summaryText,
    gaps,
    recommendations,
    crossSell,
    score: gaps.score,
    grade: gaps.grade,
    aiNarrative: ai != null,
  };
}
