/**
 * Reference-number generators — policy, claim, certificate, invoice
 * numbers. Format: PREFIX-YYYY-NNNNN (zero-padded sequence).
 */

export function formatRefNumber(prefix: string, year: number, seq: number, pad = 5): string {
  return `${prefix}-${year}-${String(seq).padStart(pad, "0")}`;
}

/** Parse the sequence back out of a formatted ref number; null if not ours. */
export function parseRefSeq(ref: string, prefix: string): number | null {
  const m = new RegExp(`^${prefix}-(\\d{4})-(\\d+)$`).exec(ref.trim());
  if (!m) return null;
  return Number(m[2]);
}

/**
 * Next ref number given the existing ones for the same prefix+year.
 * Scans for the max sequence and increments — safe for the single-
 * writer usage pattern here.
 */
export function nextRefNumber(prefix: string, existing: ReadonlyArray<string>, year: number = new Date().getUTCFullYear()): string {
  const yearTag = `${prefix}-${year}-`;
  let max = 0;
  for (const ref of existing) {
    if (!ref.startsWith(yearTag)) continue;
    const seq = parseRefSeq(ref, prefix);
    if (seq != null && seq > max) max = seq;
  }
  return formatRefNumber(prefix, year, max + 1);
}

export const REF_PREFIXES = {
  claim: "CLM",
  certificate: "COI",
  invoice: "INV",
  policy: "POL",
} as const;
