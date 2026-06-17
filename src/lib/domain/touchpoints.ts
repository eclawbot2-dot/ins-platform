/**
 * Pure lifecycle-touchpoint logic — offset math, idempotency keys,
 * quiet-hours + opt-out gating, audience filtering. No DB, no I/O, so
 * the evaluator's decisions are unit-testable in isolation.
 */

import type {
  TouchpointCategory,
  TouchpointTrigger,
  TouchpointChannel,
} from "@prisma/client";
import { addDays, utcDay } from "./dates";

/** The per-client facts the evaluator needs to decide a template's due-ness. */
export type ClientTouchpointCtx = {
  clientId: string;
  status: string; // ClientStatus
  type: string; // ClientType
  createdAt: Date; // tenure anchor
  dateOfBirth?: Date | null;
  /** Active/bound policies for renewal + anniversary triggers. */
  policies: Array<{
    id: string;
    lineOfBusiness: string;
    status: string;
    effectiveDate: Date;
    expirationDate: Date;
  }>;
  /** Open invoices for payment-due triggers. */
  openInvoices: Array<{ id: string; dueDate: Date }>;
};

/** A template, narrowed to the fields that drive scheduling. */
export type TouchpointTemplateLike = {
  key: string;
  category: TouchpointCategory;
  channel: TouchpointChannel;
  triggerType: TouchpointTrigger;
  offsetDays: number;
  holidayKey?: string | null;
  tenureMonths?: number | null;
  audienceFilter?: unknown;
};

/** A concrete scheduling decision produced for one (template, client) pair. */
export type DueTouchpoint = {
  scheduledFor: Date;
  idempotencyKey: string;
  relatedType?: string;
  relatedId?: string;
};

/** Comm-preference shape the gates read (subset of the Prisma model). */
export type CommPrefsLike = {
  doNotContact: boolean;
  optOnboarding: boolean;
  optRenewal: boolean;
  optPayment: boolean;
  optClaim: boolean;
  optAppreciation: boolean;
  optSatisfaction: boolean;
  optOffboarding: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
};

/** US fixed-ish holidays the appreciation journey leans on (month/day, 1-based month). */
export const HOLIDAYS: Record<string, { month: number; day: number; label: string }> = {
  thanksgiving: { month: 11, day: 0, label: "Thanksgiving" }, // day 0 → 4th Thursday, resolved below
  newyear: { month: 1, day: 1, label: "New Year's Day" },
};

/** Resolve a holidayKey to its date in `year` (UTC midnight). */
export function holidayDate(holidayKey: string, year: number): Date | null {
  if (holidayKey === "thanksgiving") {
    // 4th Thursday of November.
    const nov1 = new Date(Date.UTC(year, 10, 1));
    const firstThursdayOffset = (4 - nov1.getUTCDay() + 7) % 7; // 0=Sun … 4=Thu
    const day = 1 + firstThursdayOffset + 21;
    return new Date(Date.UTC(year, 10, day));
  }
  if (holidayKey === "newyear") return new Date(Date.UTC(year, 0, 1));
  const h = HOLIDAYS[holidayKey];
  if (!h) return null;
  return new Date(Date.UTC(year, h.month - 1, h.day));
}

/** Map a template category to the opt-out flag that governs it. */
export function categoryOptedIn(prefs: CommPrefsLike | null | undefined, category: TouchpointCategory): boolean {
  if (!prefs) return true; // no prefs row → defaults (opted in)
  switch (category) {
    case "ONBOARDING":
      return prefs.optOnboarding;
    case "RENEWAL":
      return prefs.optRenewal;
    case "PAYMENT":
      return prefs.optPayment;
    case "CLAIM":
      return prefs.optClaim;
    case "APPRECIATION":
      return prefs.optAppreciation;
    case "SATISFACTION":
      return prefs.optSatisfaction;
    case "OFFBOARDING":
      return prefs.optOffboarding;
    default:
      return true;
  }
}

/**
 * Is `when` inside the client's quiet hours? Quiet hours run OUTSIDE the
 * [start, end) waking window, so a send is "quiet" when the local hour is
 * before start or at/after end. Used only for SMS (email is always allowed).
 */
export function isQuietHour(prefs: CommPrefsLike | null | undefined, when: Date): boolean {
  const start = prefs?.quietHoursStart ?? 8;
  const end = prefs?.quietHoursEnd ?? 20;
  const hour = when.getUTCHours();
  if (start <= end) return hour < start || hour >= end;
  // Wrapped window (e.g. 20→8) — waking hours straddle midnight.
  return hour >= end && hour < start;
}

/** A stable, collision-resistant idempotency key for a scheduled touchpoint. */
export function buildIdempotencyKey(templateKey: string, clientId: string, anchorDate: Date): string {
  const day = utcDay(anchorDate).toISOString().slice(0, 10);
  return `${templateKey}:${clientId}:${day}`;
}

/** Recurring annual anchor: the next occurrence of month/day at/after asOf.
 *  A Feb-29 anchor clamps to Feb-28 in non-leap years (matches addYears) so a
 *  leap-day birthday/anniversary fires on Feb 28, not rolls forward to Mar 1. */
function annualOccurrence(month: number, day: number, year: number): Date {
  const candidate = new Date(Date.UTC(year, month, day));
  // JS rolls Feb 29 -> Mar 1 in non-leap years; clamp back to last day of month.
  if (candidate.getUTCMonth() !== month) return new Date(Date.UTC(year, month + 1, 0));
  return candidate;
}
function nextAnnualOccurrence(month: number, day: number, asOf: Date): Date {
  const year = asOf.getUTCFullYear();
  const thisYear = annualOccurrence(month, day, year);
  return utcDay(thisYear) >= utcDay(asOf) ? thisYear : annualOccurrence(month, day, year + 1);
}

