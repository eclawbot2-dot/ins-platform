import { describe, it, expect } from "vitest";
import { scoreLead, leadGrade } from "@/lib/domain/lead-scoring";

describe("scoreLead", () => {
  it("scores 0 for an empty lead", () => {
    expect(scoreLead({})).toBe(0);
  });
  it("rewards reachable contact info", () => {
    const base = scoreLead({});
    const withEmail = scoreLead({ email: "a@b.com" });
    const withBoth = scoreLead({ email: "a@b.com", phone: "843-555-0100" });
    expect(withEmail).toBeGreaterThan(base);
    expect(withBoth).toBeGreaterThan(withEmail);
  });
  it("ignores malformed email/phone", () => {
    expect(scoreLead({ email: "not-an-email", phone: "123" })).toBe(0);
  });
  it("weights commercial LOBs above personal", () => {
    const wc = scoreLead({ lineOfBusiness: "WORKERS_COMP" });
    const renters = scoreLead({ lineOfBusiness: "RENTERS" });
    expect(wc).toBeGreaterThan(renters);
  });
  it("rewards referral sources most", () => {
    const referral = scoreLead({ source: "referral" });
    const coldCall = scoreLead({ source: "cold call" });
    expect(referral).toBeGreaterThan(coldCall);
  });
  it("a substantial message beats a token one", () => {
    const long = scoreLead({ message: "I am closing on a new house next month and need coverage in place." });
    const short = scoreLead({ message: "hi" });
    expect(long).toBeGreaterThan(short);
    expect(short).toBeGreaterThan(0);
  });
  it("clamps to 100", () => {
    const max = scoreLead({
      email: "max@lead.com",
      phone: "843-555-0100",
      zip: "29401",
      message: "Full commercial package needed for a growing construction business.",
      lineOfBusiness: "WORKERS_COMP",
      source: "referral",
    });
    expect(max).toBeLessThanOrEqual(100);
    expect(max).toBeGreaterThanOrEqual(90);
  });
  it("is deterministic", () => {
    const input = { email: "a@b.com", source: "website", lineOfBusiness: "AUTO" as const };
    expect(scoreLead(input)).toBe(scoreLead(input));
  });
});

describe("leadGrade", () => {
  it("maps score bands to A–D", () => {
    expect(leadGrade(85)).toBe("A");
    expect(leadGrade(70)).toBe("A");
    expect(leadGrade(69)).toBe("B");
    expect(leadGrade(50)).toBe("B");
    expect(leadGrade(49)).toBe("C");
    expect(leadGrade(30)).toBe("C");
    expect(leadGrade(29)).toBe("D");
    expect(leadGrade(0)).toBe("D");
  });
});
