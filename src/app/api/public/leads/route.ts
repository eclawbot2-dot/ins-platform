import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { scoreLead } from "@/lib/domain/lead-scoring";
import { consumeRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { addDays } from "@/lib/domain/dates";
import type { LineOfBusiness } from "@prisma/client";

/**
 * Public lead-intake API — the marketing site (https://ins.jahdev.com)
 * posts here. Auth: header X-Lead-Key must match env LEAD_INTAKE_KEY or
 * an active DB-managed key (Settings → Lead intake keys).
 */

const ALLOWED_ORIGIN = "https://ins.jahdev.com";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Lead-Key",
  "Access-Control-Max-Age": "86400",
};

const LOBS: LineOfBusiness[] = [
  "AUTO", "HOME", "RENTERS", "UMBRELLA", "LIFE", "HEALTH",
  "GENERAL_LIABILITY", "COMMERCIAL_PROPERTY", "BOP", "WORKERS_COMP",
  "COMMERCIAL_AUTO", "CYBER", "PROFESSIONAL", "INLAND_MARINE",
];

const leadSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254).optional().or(z.literal("").transform(() => undefined)),
  phone: z.string().trim().max(40).optional().or(z.literal("").transform(() => undefined)),
  zip: z.string().trim().max(10).optional().or(z.literal("").transform(() => undefined)),
  lineOfBusiness: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => (v && (LOBS as string[]).includes(v) ? (v as LineOfBusiness) : undefined)),
  message: z.string().trim().max(5000).optional().or(z.literal("").transform(() => undefined)),
  source: z.string().trim().max(120).optional().or(z.literal("").transform(() => undefined)),
});

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

async function isValidKey(provided: string | null): Promise<boolean> {
  if (!provided) return false;
  const envKey = process.env.LEAD_INTAKE_KEY;
  if (envKey && provided === envKey) return true;
  const row = await prisma.leadIntakeKey.findUnique({ where: { key: provided } });
  if (row?.active) {
    prisma.leadIntakeKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {/* best-effort */});
    return true;
  }
  return false;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
  const limit = consumeRateLimit(`lead-intake:${ip}`, { limit: 30, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate limited" }, { status: 429, headers: CORS_HEADERS });
  }

  if (!(await isValidKey(req.headers.get("x-lead-key")))) {
    return NextResponse.json({ error: "invalid or missing X-Lead-Key" }, { status: 401, headers: CORS_HEADERS });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400, headers: CORS_HEADERS });
  }

  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 422, headers: CORS_HEADERS },
    );
  }
  const data = parsed.data;

  const score = scoreLead({
    email: data.email,
    phone: data.phone,
    zip: data.zip,
    message: data.message,
    lineOfBusiness: data.lineOfBusiness ?? null,
    source: data.source,
  });

  const lead = await prisma.lead.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      zip: data.zip,
      lineOfBusiness: data.lineOfBusiness,
      message: data.message,
      source: data.source ?? "website",
      score,
    },
  });

  // Follow-up task + notifications for admins so the lead gets worked.
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
  const firstAdmin = admins[0];
  await prisma.task.create({
    data: {
      title: `Follow up new web lead: ${data.firstName} ${data.lastName}`,
      detail: data.message ?? undefined,
      dueDate: addDays(new Date(), 1),
      priority: score >= 70 ? "HIGH" : "NORMAL",
      leadId: lead.id,
      assignedToId: firstAdmin?.id,
    },
  });
  await Promise.all(
    admins.map((a) =>
      prisma.notification.create({
        data: {
          userId: a.id,
          title: `New lead: ${data.firstName} ${data.lastName} (score ${score})`,
          href: `/leads/${lead.id}`,
        },
      }),
    ),
  ).catch(() => {/* best-effort */});

  log.info("public lead created", { module: "lead-intake", leadId: lead.id, score });
  return NextResponse.json({ ok: true, id: lead.id, score }, { status: 201, headers: CORS_HEADERS });
}
