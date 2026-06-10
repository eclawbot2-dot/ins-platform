/**
 * Money helpers. Prisma Decimal columns surface as objects with
 * toNumber(); these helpers normalize Decimal | number | string | null
 * to plain numbers and format USD for display.
 */

export type DecimalLike = { toNumber: () => number };

export function toNum(v: DecimalLike | number | string | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  const n = v.toNumber();
  return Number.isFinite(n) ? n : 0;
}

/** Round to cents — avoids 0.1+0.2 drift in derived amounts. */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const usdCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "$12,345" — whole-dollar display for dashboards. */
export function fmtMoney(v: DecimalLike | number | string | null | undefined): string {
  return usd.format(toNum(v));
}

/** "$12,345.67" — cents display for accounting surfaces. */
export function fmtMoneyCents(v: DecimalLike | number | string | null | undefined): string {
  return usdCents.format(toNum(v));
}

export function fmtPct(v: DecimalLike | number | string | null | undefined, digits = 1): string {
  return `${toNum(v).toFixed(digits)}%`;
}
