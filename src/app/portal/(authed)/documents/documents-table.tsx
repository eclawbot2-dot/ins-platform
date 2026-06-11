"use client";

/**
 * Portal documents — sortable table (file, type, policy, added date).
 * Added sorts by real date value; the Download action column is not
 * sortable. Sort persists as portalDocumentsSortKey/Direction.
 */

import { Download, FileText } from "lucide-react";
import { SortableHeader, ariaSort, useSortableData } from "@/components/ui/sortable";
import type { SortAccessor } from "@/lib/sort";

export type PortalDocumentRow = {
  id: string;
  fileName: string;
  typeLabel: string;
  policyNumber: string | null;
  addedAt: number;
  addedFmt: string;
};

const ACCESSORS: Record<string, SortAccessor<PortalDocumentRow>> = {
  file: (d) => d.fileName,
  type: (d) => d.typeLabel,
  policy: (d) => d.policyNumber,
  added: (d) => d.addedAt,
};

export function PortalDocumentsTable({ rows }: { rows: PortalDocumentRow[] }) {
  const { sorted, sortKey, sortDirection, requestSort } = useSortableData(rows, ACCESSORS, {
    storagePrefix: "portalDocuments",
  });

  const header = (key: string, label: string) => (
    <th aria-sort={ariaSort(sortKey === key, sortDirection)}>
      <SortableHeader label={label} active={sortKey === key} direction={sortDirection} onClick={() => requestSort(key)} />
    </th>
  );

  return (
    <div className="card overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            {header("file", "File")}
            {header("type", "Type")}
            {header("policy", "Policy")}
            {header("added", "Added")}
            <th aria-label="Download" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => (
            <tr key={d.id}>
              <td>
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                  <FileText className="h-4 w-4 text-gold-500" /> {d.fileName}
                </span>
              </td>
              <td>{d.typeLabel}</td>
              <td>{d.policyNumber ?? "—"}</td>
              <td>{d.addedFmt}</td>
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
  );
}
