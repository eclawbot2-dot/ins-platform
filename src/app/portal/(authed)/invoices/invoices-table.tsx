"use client";

/**
 * Portal invoices — sortable table. Amount/balance sort on numeric
 * values and issue/due dates on real date values. The Pay-now link
 * stays duplicated into the always-visible first column on mobile
 * (the dedicated right-hand column sits off-screen at 390px until the
 * table is scrolled) — do not regress that.
 */

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SortableHeader, useSortableData } from "@/components/ui/sortable";
import type { BadgeTone } from "@/lib/labels";
import { ariaSort, type SortAccessor } from "@/lib/sort";

export type PortalInvoiceRow = {
  id: string;
  invoiceNumber: string;
  policyNumber: string | null;
  issuedAt: number;
  issuedFmt: string;
  dueAt: number;
  dueFmt: string;
  amount: number;
  amountFmt: string;
  balance: number;
  balanceFmt: string;
  status: string;
  statusLabel: string;
  statusTone: BadgeTone;
  xeroPaymentUrl: string | null;
};

const ACCESSORS: Record<string, SortAccessor<PortalInvoiceRow>> = {
  invoice: (i) => i.invoiceNumber,
  policy: (i) => i.policyNumber,
  issued: (i) => i.issuedAt,
  due: (i) => i.dueAt,
  amount: (i) => i.amount,
  balance: (i) => i.balance,
  status: (i) => i.statusLabel,
};

export function PortalInvoicesTable({ rows }: { rows: PortalInvoiceRow[] }) {
  const { sorted, sortKey, sortDirection, requestSort } = useSortableData(rows, ACCESSORS, {
    storagePrefix: "portalInvoices",
  });

  const header = (key: string, label: string, className?: string) => (
    <th className={className} aria-sort={ariaSort(sortKey === key, sortDirection)}>
      <SortableHeader label={label} active={sortKey === key} direction={sortDirection} onClick={() => requestSort(key)} />
    </th>
  );

  return (
    <div className="card overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            {header("invoice", "Invoice")}
            {header("policy", "Policy")}
            {header("issued", "Issued")}
            {header("due", "Due")}
            {header("amount", "Amount", "text-right")}
            {header("balance", "Balance", "text-right")}
            {header("status", "Status")}
            <th aria-label="Pay" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((i) => (
            <tr key={i.id}>
              <td className="font-medium text-slate-800">
                {i.invoiceNumber}
                {i.xeroPaymentUrl && i.status !== "PAID" ? (
                  // Mobile-visible Pay-now affordance — same Xero link as
                  // the dedicated column, surfaced in the first column.
                  <a
                    href={i.xeroPaymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary btn-sm mt-1 flex w-fit sm:hidden"
                  >
                    Pay now <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </td>
              <td>{i.policyNumber ?? "—"}</td>
              <td>{i.issuedFmt}</td>
              <td>{i.dueFmt}</td>
              <td className="text-right">{i.amountFmt}</td>
              <td className="text-right">{i.balanceFmt}</td>
              <td>
                <Badge tone={i.statusTone}>{i.statusLabel}</Badge>
              </td>
              <td className="text-right">
                {i.xeroPaymentUrl && i.status !== "PAID" ? (
                  // Online payment goes through the Xero invoice
                  // "Pay now" link — never a direct card charge here.
                  <a
                    href={i.xeroPaymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary btn-sm hidden sm:inline-flex"
                  >
                    Pay now <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
