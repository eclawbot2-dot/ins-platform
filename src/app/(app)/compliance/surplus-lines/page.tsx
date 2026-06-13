import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { surplusLinesWorklist, surplusLinesStats } from "@/lib/reports/surplus-lines";
import { SURPLUS_LINES_STATUS_LABELS, surplusLinesStatusTone } from "@/lib/labels";
import { fmtMoney } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";
import { markSurplusFiled } from "../../policies/surplus-actions";
import type { BadgeTone } from "@/lib/labels";

export const metadata = { title: "Surplus-lines compliance" };
export const dynamic = "force-dynamic";

const BUCKET_TONE: Record<string, BadgeTone> = {
  OVERDUE: "red",
  DUE_SOON: "amber",
  ACTION_NEEDED: "violet",
  COMPLETE: "green",
  EXEMPT: "slate",
  VOID: "slate",
};
const BUCKET_LABEL: Record<string, string> = {
  OVERDUE: "Overdue",
  DUE_SOON: "Due soon",
  ACTION_NEEDED: "Action needed",
  COMPLETE: "Filed",
  EXEMPT: "Exempt",
  VOID: "Void",
};

export default async function SurplusLinesWorklistPage() {
  const rows = await surplusLinesWorklist();
  const stats = surplusLinesStats(rows);

  return (
    <>
      <PageHeader
        title="Surplus-lines compliance"
        description="Every surplus-lines (E&S) policy and its state filing status. File the tax + stamping fee, complete the diligent-search affidavit, and keep the stamping office current."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card-pad"><div className="text-xs uppercase tracking-wide text-slate-500">Filings</div><div className="text-2xl font-semibold tabular-nums">{stats.total}</div></div>
        <div className="card-pad"><div className="text-xs uppercase tracking-wide text-slate-500">Pending</div><div className="text-2xl font-semibold tabular-nums text-amber-600">{stats.pending}</div></div>
        <div className="card-pad"><div className="text-xs uppercase tracking-wide text-slate-500">Overdue</div><div className="text-2xl font-semibold tabular-nums text-red-600">{stats.overdue}</div></div>
        <div className="card-pad"><div className="text-xs uppercase tracking-wide text-slate-500">Remittance owed</div><div className="text-2xl font-semibold tabular-nums">{fmtMoney(stats.remittanceOutstanding)}</div></div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Policy</th>
              <th>Insured</th>
              <th>Carrier</th>
              <th>State</th>
              <th>Status</th>
              <th>Compliance</th>
              <th>Due</th>
              <th className="text-right">Remittance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.filingId ?? r.policyId}>
                <td>
                  <Link href={`/policies/${r.policyId}`} className="font-medium text-navy-700 hover:underline">{r.policyNumber}</Link>
                </td>
                <td>{r.clientName}</td>
                <td>{r.carrierName}</td>
                <td>{r.state ?? "—"}</td>
                <td>
                  {r.status === "NO_FILING" ? (
                    <Badge tone="red">No filing</Badge>
                  ) : (
                    <Badge tone={surplusLinesStatusTone(r.status)}>{SURPLUS_LINES_STATUS_LABELS[r.status]}</Badge>
                  )}
                </td>
                <td>
                  <Badge tone={BUCKET_TONE[r.compliance.bucket] ?? "slate"}>{BUCKET_LABEL[r.compliance.bucket] ?? r.compliance.bucket}</Badge>
                  {r.compliance.gaps.length > 0 ? (
                    <div className="mt-0.5 text-xs text-slate-500">{r.compliance.gaps.join("; ")}</div>
                  ) : null}
                </td>
                <td className="text-xs">{r.dueDate ? fmtDate(r.dueDate) : "—"}</td>
                <td className="text-right">{fmtMoney(r.remittance)}</td>
                <td className="text-right">
                  {r.filingId && r.status === "PENDING" ? (
                    <form action={markSurplusFiled.bind(null, r.filingId)}>
                      <button type="submit" className="btn btn-sm">Mark filed</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-6 text-center text-slate-400">
                  No surplus-lines filings. Record one from any non-admitted policy&apos;s detail page.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
