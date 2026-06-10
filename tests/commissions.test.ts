import { describe, it, expect } from "vitest";
import {
  expectedCommission,
  scheduleRateFor,
  validateSplits,
  splitAmounts,
  normalizePolicyNumber,
  reconcileLine,
  reconcileSummary,
  VARIANCE_TOLERANCE,
} from "@/lib/domain/commissions";

describe("expectedCommission", () => {
  it("computes premium × rate% rounded to cents", () => {
    expect(expectedCommission(2850, 14)).toBe(399);
    expect(expectedCommission(1234.56, 12.5)).toBe(154.32);
  });
  it("returns 0 for non-finite inputs", () => {
    expect(expectedCommission(NaN, 10)).toBe(0);
    expect(expectedCommission(1000, Infinity)).toBe(0);
  });
});

describe("scheduleRateFor", () => {
  const schedules = [
    { lineOfBusiness: "AUTO" as const, newPct: 12, renewalPct: 10 },
    { lineOfBusiness: "BOP" as const, newPct: 16, renewalPct: 14 },
  ];
  it("returns the new-business rate", () => {
    expect(scheduleRateFor(schedules, "AUTO", true)).toBe(12);
  });
  it("returns the renewal rate", () => {
    expect(scheduleRateFor(schedules, "BOP", false)).toBe(14);
  });
  it("returns null when the LOB has no schedule", () => {
    expect(scheduleRateFor(schedules, "CYBER", true)).toBeNull();
  });
});

describe("validateSplits", () => {
  it("accepts splits summing to exactly 100", () => {
    expect(validateSplits([{ producerId: "a", pct: 60 }, { producerId: "b", pct: 40 }])).toBe(true);
  });
  it("accepts a single 100% split", () => {
    expect(validateSplits([{ producerId: "a", pct: 100 }])).toBe(true);
  });
  it("rejects sums other than 100", () => {
    expect(validateSplits([{ producerId: "a", pct: 60 }, { producerId: "b", pct: 30 }])).toBe(false);
  });
  it("rejects zero/negative/over-100 percentages and empty lists", () => {
    expect(validateSplits([])).toBe(false);
    expect(validateSplits([{ producerId: "a", pct: 0 }, { producerId: "b", pct: 100 }])).toBe(false);
    expect(validateSplits([{ producerId: "a", pct: -10 }, { producerId: "b", pct: 110 }])).toBe(false);
  });
  it("tolerates floating-point dust", () => {
    expect(validateSplits([{ producerId: "a", pct: 33.33 }, { producerId: "b", pct: 33.33 }, { producerId: "c", pct: 33.34 }])).toBe(true);
  });
});

describe("splitAmounts", () => {
  it("allocates simple splits", () => {
    const shares = splitAmounts(1000, [{ producerId: "a", pct: 60 }, { producerId: "b", pct: 40 }]);
    expect(shares).toEqual([
      { producerId: "a", pct: 60, amount: 600 },
      { producerId: "b", pct: 40, amount: 400 },
    ]);
  });
  it("assigns rounding residual to the largest share so parts sum to the whole", () => {
    const shares = splitAmounts(100.01, [
      { producerId: "a", pct: 33.33 },
      { producerId: "b", pct: 33.33 },
      { producerId: "c", pct: 33.34 },
    ]);
    const total = shares.reduce((acc, s) => acc + s.amount, 0);
    expect(Math.round(total * 100) / 100).toBe(100.01);
    const largest = shares.find((s) => s.producerId === "c")!;
    expect(largest.amount).toBeGreaterThanOrEqual(33.34);
  });
  it("handles negative totals (chargebacks) consistently", () => {
    const shares = splitAmounts(-250, [{ producerId: "a", pct: 50 }, { producerId: "b", pct: 50 }]);
    expect(shares.reduce((acc, s) => acc + s.amount, 0)).toBe(-250);
  });
  it("returns [] for no splits", () => {
    expect(splitAmounts(500, [])).toEqual([]);
  });
});

describe("normalizePolicyNumber", () => {
  it("uppercases and strips spaces/dashes", () => {
    expect(normalizePolicyNumber(" ho-tra 1023 ")).toBe("HOTRA1023");
  });
  it("is idempotent", () => {
    expect(normalizePolicyNumber(normalizePolicyNumber("AB-12 cd"))).toBe("AB12CD");
  });
});

describe("reconcileLine", () => {
  const policies = [
    { id: "p1", policyNumber: "HO-TRA-1000", expectedCommission: 399 },
    { id: "p2", policyNumber: "GL-HAR-1018", expectedCommission: 1274 },
  ];
  it("matches within tolerance", () => {
    expect(reconcileLine({ policyNumber: "HO-TRA-1000", commissionAmount: 399.5 }, policies)).toEqual({
      policyId: "p1",
      matchStatus: "MATCHED",
      varianceAmount: null,
    });
  });
  it("matches despite formatting differences in the policy number", () => {
    const r = reconcileLine({ policyNumber: "hotra1000", commissionAmount: 399 }, policies);
    expect(r.policyId).toBe("p1");
    expect(r.matchStatus).toBe("MATCHED");
  });
  it("flags variance beyond tolerance with the signed delta", () => {
    const r = reconcileLine({ policyNumber: "GL-HAR-1018", commissionAmount: 1172.08 }, policies);
    expect(r.matchStatus).toBe("VARIANCE");
    expect(r.varianceAmount).toBeCloseTo(-101.92, 2);
    expect(r.policyId).toBe("p2");
  });
  it("returns UNMATCHED for unknown policy numbers", () => {
    expect(reconcileLine({ policyNumber: "XX-NOPE-1", commissionAmount: 100 }, policies)).toEqual({
      policyId: null,
      matchStatus: "UNMATCHED",
      varianceAmount: null,
    });
  });
  it("respects a custom tolerance", () => {
    const r = reconcileLine({ policyNumber: "HO-TRA-1000", commissionAmount: 404 }, policies, 10);
    expect(r.matchStatus).toBe("MATCHED");
  });
  it("treats exactly-tolerance variance as matched", () => {
    const r = reconcileLine({ policyNumber: "HO-TRA-1000", commissionAmount: 399 + VARIANCE_TOLERANCE }, policies);
    expect(r.matchStatus).toBe("MATCHED");
  });
});

describe("reconcileSummary", () => {
  it("counts statuses and nets variance", () => {
    const s = reconcileSummary([
      { matchStatus: "MATCHED", varianceAmount: null },
      { matchStatus: "VARIANCE", varianceAmount: -50.25 },
      { matchStatus: "VARIANCE", varianceAmount: 10 },
      { matchStatus: "UNMATCHED", varianceAmount: null },
    ]);
    expect(s).toEqual({ total: 4, matched: 1, variance: 2, unmatched: 1, netVariance: -40.25 });
  });
  it("handles the empty statement", () => {
    expect(reconcileSummary([])).toEqual({ total: 0, matched: 0, variance: 0, unmatched: 0, netVariance: 0 });
  });
});
