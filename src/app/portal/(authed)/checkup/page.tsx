import Link from "next/link";
import { Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal";
import { portalPolicyWhere } from "@/lib/domain/portal-scope";
import { Badge } from "@/components/ui/badge";
import { FlashToast } from "@/components/ui/toast";
import { LOB_LABELS } from "@/lib/labels";
import { fmtDate } from "@/lib/domain/dates";
import { runPortalCheckup } from "./actions";

export const dynamic = "force-dynamic";

export default async function PortalCheckupPage() {
  const session = await requirePortalSession();

  const [policies, prior] = await Promise.all([
    prisma.policy.findMany({
      where: { ...portalPolicyWhere(session.clientId), coverages: { some: {} } },
      include: { carrier: { select: { name: true } } },
      orderBy: { expirationDate: "desc" },
    }),
    prisma.policyAnalysis.findMany({
      where: { clientId: session.clientId, source: "CLIENT_PORTAL", status: "ANALYZED" },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <>
      <FlashToast />
      <div className="mb-5">
        <h1 className="page-title flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-gold-500" /> Coverage checkup
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Get a plain-English review of any of your policies — what you have, and where you might have gaps.
        </p>
      </div>

      {policies.length === 0 ? (
        <div className="card-pad text-sm text-slate-600">
          We don&apos;t have a detailed coverage schedule on file yet. Reach out and we&apos;ll be glad to walk through
          your coverage with you.
        </div>
      ) : (
        <section className="card-pad">
          <h2 className="mb-2 text-base font-semibold text-slate-900">Run a checkup</h2>
          <form action={runPortalCheckup} className="space-y-3">
            <select name="policyId" required className="input" defaultValue="">
              <option value="" disabled>
                Choose a policy…
              </option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {LOB_LABELS[p.lineOfBusiness]} · {p.policyNumber} ({p.carrier.name})
                </option>
              ))}
            </select>
            <button type="submit" className="btn-primary py-2">
              Check my coverage
            </button>
          </form>
        </section>
      )}

      {prior.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-base font-semibold text-slate-900">Recent checkups</h2>
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Line</th>
                  <th className="text-right">Score</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {prior.map((a) => (
                  <tr key={a.id}>
                    <td className="text-sm text-slate-500">{fmtDate(a.createdAt)}</td>
                    <td>{a.lineOfBusiness ? LOB_LABELS[a.lineOfBusiness] : "—"}</td>
                    <td className="text-right tabular-nums">{a.score ?? "—"}</td>
                    <td className="text-right">
                      <Link href={`/portal/checkup/${a.id}`} className="text-navy-700 hover:underline">
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
