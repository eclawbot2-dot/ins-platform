import { describe, it, expect } from "vitest";
import { agingBucket, openBalance, agingSummary } from "@/lib/domain/aging";

const asOf = new Date("2026-06-10T00:00:00Z");

describe("agingBucket", () => {
  it("not-yet-due is CURRENT", () => {
    expect(agingBucket(new Date("2026-07-01T00:00:00Z"), asOf)).toBe("CURRENT");
  });
  it("due today is CURRENT", () => {
    expect(agingBucket(new Date("2026-06-10T00:00:00Z"), asOf)).toBe("CURRENT");
  });
  it("buckets 1–30 / 31–60 / 61–90 / 90+", () => {
    expect(agingBucket(new Date("2026-06-01T00:00:00Z"), asOf)).toBe("D1_30");
    expect(agingBucket(new Date("2026-05-11T00:00:00Z"), asOf)).toBe("D1_30"); // exactly 30
    expect(agingBucket(new Date("2026-04-20T00:00:00Z"), asOf)).toBe("D31_60");
    expect(agingBucket(new Date("2026-03-20T00:00:00Z"), asOf)).toBe("D61_90");
    expect(agingBucket(new Date("2026-01-15T00:00:00Z"), asOf)).toBe("D90_PLUS");
  });
});

describe("openBalance", () => {
  it("is amount minus paid", () => {
    expect(openBalance({ amount: 1000, paidAmount: 250 })).toBe(750);
  });
  it("never goes negative on overpayment", () => {
    expect(openBalance({ amount: 1000, paidAmount: 1100 })).toBe(0);
  });
});

describe("agingSummary", () => {
  it("sums open balances into buckets and a total", () => {
    const s = agingSummary(
      [
        { dueDate: new Date("2026-07-01T00:00:00Z"), amount: 500, paidAmount: 0 }, // current
        { dueDate: new Date("2026-06-01T00:00:00Z"), amount: 1000, paidAmount: 400 }, // 1-30, 600 open
        { dueDate: new Date("2026-04-20T00:00:00Z"), amount: 800, paidAmount: 0 }, // 31-60
        { dueDate: new Date("2026-01-15T00:00:00Z"), amount: 300, paidAmount: 300 }, // fully paid → excluded
      ],
      asOf,
    );
    expect(s.CURRENT).toBe(500);
    expect(s.D1_30).toBe(600);
    expect(s.D31_60).toBe(800);
    expect(s.D90_PLUS).toBe(0);
    expect(s.total).toBe(1900);
  });
  it("is all zeros for no invoices", () => {
    expect(agingSummary([], asOf).total).toBe(0);
  });
});
