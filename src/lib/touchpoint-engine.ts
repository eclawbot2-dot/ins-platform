/**
 * Customer-appreciation / lifecycle-touchpoint engine (DB-bound glue).
 *
 *   - buildMergeContext: assemble a typed MergeContext for one client.
 *   - evaluateTouchpoints: scan the book per active template and UPSERT
 *     ScheduledTouchpoint rows (idempotency-key @unique → never double).
 *   - sendDueTouchpoints: render + send APPROVED rows that are due,
 *     re-checking opt-out / do-not-contact / quiet-hours at send time.
 *   - scheduleTouchpoint: real-time lifecycle-event insert helper.
 *
 * Compliance (CAN-SPAM) is enforced HERE, not just in the UI: every email
 * carries an unsubscribe link + sender identity, per-category opt-out and
 * global doNotContact are honored at send, and SMS (dormant) additionally
 * gates on quiet-hours + smsConsentAt.
 */

import { prisma } from "@/lib/prisma";
import { log } from "@/lib/log";
import { BRAND } from "@/lib/brand";
import { sendEmail } from "@/lib/email";
import { audit } from "@/lib/audit";
import { portalBaseUrl } from "@/lib/app-url";
import { fmtDate } from "@/lib/domain/dates";
import { fmtMoneyCents, toNum } from "@/lib/money";
import { LOB_LABELS } from "@/lib/labels";
import {
  dueTouchpoints,
  categoryOptedIn,
  isQuietHour,
  monthsBetween,
  type ClientTouchpointCtx,
  type CommPrefsLike,
} from "@/lib/domain/touchpoints";
import {
  isHouseholdDedupCategory,
  dedupHouseholdRecipients,
  householdRoleRank,
} from "@/lib/domain/household";
import {
  renderEmail,
  type MergeContext,
  type Personalizer,
} from "@/lib/touchpoint-render";
import { maybePersonalizer } from "@/lib/touchpoint-ai";
import type { TouchpointTemplate, TouchpointStatus, LineOfBusiness } from "@prisma/client";

// ── Agency profile (sender identity) ─────────────────────────────────

