import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal";
import { portalInvoiceWhere } from "@/lib/domain/portal-scope";
import { Badge } from "@/components/ui/badge";
import { INVOICE_STATUS_LABELS, invoiceStatusTone } from "@/lib/labels";
import { fmtMoneyCents, toNum } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";

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
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Policy</th>
                <th>Issued</th>
                <th>Due</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Balance</th>
                <th>Status</th>
                <th aria-label="Pay" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => {
                const balance = toNum(i.amount) - toNum(i.paidAmount);
                return (
                  <tr key={i.id}>
                    <td className="font-medium text-slate-800">{i.invoiceNumber}</td>
                    <td>{i.policy?.policyNumber ?? "—"}</td>
                    <td>{fmtDate(i.issueDate)}</td>
                    <td>{fmtDate(i.dueDate)}</td>
                    <td className="text-right">{fmtMoneyCents(i.amount)}</td>
                    <td className="text-right">{fmtMoneyCents(balance)}</td>
                    <td>
                      <Badge tone={invoiceStatusTone(i.status)}>{INVOICE_STATUS_LABELS[i.status]}</Badge>
                    </td>
                    <td className="text-right">
                      {i.xeroPaymentUrl && i.status !== "PAID" ? (
                        // Online payment goes through the Xero invoice
                        // "Pay now" link — never a direct card charge here.
                        <a
                          href={i.xeroPaymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary btn-sm"
                        >
                          Pay now <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Questions about a bill? Contact your account manager — payments made by check or phone may
        take a few days to appear here.
      </p>
    </>
  );
}
