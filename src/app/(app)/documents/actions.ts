"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStrOpt, fEnum } from "@/lib/form";
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
      uploadedById: session.userId,
    },
  });
  await audit({ userId: session.userId, action: "DOCUMENT_UPLOAD", entityType: "Document", entityId: doc.id, detail: file.name });
  revalidatePath("/documents");
  redirect(`/documents?toast=${encodeURIComponent("Document uploaded")}`);
}

export async function deleteDocument(id: string) {
  const session = await requireSession();
  await prisma.document.delete({ where: { id } });
  await audit({ userId: session.userId, action: "DOCUMENT_DELETE", entityType: "Document", entityId: id });
  revalidatePath("/documents");
  redirect(`/documents?toast=${encodeURIComponent("Document deleted")}`);
}
