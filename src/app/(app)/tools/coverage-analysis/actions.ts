"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { toNum } from "@/lib/money";
import { runKeyedAnalysis, runUploadAnalysis } from "@/lib/ai/analysis-service";
import { ALL_LOBS } from "@/lib/labels";
import type { LineOfBusiness } from "@prisma/client";
import type { AnalyzedCoverage } from "@/lib/ai/coverage-gap-rules";

const LOBS = ALL_LOBS as readonly LineOfBusiness[];

function asLob(v: FormDataEntryValue | null): LineOfBusiness | null {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return (LOBS as string[]).includes(s) ? (s as LineOfBusiness) : null;
}

/**
 * Analyze an EXISTING client policy from its stored Coverage rows — no
 * re-upload. Deterministic backbone + optional AI narrative. Then go to
 * the report.
 */
export async function analyzeStoredPolicy(formData: FormData) {
  const session = await requireSession();
  const policyId = String(formData.get("policyId") ?? "");
  if (!policyId) redirect(`/tools/coverage-analysis?toastError=${encodeURIComponent("Pick a policy")}`);

  const policy = await prisma.policy.findUnique({
    where: { id: policyId },
    include: {
      carrier: { select: { name: true } },
      client: { select: { id: true, type: true, policies: { where: { status: { in: ["ACTIVE", "BOUND", "RENEWED"] } }, select: { lineOfBusiness: true } } } },
      coverages: { orderBy: { sortOrder: "asc" } },
      dwellings: { select: { replacementCost: true } },
    },
  });
  if (!policy) redirect(`/tools/coverage-analysis?toastError=${encodeURIComponent("Policy not found")}`);

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
  const activeLobs = [...new Set(policy.client.policies.map((p) => p.lineOfBusiness))];

  const outcome = await runKeyedAnalysis({
    source: "STAFF",
    lineOfBusiness: policy.lineOfBusiness,
    carrierName: policy.carrier.name,
    coverages,
    context: { dwellingReplacementCost: dwellingRc != null ? toNum(dwellingRc) : null },
    activeLobs,
    isBusiness: policy.client.type === "BUSINESS",
    clientId: policy.client.id,
    createdById: session.userId,
  });

  await audit({
    userId: session.userId,
    actorEmail: session.user?.email,
    action: "COVERAGE_ANALYSIS_RUN",
    entityType: "Policy",
    entityId: policyId,
    detail: `score ${outcome.degraded ? "(rules)" : "(AI)"}`,
  });
  revalidatePath("/tools/coverage-analysis");
  redirect(`/tools/coverage-analysis/${outcome.analysisId}`);
}

/**
 * Staff upload — a file (dec page) or pasted details for a new
 * prospect/quote, optionally attached to a client.
 */
export async function analyzeStaffUpload(formData: FormData) {
  const session = await requireSession();
  const fileEntry = formData.get("file");
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;
  const details = String(formData.get("details") ?? "").trim() || null;
  if (!file && !details) {
    redirect(`/tools/coverage-analysis?toastError=${encodeURIComponent("Attach a file or paste details")}`);
  }

  const outcome = await runUploadAnalysis({
    source: "STAFF",
    file,
    text: details,
    lineHint: asLob(formData.get("lineOfBusiness")),
    clientId: (String(formData.get("clientId") ?? "").trim() || null) as string | null,
    createdById: session.userId,
  });

  await audit({
    userId: session.userId,
    actorEmail: session.user?.email,
    action: "COVERAGE_ANALYSIS_UPLOAD",
    entityType: "PolicyAnalysis",
    entityId: outcome.analysisId,
    detail: outcome.status,
  });
  revalidatePath("/tools/coverage-analysis");
  redirect(`/tools/coverage-analysis/${outcome.analysisId}`);
}

/**
 * Manual key-and-analyze: staff enter coverages by hand for a PENDING /
 * MANUAL_REVIEW analysis (degraded mode). Coverages arrive as parallel
 * arrays (code[], label[], limit[], deductible[]). Updates the existing
 * row in place so the lead/contact linkage is preserved.
 */
