import { describe, it, expect } from "vitest";
import { expirationSeverity, isExpiringSoon, ceProgress, ALERT_WINDOW_DAYS } from "@/lib/domain/compliance";

const asOf = new Date("2026-06-10T00:00:00Z");

describe("expirationSeverity", () => {
  it("EXPIRED for past dates", () => {
    expect(expirationSeverity(new Date("2026-06-01T00:00:00Z"), asOf)).toBe("EXPIRED");
  });
  it("CRITICAL within 30 days (inclusive)", () => {
    expect(expirationSeverity(new Date("2026-06-25T00:00:00Z"), asOf)).toBe("CRITICAL");
    expect(expirationSeverity(new Date("2026-07-10T00:00:00Z"), asOf)).toBe("CRITICAL");
  });
  it("WARNING within the 60-day window", () => {
    expect(expirationSeverity(new Date("2026-08-01T00:00:00Z"), asOf)).toBe("WARNING");
    expect(expirationSeverity(new Date("2026-08-09T00:00:00Z"), asOf)).toBe("WARNING");
  });
  it("OK beyond the window", () => {
    expect(expirationSeverity(new Date("2026-09-15T00:00:00Z"), asOf)).toBe("OK");
  });
  it("expiring today is CRITICAL, not expired", () => {
    expect(expirationSeverity(new Date("2026-06-10T00:00:00Z"), asOf)).toBe("CRITICAL");
  });
  it("honors a custom window", () => {
    expect(expirationSeverity(new Date("2026-09-15T00:00:00Z"), asOf, 120)).toBe("WARNING");
  });
});

describe("isExpiringSoon", () => {
  it("true for anything not OK", () => {
    expect(isExpiringSoon(new Date("2026-06-01T00:00:00Z"), asOf)).toBe(true);
    expect(isExpiringSoon(new Date("2026-08-01T00:00:00Z"), asOf)).toBe(true);
    expect(isExpiringSoon(new Date("2027-06-01T00:00:00Z"), asOf)).toBe(false);
  });
  it("default window matches the exported constant", () => {
    expect(ALERT_WINDOW_DAYS).toBe(60);
  });
});

describe("ceProgress", () => {
  it("computes remaining hours and percent", () => {
    expect(ceProgress(13, 24)).toEqual({ earned: 13, required: 24, remaining: 11, pct: 54, complete: false });
  });
  it("caps percent at 100 and reports complete", () => {
    expect(ceProgress(30, 24)).toEqual({ earned: 30, required: 24, remaining: 0, pct: 100, complete: true });
  });
  it("a zero-hour requirement is always complete", () => {
    expect(ceProgress(0, 0).complete).toBe(true);
    expect(ceProgress(0, 0).pct).toBe(100);
  });
  it("clamps negative earned hours to 0", () => {
    expect(ceProgress(-5, 24).earned).toBe(0);
  });
});
