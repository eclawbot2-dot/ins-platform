/**
 * Display labels + groupings for the domain enums. Pure data — safe to
 * import from both server and client components.
 */

import type {
  AppointmentStatus,
  BillingType,
  ClaimStatus,
  ClientStatus,
  EndorsementRequestStatus,
  EndorsementRequestType,
  EoiHolderInterest,
  InvoiceStatus,
  LeadStatus,
  LineOfBusiness,
  OpportunityStage,
  PolicyStatus,
  QuoteStatus,
  RenewalStatus,
  TaskStatus,
  TouchpointCategory,
  TouchpointStatus,
  TouchpointTrigger,
} from "@prisma/client";

export const LOB_LABELS: Record<LineOfBusiness, string> = {
  AUTO: "Personal Auto",
  HOME: "Homeowners",
  RENTERS: "Renters",
  UMBRELLA: "Personal Umbrella",
  LIFE: "Life",
  HEALTH: "Health",
  // Personal — Wave A
  CONDO: "Condo (HO-6)",
  FLOOD: "Flood",
  MOTORCYCLE: "Motorcycle",
  BOAT: "Boat / Watercraft",
  RV: "RV / Motorhome",
  VALUABLE_ARTICLES: "Valuable Articles",
  PET: "Pet",
  IDENTITY_THEFT: "Identity Theft",
  // Commercial
  GENERAL_LIABILITY: "General Liability",
  COMMERCIAL_PROPERTY: "Commercial Property",
  BOP: "Business Owners (BOP)",
  WORKERS_COMP: "Workers Compensation",
  COMMERCIAL_AUTO: "Commercial Auto",
  CYBER: "Cyber Liability",
  PROFESSIONAL: "Professional / E&O",
  INLAND_MARINE: "Inland Marine",
  // Commercial — Wave A
  ERRORS_OMISSIONS: "Errors & Omissions",
  COMMERCIAL_UMBRELLA: "Commercial Umbrella",
  DIRECTORS_OFFICERS: "Directors & Officers",
  EPLI: "Employment Practices (EPLI)",
  LIQUOR_LIABILITY: "Liquor Liability",
  SURETY_BONDS: "Surety Bonds",
  GARAGE: "Garage / Dealers",
  BUILDERS_RISK: "Builders Risk",
};

