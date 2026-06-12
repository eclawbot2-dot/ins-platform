"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireClientUser } from "@/lib/auth";
import { canClientSeePolicy } from "@/lib/domain/portal-scope";
import { toNum } from "@/lib/money";
import { addDays } from "@/lib/domain/dates";
import { runKeyedAnalysis } from "@/lib/ai/analysis-service";
import type { AnalyzedCoverage } from "@/lib/ai/coverage-gap-rules";

/**
 * Run a coverage checkup on the client's OWN policy. Strictly
 * clientId-scoped — the policyId from the form is verified to belong to
 * the session's client before any data is read. Uses the stored Coverage
 * schedule (no upload), runs the deterministic gap engine, and persists a
 * CLIENT_PORTAL analysis tied to the client.
 */
export async function runPortalCheckup(formData: FormData) {
  const session = await requireClientUser();
  const policyId = String(formData.get("policyId") ?? "");
  if (!policyId) redirect(`/portal/checkup?toastError=${encodeURIComponent("Pick a policy")}`);

  const policy = await prisma.policy.findUnique({
    where: { id: policyId },
    include: {
      carrier: { select: { name: true } },
      coverages: { orderBy: { sortOrder: "asc" } },
      dwellings: { select: { replacementCost: true } },
    },
  });
  // Scope guard — never trust the id from the form.
  if (!policy || !canClientSeePolicy(policy, session.clientId)) {
    redirect(`/portal/checkup?toastError=${encodeURIComponent("Policy not found")}`);
  }

  const coverages: AnalyzedCoverage[] = policy.coverages.map((c) => ({
    code: c.code,
    label: c.label,
    limitAmount: c.limitAmount != null ? toNum(c.limitAmount) : null,
    limitText: c.limitText,
    perOccurrence: c.perOccurrence != null ? toNum(c.perOccurrence) : null,
    aggregate: c.aggregate != null ? toNum(c.aggregate) : null,
    deductibleAmount: c.deductibleAmount != null ? toNum(c.deductibleAmount) : null,
    deductibleText: c.deductibleText,
  }));

  const dwellingRc = policy.dwellings[0]?.replacementCost;
  const outcome = await runKeyedAnalysis({
    source: "CLIENT_PORTAL",
    lineOfBusiness: policy.lineOfBusiness,
    carrierName: policy.carrier.name,
    coverages,
    context: { dwellingReplacementCost: dwellingRc != null ? toNum(dwellingRc) : null },
    clientId: session.clientId,
  });

  revalidatePath("/portal/checkup");
  redirect(`/portal/checkup/${outcome.analysisId}`);
}

/**
 * Client requests a personal coverage review — creates a staff follow-up
 * task tied to the client. Verifies the analysis belongs to the session
 * client before acting.
 */
export async function requestReview(formData: FormData) {
  const session = await requireClientUser();
  const analysisId = String(formData.get("analysisId") ?? "");
  const analysis = await prisma.policyAnalysis.findUnique({
    where: { id: analysisId },
    select: { id: true, clientId: true },
  });
  if (!analysis || analysis.clientId !== session.clientId) {
    redirect(`/portal/checkup?toastError=${encodeURIComponent("Not found")}`);
  }

  const client = await prisma.client.findUnique({
    where: { id: session.clientId },
    select: { name: true, producerId: true, csrId: true },
  });
  await prisma.task.create({
    data: {
      title: `Coverage review requested by ${client?.name ?? "client"}`,
      detail: "Client ran a portal coverage checkup and requested a review of their gaps.",
      dueDate: addDays(new Date(), 2),
      priority: "HIGH",
      clientId: session.clientId,
      assignedToId: client?.csrId ?? client?.producerId ?? undefined,
    },
  });

  revalidatePath(`/portal/checkup/${analysisId}`);
  redirect(`/portal/checkup/${analysisId}?toast=${encodeURIComponent("Review requested — we'll reach out soon.")}`);
}
