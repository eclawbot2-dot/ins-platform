/**
 * Dormant AI personalization hook (CLUSTER F).
 *
 * When ANTHROPIC_API_KEY is set AND TOUCHPOINT_AI=on, a thin wrapper can
 * rewrite a seeded template's copy into the client's tone before send. With
 * NO key (the default), maybePersonalizer() returns undefined and the engine
 * runs entirely on the deterministic seeded templates — zero behavior change.
 *
 * This NEVER blocks a send: renderEmail() already swallows any personalizer
 * failure and falls back to the seeded copy. The call here is a single
 * non-streaming Messages API request via raw fetch (no SDK dependency added
 * for a dormant feature). Model: claude-opus-4-8 with adaptive thinking.
 */

import { log } from "@/lib/log";
import type { MergeContext, Personalizer } from "@/lib/touchpoint-render";

const ANTHROPIC_MODEL = "claude-opus-4-8";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** Behind a flag + key. Returns undefined unless BOTH are present (fully dormant by default). */
export function maybePersonalizer(): Personalizer | undefined {
  const key = process.env.ANTHROPIC_API_KEY;
  const on = (process.env.TOUCHPOINT_AI ?? "").trim().toLowerCase();
  if (!key || on !== "on") return undefined;
  return personalizeWithClaude(key);
}

function personalizeWithClaude(apiKey: string): Personalizer {
  return async (ctx: MergeContext) => {
    const sys =
      "You lightly polish a warm, professional insurance-agency client email so it reads naturally for the named client. " +
      "Keep it kind, concise, and accurate. Do NOT invent facts, policies, prices, or dates. Preserve any {{merge}} tokens verbatim. " +
      'Reply ONLY with a JSON object: {"subject": "...", "body": "..."}.';
    const user =
      `Client: ${ctx.client.preferredName ?? ctx.client.firstName ?? ctx.client.name}\n` +
      `Agency: ${ctx.agency.name}\n\nRewrite this email warmly without changing its meaning.`;

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        thinking: { type: "adaptive" },
        system: sys,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = JSON.parse(text) as { subject?: string; body?: string };
    log.info("touchpoint AI rewrite applied", { module: "touchpoints" });
    return { subject: parsed.subject ?? "", body: parsed.body ?? "" };
  };
}
