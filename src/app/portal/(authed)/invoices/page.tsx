import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal";
import { portalInvoiceWhere } from "@/lib/domain/portal-scope";
import { INVOICE_STATUS_LABELS, invoiceStatusTone } from "@/lib/labels";
import { fmtMoneyCents, toNum } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";
import { PortalInvoicesTable, type PortalInvoiceRow } from "./invoices-table";

export const dynamic = "force-dynamic";

export default async function PortalInvoicesPage() {
  const session = await requirePortalSession();

  const invoices = await prisma.invoice.findMany({
    where: portalInvoiceWhere(session.clientId),
    include: { policy: { select: { policyNumber: true } } },
    orderBy: { issueDate: "desc" },
  });

  const totalDue = invoices.reduce(
    (acc, i) => (i.status === "PAID" ? acc : acc + toNum(i.amount) - toNum(i.paidAmount)),
    0,
  );

  const rows: PortalInvoiceRow[] = invoices.map((i) => {
    const balance = toNum(i.amount) - toNum(i.paidAmount);
    return {
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      policyNumber: i.policy?.policyNumber ?? null,
      issuedAt: i.issueDate.getTime(),
      issuedFmt: fmtDate(i.issueDate),
      dueAt: i.dueDate.getTime(),
      dueFmt: fmtDate(i.dueDate),
      amount: toNum(i.amount),
      amountFmt: fmtMoneyCents(i.amount),
      balance,
      balanceFmt: fmtMoneyCents(balance),
      status: i.status,
      statusLabel: INVOICE_STATUS_LABELS[i.status],
      statusTone: invoiceStatusTone(i.status),
      xeroPaymentUrl: i.xeroPaymentUrl,
    };
  });

  return (
    <>
      <div className="mb-5">
        <h1 className="page-title">Invoices</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {totalDue > 0 ? `${fmtMoneyCents(totalDue)} currently outstanding.` : "Your account is up to date."}
        </p>
      </div>

      {invoices.length === 0 ? (
        <div className="card-pad text-sm text-slate-600">No invoices on file.</div>
      ) : (
        <PortalInvoicesTable rows={rows} />
      )}

      <p className="mt-4 text-xs text-slate-500">
        Questions about a bill? Contact your account manager — payments made by check or phone may
        take a few days to appear here.
      </p>
    </>
  );
}
