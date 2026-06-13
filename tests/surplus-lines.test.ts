import { describe, it, expect } from "vitest";
import {
  surplusLinesTax,
  totalRemittance,
  classifyFiling,
  filingNeedsWork,
} from "@/lib/domain/surplus-lines";

describe("surplusLinesTax", () => {
  it("computes premium × rate, rounded to cents", () => {
    expect(surplusLinesTax(10000, 4)).toBe(400);
    expect(surplusLinesTax(1234.56, 3.5)).toBeCloseTo(43.21, 2);
  });
  it("is zero for non-positive inputs", () => {
    expect(surplusLinesTax(0, 4)).toBe(0);
    expect(surplusLinesTax(10000, 0)).toBe(0);
  });
});

describe("totalRemittance", () => {
  it("sums tax + stamping fee, tolerating nulls", () => {
    expect(totalRemittance(400, 25)).toBe(425);
    expect(totalRemittance(null, 25)).toBe(25);
    expect(totalRemittance(400, null)).toBe(400);
    expect(totalRemittance(null, null)).toBe(0);
  });
});

describe("classifyFiling", () => {
  const now = new Date("2026-06-12T00:00:00Z");

  it("FILED is complete with no gaps", () => {
    const c = classifyFiling({ status: "FILED", diligentSearchDone: true, affidavitOnFile: true }, now);
    expect(c.bucket).toBe("COMPLETE");
    expect(c.gaps).toHaveLength(0);
  });

  it("EXEMPT and VOID carry zero urgency", () => {
    expect(classifyFiling({ status: "EXEMPT", diligentSearchDone: false, affidavitOnFile: false }, now).bucket).toBe("EXEMPT");
    expect(classifyFiling({ status: "VOID", diligentSearchDone: false, affidavitOnFile: false }, now).bucket).toBe("VOID");
  });

  it("a PENDING filing past its due date is OVERDUE with the highest urgency", () => {
    const c = classifyFiling(
      { status: "PENDING", diligentSearchDone: false, affidavitOnFile: false, dueDate: new Date("2026-06-01T00:00:00Z") },
      now,
    );
    expect(c.bucket).toBe("OVERDUE");
    expect(c.urgency).toBeGreaterThan(1000);
    expect(c.gaps).toContain("Diligent search not documented");
    expect(c.gaps).toContain("Affidavit not on file");
  });

  it("a PENDING filing due within 15 days is DUE_SOON", () => {
    const c = classifyFiling(
      { status: "PENDING", diligentSearchDone: true, affidavitOnFile: true, dueDate: new Date("2026-06-20T00:00:00Z") },
      now,
    );
    expect(c.bucket).toBe("DUE_SOON");
  });

  it("a PENDING filing with no near due date is ACTION_NEEDED", () => {
    const c = classifyFiling({ status: "PENDING", diligentSearchDone: true, affidavitOnFile: true }, now);
    expect(c.bucket).toBe("ACTION_NEEDED");
  });

  it("OVERDUE outranks DUE_SOON outranks ACTION_NEEDED by urgency", () => {
    const overdue = classifyFiling({ status: "PENDING", diligentSearchDone: true, affidavitOnFile: true, dueDate: new Date("2026-06-01T00:00:00Z") }, now);
    const dueSoon = classifyFiling({ status: "PENDING", diligentSearchDone: true, affidavitOnFile: true, dueDate: new Date("2026-06-20T00:00:00Z") }, now);
    const action = classifyFiling({ status: "PENDING", diligentSearchDone: true, affidavitOnFile: true }, now);
    expect(overdue.urgency).toBeGreaterThan(dueSoon.urgency);
    expect(dueSoon.urgency).toBeGreaterThan(action.urgency);
  });
});

describe("filingNeedsWork", () => {
  it("only PENDING needs work", () => {
    expect(filingNeedsWork("PENDING")).toBe(true);
    expect(filingNeedsWork("FILED")).toBe(false);
    expect(filingNeedsWork("EXEMPT")).toBe(false);
    expect(filingNeedsWork("VOID")).toBe(false);
  });
});
