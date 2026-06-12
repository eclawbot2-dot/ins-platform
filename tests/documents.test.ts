import { describe, it, expect } from "vitest";
import { assembleIdCards, vehicleLabel, lobHasIdCard, renderIdCardHtml, type IdCardInput } from "@/lib/documents/id-card";
import { lobHasEoi, eoiKindForLob, eoiHeading, renderEoiHtml, type EoiInput } from "@/lib/documents/eoi";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe("id-card data assembly", () => {
  it("recognizes the auto lines that get an ID card", () => {
    expect(lobHasIdCard("AUTO")).toBe(true);
    expect(lobHasIdCard("COMMERCIAL_AUTO")).toBe(true);
    expect(lobHasIdCard("MOTORCYCLE")).toBe(true);
    expect(lobHasIdCard("HOME")).toBe(false);
  });

  it("builds one card per vehicle", () => {
    const cards = assembleIdCards({
      ...baseIdCard(),
      vehicles: [
        { year: 2020, make: "Toyota", model: "Highlander", vin: "VIN1" },
        { year: 2018, make: "Honda", model: "CR-V", vin: "VIN2" },
      ],
    });
    expect(cards).toHaveLength(2);
    expect(cards[0]!.vehicleLabel).toBe("2020 Toyota Highlander");
    expect(cards[1]!.vin).toBe("VIN2");
  });

  it("falls back to a single all-autos card when there are no vehicle rows", () => {
    const cards = assembleIdCards({ ...baseIdCard(), vehicles: [] });
    expect(cards).toHaveLength(1);
    expect(cards[0]!.vehicleLabel).toMatch(/all scheduled autos/i);
  });

  it("labels a partial vehicle gracefully", () => {
    expect(vehicleLabel({ year: null, make: "Ford", model: null, vin: null })).toBe("Ford");
    expect(vehicleLabel({ year: null, make: null, model: null, vin: null })).toBe("Vehicle");
  });

  it("renders printable HTML carrying policy + vehicle + coverage data", () => {
    const html = renderIdCardHtml({
      ...baseIdCard(),
      vehicles: [{ year: 2022, make: "Ford", model: "F-250", vin: "1FT7W2BT0NEC04821" }],
      coverages: [{ code: "BI", label: "Bodily injury", display: "100/300" }],
    });
    expect(html).toContain("AUTOMOBILE INSURANCE IDENTIFICATION CARD");
    expect(html).toContain("PA-PRO-1001");
    expect(html).toContain("1FT7W2BT0NEC04821");
    expect(html).toContain("100/300");
    expect(html).toContain("window.print()");
  });

  it("escapes HTML in untrusted fields", () => {
    const html = renderIdCardHtml({ ...baseIdCard(), insuredName: "<script>x</script>" });
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("eoi data assembly", () => {
  it("recognizes property lines that get an EOI", () => {
    expect(lobHasEoi("HOME")).toBe(true);
    expect(lobHasEoi("COMMERCIAL_PROPERTY")).toBe(true);
    expect(lobHasEoi("FLOOD")).toBe(true);
    expect(lobHasEoi("AUTO")).toBe(false);
  });

  it("chooses ACORD-27 vs ACORD-28 heading by line", () => {
    expect(eoiKindForLob("HOME")).toBe("EVIDENCE_OF_PROPERTY");
    expect(eoiKindForLob("COMMERCIAL_PROPERTY")).toBe("EVIDENCE_COMMERCIAL");
    expect(eoiHeading("EVIDENCE_COMMERCIAL")).toMatch(/commercial/i);
  });

  it("renders printable HTML with the dwelling limit + mortgagee", () => {
    const html = renderEoiHtml(baseEoi());
    expect(html).toContain("EVIDENCE OF PROPERTY INSURANCE");
    expect(html).toContain("EOI-2026-00001");
    expect(html).toContain("First Palmetto Bank");
    expect(html).toContain("$420,000");
    expect(html).toContain("FPB-2287740");
  });

  it("shows a fallback when no Coverage A limit is supplied", () => {
    const html = renderEoiHtml({ ...baseEoi(), coverageALimit: null });
    expect(html).toContain("Per policy terms");
  });
});

function baseIdCard(): IdCardInput {
  return {
    agencyName: "Tabor Agency",
    agencyPhone: "843-555-0100",
    carrierName: "Progressive",
    carrierPhone: "800-555-0410",
    naicCode: "12345",
    policyNumber: "PA-PRO-1001",
    insuredName: "Walter & Janet Simmons",
    effectiveDate: utc(2026, 1, 1),
    expirationDate: utc(2027, 1, 1),
    vehicles: [],
    coverages: [],
    lineOfBusiness: "AUTO",
  };
}

function baseEoi(): EoiInput {
  return {
    eoiNumber: "EOI-2026-00001",
    kind: "EVIDENCE_OF_PROPERTY",
    agencyName: "Tabor Agency",
    carrierName: "Travelers",
    naicCode: "25658",
    policyNumber: "HO-TRA-1000",
    effectiveDate: utc(2026, 1, 1),
    expirationDate: utc(2027, 1, 1),
    insuredName: "Walter & Janet Simmons",
    propertyAddress: "100 King St, Charleston SC 29401",
    coverageALimit: 420000,
    deductibleText: "$1,000",
    holderName: "First Palmetto Bank, ISAOA",
    holderInterestLabel: "Mortgagee",
    holderAddress: "200 Broad St, Charleston SC 29401",
    loanNumber: "FPB-2287740",
    remarks: "ISAOA/ATIMA",
    issuedAt: utc(2026, 6, 12),
    issuedByName: "Molly Reyes",
  };
}
