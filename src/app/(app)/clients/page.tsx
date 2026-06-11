import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { SearchBar } from "@/components/ui/list-controls";
import { CLIENT_STATUS_LABELS } from "@/lib/labels";
import { fmtMoney, toNum } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";
import { ClientsView, type ClientRow } from "./clients-view";
import type { ClientStatus, Prisma } from "@prisma/client";

export const metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

const STATUSES: ClientStatus[] = ["PROSPECT", "ACTIVE", "INACTIVE", "FORMER"];

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const statusFilter = STATUSES.includes(status as ClientStatus) ? (status as ClientStatus) : undefined;

  const where: Prisma.ClientWhereInput = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { city: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  // Filter server-side (URL is the single data source for both views);
  // sorting + pagination happen client-side AFTER the filter so sort
  // applies to the whole result set, not one page (spec §8).
  const clients = await prisma.client.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      producer: { select: { name: true } },
      policies: { where: { status: { in: ["ACTIVE", "BOUND"] } }, select: { premium: true } },
    },
  });

  const rows: ClientRow[] = clients.map((c) => {
    const premium = c.policies.reduce((acc, p) => acc + toNum(p.premium), 0);
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      status: c.status,
      statusLabel: CLIENT_STATUS_LABELS[c.status],
      type: c.type,
      city: c.city,
      state: c.state,
      producerName: c.producer?.name ?? null,
      policiesCount: c.policies.length,
      activePremium: premium,
      activePremiumFmt: fmtMoney(premium),
      addedAt: c.createdAt.getTime(),
      addedDateFmt: fmtDate(c.createdAt),
    };
  });

  return (
    <>
      <PageHeader
        title="Clients"
        description="Individuals and businesses in the agency book."
        actions={
          <Link href="/clients/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New client
          </Link>
        }
      />
      <ClientsView
        clients={rows}
        toolbar={
          <SearchBar action="/clients" q={q} placeholder="Search name, email, phone…">
            <select name="status" defaultValue={statusFilter ?? ""} className="input w-40">
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CLIENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </SearchBar>
        }
        emptyMessage={
          q || statusFilter ? (
            "No clients match your search."
          ) : (
            <span>
              No clients yet.{" "}
              <Link href="/clients/new" className="font-medium text-navy-700 hover:underline">
                Add your first client →
              </Link>
            </span>
          )
        }
      />
    </>
  );
}
