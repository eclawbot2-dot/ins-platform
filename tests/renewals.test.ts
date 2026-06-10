import { describe, it, expect } from "vitest";
import {
  renewalBucket,
  needsRenewalRecord,
  nextTerm,
  premiumChangePct,
  shouldRemarket,
  RENEWABLE_STATUSES,
} from "@/lib/domain/renewals";

const asOf = new Date("2026-06-10T12:00:00Z");

describe("renewalBucket", () => {
  it("buckets overdue", () => {
    expect(renewalBucket(new Date("2026-06-01T00:00:00Z"), asOf)).toBe("OVERDUE");
  });
  it("buckets 30 / 60 / 90 boundaries inclusively", () => {
    expect(renewalBucket(new Date("2026-07-10T00:00:00Z"), asOf)).toBe("30");
    expect(renewalBucket(new Date("2026-08-09T00:00:00Z"), asOf)).toBe("60");
    expect(renewalBucket(new Date("2026-09-08T00:00:00Z"), asOf)).toBe("90");
  });
  it("buckets beyond 90 as LATER", () => {
    expect(renewalBucket(new Date("2026-12-01T00:00:00Z"), asOf)).toBe("LATER");
  });
  it("same-day expiration is the 30 bucket, not overdue", () => {
    expect(renewalBucket(new Date("2026-06-10T00:00:00Z"), asOf)).toBe("30");
  });
});

describe("needsRenewalRecord", () => {
  const expSoon = new Date("2026-08-01T00:00:00Z");
  it("true for an active policy expiring inside the window with no record", () => {
    expect(needsRenewalRecord({ status: "ACTIVE", expirationDate: expSoon }, false, asOf)).toBe(true);
  });
  it("false when a record already exists", () => {
    expect(needsRenewalRecord({ status: "ACTIVE", expirationDate: expSoon }, true, asOf)).toBe(false);
  });
  it("false for non-renewable statuses", () => {
    expect(needsRenewalRecord({ status: "CANCELLED", expirationDate: expSoon }, false, asOf)).toBe(false);
    expect(needsRenewalRecord({ status: "QUOTE", expirationDate: expSoon }, false, asOf)).toBe(false);
  });
  it("false outside the window", () => {
    expect(needsRenewalRecord({ status: "ACTIVE", expirationDate: new Date("2026-12-01T00:00:00Z") }, false, asOf)).toBe(false);
  });
  it("honors a custom window", () => {
    expect(
      needsRenewalRecord({ status: "ACTIVE", expirationDate: new Date("2026-12-01T00:00:00Z") }, false, asOf, 365),
    ).toBe(true);
  });
  it("renewable statuses are ACTIVE and BOUND", () => {
    expect(RENEWABLE_STATUSES).toEqual(["ACTIVE", "BOUND"]);
  });
});

describe("nextTerm", () => {
  it("starts at the old expiration and runs one year", () => {
    const term = nextTerm(new Date("2025-07-01T00:00:00Z"), new Date("2026-07-01T00:00:00Z"));
    expect(term.effectiveDate.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(term.expirationDate.toISOString()).toBe("2027-07-01T00:00:00.000Z");
  });
});

describe("premiumChangePct", () => {
  it("computes the signed change percentage", () => {
    expect(premiumChangePct(1000, 1150)).toBe(15);
    expect(premiumChangePct(1000, 900)).toBe(-10);
  });
  it("rounds to one decimal", () => {
    expect(premiumChangePct(3000, 3100)).toBe(3.3);
  });
  it("returns null when the expiring premium is 0", () => {
    expect(premiumChangePct(0, 500)).toBeNull();
  });
});

describe("shouldRemarket", () => {
  it("triggers at or above the default 10% increase", () => {
    expect(shouldRemarket(1000, 1100)).toBe(true);
    expect(shouldRemarket(1000, 1099)).toBe(false);
  });
  it("never triggers on decreases", () => {
    expect(shouldRemarket(1000, 800)).toBe(false);
  });
  it("honors a custom threshold", () => {
    expect(shouldRemarket(1000, 1050, 5)).toBe(true);
  });
  it("returns false when change is unknowable", () => {
    expect(shouldRemarket(0, 1000)).toBe(false);
  });
});
