import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { crossSellWorklist } from "@/lib/reports/cross-sell";
import { fmtMoney } from "@/lib/money";
import { LOB_LABELS } from "@/lib/labels";

export const metadata = { title: "Cross-sell" };
export const dynamic = "force-dynamic";

export default async function CrossSellReportPage() {
  const rows = await crossSellWorklist();
  const totalOpp = rows.reduce((acc, r) => acc + r.estOpportunity, 0);
  const suggestionCount = rows.reduce((acc, r) => acc + r.suggestions.length, 0);

  return (
    <>
      <PageHeader
        title="Cross-sell opportunities"
        description="Account-rounding worklist — clients with coverage gaps, ranked by estimated premium opportunity."
        actions={
          <a href="/api/reports/cross-sell" className="btn">
            <Download className="h-4 w-4" /> Export CSV
          </a>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Clients with opportunities" value={rows.length} />
        <StatCard label="Total opportunities" value={suggestionCount} />
        <StatCard label="Est. premium opportunity" value={fmtMoney(totalOpp)} tone="good" />
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Client</th>
              <th>Producer</th>
              <th>Current lines</th>
              <th>Top suggestion</th>
              <th className="text-right">Est. opportunity</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-slate-400">
                  No open cross-sell gaps — every active client is well-rounded.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const top = r.suggestions[0]!;
                return (
                  <tr key={r.clientId}>
                    <td>
                      <Link href={`/clients/${r.clientId}`} className="font-medium text-navy-700 hover:underline">
                        {r.clientName}
                      </Link>
                      <div className="text-xs text-slate-400">
                        {r.suggestions.length} suggestion{r.suggestions.length === 1 ? "" : "s"}
                      </div>
                    </td>
                    <td>{r.producerName ?? "—"}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {r.activeLobs.length === 0 ? (
                          <span className="text-xs text-slate-400">Prospect — no active lines</span>
                        ) : (
                          r.activeLobs.map((l) => (
                            <Badge key={l} tone="slate">
                              {LOB_LABELS[l]}
                            </Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="font-medium text-slate-800">{top.title}</span>
                      <div className="text-xs text-slate-500">{top.rationale}</div>
                    </td>
                    <td className="text-right font-medium">{fmtMoney(r.estOpportunity)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
