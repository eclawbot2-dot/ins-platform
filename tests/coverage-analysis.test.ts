import { describe, it, expect, vi } from "vitest";

// Force the no-key path so analyzeCoverage runs the deterministic
// template summary (no network). This proves the engine has real value
// in degraded mode.
vi.mock("@/lib/ai/client", () => ({
  AI_MODEL: "claude-opus-4-8",
  aiEnabled: () => false,
  getAiClient: () => null,
}));

import { analyzeCoverage } from "@/lib/ai/coverage-analysis";
import type { AnalyzedCoverage } from "@/lib/ai/coverage-gap-rules";

describe("analyzeCoverage — degraded (no API key)", () => {
  it("produces a deterministic summary, gaps, recommendations, and score", async () => {
    const cov: AnalyzedCoverage[] = [{ code: "BI", label: "Bodily injury", limitText: "25/50" }];
    const result = await analyzeCoverage({
      lineOfBusiness: "AUTO",
      carrierName: "Progressive",
      coverages: cov,
    });

    expect(result.aiNarrative).toBe(false); // no AI ran
    expect(result.summaryText).toMatch(/Personal Auto/);
    expect(result.summaryText).toMatch(/Progressive/);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.gaps.findings.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("includes cross-sell suggestions for a personal-lines policy", async () => {
    const result = await analyzeCoverage({
      lineOfBusiness: "AUTO",
      coverages: [{ code: "BI", label: "Bodily injury", limitText: "100/300" }],
      activeLobs: ["AUTO"],
      isBusiness: false,
    });
    // Auto-only personal client → home/renters cross-sell suggestions.
    expect(result.crossSell.length).toBeGreaterThan(0);
  });

  it("reports a clean summary when no gaps exist", async () => {
    const cov: AnalyzedCoverage[] = [
      { code: "FACE", label: "Face amount", limitAmount: 500_000 },
      { code: "TERM", label: "Term", limitText: "20-year" },
      { code: "RIDERS", label: "Riders", limitText: "Waiver" },
    ];
    const result = await analyzeCoverage({ lineOfBusiness: "LIFE", coverages: cov });
    expect(result.score).toBe(100);
    expect(result.grade).toBe("A");
  });
});
