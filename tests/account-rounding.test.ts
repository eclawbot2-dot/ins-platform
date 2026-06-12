import { describe, it, expect } from "vitest";
import { crossSellSuggestions, totalOpportunity } from "@/lib/domain/account-rounding";

describe("crossSellSuggestions — personal lines", () => {
  it("suggests umbrella when client has auto + home but no umbrella", () => {
    const s = crossSellSuggestions({ activeLobs: ["AUTO", "HOME"] });
    expect(s.some((x) => x.lob === "UMBRELLA")).toBe(true);
    expect(s.find((x) => x.lob === "UMBRELLA")!.priority).toBe(1);
  });

  it("does not suggest umbrella when one already exists", () => {
    const s = crossSellSuggestions({ activeLobs: ["AUTO", "HOME", "UMBRELLA"] });
    expect(s.some((x) => x.lob === "UMBRELLA")).toBe(false);
  });

  it("cross-sells home to an auto-only client", () => {
    const s = crossSellSuggestions({ activeLobs: ["AUTO"] });
    expect(s.some((x) => x.lob === "HOME")).toBe(true);
    expect(s.some((x) => x.lob === "RENTERS")).toBe(true);
  });

  it("cross-sells auto to a home-only client", () => {
    const s = crossSellSuggestions({ activeLobs: ["HOME"] });
    expect(s.some((x) => x.lob === "AUTO")).toBe(true);
  });

  it("suggests flood only when the notes hint at flood exposure", () => {
    const without = crossSellSuggestions({ activeLobs: ["HOME"], notes: "great client" });
    expect(without.some((x) => x.lob === "FLOOD")).toBe(false);
    const withHint = crossSellSuggestions({ activeLobs: ["HOME"], notes: "coastal property, flood-prone street" });
    expect(withHint.some((x) => x.lob === "FLOOD")).toBe(true);
  });

  it("returns nothing to round out a fully-bundled household", () => {
    const s = crossSellSuggestions({ activeLobs: ["AUTO", "HOME", "UMBRELLA", "LIFE"] });
    expect(s).toHaveLength(0);
  });

  it("flags a mono-line account when no specific round fires", () => {
    const s = crossSellSuggestions({ activeLobs: ["LIFE"] });
    expect(s.length).toBeGreaterThan(0);
  });
});

describe("crossSellSuggestions — commercial", () => {
  it("suggests workers comp to a GL/BOP-only business", () => {
    const s = crossSellSuggestions({ activeLobs: ["GENERAL_LIABILITY"], isBusiness: true });
    expect(s.some((x) => x.lob === "WORKERS_COMP")).toBe(true);
  });

  it("suggests commercial auto + umbrella + cyber for a GL business", () => {
    const s = crossSellSuggestions({ activeLobs: ["GENERAL_LIABILITY", "WORKERS_COMP"], isBusiness: true });
    expect(s.some((x) => x.lob === "COMMERCIAL_AUTO")).toBe(true);
    expect(s.some((x) => x.lob === "COMMERCIAL_UMBRELLA")).toBe(true);
    expect(s.some((x) => x.lob === "CYBER")).toBe(true);
  });
});

describe("crossSellSuggestions — X-date win-backs + ranking", () => {
  it("proposes competitor lines we don't already write", () => {
    const s = crossSellSuggestions({ activeLobs: ["AUTO"], priorLobs: ["BOAT"] });
    expect(s.some((x) => x.lob === "BOAT")).toBe(true);
  });

  it("does not propose a prior line we already write", () => {
    const s = crossSellSuggestions({ activeLobs: ["AUTO", "HOME"], priorLobs: ["HOME"] });
    expect(s.filter((x) => x.lob === "HOME")).toHaveLength(0);
  });

  it("ranks by priority then by estimated premium", () => {
    const s = crossSellSuggestions({ activeLobs: ["AUTO", "HOME"], priorLobs: ["BOAT"] });
    for (let i = 1; i < s.length; i++) {
      const prev = s[i - 1]!;
      const cur = s[i]!;
      expect(prev.priority <= cur.priority).toBe(true);
    }
  });

  it("totals the opportunity across suggestions", () => {
    const s = crossSellSuggestions({ activeLobs: ["AUTO", "HOME"] });
    expect(totalOpportunity(s)).toBeGreaterThan(0);
  });
});
