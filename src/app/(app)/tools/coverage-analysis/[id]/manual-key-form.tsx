"use client";

import { useMemo, useState } from "react";
import { coveragesForLob } from "@/lib/domain/coverage-templates";
import { ALL_LOBS, LOB_LABELS } from "@/lib/labels";
import type { LineOfBusiness } from "@prisma/client";
import { keyAndAnalyze } from "../actions";

/**
 * Staff manual coverage entry. Picking a line of business renders that
 * line's standard coverage rows from the Wave-A template; staff fill in
 * the limits/deductibles they read off the submitted policy. Submitting
 * runs the deterministic gap rules (no API key needed).
 */
export function ManualKeyForm({
  analysisId,
  defaultLob,
}: {
  analysisId: string;
  defaultLob: LineOfBusiness | null;
}) {
  const [lob, setLob] = useState<LineOfBusiness>(defaultLob ?? "AUTO");
  const rows = useMemo(() => coveragesForLob(lob), [lob]);

  return (
    <form action={keyAndAnalyze} className="space-y-4">
      <input type="hidden" name="analysisId" value={analysisId} />
      <div className="max-w-sm">
        <label className="label" htmlFor="key-lob">Line of business</label>
        <select
          id="key-lob"
          name="lineOfBusiness"
          className="input"
          value={lob}
          onChange={(e) => setLob(e.target.value as LineOfBusiness)}
        >
          {(ALL_LOBS as LineOfBusiness[]).map((l) => (
            <option key={l} value={l}>
              {LOB_LABELS[l]}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Coverage</th>
              <th>Limit</th>
              <th>Deductible</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.code}>
                <td className="min-w-[12rem] text-sm font-medium text-slate-700">
                  {c.label}
                  <input type="hidden" name="code" value={c.code} />
                  <input type="hidden" name="label" value={c.label} />
                </td>
                <td>
                  <input
                    name="limit"
                    className="input"
                    placeholder={c.hint ?? (c.shape === "splitLimit" ? "100/300" : "amount")}
                  />
                </td>
                <td>
                  <input
                    name="deductible"
                    className="input"
                    placeholder={c.shape === "deductible" ? (c.hint ?? "500") : "—"}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="submit" className="btn-primary py-2">
        Run gap analysis
      </button>
    </form>
  );
}
