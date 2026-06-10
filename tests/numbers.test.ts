import { describe, it, expect } from "vitest";
import { formatRefNumber, parseRefSeq, nextRefNumber, REF_PREFIXES } from "@/lib/domain/numbers";

describe("formatRefNumber", () => {
  it("zero-pads the sequence", () => {
    expect(formatRefNumber("CLM", 2026, 7)).toBe("CLM-2026-00007");
  });
  it("supports custom padding", () => {
    expect(formatRefNumber("X", 2026, 42, 3)).toBe("X-2026-042");
  });
});

describe("parseRefSeq", () => {
  it("round-trips with formatRefNumber", () => {
    expect(parseRefSeq("CLM-2026-00007", "CLM")).toBe(7);
  });
  it("returns null for foreign formats", () => {
    expect(parseRefSeq("INV-2026-00007", "CLM")).toBeNull();
    expect(parseRefSeq("garbage", "CLM")).toBeNull();
  });
});

describe("nextRefNumber", () => {
  it("starts at 1 with no history", () => {
    expect(nextRefNumber("COI", [], 2026)).toBe("COI-2026-00001");
  });
  it("increments past the max in the same year", () => {
    expect(nextRefNumber("COI", ["COI-2026-00002", "COI-2026-00009"], 2026)).toBe("COI-2026-00010");
  });
  it("resets per year", () => {
    expect(nextRefNumber("COI", ["COI-2025-00031"], 2026)).toBe("COI-2026-00001");
  });
  it("ignores other prefixes", () => {
    expect(nextRefNumber("INV", ["CLM-2026-00044"], 2026)).toBe("INV-2026-00001");
  });
  it("exposes the platform prefixes", () => {
    expect(REF_PREFIXES).toMatchObject({ claim: "CLM", certificate: "COI", invoice: "INV" });
  });
});
