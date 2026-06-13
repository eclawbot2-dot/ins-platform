import { describe, it, expect } from "vitest";
import {
  canRecordPayment,
  canAddLine,
  canMarkSent,
  applyPayment,
} from "@/lib/domain/invoice-transitions";

describe("invoice transition guards — AR phantom-receivable invariants", () => {
  it("payments only on open invoices (DRAFT/SENT/PARTIAL), never VOID/PAID", () => {
    expect(canRecordPayment("DRAFT")).toBe(true);
    expect(canRecordPayment("SENT")).toBe(true);
    expect(canRecordPayment("PARTIAL")).toBe(true);
    // A void invoice must NOT be resurrectable into AR by a payment.
    expect(canRecordPayment("VOID")).toBe(false);
    // A fully-paid invoice takes no further payment.
    expect(canRecordPayment("PAID")).toBe(false);
  });

  it("lines may be added while open, never on a settled (VOID/PAID) invoice", () => {
    expect(canAddLine("DRAFT")).toBe(true);
    expect(canAddLine("SENT")).toBe(true);
    expect(canAddLine("PARTIAL")).toBe(true);
    expect(canAddLine("VOID")).toBe(false);
    expect(canAddLine("PAID")).toBe(false);
  });

  it("only a DRAFT can be marked SENT (no resurrecting VOID/PAID into open AR)", () => {
    expect(canMarkSent("DRAFT")).toBe(true);
    expect(canMarkSent("SENT")).toBe(false);
    expect(canMarkSent("PARTIAL")).toBe(false);
    expect(canMarkSent("PAID")).toBe(false);
    expect(canMarkSent("VOID")).toBe(false);
  });
});

describe("applyPayment — clamps, settles, never overpays", () => {
  it("partial payment leaves the invoice PARTIAL", () => {
    const r = applyPayment(1000, 0, 250);
    expect(r.paidAmount).toBe(250);
    expect(r.status).toBe("PARTIAL");
    expect(r.fullyPaid).toBe(false);
  });

  it("a payment that meets the total settles to PAID", () => {
    const r = applyPayment(1000, 250, 750);
    expect(r.paidAmount).toBe(1000);
    expect(r.status).toBe("PAID");
    expect(r.fullyPaid).toBe(true);
  });

  it("overpayment is clamped to the invoice total — no negative balance / phantom credit", () => {
    const r = applyPayment(1000, 800, 500);
    expect(r.paidAmount).toBe(1000);
    expect(r.status).toBe("PAID");
  });

  it("rounds to cents — no float drift", () => {
    const r = applyPayment(100, 0, 0.1 + 0.2); // 0.30000000000000004
    expect(r.paidAmount).toBe(0.3);
  });
});
