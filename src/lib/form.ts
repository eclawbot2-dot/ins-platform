/**
 * FormData coercion helpers for server actions. Empty strings become
 * null/undefined so optional Prisma fields stay clean.
 */

export function fStr(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export function fStrOpt(fd: FormData, key: string): string | null {
  const v = fStr(fd, key);
  return v === "" ? null : v;
}

export function fNum(fd: FormData, key: string, fallback = 0): number {
  const v = fStr(fd, key).replace(/[$,]/g, "");
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function fNumOpt(fd: FormData, key: string): number | null {
  const v = fStr(fd, key).replace(/[$,]/g, "");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Parse yyyy-mm-dd from a date input as UTC midnight. */
export function fDate(fd: FormData, key: string): Date | null {
  const v = fStr(fd, key);
  if (!v) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fBool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

/** Validate a value against an enum-like list; returns fallback when absent. */
export function fEnum<T extends string>(fd: FormData, key: string, allowed: readonly T[], fallback: T): T {
  const v = fStr(fd, key) as T;
  return allowed.includes(v) ? v : fallback;
}

export function fEnumOpt<T extends string>(fd: FormData, key: string, allowed: readonly T[]): T | null {
  const v = fStr(fd, key) as T;
  return allowed.includes(v) ? v : null;
}
