"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStr, fStrOpt, fBool } from "@/lib/form";

// ── Agency profile ───────────────────────────────────────────────────

export async function updateAgencyProfile(formData: FormData) {
  const session = await requireAdmin();
  const data = {
    name: fStr(formData, "name") || "Ins Platform Agency",
    addressLine1: fStrOpt(formData, "addressLine1"),
    addressLine2: fStrOpt(formData, "addressLine2"),
    city: fStrOpt(formData, "city"),
    state: fStrOpt(formData, "state"),
    zip: fStrOpt(formData, "zip"),
    phone: fStrOpt(formData, "phone"),
    email: fStrOpt(formData, "email"),
    website: fStrOpt(formData, "website"),
    licenseNumber: fStrOpt(formData, "licenseNumber"),
  };
  await prisma.agencyProfile.upsert({ where: { id: "agency" }, update: data, create: { id: "agency", ...data } });
  await audit({ userId: session.userId, action: "AGENCY_PROFILE_UPDATE", entityType: "AgencyProfile", entityId: "agency" });
  revalidatePath("/settings");
  redirect(`/settings?toast=${encodeURIComponent("Agency profile saved")}`);
}

// ── Email templates ──────────────────────────────────────────────────

export async function saveEmailTemplate(formData: FormData) {
  const session = await requireAdmin();
  const key = fStr(formData, "key")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");
  if (!key) redirect(`/settings/templates?toastError=${encodeURIComponent("Template key is required")}`);
  const data = {
    name: fStr(formData, "name") || key,
    subject: fStr(formData, "subject") || "(no subject)",
    body: fStr(formData, "body"),
  };
  await prisma.emailTemplate.upsert({ where: { key }, update: data, create: { key, ...data } });
  await audit({ userId: session.userId, action: "EMAIL_TEMPLATE_SAVE", entityType: "EmailTemplate", entityId: key });
  revalidatePath("/settings/templates");
  redirect(`/settings/templates?toast=${encodeURIComponent(`Template "${key}" saved`)}`);
}

export async function deleteEmailTemplate(id: string) {
  const session = await requireAdmin();
  await prisma.emailTemplate.delete({ where: { id } });
  await audit({ userId: session.userId, action: "EMAIL_TEMPLATE_DELETE", entityType: "EmailTemplate", entityId: id });
  revalidatePath("/settings/templates");
  redirect(`/settings/templates?toast=${encodeURIComponent("Template deleted")}`);
}

// ── Lead intake keys ─────────────────────────────────────────────────

export async function createLeadIntakeKey(formData: FormData) {
  const session = await requireAdmin();
  const label = fStr(formData, "label") || "Unnamed key";
  const key = `ins_lk_${crypto.randomBytes(24).toString("base64url")}`;
  const row = await prisma.leadIntakeKey.create({ data: { label, key } });
  await audit({ userId: session.userId, action: "LEAD_KEY_CREATE", entityType: "LeadIntakeKey", entityId: row.id, detail: label });
  revalidatePath("/settings/keys");
  redirect(`/settings/keys?toast=${encodeURIComponent(`Key created — copy it now: ${key}`)}`);
}

export async function toggleLeadIntakeKey(id: string) {
  const session = await requireAdmin();
  const row = await prisma.leadIntakeKey.findUnique({ where: { id } });
  if (!row) redirect(`/settings/keys?toastError=${encodeURIComponent("Key not found")}`);
  await prisma.leadIntakeKey.update({ where: { id }, data: { active: !row.active } });
  await audit({
    userId: session.userId,
    action: row.active ? "LEAD_KEY_DISABLE" : "LEAD_KEY_ENABLE",
    entityType: "LeadIntakeKey",
    entityId: id,
  });
  revalidatePath("/settings/keys");
  redirect(`/settings/keys?toast=${encodeURIComponent(row.active ? "Key disabled" : "Key enabled")}`);
}

export async function deleteLeadIntakeKey(id: string) {
  const session = await requireAdmin();
  await prisma.leadIntakeKey.delete({ where: { id } });
  await audit({ userId: session.userId, action: "LEAD_KEY_DELETE", entityType: "LeadIntakeKey", entityId: id });
  revalidatePath("/settings/keys");
  redirect(`/settings/keys?toast=${encodeURIComponent("Key deleted")}`);
}

// ── Integrations ─────────────────────────────────────────────────────

export async function disconnectXero() {
  const session = await requireAdmin();
  await prisma.integrationConnection.updateMany({
    where: { provider: "XERO" },
    data: { status: "DISCONNECTED", lastSyncNote: "disconnected by admin" },
  });
  await audit({ userId: session.userId, action: "XERO_DISCONNECT", entityType: "IntegrationConnection" });
  revalidatePath("/settings/integrations");
  redirect(`/settings/integrations?toast=${encodeURIComponent("Xero disconnected")}`);
}

export async function saveWorkspaceSettings(formData: FormData) {
  const session = await requireAdmin();
  const enabled = fBool(formData, "enabled");
  const subject = fStrOpt(formData, "subject");
  const domain = subject?.includes("@") ? subject.split("@")[1]! : null;
  await prisma.workspaceConnection.upsert({
    where: { id: "workspace" },
    update: { enabled, subject, domain },
    create: { id: "workspace", enabled, subject, domain },
  });
  await audit({ userId: session.userId, action: "WORKSPACE_SETTINGS_SAVE", entityType: "WorkspaceConnection", entityId: "workspace" });
  revalidatePath("/settings/integrations");
  redirect(`/settings/integrations?toast=${encodeURIComponent("Google Workspace settings saved")}`);
}
