/**
 * Per-LOB coverage templates (Wave A keystone).
 *
 * Each line of business maps to a standard set of coverage codes/labels
 * plus the risk-item editors that apply (vehicles, drivers, dwelling,
 * scheduled items, watercraft, commercial locations). The policy form
 * uses `coverageTemplateFor(lob)` to render the right coverage rows +
 * risk-item editors for the selected line; the detail/portal views use
 * the same template to label and order the coverage schedule.
 *
 * Pure data + selectors — unit-tested in tests/coverage-templates.test.ts.
 */

import type { LineOfBusiness } from "@prisma/client";

/** The kinds of line-specific risk items a policy can carry. */
export type RiskItemKind =
  | "vehicle"
  | "driver"
  | "dwelling"
  | "scheduledItem"
  | "watercraft"
  | "location";

/** How a coverage's limit/deductible is most naturally captured. */
export type CoverageValueShape =
  | "limit" // single limit amount (e.g. dwelling Coverage A)
  | "splitLimit" // text like "100/300/100" — captured as limitText
  | "perOccAgg" // per-occurrence + aggregate (liability)
  | "deductible" // deductible-driven (comp/collision)
  | "text"; // free text (e.g. "ACV", "Replacement cost")

export type CoverageTemplate = {
  code: string;
  label: string;
  /** Default capture shape — drives which inputs the form shows. */
  shape: CoverageValueShape;
  /** A sensible default limit/value hint shown as the input placeholder. */
  hint?: string;
};

export type LineTemplate = {
  lob: LineOfBusiness;
  /** Standard coverage parts for this line, in display order. */
  coverages: CoverageTemplate[];
  /** Risk-item editors that apply to this line. */
  riskItems: RiskItemKind[];
};

// ── Shared coverage groups ───────────────────────────────────────────

const AUTO_COVERAGES: CoverageTemplate[] = [
  { code: "BI", label: "Bodily injury liability", shape: "splitLimit", hint: "100/300" },
  { code: "PD", label: "Property damage liability", shape: "limit", hint: "100,000" },
  { code: "UM", label: "Uninsured/underinsured motorist", shape: "splitLimit", hint: "100/300" },
  { code: "MED", label: "Medical payments", shape: "limit", hint: "5,000" },
  { code: "COMP", label: "Comprehensive (other than collision)", shape: "deductible", hint: "500 deductible" },
  { code: "COLL", label: "Collision", shape: "deductible", hint: "500 deductible" },
  { code: "RENTAL", label: "Rental reimbursement", shape: "text", hint: "30/900" },
  { code: "TOW", label: "Towing & labor", shape: "text" },
];

const HOME_COVERAGES: CoverageTemplate[] = [
  { code: "COV_A", label: "Coverage A — Dwelling", shape: "limit", hint: "400,000" },
  { code: "COV_B", label: "Coverage B — Other structures", shape: "limit", hint: "10% of A" },
  { code: "COV_C", label: "Coverage C — Personal property", shape: "limit", hint: "50% of A" },
  { code: "COV_D", label: "Coverage D — Loss of use", shape: "limit", hint: "20% of A" },
  { code: "COV_E", label: "Coverage E — Personal liability", shape: "limit", hint: "300,000" },
  { code: "COV_F", label: "Coverage F — Medical payments", shape: "limit", hint: "5,000" },
  { code: "DEDUCT", label: "All-perils deductible", shape: "deductible", hint: "1,000" },
  { code: "WIND_HAIL", label: "Wind/hail deductible", shape: "deductible", hint: "2% of Cov A" },
];

const CONDO_COVERAGES: CoverageTemplate[] = [
  { code: "COV_A", label: "Coverage A — Building/betterments", shape: "limit", hint: "50,000" },
  { code: "COV_C", label: "Coverage C — Personal property", shape: "limit", hint: "75,000" },
  { code: "COV_D", label: "Coverage D — Loss of use", shape: "limit" },
  { code: "COV_E", label: "Coverage E — Personal liability", shape: "limit", hint: "300,000" },
  { code: "COV_F", label: "Coverage F — Medical payments", shape: "limit", hint: "5,000" },
  { code: "LOSS_ASSESS", label: "Loss assessment", shape: "limit", hint: "50,000" },
  { code: "DEDUCT", label: "Deductible", shape: "deductible", hint: "1,000" },
];

