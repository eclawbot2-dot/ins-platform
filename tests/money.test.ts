import { describe, it, expect } from "vitest";
import { toNum, roundMoney, fmtMoney, fmtMoneyCents, fmtPct } from "@/lib/money";

describe("toNum", () => {
  it("passes numbers through", () => {
    expect(toNum(12.5)).toBe(12.5);
  });
  it("unwraps Decimal-likes", () => {
    expect(toNum({ toNumber: () => 99.99 })).toBe(99.99);
  });
  it("parses currency strings", () => {
    expect(toNum("$1,234.56")).toBe(1234.56);
  });
  it("treats null/undefined/garbage as 0", () => {
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum("abc")).toBe(0);
    expect(toNum(NaN)).toBe(0);
  });
});

describe("roundMoney", () => {
  it("rounds to cents", () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
});

describe("formatters", () => {
  it("fmtMoney shows whole dollars", () => {
    expect(fmtMoney(12345.67)).toBe("$12,346");
  });
  it("fmtMoneyCents shows cents", () => {
    expect(fmtMoneyCents(12345.6)).toBe("$12,345.60");
  });
  it("fmtPct formats with default one decimal", () => {
    expect(fmtPct(12.345)).toBe("12.3%");
  });
});
