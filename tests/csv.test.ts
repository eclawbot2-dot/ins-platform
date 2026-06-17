import { describe, it, expect } from "vitest";
import { toCsv, fromCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("emits BOM + header + CRLF rows", () => {
    const csv = toCsv([{ a: 1, b: "x" }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("a,b\r\n1,x\r\n");
  });
  it("quotes fields with commas/quotes/newlines and doubles internal quotes", () => {
    const csv = toCsv([{ name: 'Acme, "The" Co\nLine2' }]);
    expect(csv).toContain('"Acme, ""The"" Co\nLine2"');
  });
  it("serializes Date as ISO and Decimal-likes via toNumber", () => {
    const csv = toCsv([{ d: new Date("2026-06-10T00:00:00Z"), m: { toNumber: () => 12.5 } }]);
    expect(csv).toContain("2026-06-10T00:00:00.000Z");
    expect(csv).toContain("12.5");
  });
  it("neutralizes spreadsheet formula-injection leads with a quote prefix", () => {
    const csv = toCsv([{ a: "=1+1", b: "+A1", c: "-2", d: "@SUM(A1)" }]);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'+A1");
    expect(csv).toContain("'-2");
    expect(csv).toContain("'@SUM(A1)");
    // a benign value is untouched
    expect(toCsv([{ x: "Acme" }])).toContain("Acme\r\n");
    expect(toCsv([{ x: "Acme" }])).not.toContain("'Acme");
  });
  it("unions columns across rows unless explicit columns are given", () => {
    const csv = toCsv([{ a: 1 }, { b: 2 }]);
    expect(csv).toContain("a,b");
    const explicit = toCsv([{ a: 1, b: 2 }], ["b"]);
    expect(explicit).toContain("b\r\n2");
    expect(explicit).not.toContain("a");
  });
});

describe("fromCsv", () => {
  it("parses simple rows into header-keyed objects", () => {
    expect(fromCsv("a,b\n1,2\n3,4\n")).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });
  it("handles quoted fields with embedded commas and quotes", () => {
    const rows = fromCsv('policy,insured\n"PA-1","Smith, ""Bo"" Jr"\n');
    expect(rows[0]).toEqual({ policy: "PA-1", insured: 'Smith, "Bo" Jr' });
  });
  it("accepts CRLF and a UTF-8 BOM", () => {
    const rows = fromCsv("﻿a,b\r\n1,2\r\n");
    expect(rows).toEqual([{ a: "1", b: "2" }]);
  });
  it("skips blank trailing lines", () => {
    expect(fromCsv("a\n1\n\n")).toEqual([{ a: "1" }]);
  });
  it("round-trips with toCsv", () => {
    const rows = [{ policyNumber: "GL-HAR-1018", insuredName: "Harborview Builders, LLC", commissionAmount: "1274" }];
    expect(fromCsv(toCsv(rows))).toEqual(rows);
  });
});
