/**
 * Anthropic client factory for the AI Compare / coverage-analysis tool.
 *
 * The whole feature DEGRADES GRACEFULLY: with no ANTHROPIC_API_KEY set
 * (the default), `getAiClient()` returns null and every caller falls
 * back to the deterministic gap-rule engine + a manual-review queue. The
 * moment the key lands in the environment the extraction path lights up
 * automatically — no code change, no migration.
 *
 * Model: claude-opus-4-8 (override with AI_MODEL). Adaptive thinking.
 * Never temperature / budget_tokens on this model.
 */

import Anthropic from "@anthropic-ai/sdk";

/** The model id — exactly `claude-opus-4-8`, env-overridable. */
export const AI_MODEL = process.env.AI_MODEL?.trim() || "claude-opus-4-8";

/** True iff the AI extraction path is configured. */
export function aiEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

let cached: Anthropic | null = null;

/**
 * Returns a configured Anthropic client, or null when no key is set.
 * Callers MUST treat null as "run in degraded/manual-review mode".
 */
export function getAiClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  if (!cached) {
    cached = new Anthropic({ apiKey: key, maxRetries: 2 });
  }
  return cached;
}
