import { describe, it, expect } from "vitest";
import { daysBetween, daysUntil, addYears, termDays, isLeapYear, utcDay, fmtDateInput } from "@/lib/domain/dates";

describe("daysBetween", () => {
  it("counts whole UTC days", () => {
    expect(daysBetween(new Date("2026-06-01T00:00:00Z"), new Date("2026-06-10T00:00:00Z"))).toBe(9);
  });
  it("is negative when 'to' precedes 'from'", () => {
    expect(daysBetween(new Date("2026-06-10T00:00:00Z"), new Date("2026-06-01T00:00:00Z"))).toBe(-9);
  });
  it("ignores intra-day time differences", () => {
    expect(daysBetween(new Date("2026-06-01T23:59:00Z"), new Date("2026-06-02T00:01:00Z"))).toBe(1);
  });
});

describe("daysUntil", () => {
  it("uses the provided asOf", () => {
    expect(daysUntil(new Date("2026-07-10T00:00:00Z"), new Date("2026-06-10T00:00:00Z"))).toBe(30);
  });
});

describe("addYears", () => {
  it("adds calendar years", () => {
    expect(addYears(new Date("2026-03-15T00:00:00Z"), 1).toISOString()).toBe("2027-03-15T00:00:00.000Z");
  });
  it("clamps Feb 29 to Feb 28 in non-leap targets", () => {
    expect(addYears(new Date("2024-02-29T00:00:00Z"), 1).toISOString()).toBe("2025-02-28T00:00:00.000Z");
  });
  it("keeps Feb 29 when the target is a leap year", () => {
    expect(addYears(new Date("2024-02-29T00:00:00Z"), 4).toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });
});

describe("termDays", () => {
  it("is 365 for a standard annual term", () => {
    expect(termDays(new Date("2026-01-01T00:00:00Z"), new Date("2027-01-01T00:00:00Z"))).toBe(365);
  });
  it("is 366 across a leap year", () => {
    expect(termDays(new Date("2024-01-01T00:00:00Z"), new Date("2025-01-01T00:00:00Z"))).toBe(366);
  });
  it("never goes negative", () => {
    expect(termDays(new Date("2026-01-02T00:00:00Z"), new Date("2026-01-01T00:00:00Z"))).toBe(0);
  });
});

describe("misc date helpers", () => {
  it("isLeapYear handles century rules", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });
  it("utcDay truncates to midnight UTC", () => {
    expect(utcDay(new Date("2026-06-10T18:30:00Z")).toISOString()).toBe("2026-06-10T00:00:00.000Z");
  });
  it("fmtDateInput emits yyyy-mm-dd and empty for null", () => {
    expect(fmtDateInput(new Date("2026-06-10T00:00:00Z"))).toBe("2026-06-10");
    expect(fmtDateInput(null)).toBe("");
  });
});
