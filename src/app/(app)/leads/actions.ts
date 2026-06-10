"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStr, fStrOpt, fEnum, fEnumOpt } from "@/lib/form";
import { scoreLead } from "@/lib/domain/lead-scoring";
import { ALL_LOBS } from "@/lib/labels";
import type { LeadStatus } from "@prisma/client";

const LEAD_STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];

export async function createLead(formData: FormData) {
  const session = await requireSession();
  const data = {
    firstName: fStr(formData, "firstName") || "Unknown",
    lastName: fStr(formData, "lastName") || "Lead",
    email: fStrOpt(formData, "email"),
    phone: fStrOpt(formData, "phone"),
    zip: fStrOpt(formData, "zip"),
    lineOfBusiness: fEnumOpt(formData, "lineOfBusiness", ALL_LOBS),
    message: fStrOpt(formData, "message"),
    source: fStrOpt(formData, "source"),
    assignedToId: fStrOpt(formData, "assignedToId"),
    campaignId: fStrOpt(formData, "campaignId"),
  };
  const score = scoreLead(data);
  const lead = await prisma.lead.create({ data: { ...data, score } });
  await audit({ userId: session.userId, action: "LEAD_CREATE", entityType: "Lead", entityId: lead.id });
  redirect(`/leads/${lead.id}?toast=${encodeURIComponent("Lead created")}`);
}

export async function updateLead(id: string, formData: FormData) {
  await requireSession();
  const data = {
    firstName: fStr(formData, "firstName") || "Unknown",
    lastName: fStr(formData, "lastName") || "Lead",
    email: fStrOpt(formData, "email"),
    phone: fStrOpt(formData, "phone"),
    zip: fStrOpt(formData, "zip"),
    lineOfBusiness: fEnumOpt(formData, "lineOfBusiness", ALL_LOBS),
    message: fStrOpt(formData, "message"),
    source: fStrOpt(formData, "source"),
    assignedToId: fStrOpt(formData, "assignedToId"),
    campaignId: fStrOpt(formData, "campaignId"),
    status: fEnum(formData, "status", LEAD_STATUSES, "NEW"),
  };
  const score = scoreLead(data);
  await prisma.lead.update({ where: { id }, data: { ...data, score } });
  redirect(`/leads/${id}?toast=${encodeURIComponent("Lead updated")}`);
}

export async function setLeadStatus(id: string, status: LeadStatus) {
  await requireSession();
  await prisma.lead.update({ where: { id }, data: { status } });
  revalidatePath(`/leads/${id}`);
  redirect(`/leads/${id}?toast=${encodeURIComponent(`Marked ${status.toLowerCase()}`)}`);
}

/**
 * Convert a lead into a client (+ opportunity). Creates the client from
 * lead fields, links the lead, marks it CONVERTED, and opens a pipeline
 * opportunity when an LOB is present.
 */
export async function convertLead(id: string) {
  const session = await requireSession();
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) redirect(`/leads?toastError=${encodeURIComponent("Lead not found")}`);

  if (lead.clientId) {
    redirect(`/clients/${lead.clientId}?toast=${encodeURIComponent("Lead already converted")}`);
  }

  const client = await prisma.client.create({
    data: {
      type: "INDIVIDUAL",
      status: "PROSPECT",
      name: `${lead.firstName} ${lead.lastName}`,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      zip: lead.zip,
      source: lead.source,
      producerId: lead.assignedToId,
    },
  });
  await prisma.lead.update({ where: { id }, data: { clientId: client.id, status: "CONVERTED" } });
  if (lead.lineOfBusiness) {
    await prisma.opportunity.create({
      data: {
        name: `${client.name} — ${lead.lineOfBusiness}`,
        stage: "NEW",
        lineOfBusiness: lead.lineOfBusiness,
        clientId: client.id,
        leadId: lead.id,
        ownerId: lead.assignedToId ?? session.userId,
      },
    });
  }
  await audit({ userId: session.userId, action: "LEAD_CONVERT", entityType: "Lead", entityId: id, detail: `→ client ${client.id}` });
  redirect(`/clients/${client.id}?toast=${encodeURIComponent("Lead converted to client")}`);
}

export async function addLeadActivity(id: string, formData: FormData) {
  const session = await requireSession();
  await prisma.activity.create({
    data: {
      leadId: id,
      userId: session.userId,
      type: fEnum(formData, "type", ["NOTE", "CALL", "EMAIL", "MEETING"] as const, "NOTE"),
      subject: fStr(formData, "subject") || "Note",
      body: fStrOpt(formData, "body"),
    },
  });
  revalidatePath(`/leads/${id}`);
  redirect(`/leads/${id}?toast=${encodeURIComponent("Activity logged")}`);
}
