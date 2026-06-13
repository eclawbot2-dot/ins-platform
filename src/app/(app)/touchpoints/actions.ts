"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStr, fStrOpt, fNum, fBool, fEnum } from "@/lib/form";
import { sendDueTouchpoints } from "@/lib/touchpoint-engine";
import { addDays } from "@/lib/domain/dates";
import type { TouchpointCategory, TouchpointTrigger, TouchpointChannel, TouchpointStatus } from "@prisma/client";

const CATEGORIES: TouchpointCategory[] = ["ONBOARDING", "RENEWAL", "PAYMENT", "CLAIM", "APPRECIATION", "SATISFACTION", "OFFBOARDING"];
const TRIGGERS: TouchpointTrigger[] = ["RENEWAL_RELATIVE", "PAYMENT_DUE_RELATIVE", "BIRTHDAY", "POLICY_ANNIVERSARY", "HOLIDAY", "TENURE_MILESTONE", "LIFECYCLE_EVENT", "MANUAL"];
const CHANNELS: TouchpointChannel[] = ["EMAIL", "SMS"];

// Only PENDING/APPROVED rows are still "live" — a SENT, SKIPPED or FAILED row
// is terminal and must NEVER be flipped back into the APPROVED send pipeline
// (that would re-send an already-delivered email). The queue UI only renders
// these actions for live rows, but the server actions are directly invocable,
// so the transition itself is guarded with a status precondition.
const LIVE_STATUSES: TouchpointStatus[] = ["PENDING", "APPROVED"];

// ── Queue actions ────────────────────────────────────────────────────

/** Approve a PENDING touchpoint → APPROVED (the send sweep will pick it up). */
export async function approveTouchpoint(id: string) {
  const session = await requireSession();
  const { count } = await prisma.scheduledTouchpoint.updateMany({
    where: { id, status: { in: LIVE_STATUSES } },
    data: { status: "APPROVED", approvedById: session.userId },
  });
  if (count === 0) {
    redirect(`/touchpoints?toastError=${encodeURIComponent("That touchpoint already sent or was skipped")}`);
  }
  await audit({ userId: session.userId, action: "TOUCHPOINT_APPROVE", entityType: "ScheduledTouchpoint", entityId: id });
  revalidatePath("/touchpoints");
  redirect(`/touchpoints?toast=${encodeURIComponent("Touchpoint approved")}`);
}

/** Edit the rendered copy and approve in one step (overrides the template body). */
export async function editAndApproveTouchpoint(id: string, formData: FormData) {
  const session = await requireSession();
  const subject = fStrOpt(formData, "renderedSubject");
  const body = fStrOpt(formData, "renderedBody");
  const { count } = await prisma.scheduledTouchpoint.updateMany({
    where: { id, status: { in: LIVE_STATUSES } },
    data: { status: "APPROVED", approvedById: session.userId, renderedSubject: subject, renderedBody: body },
  });
  if (count === 0) {
    redirect(`/touchpoints?toastError=${encodeURIComponent("That touchpoint already sent or was skipped")}`);
  }
  await audit({ userId: session.userId, action: "TOUCHPOINT_EDIT_APPROVE", entityType: "ScheduledTouchpoint", entityId: id });
  revalidatePath("/touchpoints");
  redirect(`/touchpoints?toast=${encodeURIComponent("Touchpoint edited and approved")}`);
}

/** Skip a touchpoint — it will never send. Only a live row can be skipped. */
export async function skipTouchpoint(id: string) {
  const session = await requireSession();
  const { count } = await prisma.scheduledTouchpoint.updateMany({
    where: { id, status: { in: LIVE_STATUSES } },
    data: { status: "SKIPPED", failureReason: "skipped by staff" },
  });
  if (count === 0) {
    redirect(`/touchpoints?toastError=${encodeURIComponent("That touchpoint already sent or was skipped")}`);
  }
  await audit({ userId: session.userId, action: "TOUCHPOINT_SKIP", entityType: "ScheduledTouchpoint", entityId: id });
  revalidatePath("/touchpoints");
  redirect(`/touchpoints?toast=${encodeURIComponent("Touchpoint skipped")}`);
}

/** Push a touchpoint's scheduledFor out by N days. Only a live row snoozes. */
export async function snoozeTouchpoint(id: string, formData: FormData) {
  const session = await requireSession();
  const days = Math.max(1, fNum(formData, "days", 7));
  const row = await prisma.scheduledTouchpoint.findUnique({ where: { id } });
  if (!row || !LIVE_STATUSES.includes(row.status)) {
    redirect(`/touchpoints?toastError=${encodeURIComponent("That touchpoint already sent or was skipped")}`);
  }
  await prisma.scheduledTouchpoint.update({
    where: { id },
    data: { scheduledFor: addDays(row.scheduledFor, days) },
  });
  await audit({ userId: session.userId, action: "TOUCHPOINT_SNOOZE", entityType: "ScheduledTouchpoint", entityId: id, detail: `${days}d` });
  revalidatePath("/touchpoints");
  redirect(`/touchpoints?toast=${encodeURIComponent(`Snoozed ${days} days`)}`);
}

