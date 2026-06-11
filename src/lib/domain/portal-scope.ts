/**
 * Client-portal data scoping — the pure layer behind every portal
 * query. The contract: a portal session carries exactly one clientId
 * (from the JWT, never from params/body), and every read goes through
 * one of these builders/predicates so client A can never see client
 * B's rows.
 *
 * Pure data/functions — unit-tested in tests/portal-scope.test.ts.
 */

import type { ClaimStatus, InvoiceStatus, PolicyStatus } from "@prisma/client";

/** Policy statuses a client may see — internal quote shells stay hidden. */
export const PORTAL_POLICY_STATUSES: PolicyStatus[] = [
  "BOUND",
  "ACTIVE",
  "RENEWED",
  "CANCELLED",
  "EXPIRED",
  "NON_RENEWED",
];

/** Invoice statuses a client may see — staff drafts stay hidden. */
export const PORTAL_INVOICE_STATUSES: InvoiceStatus[] = ["SENT", "PARTIAL", "PAID"];

/** Claim statuses counted as "open" on the portal dashboard. */
export const OPEN_CLAIM_STATUSES: ClaimStatus[] = ["REPORTED", "OPEN", "UNDER_REVIEW", "APPROVED"];

/** Invoice statuses counted as "open" (money still owed). */
export const OPEN_INVOICE_STATUSES: InvoiceStatus[] = ["SENT", "PARTIAL"];

// ── Prisma `where` builders ──────────────────────────────────────────

export function portalPolicyWhere(clientId: string) {
  return { clientId, status: { in: PORTAL_POLICY_STATUSES } } as const;
}

export function portalInvoiceWhere(clientId: string) {
  return { clientId, status: { in: PORTAL_INVOICE_STATUSES } } as const;
}

export function portalClaimWhere(clientId: string) {
  return { clientId } as const;
}

/** Only staff-flagged documents, only the client's own. */
export function portalDocumentWhere(clientId: string) {
  return { clientId, visibleToClient: true } as const;
}

// ── Row-level predicates (post-fetch guards) ─────────────────────────

/** True only when the row exists AND belongs to the session's client. */
export function ownsRecord(record: { clientId: string | null } | null | undefined, clientId: string): boolean {
  return !!record && !!clientId && record.clientId === clientId;
}

export function canClientSeePolicy(
  policy: { clientId: string | null; status: PolicyStatus } | null | undefined,
  clientId: string,
): boolean {
  return ownsRecord(policy, clientId) && PORTAL_POLICY_STATUSES.includes(policy!.status);
}

export function canClientSeeInvoice(
  invoice: { clientId: string | null; status: InvoiceStatus } | null | undefined,
  clientId: string,
): boolean {
  return ownsRecord(invoice, clientId) && PORTAL_INVOICE_STATUSES.includes(invoice!.status);
}

export function canClientSeeDocument(
  doc: { clientId: string | null; visibleToClient: boolean } | null | undefined,
  clientId: string,
): boolean {
  return ownsRecord(doc, clientId) && doc!.visibleToClient === true;
}
