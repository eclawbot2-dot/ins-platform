import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { findMarkets } from "@/lib/reports/market-finder";
import { eligibleCount } from "@/lib/domain/market-finder";
import { ALL_LOBS, CARRIER_APPETITE_LABELS, LOB_LABELS, carrierAppetiteTone } from "@/lib/labels";
import { fmtPct } from "@/lib/money";
import type { LineOfBusiness } from "@prisma/client";

export const metadata = { title: "Market finder" };
export const dynamic = "force-dynamic";

export default async function MarketFinderPage({
  searchParams,
}: {
  searchParams: Promise<{ lob?: string; state?: string }>;
}) {
  const { lob, state } = await searchParams;
  const selectedLob = (ALL_LOBS as string[]).includes(lob ?? "") ? (lob as LineOfBusiness) : null;
  const stateFilter = state?.trim() || null;

  const results = selectedLob ? await findMarkets(selectedLob, { state: stateFilter }) : [];
  const eligible = eligibleCount(results);

  return (
    <>
      <PageHeader
        title="Market finder"
        description="Given a line of business (and optional state), find the carriers you can place it with — appointed markets that want the risk, ranked by appetite and commission."
      />

      <div className="card-pad mb-6 max-w-2xl">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Field label="Line of business">
            <Select
              name="lob"
              defaultValue={selectedLob ?? ""}
              options={[{ value: "", label: "Select a line…" }, ...ALL_LOBS.map((l) => ({ value: l, label: LOB_LABELS[l] }))]}
            />
          </Field>
          <Field label="State (optional)">
            <input name="state" defaultValue={stateFilter ?? ""} className="input w-24" placeholder="MA" />
          </Field>
          <button type="submit" className="btn-primary">Find markets</button>
        </form>
      </div>

      {selectedLob ? (
        <>
          <p className="mb-3 text-sm text-slate-600">
            {eligible} eligible market{eligible === 1 ? "" : "s"} for <span className="font-medium">{LOB_LABELS[selectedLob]}</span>
            {stateFilter ? ` in ${stateFilter.toUpperCase()}` : ""}.
          </p>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Carrier</th>
                  <th>Eligibility</th>
                  <th>Appetite</th>
                  <th>Type</th>
                  <th className="text-right">New comm.</th>
                  <th className="text-right">Renewal</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.carrierId} className={r.eligible ? "" : "opacity-60"}>
                    <td>
                      <Link href={`/carriers/${r.carrierId}`} className="font-medium text-navy-700 hover:underline">
                        {r.carrierName}
                      </Link>
                      {r.classNotes ? <div className="text-xs text-slate-500">{r.classNotes}</div> : null}
                    </td>
                    <td>
                      <Badge tone={r.eligible ? "green" : "slate"}>{r.eligible ? "Eligible" : "Not eligible"}</Badge>
                      <div className="mt-0.5 text-xs text-slate-500">{r.reason}</div>
                    </td>
                    <td>
                      {r.appetite ? (
                        <Badge tone={carrierAppetiteTone(r.appetite)}>{CARRIER_APPETITE_LABELS[r.appetite]}</Badge>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="text-xs">{r.isMga ? "MGA" : "Carrier"}</td>
                    <td className="text-right">{r.newPct != null ? fmtPct(r.newPct) : "—"}</td>
                    <td className="text-right">{r.renewalPct != null ? fmtPct(r.renewalPct) : "—"}</td>
                  </tr>
                ))}
                {results.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">No carriers found. Add appetite rows on carrier pages.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">Pick a line of business to see your markets.</p>
      )}
    </>
  );
}
