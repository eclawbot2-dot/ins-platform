"use client";

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { LineOfBusiness } from "@prisma/client";
import {
  coverageTemplateFor,
  RISK_ITEM_LABELS,
  type CoverageTemplate,
  type RiskItemKind,
} from "@/lib/domain/coverage-templates";

// ── Existing-row prop shapes (edit mode) ─────────────────────────────

export type CoverageRow = {
  code: string;
  label: string;
  limitText: string | null;
  limitAmount: number | null;
  deductibleText: string | null;
  deductibleAmount: number | null;
  premiumPart: number | null;
  notes: string | null;
};
export type VehicleRow = { year: number | null; make: string | null; model: string | null; vin: string | null; garagingZip: string | null; usage: string | null; annualMiles: number | null };
export type DriverRow = { name: string; licenseNumber: string | null; licenseState: string | null; relationship: string | null };
export type DwellingRow = { addressLine1: string | null; city: string | null; state: string | null; zip: string | null; yearBuilt: number | null; construction: string | null; roofType: string | null; squareFeet: number | null; replacementCost: number | null; occupancy: string | null; mortgageeName: string | null; loanNumber: string | null };
export type ScheduledItemRow = { type: string; description: string; value: number; appraisalOnFile: boolean };
export type WatercraftRow = { type: string | null; year: number | null; make: string | null; length: number | null; hullId: string | null; motorHp: number | null };
export type LocationRow = { addressLine1: string | null; city: string | null; state: string | null; zip: string | null; buildingValue: number | null; contentsValue: number | null; occupancy: string | null; sqFt: number | null; yearBuilt: number | null };

export type ExistingRiskItems = {
  coverages?: CoverageRow[];
  vehicles?: VehicleRow[];
  drivers?: DriverRow[];
  dwellings?: DwellingRow[];
  scheduledItems?: ScheduledItemRow[];
  watercraft?: WatercraftRow[];
  locations?: LocationRow[];
};

function num(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}

// ── Coverage table ───────────────────────────────────────────────────

function CoverageTable({ templates, existing }: { templates: CoverageTemplate[]; existing?: CoverageRow[] }) {
  const byCode = new Map((existing ?? []).map((c) => [c.code, c]));
  return (
    <div className="overflow-x-auto">
      <table className="table-base min-w-[640px]">
        <thead>
          <tr>
            <th className="w-1/4">Coverage</th>
            <th>Limit</th>
            <th>Deductible</th>
            <th className="text-right">Premium part</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t, i) => {
            const ex = byCode.get(t.code);
            return (
              <tr key={t.code}>
                <td className="align-top">
                  <input type="hidden" name={`cov_code_${i}`} value={t.code} />
                  <input type="hidden" name={`cov_label_${i}`} value={t.label} />
                  <span className="text-sm font-medium text-slate-700">{t.label}</span>
                </td>
                <td>
                  <input
                    name={`cov_limit_${i}`}
                    defaultValue={ex?.limitText ?? num(ex?.limitAmount)}
                    placeholder={t.hint ?? ""}
                    className="input"
                  />
                </td>
                <td>
                  <input
                    name={`cov_deduct_${i}`}
                    defaultValue={ex?.deductibleText ?? num(ex?.deductibleAmount)}
                    placeholder={t.shape === "deductible" ? t.hint ?? "" : ""}
                    className="input"
                  />
                </td>
                <td>
                  <input
                    name={`cov_premium_${i}`}
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={num(ex?.premiumPart)}
                    placeholder="$"
                    className="input text-right"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <input type="hidden" name="cov_count" value={templates.length} />
      <p className="mt-2 text-xs text-slate-400">
        Limits accept a number or split format (e.g. 100/300). Leave a row blank to omit it.
      </p>
    </div>
  );
}

// ── Generic repeatable risk-item list ────────────────────────────────

type RepeatableProps<T> = {
  prefix: string;
  initial: T[];
  empty: T;
  render: (row: T, i: number, update: (patch: Partial<T>) => void) => React.ReactNode;
  addLabel: string;
};

function Repeatable<T>({ prefix, initial, empty, render, addLabel }: RepeatableProps<T>) {
  const [rows, setRows] = useState<T[]>(initial.length ? initial : []);
  // Stable per-row React keys. The inputs are uncontrolled (defaultValue),
  // so keying on the array index would reuse a DOM node for a different row
  // when a middle row is removed — leaking the removed row's typed values
  // into its neighbour and dropping the last row on submit. A monotonic key
  // pinned to each row keeps React reconciliation aligned with the data.
  const keySeq = useRef(rows.length);
  const [keys, setKeys] = useState<number[]>(() => rows.map((_, i) => i));
  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={keys[i]} className="relative rounded-lg border border-slate-200 p-3">
          <button
            type="button"
            onClick={() => {
              setRows(rows.filter((_, j) => j !== i));
              setKeys(keys.filter((_, j) => j !== i));
            }}
            className="absolute right-2 top-2 text-slate-400 hover:text-red-500"
            aria-label="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {render(row, i, (patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))))}
        </div>
      ))}
      <input type="hidden" name={`${prefix}_count`} value={rows.length} />
      <button
        type="button"
        onClick={() => {
          setRows([...rows, { ...empty }]);
          setKeys([...keys, keySeq.current++]);
        }}
        className="btn btn-sm"
      >
        <Plus className="h-3.5 w-3.5" /> {addLabel}
      </button>
    </div>
  );
}

