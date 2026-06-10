import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { LOB_LABELS, ALL_LOBS, STAGE_LABELS, stageTone } from "@/lib/labels";
import { STAGE_ORDER, pipelineValue, weightedPipelineValue, winRate } from "@/lib/domain/pipeline";
import { fmtMoney, toNum } from "@/lib/money";
import { fmtDate } from "@/lib/domain/dates";
import { StatCard } from "@/components/ui/stat-card";
import { createOpportunity, moveOpportunity } from "./actions";
import type { OpportunityStage } from "@prisma/client";

export const metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

const NEXT_STAGE: Partial<Record<OpportunityStage, OpportunityStage>> = {
  NEW: "CONTACTED",
  CONTACTED: "QUOTING",
  QUOTING: "PROPOSAL",
  PROPOSAL: "BOUND",
};

export default async function OpportunitiesPage() {
  const [opps, users, clients] = await Promise.all([
    prisma.opportunity.findMany({
      orderBy: { updatedAt: "desc" },
      include: { client: { select: { id: true, name: true } }, owner: { select: { name: true } } },
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const plain = opps.map((o) => ({ stage: o.stage, premiumEstimate: o.premiumEstimate ? toNum(o.premiumEstimate) : null }));
  const value = pipelineValue(plain);
  const weighted = weightedPipelineValue(plain);
  const rate = winRate(opps.map((o) => o.stage));

  return (
    <>
      <PageHeader title="Opportunity pipeline" description="New → Contacted → Quoting → Proposal → Bound." />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Open pipeline" value={fmtMoney(value)} sub="Premium estimates, open stages" />
        <StatCard label="Weighted pipeline" value={fmtMoney(weighted)} sub="Probability-weighted" />
        <StatCard label="Win rate" value={rate == null ? "—" : `${rate}%`} sub="Bound vs lost, all time" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {STAGE_ORDER.map((stage) => {
          const stageOpps = opps.filter((o) => o.stage === stage);
          return (
            <div key={stage} className="card p-3">
              <div className="mb-2 flex items-center justify-between">
                <Badge tone={stageTone(stage)}>{STAGE_LABELS[stage]}</Badge>
                <span className="text-xs text-slate-400">{stageOpps.length}</span>
              </div>
              <div className="space-y-2">
                {stageOpps.map((o) => (
                  <div key={o.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-sm">
                    <div className="font-medium text-slate-800">{o.name}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {LOB_LABELS[o.lineOfBusiness]}
                      {o.premiumEstimate ? ` · ${fmtMoney(o.premiumEstimate)}` : ""}
                    </div>
                    <div className="text-xs text-slate-400">
                      {o.client ? (
                        <Link href={`/clients/${o.client.id}`} className="text-indigo-700 hover:underline">
                          {o.client.name}
                        </Link>
                      ) : (
                        "No client"
                      )}{" "}
                      · {o.owner.name}
                      {o.expectedCloseDate ? ` · ${fmtDate(o.expectedCloseDate)}` : ""}
                    </div>
                    {o.lostReason ? <div className="mt-1 text-xs text-red-500">Lost: {o.lostReason}</div> : null}
                    {stage !== "BOUND" && stage !== "LOST" ? (
                      <div className="mt-2 flex gap-1.5">
                        {NEXT_STAGE[stage] ? (
                          <form action={moveOpportunity.bind(null, o.id, NEXT_STAGE[stage]!)}>
                            <button type="submit" className="btn btn-sm">
                              → {STAGE_LABELS[NEXT_STAGE[stage]!]}
                            </button>
                          </form>
                        ) : null}
                        <form action={moveOpportunity.bind(null, o.id, "LOST")}>
                          <button type="submit" className="btn btn-sm text-red-600">
                            Lost
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                ))}
                {stageOpps.length === 0 ? <div className="py-4 text-center text-xs text-slate-300">Empty</div> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card-pad mt-6 max-w-3xl">
        <h2 className="section-title mb-3">
          <Plus className="mr-1 inline h-4 w-4" />
          New opportunity
        </h2>
        <form action={createOpportunity} className="space-y-4">
          <FormGrid cols={3}>
            <Field label="Name" required>
              <input name="name" required className="input" placeholder="Acme Co — BOP renewal" />
            </Field>
            <Field label="Client">
              <Select name="clientId" allowEmpty options={clients.map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
            <Field label="Line of business" required>
              <Select name="lineOfBusiness" options={ALL_LOBS.map((l) => ({ value: l, label: LOB_LABELS[l] }))} />
            </Field>
            <Field label="Premium estimate ($)">
              <input name="premiumEstimate" type="number" step="0.01" min="0" className="input" />
            </Field>
            <Field label="Expected close">
              <input name="expectedCloseDate" type="date" className="input" />
            </Field>
            <Field label="Owner">
              <Select name="ownerId" allowEmpty emptyLabel="Me" options={users.map((u) => ({ value: u.id, label: u.name }))} />
            </Field>
          </FormGrid>
          <button type="submit" className="btn-primary">
            Create opportunity
          </button>
        </form>
      </div>
    </>
  );
}
