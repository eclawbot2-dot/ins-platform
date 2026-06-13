"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStr, fStrOpt, fNum, fNumOpt, fDate } from "@/lib/form";
import { nextRefNumber, REF_PREFIXES } from "@/lib/domain/numbers";
import { roundMoney, toNum } from "@/lib/money";
import { addDays } from "@/lib/domain/dates";
import { scheduleTouchpoint } from "@/lib/touchpoint-engine";
import { syncXero } from "@/lib/integrations/xero/invoices";
import { canRecordPayment, canAddLine, applyPayment } from "@/lib/domain/invoice-transitions";

/**
 * Create an agency-bill invoice for a client (optionally tied to a
 * policy). A single line is created from the description + amount; the
 * detail page allows adding more lines.
 */
export async function createInvoice(formData: FormData) {
  const session = await requireSession();
  const clientId = fStr(formData, "clientId");
  if (!clientId) redirect(`/accounting?toastError=${encodeURIComponent("Client is required")}`);

  const policyId = fStrOpt(formData, "policyId");
  const amount = fNum(formData, "amount");
  if (amount <= 0) redirect(`/accounting?toastError=${encodeURIComponent("Amount must be positive")}`);

  const policy = policyId
    ? await prisma.policy.findUnique({ where: { id: policyId }, select: { policyNumber: true, clientId: true } })
    : null;

  const existing = await prisma.invoice.findMany({ select: { invoiceNumber: true } });
  const invoiceNumber = nextRefNumber(REF_PREFIXES.invoice, existing.map((i) => i.invoiceNumber));

  const description =
    fStrOpt(formData, "description") ?? (policy ? `Premium — policy ${policy.policyNumber}` : "Premium due");

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      clientId,
      policyId: policy && policy.clientId === clientId ? policyId : null,
      issueDate: fDate(formData, "issueDate") ?? new Date(),
      dueDate: fDate(formData, "dueDate") ?? addDays(new Date(), 30),
      amount: roundMoney(amount),
      notes: fStrOpt(formData, "notes"),
      lines: { create: [{ description, quantity: 1, unitAmount: roundMoney(amount), amount: roundMoney(amount) }] },
    },
  });
  await audit({ userId: session.userId, action: "INVOICE_CREATE", entityType: "Invoice", entityId: invoice.id, detail: invoiceNumber });
  redirect(`/accounting/${invoice.id}?toast=${encodeURIComponent(`Invoice ${invoiceNumber} created`)}`);
}

export async function addInvoiceLine(invoiceId: string, formData: FormData) {
  await requireSession();
  // No edits to a settled invoice — a VOID or fully-PAID invoice's total is
  // final; adding a line would silently re-open its balance.
  const target = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { status: true } });
  if (!target) redirect(`/accounting?toastError=${encodeURIComponent("Invoice not found")}`);
  if (!canAddLine(target.status)) {
    redirect(`/accounting/${invoiceId}?toastError=${encodeURIComponent("This invoice is settled — no further lines can be added")}`);
  }
  const qty = fNumOpt(formData, "quantity") ?? 1;
  const unit = fNum(formData, "unitAmount");
  const amount = roundMoney(qty * unit);
  await prisma.invoiceLine.create({
    data: {
      invoiceId,
      description: fStr(formData, "description") || "Line item",
      quantity: qty,
      unitAmount: roundMoney(unit),
      amount,
    },
  });
  // Re-total the invoice from its lines.
  const lines = await prisma.invoiceLine.findMany({ where: { invoiceId } });
  const total = roundMoney(lines.reduce((acc, l) => acc + toNum(l.amount), 0));
  await prisma.invoice.update({ where: { id: invoiceId }, data: { amount: total } });
  revalidatePath(`/accounting/${invoiceId}`);
  redirect(`/accounting/${invoiceId}?toast=${encodeURIComponent("Line added")}`);
}

