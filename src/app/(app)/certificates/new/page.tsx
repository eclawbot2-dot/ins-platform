import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { LOB_LABELS } from "@/lib/labels";
import { fmtDate } from "@/lib/domain/dates";
import { issueCertificate } from "../actions";

export const metadata = { title: "Issue COI" };
export const dynamic = "force-dynamic";

export default async function NewCertificatePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; policyId?: string }>;
}) {
  const { clientId, policyId } = await searchParams;

  // Resolve the client from a policyId deep link.
  let effectiveClientId = clientId;
  if (!effectiveClientId && policyId) {
    const p = await prisma.policy.findUnique({ where: { id: policyId }, select: { clientId: true } });
    effectiveClientId = p?.clientId;
  }

  const [clients, holders, policies] = await Promise.all([
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.certificateHolder.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    effectiveClientId
      ? prisma.policy.findMany({
          where: { clientId: effectiveClientId, status: { in: ["ACTIVE", "BOUND", "RENEWED"] } },
          include: { carrier: { select: { name: true } } },
          orderBy: { expirationDate: "desc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Issue certificate of insurance" description="ACORD 25-style issuance — pick the insured, holder, and coverages." />

      {!effectiveClientId ? (
        <form method="get" className="card-pad max-w-xl space-y-4">
          <Field label="Step 1 — choose the insured (client)" required>
            <Select name="clientId" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <button type="submit" className="btn-primary">
            Continue
          </button>
        </form>
      ) : (
        <form action={issueCertificate} className="card-pad max-w-3xl space-y-5">
          <input type="hidden" name="clientId" value={effectiveClientId} />
          <FormGrid>
            <Field label="Insured">
              <input disabled value={clients.find((c) => c.id === effectiveClientId)?.name ?? ""} className="input bg-slate-50" />
            </Field>
            <Field label="Certificate holder" required hint="Manage in the holder directory">
              <Select name="holderId" options={holders.map((h) => ({ value: h.id, label: h.name }))} />
            </Field>
          </FormGrid>

          <div>
            <div className="label">Coverages (active policies)</div>
            {policies.length === 0 ? (
              <p className="text-sm text-amber-600">This client has no active policies — bind one first.</p>
            ) : (
              <div className="space-y-2">
                {policies.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <input type="checkbox" name="policyIds" value={p.id} defaultChecked={policyId === p.id || policies.length === 1} />
                      {LOB_LABELS[p.lineOfBusiness]}
                    </label>
                    <span className="text-xs text-slate-500">
                      {p.carrier.name} · {p.policyNumber} · {fmtDate(p.effectiveDate)}–{fmtDate(p.expirationDate)}
                    </span>
                    <input
                      name={`limits-${p.id}`}
                      placeholder="Limits (e.g. EACH OCCURRENCE $1,000,000 / AGGREGATE $2,000,000)"
                      className="input flex-1"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <Field label="Description of operations / locations / vehicles">
            <textarea name="descriptionOfOps" rows={3} className="input" />
          </Field>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="additionalInsured" /> Certificate holder is additional insured
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="waiverOfSubrogation" /> Waiver of subrogation
            </label>
          </div>

          <button type="submit" className="btn-primary" disabled={policies.length === 0}>
            Issue certificate
          </button>
        </form>
      )}
    </>
  );
}
