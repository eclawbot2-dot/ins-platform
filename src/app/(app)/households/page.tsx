import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Field } from "@/components/ui/form";
import { fmtMoney, toNum } from "@/lib/money";
import { createHousehold } from "./actions";

export const metadata = { title: "Households" };
export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["ACTIVE", "BOUND", "RENEWED"] as const;

export default async function HouseholdsPage() {
  const households = await prisma.household.findMany({
    orderBy: { name: "asc" },
    include: {
      members: {
        select: {
          id: true,
          name: true,
          policies: { where: { status: { in: [...ACTIVE_STATUSES] } }, select: { premium: true } },
        },
      },
    },
  });

  const rows = households.map((h) => {
    const premium = h.members.reduce(
      (acc, m) => acc + m.policies.reduce((a, p) => a + toNum(p.premium), 0),
      0,
    );
    const policyCount = h.members.reduce((acc, m) => acc + m.policies.length, 0);
    return {
      id: h.id,
      name: h.name,
      memberCount: h.members.length,
      policyCount,
      premium,
    };
  });

  return (
    <>
      <PageHeader
        title="Households"
        description="Group related clients into a household for a combined 360, cross-sell across the family book, and de-duplicated outreach."
      />

      <DataTable
        rows={rows}
        rowHref={(h) => `/households/${h.id}`}
        emptyMessage="No households yet — create one below, or link a client from their 360."
        columns={[
          { key: "name", header: "Household" },
          { key: "members", header: "Members", render: (h) => `${h.memberCount}` },
          { key: "policies", header: "Policies", render: (h) => `${h.policyCount}` },
          {
            key: "premium",
            header: "Combined premium",
            className: "text-right",
            render: (h) => fmtMoney(h.premium),
          },
        ]}
      />

      <div className="card-pad mt-6 max-w-xl">
        <h2 className="section-title mb-3">Create a household</h2>
        <form action={createHousehold} className="space-y-4">
          <Field label="Household name" required>
            <input name="name" required className="input" placeholder="The Garcia family" />
          </Field>
          <Field label="Notes">
            <textarea name="notes" rows={2} className="input" />
          </Field>
          <button type="submit" className="btn-primary">
            Create household
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Add members from the household page, or link a client from their profile.
        </p>
      </div>
    </>
  );
}
