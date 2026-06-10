/**
 * Pure Xero → local invoice status mapping. Lives apart from
 * invoices.ts so unit tests can import it without touching Prisma.
 */

export type LocalInvoiceStatus = "DRAFT" | "SENT" | "PARTIAL" | "PAID" | "VOID";

/**
 * Map a Xero ACCREC status onto the local Invoice row:
 *   PAID                                → PAID (paidAt = FullyPaidOnDate > existing > now)
 *   VOIDED/DELETED                      → VOID, paidAt cleared
 *   AUTHORISED, partial AmountPaid > 0  → PARTIAL
 *   AUTHORISED, no payment              → SENT (receivable open)
 *   anything else                       → null (no change)
 */
export function mapXeroInvoiceStatus(
  xero: { Status?: string; AmountPaid?: number },
  local: { status: LocalInvoiceStatus; paidAt: Date | null },
  fullyPaidOn: Date | null,
  now: Date = new Date(),
): { status: LocalInvoiceStatus; paidAt: Date | null } | null {
  if (xero.Status === "PAID") {
    return { status: "PAID", paidAt: fullyPaidOn ?? local.paidAt ?? now };
  }
  if (xero.Status === "VOIDED" || xero.Status === "DELETED") {
    return { status: "VOID", paidAt: null };
  }
  if (xero.Status === "AUTHORISED") {
    if ((xero.AmountPaid ?? 0) > 0) return { status: "PARTIAL", paidAt: null };
    if (local.status === "DRAFT" || local.status === "PAID") return { status: "SENT", paidAt: null };
    return null;
  }
  return null;
}
