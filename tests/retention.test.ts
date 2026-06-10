import { describe, it, expect } from "vitest";
import { retentionRate, classifyOutcome } from "@/lib/domain/retention";

describe("retentionRate", () => {
  it("computes renewed / (renewed + lost) to one decimal", () => {
    expect(retentionRate({ renewed: 17, lost: 3 })).toBe(85);
    expect(retentionRate({ renewed: 2, lost: 1 })).toBe(66.7);
  });
  it("is 100 when nothing was lost", () => {
    expect(retentionRate({ renewed: 5, lost: 0 })).toBe(100);
  });
  it("is 0 when everything was lost", () => {
    expect(retentionRate({ renewed: 0, lost: 4 })).toBe(0);
  });
  it("returns null with no expirations (avoid divide-by-zero lies)", () => {
    expect(retentionRate({ renewed: 0, lost: 0 })).toBeNull();
  });
});

describe("classifyOutcome", () => {
  it("RENEWED status counts as retained", () => {
    expect(classifyOutcome({ status: "RENEWED", hasRenewalPolicy: false })).toBe("RENEWED");
  });
  it("a renewal chained off the policy counts as retained regardless of status", () => {
    expect(classifyOutcome({ status: "EXPIRED", hasRenewalPolicy: true })).toBe("RENEWED");
  });
  it("cancelled / non-renewed / expired without successor are lost", () => {
    expect(classifyOutcome({ status: "CANCELLED", hasRenewalPolicy: false })).toBe("LOST");
    expect(classifyOutcome({ status: "NON_RENEWED", hasRenewalPolicy: false })).toBe("LOST");
    expect(classifyOutcome({ status: "EXPIRED", hasRenewalPolicy: false })).toBe("LOST");
  });
  it("undecided terms return null", () => {
    expect(classifyOutcome({ status: "ACTIVE", hasRenewalPolicy: false })).toBeNull();
    expect(classifyOutcome({ status: "BOUND", hasRenewalPolicy: false })).toBeNull();
  });
});