// ── Risk-item sections ───────────────────────────────────────────────

function RiskItemSection({ kind, existing }: { kind: RiskItemKind; existing: ExistingRiskItems }) {
  const heading = <h3 className="section-title mb-2">{RISK_ITEM_LABELS[kind]}</h3>;

  if (kind === "vehicle") {
    return (
      <div>
        {heading}
        <Repeatable<VehicleRow>
          prefix="veh"
          addLabel="Add vehicle"
          initial={existing.vehicles ?? []}
          empty={{ year: null, make: "", model: "", vin: "", garagingZip: "", usage: "", annualMiles: null }}
          render={(row, i) => (
            <div className="grid grid-cols-1 gap-2 pr-6 sm:grid-cols-3">
              <input name={`veh_year_${i}`} type="number" defaultValue={num(row.year)} placeholder="Year" className="input" />
              <input name={`veh_make_${i}`} defaultValue={row.make ?? ""} placeholder="Make" className="input" />
              <input name={`veh_model_${i}`} defaultValue={row.model ?? ""} placeholder="Model" className="input" />
              <input name={`veh_vin_${i}`} defaultValue={row.vin ?? ""} placeholder="VIN" className="input sm:col-span-2" />
              <input name={`veh_zip_${i}`} defaultValue={row.garagingZip ?? ""} placeholder="Garaging ZIP" className="input" />
              <input name={`veh_usage_${i}`} defaultValue={row.usage ?? ""} placeholder="Usage (commute/pleasure)" className="input" />
              <input name={`veh_miles_${i}`} type="number" defaultValue={num(row.annualMiles)} placeholder="Annual miles" className="input" />
            </div>
          )}
        />
      </div>
    );
  }

  if (kind === "driver") {
    return (
      <div>
        {heading}
        <Repeatable<DriverRow>
          prefix="drv"
          addLabel="Add driver"
          initial={existing.drivers ?? []}
          empty={{ name: "", licenseNumber: "", licenseState: "", relationship: "" }}
          render={(row, i) => (
            <div className="grid grid-cols-1 gap-2 pr-6 sm:grid-cols-2">
              <input name={`drv_name_${i}`} defaultValue={row.name ?? ""} placeholder="Full name" className="input" />
              <input name={`drv_rel_${i}`} defaultValue={row.relationship ?? ""} placeholder="Relationship" className="input" />
              <input name={`drv_lic_${i}`} defaultValue={row.licenseNumber ?? ""} placeholder="License #" className="input" />
              <input name={`drv_state_${i}`} defaultValue={row.licenseState ?? ""} placeholder="License state" className="input" />
            </div>
          )}
        />
      </div>
    );
  }

  if (kind === "dwelling") {
    return (
      <div>
        {heading}
        <Repeatable<DwellingRow>
          prefix="dwl"
          addLabel="Add dwelling"
          initial={existing.dwellings ?? []}
          empty={{ addressLine1: "", city: "", state: "", zip: "", yearBuilt: null, construction: "", roofType: "", squareFeet: null, replacementCost: null, occupancy: "", mortgageeName: "", loanNumber: "" }}
          render={(row, i) => (
            <div className="grid grid-cols-1 gap-2 pr-6 sm:grid-cols-3">
              <input name={`dwl_addr_${i}`} defaultValue={row.addressLine1 ?? ""} placeholder="Address" className="input sm:col-span-3" />
              <input name={`dwl_city_${i}`} defaultValue={row.city ?? ""} placeholder="City" className="input" />
              <input name={`dwl_state_${i}`} defaultValue={row.state ?? ""} placeholder="State" className="input" />
              <input name={`dwl_zip_${i}`} defaultValue={row.zip ?? ""} placeholder="ZIP" className="input" />
              <input name={`dwl_year_${i}`} type="number" defaultValue={num(row.yearBuilt)} placeholder="Year built" className="input" />
              <input name={`dwl_constr_${i}`} defaultValue={row.construction ?? ""} placeholder="Construction" className="input" />
              <input name={`dwl_roof_${i}`} defaultValue={row.roofType ?? ""} placeholder="Roof type" className="input" />
              <input name={`dwl_sqft_${i}`} type="number" defaultValue={num(row.squareFeet)} placeholder="Square feet" className="input" />
              <input name={`dwl_rcv_${i}`} type="number" step="0.01" defaultValue={num(row.replacementCost)} placeholder="Replacement cost $" className="input" />
              <input name={`dwl_occ_${i}`} defaultValue={row.occupancy ?? ""} placeholder="Occupancy" className="input" />
              <input name={`dwl_mortgagee_${i}`} defaultValue={row.mortgageeName ?? ""} placeholder="Mortgagee" className="input sm:col-span-2" />
              <input name={`dwl_loan_${i}`} defaultValue={row.loanNumber ?? ""} placeholder="Loan #" className="input" />
            </div>
          )}
        />
      </div>
    );
  }

  if (kind === "scheduledItem") {
    return (
      <div>
        {heading}
        <Repeatable<ScheduledItemRow>
          prefix="sch"
          addLabel="Add scheduled item"
          initial={existing.scheduledItems ?? []}
          empty={{ type: "", description: "", value: 0, appraisalOnFile: false }}
          render={(row, i) => (
            <div className="grid grid-cols-1 gap-2 pr-6 sm:grid-cols-4">
              <input name={`sch_type_${i}`} defaultValue={row.type ?? ""} placeholder="Type (jewelry/fine-art)" className="input" />
              <input name={`sch_desc_${i}`} defaultValue={row.description ?? ""} placeholder="Description" className="input sm:col-span-2" />
              <input name={`sch_value_${i}`} type="number" step="0.01" defaultValue={row.value ? String(row.value) : ""} placeholder="Value $" className="input" />
              <label className="flex items-center gap-2 text-xs text-slate-600 sm:col-span-4">
                <input type="checkbox" name={`sch_appraisal_${i}`} defaultChecked={row.appraisalOnFile} /> Appraisal on file
              </label>
            </div>
          )}
        />
      </div>
    );
  }

  if (kind === "watercraft") {
    return (
      <div>
        {heading}
        <Repeatable<WatercraftRow>
          prefix="wct"
          addLabel="Add watercraft"
          initial={existing.watercraft ?? []}
          empty={{ type: "", year: null, make: "", length: null, hullId: "", motorHp: null }}
          render={(row, i) => (
            <div className="grid grid-cols-1 gap-2 pr-6 sm:grid-cols-3">
              <input name={`wct_type_${i}`} defaultValue={row.type ?? ""} placeholder="Type (bowrider/PWC)" className="input" />
              <input name={`wct_year_${i}`} type="number" defaultValue={num(row.year)} placeholder="Year" className="input" />
              <input name={`wct_make_${i}`} defaultValue={row.make ?? ""} placeholder="Make" className="input" />
              <input name={`wct_length_${i}`} type="number" step="0.1" defaultValue={num(row.length)} placeholder="Length (ft)" className="input" />
              <input name={`wct_hull_${i}`} defaultValue={row.hullId ?? ""} placeholder="Hull ID" className="input" />
              <input name={`wct_hp_${i}`} type="number" defaultValue={num(row.motorHp)} placeholder="Motor HP" className="input" />
            </div>
          )}
        />
      </div>
    );
  }

  // location
  return (
    <div>
      {heading}
      <Repeatable<LocationRow>
        prefix="loc"
        addLabel="Add location"
        initial={existing.locations ?? []}
        empty={{ addressLine1: "", city: "", state: "", zip: "", buildingValue: null, contentsValue: null, occupancy: "", sqFt: null, yearBuilt: null }}
        render={(row, i) => (
          <div className="grid grid-cols-1 gap-2 pr-6 sm:grid-cols-3">
            <input name={`loc_addr_${i}`} defaultValue={row.addressLine1 ?? ""} placeholder="Address" className="input sm:col-span-3" />
            <input name={`loc_city_${i}`} defaultValue={row.city ?? ""} placeholder="City" className="input" />
            <input name={`loc_state_${i}`} defaultValue={row.state ?? ""} placeholder="State" className="input" />
            <input name={`loc_zip_${i}`} defaultValue={row.zip ?? ""} placeholder="ZIP" className="input" />
            <input name={`loc_bldg_${i}`} type="number" step="0.01" defaultValue={num(row.buildingValue)} placeholder="Building value $" className="input" />
            <input name={`loc_cont_${i}`} type="number" step="0.01" defaultValue={num(row.contentsValue)} placeholder="Contents value $" className="input" />
            <input name={`loc_occ_${i}`} defaultValue={row.occupancy ?? ""} placeholder="Occupancy" className="input" />
            <input name={`loc_sqft_${i}`} type="number" defaultValue={num(row.sqFt)} placeholder="Sq ft" className="input" />
            <input name={`loc_year_${i}`} type="number" defaultValue={num(row.yearBuilt)} placeholder="Year built" className="input" />
          </div>
        )}
      />
    </div>
  );
}

