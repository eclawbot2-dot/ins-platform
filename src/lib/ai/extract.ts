/**
 * AI policy extraction — turn an uploaded declarations page (PDF/image)
 * or pasted text into a validated, structured policy object.
 *
 * Uses the Anthropic SDK's structured-output path:
 *   client.messages.parse({ output_config: { format: zodOutputFormat(schema) } })
 * so the model's reply is validated against `ExtractedPolicySchema` before
 * it ever reaches our code. PDF input goes in a `document` content block,
 * images in an `image` block (base64); pasted text is a plain text block.
 *
 * DEGRADES GRACEFULLY: every failure mode — no API key, a malformed reply,
 * an Anthropic API error — is caught and surfaced as a typed result the
 * caller maps to the pending / manual-review path. This module NEVER
 * throws to the request handler.
 *
 * Model: claude-opus-4-8, adaptive thinking, streaming-safe via parse().
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAiClient, AI_MODEL } from "@/lib/ai/client";
import { log } from "@/lib/log";

// Line-of-business values the model may choose from (mirrors the Prisma
// enum). Kept as a plain string so the schema stays structured-output safe.
const LOB_VALUES = [
  "AUTO", "HOME", "RENTERS", "UMBRELLA", "LIFE", "HEALTH", "CONDO", "FLOOD",
  "MOTORCYCLE", "BOAT", "RV", "VALUABLE_ARTICLES", "PET", "IDENTITY_THEFT",
  "GENERAL_LIABILITY", "COMMERCIAL_PROPERTY", "BOP", "WORKERS_COMP",
  "COMMERCIAL_AUTO", "CYBER", "PROFESSIONAL", "INLAND_MARINE",
  "ERRORS_OMISSIONS", "COMMERCIAL_UMBRELLA", "DIRECTORS_OFFICERS", "EPLI",
  "LIQUOR_LIABILITY", "SURETY_BONDS", "GARAGE", "BUILDERS_RISK", "UNKNOWN",
] as const;

const ExtractedCoverageSchema = z.object({
  code: z.string().nullable().describe("Template coverage code if recognizable (e.g. BI, PD, UM, COV_A, GL_OCC); null if unknown."),
  label: z.string().describe("Human label of the coverage line as it appears on the dec page."),
  limitAmount: z.number().nullable().describe("Single dollar limit, if the coverage has one number. null otherwise."),
  limitText: z.string().nullable().describe("Limit as text when it isn't a single number, e.g. '100/300/100' or 'Replacement cost'."),
  perOccurrence: z.number().nullable().describe("Per-occurrence dollar limit for liability coverages; null if N/A."),
  aggregate: z.number().nullable().describe("Aggregate dollar limit for liability coverages; null if N/A."),
  deductibleAmount: z.number().nullable().describe("Deductible in dollars; null if N/A."),
  deductibleText: z.string().nullable().describe("Deductible as text (e.g. '2% of Cov A'); null if a plain dollar amount or N/A."),
  premiumPart: z.number().nullable().describe("Premium attributable to this coverage in dollars, if itemized; null otherwise."),
});

export const ExtractedPolicySchema = z.object({
  lineOfBusiness: z.enum(LOB_VALUES).describe("Best single line of business for this policy. Use UNKNOWN only if truly indeterminate."),
  carrierName: z.string().nullable().describe("Insurance carrier / company name."),
  policyNumber: z.string().nullable().describe("Policy number, if shown."),
  namedInsureds: z.array(z.string()).describe("Named insured(s) on the policy."),
  effectiveDate: z.string().nullable().describe("Policy effective date as an ISO date (YYYY-MM-DD) if determinable; null otherwise."),
  expirationDate: z.string().nullable().describe("Policy expiration date as an ISO date (YYYY-MM-DD) if determinable; null otherwise."),
  totalPremium: z.number().nullable().describe("Total annual premium in dollars, if shown."),
  coverages: z.array(ExtractedCoverageSchema).describe("Every coverage / limit line found on the declarations."),
  vehicles: z.array(z.string()).describe("Vehicles listed (year/make/model or VIN), if an auto policy. Empty otherwise."),
  dwellingAddress: z.string().nullable().describe("Insured property address for a property policy; null otherwise."),
  dwellingReplacementCost: z.number().nullable().describe("Estimated dwelling replacement cost in dollars, if shown; null otherwise."),
  scheduledItems: z.array(z.string()).describe("Scheduled / itemized personal property (jewelry, art), if any."),
  notes: z.string().nullable().describe("Any exposure-relevant notes you can infer (coastal, flood zone, business use, teen driver); null if none."),
});

export type ExtractedPolicy = z.infer<typeof ExtractedPolicySchema>;

const SYSTEM_PROMPT =
  "You are an expert insurance analyst extracting structured data from a policy declarations page. " +
  "Read the provided document/image/text carefully and extract EVERY coverage line, limit, deductible, " +
  "and the named insureds, carrier, policy period, and line of business. " +
  "Map coverage labels to the standard codes when you recognize them: auto — BI (bodily injury), PD (property damage), " +
  "UM (uninsured/underinsured motorist), MED (medical payments), COMP (comprehensive), COLL (collision); " +
  "homeowners — COV_A (dwelling), COV_B (other structures), COV_C (personal property), COV_D (loss of use), " +
  "COV_E (personal liability), COV_F (medical payments); general liability — GL_OCC (each occurrence), GL_AGG (aggregate). " +
  "Use null for any field you cannot determine — DO NOT invent limits, dates, or premiums. " +
  "For split auto liability limits, put the text form (e.g. '100/300/100') in limitText. " +
  "Return strictly the structured object requested.";

/** What the upload looks like to the extractor. */
export type ExtractInput =
  | { kind: "pdf"; base64: string }
  | { kind: "image"; base64: string; mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" }
  | { kind: "text"; text: string };

export type ExtractResult =
  | { ok: true; policy: ExtractedPolicy }
  | { ok: false; reason: "no_key" | "parse_failed" | "api_error"; message: string };

function buildContent(input: ExtractInput): Anthropic.Messages.ContentBlockParam[] {
  const instruction: Anthropic.Messages.TextBlockParam = {
    type: "text",
    text:
      "Extract the structured policy data from the attached insurance declarations. " +
      "Capture all coverages with their limits and deductibles.",
  };
  if (input.kind === "pdf") {
    return [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: input.base64 } },
      instruction,
    ];
  }
  if (input.kind === "image") {
    return [
      { type: "image", source: { type: "base64", media_type: input.mediaType, data: input.base64 } },
      instruction,
    ];
  }
  return [{ type: "text", text: `Policy declarations text:\n\n${input.text}` }, instruction];
}

