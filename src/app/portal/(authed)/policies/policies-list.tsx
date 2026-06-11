"use client";

/**
 * Portal policies — compact List view for the Card/List toggle.
 * Click target matches the cards (policy detail). Premium and dates
 * sort on real numeric/date values; sort persists per portal user
 * browser as portalPoliciesSortKey/portalPoliciesSortDirection.
 */

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { SortableHeader, ariaSort, useSortableData } from "@/components/ui/sortable";
import type { BadgeTone } from "@/lib/labels";
import type { SortAccessor } from "@/lib/sort";

export type PortalPolicyRow = {
  id: string;
  lobLabel: string;
  policyNumber: string;
  carrierName: string;
  statusLabel: string;
  statusTone: BadgeTone;
  effectiveAt: number;
  effectiveFmt: string;
  expiresAt: number;
  expiresFmt: string;
  premium: number;
  premiumFmt: string;
};

const ACCESSORS: Record<string, SortAccessor<PortalPolicyRow>> = {
  coverage: (p) => p.lobLabel,
  number: (p) => p.policyNumber,
  carrier: (p) => p.carrierName,
  status: (p) => p.statusLabel,
  effective: (p) => p.effectiveAt,
  expires: (p) => p.expiresAt,
  premium: (p) => p.premium,
};

export function PortalPoliciesList({ rows }: { rows: PortalPolicyRow[] }) {
  const router = useRouter();
  const { sorted, sortKey, sortDirection, requestSort } = useSortableData(rows, ACCESSORS, {
    storagePrefix: "portalPolicies",
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
            {header("coverage", "Coverage")}
            {header("number", "Policy #")}
            {header("carrier", "Carrier")}
            {header("status", "Status")}
            {header("effective", "Effective")}
            {header("expires", "Expires")}
            {header("premium", "Premium", "text-right")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id} className="h-14 cursor-pointer" onClick={() => router.push(`/portal/policies/${p.id}`)}>
              <td className="font-medium text-navy-700">{p.lobLabel}</td>
              <td className="whitespace-nowrap text-slate-600">{p.policyNumber}</td>
              <td>{p.carrierName}</td>
              <td>
                <Badge tone={p.statusTone}>{p.statusLabel}</Badge>
              </td>
              <td className="whitespace-nowrap">{p.effectiveFmt}</td>
              <td className="whitespace-nowrap">{p.expiresFmt}</td>
              <td className="text-right font-medium text-slate-800">{p.premiumFmt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
