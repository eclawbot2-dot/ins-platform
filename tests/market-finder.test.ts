import { describe, it, expect } from "vitest";
import { rankMarkets, appetiteCoversState, eligibleCount, type MarketCarrierInput } from "@/lib/domain/market-finder";

function carrier(over: Partial<MarketCarrierInput> = {}): MarketCarrierInput {
  return {
    carrierId: over.carrierId ?? "c1",
    carrierName: over.carrierName ?? "Carrier",
    appointmentStatus: over.appointmentStatus ?? "APPOINTED",
    // Respect an explicitly-passed null appetite (no row for this LOB).
    appetite: "appetite" in over ? over.appetite! : "STANDARD",
    states: over.states ?? null,
    classNotes: over.classNotes ?? null,
    newPct: over.newPct ?? 15,
    renewalPct: over.renewalPct ?? 12,
    isMga: over.isMga ?? false,
  };
}

describe("appetiteCoversState", () => {
  it("null states cover everything", () => {
    expect(appetiteCoversState(null, "MA")).toBe(true);
  });
  it("matches case-insensitively across comma/space lists", () => {
    expect(appetiteCoversState("MA, NH ri", "ri")).toBe(true);
    expect(appetiteCoversState("MA,NH", "RI")).toBe(false);
  });
  it("no state filter requested → covered", () => {
    expect(appetiteCoversState("MA", null)).toBe(true);
  });
});

describe("rankMarkets", () => {
  it("non-appointed carriers are ineligible and sorted last", () => {
    const ranked = rankMarkets([
      carrier({ carrierId: "appointed", appointmentStatus: "APPOINTED", appetite: "STANDARD" }),
      carrier({ carrierId: "not", appointmentStatus: "NOT_APPOINTED", appetite: "PREFERRED" }),
    ]);
    expect(ranked[0]!.carrierId).toBe("appointed");
    expect(ranked.find((r) => r.carrierId === "not")!.eligible).toBe(false);
  });

  it("a DECLINE appetite is ineligible even when appointed", () => {
    const ranked = rankMarkets([carrier({ appetite: "DECLINE" })]);
    expect(ranked[0]!.eligible).toBe(false);
    expect(ranked[0]!.reason).toMatch(/declines/i);
  });

  it("preferred markets outrank standard, and commission tilts within a tier", () => {
    const ranked = rankMarkets([
      carrier({ carrierId: "std", appetite: "STANDARD", newPct: 20 }),
      carrier({ carrierId: "pref", appetite: "PREFERRED", newPct: 10 }),
    ]);
    expect(ranked[0]!.carrierId).toBe("pref");
  });

  it("out-of-state appetite is ineligible when a state filter is applied", () => {
    const ranked = rankMarkets([carrier({ states: "MA,NH" })], { state: "FL" });
    expect(ranked[0]!.eligible).toBe(false);
    expect(ranked[0]!.reason).toMatch(/states/i);
  });

  it("appointed carrier with NO appetite row is eligible (unknown → confirm with UW)", () => {
    const ranked = rankMarkets([carrier({ appetite: null })]);
    expect(ranked[0]!.eligible).toBe(true);
    expect(ranked[0]!.reason).toMatch(/no appetite row/i);
  });

  it("eligibleCount counts only eligible markets", () => {
    const ranked = rankMarkets([
      carrier({ carrierId: "a", appetite: "PREFERRED" }),
      carrier({ carrierId: "b", appetite: "DECLINE" }),
      carrier({ carrierId: "c", appointmentStatus: "NOT_APPOINTED" }),
    ]);
    expect(eligibleCount(ranked)).toBe(1);
  });
});
