import { Download, FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal";
import { portalDocumentWhere } from "@/lib/domain/portal-scope";
import { humanize } from "@/lib/labels";
import { fmtDate } from "@/lib/domain/dates";

export const dynamic = "force-dynamic";

export default async function PortalDocumentsPage() {
  const session = await requirePortalSession();

  // Only documents the agency explicitly shared (visibleToClient).
  const documents = await prisma.document.findMany({
    where: portalDocumentWhere(session.clientId),
    include: { policy: { select: { policyNumber: true } } },
    orderBy: { createdAt: "desc" },
  });

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
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>Policy</th>
                <th>Added</th>
                <th aria-label="Download" />
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                      <FileText className="h-4 w-4 text-gold-500" /> {d.fileName}
                    </span>
                  </td>
                  <td>{humanize(d.docType)}</td>
                  <td>{d.policy?.policyNumber ?? "—"}</td>
                  <td>{fmtDate(d.createdAt)}</td>
                  <td className="text-right">
                    <a href={`/api/portal/documents/${d.id}`} className="btn btn-sm">
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
