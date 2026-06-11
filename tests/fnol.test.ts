import { describe, it, expect } from "vitest";
import { FNOL_MIN_DESCRIPTION, validateFnol } from "@/lib/domain/fnol";

const NOW = new Date("2026-06-11T12:00:00.000Z");
const OWNED = ["pol-1", "pol-2"];
const GOOD = {
  policyId: "pol-1",
  dateOfLoss: new Date("2026-06-01T00:00:00.000Z"),
  description: "Wind damage to the roof during a storm.",
};

describe("validateFnol", () => {
  it("accepts a complete, owned submission and trims the description", () => {
    const r = validateFnol({ ...GOOD, description: `  ${GOOD.description}  ` }, OWNED, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.policyId).toBe("pol-1");
      expect(r.value.description).toBe(GOOD.description);
    }
  });

  it("rejects a policy the client does not own (forged form policyId)", () => {
    const r = validateFnol({ ...GOOD, policyId: "someone-elses-policy" }, OWNED, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/your policies/i);
  });

  it("rejects empty / missing policy and date", () => {
    expect(validateFnol({ ...GOOD, policyId: "" }, OWNED, NOW).ok).toBe(false);
    expect(validateFnol({ ...GOOD, dateOfLoss: null }, OWNED, NOW).ok).toBe(false);
    expect(validateFnol({ ...GOOD, dateOfLoss: new Date("invalid") }, OWNED, NOW).ok).toBe(false);
  });

  it("rejects a future date of loss", () => {
    const r = validateFnol({ ...GOOD, dateOfLoss: new Date("2026-06-12T00:00:00.000Z") }, OWNED, NOW);
    expect(r.ok).toBe(false);
  });

  it("rejects a loss further back than the lookback window", () => {
    const r = validateFnol({ ...GOOD, dateOfLoss: new Date("2020-01-01T00:00:00.000Z") }, OWNED, NOW);
    expect(r.ok).toBe(false);
  });

  it("requires a minimal description", () => {
    const r = validateFnol({ ...GOOD, description: "short" }, OWNED, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(String(FNOL_MIN_DESCRIPTION));
  });
});
