import { describe, it, expect } from "vitest";
import { groupBook } from "@/lib/reports/book";
import { allocateProduction } from "@/lib/reports/production";
import { monthlyTrend, monthKey, trailingMonths } from "@/lib/reports/trend";
import { monthlyCommission } from "@/lib/reports/commission-revenue";

describe("groupBook", () => {
  const policies = [
    { carrierName: "Travelers", lineOfBusiness: "Homeowners", producerName: "Sarah", premium: 3000, commissionAmount: 420 },
    { carrierName: "Travelers", lineOfBusiness: "Personal Auto", producerName: "Sarah", premium: 2000, commissionAmount: 240 },
    { carrierName: "Hartford", lineOfBusiness: "Homeowners", producerName: "James", premium: 5000, commissionAmount: 800 },
  ];
  it("groups by carrier with counts/sums", () => {
    const rows = groupBook(policies, "carrier");
    const travelers = rows.find((r) => r.group === "Travelers")!;
    expect(travelers.policyCount).toBe(2);
    expect(travelers.premium).toBe(5000);
    expect(travelers.commission).toBe(660);
  });
  it("computes share of total book premium", () => {
    const rows = groupBook(policies, "carrier");
    expect(rows.find((r) => r.group === "Hartford")!.sharePct).toBe(50);
  });
  it("groups by LOB and producer too", () => {
    expect(groupBook(policies, "lob").find((r) => r.group === "Homeowners")!.premium).toBe(8000);
    expect(groupBook(policies, "producer").find((r) => r.group === "Sarah")!.policyCount).toBe(2);
  });
  it("sorts by premium descending", () => {
    expect(groupBook(policies, "carrier")[0]!.group).toBe("Travelers");
  });
  it("handles the empty book", () => {
    expect(groupBook([], "carrier")).toEqual([]);
  });
});

describe("allocateProduction", () => {
  it("credits the producer of record when no splits exist", () => {
    const rows = allocateProduction([
      { premium: 1000, commissionAmount: 120, isNewBusiness: true, producerId: "a", producerName: "A", splits: [] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ producerId: "a", policyCount: 1, newPolicyCount: 1, writtenPremium: 1000, commission: 120 });
  });
  it("allocates premium and commission through split rules", () => {
    const rows = allocateProduction([
      {
        premium: 10000,
        commissionAmount: 1500,
        isNewBusiness: false,
        producerId: "a",
        producerName: "A",
        splits: [
          { producerId: "a", producerName: "A", pct: 60 },
          { producerId: "b", producerName: "B", pct: 40 },
        ],
      },
    ]);
    expect(rows.find((r) => r.producerId === "a")).toMatchObject({ writtenPremium: 6000, commission: 900 });
    expect(rows.find((r) => r.producerId === "b")).toMatchObject({ writtenPremium: 4000, commission: 600 });
  });
  it("both split producers count the policy", () => {
    const rows = allocateProduction([
      {
        premium: 1000, commissionAmount: 100, isNewBusiness: true, producerId: "a", producerName: "A",
        splits: [
          { producerId: "a", producerName: "A", pct: 50 },
          { producerId: "b", producerName: "B", pct: 50 },
        ],
      },
    ]);
    expect(rows.every((r) => r.policyCount === 1 && r.newPolicyCount === 1)).toBe(true);
  });
  it("split totals reconcile to the policy amounts", () => {
    const rows = allocateProduction([
      {
        premium: 100.01, commissionAmount: 33.35, isNewBusiness: true, producerId: "a", producerName: "A",
        splits: [
          { producerId: "a", producerName: "A", pct: 33.33 },
          { producerId: "b", producerName: "B", pct: 33.33 },
          { producerId: "c", producerName: "C", pct: 33.34 },
        ],
      },
    ]);
    const premiumSum = rows.reduce((acc, r) => acc + r.writtenPremium, 0);
    const commissionSum = rows.reduce((acc, r) => acc + r.commission, 0);
    expect(Math.round(premiumSum * 100) / 100).toBe(100.01);
    expect(Math.round(commissionSum * 100) / 100).toBe(33.35);
  });
});

describe("monthlyTrend", () => {
  const asOf = new Date("2026-06-10T00:00:00Z");
  it("monthKey formats yyyy-mm", () => {
    expect(monthKey(new Date("2026-06-01T00:00:00Z"))).toBe("2026-06");
  });
  it("trailingMonths spans year boundaries", () => {
    const keys = trailingMonths(3, new Date("2026-01-15T00:00:00Z"));
    expect(keys).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
  it("splits new vs renewal premium into the right month", () => {
    const months = monthlyTrend(
      [
        { effectiveDate: new Date("2026-05-03T00:00:00Z"), premium: 1000, isNewBusiness: true },
        { effectiveDate: new Date("2026-05-20T00:00:00Z"), premium: 2000, isNewBusiness: false },
        { effectiveDate: new Date("2026-06-01T00:00:00Z"), premium: 500, isNewBusiness: true },
      ],
      12,
      asOf,
    );
    const may = months.find((m) => m.month === "2026-05")!;
    expect(may).toMatchObject({ newPremium: 1000, renewalPremium: 2000, total: 3000 });
    expect(months.find((m) => m.month === "2026-06")!.newPremium).toBe(500);
  });
  it("ignores policies outside the window and always returns N months", () => {
    const months = monthlyTrend([{ effectiveDate: new Date("2020-01-01T00:00:00Z"), premium: 99, isNewBusiness: true }], 12, asOf);
    expect(months).toHaveLength(12);
    expect(months.every((m) => m.total === 0)).toBe(true);
  });
});

describe("monthlyCommission", () => {
  const asOf = new Date("2026-06-10T00:00:00Z");
  it("buckets statement lines by statement month", () => {
    const months = monthlyCommission(
      [
        { statementDate: new Date("2026-06-05T00:00:00Z"), amount: 250.5 },
        { statementDate: new Date("2026-06-05T00:00:00Z"), amount: 100 },
        { statementDate: new Date("2026-04-05T00:00:00Z"), amount: 75.25 },
      ],
      12,
      asOf,
    );
    expect(months.find((m) => m.month === "2026-06")).toMatchObject({ commission: 350.5, lineCount: 2 });
    expect(months.find((m) => m.month === "2026-04")).toMatchObject({ commission: 75.25, lineCount: 1 });
  });
});
