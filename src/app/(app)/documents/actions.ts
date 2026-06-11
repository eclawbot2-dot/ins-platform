"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStrOpt, fEnum, fBool } from "@/lib/form";
import { saveUpload } from "@/lib/storage";
import type { DocType } from "@prisma/client";

const DOC_TYPES: DocType[] = [
  "POLICY_DOC", "APPLICATION", "ENDORSEMENT", "CERTIFICATE", "CLAIM_DOC",
  "CORRESPONDENCE", "ID_CARD", "LOSS_RUN", "OTHER",
];

export async function uploadDocument(formData: FormData) {
  const session = await requireSession();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/documents?toastError=${encodeURIComponent("Choose a file")}`);
  }
  let stored: { storedPath: string; sizeBytes: number };
  try {
    stored = await saveUpload(file);
  } catch (err) {
    redirect(`/documents?toastError=${encodeURIComponent(err instanceof Error ? err.message : "Upload failed")}`);
  }
  const doc = await prisma.document.create({
    data: {
      fileName: file.name,
      storedPath: stored.storedPath,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: stored.sizeBytes,
      docType: fEnum(formData, "docType", DOC_TYPES, "OTHER"),
      clientId: fStrOpt(formData, "clientId"),
      policyId: fStrOpt(formData, "policyId"),
      claimId: fStrOpt(formData, "claimId"),
      visibleToClient: fBool(formData, "visibleToClient"),
      uploadedById: session.userId,
    },
  });
  await audit({ userId: session.userId, action: "DOCUMENT_UPLOAD", entityType: "Document", entityId: doc.id, detail: file.name });
  revalidatePath("/documents");
  redirect(`/documents?toast=${encodeURIComponent("Document uploaded")}`);
}

/** Toggle whether the client portal can see/download this document. */
export async function toggleDocumentVisibility(id: string) {
  const session = await requireSession();
  const doc = await prisma.document.findUnique({ where: { id }, select: { visibleToClient: true, fileName: true } });
  if (!doc) redirect(`/documents?toastError=${encodeURIComponent("Document not found")}`);
  const next = !doc.visibleToClient;
  await prisma.document.update({ where: { id }, data: { visibleToClient: next } });
  await audit({
    userId: session.userId,
    action: next ? "DOCUMENT_SHARE_PORTAL" : "DOCUMENT_UNSHARE_PORTAL",
    entityType: "Document",
    entityId: id,
    detail: doc.fileName,
  });
  revalidatePath("/documents");
  redirect(`/documents?toast=${encodeURIComponent(next ? "Document shared to client portal" : "Document hidden from client portal")}`);
}

export async function deleteDocument(id: string) {
  const session = await requireSession();
  await prisma.document.delete({ where: { id } });
  await audit({ userId: session.userId, action: "DOCUMENT_DELETE", entityType: "Document", entityId: id });
  revalidatePath("/documents");
  redirect(`/documents?toast=${encodeURIComponent("Document deleted")}`);
}
