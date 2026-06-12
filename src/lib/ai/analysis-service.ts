/**
 * Coverage-analysis SERVICE — the shared pipeline behind every surface
 * (public /compare funnel, staff tool, portal checkup).
 *
 * Two entry points:
 *   - runUploadAnalysis(): a file (PDF/image) or pasted text → extract →
 *     analyze → persist a PolicyAnalysis row. Degrades to PENDING/manual
 *     review when no API key or extraction fails.
 *   - runKeyedAnalysis(): already-structured coverages (staff keyed them,
 *     or pulled from a client's stored Coverage rows) → analyze → persist.
 *     This path is fully deterministic and needs NO API key.
 *
 * The deterministic gap engine always runs, so even the manual-review
 * path produces real value once a human keys the coverages.
 */

import { Buffer } from "node:buffer";
import type { LineOfBusiness, PolicyAnalysisSource, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/storage";
import { log } from "@/lib/log";
import { aiEnabled } from "@/lib/ai/client";
import { extractPolicy, type ExtractedPolicy, type ExtractInput } from "@/lib/ai/extract";
import { analyzeCoverage } from "@/lib/ai/coverage-analysis";
import type { AnalyzedCoverage, GapContext } from "@/lib/ai/coverage-gap-rules";

const IMAGE_TYPES: Record<string, "image/png" | "image/jpeg" | "image/gif" | "image/webp"> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

/** Map an uploaded File to the extractor's input shape (or null if unsupported for AI). */
function extractInputFor(file: File, bytes: Buffer): ExtractInput | null {
  const type = (file.type || "").toLowerCase();
  if (type === "application/pdf") return { kind: "pdf", base64: bytes.toString("base64") };
  const img = IMAGE_TYPES[type];
  if (img) return { kind: "image", base64: bytes.toString("base64"), mediaType: img };
  return null;
}

/** Normalize an extracted policy's coverages into the gap-engine shape. */
function toAnalyzedCoverages(p: ExtractedPolicy): AnalyzedCoverage[] {
  return p.coverages.map((c) => ({
    code: c.code,
    label: c.label,
    limitAmount: c.limitAmount,
    limitText: c.limitText,
    perOccurrence: c.perOccurrence,
    aggregate: c.aggregate,
    deductibleAmount: c.deductibleAmount,
    deductibleText: c.deductibleText,
  }));
}

function contextFor(p: ExtractedPolicy): GapContext {
  return {
    dwellingReplacementCost: p.dwellingReplacementCost,
    notes: p.notes,
  };
}

export type AnalysisOutcome = {
  analysisId: string;
  status: "ANALYZED" | "PENDING" | "MANUAL_REVIEW" | "FAILED";
  degraded: boolean; // true when AI was unavailable / failed
};

// ── Upload path (public funnel, portal upload, staff upload) ─────────

export type UploadArgs = {
  source: PolicyAnalysisSource;
  file?: File | null;
  /** Pasted policy text (alternative to a file). */
  text?: string | null;
  uploaderName?: string | null;
  uploaderEmail?: string | null;
  clientId?: string | null;
  createdById?: string | null;
  /** A hint of the line, if the submitter selected one. */
  lineHint?: LineOfBusiness | null;
  /** Created lead id (public funnel) to link. */
  leadId?: string | null;
};

/**
 * Full upload → analysis pipeline. Always persists a PolicyAnalysis row.
 * - With an API key + a parseable upload: ANALYZED (extracted + scored).
 * - Without a key (or extraction fails): PENDING (no file/text) or
 *   MANUAL_REVIEW (file/text stored for a human to key).
 * Never throws to the caller — failures land in the row's status.
 */
export async function runUploadAnalysis(args: UploadArgs): Promise<AnalysisOutcome> {
  // 1. Store the upload (if any) so a human can review even in degraded mode.
  let fileKey: string | null = null;
  let fileName: string | null = null;
  let extractInput: ExtractInput | null = null;
  let bytes: Buffer | null = null;

  if (args.file && args.file.size > 0) {
    try {
      const saved = await saveUpload(args.file);
      fileKey = saved.storedPath;
      fileName = args.file.name;
      bytes = Buffer.from(await args.file.arrayBuffer());
      extractInput = extractInputFor(args.file, bytes);
    } catch (err) {
      log.warn("AI compare: upload store failed", { module: "ai-compare" }, err);
    }
  } else if (args.text && args.text.trim().length > 0) {
    extractInput = { kind: "text", text: args.text.trim() };
  }

  const baseData = {
    source: args.source,
    uploaderName: args.uploaderName ?? null,
    uploaderEmail: args.uploaderEmail ?? null,
    clientId: args.clientId ?? null,
    createdById: args.createdById ?? null,
    leadId: args.leadId ?? null,
    lineOfBusiness: args.lineHint ?? null,
    fileKey,
    fileName,
  };

  // 2. Degraded mode: no AI configured, or nothing extractable.
  if (!aiEnabled() || !extractInput) {
    const status = extractInput || fileKey ? "MANUAL_REVIEW" : "PENDING";
    const row = await prisma.policyAnalysis.create({ data: { ...baseData, status } });
    log.info("AI compare: stored for review (degraded)", {
      module: "ai-compare",
      id: row.id,
      status,
      reason: !aiEnabled() ? "no_key" : "no_extractable_input",
    });
    return { analysisId: row.id, status, degraded: true };
  }

  // 3. AI path — extract, then analyze.
  const created = await prisma.policyAnalysis.create({ data: { ...baseData, status: "EXTRACTING" } });

  const extracted = await extractPolicy(extractInput);
  if (!extracted.ok) {
    await prisma.policyAnalysis.update({
      where: { id: created.id },
      data: { status: "MANUAL_REVIEW" },
    });
    log.warn("AI compare: extraction failed → manual review", {
      module: "ai-compare",
      id: created.id,
      reason: extracted.reason,
    });
    return { analysisId: created.id, status: "MANUAL_REVIEW", degraded: true };
  }

  const policy = extracted.policy;
  const lob: LineOfBusiness =
    policy.lineOfBusiness !== "UNKNOWN"
      ? (policy.lineOfBusiness as LineOfBusiness)
      : (args.lineHint ?? "AUTO");

  const analysis = await analyzeCoverage({
    lineOfBusiness: lob,
    carrierName: policy.carrierName,
    coverages: toAnalyzedCoverages(policy),
    context: contextFor(policy),
  });

  await prisma.policyAnalysis.update({
    where: { id: created.id },
    data: {
      status: "ANALYZED",
      lineOfBusiness: lob,
      carrierName: policy.carrierName ?? null,
      extractedJson: policy as unknown as Prisma.InputJsonValue,
      summaryText: analysis.summaryText,
      gapsJson: analysis.gaps as unknown as Prisma.InputJsonValue,
      recommendationsJson: {
        recommendations: analysis.recommendations,
        crossSell: analysis.crossSell,
      } as unknown as Prisma.InputJsonValue,
      score: analysis.score,
    },
  });

  log.info("AI compare: analysis complete", {
    module: "ai-compare",
    id: created.id,
    lob,
    score: analysis.score,
  });
  return { analysisId: created.id, status: "ANALYZED", degraded: false };
}

// ── Keyed path (staff manual entry, or a client's stored coverages) ──

export type KeyedArgs = {
  source: PolicyAnalysisSource;
  lineOfBusiness: LineOfBusiness;
  carrierName?: string | null;
  coverages: AnalyzedCoverage[];
  context?: GapContext;
  activeLobs?: LineOfBusiness[];
  isBusiness?: boolean;
  clientId?: string | null;
  createdById?: string | null;
  /** Optionally update an EXISTING analysis row (re-key flow). */
  analysisId?: string;
};

/**
 * Analyze already-structured coverages. Fully deterministic backbone +
 * optional AI narrative — needs NO API key for the gap report. Persists
 * (or updates) a PolicyAnalysis row.
 */
export async function runKeyedAnalysis(args: KeyedArgs): Promise<AnalysisOutcome> {
  const analysis = await analyzeCoverage({
    lineOfBusiness: args.lineOfBusiness,
    carrierName: args.carrierName,
    coverages: args.coverages,
    context: args.context,
    activeLobs: args.activeLobs,
    isBusiness: args.isBusiness,
  });

  const data = {
    status: "ANALYZED" as const,
    lineOfBusiness: args.lineOfBusiness,
    carrierName: args.carrierName ?? null,
    extractedJson: { coverages: args.coverages, keyed: true } as unknown as Prisma.InputJsonValue,
    summaryText: analysis.summaryText,
    gapsJson: analysis.gaps as unknown as Prisma.InputJsonValue,
    recommendationsJson: {
      recommendations: analysis.recommendations,
      crossSell: analysis.crossSell,
    } as unknown as Prisma.InputJsonValue,
    score: analysis.score,
  };

  let id: string;
  if (args.analysisId) {
    const row = await prisma.policyAnalysis.update({ where: { id: args.analysisId }, data });
    id = row.id;
  } else {
    const row = await prisma.policyAnalysis.create({
      data: {
        ...data,
        source: args.source,
        clientId: args.clientId ?? null,
        createdById: args.createdById ?? null,
      },
    });
    id = row.id;
  }

  log.info("AI compare: keyed analysis complete", {
    module: "ai-compare",
    id,
    lob: args.lineOfBusiness,
    score: analysis.score,
  });
  return { analysisId: id, status: "ANALYZED", degraded: !analysis.aiNarrative };
}
