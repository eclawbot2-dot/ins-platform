"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStr, fStrOpt, fNum, fDate, fEnum } from "@/lib/form";
import { expectedCommission, scheduleRateFor } from "@/lib/domain/commissions";
import { addYears } from "@/lib/domain/dates";
import { ALL_LOBS } from "@/lib/labels";
import { toNum } from "@/lib/money";
import type { QuoteStatus } from "@prisma/client";

const QUOTE_STATUSES: QuoteStatus[] = ["DRAFT", "SUBMITTED", "RECEIVED", "PRESENTED", "ACCEPTED", "DECLINED"];

export async function createQuoteRequest(formData: FormData) {
  const session = await requireSession();
  const qr = await prisma.quoteRequest.create({
    data: {
      clientId: fStrOpt(formData, "clientId"),
      leadId: fStrOpt(formData, "leadId"),
      lineOfBusiness: fEnum(formData, "lineOfBusiness", ALL_LOBS, "AUTO"),
      effectiveDate: fDate(formData, "effectiveDate"),
      notes: fStrOpt(formData, "notes"),
      ownerId: fStrOpt(formData, "ownerId") ?? session.userId,
    },
  });
  redirect(`/quotes/${qr.id}?toast=${encodeURIComponent("Quote request created")}`);
}

export async function addQuote(quoteRequestId: string, formData: FormData) {
  await requireSession();
  await prisma.quote.create({
    data: {
      quoteRequestId,
      carrierId: fStr(formData, "carrierId"),
      premium: fNum(formData, "premium"),
      status: fEnum(formData, "status", QUOTE_STATUSES, "RECEIVED"),
      validUntil: fDate(formData, "validUntil"),
      coverageSummary: fStrOpt(formData, "coverageSummary"),
      notes: fStrOpt(formData, "notes"),
    },
  });
  await prisma.quoteRequest.update({ where: { id: quoteRequestId }, data: { status: "QUOTED" } });
  revalidatePath(`/quotes/${quoteRequestId}`);
  redirect(`/quotes/${quoteRequestId}?toast=${encodeURIComponent("Quote added")}`);
}

export async function setQuoteStatus(quoteRequestId: string, quoteId: string, status: QuoteStatus) {
  await requireSession();
  await prisma.quote.update({ where: { id: quoteId }, data: { status } });
  if (status === "PRESENTED") {
    await prisma.quoteRequest.update({ where: { id: quoteRequestId }, data: { status: "PRESENTED" } });
  }
  revalidatePath(`/quotes/${quoteRequestId}`);
  redirect(`/quotes/${quoteRequestId}?toast=${encodeURIComponent("Quote updated")}`);
}

export async function markRequestLost(quoteRequestId: string) {
  await requireSession();
  await prisma.quoteRequest.update({ where: { id: quoteRequestId }, data: { status: "LOST" } });
  redirect(`/quotes/${quoteRequestId}?toast=${encodeURIComponent("Marked lost")}`);
}

/**
 * Bind a quote → create the policy. Pulls the commission rate from the
 * carrier's schedule for the LOB (new business), falling back to the
 * form value.
 */
export async function bindQuote(quoteId: string, formData: FormData) {
  const session = await requireSession();
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { quoteRequest: { include: { lead: true } }, carrier: { include: { schedules: true } } },
  });
  if (!quote) redirect(`/quotes?toastError=${encodeURIComponent("Quote not found")}`);
  const qr = quote.quoteRequest;

  // Resolve the client: the request's client, or convert the lead.
  let clientId = qr.clientId;
  if (!clientId && qr.lead) {
    const client = await prisma.client.create({
      data: {
        type: "INDIVIDUAL",
        status: "ACTIVE",
        name: `${qr.lead.firstName} ${qr.lead.lastName}`,
        firstName: qr.lead.firstName,
        lastName: qr.lead.lastName,
        email: qr.lead.email,
        phone: qr.lead.phone,
        zip: qr.lead.zip,
        source: qr.lead.source,
      },
    });
    await prisma.lead.update({ where: { id: qr.lead.id }, data: { clientId: client.id, status: "CONVERTED" } });
    clientId = client.id;
  }
  if (!clientId) {
    redirect(`/quotes/${qr.id}?toastError=${encodeURIComponent("Quote request has no client or lead to bind for")}`);
  }

  const policyNumber = fStr(formData, "policyNumber");
  if (!policyNumber) {
    redirect(`/quotes/${qr.id}?toastError=${encodeURIComponent("Policy number is required to bind")}`);
  }
  const exists = await prisma.policy.findUnique({ where: { policyNumber } });
  if (exists) {
    redirect(`/quotes/${qr.id}?toastError=${encodeURIComponent(`Policy number ${policyNumber} already exists`)}`);
  }

  const premium = toNum(quote.premium);
  const scheduleRate = scheduleRateFor(
    quote.carrier.schedules.map((s) => ({
      lineOfBusiness: s.lineOfBusiness,
      newPct: toNum(s.newPct),
      renewalPct: toNum(s.renewalPct),
    })),
    qr.lineOfBusiness,
    true,
  );
  const ratePct = fNum(formData, "commissionRatePct") || scheduleRate || 10;
  const effectiveDate = fDate(formData, "effectiveDate") ?? qr.effectiveDate ?? new Date();

  const producerId = fStrOpt(formData, "producerId") ?? qr.ownerId;

  const policy = await prisma.policy.create({
    data: {
      policyNumber,
      clientId,
      carrierId: quote.carrierId,
      lineOfBusiness: qr.lineOfBusiness,
      status: "BOUND",
      billingType: fEnum(formData, "billingType", ["AGENCY_BILL", "DIRECT_BILL"] as const, "DIRECT_BILL"),
      premium,
      commissionRatePct: ratePct,
      commissionAmount: expectedCommission(premium, ratePct),
      isNewBusiness: true,
      effectiveDate,
      expirationDate: addYears(effectiveDate, 1),
      boundAt: new Date(),
      producerId,
    },
  });
  await prisma.policyProducerSplit.create({ data: { policyId: policy.id, producerId, pct: 100 } });
  await prisma.quote.update({ where: { id: quoteId }, data: { status: "ACCEPTED", boundPolicyId: policy.id } });
  await prisma.quoteRequest.update({ where: { id: qr.id }, data: { status: "BOUND" } });
  // Move any linked opportunity to BOUND.
  if (qr.clientId) {
    await prisma.opportunity.updateMany({
      where: { clientId: qr.clientId, lineOfBusiness: qr.lineOfBusiness, stage: { in: ["NEW", "CONTACTED", "QUOTING", "PROPOSAL"] } },
      data: { stage: "BOUND" },
    });
  }
  await audit({ userId: session.userId, action: "QUOTE_BIND", entityType: "Policy", entityId: policy.id, detail: policyNumber });
  redirect(`/policies/${policy.id}?toast=${encodeURIComponent(`Bound as ${policyNumber}`)}`);
}
