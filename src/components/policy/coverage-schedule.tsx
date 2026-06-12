/**
 * Read-only coverage schedule + risk-item display. Shared by the staff
 * policy detail page and the client portal policy view. Pure
 * presentation over already-normalized rows (numbers, not Decimals).
 */

import { Badge } from "@/components/ui/badge";
import { fmtMoneyCents } from "@/lib/money";
import type { ExistingRiskItems, CoverageRow } from "@/app/(app)/policies/coverage-editor";

function limitDisplay(c: CoverageRow): string {
  if (c.limitText) return c.limitText;
  if (c.limitAmount != null) return fmtMoneyCents(c.limitAmount);
  return "—";
}
function deductibleDisplay(c: CoverageRow): string {
  if (c.deductibleText) return c.deductibleText;
  if (c.deductibleAmount != null) return fmtMoneyCents(c.deductibleAmount);
  return "—";
}

export function CoverageScheduleTable({ coverages }: { coverages: CoverageRow[] }) {
  if (coverages.length === 0) {
    return <p className="text-sm text-slate-400">No coverage detail recorded yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="table-base min-w-[480px]">
        <thead>
          <tr>
            <th>Coverage</th>
            <th>Limit</th>
            <th>Deductible</th>
            <th className="text-right">Premium</th>
          </tr>
        </thead>
        <tbody>
          {coverages.map((c, i) => (
            <tr key={`${c.code}-${i}`}>
              <td className="font-medium text-slate-700">{c.label}</td>
              <td>{limitDisplay(c)}</td>
              <td>{deductibleDisplay(c)}</td>
              <td className="text-right">{c.premiumPart != null ? fmtMoneyCents(c.premiumPart) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Risk-item summary blocks. `staff` shows fuller detail (VIN, loan #). */
export function RiskItems({ items, staff = false }: { items: ExistingRiskItems; staff?: boolean }) {
  const v = items.vehicles ?? [];
  const d = items.drivers ?? [];
  const dw = items.dwellings ?? [];
  const sc = items.scheduledItems ?? [];
  const wc = items.watercraft ?? [];
  const loc = items.locations ?? [];
  if (!v.length && !d.length && !dw.length && !sc.length && !wc.length && !loc.length) return null;

  return (
    <div className="space-y-5">
      {v.length > 0 ? (
        <div>
          <h3 className="section-title mb-2">Vehicles ({v.length})</h3>
          <ul className="space-y-1.5 text-sm">
            {v.map((x, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5 last:border-0">
                <span className="font-medium text-slate-700">
                  {[x.year, x.make, x.model].filter(Boolean).join(" ") || "Vehicle"}
                </span>
                <span className="text-xs text-slate-500">
                  {[staff && x.vin ? `VIN ${x.vin}` : null, x.usage, x.garagingZip ? `ZIP ${x.garagingZip}` : null].filter(Boolean).join(" · ") || "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {d.length > 0 ? (
        <div>
          <h3 className="section-title mb-2">Drivers ({d.length})</h3>
          <ul className="space-y-1.5 text-sm">
            {d.map((x, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5 last:border-0">
                <span className="font-medium text-slate-700">{x.name}</span>
                <span className="text-xs text-slate-500">
                  {[x.relationship, staff && x.licenseNumber ? `${x.licenseState ?? ""} ${x.licenseNumber}`.trim() : null].filter(Boolean).join(" · ") || "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {dw.length > 0 ? (
        <div>
          <h3 className="section-title mb-2">Dwelling</h3>
          {dw.map((x, i) => (
            <dl key={i} className="grid grid-cols-2 gap-2 border-b border-slate-100 pb-2 text-sm last:border-0 md:grid-cols-3">
              <div className="col-span-2 md:col-span-3">
                <dt className="text-xs text-slate-400">Address</dt>
                <dd className="text-slate-700">{[x.addressLine1, x.city, x.state, x.zip].filter(Boolean).join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Year built</dt>
                <dd className="text-slate-700">{x.yearBuilt ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Construction</dt>
                <dd className="text-slate-700">{x.construction ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Replacement cost</dt>
                <dd className="text-slate-700">{x.replacementCost != null ? fmtMoneyCents(x.replacementCost) : "—"}</dd>
              </div>
              {staff && x.mortgageeName ? (
                <div className="col-span-2 md:col-span-3">
                  <dt className="text-xs text-slate-400">Mortgagee</dt>
                  <dd className="text-slate-700">{x.mortgageeName}{x.loanNumber ? ` · Loan ${x.loanNumber}` : ""}</dd>
                </div>
              ) : null}
            </dl>
          ))}
        </div>
      ) : null}

      {sc.length > 0 ? (
        <div>
          <h3 className="section-title mb-2">Scheduled items ({sc.length})</h3>
          <ul className="space-y-1.5 text-sm">
            {sc.map((x, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5 last:border-0">
                <span className="text-slate-700">
                  <span className="font-medium">{x.description}</span> {x.type ? <Badge tone="slate">{x.type}</Badge> : null}
                </span>
                <span className="text-xs text-slate-500">
                  {fmtMoneyCents(x.value)}
                  {x.appraisalOnFile ? " · appraised" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {wc.length > 0 ? (
        <div>
          <h3 className="section-title mb-2">Watercraft ({wc.length})</h3>
          <ul className="space-y-1.5 text-sm">
            {wc.map((x, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5 last:border-0">
                <span className="font-medium text-slate-700">{[x.year, x.make, x.type].filter(Boolean).join(" ") || "Watercraft"}</span>
                <span className="text-xs text-slate-500">{[x.length ? `${x.length} ft` : null, x.motorHp ? `${x.motorHp} HP` : null].filter(Boolean).join(" · ") || "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {loc.length > 0 ? (
        <div>
          <h3 className="section-title mb-2">Insured locations ({loc.length})</h3>
          <ul className="space-y-1.5 text-sm">
            {loc.map((x, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5 last:border-0">
                <span className="font-medium text-slate-700">{[x.addressLine1, x.city, x.state].filter(Boolean).join(", ") || "Location"}</span>
                <span className="text-xs text-slate-500">
                  {[x.buildingValue != null ? `Bldg ${fmtMoneyCents(x.buildingValue)}` : null, x.contentsValue != null ? `Contents ${fmtMoneyCents(x.contentsValue)}` : null].filter(Boolean).join(" · ") || "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
