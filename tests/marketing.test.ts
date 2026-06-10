import { describe, it, expect } from "vitest";
import { leadSourceRoi, campaignPerformance, normalizeSource } from "@/lib/domain/marketing";

describe("normalizeSource", () => {
  it("lowercases and trims", () => {
    expect(normalizeSource("  Referral ")).toBe("referral");
  });
  it("maps empty/null to 'unknown'", () => {
    expect(normalizeSource(null)).toBe("unknown");
    expect(normalizeSource("   ")).toBe("unknown");
  });
});

describe("leadSourceRoi", () => {
  const leads = [
    { source: "referral", converted: true, boundPremium: 3000 },
    { source: "Referral", converted: false, boundPremium: 0 },
    { source: "website", converted: true, boundPremium: 1500 },
    { source: "website", converted: false, boundPremium: 0 },
    { source: "website", converted: false, boundPremium: 0 },
    { source: null, converted: false, boundPremium: 0 },
  ];
  it("groups case-insensitively by source", () => {
    const rows = leadSourceRoi(leads);
    expect(rows.map((r) => r.source).sort()).toEqual(["referral", "unknown", "website"]);
  });
  it("computes conversion percentage", () => {
    const rows = leadSourceRoi(leads);
    expect(rows.find((r) => r.source === "referral")!.conversionPct).toBe(50);
    expect(rows.find((r) => r.source === "website")!.conversionPct).toBe(33.3);
  });
  it("computes premium per lead", () => {
    const rows = leadSourceRoi(leads);
    expect(rows.find((r) => r.source === "website")!.premiumPerLead).toBe(500);
  });
  it("sorts by bound premium descending", () => {
    const rows = leadSourceRoi(leads);
    expect(rows[0]!.source).toBe("referral");
  });
  it("handles no leads", () => {
    expect(leadSourceRoi([])).toEqual([]);
  });
});

describe("campaignPerformance", () => {
  const campaigns = [
    { id: "c1", name: "Mailers", channel: "DIRECT_MAIL", budget: 2500 },
    { id: "c2", name: "LSA", channel: "PAID_SEARCH", budget: null },
  ];
  const leads = [
    { source: "direct mail", converted: true, boundPremium: 5000, campaignId: "c1" },
    { source: "direct mail", converted: false, boundPremium: 0, campaignId: "c1" },
    { source: "paid search", converted: true, boundPremium: 1200, campaignId: "c2" },
    { source: "website", converted: false, boundPremium: 0, campaignId: null },
  ];
  it("attributes leads and premium to campaigns", () => {
    const rows = campaignPerformance(campaigns, leads);
    const mailers = rows.find((r) => r.campaignId === "c1")!;
    expect(mailers.leads).toBe(2);
    expect(mailers.converted).toBe(1);
    expect(mailers.boundPremium).toBe(5000);
  });
  it("computes premium per budget dollar when budget is set", () => {
    const rows = campaignPerformance(campaigns, leads);
    expect(rows.find((r) => r.campaignId === "c1")!.premiumPerDollar).toBe(2);
    expect(rows.find((r) => r.campaignId === "c2")!.premiumPerDollar).toBeNull();
  });
  it("uncampaigned leads are excluded", () => {
    const rows = campaignPerformance(campaigns, leads);
    expect(rows.reduce((acc, r) => acc + r.leads, 0)).toBe(3);
  });
});
