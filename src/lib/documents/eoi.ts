/**
 * Evidence of Property / Evidence of Insurance (ACORD 27/28-style)
 * generation (Wave B).
 *
 * The property analogue of the COI. Assembles the printable EOI data
 * from a HOME/CONDO/FLOOD/commercial-property policy's dwelling or
 * insured-location + the Coverage A / dwelling limit, plus the lender /
 * mortgagee holder. The staff "issue EOI" flow records an
 * EvidenceOfProperty row; the detail page renders this HTML.
 */

import type { LineOfBusiness } from "@prisma/client";

/** Lines an EOI applies to (property / dwelling lines). */
const EOI_LOBS: LineOfBusiness[] = [
  "HOME",
  "CONDO",
  "RENTERS",
  "FLOOD",
  "COMMERCIAL_PROPERTY",
  "BOP",
  "BUILDERS_RISK",
  "INLAND_MARINE",
];

export function lobHasEoi(lob: LineOfBusiness): boolean {
  return EOI_LOBS.includes(lob);
}

/** Commercial property lines render the ACORD-28 variant heading. */
export function eoiKindForLob(lob: LineOfBusiness): "EVIDENCE_OF_PROPERTY" | "EVIDENCE_COMMERCIAL" {
  return lob === "COMMERCIAL_PROPERTY" || lob === "BOP" || lob === "BUILDERS_RISK"
    ? "EVIDENCE_COMMERCIAL"
    : "EVIDENCE_OF_PROPERTY";
}

export type EoiInput = {
  eoiNumber: string;
  kind: "EVIDENCE_OF_PROPERTY" | "EVIDENCE_COMMERCIAL";
  agencyName: string;
  agencyAddress?: string | null;
  agencyPhone?: string | null;
  agencyEmail?: string | null;
  carrierName: string;
  naicCode?: string | null;
  policyNumber: string;
  effectiveDate: Date;
  expirationDate: Date;
  insuredName: string;
  insuredAddress?: string | null;
  propertyAddress?: string | null;
  coverageALimit?: number | null;
  deductibleText?: string | null;
  /** Lender / mortgagee. */
  holderName: string;
  holderInterestLabel: string;
  holderAddress?: string | null;
  loanNumber?: string | null;
  remarks?: string | null;
  issuedAt: Date;
  issuedByName: string;
};

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(d);

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function eoiHeading(kind: EoiInput["kind"]): string {
  return kind === "EVIDENCE_COMMERCIAL" ? "EVIDENCE OF COMMERCIAL PROPERTY INSURANCE" : "EVIDENCE OF PROPERTY INSURANCE";
}

/** Render the full printable EOI HTML document. */
export function renderEoiHtml(input: EoiInput): string {
  const covA = input.coverageALimit != null ? usd.format(input.coverageALimit) : "Per policy terms";
  const cell = (k: string, v: string) =>
    `<div class="cell"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(eoiHeading(input.kind))} — ${esc(input.eoiNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 20px; background: #f1f5f9; font-size: 13px; }
  .toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
  .toolbar button { font: inherit; padding: 6px 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; cursor: pointer; }
  .page { background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 28px; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 17px; font-weight: 700; letter-spacing: .02em; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e293b; padding-bottom: 8px; }
  .head .meta { text-align: right; font-size: 11px; }
  .disclaimer { font-size: 10px; text-transform: uppercase; color: #64748b; margin: 10px 0; line-height: 1.4; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  .box { border: 1px solid #cbd5e1; padding: 8px 10px; }
  .box h2 { font-size: 10px; text-transform: uppercase; color: #64748b; margin: 0 0 4px; letter-spacing: .04em; }
  .cells { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .cell .k { font-size: 9px; text-transform: uppercase; color: #94a3b8; }
  .cell .v { font-weight: 600; }
  .full { grid-column: 1 / -1; }
  .remarks { white-space: pre-wrap; }
  @media print { body { background: #fff; padding: 0; } .toolbar { display: none; } .page { border: 0; max-width: none; } }
</style></head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div>
  <div class="page">
    <div class="head">
      <div>
        <h1>${esc(eoiHeading(input.kind))}</h1>
        <div style="font-size:11px;color:#64748b">This evidence replaces and supersedes any prior evidence as of the date below.</div>
      </div>
      <div class="meta">
        <div><strong>DATE:</strong> ${fmtDate(input.issuedAt)}</div>
        <div><strong>EOI #:</strong> ${esc(input.eoiNumber)}</div>
      </div>
    </div>

    <p class="disclaimer">This evidence of property insurance is issued as a matter of information only and confers no rights upon the additional interest named below. It does not affirmatively or negatively amend, extend, or alter the coverage afforded by the policy listed.</p>

    <div class="grid">
      <div class="box">
        <h2>Agency</h2>
        <div><strong>${esc(input.agencyName)}</strong></div>
        ${input.agencyAddress ? `<div>${esc(input.agencyAddress)}</div>` : ""}
        ${input.agencyPhone ? `<div>${esc(input.agencyPhone)}</div>` : ""}
        ${input.agencyEmail ? `<div>${esc(input.agencyEmail)}</div>` : ""}
      </div>
      <div class="box">
        <h2>Company (Insurer)</h2>
        <div><strong>${esc(input.carrierName)}</strong></div>
        <div>NAIC #: ${esc(input.naicCode ?? "—")}</div>
      </div>
    </div>

    <div class="box" style="margin-bottom:10px">
      <h2>Named insured &amp; policy</h2>
      <div class="cells">
        ${cell("Insured", input.insuredName)}
        ${cell("Policy number", input.policyNumber)}
        ${cell("Effective", fmtDate(input.effectiveDate))}
        ${cell("Expiration", fmtDate(input.expirationDate))}
      </div>
    </div>

    <div class="box" style="margin-bottom:10px">
      <h2>Property &amp; coverage</h2>
      <div class="cells">
        ${cell("Property / location", input.propertyAddress ?? input.insuredAddress ?? "Per policy")}
        ${cell("Coverage A / dwelling limit", covA)}
        ${cell("Deductible", input.deductibleText ?? "Per policy")}
      </div>
    </div>

    <div class="box" style="margin-bottom:10px">
      <h2>Additional interest (${esc(input.holderInterestLabel)})</h2>
      <div class="cells">
        ${cell("Name", input.holderName)}
        ${cell("Loan number", input.loanNumber ?? "—")}
        <div class="cell full"><div class="k">Address</div><div class="v">${esc(input.holderAddress ?? "—")}</div></div>
      </div>
    </div>

    ${input.remarks ? `<div class="box" style="margin-bottom:10px"><h2>Remarks</h2><div class="remarks">${esc(input.remarks)}</div></div>` : ""}

    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:18px;font-size:11px">
      <div style="color:#64748b">Cancellation: the company will endeavor to provide the additional interest notice of cancellation in accordance with the policy provisions.</div>
      <div style="text-align:right"><div style="border-top:1px solid #475569;padding-top:2px"><strong>Authorized representative:</strong> ${esc(input.issuedByName)}</div></div>
    </div>
  </div>
</body></html>`;
}
