import { describe, it, expect } from "vitest";
import { pipelineValue, weightedPipelineValue, conversionFunnel, winRate, STAGE_PROBABILITY } from "@/lib/domain/pipeline";
import type { OpportunityStage } from "@prisma/client";

const opps = [
  { stage: "NEW" as const, premiumEstimate: 1000 },
  { stage: "QUOTING" as const, premiumEstimate: 2000 },
  { stage: "PROPOSAL" as const, premiumEstimate: 3000 },
  { stage: "BOUND" as const, premiumEstimate: 9000 },
  { stage: "LOST" as const, premiumEstimate: 5000 },
];

describe("pipelineValue", () => {
  it("sums only open stages", () => {
    expect(pipelineValue(opps)).toBe(6000);
  });
  it("treats null estimates as 0", () => {
    expect(pipelineValue([{ stage: "NEW", premiumEstimate: null }])).toBe(0);
  });
});

describe("weightedPipelineValue", () => {
  it("applies stage probabilities", () => {
    // 1000*0.1 + 2000*0.4 + 3000*0.6 = 2700
    expect(weightedPipelineValue(opps)).toBe(2700);
  });
  it("BOUND is certainty and LOST is zero in the weights table", () => {
    expect(STAGE_PROBABILITY.BOUND).toBe(1);
    expect(STAGE_PROBABILITY.LOST).toBe(0);
  });
});

describe("conversionFunnel", () => {
  const stages: OpportunityStage[] = ["NEW", "CONTACTED", "QUOTING", "PROPOSAL", "BOUND", "LOST", "BOUND"];
  it("counts opportunities reaching at least each stage", () => {
    const funnel = conversionFunnel(stages);
    const byStage = Object.fromEntries(funnel.map((f) => [f.stage, f.count]));
    expect(byStage.NEW).toBe(6); // everyone but LOST
    expect(byStage.QUOTING).toBe(4);
    expect(byStage.BOUND).toBe(2);
  });
  it("LOST counts only toward the total denominator", () => {
    const funnel = conversionFunnel(stages);
    const newRow = funnel.find((f) => f.stage === "NEW")!;
    expect(newRow.reachedPct).toBe(85.7); // 6/7
  });
  it("handles the empty pipeline", () => {
    const funnel = conversionFunnel([]);
    expect(funnel.every((f) => f.count === 0 && f.reachedPct === 0)).toBe(true);
  });
});

describe("winRate", () => {
  it("is bound / decided", () => {
    expect(winRate(["BOUND", "BOUND", "LOST", "NEW"])).toBe(66.7);
  });
  it("returns null with no decided opportunities", () => {
    expect(winRate(["NEW", "QUOTING"])).toBeNull();
  });
});
