/**
 * Shared coverage-analysis REPORT renderer — used by the public results
 * page, the staff tool, and the portal checkup so every surface presents
 * the same summary / score / gaps / recommendations layout.
 *
 * Server component (no client state) — mobile-first, overflow-guarded.
 */

import { AlertTriangle, ArrowUpRight, CheckCircle2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BadgeTone } from "@/lib/labels";
import { LOB_LABELS } from "@/lib/labels";
import { fmtMoney } from "@/lib/money";
import { scoreTone, type ReportView } from "@/lib/ai/presenter";
import type { GapFinding } from "@/lib/ai/coverage-gap-rules";
import type { LineOfBusiness } from "@prisma/client";

function severityBadge(sev: GapFinding["severity"]): { tone: BadgeTone; label: string } {
  switch (sev) {
    case "critical":
      return { tone: "red", label: "Critical" };
    case "high":
      return { tone: "red", label: "High" };
    case "medium":
      return { tone: "amber", label: "Medium" };
    case "low":
      return { tone: "blue", label: "Low" };
    default:
      return { tone: "slate", label: "Info" };
  }
}

const SCORE_RING: Record<ReturnType<typeof scoreTone>, string> = {
  good: "text-emerald-600 ring-emerald-200 bg-emerald-50",
  warn: "text-amber-600 ring-amber-200 bg-amber-50",
  bad: "text-red-600 ring-red-200 bg-red-50",
  neutral: "text-slate-500 ring-slate-200 bg-slate-50",
};

export function CoverageReport({
  view,
  summaryText,
  lineOfBusiness,
  carrierName,
  degraded,
}: {
  view: ReportView;
  summaryText?: string | null;
  lineOfBusiness?: LineOfBusiness | null;
  carrierName?: string | null;
  /** true when the report ran on rules only (no AI narrative). */
  degraded?: boolean;
}) {
  const tone = scoreTone(view.score);
  const gaps = view.findings.filter((f) => f.kind === "MISSING" || f.kind === "UNDER_LIMIT");
  const ok = view.findings.filter((f) => f.kind === "PRESENT_OK");
  const info = view.findings.filter((f) => f.kind === "INFO");

  return (
    <div className="space-y-6">
      {/* Score + summary */}
      <div className="card-pad flex flex-col gap-5 sm:flex-row sm:items-center">
        <div
          className={`flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full ring-4 ${SCORE_RING[tone]}`}
        >
          <span className="text-3xl font-bold tabular-nums">{view.score ?? "—"}</span>
          <span className="text-xs font-medium">{view.grade ? `Grade ${view.grade}` : "Pending"}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {lineOfBusiness ? <Badge tone="slate">{LOB_LABELS[lineOfBusiness]}</Badge> : null}
            {carrierName ? <span className="text-sm font-medium text-slate-700">{carrierName}</span> : null}
            {degraded ? <Badge tone="amber">Rules-based</Badge> : null}
          </div>
          {summaryText ? (
            <p className="text-sm leading-relaxed text-slate-700">{summaryText}</p>
          ) : (
            <p className="text-sm text-slate-500">
              Your policy has been submitted. Our team is preparing your free coverage report and will reach out shortly.
            </p>
          )}
        </div>
      </div>

      {/* Gaps */}
      {gaps.length > 0 ? (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-900">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Coverage gaps ({gaps.length})
          </h2>
          <ul className="space-y-2">
            {gaps.map((f) => {
              const sb = severityBadge(f.severity);
              return (
                <li key={f.key} className="card-pad">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-900">{f.label}</span>
                    <div className="flex items-center gap-2">
                      <Badge tone={sb.tone}>{sb.label}</Badge>
                      <Badge tone="slate">{f.kind === "UNDER_LIMIT" ? "Under-limit" : "Missing"}</Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{f.detail}</p>
                  {(f.found || f.recommended) && (
                    <p className="mt-1 text-xs text-slate-500">
                      {f.found ? <>Found: <span className="font-medium">{f.found}</span>. </> : null}
                      {f.recommended ? <>Recommended: <span className="font-medium">{f.recommended}</span>.</> : null}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : view.score != null ? (
        <section className="card-pad flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> No significant gaps detected against the standard coverage checklist.
        </section>
      ) : null}

      {/* Recommendations */}
      {view.recommendations.length > 0 ? (
        <section>
          <h2 className="mb-2 text-base font-semibold text-slate-900">Recommendations</h2>
          <ul className="space-y-2">
            {view.recommendations.map((r) => (
              <li key={r.key} className="card-pad">
                <div className="font-medium text-slate-900">{r.title}</div>
                <p className="mt-0.5 text-sm text-slate-600">{r.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Cross-sell / account rounding */}
      {view.crossSell.length > 0 ? (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-900">
            <ArrowUpRight className="h-4 w-4 text-navy-600" /> Other coverage to consider
          </h2>
          <ul className="space-y-2">
            {view.crossSell.slice(0, 5).map((s) => (
              <li key={s.key} className="card-pad flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{s.title}</div>
                  <p className="mt-0.5 text-sm text-slate-600">{s.rationale}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-500">~{fmtMoney(s.estPremium)}/yr</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Coverages found + present-OK + info (collapsible detail) */}
      {(ok.length > 0 || info.length > 0) && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-900">
            <Info className="h-4 w-4 text-slate-400" /> Notes
          </h2>
          <ul className="space-y-1.5 text-sm text-slate-600">
            {ok.map((f) => (
              <li key={f.key} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span><span className="font-medium text-slate-700">{f.label}:</span> {f.detail}</span>
              </li>
            ))}
            {info.map((f) => (
              <li key={f.key} className="flex items-start gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span><span className="font-medium text-slate-700">{f.label}:</span> {f.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
