import { describe, it, expect } from "vitest";
import {
  householdCrossSell,
  dedupHouseholdRecipients,
  isHouseholdDedupCategory,
  householdRoleRank,
  type HouseholdMemberBook,
} from "@/lib/domain/household";

describe("householdCrossSell", () => {
  it("unions members' books and surfaces a cross-member umbrella round ONCE", () => {
    const members: HouseholdMemberBook[] = [
      { clientId: "dad", clientName: "Dad", isBusiness: false, activeLobs: ["AUTO"] },
      { clientId: "mom", clientName: "Mom", isBusiness: false, activeLobs: ["HOME"] },
    ];
    const result = householdCrossSell(members);
    expect(result.combinedLobs.sort()).toEqual(["AUTO", "HOME"]);
    // Umbrella round fires because the HOUSEHOLD has both auto and home.
    const umbrella = result.suggestions.filter((s) => s.lob === "UMBRELLA");
    expect(umbrella).toHaveLength(1);
  });

  it("does NOT raise a monoline flag when one member is auto-only but the household is rounded", () => {
    const members: HouseholdMemberBook[] = [
      { clientId: "a", clientName: "A", isBusiness: false, activeLobs: ["AUTO"] },
      { clientId: "b", clientName: "B", isBusiness: false, activeLobs: ["HOME", "UMBRELLA"] },
    ];
    const result = householdCrossSell(members);
    expect(result.suggestions.some((s) => s.key === "monoline-review")).toBe(false);
  });

  it("flags a multi-policy discount opportunity when 2+ members carry policies", () => {
    const members: HouseholdMemberBook[] = [
      { clientId: "a", clientName: "A", isBusiness: false, activeLobs: ["AUTO"] },
      { clientId: "b", clientName: "B", isBusiness: false, activeLobs: ["HOME"] },
    ];
    expect(householdCrossSell(members).multiPolicyDiscountOpportunity).toBe(true);
  });

  it("does NOT flag a multi-policy discount when only one member carries policies", () => {
    const members: HouseholdMemberBook[] = [
      { clientId: "a", clientName: "A", isBusiness: false, activeLobs: ["AUTO", "HOME"] },
      { clientId: "b", clientName: "B", isBusiness: false, activeLobs: [] },
    ];
    expect(householdCrossSell(members).multiPolicyDiscountOpportunity).toBe(false);
  });
});

describe("dedupHouseholdRecipients (touchpoint engine de-dup)", () => {
  it("keeps every household-less client", () => {
    const keep = dedupHouseholdRecipients([
      { clientId: "x", householdId: null, preferenceRank: 6 },
      { clientId: "y", householdId: null, preferenceRank: 6 },
    ]);
    expect(keep).toEqual(new Set(["x", "y"]));
  });

  it("keeps only the lowest-rank member per household (PRIMARY wins over CHILD)", () => {
    const keep = dedupHouseholdRecipients([
      { clientId: "primary", householdId: "h1", preferenceRank: householdRoleRank("PRIMARY") },
      { clientId: "child", householdId: "h1", preferenceRank: householdRoleRank("CHILD") },
    ]);
    expect(keep.has("primary")).toBe(true);
    expect(keep.has("child")).toBe(false);
  });

  it("breaks ties deterministically by clientId", () => {
    const keep = dedupHouseholdRecipients([
      { clientId: "bbb", householdId: "h1", preferenceRank: 6 },
      { clientId: "aaa", householdId: "h1", preferenceRank: 6 },
    ]);
    expect(keep).toEqual(new Set(["aaa"]));
  });

  it("de-dups independently per household", () => {
    const keep = dedupHouseholdRecipients([
      { clientId: "h1a", householdId: "h1", preferenceRank: 0 },
      { clientId: "h1b", householdId: "h1", preferenceRank: 4 },
      { clientId: "h2a", householdId: "h2", preferenceRank: 4 },
      { clientId: "h2b", householdId: "h2", preferenceRank: 0 },
    ]);
    expect(keep).toEqual(new Set(["h1a", "h2b"]));
  });
});

describe("isHouseholdDedupCategory", () => {
  it("de-dups APPRECIATION and SATISFACTION", () => {
    expect(isHouseholdDedupCategory("APPRECIATION")).toBe(true);
    expect(isHouseholdDedupCategory("SATISFACTION")).toBe(true);
  });
  it("does NOT de-dup transactional categories", () => {
    expect(isHouseholdDedupCategory("RENEWAL")).toBe(false);
    expect(isHouseholdDedupCategory("PAYMENT")).toBe(false);
    expect(isHouseholdDedupCategory("CLAIM")).toBe(false);
    expect(isHouseholdDedupCategory("ONBOARDING")).toBe(false);
  });
});
