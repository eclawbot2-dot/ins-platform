"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStr, fStrOpt, fNum, fNumOpt, fDate, fEnum, fBool } from "@/lib/form";
import { ALL_LOBS } from "@/lib/labels";
import type { AppointmentStatus, CarrierAppetite } from "@prisma/client";

const APPOINTMENTS: AppointmentStatus[] = ["APPOINTED", "PENDING", "TERMINATED", "NOT_APPOINTED"];
const APPETITES: CarrierAppetite[] = ["PREFERRED", "STANDARD", "RESTRICTED", "DECLINE"];

function carrierDataFrom(formData: FormData) {
  return {
    name: fStr(formData, "name"),
    naicCode: fStrOpt(formData, "naicCode"),
    amBestRating: fStrOpt(formData, "amBestRating"),
    portalUrl: fStrOpt(formData, "portalUrl"),
    phone: fStrOpt(formData, "phone"),
    paymentTermsDays: Math.round(fNum(formData, "paymentTermsDays", 30)),
    appointmentStatus: fEnum(formData, "appointmentStatus", APPOINTMENTS, "NOT_APPOINTED"),
    appointedAt: fDate(formData, "appointedAt"),
    appointmentExpiresAt: fDate(formData, "appointmentExpiresAt"),
    isMga: fBool(formData, "isMga"),
    notes: fStrOpt(formData, "notes"),
    uwGuidelinesUrl: fStrOpt(formData, "uwGuidelinesUrl"),
    uwGuidelinesNotes: fStrOpt(formData, "uwGuidelinesNotes"),
    bindingAuthorityNotes: fStrOpt(formData, "bindingAuthorityNotes"),
    bindingAuthorityLimit: fNumOpt(formData, "bindingAuthorityLimit"),
  };
}

export async function createCarrier(formData: FormData) {
  const session = await requireSession();
  const data = carrierDataFrom(formData);
  if (!data.name) redirect(`/carriers?toastError=${encodeURIComponent("Carrier name is required")}`);
  const exists = await prisma.carrier.findUnique({ where: { name: data.name } });
  if (exists) redirect(`/carriers?toastError=${encodeURIComponent("Carrier already exists")}`);
  const carrier = await prisma.carrier.create({ data });
  await audit({ userId: session.userId, action: "CARRIER_CREATE", entityType: "Carrier", entityId: carrier.id, detail: carrier.name });
  redirect(`/carriers/${carrier.id}?toast=${encodeURIComponent("Carrier created")}`);
}

export async function updateCarrier(id: string, formData: FormData) {
  await requireSession();
  await prisma.carrier.update({ where: { id }, data: carrierDataFrom(formData) });
  redirect(`/carriers/${id}?toast=${encodeURIComponent("Carrier updated")}`);
}

export async function upsertSchedule(carrierId: string, formData: FormData) {
  await requireSession();
  const lineOfBusiness = fEnum(formData, "lineOfBusiness", ALL_LOBS, "AUTO");
  const newPct = fNum(formData, "newPct");
  const renewalPct = fNum(formData, "renewalPct");
  await prisma.commissionSchedule.upsert({
    where: { carrierId_lineOfBusiness: { carrierId, lineOfBusiness } },
    update: { newPct, renewalPct },
    create: { carrierId, lineOfBusiness, newPct, renewalPct },
  });
  revalidatePath(`/carriers/${carrierId}`);
  redirect(`/carriers/${carrierId}?toast=${encodeURIComponent("Commission schedule saved")}`);
}

export async function deleteSchedule(carrierId: string, scheduleId: string) {
  await requireSession();
  await prisma.commissionSchedule.delete({ where: { id: scheduleId } });
  revalidatePath(`/carriers/${carrierId}`);
  redirect(`/carriers/${carrierId}?toast=${encodeURIComponent("Schedule row removed")}`);
}

export async function addCarrierContact(carrierId: string, formData: FormData) {
  await requireSession();
  await prisma.carrierContact.create({
    data: {
      carrierId,
      name: fStr(formData, "name") || "Unnamed",
      role: fStrOpt(formData, "role"),
      email: fStrOpt(formData, "email"),
      phone: fStrOpt(formData, "phone"),
    },
  });
  revalidatePath(`/carriers/${carrierId}`);
  redirect(`/carriers/${carrierId}?toast=${encodeURIComponent("Contact added")}`);
}

export async function deleteCarrierContact(carrierId: string, contactId: string) {
  await requireSession();
  await prisma.carrierContact.delete({ where: { id: contactId } });
  revalidatePath(`/carriers/${carrierId}`);
  redirect(`/carriers/${carrierId}?toast=${encodeURIComponent("Contact removed")}`);
}

// ── Carrier appetite / eligibility-by-LOB (Wave D-final) ─────────────

export async function upsertAppetite(carrierId: string, formData: FormData) {
  const session = await requireSession();
  const lineOfBusiness = fEnum(formData, "lineOfBusiness", ALL_LOBS, "AUTO");
  await prisma.carrierAppetiteRow.upsert({
    where: { carrierId_lineOfBusiness: { carrierId, lineOfBusiness } },
    update: {
      appetite: fEnum(formData, "appetite", APPETITES, "STANDARD"),
      states: fStrOpt(formData, "states"),
      classNotes: fStrOpt(formData, "classNotes"),
      minPremium: fNumOpt(formData, "minPremium"),
      maxPremium: fNumOpt(formData, "maxPremium"),
    },
    create: {
      carrierId,
      lineOfBusiness,
      appetite: fEnum(formData, "appetite", APPETITES, "STANDARD"),
      states: fStrOpt(formData, "states"),
      classNotes: fStrOpt(formData, "classNotes"),
      minPremium: fNumOpt(formData, "minPremium"),
      maxPremium: fNumOpt(formData, "maxPremium"),
    },
  });
  await audit({ userId: session.userId, action: "CARRIER_APPETITE_UPSERT", entityType: "Carrier", entityId: carrierId, detail: lineOfBusiness });
  revalidatePath(`/carriers/${carrierId}`);
  redirect(`/carriers/${carrierId}?toast=${encodeURIComponent("Appetite row saved")}`);
}

export async function deleteAppetite(carrierId: string, appetiteId: string) {
  await requireSession();
  // Scope by carrierId so a forged appetiteId can't touch another carrier's row.
  await prisma.carrierAppetiteRow.deleteMany({ where: { id: appetiteId, carrierId } });
  revalidatePath(`/carriers/${carrierId}`);
  redirect(`/carriers/${carrierId}?toast=${encodeURIComponent("Appetite row removed")}`);
}
