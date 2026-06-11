/**
 * Display labels + groupings for the domain enums. Pure data — safe to
 * import from both server and client components.
 */

import type {
  AppointmentStatus,
  BillingType,
  ClaimStatus,
  ClientStatus,
  InvoiceStatus,
  LeadStatus,
  LineOfBusiness,
  OpportunityStage,
  PolicyStatus,
  QuoteStatus,
  RenewalStatus,
  TaskStatus,
} from "@prisma/client";

export const LOB_LABELS: Record<LineOfBusiness, string> = {
  AUTO: "Personal Auto",
  HOME: "Homeowners",
  RENTERS: "Renters",
  UMBRELLA: "Personal Umbrella",
  LIFE: "Life",
  HEALTH: "Health",
  GENERAL_LIABILITY: "General Liability",
  COMMERCIAL_PROPERTY: "Commercial Property",
  BOP: "Business Owners (BOP)",
  WORKERS_COMP: "Workers Compensation",
  COMMERCIAL_AUTO: "Commercial Auto",
  CYBER: "Cyber Liability",
  PROFESSIONAL: "Professional / E&O",
  INLAND_MARINE: "Inland Marine",
};

export const PERSONAL_LOBS: LineOfBusiness[] = ["AUTO", "HOME", "RENTERS", "UMBRELLA", "LIFE", "HEALTH"];
export const COMMERCIAL_LOBS: LineOfBusiness[] = [
  "GENERAL_LIABILITY",
  "COMMERCIAL_PROPERTY",
  "BOP",
  "WORKERS_COMP",
  "COMMERCIAL_AUTO",
  "CYBER",
  "PROFESSIONAL",
  "INLAND_MARINE",
];
export const ALL_LOBS: LineOfBusiness[] = [...PERSONAL_LOBS, ...COMMERCIAL_LOBS];

export function lobSegment(lob: LineOfBusiness): "Personal" | "Commercial" {
  return (PERSONAL_LOBS as string[]).includes(lob) ? "Personal" : "Commercial";
}

export const POLICY_STATUS_LABELS: Record<PolicyStatus, string> = {
  QUOTE: "Quote",
  BOUND: "Bound",
  ACTIVE: "Active",
  RENEWED: "Renewed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  NON_RENEWED: "Non-renewed",
};

export const BILLING_LABELS: Record<BillingType, string> = {
  AGENCY_BILL: "Agency bill",
  DIRECT_BILL: "Direct bill",
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  PROSPECT: "Prospect",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  FORMER: "Former",
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  CONVERTED: "Converted",
  LOST: "Lost",
};

export const STAGE_LABELS: Record<OpportunityStage, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUOTING: "Quoting",
  PROPOSAL: "Proposal",
  BOUND: "Bound",
  LOST: "Lost",
};

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted to carrier",
  RECEIVED: "Quote received",
  PRESENTED: "Presented",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
};

export const RENEWAL_STATUS_LABELS: Record<RenewalStatus, string> = {
  PENDING_REVIEW: "Pending review",
  REMARKETING: "Remarketing",
  QUOTED: "Quoted",
  RENEWED: "Renewed",
  LOST: "Lost",
};

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  REPORTED: "Reported",
  OPEN: "Open",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  DENIED: "Denied",
  CLOSED: "Closed",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export const APPOINTMENT_LABELS: Record<AppointmentStatus, string> = {
  APPOINTED: "Appointed",
  PENDING: "Pending",
  TERMINATED: "Terminated",
  NOT_APPOINTED: "Not appointed",
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PARTIAL: "Partially paid",
  PAID: "Paid",
  VOID: "Void",
};

/** Badge tone per status family — maps to .badge-* classes in globals.css. */
export type BadgeTone = "green" | "blue" | "amber" | "red" | "slate" | "violet";

export function policyStatusTone(s: PolicyStatus): BadgeTone {
  switch (s) {
    case "ACTIVE": return "green";
    case "BOUND": return "blue";
    case "QUOTE": return "violet";
    case "RENEWED": return "slate";
    case "CANCELLED":
    case "NON_RENEWED": return "red";
    case "EXPIRED": return "amber";
  }
}

export function claimStatusTone(s: ClaimStatus): BadgeTone {
  switch (s) {
    case "REPORTED": return "violet";
    case "OPEN": return "blue";
    case "UNDER_REVIEW": return "amber";
    case "APPROVED": return "green";
    case "DENIED": return "red";
    case "CLOSED": return "slate";
  }
}

export function renewalStatusTone(s: RenewalStatus): BadgeTone {
  switch (s) {
    case "PENDING_REVIEW": return "amber";
    case "REMARKETING": return "violet";
    case "QUOTED": return "blue";
    case "RENEWED": return "green";
    case "LOST": return "red";
  }
}

export function stageTone(s: OpportunityStage): BadgeTone {
  switch (s) {
    case "NEW": return "slate";
    case "CONTACTED": return "violet";
    case "QUOTING": return "blue";
    case "PROPOSAL": return "amber";
    case "BOUND": return "green";
    case "LOST": return "red";
  }
}

export function invoiceStatusTone(s: InvoiceStatus): BadgeTone {
  switch (s) {
    case "DRAFT": return "slate";
    case "SENT": return "blue";
    case "PARTIAL": return "amber";
    case "PAID": return "green";
    case "VOID": return "red";
  }
}

export function leadStatusTone(s: LeadStatus): BadgeTone {
  switch (s) {
    case "NEW": return "blue";
    case "CONTACTED": return "violet";
    case "QUALIFIED": return "amber";
    case "CONVERTED": return "green";
    case "LOST": return "red";
  }
}

export function humanize(v: string): string {
  return v
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}
