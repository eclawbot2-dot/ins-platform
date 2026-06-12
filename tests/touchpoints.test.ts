import { describe, it, expect } from "vitest";
import {
  dueTouchpoints,
  buildIdempotencyKey,
  categoryOptedIn,
  isQuietHour,
  matchesAudience,
  holidayDate,
  monthsBetween,
  type ClientTouchpointCtx,
  type TouchpointTemplateLike,
  type CommPrefsLike,
} from "@/lib/domain/touchpoints";

const baseCtx = (over: Partial<ClientTouchpointCtx> = {}): ClientTouchpointCtx => ({
  clientId: "c1",
  status: "ACTIVE",
  type: "INDIVIDUAL",
  createdAt: new Date(Date.UTC(2020, 0, 15)),
  dateOfBirth: null,
  policies: [],
  openInvoices: [],
  ...over,
});

const tpl = (over: Partial<TouchpointTemplateLike>): TouchpointTemplateLike => ({
  key: "k",
  category: "RENEWAL",
  channel: "EMAIL",
  triggerType: "RENEWAL_RELATIVE",
  offsetDays: 0,
  ...over,
});

const prefs = (over: Partial<CommPrefsLike> = {}): CommPrefsLike => ({
  doNotContact: false,
  optOnboarding: true,
  optRenewal: true,
  optPayment: true,
  optClaim: true,
  optAppreciation: true,
  optSatisfaction: true,
  optOffboarding: true,
  quietHoursStart: 8,
  quietHoursEnd: 20,
  ...over,
});

describe("buildIdempotencyKey", () => {
  it("is stable regardless of the time-of-day in the anchor", () => {
    const a = buildIdempotencyKey("renewal-90", "c1", new Date("2026-06-01T09:30:00Z"));
    const b = buildIdempotencyKey("renewal-90", "c1", new Date("2026-06-01T23:59:00Z"));
    expect(a).toBe(b);
    expect(a).toBe("renewal-90:c1:2026-06-01");
  });
  it("differs by template, client, and day", () => {
    const base = buildIdempotencyKey("renewal-90", "c1", new Date("2026-06-01T00:00:00Z"));
    expect(buildIdempotencyKey("renewal-60", "c1", new Date("2026-06-01T00:00:00Z"))).not.toBe(base);
    expect(buildIdempotencyKey("renewal-90", "c2", new Date("2026-06-01T00:00:00Z"))).not.toBe(base);
    expect(buildIdempotencyKey("renewal-90", "c1", new Date("2026-06-02T00:00:00Z"))).not.toBe(base);
  });
});

describe("dueTouchpoints — RENEWAL_RELATIVE offset math", () => {
  const expiration = new Date(Date.UTC(2026, 8, 1)); // 2026-09-01
  const ctx = baseCtx({
    policies: [{ id: "p1", lineOfBusiness: "AUTO", status: "ACTIVE", effectiveDate: new Date(Date.UTC(2025, 8, 1)), expirationDate: expiration }],
  });
  it("fires exactly offsetDays before expiration", () => {
    const t = tpl({ key: "renewal-90", offsetDays: -90 });
    const asOf = new Date(Date.UTC(2026, 5, 3)); // 90 days before 2026-09-01
    const out = dueTouchpoints(t, ctx, asOf);
    expect(out).not.toBeNull();
    expect(out!.relatedType).toBe("Policy");
    expect(out!.relatedId).toBe("p1");
    expect(out!.idempotencyKey).toBe("renewal-90:c1:2026-09-01");
  });
  it("does NOT fire a day early", () => {
    const t = tpl({ key: "renewal-90", offsetDays: -90 });
    expect(dueTouchpoints(t, ctx, new Date(Date.UTC(2026, 5, 2)))).toBeNull();
  });
  it("ignores non-active policies", () => {
    const cancelled = baseCtx({ policies: [{ id: "p2", lineOfBusiness: "AUTO", status: "CANCELLED", effectiveDate: new Date(), expirationDate: expiration }] });
    expect(dueTouchpoints(tpl({ offsetDays: -90 }), cancelled, new Date(Date.UTC(2026, 5, 3)))).toBeNull();
  });
});

