import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Field, Select } from "@/components/ui/form";
import { GROUP_PLAN_TYPE_LABELS } from "@/lib/labels";
import { fmtMoney } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";

export const metadata = { title: "Benefits" };
export const dynamic = "force-dynamic";

export default async function BenefitsPage() {
  const [plans, employers] = await Promise.all([
    prisma.groupPlan.findMany({
      orderBy: { renewalDate: "asc" },
      include: { client: { select: { id: true, name: true } } },
    }),
    // Business clients are the eligible employer pool for group benefits.
    prisma.client.findMany({
      where: { type: "BUSINESS" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Employee benefits"
        description="Summary-level tracking of group benefits plans for employer clients. A lightweight foundation — full census / enrollment lives in a future dedicated benefits wave."
      />

      <div className="card-pad mb-6 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
        Stub module: group plans are tracked at a summary level (headcount + rate basis). Census, eligibility and per-member enrollment are intentionally out of scope for this wave.
      </div>

      <DataTable
        rows={plans}
        rowHref={(p) => `/benefits/${p.id}`}
        emptyMessage="No group plans tracked yet."
        columns={[
          { key: "plan", header: "Plan", render: (p) => p.planName },
          { key: "type", header: "Type", render: (p) => GROUP_PLAN_TYPE_LABELS[p.planType] },
          { key: "employer", header: "Employer", render: (p) => p.client.name },
          { key: "carrier", header: "Carrier", render: (p) => p.carrierName ?? "—" },
          { key: "enrolled", header: "Enrolled / eligible", render: (p) => `${p.enrolledCount} / ${p.eligibleCount}` },
          { key: "premium", header: "Monthly premium", className: "text-right", render: (p) => (p.monthlyPremium ? fmtMoney(p.monthlyPremium) : "—") },
          { key: "renewal", header: "Renews", render: (p) => fmtDate(p.renewalDate) },
          { key: "active", header: "", render: (p) => (p.active ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>) },
        ]}
      />

      <div className="card-pad mt-6 max-w-xl">
        <h2 className="section-title mb-3">Add a group plan</h2>
        {employers.length === 0 ? (
          <p className="text-sm text-slate-500">No business clients yet — create a business (employer) client first.</p>
        ) : (
          <form method="get" action="/benefits/new" className="flex flex-wrap items-end gap-3">
            <Field label="Employer">
              <Select name="clientId" options={[{ value: "", label: "Select employer…" }, ...employers.map((e) => ({ value: e.id, label: e.name }))]} />
            </Field>
            <button type="submit" className="btn-primary">Continue</button>
          </form>
        )}
      </div>
    </>
  );
}
