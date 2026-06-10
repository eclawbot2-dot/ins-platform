/**
 * Date helpers — pure, UTC-normalized day math so renewal buckets and
 * expiration windows don't drift across timezones / DST boundaries.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Truncate to UTC midnight. */
export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Whole days from `from` to `to` (negative when `to` is in the past). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((utcDay(to).getTime() - utcDay(from).getTime()) / DAY_MS);
}

/** Whole days from now (or `asOf`) until `d`. */
export function daysUntil(d: Date, asOf: Date = new Date()): number {
  return daysBetween(asOf, d);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/**
 * Add `years` to a date, clamping Feb 29 -> Feb 28 in non-leap targets
 * (the standard policy-term convention).
 */
export function addYears(d: Date, years: number): Date {
  const y = d.getUTCFullYear() + years;
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const candidate = new Date(Date.UTC(y, m, day, d.getUTCHours(), d.getUTCMinutes()));
  // JS rolls Feb 29 -> Mar 1 in non-leap years; clamp back.
  if (candidate.getUTCMonth() !== m) {
    return new Date(Date.UTC(y, m + 1, 0, d.getUTCHours(), d.getUTCMinutes()));
  }
  return candidate;
}

export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function startOfYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Days in the policy term [effective, expiration). */
export function termDays(effective: Date, expiration: Date): number {
  return Math.max(0, daysBetween(effective, expiration));
}

const fmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return fmt.format(d);
}

export function fmtDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}