const RENTERS_COVERAGES: CoverageTemplate[] = [
  { code: "COV_C", label: "Coverage C — Personal property", shape: "limit", hint: "30,000" },
  { code: "COV_D", label: "Coverage D — Loss of use", shape: "limit" },
  { code: "COV_E", label: "Coverage E — Personal liability", shape: "limit", hint: "100,000" },
  { code: "COV_F", label: "Coverage F — Medical payments", shape: "limit", hint: "1,000" },
  { code: "DEDUCT", label: "Deductible", shape: "deductible", hint: "500" },
];

const GL_COVERAGES: CoverageTemplate[] = [
  { code: "GL_OCC", label: "Each occurrence", shape: "limit", hint: "1,000,000" },
  { code: "GL_AGG", label: "General aggregate", shape: "limit", hint: "2,000,000" },
  { code: "GL_PRODCOMP", label: "Products/completed-ops aggregate", shape: "limit", hint: "2,000,000" },
  { code: "GL_PERSADV", label: "Personal & advertising injury", shape: "limit", hint: "1,000,000" },
  { code: "GL_MEDEXP", label: "Medical expense (any one person)", shape: "limit", hint: "5,000" },
  { code: "GL_DAMPREM", label: "Damage to rented premises", shape: "limit", hint: "100,000" },
];

const PROPERTY_COVERAGES: CoverageTemplate[] = [
  { code: "BLDG", label: "Building", shape: "limit", hint: "1,000,000" },
  { code: "BPP", label: "Business personal property", shape: "limit", hint: "250,000" },
  { code: "BI_EE", label: "Business income & extra expense", shape: "limit" },
  { code: "VALUATION", label: "Valuation", shape: "text", hint: "Replacement cost" },
  { code: "DEDUCT", label: "Deductible", shape: "deductible", hint: "2,500" },
];

const UMBRELLA_COVERAGES: CoverageTemplate[] = [
  { code: "UMB_LIMIT", label: "Umbrella limit", shape: "limit", hint: "1,000,000" },
  { code: "UMB_RETENTION", label: "Self-insured retention", shape: "deductible", hint: "0" },
];

const WC_COVERAGES: CoverageTemplate[] = [
  { code: "WC_STATUTORY", label: "Workers compensation (statutory)", shape: "text", hint: "Statutory" },
  { code: "EL_ACCIDENT", label: "E.L. each accident", shape: "limit", hint: "1,000,000" },
  { code: "EL_DISEASE_EE", label: "E.L. disease — each employee", shape: "limit", hint: "1,000,000" },
  { code: "EL_DISEASE_POL", label: "E.L. disease — policy limit", shape: "limit", hint: "1,000,000" },
];

const LIFE_COVERAGES: CoverageTemplate[] = [
  { code: "FACE", label: "Face amount", shape: "limit", hint: "500,000" },
  { code: "TERM", label: "Term length", shape: "text", hint: "20-year level term" },
  { code: "RIDERS", label: "Riders", shape: "text" },
];

const HEALTH_COVERAGES: CoverageTemplate[] = [
  { code: "PLAN", label: "Plan type", shape: "text", hint: "PPO / HMO / HDHP" },
  { code: "DEDUCT", label: "Annual deductible", shape: "deductible", hint: "2,500" },
  { code: "OOP_MAX", label: "Out-of-pocket maximum", shape: "limit", hint: "8,000" },
];

// ── Per-LOB templates ────────────────────────────────────────────────

