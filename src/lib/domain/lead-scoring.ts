/**
 * Lead scoring — 0–100 composite of contact completeness, line-of-
 * business value, and source quality. Deterministic and pure so the
 * intake API and the UI agree on the number.
 */

import type { LineOfBusiness } from "@prisma/client";

export type LeadScoringInput = {
  email?: string | null;
  phone?: string | null;
  zip?: string | null;
  message?: string | null;
  lineOfBusiness?: LineOfBusiness | null;
  source?: string | null;
};

/**
 * Premium-value weighting per LOB (commercial lines score higher).
 * Partial — lines without an explicit weight fall back to 8 at the call
 * site, so adding new LOBs never breaks the type.
 */
const LOB_POINTS: Partial<Record<LineOfBusiness, number>> = {
  // Personal
  AUTO: 10,
  HOME: 14,
  CONDO: 12,
  RENTERS: 6,
  UMBRELLA: 12,
  FLOOD: 10,
  MOTORCYCLE: 8,
  BOAT: 9,
  RV: 9,
  VALUABLE_ARTICLES: 8,
  PET: 4,
  IDENTITY_THEFT: 4,
  LIFE: 12,
  HEALTH: 10,
  // Commercial
  GENERAL_LIABILITY: 22,
  COMMERCIAL_PROPERTY: 24,
  BOP: 22,
  WORKERS_COMP: 26,
  COMMERCIAL_AUTO: 24,
  COMMERCIAL_UMBRELLA: 22,
  CYBER: 20,
  PROFESSIONAL: 22,
  ERRORS_OMISSIONS: 22,
  DIRECTORS_OFFICERS: 22,
  EPLI: 20,
  LIQUOR_LIABILITY: 18,
  SURETY_BONDS: 14,
  GARAGE: 20,
  BUILDERS_RISK: 20,
  INLAND_MARINE: 16,
};

const SOURCE_POINTS: Record<string, number> = {
  referral: 25,
  "client referral": 25,
  website: 15,
  web: 15,
  "google": 12,
  "paid search": 10,
  social: 8,
  "direct mail": 6,
  event: 10,
  "cold call": 3,
  purchased: 2,
};

export function scoreLead(input: LeadScoringInput): number {
  let score = 0;

  // Contact completeness — can we actually reach them? (max 35)
  if (input.email && /\S+@\S+\.\S+/.test(input.email)) score += 15;
  if (input.phone && input.phone.replace(/\D/g, "").length >= 10) score += 15;
  if (input.zip && /^\d{5}/.test(input.zip.trim())) score += 5;

  // Intent — a real message signals an engaged shopper. (max 10)
  if (input.message && input.message.trim().length >= 20) score += 10;
  else if (input.message && input.message.trim().length > 0) score += 5;

  // Line of business value. (max 26)
  if (input.lineOfBusiness) score += LOB_POINTS[input.lineOfBusiness] ?? 8;

  // Source quality. (max 25)
  if (input.source) {
    const key = input.source.trim().toLowerCase();
    score += SOURCE_POINTS[key] ?? 5;
  }

  return Math.max(0, Math.min(100, score));
}

export type LeadGrade = "A" | "B" | "C" | "D";

export function leadGrade(score: number): LeadGrade {
  if (score >= 70) return "A";
  if (score >= 50) return "B";
  if (score >= 30) return "C";
  return "D";
}
