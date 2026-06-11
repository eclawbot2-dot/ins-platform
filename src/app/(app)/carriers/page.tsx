import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { SearchBar } from "@/components/ui/list-controls";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { APPOINTMENT_LABELS } from "@/lib/labels";
import { fmtMoney, toNum } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";
import { applySort, parseSortParams } from "@/lib/sort";
import { createCarrier } from "./actions";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Carriers" };
export const dynamic = "force-dynamic";

export default async function CarriersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; dir?: string }>;
}) {
  const { q, sort, dir } = await searchParams;
  const sortState = parseSortParams(sort, dir, ["name", "naic", "rating", "appointment", "expires", "mga", "schedules", "book"]);
  const where: Prisma.CarrierWhereInput = q ? { name: { contains: q, mode: "insensitive" } } : {};

  const carriers = await prisma.carrier.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      policies: { where: { status: { in: ["ACTIVE", "BOUND"] } }, select: { premium: true } },
      schedules: { select: { id: true } },
    },
  });

  return (
    <>
      <PageHeader title="Carriers" description="Carrier directory, appointments, and commission schedules." />
      <div className="mb-4">
        <SearchBar action="/carriers" q={q} placeholder="Search carriers…" />
      </div>
      <DataTable
        rows={applySort(
          carriers,
          {
            name: (c) => c.name,
            naic: (c) => c.naicCode,
            rating: (c) => c.amBestRating,
            appointment: (c) => APPOINTMENT_LABELS[c.appointmentStatus],
            expires: (c) => c.appointmentExpiresAt,
            mga: (c) => c.isMga,
            schedules: (c) => c.schedules.length,
            book: (c) => c.policies.reduce((acc, p) => acc + toNum(p.premium), 0),
          },
          sortState,
        )}
        rowHref={(c) => `/carriers/${c.id}`}
        sort={{ ...sortState, basePath: "/carriers", params: { q } }}
        emptyMessage="No carriers."
        columns={[
          { key: "name", header: "Carrier", sortable: true },
          { key: "naic", header: "NAIC", sortable: true, render: (c) => c.naicCode ?? "—" },
          { key: "rating", header: "AM Best", sortable: true, render: (c) => c.amBestRating ?? "—" },
          {
            key: "appointment",
            header: "Appointment",
            sortable: true,
            render: (c) => (
              <Badge tone={c.appointmentStatus === "APPOINTED" ? "green" : c.appointmentStatus === "PENDING" ? "amber" : "slate"}>
                {APPOINTMENT_LABELS[c.appointmentStatus]}
              </Badge>
            ),
          },
          {
            key: "expires",
            header: "Appt expires",
            sortable: true,
            render: (c) => (c.appointmentExpiresAt ? fmtDate(c.appointmentExpiresAt) : "—"),
          },
          { key: "mga", header: "Type", sortable: true, render: (c) => (c.isMga ? "MGA" : "Carrier") },
          { key: "schedules", header: "Schedules", sortable: true, render: (c) => `${c.schedules.length} LOBs` },
          {
            key: "book",
            header: "Active book",
            className: "text-right",
            sortable: true,
            render: (c) => fmtMoney(c.policies.reduce((acc, p) => acc + toNum(p.premium), 0)),
          },
        ]}
      />

      <div className="card-pad mt-6 max-w-3xl">
        <h2 className="section-title mb-3">Add carrier</h2>
        <form action={createCarrier} className="space-y-4">
          <FormGrid cols={3}>
            <Field label="Name" required>
              <input name="name" required className="input" />
            </Field>
            <Field label="NAIC code">
              <input name="naicCode" className="input" />
            </Field>
            <Field label="AM Best rating">
              <input name="amBestRating" className="input" placeholder="A+" />
            </Field>
            <Field label="Portal URL">
              <input name="portalUrl" type="url" className="input" />
            </Field>
            <Field label="Phone">
              <input name="phone" className="input" />
            </Field>
            <Field label="Payment terms (days)">
              <input name="paymentTermsDays" type="number" defaultValue={30} className="input" />
            </Field>
            <Field label="Appointment status">
              <Select
                name="appointmentStatus"
                defaultValue="NOT_APPOINTED"
                options={Object.entries(APPOINTMENT_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </Field>
            <Field label="Appointed">
              <input type="date" name="appointedAt" className="input" />
            </Field>
            <Field label="Appointment expires">
              <input type="date" name="appointmentExpiresAt" className="input" />
            </Field>
          </FormGrid>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="isMga" /> This is an MGA / wholesaler
          </label>
          <button type="submit" className="btn-primary">
            Add carrier
          </button>
        </form>
      </div>
    </>
  );
}
