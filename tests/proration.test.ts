import { describe, it, expect } from "vitest";
import {
  earnedPremium,
  unearnedPremium,
  proRataReturn,
  shortRateReturn,
  prorateEndorsement,
  SHORT_RATE_PENALTY,
} from "@/lib/domain/proration";

const eff = new Date("2026-01-01T00:00:00Z");
const exp = new Date("2027-01-01T00:00:00Z"); // 365-day term

describe("earnedPremium", () => {
  it("is 0 before the effective date", () => {
    expect(earnedPremium(3650, eff, exp, new Date("2025-12-15T00:00:00Z"))).toBe(0);
  });
  it("is the full premium after expiration", () => {
    expect(earnedPremium(3650, eff, exp, new Date("2027-03-01T00:00:00Z"))).toBe(3650);
  });
  it("earns linearly by day", () => {
    // 100 days elapsed of 365 → 3650 * 100/365 = 1000
    expect(earnedPremium(3650, eff, exp, new Date("2026-04-11T00:00:00Z"))).toBe(1000);
  });
  it("handles leap-year terms (366 days)", () => {
    const leapEff = new Date("2024-01-01T00:00:00Z");
    const leapExp = new Date("2025-01-01T00:00:00Z");
    // 183 days of 366 → exactly half
    expect(earnedPremium(2000, leapEff, leapExp, new Date("2024-07-02T00:00:00Z"))).toBe(1000);
  });
  it("returns 0 for a zero-length term", () => {
    expect(earnedPremium(1000, eff, eff, new Date("2026-06-01T00:00:00Z"))).toBe(0);
  });
});

describe("unearnedPremium", () => {
  it("complements earned premium", () => {
    const asOf = new Date("2026-04-11T00:00:00Z");
    expect(unearnedPremium(3650, eff, exp, asOf)).toBe(2650);
  });
});

describe("proRataReturn", () => {
  it("returns the full unearned premium", () => {
    const cancel = new Date("2026-04-11T00:00:00Z");
    expect(proRataReturn(3650, eff, exp, cancel)).toBe(2650);
  });
  it("returns 0 when cancelled at expiration", () => {
    expect(proRataReturn(3650, eff, exp, exp)).toBe(0);
  });
});

describe("shortRateReturn", () => {
  it("applies the 10% penalty to unearned premium", () => {
    const cancel = new Date("2026-04-11T00:00:00Z");
    expect(shortRateReturn(3650, eff, exp, cancel)).toBe(2385); // 2650 * 0.9
  });
  it("supports a custom penalty", () => {
    const cancel = new Date("2026-04-11T00:00:00Z");
    expect(shortRateReturn(3650, eff, exp, cancel, 0.25)).toBe(1987.5);
  });
  it("short-rate is always <= pro-rata", () => {
    const cancel = new Date("2026-09-01T00:00:00Z");
    expect(shortRateReturn(2400, eff, exp, cancel)).toBeLessThanOrEqual(proRataReturn(2400, eff, exp, cancel));
  });
  it("exposes the standard 10% constant", () => {
    expect(SHORT_RATE_PENALTY).toBe(0.1);
  });
});

describe("prorateEndorsement", () => {
  it("prorates an annualized change over the remaining term", () => {
    // 100 days remain of 365: 730 * 100/365 = 200
    const endorseDate = new Date("2026-09-23T00:00:00Z");
    expect(prorateEndorsement(730, eff, exp, endorseDate)).toBe(200);
  });
  it("is the full change when endorsed on day one", () => {
    expect(prorateEndorsement(500, eff, exp, eff)).toBe(500);
  });
  it("is 0 when endorsed at expiration", () => {
    expect(prorateEndorsement(500, eff, exp, exp)).toBe(0);
  });
  it("handles negative (return-premium) changes", () => {
    const endorseDate = new Date("2026-09-23T00:00:00Z");
    expect(prorateEndorsement(-730, eff, exp, endorseDate)).toBe(-200);
  });
});