export const PERSONAL_LOBS: LineOfBusiness[] = [
  "AUTO",
  "HOME",
  "CONDO",
  "RENTERS",
  "UMBRELLA",
  "FLOOD",
  "MOTORCYCLE",
  "BOAT",
  "RV",
  "VALUABLE_ARTICLES",
  "PET",
  "IDENTITY_THEFT",
  "LIFE",
  "HEALTH",
];
export const COMMERCIAL_LOBS: LineOfBusiness[] = [
  "GENERAL_LIABILITY",
  "COMMERCIAL_PROPERTY",
  "BOP",
  "WORKERS_COMP",
  "COMMERCIAL_AUTO",
  "COMMERCIAL_UMBRELLA",
  "CYBER",
  "PROFESSIONAL",
  "ERRORS_OMISSIONS",
  "DIRECTORS_OFFICERS",
  "EPLI",
  "LIQUOR_LIABILITY",
  "SURETY_BONDS",
  "GARAGE",
  "BUILDERS_RISK",
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

// ── Wave B: servicing artifacts ──────────────────────────────────────

export const ENDORSEMENT_REQUEST_TYPE_LABELS: Record<EndorsementRequestType, string> = {
  ADD_VEHICLE: "Add vehicle",
  REMOVE_VEHICLE: "Remove vehicle",
  ADD_DRIVER: "Add driver",
  REMOVE_DRIVER: "Remove driver",
  CHANGE_LIMIT: "Change limit / coverage",
  ADD_LIENHOLDER: "Add lienholder / mortgagee",
  REMOVE_LIENHOLDER: "Remove lienholder / mortgagee",
  ADDRESS_CHANGE: "Address change",
  ADD_COVERAGE: "Add coverage",
  REMOVE_COVERAGE: "Remove coverage",
  OTHER: "Other change",
};

export const ENDORSEMENT_REQUEST_STATUS_LABELS: Record<EndorsementRequestStatus, string> = {
  REQUESTED: "Requested",
  IN_REVIEW: "In review",
  SUBMITTED_TO_CARRIER: "Submitted to carrier",
  COMPLETED: "Completed",
  DECLINED: "Declined",
};

export const EOI_HOLDER_INTEREST_LABELS: Record<EoiHolderInterest, string> = {
  MORTGAGEE: "Mortgagee",
  LOSS_PAYEE: "Loss payee",
  ADDITIONAL_INTEREST: "Additional interest",
  LENDER: "Lender",
};

/** Badge tone per status family — maps to .badge-* classes in globals.css. */
export type BadgeTone = "green" | "blue" | "amber" | "red" | "slate" | "violet";

export function endorsementRequestStatusTone(s: EndorsementRequestStatus): BadgeTone {
  switch (s) {
    case "REQUESTED": return "violet";
    case "IN_REVIEW": return "amber";
    case "SUBMITTED_TO_CARRIER": return "blue";
    case "COMPLETED": return "green";
    case "DECLINED": return "red";
  }
}

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

// ── Touchpoint engine ────────────────────────────────────────────────

export const TOUCHPOINT_CATEGORY_LABELS: Record<TouchpointCategory, string> = {
  ONBOARDING: "Onboarding",
  RENEWAL: "Renewal",
  PAYMENT: "Payment",
  CLAIM: "Claim",
  APPRECIATION: "Appreciation",
  SATISFACTION: "Satisfaction",
  OFFBOARDING: "Offboarding",
};

export const TOUCHPOINT_STATUS_LABELS: Record<TouchpointStatus, string> = {
  PENDING: "Needs approval",
  APPROVED: "Approved",
  SENT: "Sent",
  SKIPPED: "Skipped",
  FAILED: "Failed",
};

export const TOUCHPOINT_TRIGGER_LABELS: Record<TouchpointTrigger, string> = {
  RENEWAL_RELATIVE: "Renewal-relative",
  PAYMENT_DUE_RELATIVE: "Payment-due relative",
  BIRTHDAY: "Birthday",
  POLICY_ANNIVERSARY: "Policy anniversary",
  HOLIDAY: "Holiday",
  TENURE_MILESTONE: "Tenure milestone",
  LIFECYCLE_EVENT: "Lifecycle event",
  MANUAL: "Manual",
};

export function touchpointCategoryTone(c: TouchpointCategory): BadgeTone {
  switch (c) {
    case "ONBOARDING": return "blue";
    case "RENEWAL": return "violet";
    case "PAYMENT": return "amber";
    case "CLAIM": return "red";
    case "APPRECIATION": return "green";
    case "SATISFACTION": return "blue";
    case "OFFBOARDING": return "slate";
  }
}

export function touchpointStatusTone(s: TouchpointStatus): BadgeTone {
  switch (s) {
    case "PENDING": return "amber";
    case "APPROVED": return "blue";
    case "SENT": return "green";
    case "SKIPPED": return "slate";
    case "FAILED": return "red";
  }
}

export function humanize(v: string): string {
  return v
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

// ── Wave D-final: household / surplus-lines / appetite / e-sign / benefits

import type {
  HouseholdRole,
  SurplusLinesStatus,
  CarrierAppetite,
  SignatureProvider,
  SignatureStatus,
  SignatureDocKind,
  GroupPlanType,
  RateBasis,
} from "@prisma/client";

export const HOUSEHOLD_ROLE_LABELS: Record<HouseholdRole, string> = {
  PRIMARY: "Primary insured",
  SPOUSE: "Spouse",
  PARTNER: "Partner",
  CHILD: "Child",
  PARENT: "Parent",
  DEPENDENT: "Dependent",
  OTHER: "Other member",
};

export const SURPLUS_LINES_STATUS_LABELS: Record<SurplusLinesStatus, string> = {
  PENDING: "Filing pending",
  FILED: "Filed",
  EXEMPT: "Exempt",
  VOID: "Void",
};

export function surplusLinesStatusTone(s: SurplusLinesStatus): BadgeTone {
  switch (s) {
    case "PENDING": return "amber";
    case "FILED": return "green";
    case "EXEMPT": return "slate";
    case "VOID": return "red";
  }
}

export const CARRIER_APPETITE_LABELS: Record<CarrierAppetite, string> = {
  PREFERRED: "Preferred",
  STANDARD: "Standard",
  RESTRICTED: "Restricted / referral",
  DECLINE: "Will not write",
};

export function carrierAppetiteTone(a: CarrierAppetite): BadgeTone {
  switch (a) {
    case "PREFERRED": return "green";
    case "STANDARD": return "blue";
    case "RESTRICTED": return "amber";
    case "DECLINE": return "red";
  }
}

export const SIGNATURE_PROVIDER_LABELS: Record<SignatureProvider, string> = {
  MANUAL: "Manual (print & sign)",
  DOCUSIGN: "DocuSign",
  DROPBOX_SIGN: "Dropbox Sign",
};

export const SIGNATURE_STATUS_LABELS: Record<SignatureStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent for signature",
  VIEWED: "Viewed",
  SIGNED: "Signed",
  DECLINED: "Declined",
  VOIDED: "Voided",
  EXPIRED: "Expired",
};

export function signatureStatusTone(s: SignatureStatus): BadgeTone {
  switch (s) {
    case "DRAFT": return "slate";
    case "SENT": return "violet";
    case "VIEWED": return "blue";
    case "SIGNED": return "green";
    case "DECLINED":
    case "VOIDED": return "red";
    case "EXPIRED": return "amber";
  }
}

export const SIGNATURE_DOC_KIND_LABELS: Record<SignatureDocKind, string> = {
  PROPOSAL: "Proposal",
  APPLICATION: "Application",
  COI: "Certificate (COI)",
  EOI: "Evidence of property",
  POLICY_DOC: "Policy document",
  OTHER: "Other document",
};

export const GROUP_PLAN_TYPE_LABELS: Record<GroupPlanType, string> = {
  GROUP_HEALTH: "Group Health",
  GROUP_DENTAL: "Group Dental",
  GROUP_VISION: "Group Vision",
  GROUP_LIFE: "Group Life",
  GROUP_DISABILITY: "Group Disability",
  GROUP_ACCIDENT: "Group Accident",
  OTHER: "Other group plan",
};

export const RATE_BASIS_LABELS: Record<RateBasis, string> = {
  PEPM: "Per employee / month",
  PMPM: "Per member / month",
  COMPOSITE: "Composite",
  AGE_BANDED: "Age-banded",
  OTHER: "Other",
};
