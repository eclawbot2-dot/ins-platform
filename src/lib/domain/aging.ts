/**
 * AR aging — bucket open invoice balances by days past due. Standard
 * Current / 1–30 / 31–60 / 61–90 / 90+ buckets.
 */

import { roundMoney } from "@/lib/money";
import { daysBetween } from "./dates";

export type AgingBucket = "CURRENT" | "D1_30" | "D31_60" | "D61_90" | "D90_PLUS";

export const AGING_BUCKETS: AgingBucket[] = ["CURRENT", "D1_30", "D31_60", "D61_90", "D90_PLUS"];

export const AGING_LABELS: Record<AgingBucket, string> = {
  CURRENT: "Current",
  D1_30: "1–30 days",
  D31_60: "31–60 days",
  D61_90: "61–90 days",
  D90_PLUS: "90+ days",
};

export function agingBucket(dueDate: Date, asOf: Date = new Date()): AgingBucket {
  const overdue = daysBetween(dueDate, asOf); // positive when past due
  if (overdue <= 0) return "CURRENT";
  if (overdue <= 30) return "D1_30";
  if (overdue <= 60) return "D31_60";
  if (overdue <= 90) return "D61_90";
  return "D90_PLUS";
}

export type AgingInvoice = {
  dueDate: Date;
  amount: number;
  paidAmount: number;
};

/** Open balance of an invoice (never negative). */
export function openBalance(inv: { amount: number; paidAmount: number }): number {
  return roundMoney(Math.max(0, inv.amount - inv.paidAmount));
}

export type AgingSummary = Record<AgingBucket, number> & { total: number };

export function agingSummary(invoices: ReadonlyArray<AgingInvoice>, asOf: Date = new Date()): AgingSummary {
  const out: AgingSummary = { CURRENT: 0, D1_30: 0, D31_60: 0, D61_90: 0, D90_PLUS: 0, total: 0 };
  for (const inv of invoices) {
    const bal = openBalance(inv);
    if (bal <= 0) continue;
    const bucket = agingBucket(inv.dueDate, asOf);
    out[bucket] = roundMoney(out[bucket] + bal);
    out.total = roundMoney(out.total + bal);
  }
  return out;
}
