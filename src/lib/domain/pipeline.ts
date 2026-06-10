/**
 * Opportunity pipeline math — stage ordering, weighted pipeline value,
 * and the conversion funnel used by reports.
 */

import { roundMoney } from "@/lib/money";
import type { OpportunityStage } from "@prisma/client";

export const STAGE_ORDER: OpportunityStage[] = ["NEW", "CONTACTED", "QUOTING", "PROPOSAL", "BOUND", "LOST"];

/** Open (in-flight) stages — excludes terminal BOUND/LOST. */
export const OPEN_STAGES: OpportunityStage[] = ["NEW", "CONTACTED", "QUOTING", "PROPOSAL"];

/** Win-probability weighting per stage for weighted pipeline value. */
export const STAGE_PROBABILITY: Record<OpportunityStage, number> = {
  NEW: 0.1,
  CONTACTED: 0.2,
  QUOTING: 0.4,
  PROPOSAL: 0.6,
  BOUND: 1,
  LOST: 0,
};

export type PipelineOpportunity = {
  stage: OpportunityStage;
  premiumEstimate: number | null;
};

/** Sum of premium estimates across open stages (unweighted). */
export function pipelineValue(opps: ReadonlyArray<PipelineOpportunity>): number {
  return roundMoney(
    opps
      .filter((o) => OPEN_STAGES.includes(o.stage))
      .reduce((acc, o) => acc + (o.premiumEstimate ?? 0), 0),
  );
}

/** Probability-weighted pipeline value across open stages. */
export function weightedPipelineValue(opps: ReadonlyArray<PipelineOpportunity>): number {
  return roundMoney(
    opps
      .filter((o) => OPEN_STAGES.includes(o.stage))
      .reduce((acc, o) => acc + (o.premiumEstimate ?? 0) * STAGE_PROBABILITY[o.stage], 0),
  );
}

export type FunnelRow = {
  stage: OpportunityStage;
  count: number;
  /** % of total opportunities that reached AT LEAST this stage. */
  reachedPct: number;
};

/**
 * Conversion funnel: for each ordered stage, how many opportunities
 * reached at least that far. LOST opportunities count toward the stages
 * they passed through? — we can't know; convention: LOST counts only in
 * the total. BOUND counts as reaching every stage.
 */
export function conversionFunnel(stages: ReadonlyArray<OpportunityStage>): FunnelRow[] {
  const total = stages.length;
  const funnelStages = STAGE_ORDER.filter((s) => s !== "LOST");
  return funnelStages.map((stage) => {
    const idx = STAGE_ORDER.indexOf(stage);
    const count = stages.filter((s) => s !== "LOST" && STAGE_ORDER.indexOf(s) >= idx).length;
    return {
      stage,
      count,
      reachedPct: total === 0 ? 0 : Math.round((count / total) * 1000) / 10,
    };
  });
}

/** Bound / (bound + lost) — close rate over decided opportunities. */
export function winRate(stages: ReadonlyArray<OpportunityStage>): number | null {
  const bound = stages.filter((s) => s === "BOUND").length;
  const lost = stages.filter((s) => s === "LOST").length;
  if (bound + lost === 0) return null;
  return Math.round((bound / (bound + lost)) * 1000) / 10;
}
