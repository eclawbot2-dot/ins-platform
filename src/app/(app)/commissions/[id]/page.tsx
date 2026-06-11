import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Plus, Upload } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, DetailItem } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { fmtMoneyCents, toNum } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";
import { ThSort } from "@/components/ui/data-table";
import { applySort, parseSortParams } from "@/lib/sort";
import { reconcileSummary } from "@/lib/domain/commissions";
import {
  addStatementLine,
  deleteStatementLine,
  importStatementCsv,
  markStatementReconciled,
  reconcileStatement,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function StatementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const { id } = await params;
  const { sort, dir } = await searchParams;
  const sortState = parseSortParams(sort, dir, ["policyNumber", "insured", "type", "premium", "commission", "match", "variance"]);
  const statement = await prisma.commissionStatement.findUnique({
    where: { id },
    include: {
      carrier: { select: { id: true, name: true } },
      lines: {
        orderBy: { policyNumber: "asc" },
        include: { policy: { select: { id: true, policyNumber: true } } },
      },
    },
  });
  if (!statement) notFound();

  const summary = reconcileSummary(
    statement.lines.map((l) => ({ matchStatus: l.matchStatus, varianceAmount: l.varianceAmount ? toNum(l.varianceAmount) : null })),
  );
  const linesTotal = statement.lines.reduce((acc, l) => acc + toNum(l.commissionAmount), 0);
  const sortedLines = applySort(
    statement.lines,
    {
      policyNumber: (l) => l.policyNumber,
      insured: (l) => l.insuredName,
      type: (l) => l.transactionType,
      premium: (l) => (l.premium != null ? toNum(l.premium) : null),
      commission: (l) => toNum(l.commissionAmount),
      match: (l) => l.matchStatus,
      variance: (l) => (l.varianceAmount != null ? toNum(l.varianceAmount) : null),
    },
    sortState,
  );
  const tableSort = { ...sortState, basePath: `/commissions/${statement.id}` };

  return (
    <>
      <PageHeader
        title={`${statement.carrier.name} — ${statement.periodLabel ?? fmtDate(statement.statementDate)}`}
        description={
          <>
            Commission statement ·{" "}
            <Badge tone={statement.status === "RECONCILED" ? "green" : statement.status === "RECONCILING" ? "amber" : "slate"}>
              {statement.status}
            </Badge>
          </>
        }
        actions={
          <>
            <form action={reconcileStatement.bind(null, statement.id)}>
              <button type="submit" className="btn-primary">
                Reconcile lines
              </button>
            </form>
            {statement.status !== "RECONCILED" ? (
              <form action={markStatementReconciled.bind(null, statement.id)}>
                <button type="submit" className="btn">
                  <CheckCircle2 className="h-4 w-4" /> Mark reconciled
                </button>
              </form>
            ) : null}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-6">
        <div className="card-pad"><DetailItem label="Statement total">{fmtMoneyCents(statement.totalAmount)}</DetailItem></div>
        <div className="card-pad"><DetailItem label="Lines total">{fmtMoneyCents(linesTotal)}</DetailItem></div>
        <div className="card-pad"><DetailItem label="Matched">{summary.matched}</DetailItem></div>
        <div className="card-pad"><DetailItem label="Variances">{summary.variance}</DetailItem></div>
        <div className="card-pad"><DetailItem label="Unmatched">{summary.unmatched}</DetailItem></div>
        <div className="card-pad"><DetailItem label="Net variance">{fmtMoneyCents(summary.netVariance)}</DetailItem></div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <ThSort k="policyNumber" label="Policy #" sort={tableSort} />
              <ThSort k="insured" label="Insured" sort={tableSort} />
              <ThSort k="type" label="Type" sort={tableSort} />
              <ThSort k="premium" label="Premium" sort={tableSort} className="text-right" />
              <ThSort k="commission" label="Commission" sort={tableSort} className="text-right" />
              <ThSort k="match" label="Match" sort={tableSort} />
              <ThSort k="variance" label="Variance" sort={tableSort} className="text-right" />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedLines.map((l) => (
              <tr key={l.id} className={l.matchStatus === "VARIANCE" ? "bg-amber-50/60" : l.matchStatus === "UNMATCHED" ? "bg-red-50/40" : ""}>
                <td>
                  {l.policy ? (
                    <Link href={`/policies/${l.policy.id}`} className="font-medium text-navy-700 hover:underline">
                      {l.policyNumber}
                    </Link>
                  ) : (
                    l.policyNumber
                  )}
                </td>
                <td>{l.insuredName ?? "—"}</td>
                <td className="text-xs">{l.transactionType.replace(/_/g, " ")}</td>
                <td className="text-right">{l.premium ? fmtMoneyCents(l.premium) : "—"}</td>
                <td className="text-right font-medium">{fmtMoneyCents(l.commissionAmount)}</td>
                <td>
                  <Badge tone={l.matchStatus === "MATCHED" ? "green" : l.matchStatus === "VARIANCE" ? "amber" : "red"}>
                    {l.matchStatus}
                  </Badge>
                </td>
                <td className="text-right">
                  {l.varianceAmount != null ? (
                    <span className={toNum(l.varianceAmount) < 0 ? "text-red-600" : "text-emerald-600"}>
                      {fmtMoneyCents(l.varianceAmount)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="text-right">
                  <form action={deleteStatementLine.bind(null, statement.id, l.id)}>
                    <ConfirmButton message="Remove this statement line?">Remove</ConfirmButton>
                  </form>
                </td>
              </tr>
            ))}
            {statement.lines.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  No lines yet — add manually or import a CSV.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card-pad">
          <h2 className="section-title mb-3">
            <Plus className="mr-1 inline h-4 w-4" /> Add line
          </h2>
          <form action={addStatementLine.bind(null, statement.id)} className="space-y-4">
            <FormGrid cols={3}>
              <Field label="Policy number" required>
                <input name="policyNumber" required className="input" />
              </Field>
              <Field label="Insured name">
                <input name="insuredName" className="input" />
              </Field>
              <Field label="Transaction type">
                <Select
                  name="transactionType"
                  options={["NEW_BUSINESS", "RENEWAL", "ENDORSEMENT", "CANCELLATION", "AUDIT"].map((t) => ({
                    value: t,
                    label: t.replace(/_/g, " "),
                  }))}
                />
              </Field>
              <Field label="Premium ($)">
                <input name="premium" type="number" step="0.01" className="input" />
              </Field>
              <Field label="Commission ($)" required>
                <input name="commissionAmount" type="number" step="0.01" required className="input" />
              </Field>
            </FormGrid>
            <button type="submit" className="btn-primary">
              Add line
            </button>
          </form>
        </div>

        <div className="card-pad">
          <h2 className="section-title mb-3">
            <Upload className="mr-1 inline h-4 w-4" /> Import CSV
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Headers (flexible): <code>policyNumber, insuredName, transactionType, premium, commissionAmount</code>
          </p>
          <form action={importStatementCsv.bind(null, statement.id)} className="space-y-3">
            <input type="file" name="file" accept=".csv,text/csv" required className="input" />
            <button type="submit" className="btn-primary">
              Import lines
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