/**
 * Approve and immediately run the send sweep so this row goes out now.
 * Guarded with a status precondition: a SENT/SKIPPED/FAILED row can NOT be
 * flipped back to APPROVED here, so re-invoking this action on an already-sent
 * row never re-sends the email (the @unique idempotency is on scheduling; this
 * is the corresponding no-double-send guard on the manual send path).
 */
export async function sendNowTouchpoint(id: string) {
  const session = await requireSession();
  const { count } = await prisma.scheduledTouchpoint.updateMany({
    where: { id, status: { in: LIVE_STATUSES } },
    data: { status: "APPROVED", approvedById: session.userId, scheduledFor: new Date() },
  });
  if (count === 0) {
    redirect(`/touchpoints?toastError=${encodeURIComponent("That touchpoint already sent or was skipped")}`);
  }
  const result = await sendDueTouchpoints(new Date());
  await audit({ userId: session.userId, action: "TOUCHPOINT_SEND_NOW", entityType: "ScheduledTouchpoint", entityId: id, detail: `sent ${result.sent}` });
  revalidatePath("/touchpoints");
  redirect(`/touchpoints?toast=${encodeURIComponent(result.sent > 0 ? "Touchpoint sent" : "Send attempted — check status")}`);
}

// ── Template management (ADMIN) ──────────────────────────────────────

export async function saveTouchpointTemplate(formData: FormData) {
  const session = await requireAdmin();
  const key = fStr(formData, "key").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  if (!key) redirect(`/touchpoints/templates?toastError=${encodeURIComponent("Template key is required")}`);
  const data = {
    name: fStr(formData, "name") || key,
    category: fEnum(formData, "category", CATEGORIES, "APPRECIATION"),
    channel: fEnum(formData, "channel", CHANNELS, "EMAIL"),
    triggerType: fEnum(formData, "triggerType", TRIGGERS, "MANUAL"),
    offsetDays: fNum(formData, "offsetDays", 0),
    holidayKey: fStrOpt(formData, "holidayKey"),
    tenureMonths: fStrOpt(formData, "tenureMonths") ? fNum(formData, "tenureMonths") : null,
    subject: fStr(formData, "subject") || "(no subject)",
    body: fStr(formData, "body"),
    active: fBool(formData, "active"),
    requiresApproval: fBool(formData, "requiresApproval"),
  };
  await prisma.touchpointTemplate.upsert({ where: { key }, update: data, create: { key, ...data } });
  await audit({ userId: session.userId, action: "TOUCHPOINT_TEMPLATE_SAVE", entityType: "TouchpointTemplate", entityId: key });
  revalidatePath("/touchpoints/templates");
  redirect(`/touchpoints/templates?toast=${encodeURIComponent(`Template "${key}" saved`)}`);
}

export async function toggleTouchpointTemplate(id: string) {
  const session = await requireAdmin();
  const row = await prisma.touchpointTemplate.findUnique({ where: { id } });
  if (!row) redirect(`/touchpoints/templates?toastError=${encodeURIComponent("Template not found")}`);
  await prisma.touchpointTemplate.update({ where: { id }, data: { active: !row.active } });
  await audit({ userId: session.userId, action: row.active ? "TOUCHPOINT_TEMPLATE_DISABLE" : "TOUCHPOINT_TEMPLATE_ENABLE", entityType: "TouchpointTemplate", entityId: id });
  revalidatePath("/touchpoints/templates");
  redirect(`/touchpoints/templates?toast=${encodeURIComponent(row.active ? "Template disabled" : "Template enabled")}`);
}

// ── Client communication preferences (staff edit on Client 360) ──────

export async function updateClientCommPrefs(clientId: string, formData: FormData) {
  const session = await requireSession();
  const data = {
    doNotContact: fBool(formData, "doNotContact"),
    optOnboarding: fBool(formData, "optOnboarding"),
    optRenewal: fBool(formData, "optRenewal"),
    optPayment: fBool(formData, "optPayment"),
    optClaim: fBool(formData, "optClaim"),
    optAppreciation: fBool(formData, "optAppreciation"),
    optSatisfaction: fBool(formData, "optSatisfaction"),
    optOffboarding: fBool(formData, "optOffboarding"),
    preferredChannel: fEnum(formData, "preferredChannel", CHANNELS, "EMAIL"),
    quietHoursStart: Math.min(23, Math.max(0, fNum(formData, "quietHoursStart", 8))),
    quietHoursEnd: Math.min(24, Math.max(0, fNum(formData, "quietHoursEnd", 20))),
  };
  await prisma.clientCommunicationPreferences.upsert({
    where: { clientId },
    update: data,
    create: { clientId, ...data },
  });
  await audit({ userId: session.userId, action: "CLIENT_COMM_PREFS_UPDATE", entityType: "Client", entityId: clientId });
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?toast=${encodeURIComponent("Communication preferences saved")}`);
}
