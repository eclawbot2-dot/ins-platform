/**
 * Single source of truth for brand strings. Every UI surface, email,
 * and document that says the agency's name imports from here — never
 * hard-code "Tabor Agency" elsewhere.
 *
 * Pure data — safe to import from both server and client components.
 */

export const BRAND = {
  /** Agency display name. */
  name: "Tabor Agency",
  /** Short legal-ish name used in email signatures. */
  legalName: "Tabor Agency",
  /** Subtitle under the logo in the staff app. */
  staffTagline: "Agency Management",
  /** Subtitle under the logo in the client portal. */
  portalTagline: "Client Portal",
  /** Marketing domain (NS switch pending). */
  domain: "taboragency.com",
  /** Public marketing site. */
  website: "https://taboragency.com",
  /** Portal vanity host (also reachable at ins.jahdev.com). */
  portalHost: "portal.taboragency.com",
  /** Agency office contact shown on the portal contact card. */
  phone: "843-555-0100",
  email: "office@taboragency.com",
} as const;
