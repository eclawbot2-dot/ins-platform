import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { audit } from "@/lib/audit";
import { evaluateTouchpoints, sendDueTouchpoints, type SendResult } from "@/lib/touchpoint-engine";

/**
 * Raise an in-app alert to every admin when a send sweep degraded — sends
 * failed, or rows were selected but none went out (a transport/config
 * outage, e.g. log-only in prod). Best-effort: never throws.
 */
async function alertAdminsOnSendFailure(send: SendResult): Promise<void> {
  const failureMode =
    send.failed > 0
      ? `${send.failed} send${send.failed === 1 ? "" : "s"} failed`
      : send.selected > 0 && send.sent === 0
        ? `${send.selected} touchpoint${send.selected === 1 ? "" : "s"} were due but none sent (transport/config outage?)`
        : null;
  if (!failureMode) return;

  log.error(`touchpoint send sweep degraded: ${failureMode}`, {
    module: "touchpoints",
    selected: send.selected,
    sent: send.sent,
    failed: send.failed,
    skipped: send.skipped,
  });
  await audit({
    action: "TOUCHPOINT_CRON_ALERT",
    entityType: "ScheduledTouchpoint",
    detail: failureMode,
  });
  try {
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    if (admins.length === 0) return;
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        title: "Touchpoint sends are failing",
        body: `${failureMode}. Check the email transport configuration and the touchpoint queue.`,
        href: "/touchpoints",
      })),
    });
  } catch (err) {
    log.warn("touchpoint cron: admin alert write failed", { module: "touchpoints" }, err);
  }
}

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

  // Durable last-run / heartbeat signal: the audit row below is the queryable
  // record of every cron fire (action TOUCHPOINT_CRON_RUN). lastRunAt is also
  // echoed in the response for any external heartbeat monitor.
  const lastRunAt = asOf.toISOString();
  await audit({
    action: dryRun ? "TOUCHPOINT_CRON_DRYRUN" : "TOUCHPOINT_CRON_RUN",
    entityType: "ScheduledTouchpoint",
    detail: `evaluated ${evaluate.due} due / ${evaluate.created} scheduled; sent ${send.sent}, skipped ${send.skipped}, failed ${send.failed}`,
  });
  log.info("touchpoints cron complete", { module: "touchpoints", dryRun, evaluate, send });

  // Alert admins when the send sweep degraded (failures, or due-but-none-sent).
  if (!dryRun) await alertAdminsOnSendFailure(send);

  return NextResponse.json({ ok: true, dryRun, lastRunAt, evaluate, send }, { status: 200 });
}
