"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStr, fStrOpt, fEnum, fDate } from "@/lib/form";
import { canTransition } from "@/lib/domain/signatures";
import { configuredProvider, eSignEnabled, dispatchEnvelope } from "@/lib/signatures/provider";
import { log } from "@/lib/log";
import type { SignatureDocKind, SignatureStatus } from "@prisma/client";

const DOC_KINDS: SignatureDocKind[] = ["PROPOSAL", "APPLICATION", "COI", "EOI", "POLICY_DOC", "OTHER"];

/**
 * Create a SignatureRequest and (when a real provider is configured)
 * dispatch the envelope. With no provider configured the request is
 * recorded as DRAFT/SENT for the MANUAL print-and-sign flow — staff
 * generate the packet and mark it signed by hand. The provider dispatch
 * NEVER throws up to the user: a dormant/misconfigured provider falls back
 * to the manual flow with a logged note.
 */
export async function createSignatureRequest(formData: FormData) {
  const session = await requireSession();

  const title = fStr(formData, "title");
  const signerName = fStr(formData, "signerName");
  const signerEmail = fStr(formData, "signerEmail");
  if (!title || !signerName || !signerEmail) {
    redirect(`/signatures/new?toastError=${encodeURIComponent("Title, signer name and email are required")}`);
  }

  // Only honor client/policy ids that exist (loose linkage; staff context).
  const clientId = fStrOpt(formData, "clientId");
  const policyId = fStrOpt(formData, "policyId");
  const client = clientId ? await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }) : null;
  const policy = policyId ? await prisma.policy.findUnique({ where: { id: policyId }, select: { id: true } }) : null;

  const provider = configuredProvider();
  const sendNow = fStrOpt(formData, "sendNow") != null;

  const request = await prisma.signatureRequest.create({
    data: {
      provider,
      status: "DRAFT",
      docKind: fEnum(formData, "docKind", DOC_KINDS, "OTHER"),
      title,
      signerName,
      signerEmail,
      clientId: client?.id ?? null,
      policyId: policy?.id ?? null,
      message: fStrOpt(formData, "message"),
      expiresAt: fDate(formData, "expiresAt"),
      createdById: session.userId,
    },
  });

  if (sendNow) {
    await sendEnvelopeInternal(request.id, session.userId);
  }

  await audit({ userId: session.userId, action: "SIGNATURE_REQUEST_CREATE", entityType: "SignatureRequest", entityId: request.id, detail: title });
  redirect(`/signatures/${request.id}?toast=${encodeURIComponent(sendNow ? "Signature request sent" : "Signature request created")}`);
}

/** Internal: move DRAFT → SENT, dispatching a real envelope when possible. */
async function sendEnvelopeInternal(id: string, userId: string): Promise<void> {
  const req = await prisma.signatureRequest.findUnique({ where: { id } });
  if (!req || !canTransition(req.status, "SENT")) return;

  let envelopeId: string | null = null;
  if (eSignEnabled()) {
    try {
      const result = await dispatchEnvelope({
        title: req.title,
        signerName: req.signerName,
        signerEmail: req.signerEmail,
        message: req.message,
        documentPath: req.documentPath,
      });
      envelopeId = result.envelopeId;
    } catch (err) {
      // Dormant/misconfigured provider — fall back to the manual flow.
      log.warn("esign: dispatch failed, falling back to manual", { module: "signatures", id }, err);
    }
  }

  await prisma.signatureRequest.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date(), envelopeId },
  });
  await audit({ userId, action: "SIGNATURE_REQUEST_SEND", entityType: "SignatureRequest", entityId: id });
}

export async function sendSignatureRequest(id: string) {
  const session = await requireSession();
  await sendEnvelopeInternal(id, session.userId);
  revalidatePath(`/signatures/${id}`);
  redirect(`/signatures/${id}?toast=${encodeURIComponent("Sent for signature")}`);
}

/** Manual status advance (mark signed/declined/voided/viewed). */
export async function setSignatureStatus(id: string, status: SignatureStatus, formData?: FormData) {
  const session = await requireSession();
  const req = await prisma.signatureRequest.findUnique({ where: { id } });
  if (!req) redirect(`/signatures?toastError=${encodeURIComponent("Request not found")}`);
  if (!canTransition(req.status, status)) {
    redirect(`/signatures/${id}?toastError=${encodeURIComponent(`Cannot move from ${req.status} to ${status}`)}`);
  }

  const stamp: Record<string, Date> = {};
  if (status === "VIEWED") stamp.viewedAt = new Date();
  if (status === "SIGNED") stamp.signedAt = new Date();
  if (status === "DECLINED") stamp.declinedAt = new Date();
  if (status === "VOIDED") stamp.voidedAt = new Date();

  await prisma.signatureRequest.update({
    where: { id },
    data: {
      status,
      ...stamp,
      declineReason: status === "DECLINED" && formData ? fStrOpt(formData, "declineReason") : req.declineReason,
    },
  });
  await audit({ userId: session.userId, action: `SIGNATURE_${status}`, entityType: "SignatureRequest", entityId: id });
  revalidatePath(`/signatures/${id}`);
  redirect(`/signatures/${id}?toast=${encodeURIComponent(`Marked ${status.toLowerCase()}`)}`);
}

export async function markSigned(id: string) {
  return setSignatureStatus(id, "SIGNED");
}
export async function voidSignature(id: string) {
  return setSignatureStatus(id, "VOIDED");
}
export async function declineSignature(id: string, formData: FormData) {
  return setSignatureStatus(id, "DECLINED", formData);
}
