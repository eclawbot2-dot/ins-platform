"use client";

/**
 * Portal claims — compact List view for the Card/List toggle.
 * Same click target as the cards (claim detail); loss dates sort by
 * real date values; sort persists as portalClaimsSortKey/Direction.
 */

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { SortableHeader, ariaSort, useSortableData } from "@/components/ui/sortable";
import type { BadgeTone } from "@/lib/labels";
import type { SortAccessor } from "@/lib/sort";

export type PortalClaimRow = {
  id: string;
  claimNumber: string;
  description: string;
  lobLabel: string;
  policyNumber: string;
  lossAt: number;
  lossFmt: string;
  statusLabel: string;
  statusTone: BadgeTone;
};

const ACCESSORS: Record<string, SortAccessor<PortalClaimRow>> = {
  number: (c) => c.claimNumber,
  description: (c) => c.description,
  coverage: (c) => c.lobLabel,
  policy: (c) => c.policyNumber,
  loss: (c) => c.lossAt,
  status: (c) => c.statusLabel,
};

export function PortalClaimsList({ rows }: { rows: PortalClaimRow[] }) {
  const router = useRouter();
  const { sorted, sortKey, sortDirection, requestSort } = useSortableData(rows, ACCESSORS, {
    storagePrefix: "portalClaims",
  });

  const header = (key: string, label: string, className?: string) => (
    <th className={className} aria-sort={ariaSort(sortKey === key, sortDirection)}>
      <SortableHeader label={label} active={sortKey === key} direction={sortDirection} onClick={() => requestSort(key)} />
    </th>
  );

  return (
    <div className="card overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            {header("number", "Claim #")}
            {header("description", "Description")}
            {header("coverage", "Coverage")}
            {header("policy", "Policy #")}
            {header("loss", "Date of loss")}
            {header("status", "Status")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.id} className="h-14 cursor-pointer" onClick={() => router.push(`/portal/claims/${c.id}`)}>
              <td className="whitespace-nowrap font-medium text-navy-700">{c.claimNumber}</td>
              <td className="max-w-xs truncate text-slate-600">{c.description}</td>
              <td>{c.lobLabel}</td>
              <td className="whitespace-nowrap">{c.policyNumber}</td>
              <td className="whitespace-nowrap">{c.lossFmt}</td>
              <td>
                <Badge tone={c.statusTone}>{c.statusLabel}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