/**
 * LOB-driven coverage + risk-item editor. Watches the policy form's
 * line-of-business select (by id) so the coverage schedule and risk
 * items re-render when the producer changes the line. The hidden field
 * `lob_for_coverage` records the line the editor rendered for, so the
 * server action can resolve the right template.
 */
export function CoverageEditor({
  initialLob,
  existing = {},
}: {
  initialLob: LineOfBusiness;
  existing?: ExistingRiskItems;
}) {
  const [lob, setLob] = useState<LineOfBusiness>(initialLob);
  const template = coverageTemplateFor(lob);

  return (
    <div className="space-y-6">
      {/* Mirror the form's LOB select so the editor reacts without a server round-trip. */}
      <select
        aria-hidden
        tabIndex={-1}
        className="hidden"
        onChange={() => {}}
        ref={(el) => {
          if (!el) return;
          const form = el.closest("form");
          const real = form?.querySelector<HTMLSelectElement>('select[name="lineOfBusiness"]');
          if (real && real.dataset.coverageBound !== "1") {
            real.dataset.coverageBound = "1";
            real.addEventListener("change", () => setLob(real.value as LineOfBusiness));
          }
        }}
      />
      <input type="hidden" name="lob_for_coverage" value={lob} />

      <div className="card-pad">
        <h2 className="section-title mb-3">Coverage schedule</h2>
        <CoverageTable templates={template.coverages} existing={existing.coverages} />
      </div>

      {template.riskItems.length > 0 ? (
        <div className="card-pad space-y-6">
          <h2 className="section-title">Risk items</h2>
          {template.riskItems.map((kind) => (
            <RiskItemSection key={kind} kind={kind} existing={existing} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
