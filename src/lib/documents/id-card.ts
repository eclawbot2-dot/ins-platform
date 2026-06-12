/**
 * Insurance ID-card generation (Wave B).
 *
 * Assembles the printable auto ID-card data from a policy's vehicles +
 * carrier + liability coverage, and renders a clean print-ready HTML
 * document (one card per vehicle, plus a combined-all card). Used by the
 * staff "ID cards" action on a policy and the portal download for the
 * client's own auto policies.
 *
 * Applies to AUTO / COMMERCIAL_AUTO / MOTORCYCLE / RV lines (anything
 * whose template carries vehicle risk items).
 */

import type { LineOfBusiness } from "@prisma/client";

const ID_CARD_LOBS: LineOfBusiness[] = ["AUTO", "COMMERCIAL_AUTO", "MOTORCYCLE", "RV"];

export function lobHasIdCard(lob: LineOfBusiness): boolean {
  return ID_CARD_LOBS.includes(lob);
}

export type IdCardVehicle = {
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
};

export type IdCardCoverage = {
  code: string;
  label: string;
  /** Pre-formatted limit/deductible display text. */
  display: string;
};

export type IdCardInput = {
  agencyName: string;
  agencyPhone?: string | null;
  carrierName: string;
  carrierPhone?: string | null;
  naicCode?: string | null;
  policyNumber: string;
  insuredName: string;
  effectiveDate: Date;
  expirationDate: Date;
  vehicles: IdCardVehicle[];
  /** Liability/coverage lines to show on the card. */
  coverages: IdCardCoverage[];
  lineOfBusiness: LineOfBusiness;
};

export type IdCard = {
  vehicleLabel: string;
  vin: string;
};

/** Display string for a single vehicle. */
export function vehicleLabel(v: IdCardVehicle): string {
  const parts = [v.year ? String(v.year) : null, v.make, v.model].filter(Boolean);
  return parts.length ? parts.join(" ") : "Vehicle";
}

/**
 * Build the per-vehicle card list. A policy with no vehicle rows still
 * gets one "All scheduled autos" card so the document is always usable.
 */
export function assembleIdCards(input: IdCardInput): IdCard[] {
  if (input.vehicles.length === 0) {
    return [{ vehicleLabel: "All scheduled autos on policy", vin: "—" }];
  }
  return input.vehicles.map((v) => ({ vehicleLabel: vehicleLabel(v), vin: v.vin ?? "—" }));
}

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(d);

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/**
 * Render the full printable ID-card HTML document. Each card is a
 * business-card-sized panel; print CSS lays them two-up and avoids
 * page-breaking inside a card.
 */
export function renderIdCardHtml(input: IdCardInput): string {
  const cards = assembleIdCards(input);
  const covRows = input.coverages
    .map((c) => `<tr><td class="cov-label">${esc(c.label)}</td><td class="cov-val">${esc(c.display)}</td></tr>`)
    .join("");

  const cardHtml = cards
    .map(
      (card) => `
    <div class="idcard">
      <div class="idcard-head">
        <div class="carrier">${esc(input.carrierName)}</div>
        <div class="title">AUTOMOBILE INSURANCE IDENTIFICATION CARD</div>
      </div>
      <table class="meta">
        <tr><td class="k">Policy #</td><td class="v">${esc(input.policyNumber)}</td>
            <td class="k">NAIC</td><td class="v">${esc(input.naicCode ?? "—")}</td></tr>
        <tr><td class="k">Effective</td><td class="v">${fmtDate(input.effectiveDate)}</td>
            <td class="k">Expires</td><td class="v">${fmtDate(input.expirationDate)}</td></tr>
        <tr><td class="k">Insured</td><td class="v" colspan="3">${esc(input.insuredName)}</td></tr>
        <tr><td class="k">Vehicle</td><td class="v" colspan="3">${esc(card.vehicleLabel)}</td></tr>
        <tr><td class="k">VIN</td><td class="v" colspan="3">${esc(card.vin)}</td></tr>
      </table>
      ${covRows ? `<table class="cov">${covRows}</table>` : ""}
      <div class="idcard-foot">
        <span>${esc(input.agencyName)}${input.agencyPhone ? ` · ${esc(input.agencyPhone)}` : ""}</span>
        <span>Claims: ${esc(input.carrierPhone ?? "see policy")}</span>
      </div>
      <div class="notice">Keep this card in the insured vehicle. This card is evidence of insurance as required by law and does not amend coverage.</div>
    </div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Auto ID card — ${esc(input.policyNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 16px; background: #f1f5f9; }
  .toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
  .toolbar button { font: inherit; padding: 6px 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; cursor: pointer; }
  .sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; max-width: 760px; }
  .idcard { background: #fff; border: 1px solid #94a3b8; border-radius: 10px; padding: 12px 14px; page-break-inside: avoid; break-inside: avoid; }
  .idcard-head { border-bottom: 2px solid #1e293b; padding-bottom: 6px; margin-bottom: 6px; }
  .carrier { font-weight: 700; font-size: 14px; }
  .title { font-size: 9px; letter-spacing: .04em; text-transform: uppercase; color: #475569; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .meta td { padding: 2px 4px; vertical-align: top; }
  .meta .k { color: #64748b; font-weight: 600; white-space: nowrap; width: 64px; }
  .meta .v { font-weight: 500; }
  .cov { margin-top: 6px; border-top: 1px solid #e2e8f0; }
  .cov td { padding: 2px 4px; }
  .cov .cov-label { color: #475569; }
  .cov .cov-val { text-align: right; font-weight: 600; }
  .idcard-foot { display: flex; justify-content: space-between; gap: 8px; margin-top: 8px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #475569; }
  .notice { margin-top: 6px; font-size: 8.5px; color: #94a3b8; line-height: 1.3; }
  @media print {
    body { background: #fff; padding: 0; }
    .toolbar { display: none; }
    .sheet { gap: 8px; }
  }
</style></head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div>
  <div class="sheet">${cardHtml}</div>
</body></html>`;
}
