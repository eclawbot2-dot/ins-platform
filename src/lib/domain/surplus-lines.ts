/**
 * Surplus-lines compliance logic (Wave D-final) — pure helpers.
 *
 * Surplus-lines (E&S) business is placed with non-admitted carriers and
 * must be filed with the state's surplus-lines stamping office, with the
 * surplus-lines tax + stamping fee remitted and (usually) a diligent-
 * search affidavit on file. These helpers compute the tax/fee from a
 * premium, classify a filing's compliance state for the worklist, and
 * sort the worklist so the most urgent/overdue filings rise to the top.
 */

import type { SurplusLinesStatus } from "@prisma/client";
import { roundMoney } from "@/lib/money";

/** Compute surplus-lines tax from premium + a tax rate %. */
export function surplusLinesTax(premium: number, taxRatePct: number): number {
  if (premium <= 0 || taxRatePct <= 0) return 0;
  return roundMoney((premium * taxRatePct) / 100);
}

/** Total state remittance owed (tax + stamping fee). */
export function totalRemittance(tax: number | null, stampingFee: number | null): number {
  return roundMoney((tax ?? 0) + (stampingFee ?? 0));
}

export type FilingComplianceInput = {
  status: SurplusLinesStatus;
  diligentSearchDone: boolean;
  affidavitOnFile: boolean;
  dueDate?: Date | null;
  filedAt?: Date | null;
};

export type FilingCompliance = {
  /** Worklist bucket. */
  bucket: "OVERDUE" | "DUE_SOON" | "ACTION_NEEDED" | "COMPLETE" | "EXEMPT" | "VOID";
  /** Open compliance gaps, human-readable. */
  gaps: string[];
  /** Sort weight — higher = more urgent. */
  urgency: number;
};

const DUE_SOON_DAYS = 15;

/**
 * Classify a filing for the compliance worklist. PENDING filings with a
 * past-due date are OVERDUE; missing diligent-search/affidavit on a
 * PENDING filing is ACTION_NEEDED; FILED is COMPLETE.
 */
export function classifyFiling(
  input: FilingComplianceInput,
  asOf: Date = new Date(),
): FilingCompliance {
  if (input.status === "EXEMPT") return { bucket: "EXEMPT", gaps: [], urgency: 0 };
  if (input.status === "VOID") return { bucket: "VOID", gaps: [], urgency: 0 };
  if (input.status === "FILED") return { bucket: "COMPLETE", gaps: [], urgency: 0 };

  // PENDING.
  const gaps: string[] = [];
  if (!input.diligentSearchDone) gaps.push("Diligent search not documented");
  if (!input.affidavitOnFile) gaps.push("Affidavit not on file");
  gaps.push("Filing not yet submitted");

  const dueMs = input.dueDate?.getTime();
  const nowMs = asOf.getTime();
  if (dueMs != null && dueMs < nowMs) {
    const daysOverdue = Math.floor((nowMs - dueMs) / 86_400_000);
    return { bucket: "OVERDUE", gaps, urgency: 1000 + daysOverdue };
  }
  if (dueMs != null && dueMs - nowMs <= DUE_SOON_DAYS * 86_400_000) {
    const daysLeft = Math.ceil((dueMs - nowMs) / 86_400_000);
    return { bucket: "DUE_SOON", gaps, urgency: 500 - daysLeft };
  }
  return { bucket: "ACTION_NEEDED", gaps, urgency: 100 + gaps.length };
}

/** Is this filing still open (needs work)? */
export function filingNeedsWork(status: SurplusLinesStatus): boolean {
  return status === "PENDING";
}
