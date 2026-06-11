import { RefreshCw } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { fmtMoneyCents, toNum } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";
import { agingSummary, AGING_BUCKETS, AGING_LABELS, openBalance } from "@/lib/domain/aging";
import { applySort, parseSortParams } from "@/lib/sort";
import { isXeroConfigured } from "@/lib/integrations/xero/auth";
import { createInvoice, runXeroSync } from "./actions";
import type { InvoiceStatus, Prisma } from "@prisma/client";

export const metadata = { title: "Accounting" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<InvoiceStatus, "green" | "blue" | "amber" | "red" | "slate"> = {
  DRAFT: "slate",
  SENT: "blue",
  PARTIAL: "amber",
  PAID: "green",
  VOID: "red",
};

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string; dir?: string }>;
}) {
  const { status, sort, dir } = await searchParams;
  const sortState = parseSortParams(sort, dir, ["invoiceNumber", "client", "policy", "issue", "due", "amount", "balance", "status"]);
  const statusFilter =
    status && ["DRAFT", "SENT", "PARTIAL", "PAID", "VOID"].includes(status) ? (status as InvoiceStatus) : undefined;
  const where: Prisma.InvoiceWhereInput = statusFilter ? { status: statusFilter } : {};

  const [invoices, openInvoices, clients, policies, xeroConn] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { issueDate: "desc" },
      take: 200,
      include: { client: { select: { id: true, name: true } }, policy: { select: { policyNumber: true } } },
    }),
    prisma.invoice.findMany({
      where: { status: { in: ["SENT", "PARTIAL"] } },
      select: { dueDate: true, amount: true, paidAmount: true },
    }),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.policy.findMany({
      where: { billingType: "AGENCY_BILL", status: { in: ["ACTIVE", "BOUND", "RENEWED"] } },
      select: { id: true, policyNumber: true, client: { select: { name: true } } },
      orderBy: { policyNumber: "asc" },
    }),
    prisma.integrationConnection.findFirst({ where: { provider: "XERO", status: { not: "DISCONNECTED" } } }),
  ]);

  const aging = agingSummary(
    openInvoices.map((i) => ({ dueDate: i.dueDate, amount: toNum(i.amount), paidAmount: toNum(i.paidAmount) })),
  );

  return (
    <>
      <PageHeader
        title="Accounting"
        description="Agency-bill invoices, AR aging, and Xero sync. Online payment runs through Xero invoice links."
        actions={
          xeroConn && isXeroConfigured() ? (
            <form action={runXeroSync}>
              <button type="submit" className="btn">
                <RefreshCw className="h-4 w-4" /> Sync Xero
              </button>
            </form>
          ) : (
            <span className="text-xs text-slate-400">Xero not connected — Settings → Integrations</span>
          )
        }
      />

      <h2 className="section-title mb-2">AR aging (open balances)</h2>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-6">
        {AGING_BUCKETS.map((b) => (
          <StatCard
            key={b}
            label={AGING_LABELS[b]}
            value={fmtMoneyCents(aging[b])}
            tone={b === "CURRENT" ? "default" : aging[b] > 0 ? (b === "D1_30" ? "warn" : "danger") : "default"}
          />
        ))}
        <StatCard label="Total AR" value={fmtMoneyCents(aging.total)} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <a href="/accounting" className={`btn btn-sm ${!statusFilter ? "btn-primary" : ""}`}>All</a>
        {(["DRAFT", "SENT", "PARTIAL", "PAID", "VOID"] as const).map((s) => (
          <a key={s} href={`/accounting?status=${s}`} className={`btn btn-sm ${statusFilter === s ? "btn-primary" : ""}`}>
            {s}
          </a>
        ))}
      </div>

      <DataTable
        rows={applySort(
          invoices,
          {
            invoiceNumber: (i) => i.invoiceNumber,
            client: (i) => i.client.name,
            policy: (i) => i.policy?.policyNumber,
            issue: (i) => i.issueDate,
            due: (i) => i.dueDate,
            amount: (i) => toNum(i.amount),
            balance: (i) => (i.status === "VOID" ? 0 : openBalance({ amount: toNum(i.amount), paidAmount: toNum(i.paidAmount) })),
            status: (i) => i.status,
          },
          sortState,
        )}
        rowHref={(i) => `/accounting/${i.id}`}
        sort={{ ...sortState, basePath: "/accounting", params: { status: statusFilter } }}
        emptyMessage="No invoices yet — create one below for an agency-bill policy."
        columns={[
          { key: "invoiceNumber", header: "Invoice #", sortable: true },
          { key: "client", header: "Client", sortable: true, render: (i) => i.client.name },
          { key: "policy", header: "Policy", sortable: true, render: (i) => i.policy?.policyNumber ?? "—" },
          { key: "issue", header: "Issued", sortable: true, render: (i) => fmtDate(i.issueDate) },
          { key: "due", header: "Due", sortable: true, render: (i) => fmtDate(i.dueDate) },
          { key: "amount", header: "Amount", className: "text-right", sortable: true, render: (i) => fmtMoneyCents(i.amount) },
          {
            key: "balance",
            header: "Open balance",
            className: "text-right",
            sortable: true,
            render: (i) =>
              i.status === "VOID" ? "—" : fmtMoneyCents(openBalance({ amount: toNum(i.amount), paidAmount: toNum(i.paidAmount) })),
          },
          {
            key: "status",
            header: "Status",
            sortable: true,
            render: (i) => (
              <span className="flex items-center gap-1.5">
                <Badge tone={STATUS_TONE[i.status]}>{i.status}</Badge>
                {i.xeroPaymentUrl ? <Badge tone="blue">Pay now</Badge> : null}
              </span>
            ),
          },
        ]}
      />

      <div className="card-pad mt-6 max-w-2xl">
        <h2 className="section-title mb-3">New invoice</h2>
        <form action={createInvoice} className="space-y-4">
          <FormGrid>
            <Field label="Client" required>
              <Select name="clientId" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
            <Field label="Agency-bill policy" hint="Optional — links the invoice to the policy">
              <Select
                name="policyId"
                allowEmpty
                options={policies.map((p) => ({ value: p.id, label: `${p.policyNumber} — ${p.client.name}` }))}
              />
            </Field>
            <Field label="Amount ($)" required>
              <input name="amount" type="number" step="0.01" min="0.01" required className="input" />
            </Field>
            <Field label="Description">
              <input name="description" className="input" placeholder="Premium — policy …" />
            </Field>
            <Field label="Issue date">
              <input name="issueDate" type="date" className="input" />
            </Field>
            <Field label="Due date" hint="Defaults to 30 days out">
              <input name="dueDate" type="date" className="input" />
            </Field>
          </FormGrid>
          <button type="submit" className="btn-primary">Create invoice</button>
        </form>
      </div>
    </>
  );
}