const TEMPLATES: Partial<Record<LineOfBusiness, LineTemplate>> = {
  AUTO: { lob: "AUTO", coverages: AUTO_COVERAGES, riskItems: ["vehicle", "driver"] },
  COMMERCIAL_AUTO: { lob: "COMMERCIAL_AUTO", coverages: AUTO_COVERAGES, riskItems: ["vehicle", "driver"] },
  MOTORCYCLE: { lob: "MOTORCYCLE", coverages: AUTO_COVERAGES, riskItems: ["vehicle", "driver"] },
  RV: { lob: "RV", coverages: AUTO_COVERAGES, riskItems: ["vehicle", "driver"] },
  GARAGE: { lob: "GARAGE", coverages: [...GL_COVERAGES, ...AUTO_COVERAGES], riskItems: ["vehicle", "location"] },

  HOME: { lob: "HOME", coverages: HOME_COVERAGES, riskItems: ["dwelling", "scheduledItem"] },
  CONDO: { lob: "CONDO", coverages: CONDO_COVERAGES, riskItems: ["dwelling", "scheduledItem"] },
  RENTERS: { lob: "RENTERS", coverages: RENTERS_COVERAGES, riskItems: ["scheduledItem"] },
  FLOOD: {
    lob: "FLOOD",
    coverages: [
      { code: "FLOOD_BLDG", label: "Building coverage", shape: "limit", hint: "250,000" },
      { code: "FLOOD_CONT", label: "Contents coverage", shape: "limit", hint: "100,000" },
      { code: "DEDUCT", label: "Deductible", shape: "deductible", hint: "1,250" },
    ],
    riskItems: ["dwelling"],
  },
  BUILDERS_RISK: {
    lob: "BUILDERS_RISK",
    coverages: [
      { code: "BR_LIMIT", label: "Project/structure limit", shape: "limit", hint: "1,000,000" },
      { code: "BR_SOFT", label: "Soft costs", shape: "limit" },
      { code: "DEDUCT", label: "Deductible", shape: "deductible", hint: "5,000" },
    ],
    riskItems: ["location"],
  },

  UMBRELLA: { lob: "UMBRELLA", coverages: UMBRELLA_COVERAGES, riskItems: [] },
  COMMERCIAL_UMBRELLA: { lob: "COMMERCIAL_UMBRELLA", coverages: UMBRELLA_COVERAGES, riskItems: ["location"] },

  LIFE: { lob: "LIFE", coverages: LIFE_COVERAGES, riskItems: [] },
  HEALTH: { lob: "HEALTH", coverages: HEALTH_COVERAGES, riskItems: [] },

  VALUABLE_ARTICLES: {
    lob: "VALUABLE_ARTICLES",
    coverages: [
      { code: "VA_BLANKET", label: "Blanket limit", shape: "limit", hint: "25,000" },
      { code: "VA_PERITEM", label: "Per-item limit", shape: "limit", hint: "5,000" },
    ],
    riskItems: ["scheduledItem"],
  },
  PET: {
    lob: "PET",
    coverages: [
      { code: "PET_ANNUAL", label: "Annual benefit limit", shape: "limit", hint: "10,000" },
      { code: "PET_REIMB", label: "Reimbursement level", shape: "text", hint: "80%" },
      { code: "DEDUCT", label: "Annual deductible", shape: "deductible", hint: "250" },
    ],
    riskItems: [],
  },
  IDENTITY_THEFT: {
    lob: "IDENTITY_THEFT",
    coverages: [
      { code: "ID_LIMIT", label: "Expense reimbursement limit", shape: "limit", hint: "25,000" },
      { code: "DEDUCT", label: "Deductible", shape: "deductible", hint: "0" },
    ],
    riskItems: [],
  },

  BOAT: {
    lob: "BOAT",
    coverages: [
      { code: "HULL", label: "Hull/physical damage", shape: "limit", hint: "Agreed value" },
      { code: "BOAT_LIAB", label: "Watercraft liability", shape: "limit", hint: "300,000" },
      { code: "BOAT_MED", label: "Medical payments", shape: "limit", hint: "5,000" },
      { code: "UM_BOAT", label: "Uninsured boater", shape: "limit" },
      { code: "DEDUCT", label: "Deductible", shape: "deductible", hint: "500" },
    ],
    riskItems: ["watercraft"],
  },

  GENERAL_LIABILITY: { lob: "GENERAL_LIABILITY", coverages: GL_COVERAGES, riskItems: ["location"] },
  COMMERCIAL_PROPERTY: { lob: "COMMERCIAL_PROPERTY", coverages: PROPERTY_COVERAGES, riskItems: ["location"] },
  BOP: { lob: "BOP", coverages: [...GL_COVERAGES, ...PROPERTY_COVERAGES], riskItems: ["location"] },
  WORKERS_COMP: { lob: "WORKERS_COMP", coverages: WC_COVERAGES, riskItems: ["location"] },

  CYBER: {
    lob: "CYBER",
    coverages: [
      { code: "CY_AGG", label: "Aggregate limit", shape: "limit", hint: "1,000,000" },
      { code: "CY_BREACH", label: "Breach response", shape: "limit" },
      { code: "CY_BI", label: "Business interruption", shape: "limit" },
      { code: "CY_EXTORTION", label: "Cyber extortion", shape: "limit" },
      { code: "DEDUCT", label: "Retention", shape: "deductible", hint: "10,000" },
    ],
    riskItems: [],
  },
  PROFESSIONAL: {
    lob: "PROFESSIONAL",
    coverages: [
      { code: "EO_OCC", label: "Each claim", shape: "limit", hint: "1,000,000" },
      { code: "EO_AGG", label: "Aggregate", shape: "limit", hint: "2,000,000" },
      { code: "DEDUCT", label: "Retention", shape: "deductible", hint: "5,000" },
    ],
    riskItems: [],
  },
  ERRORS_OMISSIONS: {
    lob: "ERRORS_OMISSIONS",
    coverages: [
      { code: "EO_OCC", label: "Each claim", shape: "limit", hint: "1,000,000" },
      { code: "EO_AGG", label: "Aggregate", shape: "limit", hint: "2,000,000" },
      { code: "DEDUCT", label: "Retention", shape: "deductible", hint: "5,000" },
    ],
    riskItems: [],
  },
  DIRECTORS_OFFICERS: {
    lob: "DIRECTORS_OFFICERS",
    coverages: [
      { code: "DO_LIMIT", label: "Aggregate limit", shape: "limit", hint: "1,000,000" },
      { code: "DO_SIDE_A", label: "Side A (non-indemnifiable)", shape: "limit" },
      { code: "DEDUCT", label: "Retention", shape: "deductible", hint: "10,000" },
    ],
    riskItems: [],
  },
  EPLI: {
    lob: "EPLI",
    coverages: [
      { code: "EPLI_LIMIT", label: "Aggregate limit", shape: "limit", hint: "1,000,000" },
      { code: "DEDUCT", label: "Retention", shape: "deductible", hint: "10,000" },
    ],
    riskItems: ["location"],
  },
  LIQUOR_LIABILITY: {
    lob: "LIQUOR_LIABILITY",
    coverages: [
      { code: "LL_OCC", label: "Each common cause", shape: "limit", hint: "1,000,000" },
      { code: "LL_AGG", label: "Aggregate", shape: "limit", hint: "1,000,000" },
    ],
    riskItems: ["location"],
  },
  SURETY_BONDS: {
    lob: "SURETY_BONDS",
    coverages: [
      { code: "BOND_PENAL", label: "Bond penal sum", shape: "limit", hint: "100,000" },
      { code: "BOND_TYPE", label: "Bond type", shape: "text", hint: "Performance / payment / license" },
    ],
    riskItems: [],
  },
  INLAND_MARINE: {
    lob: "INLAND_MARINE",
    coverages: [
      { code: "IM_LIMIT", label: "Scheduled/blanket limit", shape: "limit", hint: "250,000" },
      { code: "IM_PERITEM", label: "Per-item limit", shape: "limit" },
      { code: "DEDUCT", label: "Deductible", shape: "deductible", hint: "1,000" },
    ],
    riskItems: ["scheduledItem"],
  },
};

