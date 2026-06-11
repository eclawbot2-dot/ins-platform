"use client";

/**
 * Team — compact List view (Card/List toggle lives in the page via
 * <ViewToggle storageKey="teamViewMode">). Sort state persists as
 * teamSortKey/teamSortDirection; premiums/counts sort numerically and
 * last-login by real date value.
 */

import { Badge } from "@/components/ui/badge";
import { SortableHeader, useSortableData } from "@/components/ui/sortable";
import { ariaSort, type SortAccessor } from "@/lib/sort";

export type TeamRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  active: boolean;
  policiesCount: number;
  clientsCount: number;
  ytdPremium: number;
  ytdPremiumFmt: string;
  ytdCommission: number;
  ytdCommissionFmt: string;
  lastLoginAt: number | null; // epoch ms
  lastLoginFmt: string;
};

const ACCESSORS: Record<string, SortAccessor<TeamRow>> = {
  name: (u) => u.name,
  role: (u) => u.role,
  email: (u) => u.email,
  status: (u) => u.active,
  policies: (u) => u.policiesCount,
  clients: (u) => u.clientsCount,
  premium: (u) => u.ytdPremium,
  commission: (u) => u.ytdCommission,
  lastLogin: (u) => u.lastLoginAt,
};

export function TeamListView({ rows }: { rows: TeamRow[] }) {
  const { sorted, sortKey, sortDirection, requestSort } = useSortableData(rows, ACCESSORS, {
    storagePrefix: "team",
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
            {header("name", "Name")}
            {header("role", "Role")}
            {header("email", "Email")}
            {header("status", "Status")}
            {header("policies", "Policies", "text-right")}
            {header("clients", "Clients", "text-right")}
            {header("premium", "YTD premium", "text-right")}
            {header("commission", "YTD commission", "text-right")}
            {header("lastLogin", "Last login")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((u) => (
            <tr key={u.id} className="h-14">
              <td className="font-medium text-slate-800">{u.name}</td>
              <td>
                <Badge tone={u.role === "ADMIN" ? "violet" : u.role === "PRODUCER" ? "blue" : "slate"}>{u.role}</Badge>
              </td>
              <td className="text-slate-600">{u.email}</td>
              <td>{u.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}</td>
              <td className="text-right">{u.policiesCount}</td>
              <td className="text-right">{u.clientsCount}</td>
              <td className="text-right">{u.ytdPremiumFmt}</td>
              <td className="text-right">{u.ytdCommissionFmt}</td>
              <td className="whitespace-nowrap">{u.lastLoginFmt}</td>
            </tr>
          ))}
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={9} className="py-8 text-center text-sm text-slate-400">
                No team members.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
