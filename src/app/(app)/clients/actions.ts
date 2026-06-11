"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createPortalInvite } from "@/lib/portal-invite";
import { fStr, fStrOpt, fDate, fEnum, fBool } from "@/lib/form";
import type { ClientStatus, ClientType, ActivityType } from "@prisma/client";

const CLIENT_TYPES: ClientType[] = ["INDIVIDUAL", "BUSINESS"];
const CLIENT_STATUSES: ClientStatus[] = ["PROSPECT", "ACTIVE", "INACTIVE", "FORMER"];
const ACTIVITY_TYPES: ActivityType[] = ["NOTE", "CALL", "EMAIL", "MEETING"];

function clientDataFrom(formData: FormData) {
  const type = fEnum(formData, "type", CLIENT_TYPES, "INDIVIDUAL");
  const firstName = fStrOpt(formData, "firstName");
  const lastName = fStrOpt(formData, "lastName");
  const businessName = fStrOpt(formData, "businessName");
  const name =
    type === "BUSINESS"
      ? (businessName ?? "Unnamed business")
      : [firstName, lastName].filter(Boolean).join(" ") || "Unnamed client";
  return {
    type,
    status: fEnum(formData, "status", CLIENT_STATUSES, "PROSPECT"),
    name,
    firstName,
    lastName,
    businessName,
    email: fStrOpt(formData, "email"),
    phone: fStrOpt(formData, "phone"),
    addressLine1: fStrOpt(formData, "addressLine1"),
    addressLine2: fStrOpt(formData, "addressLine2"),
    city: fStrOpt(formData, "city"),
    state: fStrOpt(formData, "state"),
    zip: fStrOpt(formData, "zip"),
    dateOfBirth: fDate(formData, "dateOfBirth"),
    industry: fStrOpt(formData, "industry"),
    source: fStrOpt(formData, "source"),
    notes: fStrOpt(formData, "notes"),
    producerId: fStrOpt(formData, "producerId"),
    csrId: fStrOpt(formData, "csrId"),
  };
}

export async function createClient(formData: FormData) {
  const session = await requireSession();
  const data = clientDataFrom(formData);
  const client = await prisma.client.create({ data });
  await audit({ userId: session.userId, action: "CLIENT_CREATE", entityType: "Client", entityId: client.id, detail: client.name });
  redirect(`/clients/${client.id}?toast=${encodeURIComponent("Client created")}`);
}

export async function updateClient(id: string, formData: FormData) {
  const session = await requireSession();
  const data = clientDataFrom(formData);
  await prisma.client.update({ where: { id }, data });
  await audit({ userId: session.userId, action: "CLIENT_UPDATE", entityType: "Client", entityId: id });
  redirect(`/clients/${id}?toast=${encodeURIComponent("Client updated")}`);
}

export async function addContact(clientId: string, formData: FormData) {
  await requireSession();
  await prisma.contact.create({
    data: {
      clientId,
      name: fStr(formData, "name") || "Unnamed contact",
      title: fStrOpt(formData, "title"),
      email: fStrOpt(formData, "email"),
      phone: fStrOpt(formData, "phone"),
      isPrimary: fBool(formData, "isPrimary"),
    },
  });
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?toast=${encodeURIComponent("Contact added")}`);
}

export async function deleteContact(clientId: string, contactId: string) {
  await requireSession();
  await prisma.contact.delete({ where: { id: contactId } });
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?toast=${encodeURIComponent("Contact removed")}`);
}

export async function addClientActivity(clientId: string, formData: FormData) {
  const session = await requireSession();
  await prisma.activity.create({
    data: {
      clientId,
      userId: session.userId,
      type: fEnum(formData, "type", ACTIVITY_TYPES, "NOTE"),
      subject: fStr(formData, "subject") || "Note",
      body: fStrOpt(formData, "body"),
    },
  });
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?toast=${encodeURIComponent("Activity logged")}`);
}

export async function addClientTask(clientId: string, formData: FormData) {
  const session = await requireSession();
  await prisma.task.create({
    data: {
      clientId,
      createdById: session.userId,
      assignedToId: fStrOpt(formData, "assignedToId"),
      title: fStr(formData, "title") || "Task",
      detail: fStrOpt(formData, "detail"),
      dueDate: fDate(formData, "dueDate") ?? new Date(),
    },
  });
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?toast=${encodeURIComponent("Task created")}`);
}

// ── Client portal access ──────────────────────────────────────────────

export async function invitePortalUser(clientId: string, formData: FormData) {
  const session = await requireSession();
  const email = fStr(formData, "email");
  const result = await createPortalInvite(clientId, email, session.userId);
  if (!result.ok) {
    redirect(`/clients/${clientId}?toastError=${encodeURIComponent(result.error)}`);
  }
  await audit({ userId: session.userId, action: "PORTAL_INVITE_SEND", entityType: "Client", entityId: clientId, detail: email });
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?toast=${encodeURIComponent(`Portal invitation sent to ${email.trim().toLowerCase()}`)}`);
}

export async function revokePortalInvite(clientId: string, inviteId: string) {
  const session = await requireSession();
  // Scope by clientId so a forged inviteId can't touch another client's invite.
  await prisma.portalInvite.updateMany({
    where: { id: inviteId, clientId, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await audit({ userId: session.userId, action: "PORTAL_INVITE_REVOKE", entityType: "Client", entityId: clientId });
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?toast=${encodeURIComponent("Invitation revoked")}`);
}

export async function resendPortalInvite(clientId: string, inviteId: string) {
  const session = await requireSession();
  const invite = await prisma.portalInvite.findFirst({ where: { id: inviteId, clientId } });
  if (!invite) redirect(`/clients/${clientId}?toastError=${encodeURIComponent("Invitation not found")}`);
  // Resend = revoke the old token and issue a fresh 7-day one.
  const result = await createPortalInvite(clientId, invite.email, session.userId);
  if (!result.ok) {
    redirect(`/clients/${clientId}?toastError=${encodeURIComponent(result.error)}`);
  }
  await audit({ userId: session.userId, action: "PORTAL_INVITE_RESEND", entityType: "Client", entityId: clientId, detail: invite.email });
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?toast=${encodeURIComponent(`Invitation re-sent to ${invite.email}`)}`);
}

export async function disablePortalUser(clientId: string, userId: string) {
  const session = await requireSession();
  // Scope by clientId + role so only this client's portal logins are touchable.
  await prisma.user.updateMany({
    where: { id: userId, clientId, role: "CLIENT" },
    data: { active: false, sessionsRevokedAt: new Date() },
  });
  await audit({ userId: session.userId, action: "PORTAL_USER_DISABLE", entityType: "Client", entityId: clientId });
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?toast=${encodeURIComponent("Portal access disabled")}`);
}
