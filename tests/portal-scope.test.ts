import { describe, it, expect } from "vitest";
import {
  PORTAL_INVOICE_STATUSES,
  PORTAL_POLICY_STATUSES,
  canClientSeeDocument,
  canClientSeeInvoice,
  canClientSeePolicy,
  ownsRecord,
  portalClaimWhere,
  portalDocumentWhere,
  portalInvoiceWhere,
  portalPolicyWhere,
} from "@/lib/domain/portal-scope";
import type { InvoiceStatus, PolicyStatus } from "@prisma/client";

const CLIENT_A = "client-a";
const CLIENT_B = "client-b";

describe("portal where-builders inject the session clientId", () => {
  it("policy/claim/invoice/document wheres are pinned to the given clientId", () => {
    expect(portalPolicyWhere(CLIENT_A).clientId).toBe(CLIENT_A);
    expect(portalClaimWhere(CLIENT_A).clientId).toBe(CLIENT_A);
    expect(portalInvoiceWhere(CLIENT_A).clientId).toBe(CLIENT_A);
    expect(portalDocumentWhere(CLIENT_A).clientId).toBe(CLIENT_A);
  });

  it("policy where hides internal QUOTE shells", () => {
    expect(portalPolicyWhere(CLIENT_A).status.in).not.toContain("QUOTE");
  });

  it("invoice where hides staff DRAFT and VOID invoices", () => {
    expect(portalInvoiceWhere(CLIENT_A).status.in).not.toContain("DRAFT");
    expect(portalInvoiceWhere(CLIENT_A).status.in).not.toContain("VOID");
  });

  it("document where requires the staff visibleToClient opt-in", () => {
    expect(portalDocumentWhere(CLIENT_A).visibleToClient).toBe(true);
  });

  it("applied as a filter, client A's where never matches client B rows", () => {
    const rows = [
      { clientId: CLIENT_A, status: "ACTIVE" as PolicyStatus },
      { clientId: CLIENT_B, status: "ACTIVE" as PolicyStatus },
      { clientId: CLIENT_B, status: "BOUND" as PolicyStatus },
    ];
    const where = portalPolicyWhere(CLIENT_A);
    const visible = rows.filter((r) => r.clientId === where.clientId && where.status.in.includes(r.status));
    expect(visible).toHaveLength(1);
    expect(visible[0]!.clientId).toBe(CLIENT_A);
  });
});

describe("ownsRecord", () => {
  it("is true only for the owning client", () => {
    expect(ownsRecord({ clientId: CLIENT_A }, CLIENT_A)).toBe(true);
    expect(ownsRecord({ clientId: CLIENT_B }, CLIENT_A)).toBe(false);
  });
  it("rejects missing rows and null/empty clientIds", () => {
    expect(ownsRecord(null, CLIENT_A)).toBe(false);
    expect(ownsRecord(undefined, CLIENT_A)).toBe(false);
    expect(ownsRecord({ clientId: null }, CLIENT_A)).toBe(false);
    expect(ownsRecord({ clientId: CLIENT_A }, "")).toBe(false);
  });
});

describe("canClientSeePolicy", () => {
  it("client A cannot see client B's policy", () => {
    expect(canClientSeePolicy({ clientId: CLIENT_B, status: "ACTIVE" }, CLIENT_A)).toBe(false);
  });
  it("own policy is visible for every portal status, never for QUOTE", () => {
    for (const status of PORTAL_POLICY_STATUSES) {
      expect(canClientSeePolicy({ clientId: CLIENT_A, status }, CLIENT_A)).toBe(true);
    }
    expect(canClientSeePolicy({ clientId: CLIENT_A, status: "QUOTE" }, CLIENT_A)).toBe(false);
  });
});

describe("canClientSeeInvoice", () => {
  it("client A cannot see client B's invoice", () => {
    expect(canClientSeeInvoice({ clientId: CLIENT_B, status: "SENT" }, CLIENT_A)).toBe(false);
  });
  it("own SENT/PARTIAL/PAID visible, DRAFT/VOID hidden", () => {
    for (const status of PORTAL_INVOICE_STATUSES) {
      expect(canClientSeeInvoice({ clientId: CLIENT_A, status }, CLIENT_A)).toBe(true);
    }
    for (const status of ["DRAFT", "VOID"] as InvoiceStatus[]) {
      expect(canClientSeeInvoice({ clientId: CLIENT_A, status }, CLIENT_A)).toBe(false);
    }
  });
});

describe("canClientSeeDocument", () => {
  it("client A cannot see client B's document even when shared", () => {
    expect(canClientSeeDocument({ clientId: CLIENT_B, visibleToClient: true }, CLIENT_A)).toBe(false);
  });
  it("own document requires the visibleToClient opt-in", () => {
    expect(canClientSeeDocument({ clientId: CLIENT_A, visibleToClient: true }, CLIENT_A)).toBe(true);
    expect(canClientSeeDocument({ clientId: CLIENT_A, visibleToClient: false }, CLIENT_A)).toBe(false);
  });
});