export async function markInvoiceSent(invoiceId: string) {
  const session = await requireSession();
  // Only a DRAFT moves to SENT — never resurrect a VOID/PAID/PARTIAL invoice
  // into the open-AR "SENT" bucket (a phantom-receivable transition).
  const { count } = await prisma.invoice.updateMany({
    where: { id: invoiceId, status: "DRAFT" },
    data: { status: "SENT" },
  });
  if (count === 0) {
    redirect(`/accounting/${invoiceId}?toastError=${encodeURIComponent("Only a draft invoice can be marked sent")}`);
  }
  await audit({ userId: session.userId, action: "INVOICE_SENT", entityType: "Invoice", entityId: invoiceId });
  revalidatePath(`/accounting/${invoiceId}`);
  redirect(`/accounting/${invoiceId}?toast=${encodeURIComponent("Invoice marked sent")}`);
}

export async function recordInvoicePayment(invoiceId: string, formData: FormData) {
  const session = await requireSession();
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) redirect(`/accounting?toastError=${encodeURIComponent("Invoice not found")}`);
  // A VOID invoice is settled-as-cancelled — recording a payment against it
  // would resurrect it as PARTIAL/PAID (phantom AR). A fully-PAID invoice
  // takes no further payment. Both are rejected at the action.
  if (!canRecordPayment(invoice.status)) {
    redirect(
      `/accounting/${invoiceId}?toastError=${encodeURIComponent(
        invoice.status === "VOID"
          ? "This invoice is void — reinstate it before recording a payment"
          : "This invoice is already paid in full",
      )}`,
    );
  }
  const payment = fNum(formData, "payment");
  if (payment <= 0) redirect(`/accounting/${invoiceId}?toastError=${encodeURIComponent("Payment must be positive")}`);

  const { paidAmount, status, fullyPaid } = applyPayment(toNum(invoice.amount), toNum(invoice.paidAmount), payment);
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      paidAmount,
      status,
      paidAt: fullyPaid ? new Date() : null,
    },
  });
  await audit({
    userId: session.userId,
    action: "INVOICE_PAYMENT",
    entityType: "Invoice",
    entityId: invoiceId,
    detail: `$${payment.toFixed(2)}`,
  });
  // A warm payment receipt when the invoice is settled in full. Transactional
  // (bypasses appreciation opt-out, still honors do-not-contact at send).
  if (fullyPaid) {
    await scheduleTouchpoint("payment-receipt", invoice.clientId, { related: { type: "Invoice", id: invoiceId }, anchorKey: `receipt:${invoiceId}` });
  }
  revalidatePath(`/accounting/${invoiceId}`);
  redirect(`/accounting/${invoiceId}?toast=${encodeURIComponent(fullyPaid ? "Invoice paid in full" : "Partial payment recorded")}`);
}

export async function voidInvoice(invoiceId: string) {
  const session = await requireSession();
  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "VOID", paidAt: null } });
  await audit({ userId: session.userId, action: "INVOICE_VOID", entityType: "Invoice", entityId: invoiceId });
  revalidatePath(`/accounting/${invoiceId}`);
  redirect(`/accounting/${invoiceId}?toast=${encodeURIComponent("Invoice voided")}`);
}

/** Run the Xero sync (push open invoices, pull statuses + Pay-now links). */
export async function runXeroSync() {
  const session = await requireSession();
  const conn = await prisma.integrationConnection.findFirst({ where: { provider: "XERO", status: { not: "DISCONNECTED" } } });
  if (!conn) {
    redirect(`/accounting?toastError=${encodeURIComponent("Xero is not connected — see Settings → Integrations")}`);
  }
  const { push, pull } = await syncXero(conn.id);
  await audit({ userId: session.userId, action: "XERO_SYNC", entityType: "IntegrationConnection", entityId: conn.id });
  revalidatePath("/accounting");
  redirect(
    `/accounting?toast=${encodeURIComponent(`Xero sync: pushed ${push.recordsWritten}, updated ${pull.recordsWritten}`)}`,
  );
}
