import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { SIGNATURE_DOC_KIND_LABELS, SIGNATURE_PROVIDER_LABELS } from "@/lib/labels";
import { configuredProvider, eSignEnabled } from "@/lib/signatures/provider";
import { createSignatureRequest } from "../actions";

export const metadata = { title: "New signature request" };
export const dynamic = "force-dynamic";

export default async function NewSignaturePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; policyId?: string; docKind?: string; title?: string }>;
}) {
  const { clientId, policyId, docKind, title } = await searchParams;

  // Prefill signer from the linked client when provided.
  const client = clientId
    ? await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, email: true } })
    : null;
  const policy = policyId
    ? await prisma.policy.findUnique({ where: { id: policyId }, select: { id: true, policyNumber: true } })
    : null;

  const provider = configuredProvider();
  const live = eSignEnabled();

  return (
    <>
      <PageHeader title="Send for signature" description="Create a signature request for a proposal, application or certificate." />

      <div className="card-pad max-w-2xl">
        <p className="mb-4 text-sm text-slate-600">
          Provider: <span className="font-medium">{SIGNATURE_PROVIDER_LABELS[provider]}</span>
          {live ? null : " — runs the manual print-and-sign flow (no provider configured)."}
        </p>
        <form action={createSignatureRequest} className="space-y-4">
          <input type="hidden" name="clientId" value={client?.id ?? ""} />
          <input type="hidden" name="policyId" value={policy?.id ?? ""} />
          <FormGrid cols={2}>
            <Field label="Document title" required>
              <input name="title" required defaultValue={title ?? ""} className="input" placeholder={policy ? `Proposal — ${policy.policyNumber}` : "Proposal"} />
            </Field>
            <Field label="Document type">
              <Select
                name="docKind"
                defaultValue={docKind && docKind in SIGNATURE_DOC_KIND_LABELS ? docKind : "PROPOSAL"}
                options={Object.entries(SIGNATURE_DOC_KIND_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </Field>
            <Field label="Signer name" required>
              <input name="signerName" required defaultValue={client?.name ?? ""} className="input" />
            </Field>
            <Field label="Signer email" required>
              <input name="signerEmail" type="email" required defaultValue={client?.email ?? ""} className="input" />
            </Field>
            <Field label="Expires">
              <input name="expiresAt" type="date" className="input" />
            </Field>
          </FormGrid>
          <Field label="Message to signer">
            <textarea name="message" rows={3} className="input" placeholder="Please review and sign the attached proposal." />
          </Field>
          {client ? <p className="text-xs text-slate-500">Linked to client: {client.name}</p> : null}
          {policy ? <p className="text-xs text-slate-500">Linked to policy: {policy.policyNumber}</p> : null}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn">Save as draft</button>
            <button type="submit" name="sendNow" value="1" className="btn-primary">Create &amp; send</button>
          </div>
        </form>
      </div>
    </>
  );
}
