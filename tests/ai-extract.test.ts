import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the Anthropic client factory so no real network/key is needed.
// We control getAiClient() / aiEnabled() per test.
const parseMock = vi.fn();

vi.mock("@/lib/ai/client", () => ({
  AI_MODEL: "claude-opus-4-8",
  aiEnabled: () => aiEnabledFlag,
  getAiClient: () => (aiEnabledFlag ? { messages: { parse: parseMock } } : null),
}));

let aiEnabledFlag = true;

import { extractPolicy } from "@/lib/ai/extract";
import { ExtractedPolicySchema } from "@/lib/ai/extract";

const VALID_POLICY = {
  lineOfBusiness: "AUTO",
  carrierName: "Travelers",
  policyNumber: "PA-12345",
  namedInsureds: ["Jane Doe"],
  effectiveDate: "2026-01-01",
  expirationDate: "2027-01-01",
  totalPremium: 1800,
  coverages: [
    {
      code: "BI",
      label: "Bodily injury",
      limitAmount: null,
      limitText: "100/300",
      perOccurrence: null,
      aggregate: null,
      deductibleAmount: null,
      deductibleText: null,
      premiumPart: null,
    },
  ],
  vehicles: ["2022 Toyota Camry"],
  dwellingAddress: null,
  dwellingReplacementCost: null,
  scheduledItems: [],
  notes: null,
};

beforeEach(() => {
  parseMock.mockReset();
  aiEnabledFlag = true;
});

describe("extractPolicy — graceful degradation", () => {
  it("returns no_key (never throws) when no API key is configured", async () => {
    aiEnabledFlag = false;
    const res = await extractPolicy({ kind: "text", text: "Auto policy 100/300 BI" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("no_key");
  });

  it("maps an Anthropic API error to api_error (never throws)", async () => {
    // Simulate a thrown error from the SDK.
    parseMock.mockRejectedValueOnce(new Error("boom"));
    const res = await extractPolicy({ kind: "text", text: "..." });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("api_error");
  });

  it("returns parse_failed when the model yields no structured output", async () => {
    parseMock.mockResolvedValueOnce({ parsed_output: null });
    const res = await extractPolicy({ kind: "text", text: "..." });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("parse_failed");
  });
});

describe("extractPolicy — happy path + request shape", () => {
  it("returns the parsed policy and sends the expected request shape", async () => {
    parseMock.mockResolvedValueOnce({ parsed_output: VALID_POLICY });
    const res = await extractPolicy({ kind: "text", text: "Auto policy details" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.policy.lineOfBusiness).toBe("AUTO");
      expect(res.policy.coverages[0]!.limitText).toBe("100/300");
    }

    // Assert the prompt shape: model, adaptive thinking, structured output.
    const call = parseMock.mock.calls[0]![0];
    expect(call.model).toBe("claude-opus-4-8");
    expect(call.thinking).toEqual({ type: "adaptive" });
    expect(call.system).toMatch(/insurance analyst/i);
    expect(call.output_config?.format).toBeDefined();
    expect(call.messages[0].role).toBe("user");
  });

  it("sends a PDF as a document content block", async () => {
    parseMock.mockResolvedValueOnce({ parsed_output: VALID_POLICY });
    await extractPolicy({ kind: "pdf", base64: "ABC123" });
    const content = parseMock.mock.calls[0]![0].messages[0].content;
    expect(content[0].type).toBe("document");
    expect(content[0].source.media_type).toBe("application/pdf");
  });

  it("sends an image as an image content block", async () => {
    parseMock.mockResolvedValueOnce({ parsed_output: VALID_POLICY });
    await extractPolicy({ kind: "image", base64: "ABC123", mediaType: "image/png" });
    const content = parseMock.mock.calls[0]![0].messages[0].content;
    expect(content[0].type).toBe("image");
    expect(content[0].source.media_type).toBe("image/png");
  });
});

describe("ExtractedPolicySchema", () => {
  it("validates a well-formed policy object", () => {
    const parsed = ExtractedPolicySchema.safeParse(VALID_POLICY);
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown line of business value", () => {
    const bad = { ...VALID_POLICY, lineOfBusiness: "SPACESHIP" };
    expect(ExtractedPolicySchema.safeParse(bad).success).toBe(false);
  });
});