export async function keyAndAnalyze(formData: FormData) {
  const session = await requireSession();
  const analysisId = String(formData.get("analysisId") ?? "");
  const lob = asLob(formData.get("lineOfBusiness"));
  if (!analysisId || !lob) {
    redirect(`/tools/coverage-analysis?toastError=${encodeURIComponent("Pick a line of business")}`);
  }

  const codes = formData.getAll("code").map(String);
  const labels = formData.getAll("label").map(String);
  const limits = formData.getAll("limit").map(String);
  const deducts = formData.getAll("deductible").map(String);

  const parseMoney = (s: string): number | null => {
    const n = Number(s.replace(/[^0-9.]/g, ""));
    return s.trim() && Number.isFinite(n) && n > 0 ? n : null;
  };
  const isSplit = (s: string) => /\d+\s*\/\s*\d+/.test(s);

  const coverages: AnalyzedCoverage[] = codes
    .map((code, i): AnalyzedCoverage | null => {
      const limitRaw = (limits[i] ?? "").trim();
      const deductRaw = (deducts[i] ?? "").trim();
      if (!limitRaw && !deductRaw) return null; // skip empty rows
      return {
        code: code || null,
        label: labels[i] ?? code,
        limitAmount: isSplit(limitRaw) ? null : parseMoney(limitRaw),
        limitText: isSplit(limitRaw) ? limitRaw : null,
        perOccurrence: null,
        aggregate: null,
        deductibleAmount: parseMoney(deductRaw),
        deductibleText: deductRaw && parseMoney(deductRaw) == null ? deductRaw : null,
      };
    })
    .filter((c): c is AnalyzedCoverage => c != null);

  const existing = await prisma.policyAnalysis.findUnique({
    where: { id: analysisId },
    select: { clientId: true, carrierName: true },
  });

  const outcome = await runKeyedAnalysis({
    source: "STAFF",
    analysisId,
    lineOfBusiness: lob,
    carrierName: existing?.carrierName ?? null,
    coverages,
    clientId: existing?.clientId ?? null,
    createdById: session.userId,
  });

  await audit({
    userId: session.userId,
    actorEmail: session.user?.email,
    action: "COVERAGE_ANALYSIS_KEYED",
    entityType: "PolicyAnalysis",
    entityId: analysisId,
    detail: `${coverages.length} coverages`,
  });
  revalidatePath(`/tools/coverage-analysis/${analysisId}`);
  redirect(`/tools/coverage-analysis/${outcome.analysisId}`);
}

/**
 * Convert a public submission into a worked lead → opportunity from the
 * recommendations, and link the analysis to the resulting opportunity's
 * client where possible. Lightweight: creates an Opportunity for the
 * primary line and an activity note.
 */
export async function createOpportunityFromAnalysis(formData: FormData) {
  const session = await requireSession();
  const analysisId = String(formData.get("analysisId") ?? "");
  const analysis = await prisma.policyAnalysis.findUnique({
    where: { id: analysisId },
    include: { lead: true },
  });
  if (!analysis) redirect(`/tools/coverage-analysis?toastError=${encodeURIComponent("Analysis not found")}`);

  const lob = analysis.lineOfBusiness ?? "AUTO";
  const name = analysis.uploaderName ?? analysis.lead?.firstName ?? "Coverage prospect";

  const opp = await prisma.opportunity.create({
    data: {
      name: `${name} — coverage review`,
      stage: "QUOTING",
      lineOfBusiness: lob,
      leadId: analysis.leadId ?? undefined,
      clientId: analysis.clientId ?? undefined,
      ownerId: session.userId,
    },
  });
  await prisma.activity.create({
    data: {
      type: "NOTE",
      subject: "Created from AI coverage analysis",
      body: analysis.summaryText ?? "Coverage analysis converted to opportunity.",
      userId: session.userId,
      leadId: analysis.leadId ?? undefined,
      clientId: analysis.clientId ?? undefined,
      opportunityId: opp.id,
    },
  });
  await audit({
    userId: session.userId,
    actorEmail: session.user?.email,
    action: "COVERAGE_ANALYSIS_CONVERTED",
    entityType: "PolicyAnalysis",
    entityId: analysisId,
    detail: `opportunity ${opp.id}`,
  });
  revalidatePath(`/tools/coverage-analysis/${analysisId}`);
  redirect(`/opportunities/${opp.id}`);
}
