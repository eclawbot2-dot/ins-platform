"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fStr, fStrOpt, fNum, fDate, fEnum, fBool } from "@/lib/form";
import type { LicenseClass } from "@prisma/client";

const CLASSES: LicenseClass[] = ["PROPERTY_CASUALTY", "LIFE_HEALTH", "PERSONAL_LINES", "SURPLUS_LINES", "ADJUSTER"];

export async function addLicense(formData: FormData) {
  await requireSession();
  await prisma.license.create({
    data: {
      userId: fStr(formData, "userId"),
      state: fStr(formData, "state").toUpperCase() || "SC",
      licenseNumber: fStr(formData, "licenseNumber"),
      npn: fStrOpt(formData, "npn"),
      licenseClass: fEnum(formData, "licenseClass", CLASSES, "PROPERTY_CASUALTY"),
      issuedAt: fDate(formData, "issuedAt"),
      expiresAt: fDate(formData, "expiresAt") ?? new Date(),
      ceRequiredHours: Math.round(fNum(formData, "ceRequiredHours", 24)),
      notes: fStrOpt(formData, "notes"),
    },
  });
  revalidatePath("/compliance");
  redirect(`/compliance?toast=${encodeURIComponent("License added")}`);
}

export async function deleteLicense(id: string) {
  await requireSession();
  await prisma.license.delete({ where: { id } });
  revalidatePath("/compliance");
  redirect(`/compliance?toast=${encodeURIComponent("License removed")}`);
}

export async function renewLicense(id: string, formData: FormData) {
  await requireSession();
  const expiresAt = fDate(formData, "expiresAt");
  if (!expiresAt) redirect(`/compliance?toastError=${encodeURIComponent("New expiration date required")}`);
  await prisma.license.update({ where: { id }, data: { expiresAt } });
  revalidatePath("/compliance");
  redirect(`/compliance?toast=${encodeURIComponent("License renewed")}`);
}

export async function addCeCredit(licenseId: string, formData: FormData) {
  await requireSession();
  await prisma.ceCredit.create({
    data: {
      licenseId,
      courseName: fStr(formData, "courseName") || "CE course",
      provider: fStrOpt(formData, "provider"),
      hours: fNum(formData, "hours"),
      isEthics: fBool(formData, "isEthics"),
      completedAt: fDate(formData, "completedAt") ?? new Date(),
    },
  });
  revalidatePath("/compliance");
  redirect(`/compliance?toast=${encodeURIComponent("CE credit recorded")}`);
}

export async function addEoPolicy(formData: FormData) {
  await requireSession();
  await prisma.eoPolicy.create({
    data: {
      carrierName: fStr(formData, "carrierName") || "Unknown carrier",
      policyNumber: fStr(formData, "policyNumber") || "—",
      limitEach: fNum(formData, "limitEach"),
      limitAggregate: fNum(formData, "limitAggregate"),
      premium: fNum(formData, "premium"),
      effectiveDate: fDate(formData, "effectiveDate") ?? new Date(),
      expirationDate: fDate(formData, "expirationDate") ?? new Date(),
      notes: fStrOpt(formData, "notes"),
    },
  });
  revalidatePath("/compliance");
  redirect(`/compliance?toast=${encodeURIComponent("E&O policy added")}`);
}

export async function deleteEoPolicy(id: string) {
  await requireSession();
  await prisma.eoPolicy.delete({ where: { id } });
  revalidatePath("/compliance");
  redirect(`/compliance?toast=${encodeURIComponent("E&O policy removed")}`);
}
