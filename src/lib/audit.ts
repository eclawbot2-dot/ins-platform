import { prisma } from "@/lib/prisma";
import { log } from "@/lib/log";

/**
 * Append an audit-log row. Best-effort: never throws, never blocks the
 * mutation it documents. Logins + critical changes (user admin, policy
 * binds/cancels, integration connects, settings edits) are audited.
 */
export async function audit(args: {
  userId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  detail?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: args.userId ?? null,
        actorEmail: args.actorEmail ?? null,
        action: args.action,
        entityType: args.entityType,
        entityId: args.entityId,
        detail: args.detail,
      },
    });
  } catch (err) {
    log.warn("audit write failed", { module: "audit", action: args.action }, err);
  }
}