/**
 * Extract a structured policy from an upload or text. Returns a typed
 * result — never throws. On `ok: false` the caller routes to the
 * pending / manual-review path.
 */
export async function extractPolicy(input: ExtractInput): Promise<ExtractResult> {
  const client = getAiClient();
  if (!client) {
    return { ok: false, reason: "no_key", message: "ANTHROPIC_API_KEY not configured" };
  }

  try {
    const message = await client.messages.parse({
      model: AI_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildContent(input) }],
      output_config: { format: zodOutputFormat(ExtractedPolicySchema) },
    });

    const parsed = message.parsed_output;
    if (!parsed) {
      log.warn("AI extract: empty parsed_output", { module: "ai-compare" });
      return { ok: false, reason: "parse_failed", message: "Model returned no structured output" };
    }
    log.info("AI extract succeeded", {
      module: "ai-compare",
      lob: parsed.lineOfBusiness,
      coverages: parsed.coverages.length,
    });
    return { ok: true, policy: parsed };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      log.warn("AI extract: Anthropic API error", { module: "ai-compare", status: err.status }, err);
      return { ok: false, reason: "api_error", message: `Anthropic ${err.status}: ${err.message}` };
    }
    log.warn("AI extract: unexpected error", { module: "ai-compare" }, err);
    return { ok: false, reason: "api_error", message: err instanceof Error ? err.message : String(err) };
  }
}