/** Generic fallback when a LOB has no explicit template. */
const FALLBACK_COVERAGES: CoverageTemplate[] = [
  { code: "LIMIT", label: "Coverage limit", shape: "limit" },
  { code: "DEDUCT", label: "Deductible", shape: "deductible" },
];

/** The coverage + risk-item template for a line of business. */
export function coverageTemplateFor(lob: LineOfBusiness): LineTemplate {
  return TEMPLATES[lob] ?? { lob, coverages: FALLBACK_COVERAGES, riskItems: [] };
}

/** Standard coverage rows for a line (in display order). */
export function coveragesForLob(lob: LineOfBusiness): CoverageTemplate[] {
  return coverageTemplateFor(lob).coverages;
}

/** Risk-item editors that apply to a line. */
export function riskItemsForLob(lob: LineOfBusiness): RiskItemKind[] {
  return coverageTemplateFor(lob).riskItems;
}

/** True iff a given risk-item editor applies to the line. */
export function lobHasRiskItem(lob: LineOfBusiness, kind: RiskItemKind): boolean {
  return riskItemsForLob(lob).includes(kind);
}

/** Look up a coverage label by code within a line's template (for display). */
export function coverageLabelFor(lob: LineOfBusiness, code: string): string | null {
  return coveragesForLob(lob).find((c) => c.code === code)?.label ?? null;
}

/** Human labels for risk-item kinds (UI headings). */
export const RISK_ITEM_LABELS: Record<RiskItemKind, string> = {
  vehicle: "Vehicles",
  driver: "Drivers",
  dwelling: "Dwelling",
  scheduledItem: "Scheduled items",
  watercraft: "Watercraft",
  location: "Insured locations",
};
