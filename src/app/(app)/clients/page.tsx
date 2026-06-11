import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { SearchBar, Pagination, PAGE_SIZE, parsePage } from "@/components/ui/list-controls";
import { Badge } from "@/components/ui/badge";
import { CLIENT_STATUS_LABELS } from "@/lib/labels";
import { fmtMoney, toNum } from "@/lib/money";
import type { ClientStatus, Prisma } from "@prisma/client";

export const metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

const STATUSES: ClientStatus[] = ["PROSPECT", "ACTIVE", "INACTIVE", "FORMER"];

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q, status, page: pageRaw } = await searchParams;
  const page = parsePage(pageRaw);
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

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        producer: { select: { name: true } },
        policies: { where: { status: { in: ["ACTIVE", "BOUND"] } }, select: { premium: true } },
      },
    }),
    prisma.client.count({ where }),
  ]);

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
      <div className="mb-4">
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
      </div>
      <DataTable
        rows={clients}
        rowHref={(c) => `/clients/${c.id}`}
        emptyMessage={
          q || statusFilter ? (
            "No clients match your search."
          ) : (
            <span>
              No clients yet.{" "}
              <Link href="/clients/new" className="font-medium text-indigo-700 hover:underline">
                Add your first client →
              </Link>
            </span>
          )
        }
        columns={[
          { key: "name", header: "Name" },
          {
            key: "type",
            header: "Type",
            className: "hidden lg:table-cell",
            render: (c) => (c.type === "BUSINESS" ? "Business" : "Individual"),
          },
          {
            key: "status",
            header: "Status",
            render: (c) => (
              <Badge tone={c.status === "ACTIVE" ? "green" : c.status === "PROSPECT" ? "blue" : "slate"}>
                {CLIENT_STATUS_LABELS[c.status]}
              </Badge>
            ),
          },
          { key: "email", header: "Email", className: "hidden md:table-cell", render: (c) => c.email ?? "—" },
          { key: "phone", header: "Phone", render: (c) => c.phone ?? "—" },
          {
            key: "city",
            header: "City",
            className: "hidden lg:table-cell",
            render: (c) => (c.city ? `${c.city}, ${c.state ?? ""}` : "—"),
          },
          { key: "producer", header: "Producer", className: "hidden md:table-cell", render: (c) => c.producer?.name ?? "—" },
          {
            key: "premium",
            header: "Active premium",
            className: "text-right",
            render: (c) => fmtMoney(c.policies.reduce((acc, p) => acc + toNum(p.premium), 0)),
          },
        ]}
      />
      <div className="mt-3">
        <Pagination basePath="/clients" page={page} total={total} params={{ q, status: statusFilter }} />
      </div>
    </>
  );
}
