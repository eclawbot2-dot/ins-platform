/**
 * DB integration test for the touchpoint engine. Runs against the local
 * Postgres (the same DB the app uses). Creates isolated fixtures, exercises
 * the evaluator/sender, and tears everything down — it never relies on or
 * mutates seeded rows beyond its own.
 *
 * Skips cleanly when DATABASE_URL is unset or the DB is unreachable so the
 * pure-fn suite still runs everywhere.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL ?? "postgresql://ins:ins_dev@127.0.0.1:5432/ins";
// The engine imports the app's prisma singleton, which requires DATABASE_URL.
process.env.DATABASE_URL ??= url;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

let dbUp = false;
const TAG = `tp-test-${Date.now()}`;
const ids = { tplBday: `${TAG}-bday`, clients: [] as string[] };

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    dbUp = false;
  }
  if (!dbUp) return;

  // A birthday template that fires today (offset 0) — deterministic anchor.
  const today = new Date();
  await prisma.touchpointTemplate.create({
    data: {
      key: ids.tplBday, name: "Test birthday", category: "APPRECIATION", channel: "EMAIL",
      triggerType: "BIRTHDAY", offsetDays: 0, subject: "Happy Birthday {{firstName}}",
      body: "Hi {{firstName}}, happy birthday!", active: true, requiresApproval: false,
    },
  });

  // Three clients with a birthday today: opted-in, appreciation-opted-out, do-not-contact.
  const dob = new Date(Date.UTC(1985, today.getUTCMonth(), today.getUTCDate()));
  for (const [label, prefs] of [
    ["in", { optAppreciation: true, doNotContact: false }],
    ["optout", { optAppreciation: false, doNotContact: false }],
    ["dnc", { optAppreciation: true, doNotContact: true }],
  ] as const) {
    const c = await prisma.client.create({
      data: {
        name: `${TAG}-${label}`, type: "INDIVIDUAL", status: "ACTIVE",
        firstName: "Test", lastName: label, email: `${TAG}-${label}@example.test`, dateOfBirth: dob,
        commPrefs: { create: prefs },
      },
    });
    ids.clients.push(c.id);
  }
}, 20000);

afterAll(async () => {
  if (dbUp) {
    await prisma.scheduledTouchpoint.deleteMany({ where: { templateKey: ids.tplBday } });
    await prisma.client.deleteMany({ where: { name: { startsWith: TAG } } });
    await prisma.touchpointTemplate.deleteMany({ where: { key: ids.tplBday } });
  }
  await prisma.$disconnect();
});

describe("touchpoint engine — DB integration", () => {
  it("schedules opted-in clients but never the do-not-contact client; double-run = no duplicates", async () => {
    if (!dbUp) return; // gracefully skipped without a DB
    const { evaluateTouchpoints } = await import("@/lib/touchpoint-engine");
    const asOf = new Date();

    await evaluateTouchpoints(asOf, false);
    await evaluateTouchpoints(asOf, false); // re-run must be a no-op (idempotency @unique)

    const rows = await prisma.scheduledTouchpoint.findMany({ where: { templateKey: ids.tplBday } });
    const byClient = new Map(rows.map((r) => [r.clientId, r]));

    // opted-in scheduled exactly once; do-not-contact never scheduled.
    const inId = ids.clients[0], optoutId = ids.clients[1], dncId = ids.clients[2];
    expect(byClient.has(inId)).toBe(true);
    expect(byClient.has(dncId)).toBe(false);

    // Exactly one row per scheduled client even after two runs.
    const inRows = rows.filter((r) => r.clientId === inId);
    expect(inRows.length).toBe(1);

    // The appreciation-opted-out client WAS scheduled (gate is at SEND, not schedule)
    // and is SKIPPED on the send sweep with a reason.
    expect(byClient.has(optoutId)).toBe(true);

    const { sendDueTouchpoints } = await import("@/lib/touchpoint-engine");
    await sendDueTouchpoints(asOf);

    const optoutRow = await prisma.scheduledTouchpoint.findFirst({ where: { templateKey: ids.tplBday, clientId: optoutId } });
    expect(optoutRow?.status).toBe("SKIPPED");
    expect((optoutRow?.failureReason ?? "").toLowerCase()).toContain("appreciation");

    // The opted-in client's row was sent (EMAIL_TRANSPORT=log → ok=true).
    const inRow = await prisma.scheduledTouchpoint.findFirst({ where: { templateKey: ids.tplBday, clientId: inId } });
    expect(inRow?.status).toBe("SENT");
  }, 30000);
});
