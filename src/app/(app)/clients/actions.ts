"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
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
