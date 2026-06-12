import Link from "next/link";
import { Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { FlashToast } from "@/components/ui/toast";
import { LOB_LABELS } from "@/lib/labels";
import { aiEnabled } from "@/lib/ai/client";
import { fmtDate } from "@/lib/domain/dates";
import { analyzeStoredPolicy, analyzeStaffUpload } from "./actions";

export const metadata = { title: "Coverage analysis" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "slate" | "blue"> = {
  ANALYZED: "green",
  PENDING: "amber",
  EXTRACTING: "blue",
  MANUAL_REVIEW: "amber",
  FAILED: "red",
};

export default async function CoverageAnalysisToolPage() {
  await requireSession();

  const [queue, recent, policies, aiOn] = await Promise.all([
    prisma.policyAnalysis.findMany({
      where: { source: "PUBLIC_UPLOAD" },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { lead: { select: { id: true, score: true } } },
    }),
    prisma.policyAnalysis.findMany({
      where: { source: { in: ["STAFF", "CLIENT_PORTAL"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { client: { select: { id: true, name: true } } },
    }),
    prisma.policy.findMany({
      where: { status: { in: ["ACTIVE", "BOUND", "RENEWED"] }, coverages: { some: {} } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        policyNumber: true,
        lineOfBusiness: true,
        carrier: { select: { name: true } },
        client: { select: { name: true } },
      },
    }),
    Promise.resolve(aiEnabled()),
  ]);

  const pendingCount = queue.filter((q) => q.status === "PENDING" || q.status === "MANUAL_REVIEW").length;

  return (
    <>
      <FlashToast />
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gold-500" /> Coverage analysis
          </span>
        }
        description="AI compare tool — analyze a policy's coverages, surface gaps, and convert checkup submissions into quotes."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Checkup submissions" value={queue.length} />
        <StatCard label="Awaiting review" value={pendingCount} tone={pendingCount ? "warn" : "default"} />
        <StatCard label="Analyzed (staff/portal)" value={recent.length} />
        <StatCard label="AI extraction" value={aiOn ? "Active" : "Manual mode"} tone={aiOn ? "good" : "warn"} />
      </div>

      {!aiOn ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Manual-review mode.</strong> ANTHROPIC_API_KEY is not set, so uploaded policies are stored for staff
          to review and key by hand. The deterministic gap rules still produce a full report once coverages are keyed.
          Analyzing an existing client policy below works fully — it uses the stored coverage schedule.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Analyze an existing client policy (no re-upload) */}
        <section className="card-pad">
          <h2 className="mb-2 text-base font-semibold text-slate-900">Analyze a client policy</h2>
          <p className="mb-3 text-sm text-slate-500">
            Run the gap analysis on a policy&apos;s stored coverage schedule — no upload needed.
          </p>
          <form action={analyzeStoredPolicy} className="space-y-3">
            <select name="policyId" required className="input" defaultValue="">
              <option value="" disabled>
                Select a policy…
              </option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.client.name} · {LOB_LABELS[p.lineOfBusiness]} · {p.policyNumber} ({p.carrier.name})
                </option>
              ))}
            </select>
            <button type="submit" className="btn-primary w-full justify-center py-2">
              Analyze coverage
            </button>
          </form>
        </section>

        {/* Staff upload / paste */}
        <section className="card-pad">
          <h2 className="mb-2 text-base font-semibold text-slate-900">Upload or paste a policy</h2>
          <p className="mb-3 text-sm text-slate-500">
            For a prospect or competitor dec page. {aiOn ? "AI extracts the coverages." : "Stored for manual review."}
          </p>
          <form action={analyzeStaffUpload} className="space-y-3">
            <input type="file" name="file" accept="application/pdf,image/*" className="input" />
            <textarea name="details" rows={3} className="input" placeholder="…or paste coverage details" />
            <select name="lineOfBusiness" className="input" defaultValue="">
              <option value="">Line of business (optional)</option>
              {Object.entries(LOB_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <button type="submit" className="btn w-full justify-center py-2">
              Submit for analysis
            </button>
          </form>
        </section>
      </div>

      {/* Public checkup submission queue */}
      <section className="mt-6">
        <h2 className="mb-2 text-base font-semibold text-slate-900">Coverage-checkup submissions</h2>
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Name</th>
                <th>Line</th>
                <th>Status</th>
                <th className="text-right">Score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                    No public coverage-checkup submissions yet.
                  </td>
                </tr>
              ) : (
                queue.map((q) => (
                  <tr key={q.id}>
                    <td className="whitespace-nowrap text-sm text-slate-500">{fmtDate(q.createdAt)}</td>
                    <td className="font-medium text-slate-800">{q.uploaderName ?? "—"}</td>
                    <td>{q.lineOfBusiness ? LOB_LABELS[q.lineOfBusiness] : "—"}</td>
                    <td>
                      <Badge tone={STATUS_TONE[q.status] ?? "slate"}>{q.status.replace(/_/g, " ").toLowerCase()}</Badge>
                    </td>
                    <td className="text-right tabular-nums">{q.score ?? "—"}</td>
                    <td className="text-right">
                      <Link href={`/tools/coverage-analysis/${q.id}`} className="text-navy-700 hover:underline">
                        Review
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {recent.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-base font-semibold text-slate-900">Recent staff &amp; portal analyses</h2>
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Source</th>
                  <th>Client</th>
                  <th>Line</th>
                  <th className="text-right">Score</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-sm text-slate-500">{fmtDate(r.createdAt)}</td>
                    <td className="text-sm">{r.source === "CLIENT_PORTAL" ? "Portal" : "Staff"}</td>
                    <td>{r.client?.name ?? "—"}</td>
                    <td>{r.lineOfBusiness ? LOB_LABELS[r.lineOfBusiness] : "—"}</td>
                    <td className="text-right tabular-nums">{r.score ?? "—"}</td>
                    <td className="text-right">
                      <Link href={`/tools/coverage-analysis/${r.id}`} className="text-navy-700 hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
