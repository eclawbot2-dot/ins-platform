import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal";
import { portalDocumentWhere } from "@/lib/domain/portal-scope";
import { humanize } from "@/lib/labels";
import { fmtDate } from "@/lib/domain/dates";
import { PortalDocumentsTable, type PortalDocumentRow } from "./documents-table";

export const dynamic = "force-dynamic";

export default async function PortalDocumentsPage() {
  const session = await requirePortalSession();

  // Only documents the agency explicitly shared (visibleToClient).
  const documents = await prisma.document.findMany({
    where: portalDocumentWhere(session.clientId),
    include: { policy: { select: { policyNumber: true } } },
    orderBy: { createdAt: "desc" },
  });

  const rows: PortalDocumentRow[] = documents.map((d) => ({
    id: d.id,
    fileName: d.fileName,
    typeLabel: humanize(d.docType),
    policyNumber: d.policy?.policyNumber ?? null,
    addedAt: d.createdAt.getTime(),
    addedFmt: fmtDate(d.createdAt),
  }));

  return (
    <>
      <div className="mb-5">
        <h1 className="page-title">Documents</h1>
        <p className="mt-0.5 text-sm text-slate-500">Files your agency has shared with you.</p>
      </div>

      {documents.length === 0 ? (
        <div className="card-pad text-sm text-slate-600">
          No shared documents yet. If you need a policy document, ID card or certificate, contact
          your agency team and we&apos;ll post it here.
        </div>
      ) : (
        <PortalDocumentsTable rows={rows} />
      )}
    </>
  );
}
