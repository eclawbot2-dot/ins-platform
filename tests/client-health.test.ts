import { describe, it, expect } from "vitest";
import { clientHealth, healthTierTone, type ClientHealthSignals } from "@/lib/domain/client-health";

const base: ClientHealthSignals = {
  activePolicyCount: 3,
  recentClaimCount: 0,
  pastDueAmount: 0,
  maxDaysPastDue: 0,
  recentCancellations: 0,
  daysToNearestRenewal: 200,
  tenureMonths: 48,
};

describe("clientHealth", () => {
  it("scores a multi-line, paid-up, long-tenured client as healthy", () => {
    const h = clientHealth(base);
    expect(h.score).toBeGreaterThanOrEqual(70);
    expect(h.tier).toBe("HEALTHY");
    expect(h.factors).toHaveLength(0);
  });

  it("clamps the score to 0–100", () => {
    const terrible = clientHealth({
      activePolicyCount: 0,
      recentClaimCount: 6,
      pastDueAmount: 9000,
      maxDaysPastDue: 120,
      recentCancellations: 3,
      daysToNearestRenewal: 10,
      tenureMonths: 1,
    });
    expect(terrible.score).toBeGreaterThanOrEqual(0);
    expect(terrible.score).toBeLessThanOrEqual(100);
    expect(terrible.tier).toBe("AT_RISK");
  });

  it("penalizes single-policy concentration", () => {
    const mono = clientHealth({ ...base, activePolicyCount: 1 });
    expect(mono.score).toBeLessThan(clientHealth(base).score);
    expect(mono.factors.some((f) => /single-policy/i.test(f.label))).toBe(true);
  });

  it("penalizes severe AR lateness", () => {
    const late = clientHealth({ ...base, maxDaysPastDue: 95, pastDueAmount: 6000 });
    expect(late.factors.some((f) => /past-due/i.test(f.label))).toBe(true);
    expect(late.score).toBeLessThan(clientHealth(base).score);
  });

  it("penalizes recent cancellations heavily and tiers to watch/at-risk", () => {
    const churny = clientHealth({ ...base, recentCancellations: 2 });
    expect(churny.tier).not.toBe("HEALTHY");
  });

  it("credits long tenure and penalizes brand-new onboarding", () => {
    const fresh = clientHealth({ ...base, tenureMonths: 1 });
    expect(fresh.factors.some((f) => /onboard/i.test(f.label))).toBe(true);
  });

  it("raises urgency for an imminent renewal", () => {
    const soon = clientHealth({ ...base, daysToNearestRenewal: 20, activePolicyCount: 1 });
    expect(soon.factors.some((f) => /renewal within 30/i.test(f.label))).toBe(true);
  });
});

describe("healthTierTone", () => {
  it("maps tiers to badge tones", () => {
    expect(healthTierTone("HEALTHY")).toBe("green");
    expect(healthTierTone("WATCH")).toBe("amber");
    expect(healthTierTone("AT_RISK")).toBe("red");
  });
});