async function agencyIdentity(): Promise<MergeContext["agency"]> {
  const a = await prisma.agencyProfile.findUnique({ where: { id: "agency" } });
  const addressParts = [a?.addressLine1, a?.addressLine2, [a?.city, a?.state, a?.zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return {
    name: a?.name ?? BRAND.name,
    phone: a?.phone ?? BRAND.phone,
    email: a?.email ?? BRAND.email,
    address: addressParts || null,
  };
}

// ── Merge context ────────────────────────────────────────────────────

type ClientForMerge = {
  id: string;
  name: string;
  preferredName: string | null;
  firstName: string | null;
  email: string | null;
  createdAt: Date;
  producer: { name: string } | null;
  csr: { name: string } | null;
  commPrefs: { unsubscribeToken: string } | null;
};

export function unsubscribeUrlFor(token: string): string {
  return `${portalBaseUrl()}/unsubscribe?token=${encodeURIComponent(token)}`;
}

export async function buildMergeContext(
  client: ClientForMerge,
  agency: MergeContext["agency"],
  related?: {
    policy?: { policyNumber: string; lineOfBusiness: LineOfBusiness; carrierName?: string; expirationDate?: Date; effectiveDate?: Date } | null;
    invoice?: { invoiceNumber: string; amount: unknown; dueDate: Date; xeroPaymentUrl?: string | null } | null;
    claim?: { claimNumber: string; status?: string; dateOfLoss?: Date } | null;
    holidayName?: string | null;
  },
): Promise<MergeContext> {
  const token = client.commPrefs?.unsubscribeToken ?? "";
  const tenureYears = Math.max(0, Math.floor(monthsBetween(client.createdAt, new Date()) / 12));
  return {
    client: { name: client.name, preferredName: client.preferredName, firstName: client.firstName, email: client.email },
    agency,
    producerName: client.producer?.name ?? null,
    csrName: client.csr?.name ?? null,
    tenureYears: String(tenureYears),
    holidayName: related?.holidayName ?? null,
    portalUrl: portalBaseUrl() + "/portal",
    payNowUrl: related?.invoice?.xeroPaymentUrl ?? null,
    unsubscribeUrl: unsubscribeUrlFor(token),
    policy: related?.policy
      ? {
          policyNumber: related.policy.policyNumber,
          lineOfBusiness: LOB_LABELS[related.policy.lineOfBusiness] ?? related.policy.lineOfBusiness,
          carrierName: related.policy.carrierName,
          expirationDate: related.policy.expirationDate ? fmtDate(related.policy.expirationDate) : undefined,
          effectiveDate: related.policy.effectiveDate ? fmtDate(related.policy.effectiveDate) : undefined,
        }
      : null,
    invoice: related?.invoice
      ? { invoiceNumber: related.invoice.invoiceNumber, amount: fmtMoneyCents(related.invoice.amount as never), dueDate: fmtDate(related.invoice.dueDate) }
      : null,
    claim: related?.claim
      ? { claimNumber: related.claim.claimNumber, status: related.claim.status, dateOfLoss: related.claim.dateOfLoss ? fmtDate(related.claim.dateOfLoss) : undefined }
      : null,
  };
}

// ── EVALUATE phase ───────────────────────────────────────────────────

export type EvaluateResult = { scanned: number; due: number; created: number; skipped: number };

/**
 * Scan the relevant book slice per active template and UPSERT a
 * ScheduledTouchpoint for each due hit. Re-runs are no-ops thanks to the
 * @unique idempotencyKey. Returns counts. `dryRun` computes due-ness but
 * writes nothing.
 */
export async function evaluateTouchpoints(asOf: Date = new Date(), dryRun = false): Promise<EvaluateResult> {
  const templates = await prisma.touchpointTemplate.findMany({ where: { active: true } });
  const scanned = templates.filter((t) => t.triggerType !== "LIFECYCLE_EVENT" && t.triggerType !== "MANUAL");

  // Load every client with the facts the evaluator needs, once.
  const clients = await prisma.client.findMany({
    where: { status: { in: ["ACTIVE", "PROSPECT", "INACTIVE"] } },
    select: {
      id: true,
      status: true,
      type: true,
      createdAt: true,
      dateOfBirth: true,
      email: true,
      householdId: true,
      householdRole: true,
      commPrefs: { select: { doNotContact: true } },
      policies: {
        where: { status: { in: ["ACTIVE", "BOUND"] } },
        select: { id: true, lineOfBusiness: true, status: true, effectiveDate: true, expirationDate: true },
      },
      invoices: {
        where: { status: { in: ["SENT", "PARTIAL"] } },
        select: { id: true, dueDate: true },
      },
    },
  });

  const result: EvaluateResult = { scanned: scanned.length, due: 0, created: 0, skipped: 0 };

  // Index for household dedup: clientId → { householdId, role }.
  const householdOf = new Map<string, { householdId: string | null; role: string }>();
  for (const c of clients) householdOf.set(c.id, { householdId: c.householdId, role: c.householdRole });

  // Pass 1 — collect every due (template, client) decision.
  type DueDecision = {
    client: (typeof clients)[number];
    template: (typeof scanned)[number];
    decision: NonNullable<ReturnType<typeof dueTouchpoints>>;
  };
  const decisions: DueDecision[] = [];
  for (const client of clients) {
    // doNotContact short-circuits ALL scheduling for this client.
    if (client.commPrefs?.doNotContact) continue;
    const ctx: ClientTouchpointCtx = {
      clientId: client.id,
      status: client.status,
      type: client.type,
      createdAt: client.createdAt,
      dateOfBirth: client.dateOfBirth,
      policies: client.policies.map((p) => ({ ...p })),
      openInvoices: client.invoices.map((i) => ({ id: i.id, dueDate: i.dueDate })),
    };
    for (const template of scanned) {
      const decision = dueTouchpoints({ ...template, audienceFilter: template.audienceFilter }, ctx, asOf);
      if (!decision) continue;
      decisions.push({ client, template, decision });
    }
  }

  // Pass 2 — household de-dup for household-level categories (APPRECIATION,
  // SATISFACTION): one recipient per household per template, so a holiday
  // greeting / NPS doesn't double-send to spouses living together.
  const suppressed = new Set<string>(); // `${templateKey}:${clientId}`
  const byTemplate = new Map<string, DueDecision[]>();
  for (const d of decisions) {
    if (!isHouseholdDedupCategory(d.template.category)) continue;
    const list = byTemplate.get(d.template.key) ?? [];
    list.push(d);
    byTemplate.set(d.template.key, list);
  }
  for (const [templateKey, list] of byTemplate) {
    const keep = dedupHouseholdRecipients(
      list.map((d) => {
        const h = householdOf.get(d.client.id);
        return {
          clientId: d.client.id,
          householdId: h?.householdId ?? null,
          preferenceRank: householdRoleRank(h?.role ?? "OTHER"),
        };
      }),
    );
    for (const d of list) {
      if (!keep.has(d.client.id)) suppressed.add(`${templateKey}:${d.client.id}`);
    }
  }

  // Pass 3 — persist the surviving decisions. Collect the create payloads,
  // then insert in one createMany with skipDuplicates: the @unique
  // idempotencyKey makes a re-run a no-op AND the returned `count` is the
  // number of rows ACTUALLY inserted — so `created` reflects genuinely new
  // schedules, not matched-existing rows (the old per-row upsert always
  // counted every row as "created", inflating the cron audit on every re-run).
  const toCreate = decisions
    .filter(({ client, template }) => !suppressed.has(`${template.key}:${client.id}`))
    .map(({ client, template, decision }) => {
      result.due += 1;
      return {
        clientId: client.id,
        templateKey: template.key,
        channel: template.channel,
        status: (template.requiresApproval ? "PENDING" : "APPROVED") as TouchpointStatus,
        scheduledFor: decision.scheduledFor,
        relatedType: decision.relatedType,
        relatedId: decision.relatedId,
        idempotencyKey: decision.idempotencyKey,
      };
    });

  if (!dryRun && toCreate.length > 0) {
    try {
      const { count } = await prisma.scheduledTouchpoint.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
      result.created = count;
      result.skipped = toCreate.length - count;
    } catch (err) {
      // A bulk insert failure shouldn't lose the whole run silently.
      log.warn("touchpoint evaluate: bulk schedule failed", { module: "touchpoints" }, err);
      result.skipped = toCreate.length;
    }
  }
  return result;
}

// ── SEND SWEEP phase ─────────────────────────────────────────────────

export type SendResult = { selected: number; sent: number; skipped: number; failed: number };

const CATEGORY_OPT_FIELD = (cat: TouchpointTemplate["category"]): keyof CommPrefsLike => {
  switch (cat) {
    case "ONBOARDING": return "optOnboarding";
    case "RENEWAL": return "optRenewal";
    case "PAYMENT": return "optPayment";
    case "CLAIM": return "optClaim";
    case "APPRECIATION": return "optAppreciation";
    case "SATISFACTION": return "optSatisfaction";
    case "OFFBOARDING": return "optOffboarding";
    default: return "optAppreciation";
  }
};

/** Categories that are TRANSACTIONAL — they bypass appreciation/category
 * opt-out (a payment receipt must reach the customer) but ALWAYS honor
 * the global doNotContact flag. */
const TRANSACTIONAL_TEMPLATE_KEYS = new Set(["payment-receipt"]);

/**
 * Render + send every APPROVED touchpoint whose scheduledFor has arrived.
 * Per row: re-check doNotContact, category opt-out, recipient present, and
 * (SMS) quiet-hours + smsConsentAt. Blocked → SKIPPED+reason; otherwise
 * render, send, and snapshot the result. recordAudit each.
 */
export async function sendDueTouchpoints(asOf: Date = new Date(), personalize?: Personalizer): Promise<SendResult> {
  const due = await prisma.scheduledTouchpoint.findMany({
    where: { status: "APPROVED", scheduledFor: { lte: asOf } },
    orderBy: { scheduledFor: "asc" },
    take: 200, // bound per run
    include: { template: true },
  });

  const result: SendResult = { selected: due.length, sent: 0, skipped: 0, failed: 0 };
  if (due.length === 0) return result;

  const agency = await agencyIdentity();
  const ai = personalize ?? maybePersonalizer();

  for (const row of due) {
    const skip = async (reason: string) => {
      await prisma.scheduledTouchpoint.update({ where: { id: row.id }, data: { status: "SKIPPED", failureReason: reason } });
      await audit({ action: "TOUCHPOINT_SKIP", entityType: "ScheduledTouchpoint", entityId: row.id, detail: reason });
      result.skipped += 1;
    };

    const client = await prisma.client.findUnique({
      where: { id: row.clientId },
      select: {
        id: true, name: true, preferredName: true, firstName: true, email: true, createdAt: true,
        producer: { select: { name: true } },
        csr: { select: { name: true } },
        commPrefs: true,
      },
    });
    if (!client) { await skip("client missing"); continue; }

    const prefs = client.commPrefs;
    const transactional = TRANSACTIONAL_TEMPLATE_KEYS.has(row.template.key);

    if (prefs?.doNotContact) { await skip("do-not-contact"); continue; }
    if (!transactional && !categoryOptedIn(prefs as CommPrefsLike | null, row.template.category)) {
      await skip(`opted out of ${row.template.category.toLowerCase()}`);
      continue;
    }
    if (row.channel === "EMAIL" && !client.email) { await skip("no email on file"); continue; }
    if (row.channel === "SMS") {
      if (!prefs?.smsConsentAt) { await skip("no SMS consent"); continue; }
      if (isQuietHour(prefs as CommPrefsLike, asOf)) { await skip("quiet hours"); continue; }
    }

    // Resolve any related entity for the merge context.
    const related = await resolveRelated(row.relatedType, row.relatedId);
    const ctx = await buildMergeContext(
      { ...client, commPrefs: prefs ? { unsubscribeToken: prefs.unsubscribeToken } : null },
      agency,
      related,
    );

    try {
      const email = await renderEmail(row.template.subject, row.template.body, ctx, ai);
      const send = await sendEmail({ to: client.email!, subject: email.subject, text: email.text, html: email.html });
      if (send.ok) {
        await prisma.scheduledTouchpoint.update({
          where: { id: row.id },
          data: { status: "SENT", sentAt: new Date(), toAddress: client.email, renderedSubject: email.subject, renderedBody: email.text },
        });
        await audit({ action: "TOUCHPOINT_SENT", entityType: "ScheduledTouchpoint", entityId: row.id, detail: `${row.template.key} → ${client.email} (${send.transport})` });
        result.sent += 1;
      } else {
        await prisma.scheduledTouchpoint.update({ where: { id: row.id }, data: { status: "FAILED", failureReason: send.error ?? "send failed" } });
        await audit({ action: "TOUCHPOINT_FAILED", entityType: "ScheduledTouchpoint", entityId: row.id, detail: send.error ?? "send failed" });
        result.failed += 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.scheduledTouchpoint.update({ where: { id: row.id }, data: { status: "FAILED", failureReason: msg } });
      result.failed += 1;
      log.warn("touchpoint send threw", { module: "touchpoints", id: row.id }, err);
    }
  }
  return result;
}

async function resolveRelated(relatedType: string | null, relatedId: string | null) {
  if (!relatedType || !relatedId) return undefined;
  if (relatedType === "Policy") {
    const p = await prisma.policy.findUnique({ where: { id: relatedId }, select: { policyNumber: true, lineOfBusiness: true, effectiveDate: true, expirationDate: true, carrier: { select: { name: true } } } });
    return p ? { policy: { policyNumber: p.policyNumber, lineOfBusiness: p.lineOfBusiness, carrierName: p.carrier.name, effectiveDate: p.effectiveDate, expirationDate: p.expirationDate } } : undefined;
  }
  if (relatedType === "Invoice") {
    const inv = await prisma.invoice.findUnique({ where: { id: relatedId }, select: { invoiceNumber: true, amount: true, dueDate: true, xeroPaymentUrl: true } });
    return inv ? { invoice: inv } : undefined;
  }
  if (relatedType === "Claim") {
    const c = await prisma.claim.findUnique({ where: { id: relatedId }, select: { claimNumber: true, status: true, dateOfLoss: true } });
    return c ? { claim: c } : undefined;
  }
  return undefined;
}

// ── Real-time lifecycle hook ─────────────────────────────────────────

/**
 * Schedule a touchpoint in response to a real-time lifecycle event (client
 * onboarded, claim filed, invoice paid, referral, cancellation). Best-effort
 * and idempotent: a stable key built from (templateKey, clientId, relatedId)
 * means double-firing the same event never double-schedules. Never throws —
 * a touchpoint failure must not break the business action that triggered it.
 */
export async function scheduleTouchpoint(
  templateKey: string,
  clientId: string,
  opts: { related?: { type: string; id: string }; scheduledFor?: Date; anchorKey?: string } = {},
): Promise<void> {
  try {
    const template = await prisma.touchpointTemplate.findUnique({ where: { key: templateKey } });
    if (!template || !template.active) return;
    const anchor = opts.anchorKey ?? opts.related?.id ?? new Date().toISOString().slice(0, 10);
    const idempotencyKey = `${templateKey}:${clientId}:${anchor}`;
    await prisma.scheduledTouchpoint.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        clientId,
        templateKey,
        channel: template.channel,
        status: template.requiresApproval ? "PENDING" : "APPROVED",
        scheduledFor: opts.scheduledFor ?? new Date(),
        relatedType: opts.related?.type ?? "LifecycleEvent",
        relatedId: opts.related?.id ?? null,
        idempotencyKey,
      },
    });
  } catch (err) {
    log.warn("scheduleTouchpoint failed (non-fatal)", { module: "touchpoints", templateKey, clientId }, err);
  }
}
