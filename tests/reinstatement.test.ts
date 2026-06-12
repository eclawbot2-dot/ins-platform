import { describe, it, expect } from "vitest";
import { reinstatementEligibility, lapseHandlingNote, REINSTATEMENT_WINDOW_DAYS } from "@/lib/domain/reinstatement";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe("reinstatementEligibility", () => {
  const expiration = utc(2026, 12, 1); // far future term end

  it("is ineligible for non-cancelled policies", () => {
    const r = reinstatementEligibility({ status: "ACTIVE", cancelledAt: null, expirationDate: expiration }, utc(2026, 6, 12));
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/cancelled/i);
  });

  it("is eligible with no lapse when reinstated on the cancellation date", () => {
    const r = reinstatementEligibility(
      { status: "CANCELLED", cancelledAt: utc(2026, 6, 12), expirationDate: expiration },
      utc(2026, 6, 12),
    );
    expect(r.eligible).toBe(true);
    expect(r.lapseDays).toBe(0);
    expect(r.reason).toMatch(/no lapse/i);
  });

  it("is eligible within the window and reports the lapse", () => {
    const r = reinstatementEligibility(
      { status: "CANCELLED", cancelledAt: utc(2026, 6, 1), expirationDate: expiration },
      utc(2026, 6, 12),
    );
    expect(r.eligible).toBe(true);
    expect(r.lapseDays).toBe(11);
    expect(r.daysLeftInWindow).toBe(REINSTATEMENT_WINDOW_DAYS - 11);
  });

  it("closes once the window passes", () => {
    const r = reinstatementEligibility(
      { status: "CANCELLED", cancelledAt: utc(2026, 5, 1), expirationDate: expiration },
      utc(2026, 6, 12), // 42 days later > 30
    );
    expect(r.eligible).toBe(false);
    expect(r.lapseDays).toBe(42);
    expect(r.reason).toMatch(/window closed/i);
  });

  it("respects a custom window length", () => {
    const r = reinstatementEligibility(
      { status: "CANCELLED", cancelledAt: utc(2026, 5, 1), expirationDate: expiration, windowDays: 60 },
      utc(2026, 6, 12),
    );
    expect(r.eligible).toBe(true);
  });

  it("refuses to reinstate an expired term", () => {
    const r = reinstatementEligibility(
      { status: "CANCELLED", cancelledAt: utc(2026, 6, 5), expirationDate: utc(2026, 6, 10) },
      utc(2026, 6, 12),
    );
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/expired/i);
  });
});

describe("lapseHandlingNote", () => {
  it("notes no lapse for a same-day reinstatement", () => {
    expect(lapseHandlingNote(0)).toMatch(/no lapse/i);
  });
  it("describes the excluded gap for a lapse", () => {
    expect(lapseHandlingNote(7)).toMatch(/7-day lapse/);
  });
});
