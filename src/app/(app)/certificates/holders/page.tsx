import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Field, FormGrid } from "@/components/ui/form";
import { createHolder } from "../actions";

export const metadata = { title: "Certificate holders" };
export const dynamic = "force-dynamic";

export default async function HoldersPage() {
  const holders = await prisma.certificateHolder.findMany({
    orderBy: { name: "asc" },
    include: { certificates: { select: { id: true } } },
  });

  return (
    <>
      <PageHeader title="Certificate holders" description="Entities that request proof of coverage (GCs, lenders, landlords…)." />
      <DataTable
        rows={holders}
        emptyMessage="No holders yet."
        columns={[
          { key: "name", header: "Holder" },
          {
            key: "address",
            header: "Address",
            render: (h) =>
              h.addressLine1 ? `${h.addressLine1}, ${h.city ?? ""} ${h.state ?? ""} ${h.zip ?? ""}` : "—",
          },
          { key: "email", header: "Email", render: (h) => h.email ?? "—" },
          { key: "count", header: "Certificates", render: (h) => h.certificates.length },
        ]}
      />

      <div className="card-pad mt-6 max-w-2xl">
        <h2 className="section-title mb-3">Add holder</h2>
        <form action={createHolder} className="space-y-4">
          <FormGrid>
            <Field label="Name" required>
              <input name="name" required className="input" />
            </Field>
            <Field label="Email">
              <input name="email" type="email" className="input" />
            </Field>
            <Field label="Address line 1">
              <input name="addressLine1" className="input" />
            </Field>
            <Field label="Address line 2">
              <input name="addressLine2" className="input" />
            </Field>
          </FormGrid>
          <FormGrid cols={3}>
            <Field label="City">
              <input name="city" className="input" />
            </Field>
            <Field label="State">
              <input name="state" maxLength={2} className="input" />
            </Field>
            <Field label="ZIP">
              <input name="zip" className="input" />
            </Field>
          </FormGrid>
          <button type="submit" className="btn-primary">
            Add holder
          </button>
        </form>
      </div>
    </>
  );
}
