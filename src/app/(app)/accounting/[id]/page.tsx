import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Send } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, DetailItem } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { fmtMoneyCents, toNum } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";
import { openBalance } from "@/lib/domain/aging";
import { addInvoiceLine, markInvoiceSent, recordInvoicePayment, voidInvoice } from "../actions";
import type { InvoiceStatus } from "@prisma/client";

export const metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<InvoiceStatus, "green" | "blue" | "amber" | "red" | "slate"> = {
  DRAFT: "slate",
  SENT: "blue",
  PARTIAL: "amber",
  PAID: "green",
  VOID: "red",
};

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      policy: { select: { id: true, policyNumber: true } },
      lines: true,
    },
  });
  if (!invoice) notFound();

  const balance = openBalance({ amount: toNum(invoice.amount), paidAmount: toNum(invoice.paidAmount) });
  const isOpen = invoice.status !== "PAID" && invoice.status !== "VOID";

  return (
    <>
      <PageHeader
        title={
          <>
            {invoice.invoiceNumber} <Badge tone={STATUS_TONE[invoice.status]}>{invoice.status}</Badge>
          </>
        }
        description={
          <>
            <Link href={`/clients/${invoice.client.id}`} className="text-navy-700 hover:underline">
              {invoice.client.name}
            </Link>
            {invoice.policy ? (
              <>
                {" · "}
                <Link href={`/policies/${invoice.policy.id}`} className="text-navy-700 hover:underline">
                  {invoice.policy.policyNumber}
                </Link>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            {invoice.xeroPaymentUrl ? (
              <a href={invoice.xeroPaymentUrl} target="_blank" rel="noopener noreferrer" className="btn-primary">
                <ExternalLink className="h-4 w-4" /> Pay now (Xero)
              </a>
            ) : null}
            {invoice.status === "DRAFT" ? (
              <form action={markInvoiceSent.bind(null, invoice.id)}>
                <button type="submit" className="btn">
                  <Send className="h-4 w-4" /> Mark sent
                </button>
              </form>
            ) : null}
            {isOpen ? (
              <form action={voidInvoice.bind(null, invoice.id)}>
                <ConfirmButton className="btn" message="Void this invoice? It can no longer be collected.">
                  Void
                </ConfirmButton>
              </form>
            ) : null}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <div className="card-pad"><DetailItem label="Issued">{fmtDate(invoice.issueDate)}</DetailItem></div>
        <div className="card-pad"><DetailItem label="Due">{fmtDate(invoice.dueDate)}</DetailItem></div>
        <div className="card-pad"><DetailItem label="Amount">{fmtMoneyCents(invoice.amount)}</DetailItem></div>
        <div className="card-pad"><DetailItem label="Paid">{fmtMoneyCents(invoice.paidAmount)}</DetailItem></div>
        <div className="card-pad"><DetailItem label="Open balance">{invoice.status === "VOID" ? "—" : fmtMoneyCents(balance)}</DetailItem></div>
      </div>

      {invoice.xeroInvoiceId ? (
        <p className="mb-4 text-xs text-slate-500">
          Synced to Xero (id {invoice.xeroInvoiceId}).{" "}
          {invoice.xeroPaymentUrl
            ? "Online payment is available via the Xero Pay-now link above."
            : "No online-payment link yet — run a Xero sync after enabling payment services in Xero."}
        </p>
      ) : null}

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Description</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Unit</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td className="text-right">{toNum(l.quantity)}</td>
                <td className="text-right">{fmtMoneyCents(l.unitAmount)}</td>
                <td className="text-right">{fmtMoneyCents(l.amount)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} className="text-right font-semibold">Total</td>
              <td className="text-right font-semibold">{fmtMoneyCents(invoice.amount)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {isOpen ? (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="card-pad">
            <h2 className="section-title mb-3">Record payment</h2>
            <p className="mb-3 text-xs text-slate-500">
              Manual entry for checks/ACH received directly. Online card payment goes through the Xero Pay-now link —
              never charge cards directly.
            </p>
            <form action={recordInvoicePayment.bind(null, invoice.id)} className="flex items-end gap-2">
              <Field label="Payment ($)" required>
                <input name="payment" type="number" step="0.01" min="0.01" max={balance} required className="input" />
              </Field>
              <button type="submit" className="btn-primary">Record</button>
            </form>
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-3">Add line</h2>
            <form action={addInvoiceLine.bind(null, invoice.id)} className="space-y-3">
              <FormGrid cols={3}>
                <Field label="Description" required>
                  <input name="description" required className="input" />
                </Field>
                <Field label="Qty">
                  <input name="quantity" type="number" step="0.01" defaultValue={1} className="input" />
                </Field>
                <Field label="Unit amount ($)" required>
                  <input name="unitAmount" type="number" step="0.01" required className="input" />
                </Field>
              </FormGrid>
              <button type="submit" className="btn">Add line (re-totals invoice)</button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
