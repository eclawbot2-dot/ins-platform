import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { consumeRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { audit } from "@/lib/audit";
import { evaluateTouchpoints, sendDueTouchpoints } from "@/lib/touchpoint-engine";

/**
 * Daily touchpoint engine — EVALUATE (scan the book, schedule due
 * touchpoints) then SEND SWEEP (render + email the APPROVED, due rows).
 *
 * Auth: header X-Cron-Key must equal env CRON_KEY. If CRON_KEY is unset the
 * route 503s safely (never runs unauthenticated). Idempotent: the @unique
 * idempotencyKey on ScheduledTouchpoint makes re-runs no-ops, so a duplicate
 * cron fire never double-schedules or double-sends.
 *
 * Body { dryRun?: boolean } (or ?dryRun=1) — counts due touchpoints and sends
 * nothing (neither schedules nor emails).
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ dryRun: z.boolean().optional() }).optional();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
  const limit = consumeRateLimit(`touchpoints-cron:${ip}`, { limit: 12, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const cronKey = process.env.CRON_KEY;
  if (!cronKey) {
    log.warn("touchpoints cron hit but CRON_KEY unset — refusing", { module: "touchpoints" });
    return NextResponse.json({ error: "CRON_KEY not configured" }, { status: 503 });
  }
  if (req.headers.get("x-cron-key") !== cronKey) {
    return NextResponse.json({ error: "invalid or missing X-Cron-Key" }, { status: 401 });
  }

  let body: unknown = undefined;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : undefined;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  const queryDry = req.nextUrl.searchParams.get("dryRun");
  const dryRun = parsed.success ? Boolean(parsed.data?.dryRun) || queryDry === "1" : queryDry === "1";

  const asOf = new Date();
  const evaluate = await evaluateTouchpoints(asOf, dryRun);
  const send = dryRun ? { selected: 0, sent: 0, skipped: 0, failed: 0 } : await sendDueTouchpoints(asOf);

  await audit({
    action: dryRun ? "TOUCHPOINT_CRON_DRYRUN" : "TOUCHPOINT_CRON_RUN",
    entityType: "ScheduledTouchpoint",
    detail: `evaluated ${evaluate.due} due / ${evaluate.created} scheduled; sent ${send.sent}, skipped ${send.skipped}, failed ${send.failed}`,
  });
  log.info("touchpoints cron complete", { module: "touchpoints", dryRun, evaluate, send });

  return NextResponse.json({ ok: true, dryRun, evaluate, send }, { status: 200 });
}
