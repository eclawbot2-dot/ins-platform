import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { LOB_LABELS, EOI_HOLDER_INTEREST_LABELS } from "@/lib/labels";
import { fmtDate } from "@/lib/domain/dates";
import { lobHasEoi } from "@/lib/documents/eoi";
import { eoiDefaultsForPolicy } from "@/lib/documents/assemble";
import { issueEoi } from "../actions";

export const metadata = { title: "Issue EOI" };
export const dynamic = "force-dynamic";

const EOI_LOBS = ["HOME", "CONDO", "RENTERS", "FLOOD", "COMMERCIAL_PROPERTY", "BOP", "BUILDERS_RISK", "INLAND_MARINE"] as const;

export default async function NewEoiPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; policyId?: string }>;
}) {
  const { clientId, policyId } = await searchParams;

  let effectiveClientId = clientId;
  if (!effectiveClientId && policyId) {
    const p = await prisma.policy.findUnique({ where: { id: policyId }, select: { clientId: true } });
    effectiveClientId = p?.clientId ?? undefined;
  }

  const [clients, policies] = await Promise.all([
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    effectiveClientId
      ? prisma.policy.findMany({
          where: { clientId: effectiveClientId, status: { in: ["ACTIVE", "BOUND", "RENEWED"] }, lineOfBusiness: { in: [...EOI_LOBS] } },
          include: { carrier: { select: { name: true } } },
          orderBy: { expirationDate: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const propertyPolicies = policies.filter((p) => lobHasEoi(p.lineOfBusiness));
  // Pre-fill from the selected (or first) property policy.
  const selectedPolicyId = policyId && propertyPolicies.some((p) => p.id === policyId) ? policyId : propertyPolicies[0]?.id;
  const defaults = selectedPolicyId ? await eoiDefaultsForPolicy(selectedPolicyId) : null;

  return (
    <>
      <PageHeader
        title="Issue evidence of property"
        description="ACORD 27/28-style — snapshots the property policy + limits and the lender/mortgagee holder."
      />

      {!effectiveClientId ? (
        <form method="get" className="card-pad max-w-xl space-y-4">
          <Field label="Step 1 — choose the insured (client)" required>
            <Select name="clientId" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <button type="submit" className="btn-primary">Continue</button>
        </form>
      ) : propertyPolicies.length === 0 ? (
        <div className="card-pad max-w-xl">
          <p className="text-sm text-amber-600">
            This client has no active property policies (home/condo/flood/commercial property). Bind one first.
          </p>
        </div>
      ) : (
        <form action={issueEoi} className="card-pad max-w-3xl space-y-5">
          <input type="hidden" name="clientId" value={effectiveClientId} />
          <Field label="Property policy" required hint="Limits + dates snapshot at issuance">
            <Select
              name="policyId"
              defaultValue={selectedPolicyId}
              options={propertyPolicies.map((p) => ({
                value: p.id,
                label: `${LOB_LABELS[p.lineOfBusiness]} · ${p.carrier.name} · ${p.policyNumber} (${fmtDate(p.effectiveDate)}–${fmtDate(p.expirationDate)})`,
              }))}
            />
          </Field>

          <FormGrid>
            <Field label="Property address" hint="From the dwelling/location on file">
              <input name="propertyAddress" defaultValue={defaults?.propertyAddress ?? ""} className="input" />
            </Field>
            <Field label="Coverage A / dwelling limit ($)">
              <input name="coverageALimit" type="number" step="1" min="0" defaultValue={defaults?.coverageALimit ?? ""} className="input" />
            </Field>
            <Field label="Deductible">
              <input name="deductibleText" defaultValue={defaults?.deductibleText ?? ""} placeholder="$1,000 / 2% wind" className="input" />
            </Field>
          </FormGrid>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="section-title mb-3">Lender / mortgagee (additional interest)</h3>
            <FormGrid>
              <Field label="Holder name" required>
                <input name="holderName" required defaultValue={defaults?.mortgageeName ?? ""} className="input" />
              </Field>
              <Field label="Interest">
                <Select
                  name="holderInterest"
                  defaultValue="MORTGAGEE"
                  options={(["MORTGAGEE", "LOSS_PAYEE", "ADDITIONAL_INTEREST", "LENDER"] as const).map((v) => ({
                    value: v,
                    label: EOI_HOLDER_INTEREST_LABELS[v],
                  }))}
                />
              </Field>
              <Field label="Loan / account #">
                <input name="loanNumber" defaultValue={defaults?.loanNumber ?? ""} className="input" />
              </Field>
              <Field label="Holder address">
                <input name="holderAddress" className="input" />
              </Field>
            </FormGrid>
          </div>

          <Field label="Remarks">
            <textarea name="remarks" rows={2} className="input" placeholder="ISAOA/ATIMA, special conditions…" />
          </Field>

          <button type="submit" className="btn-primary">Issue evidence of property</button>
        </form>
      )}
    </>
  );
}
