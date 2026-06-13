"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStr, fStrOpt, fEnum } from "@/lib/form";
import type { HouseholdRole } from "@prisma/client";

const HOUSEHOLD_ROLES: HouseholdRole[] = [
  "PRIMARY",
  "SPOUSE",
  "PARTNER",
  "CHILD",
  "PARENT",
  "DEPENDENT",
  "OTHER",
];

export async function createHousehold(formData: FormData) {
  const session = await requireSession();
  const name = fStr(formData, "name");
  if (!name) redirect(`/households?toastError=${encodeURIComponent("Household name is required")}`);

  // Optionally seed with a first member (the primary).
  const primaryClientId = fStrOpt(formData, "primaryClientId");

  const household = await prisma.household.create({
    data: {
      name,
      notes: fStrOpt(formData, "notes"),
      primaryClientId: primaryClientId ?? null,
    },
  });

  if (primaryClientId) {
    await prisma.client.update({
      where: { id: primaryClientId },
      data: { householdId: household.id, householdRole: "PRIMARY" },
    });
  }

  await audit({ userId: session.userId, action: "HOUSEHOLD_CREATE", entityType: "Household", entityId: household.id, detail: name });
  redirect(`/households/${household.id}?toast=${encodeURIComponent("Household created")}`);
}

export async function updateHousehold(id: string, formData: FormData) {
  const session = await requireSession();
  const primaryClientId = fStrOpt(formData, "primaryClientId");
  // Only honor a primary that actually belongs to this household.
  let primary: string | null = null;
  if (primaryClientId) {
    const member = await prisma.client.findFirst({ where: { id: primaryClientId, householdId: id }, select: { id: true } });
    primary = member?.id ?? null;
  }
  await prisma.household.update({
    where: { id },
    data: {
      name: fStr(formData, "name") || "Household",
      notes: fStrOpt(formData, "notes"),
      primaryClientId: primary,
    },
  });
  await audit({ userId: session.userId, action: "HOUSEHOLD_UPDATE", entityType: "Household", entityId: id });
  revalidatePath(`/households/${id}`);
  redirect(`/households/${id}?toast=${encodeURIComponent("Household updated")}`);
}

/** Link a client into a household (from the household page or the client 360). */
export async function linkClientToHousehold(householdId: string, formData: FormData) {
  const session = await requireSession();
  const clientId = fStr(formData, "clientId");
  const role = fEnum(formData, "householdRole", HOUSEHOLD_ROLES, "OTHER");
  if (!clientId) redirect(`/households/${householdId}?toastError=${encodeURIComponent("Select a client to add")}`);

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!client) redirect(`/households/${householdId}?toastError=${encodeURIComponent("Client not found")}`);

  await prisma.client.update({ where: { id: clientId }, data: { householdId, householdRole: role } });
  await audit({ userId: session.userId, action: "HOUSEHOLD_LINK", entityType: "Household", entityId: householdId, detail: client.name });
  revalidatePath(`/households/${householdId}`);
  revalidatePath(`/clients/${clientId}`);
  redirect(`/households/${householdId}?toast=${encodeURIComponent(`${client.name} added to household`)}`);
}

/** Unlink a member; if they were the primary, clear that pointer too. */
export async function unlinkClientFromHousehold(householdId: string, clientId: string) {
  const session = await requireSession();
  // Scope by householdId so a forged clientId can't detach another house's member.
  await prisma.client.updateMany({
    where: { id: clientId, householdId },
    data: { householdId: null, householdRole: "OTHER" },
  });
  await prisma.household.updateMany({
    where: { id: householdId, primaryClientId: clientId },
    data: { primaryClientId: null },
  });
  await audit({ userId: session.userId, action: "HOUSEHOLD_UNLINK", entityType: "Household", entityId: householdId });
  revalidatePath(`/households/${householdId}`);
  revalidatePath(`/clients/${clientId}`);
  redirect(`/households/${householdId}?toast=${encodeURIComponent("Member removed from household")}`);
}

/**
 * Link a client into a household FROM the client 360. Creates a new
 * household (named after the client) when no existing one is chosen.
 */
export async function linkClientFromClient360(clientId: string, formData: FormData) {
  const session = await requireSession();
  const role = fEnum(formData, "householdRole", HOUSEHOLD_ROLES, "OTHER");
  const existingHouseholdId = fStrOpt(formData, "householdId");
  const newName = fStrOpt(formData, "newHouseholdName");

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!client) redirect(`/clients/${clientId}?toastError=${encodeURIComponent("Client not found")}`);

  let householdId = existingHouseholdId;
  if (!householdId) {
    const created = await prisma.household.create({
      data: { name: newName || `${client.name} household`, primaryClientId: clientId },
    });
    householdId = created.id;
  }

  await prisma.client.update({
    where: { id: clientId },
    data: { householdId, householdRole: existingHouseholdId ? role : "PRIMARY" },
  });
  await audit({ userId: session.userId, action: "HOUSEHOLD_LINK", entityType: "Household", entityId: householdId, detail: client.name });
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?toast=${encodeURIComponent("Linked to household")}`);
}

export async function unlinkClientFromClient360(clientId: string) {
  const session = await requireSession();
  const before = await prisma.client.findUnique({ where: { id: clientId }, select: { householdId: true } });
  await prisma.client.update({ where: { id: clientId }, data: { householdId: null, householdRole: "OTHER" } });
  if (before?.householdId) {
    await prisma.household.updateMany({
      where: { id: before.householdId, primaryClientId: clientId },
      data: { primaryClientId: null },
    });
  }
  await audit({ userId: session.userId, action: "HOUSEHOLD_UNLINK", entityType: "Client", entityId: clientId });
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?toast=${encodeURIComponent("Removed from household")}`);
}
