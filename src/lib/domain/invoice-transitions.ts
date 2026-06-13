/**
 * Invoice status-transition guards — the AR invariants that keep a settled
 * invoice settled and prevent phantom receivables from re-opening it.
 *
 * Pure predicates so the accounting server actions and their tests share one
 * source of truth:
 *   - VOID is a terminal "cancelled" state: no payments, no new lines, can't
 *     be marked SENT.
 *   - PAID is terminal-paid: no further payment, no new lines.
 *   - Only a DRAFT can be marked SENT (so AR doesn't gain a row that already
 *     settled or was voided).
 */

import type { InvoiceStatus } from "@prisma/client";

/** A payment may be recorded against DRAFT, SENT, or PARTIAL invoices only. */
export function canRecordPayment(status: InvoiceStatus): boolean {
  return status === "DRAFT" || status === "SENT" || status === "PARTIAL";
}

/** Lines may be added while the invoice is still open (not VOID, not PAID). */
export function canAddLine(status: InvoiceStatus): boolean {
  return status !== "VOID" && status !== "PAID";
}

/** Only a DRAFT invoice may be marked SENT. */
export function canMarkSent(status: InvoiceStatus): boolean {
  return status === "DRAFT";
}

/**
 * Compute the post-payment state. `payment` is clamped so paidAmount never
 * exceeds the invoice total — no overpayment, no negative balance drift.
 * Caller is responsible for rejecting non-payable statuses (canRecordPayment)
 * and non-positive payments first.
 */
export function applyPayment(
  amount: number,
  priorPaid: number,
  payment: number,
): { paidAmount: number; status: Extract<InvoiceStatus, "PARTIAL" | "PAID">; fullyPaid: boolean } {
  const paidAmount = Math.round(Math.min(amount, priorPaid + payment) * 100) / 100;
  const fullyPaid = paidAmount >= amount;
  return { paidAmount, status: fullyPaid ? "PAID" : "PARTIAL", fullyPaid };
}
