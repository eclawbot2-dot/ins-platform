import { describe, it, expect } from "vitest";
import { incurred, lossRatioPct, lossTier, finalizeRow } from "@/lib/domain/loss-ratio";

describe("incurred", () => {
  it("sums paid + reserve", () => {
    expect(incurred({ paidAmount: 1000, reserveAmount: 500 })).toBe(1500);
  });
  it("floors negative inputs at zero", () => {
    expect(incurred({ paidAmount: -100, reserveAmount: 500 })).toBe(500);
  });
});

describe("lossRatioPct", () => {
  it("is incurred / premium as a percentage to one decimal", () => {
    expect(lossRatioPct(700, 1000)).toBe(70);
    expect(lossRatioPct(333, 1000)).toBe(33.3);
  });
  it("returns null when premium is zero (no divide-by-zero)", () => {
    expect(lossRatioPct(500, 0)).toBeNull();
  });
});

describe("lossTier", () => {
  it("flags high loss at or above 70%", () => {
    expect(lossTier(70)).toBe("HIGH");
    expect(lossTier(85)).toBe("HIGH");
  });
  it("flags elevated between 50 and 70", () => {
    expect(lossTier(55)).toBe("ELEVATED");
  });
  it("is low under 50% and for null", () => {
    expect(lossTier(20)).toBe("LOW");
    expect(lossTier(null)).toBe("LOW");
  });
});

describe("finalizeRow", () => {
  it("rolls an accumulator into a report row with the ratio + tier", () => {
    const row = finalizeRow("travelers", "Travelers", {
      premium: 10000,
      policyCount: 4,
      claimCount: 2,
      paid: 4000,
      reserve: 3000,
    });
    expect(row.incurred).toBe(7000);
    expect(row.lossRatioPct).toBe(70);
    expect(row.tier).toBe("HIGH");
    expect(row.label).toBe("Travelers");
  });

  it("handles a group with premium but no claims (0% loss)", () => {
    const row = finalizeRow("safeco", "Safeco", { premium: 5000, policyCount: 3, claimCount: 0, paid: 0, reserve: 0 });
    expect(row.lossRatioPct).toBe(0);
    expect(row.tier).toBe("LOW");
  });
});
