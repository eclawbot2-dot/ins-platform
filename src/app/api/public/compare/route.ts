import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { scoreLead } from "@/lib/domain/lead-scoring";
import { addDays } from "@/lib/domain/dates";
import { runUploadAnalysis } from "@/lib/ai/analysis-service";
import { MAX_UPLOAD_BYTES, isAllowedMime } from "@/lib/storage";
import { log } from "@/lib/log";
import { ALL_LOBS } from "@/lib/labels";
import type { LineOfBusiness } from "@prisma/client";

/**
 * Public AI Compare / coverage-checkup intake — the lead-gen funnel.
 * Anyone can submit their current policy (a PDF/image upload OR pasted
 * coverage details) plus contact info. We:
 *   1. rate-limit + honeypot the request (no auth needed — this is the
 *      public funnel that the marketing /coverage-checkup page links to),
 *   2. create a Lead (source=coverage-checkup) + a follow-up staff Task,
 *   3. run the analysis pipeline (extract → analyze) — which degrades to
 *      a PENDING/MANUAL_REVIEW row when no ANTHROPIC_API_KEY is set,
 *   4. return the analysis id so the browser can show the results page.
 *
 * Public endpoints are rate-limited + honeypot-gated (mirrors the leads
 * API). Multipart so a real file can be attached.
 */

const ALLOWED_ORIGIN = "https://ins-website-sandy.vercel.app";
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// FormData fields are string | File | null. Normalize each to a string
// (absent → "") before validation so an unfilled optional field doesn't
// look like a `null` type error.
const str = (v: FormDataEntryValue | null): string => (typeof v === "string" ? v : "");

const fieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().max(254).refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "invalid email"),
  phone: z.string().trim().max(40),
  zip: z.string().trim().max(10),
  lineOfBusiness: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => (v && (ALL_LOBS as string[]).includes(v) ? (v as LineOfBusiness) : undefined)),
  // Pasted coverage details (alternative to an uploaded file).
  details: z.string().trim().max(20000),
  // Honeypot — bots fill it, humans never see it.
  website: z.string(),
});

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "?";
  const limit = consumeRateLimit(`compare:${ip}`, { limit: 20, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate limited" }, { status: 429, headers: CORS_HEADERS });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400, headers: CORS_HEADERS });
  }

  const parsed = fieldsSchema.safeParse({
    name: str(form.get("name")),
    email: str(form.get("email")),
    phone: str(form.get("phone")),
    zip: str(form.get("zip")),
    lineOfBusiness: str(form.get("lineOfBusiness")),
    details: str(form.get("details")),
    website: str(form.get("website")),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 422, headers: CORS_HEADERS },
    );
  }
  const raw = parsed.data;
  // Collapse empty strings to undefined for clean optional handling.
  const data = {
    name: raw.name,
    email: raw.email || undefined,
    phone: raw.phone || undefined,
    zip: raw.zip || undefined,
    lineOfBusiness: raw.lineOfBusiness,
    details: raw.details || undefined,
    website: raw.website,
  };

  // Honeypot: silently accept (200) so bots don't learn, but do nothing.
  if (data.website && data.website.trim() !== "") {
    log.info("AI compare: honeypot tripped", { module: "ai-compare", ip });
    return NextResponse.json({ ok: true }, { status: 200, headers: CORS_HEADERS });
  }

  const fileEntry = form.get("file");
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;
  if (file) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "file exceeds 25 MB" }, { status: 413, headers: CORS_HEADERS });
    }
    if (!isAllowedMime(file.type || "application/octet-stream")) {
      return NextResponse.json({ error: `file type ${file.type} not allowed` }, { status: 415, headers: CORS_HEADERS });
    }
  }
  if (!file && !data.details) {
    return NextResponse.json(
      { error: "attach a policy file or paste your coverage details" },
      { status: 422, headers: CORS_HEADERS },
    );
  }

  // 1. Split the name for the Lead record.
  const [firstName, ...rest] = data.name.split(/\s+/);
  const lastName = rest.join(" ") || "(web)";

  const score = scoreLead({
    email: data.email,
    phone: data.phone,
    zip: data.zip,
    message: data.details,
    lineOfBusiness: data.lineOfBusiness ?? null,
    source: "coverage-checkup",
  });

  const lead = await prisma.lead.create({
    data: {
      firstName: firstName || data.name,
      lastName,
      email: data.email,
      phone: data.phone,
      zip: data.zip,
      lineOfBusiness: data.lineOfBusiness,
      message: data.details ?? "Coverage checkup submission",
      source: "coverage-checkup",
      score,
    },
  });

  // 2. Run the analysis pipeline (degrades gracefully).
  const outcome = await runUploadAnalysis({
    source: "PUBLIC_UPLOAD",
    file,
    text: data.details ?? null,
    uploaderName: data.name,
    uploaderEmail: data.email ?? null,
    lineHint: data.lineOfBusiness ?? null,
    leadId: lead.id,
  });

  // 3. Follow-up staff task + admin notifications so it gets worked.
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
  const firstAdmin = admins[0];
  await prisma.task.create({
    data: {
      title: `Coverage checkup: ${data.name}`,
      detail:
        outcome.status === "ANALYZED"
          ? `Free coverage report generated (score ${outcome.degraded ? "rules-based" : "AI"}). Review and reach out.`
          : "Policy submitted for a free coverage report — analysis pending review.",
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
          title: `Coverage checkup: ${data.name} (lead score ${score})`,
          href: `/tools/coverage-analysis/${outcome.analysisId}`,
        },
      }),
    ),
  ).catch(() => {/* best-effort */});

  log.info("AI compare: public submission", {
    module: "ai-compare",
    leadId: lead.id,
    analysisId: outcome.analysisId,
    status: outcome.status,
  });

  return NextResponse.json(
    { ok: true, analysisId: outcome.analysisId, status: outcome.status },
    { status: 201, headers: CORS_HEADERS },
  );
}
