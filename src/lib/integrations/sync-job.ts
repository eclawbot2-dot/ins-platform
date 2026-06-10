/**
 * SyncJob state-machine wrapper. Wraps every concrete sync routine so
 * we get a consistent RUNNING -> OK | FAILED | PARTIAL transition and
 * a single place to surface errors. Adapted from gcon.
 */

import { prisma } from "@/lib/prisma";

export type SyncJobResult = {
  recordsRead: number;
  recordsWritten: number;
  partial?: boolean;
  cursor?: string | null;
};

/**
 * Window inside which a RUNNING job of the same (connection, kind)
 * blocks a new run — double-clicked "Sync now" + overlapping cron
 * otherwise launch duplicate provider pulls.
 */
const IN_FLIGHT_WINDOW_MS = 10 * 60 * 1000;

export async function runSyncJob<T extends SyncJobResult>(
  connectionId: string,
  kind: string,
  body: () => Promise<T>,
): Promise<{ job: { id: string; status: "OK" | "FAILED" | "PARTIAL" }; result: T | null; error?: string; skipped?: boolean }> {
  const inFlight = await prisma.syncJob.findFirst({
    where: {
      connectionId,
      kind,
      status: "RUNNING",
      startedAt: { gte: new Date(Date.now() - IN_FLIGHT_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (inFlight) {
    return {
      job: { id: inFlight.id, status: "OK" },
      result: null,
      error: `a ${kind} sync is already running for this connection`,
      skipped: true,
    };
  }

  const job = await prisma.syncJob.create({
    data: { connectionId, kind, status: "RUNNING" },
  });

  try {
    const result = await body();
    const status = result.partial ? "PARTIAL" : "OK";
    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status,
        completedAt: new Date(),
        recordsRead: result.recordsRead,
        recordsWritten: result.recordsWritten,
        cursor: result.cursor ?? null,
      },
    });
    await prisma.integrationConnection.update({
      where: { id: connectionId },
      data: { lastSyncedAt: new Date(), lastSyncNote: `${kind}: r=${result.recordsRead} w=${result.recordsWritten}` },
    });
    return { job: { id: job.id, status }, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "FAILED", completedAt: new Date(), error: message },
    });
    await prisma.integrationConnection.update({
      where: { id: connectionId },
      data: { status: "ERROR", lastSyncNote: `${kind} failed: ${message}` },
    });
    return { job: { id: job.id, status: "FAILED" }, result: null, error: message };
  }
}

export async function getCursor(connectionId: string, kind: string): Promise<string | null> {
  const row = await prisma.syncCursor.findUnique({
    where: { connectionId_kind: { connectionId, kind } },
  });
  return row?.cursor ?? null;
}

export async function setCursor(connectionId: string, kind: string, cursor: string): Promise<void> {
  await prisma.syncCursor.upsert({
    where: { connectionId_kind: { connectionId, kind } },
    update: { cursor },
    create: { connectionId, kind, cursor },
  });
}
