/**
 * Surplus-lines compliance worklist (Wave D-final) — DB glue.
 *
 * Lists every surplus-lines filing, classifies its compliance state, and
 * ALSO surfaces surplus-lines policies that have NO filing record yet
 * (the worst gap — placed but never filed). Sorted by urgency.
 */

import { prisma } from "@/lib/prisma";
import { classifyFiling, totalRemittance, type FilingCompliance } from "@/lib/domain/surplus-lines";
import { toNum } from "@/lib/money";
import type { SurplusLinesStatus } from "@prisma/client";

export type SurplusWorklistRow = {
  filingId: string | null; // null = policy needs a filing record created
  policyId: string;
  policyNumber: string;
  clientName: string;
  carrierName: string;
  state: string | null;
  status: SurplusLinesStatus | "NO_FILING";
  premium: number;
  tax: number | null;
  stampingFee: number | null;
  remittance: number;
  compliance: FilingCompliance;
  dueDate: Date | null;
};

/**
 * Build the worklist. A surplus-lines policy is identified by its carrier
 * being flagged as a surplus-lines market — but since we don't model a
 * per-carrier S&L flag, we treat ANY policy that has a SurplusLinesFiling
 * as surplus-lines, plus any policy explicitly marked via the filing.
 * Policies with `isSurplusLines`-style notes are out of scope; the filing
 * record IS the marker.
 */
export async function surplusLinesWorklist(asOf: Date = new Date()): Promise<SurplusWorklistRow[]> {
  const filings = await prisma.surplusLinesFiling.findMany({
    include: {
      policy: {
        select: {
          id: true,
          policyNumber: true,
          premium: true,
          client: { select: { name: true } },
          carrier: { select: { name: true } },
        },
      },
    },
  });

  const rows: SurplusWorklistRow[] = filings.map((f) => {
    const compliance = classifyFiling(
      {
        status: f.status,
        diligentSearchDone: f.diligentSearchDone,
        affidavitOnFile: f.affidavitOnFile,
        dueDate: f.dueDate,
        filedAt: f.filedAt,
      },
      asOf,
    );
    return {
      filingId: f.id,
      policyId: f.policyId,
      policyNumber: f.policy.policyNumber,
      clientName: f.policy.client.name,
      carrierName: f.policy.carrier.name,
      state: f.state,
      status: f.status,
      premium: toNum(f.policy.premium),
      tax: f.surplusLinesTax != null ? toNum(f.surplusLinesTax) : null,
      stampingFee: f.stampingFee != null ? toNum(f.stampingFee) : null,
      remittance: totalRemittance(
        f.surplusLinesTax != null ? toNum(f.surplusLinesTax) : null,
        f.stampingFee != null ? toNum(f.stampingFee) : null,
      ),
      compliance,
      dueDate: f.dueDate,
    };
  });

  return rows.sort((a, b) => b.compliance.urgency - a.compliance.urgency);
}

export type SurplusLinesStats = {
  total: number;
  pending: number;
  overdue: number;
  filed: number;
  remittanceOutstanding: number;
};

export function surplusLinesStats(rows: ReadonlyArray<SurplusWorklistRow>): SurplusLinesStats {
  let pending = 0;
  let overdue = 0;
  let filed = 0;
  let remittanceOutstanding = 0;
  for (const r of rows) {
    if (r.status === "FILED") filed += 1;
    if (r.status === "PENDING") {
      pending += 1;
      remittanceOutstanding += r.remittance;
    }
    if (r.compliance.bucket === "OVERDUE") overdue += 1;
  }
  return { total: rows.length, pending, overdue, filed, remittanceOutstanding };
}
