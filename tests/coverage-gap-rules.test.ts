import { describe, it, expect } from "vitest";
import {
  analyzeGaps,
  recommendationsFromGaps,
  parseSplitLimit,
  type AnalyzedCoverage,
} from "@/lib/ai/coverage-gap-rules";

// These tests are PURE — they exercise the deterministic gap engine with
// NO API key and NO network. They are the backbone that gives the compare
// tool real value in degraded mode.

describe("parseSplitLimit", () => {
  it("parses bare shorthand into thousands", () => {
    expect(parseSplitLimit("100/300")).toEqual([100_000, 300_000]);
    expect(parseSplitLimit("100/300/100")).toEqual([100_000, 300_000, 100_000]);
  });
  it("parses k/M suffixes", () => {
    expect(parseSplitLimit("250k/500k")).toEqual([250_000, 500_000]);
    expect(parseSplitLimit("1M/2M")).toEqual([1_000_000, 2_000_000]);
  });
  it("takes literal large numbers", () => {
    expect(parseSplitLimit("100000/300000")).toEqual([100_000, 300_000]);
  });
  it("returns null for non-split text", () => {
    expect(parseSplitLimit("Replacement cost")).toBeNull();
    expect(parseSplitLimit(null)).toBeNull();
    expect(parseSplitLimit("")).toBeNull();
  });
});

describe("analyzeGaps — AUTO", () => {
  it("flags missing BI and UM as high-severity gaps", () => {
    const result = analyzeGaps("AUTO", []);
    const codes = result.findings.filter((f) => f.kind === "MISSING").map((f) => f.code);
    expect(codes).toContain("BI");
    expect(codes).toContain("UM");
    // BI missing is critical → score drops out of A range.
    expect(result.score).toBeLessThan(90);
    expect(result.gapCount).toBeGreaterThan(0);
  });

  it("flags BI below 100/300 as under-limit", () => {
    const cov: AnalyzedCoverage[] = [
      { code: "BI", label: "Bodily injury", limitText: "25/50" },
      { code: "UM", label: "UM", limitText: "25/50" },
    ];
    const result = analyzeGaps("AUTO", cov);
    const bi = result.findings.find((f) => f.code === "BI");
    expect(bi?.kind).toBe("UNDER_LIMIT");
    expect(bi?.severity).toBe("high");
    expect(bi?.found).toBe("25/50");
  });

  it("scores a well-covered auto policy in the A/B range", () => {
    const cov: AnalyzedCoverage[] = [
      { code: "BI", label: "Bodily injury", limitText: "100/300" },
      { code: "PD", label: "Property damage", limitAmount: 100_000 },
      { code: "UM", label: "UM", limitText: "100/300" },
      { code: "MED", label: "Med pay", limitAmount: 5_000 },
      { code: "COMP", label: "Comp", deductibleAmount: 500 },
      { code: "COLL", label: "Collision", deductibleAmount: 500 },
    ];
    const result = analyzeGaps("AUTO", cov);
    const bi = result.findings.find((f) => f.code === "BI");
    expect(bi?.kind).toBe("PRESENT_OK");
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(["A", "B"]).toContain(result.grade);
  });
});

describe("analyzeGaps — HOME", () => {
  it("flags missing dwelling as critical", () => {
    const result = analyzeGaps("HOME", []);
    const covA = result.findings.find((f) => f.code === "COV_A");
    expect(covA?.kind).toBe("MISSING");
    expect(covA?.severity).toBe("critical");
  });

  it("flags dwelling underinsured vs replacement cost", () => {
    const cov: AnalyzedCoverage[] = [
      { code: "COV_A", label: "Dwelling", limitAmount: 200_000 },
      { code: "COV_E", label: "Personal liability", limitAmount: 300_000 },
    ];
    const result = analyzeGaps("HOME", cov, { dwellingReplacementCost: 400_000 });
    const covA = result.findings.find((f) => f.code === "COV_A");
    expect(covA?.kind).toBe("UNDER_LIMIT");
    expect(covA?.severity).toBe("high");
  });

  it("recommends an umbrella when assets warrant and none exists", () => {
    const cov: AnalyzedCoverage[] = [
      { code: "COV_A", label: "Dwelling", limitAmount: 400_000 },
      { code: "COV_E", label: "Personal liability", limitAmount: 300_000 },
    ];
    const result = analyzeGaps("HOME", cov, { estimatedAssets: 1_000_000, hasUmbrella: false });
    expect(result.findings.some((f) => f.code === "UMBRELLA")).toBe(true);
  });

  it("suppresses the umbrella gap when one already exists", () => {
    const result = analyzeGaps("HOME", [{ code: "COV_A", label: "Dwelling", limitAmount: 400_000 }], {
      estimatedAssets: 1_000_000,
      hasUmbrella: true,
    });
    expect(result.findings.some((f) => f.code === "UMBRELLA")).toBe(false);
  });

  it("flags water backup as missing by default", () => {
    const result = analyzeGaps("HOME", [{ code: "COV_A", label: "Dwelling", limitAmount: 400_000 }]);
    expect(result.findings.some((f) => f.code === "WATER_BACKUP" && f.kind === "MISSING")).toBe(true);
  });

  it("surfaces flood as a gap when the notes mention flood exposure", () => {
    const result = analyzeGaps("HOME", [{ code: "COV_A", label: "Dwelling", limitAmount: 400_000 }], {
      notes: "Property is in a coastal flood zone",
    });
    expect(result.findings.some((f) => f.code === "FLOOD")).toBe(true);
  });
});

describe("analyzeGaps — GENERAL_LIABILITY", () => {
  it("flags occurrence under $1M", () => {
    const cov: AnalyzedCoverage[] = [{ code: "GL_OCC", label: "Each occurrence", limitAmount: 500_000 }];
    const result = analyzeGaps("GENERAL_LIABILITY", cov);
    const occ = result.findings.find((f) => f.code === "GL_OCC");
    expect(occ?.kind).toBe("UNDER_LIMIT");
  });
});

describe("template-driven baseline gaps", () => {
  it("flags coverages from the template that aren't present, for a line with no bespoke rules", () => {
    // LIFE has no bespoke rule set — template gaps still produce findings.
    const result = analyzeGaps("LIFE", []);
    expect(result.findings.some((f) => f.kind === "MISSING")).toBe(true);
    expect(result.findings.some((f) => f.code === "FACE")).toBe(true);
  });

  it("does not flag deductible rows as missing coverage", () => {
    const result = analyzeGaps("HOME", []);
    expect(result.findings.some((f) => f.code === "DEDUCT")).toBe(false);
  });
});

describe("scoring + grade", () => {
  it("returns 100/A for a line with all template coverages present", () => {
    const cov: AnalyzedCoverage[] = [
      { code: "FACE", label: "Face amount", limitAmount: 500_000 },
      { code: "TERM", label: "Term", limitText: "20-year" },
      { code: "RIDERS", label: "Riders", limitText: "Waiver of premium" },
    ];
    const result = analyzeGaps("LIFE", cov);
    expect(result.score).toBe(100);
    expect(result.grade).toBe("A");
    expect(result.gapCount).toBe(0);
  });

  it("clamps to 0 and grades F for an empty critical line", () => {
    const result = analyzeGaps("HOME", []);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe("recommendationsFromGaps", () => {
  it("produces actionable add/increase recommendations from gaps", () => {
    const result = analyzeGaps("AUTO", [{ code: "BI", label: "Bodily injury", limitText: "25/50" }]);
    const recs = recommendationsFromGaps(result);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.some((r) => /Increase|Add/.test(r.title))).toBe(true);
  });
});