describe("dueTouchpoints — BIRTHDAY (recurring annual)", () => {
  it("fires on the birthday regardless of birth year", () => {
    const ctx = baseCtx({ dateOfBirth: new Date(Date.UTC(1980, 5, 14)) }); // June 14
    const t = tpl({ key: "birthday", category: "APPRECIATION", triggerType: "BIRTHDAY", offsetDays: 0 });
    const out = dueTouchpoints(t, ctx, new Date(Date.UTC(2026, 5, 14)));
    expect(out).not.toBeNull();
  });
  it("does not fire on other days", () => {
    const ctx = baseCtx({ dateOfBirth: new Date(Date.UTC(1980, 5, 14)) });
    expect(dueTouchpoints(tpl({ triggerType: "BIRTHDAY" }), ctx, new Date(Date.UTC(2026, 5, 13)))).toBeNull();
  });
});

describe("dueTouchpoints — TENURE_MILESTONE", () => {
  it("fires on the exact tenure month on the join day-of-month", () => {
    const ctx = baseCtx({ createdAt: new Date(Date.UTC(2023, 0, 15)) }); // 3 years → 2026-01-15
    const t = tpl({ key: "tenure-3yr", category: "APPRECIATION", triggerType: "TENURE_MILESTONE", tenureMonths: 36 });
    expect(dueTouchpoints(t, ctx, new Date(Date.UTC(2026, 0, 15)))).not.toBeNull();
    expect(dueTouchpoints(t, ctx, new Date(Date.UTC(2026, 0, 16)))).toBeNull();
  });
});

describe("dueTouchpoints — HOLIDAY", () => {
  it("resolves Thanksgiving to the 4th Thursday and applies the offset", () => {
    // 2026-11-26 is the 4th Thursday; offset -2 → 2026-11-24.
    const t = tpl({ key: "ty", category: "APPRECIATION", triggerType: "HOLIDAY", holidayKey: "thanksgiving", offsetDays: -2 });
    expect(holidayDate("thanksgiving", 2026)?.toISOString().slice(0, 10)).toBe("2026-11-26");
    expect(dueTouchpoints(t, baseCtx(), new Date(Date.UTC(2026, 10, 24)))).not.toBeNull();
    expect(dueTouchpoints(t, baseCtx(), new Date(Date.UTC(2026, 10, 25)))).toBeNull();
  });
});

describe("matchesAudience", () => {
  it("filters by status array", () => {
    expect(matchesAudience({ status: ["ACTIVE"] }, baseCtx({ status: "ACTIVE" }))).toBe(true);
    expect(matchesAudience({ status: ["FORMER"] }, baseCtx({ status: "ACTIVE" }))).toBe(false);
  });
  it("filters by line of business across policies", () => {
    const ctx = baseCtx({ policies: [{ id: "p", lineOfBusiness: "HOME", status: "ACTIVE", effectiveDate: new Date(), expirationDate: new Date() }] });
    expect(matchesAudience({ lineOfBusiness: ["HOME"] }, ctx)).toBe(true);
    expect(matchesAudience({ lineOfBusiness: ["AUTO"] }, ctx)).toBe(false);
  });
  it("treats no filter as always-match", () => {
    expect(matchesAudience(null, baseCtx())).toBe(true);
    expect(matchesAudience(undefined, baseCtx())).toBe(true);
  });
});

describe("isQuietHour boundary", () => {
  it("is quiet before start and at/after end (08:00–20:00 window)", () => {
    expect(isQuietHour(prefs(), new Date(Date.UTC(2026, 0, 1, 7, 59)))).toBe(true);
    expect(isQuietHour(prefs(), new Date(Date.UTC(2026, 0, 1, 8, 0)))).toBe(false);
    expect(isQuietHour(prefs(), new Date(Date.UTC(2026, 0, 1, 19, 59)))).toBe(false);
    expect(isQuietHour(prefs(), new Date(Date.UTC(2026, 0, 1, 20, 0)))).toBe(true);
  });
});

describe("categoryOptedIn gating", () => {
  it("maps each category to its opt flag", () => {
    expect(categoryOptedIn(prefs({ optAppreciation: false }), "APPRECIATION")).toBe(false);
    expect(categoryOptedIn(prefs({ optAppreciation: false }), "RENEWAL")).toBe(true);
    expect(categoryOptedIn(prefs({ optRenewal: false }), "RENEWAL")).toBe(false);
  });
  it("defaults to opted-in when no prefs row exists", () => {
    expect(categoryOptedIn(null, "APPRECIATION")).toBe(true);
  });
});

describe("monthsBetween", () => {
  it("counts whole months anchored on day-of-month", () => {
    expect(monthsBetween(new Date(Date.UTC(2023, 0, 15)), new Date(Date.UTC(2026, 0, 15)))).toBe(36);
    expect(monthsBetween(new Date(Date.UTC(2023, 0, 15)), new Date(Date.UTC(2026, 0, 14)))).toBe(35);
  });
});