/** Months between two dates (whole months, anchored on day-of-month). */
export function monthsBetween(from: Date, to: Date): number {
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return months;
}

/** Apply a template's audienceFilter (status/type/lob) to a client context. */
export function matchesAudience(filter: unknown, ctx: ClientTouchpointCtx): boolean {
  if (!filter || typeof filter !== "object") return true;
  const f = filter as Record<string, unknown>;
  if (Array.isArray(f.status) && !(f.status as string[]).includes(ctx.status)) return false;
  if (typeof f.status === "string" && f.status !== ctx.status) return false;
  if (Array.isArray(f.type) && !(f.type as string[]).includes(ctx.type)) return false;
  if (typeof f.type === "string" && f.type !== ctx.type) return false;
  if (Array.isArray(f.lineOfBusiness)) {
    const lobs = (f.lineOfBusiness as string[]);
    if (!ctx.policies.some((p) => lobs.includes(p.lineOfBusiness))) return false;
  }
  return true;
}

/**
 * Decide whether `template` is due for `ctx` as of `asOf`. Returns the
 * first concrete scheduling decision (or null). The evaluator UPSERTs on
 * the returned idempotencyKey, so a re-run on the same day is a no-op.
 *
 * Scan windows: for relative triggers (renewal/payment), the anchor is
 * (anchorDate + offsetDays) and a hit fires when that send date is within
 * [asOf, asOf+windowDays). Recurring triggers (birthday/anniversary/
 * holiday/tenure) fire on the day the (offset-shifted) anchor lands today.
 */
export function dueTouchpoints(
  template: TouchpointTemplateLike,
  ctx: ClientTouchpointCtx,
  asOf: Date = new Date(),
): DueTouchpoint | null {
  if (!matchesAudience(template.audienceFilter, ctx)) return null;
  const today = utcDay(asOf);

  switch (template.triggerType) {
    case "RENEWAL_RELATIVE": {
      // offsetDays is negative (e.g. -90). Send date = expiration + offset.
      for (const p of ctx.policies) {
        if (p.status !== "ACTIVE" && p.status !== "BOUND") continue;
        const sendDate = utcDay(addDays(p.expirationDate, template.offsetDays));
        if (sendDate.getTime() === today.getTime()) {
          return {
            scheduledFor: sendDate,
            idempotencyKey: buildIdempotencyKey(template.key, ctx.clientId, p.expirationDate),
            relatedType: "Policy",
            relatedId: p.id,
          };
        }
      }
      return null;
    }
    case "PAYMENT_DUE_RELATIVE": {
      for (const inv of ctx.openInvoices) {
        const sendDate = utcDay(addDays(inv.dueDate, template.offsetDays));
        if (sendDate.getTime() === today.getTime()) {
          return {
            scheduledFor: sendDate,
            idempotencyKey: buildIdempotencyKey(template.key, ctx.clientId, inv.dueDate),
            relatedType: "Invoice",
            relatedId: inv.id,
          };
        }
      }
      return null;
    }
    case "BIRTHDAY": {
      if (!ctx.dateOfBirth) return null;
      const occ = utcDay(addDays(nextAnnualOccurrence(ctx.dateOfBirth.getUTCMonth(), ctx.dateOfBirth.getUTCDate(), asOf), template.offsetDays));
      if (occ.getTime() === today.getTime()) {
        return { scheduledFor: occ, idempotencyKey: buildIdempotencyKey(template.key, ctx.clientId, occ) };
      }
      return null;
    }
    case "POLICY_ANNIVERSARY": {
      for (const p of ctx.policies) {
        if (p.status !== "ACTIVE" && p.status !== "BOUND") continue;
        const occ = utcDay(addDays(nextAnnualOccurrence(p.effectiveDate.getUTCMonth(), p.effectiveDate.getUTCDate(), asOf), template.offsetDays));
        if (occ.getTime() === today.getTime()) {
          return {
            scheduledFor: occ,
            idempotencyKey: buildIdempotencyKey(template.key, ctx.clientId, p.effectiveDate),
            relatedType: "Policy",
            relatedId: p.id,
          };
        }
      }
      return null;
    }
    case "HOLIDAY": {
      if (!template.holidayKey) return null;
      const hd = holidayDate(template.holidayKey, asOf.getUTCFullYear());
      if (!hd) return null;
      const occ = utcDay(addDays(hd, template.offsetDays));
      if (occ.getTime() === today.getTime()) {
        return { scheduledFor: occ, idempotencyKey: buildIdempotencyKey(template.key, ctx.clientId, hd) };
      }
      return null;
    }
    case "TENURE_MILESTONE": {
      if (!template.tenureMonths) return null;
      // Fire on the day the client hits exactly tenureMonths of tenure.
      const months = monthsBetween(ctx.createdAt, asOf);
      if (months !== template.tenureMonths) return null;
      // Anchor on the milestone day-of-month so the key is stable.
      const anchor = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), ctx.createdAt.getUTCDate()));
      if (utcDay(anchor).getTime() !== today.getTime()) return null;
      return { scheduledFor: today, idempotencyKey: buildIdempotencyKey(template.key, ctx.clientId, anchor) };
    }
    case "LIFECYCLE_EVENT":
    case "MANUAL":
    default:
      // Event-inserted, not scanned.
      return null;
  }
}
