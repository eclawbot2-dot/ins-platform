import { describe, it, expect } from "vitest";
import {
  coverageTemplateFor,
  coveragesForLob,
  riskItemsForLob,
  lobHasRiskItem,
  coverageLabelFor,
  RISK_ITEM_LABELS,
} from "@/lib/domain/coverage-templates";
import { ALL_LOBS, LOB_LABELS } from "@/lib/labels";
import type { LineOfBusiness } from "@prisma/client";

describe("coverageTemplateFor", () => {
  it("returns AUTO coverages + vehicle/driver risk items", () => {
    const t = coverageTemplateFor("AUTO");
    const codes = t.coverages.map((c) => c.code);
    expect(codes).toContain("BI");
    expect(codes).toContain("COMP");
    expect(codes).toContain("COLL");
    expect(codes).toContain("UM");
    expect(t.riskItems).toEqual(["vehicle", "driver"]);
  });

  it("HOME maps to Coverage A–F + dwelling + scheduled items", () => {
    const codes = coveragesForLob("HOME").map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(["COV_A", "COV_B", "COV_C", "COV_D", "COV_E", "COV_F"]));
    expect(riskItemsForLob("HOME")).toContain("dwelling");
    expect(riskItemsForLob("HOME")).toContain("scheduledItem");
  });

  it("CONDO uses Coverage A/C/E and a dwelling editor", () => {
    const codes = coveragesForLob("CONDO").map((c) => c.code);
    expect(codes).toContain("COV_A");
    expect(codes).toContain("LOSS_ASSESS");
    expect(lobHasRiskItem("CONDO", "dwelling")).toBe(true);
  });

  it("UMBRELLA is a bare limit with no risk items", () => {
    const t = coverageTemplateFor("UMBRELLA");
    expect(t.coverages.map((c) => c.code)).toContain("UMB_LIMIT");
    expect(t.riskItems).toEqual([]);
  });

  it("LIFE captures a face amount / term", () => {
    const codes = coveragesForLob("LIFE").map((c) => c.code);
    expect(codes).toContain("FACE");
    expect(codes).toContain("TERM");
    expect(riskItemsForLob("LIFE")).toEqual([]);
  });

  it("commercial GL maps to occurrence/aggregate + an insured location", () => {
    const codes = coveragesForLob("GENERAL_LIABILITY").map((c) => c.code);
    expect(codes).toContain("GL_OCC");
    expect(codes).toContain("GL_AGG");
    expect(lobHasRiskItem("GENERAL_LIABILITY", "location")).toBe(true);
  });

  it("BOAT carries watercraft risk items", () => {
    expect(lobHasRiskItem("BOAT", "watercraft")).toBe(true);
  });

  it("WORKERS_COMP includes statutory + E.L. limits", () => {
    const codes = coveragesForLob("WORKERS_COMP").map((c) => c.code);
    expect(codes).toContain("WC_STATUTORY");
    expect(codes).toContain("EL_ACCIDENT");
  });

  it("every LOB resolves to a non-empty coverage template", () => {
    for (const lob of ALL_LOBS) {
      const t = coverageTemplateFor(lob as LineOfBusiness);
      expect(t.coverages.length).toBeGreaterThan(0);
    }
  });

  it("every LOB has a display label", () => {
    for (const lob of ALL_LOBS) {
      expect(LOB_LABELS[lob as LineOfBusiness]).toBeTruthy();
    }
  });

  it("coverageLabelFor resolves codes within a line, null otherwise", () => {
    expect(coverageLabelFor("AUTO", "BI")).toBe("Bodily injury liability");
    expect(coverageLabelFor("AUTO", "NOPE")).toBeNull();
  });

  it("risk-item kinds all have human labels", () => {
    for (const kind of ["vehicle", "driver", "dwelling", "scheduledItem", "watercraft", "location"] as const) {
      expect(RISK_ITEM_LABELS[kind]).toBeTruthy();
    }
  });

  it("ERRORS_OMISSIONS mirrors the professional E&O schedule", () => {
    const eo = coveragesForLob("ERRORS_OMISSIONS").map((c) => c.code);
    expect(eo).toContain("EO_OCC");
    expect(eo).toContain("EO_AGG");
  });
});
