import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal";
import { portalPolicyWhere } from "@/lib/domain/portal-scope";
import { LOB_LABELS } from "@/lib/labels";
import { fmtDate } from "@/lib/domain/dates";
import { portalRequestCertificate } from "../actions";

export const dynamic = "force-dynamic";

export default async function PortalCertificatesPage() {
  const session = await requirePortalSession();

  const [policies, certificates] = await Promise.all([
    prisma.policy.findMany({
      where: { ...portalPolicyWhere(session.clientId), status: { in: ["ACTIVE", "BOUND", "RENEWED"] } },
      select: { id: true, policyNumber: true, lineOfBusiness: true },
      orderBy: { expirationDate: "desc" },
    }),
    prisma.certificate.findMany({
      where: { clientId: session.clientId },
      include: { holder: { select: { name: true } } },
      orderBy: { issuedAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <>
      <div className="mb-5">
        <h1 className="page-title">Certificates of insurance</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Request a COI for a landlord, lender or general contractor — we&apos;ll issue it and email
          the holder.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card-pad">
          <h2 className="section-title mb-3">Request a certificate</h2>
          <form action={portalRequestCertificate} className="space-y-4">
            <div>
              <label className="label" htmlFor="coi-holder">Certificate holder name</label>
              <input id="coi-holder" name="holderName" className="input" required placeholder="e.g. Meridian General Contractors" />
            </div>
            <div>
              <label className="label" htmlFor="coi-address">Holder address</label>
              <input id="coi-address" name="holderAddress" className="input" placeholder="Street, city, state, ZIP" />
            </div>
            <div>
              <label className="label" htmlFor="coi-email">Holder email (where to send it)</label>
              <input id="coi-email" name="holderEmail" type="email" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="coi-policy">Policy (optional)</label>
              <select id="coi-policy" name="policyId" className="input" defaultValue="">
                <option value="">Let the agency choose</option>
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {LOB_LABELS[p.lineOfBusiness]} — {p.policyNumber}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="coi-ops">Description of operations / project</label>
              <textarea id="coi-ops" name="operations" rows={3} className="input" placeholder="Job name, contract reference, special wording…" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="additionalInsured" className="h-4 w-4 rounded border-slate-300" />
              Holder must be listed as additional insured
            </label>
            <button type="submit" className="btn-primary w-full justify-center py-2.5 sm:w-auto">
              Send request
            </button>
          </form>
        </div>

        <div className="card-pad">
          <h2 className="section-title mb-3">Previously issued</h2>
          {certificates.length === 0 ? (
            <p className="text-sm text-slate-500">No certificates issued yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {certificates.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2 last:border-0">
                  <div>
                    <div className="font-medium text-slate-800">{c.holder.name}</div>
                    <div className="text-xs text-slate-500">{c.certNumber}</div>
                  </div>
                  <div className="text-xs text-slate-500">{fmtDate(c.issuedAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
