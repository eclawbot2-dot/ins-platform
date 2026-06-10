import { describe, it, expect } from "vitest";
import { mapXeroInvoiceStatus } from "@/lib/integrations/xero/status";

const now = new Date("2026-06-10T00:00:00Z");

describe("mapXeroInvoiceStatus", () => {
  it("PAID maps to PAID with FullyPaidOnDate", () => {
    const paidOn = new Date("2026-06-01T00:00:00Z");
    expect(mapXeroInvoiceStatus({ Status: "PAID" }, { status: "SENT", paidAt: null }, paidOn, now)).toEqual({
      status: "PAID",
      paidAt: paidOn,
    });
  });
  it("PAID without a Xero date keeps the existing paidAt, else uses now", () => {
    const existing = new Date("2026-05-20T00:00:00Z");
    expect(mapXeroInvoiceStatus({ Status: "PAID" }, { status: "PARTIAL", paidAt: existing }, null, now)!.paidAt).toBe(existing);
    expect(mapXeroInvoiceStatus({ Status: "PAID" }, { status: "SENT", paidAt: null }, null, now)!.paidAt).toBe(now);
  });
  it("VOIDED/DELETED map to VOID and clear paidAt", () => {
    expect(mapXeroInvoiceStatus({ Status: "VOIDED" }, { status: "PAID", paidAt: now }, null, now)).toEqual({
      status: "VOID",
      paidAt: null,
    });
    expect(mapXeroInvoiceStatus({ Status: "DELETED" }, { status: "SENT", paidAt: null }, null, now)!.status).toBe("VOID");
  });
  it("AUTHORISED with partial payment maps to PARTIAL", () => {
    expect(mapXeroInvoiceStatus({ Status: "AUTHORISED", AmountPaid: 50 }, { status: "SENT", paidAt: null }, null, now)).toEqual({
      status: "PARTIAL",
      paidAt: null,
    });
  });
  it("AUTHORISED with no payment opens a DRAFT to SENT", () => {
    expect(mapXeroInvoiceStatus({ Status: "AUTHORISED", AmountPaid: 0 }, { status: "DRAFT", paidAt: null }, null, now)).toEqual({
      status: "SENT",
      paidAt: null,
    });
  });
  it("AUTHORISED with no payment leaves an already-SENT invoice untouched", () => {
    expect(mapXeroInvoiceStatus({ Status: "AUTHORISED" }, { status: "SENT", paidAt: null }, null, now)).toBeNull();
  });
  it("unknown statuses cause no change", () => {
    expect(mapXeroInvoiceStatus({ Status: "DRAFT" }, { status: "SENT", paidAt: null }, null, now)).toBeNull();
    expect(mapXeroInvoiceStatus({}, { status: "SENT", paidAt: null }, null, now)).toBeNull();
  });
});
