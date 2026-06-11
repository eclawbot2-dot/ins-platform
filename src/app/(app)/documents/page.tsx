import Link from "next/link";
import { Upload } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { fmtDate } from "@/lib/domain/dates";
import { humanize } from "@/lib/labels";
import { deleteDocument, toggleDocumentVisibility, uploadDocument } from "./actions";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; policyId?: string; claimId?: string }>;
}) {
  const { clientId, policyId, claimId } = await searchParams;
  const where: Prisma.DocumentWhereInput = {
    ...(clientId ? { clientId } : {}),
    ...(policyId ? { policyId } : {}),
    ...(claimId ? { claimId } : {}),
  };

  const [docs, clients, policies, claims] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        client: { select: { id: true, name: true } },
        policy: { select: { id: true, policyNumber: true } },
        claim: { select: { id: true, claimNumber: true } },
        uploadedBy: { select: { name: true } },
      },
    }),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.policy.findMany({ select: { id: true, policyNumber: true }, orderBy: { policyNumber: "asc" }, take: 500 }),
    prisma.claim.findMany({ select: { id: true, claimNumber: true }, orderBy: { claimNumber: "asc" } }),
  ]);

  return (
    <>
      <PageHeader title="Documents" description="Files attached to clients, policies, and claims. Stored locally under uploads/." />

      <div className="card mb-6 overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>File</th>
              <th>Type</th>
              <th>Linked to</th>
              <th>Portal</th>
              <th>Size</th>
              <th>Uploaded</th>
              <th>By</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>
                  <a href={`/api/documents/${d.id}/download`} className="font-medium text-navy-700 hover:underline">
                    {d.fileName}
                  </a>
                </td>
                <td>
                  <Badge tone="slate">{humanize(d.docType)}</Badge>
                </td>
                <td className="text-xs">
                  {d.client ? (
                    <Link href={`/clients/${d.client.id}`} className="text-navy-700 hover:underline">
                      {d.client.name}
                    </Link>
                  ) : null}
                  {d.policy ? (
                    <>
                      {d.client ? " · " : ""}
                      <Link href={`/policies/${d.policy.id}`} className="text-navy-700 hover:underline">
                        {d.policy.policyNumber}
                      </Link>
                    </>
                  ) : null}
                  {d.claim ? (
                    <>
                      {" "}
                      <Link href={`/claims/${d.claim.id}`} className="text-navy-700 hover:underline">
                        {d.claim.claimNumber}
                      </Link>
                    </>
                  ) : null}
                  {!d.client && !d.policy && !d.claim ? "—" : null}
                </td>
                <td>
                  <form action={toggleDocumentVisibility.bind(null, d.id)} className="inline">
                    <button
                      type="submit"
                      className="cursor-pointer"
                      title={d.visibleToClient ? "Visible in the client portal — click to hide" : "Hidden from the client portal — click to share"}
                    >
                      {d.visibleToClient ? <Badge tone="green">Shared</Badge> : <Badge tone="slate">Hidden</Badge>}
                    </button>
                  </form>
                </td>
                <td>{fmtBytes(d.sizeBytes)}</td>
                <td>{fmtDate(d.createdAt)}</td>
                <td>{d.uploadedBy.name}</td>
                <td className="text-right">
                  <form action={deleteDocument.bind(null, d.id)}>
                    <ConfirmButton message={`Delete "${d.fileName}"? The file is removed permanently.`}>
                      Delete
                    </ConfirmButton>
                  </form>
                </td>
              </tr>
            ))}
            {docs.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  No documents{clientId || policyId || claimId ? " for this filter" : ""}.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="card-pad max-w-2xl">
        <h2 className="section-title mb-3">
          <Upload className="mr-1 inline h-4 w-4" /> Upload document
        </h2>
        <form action={uploadDocument} className="space-y-4">
          <input type="file" name="file" required className="input" />
          <FormGrid>
            <Field label="Document type">
              <Select
                name="docType"
                options={["POLICY_DOC", "APPLICATION", "ENDORSEMENT", "CERTIFICATE", "CLAIM_DOC", "CORRESPONDENCE", "ID_CARD", "LOSS_RUN", "OTHER"].map(
                  (t) => ({ value: t, label: humanize(t) }),
                )}
              />
            </Field>
            <Field label="Client">
              <Select name="clientId" allowEmpty defaultValue={clientId ?? ""} options={clients.map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
            <Field label="Policy">
              <Select
                name="policyId"
                allowEmpty
                defaultValue={policyId ?? ""}
                options={policies.map((p) => ({ value: p.id, label: p.policyNumber }))}
              />
            </Field>
            <Field label="Claim">
              <Select name="claimId" allowEmpty defaultValue={claimId ?? ""} options={claims.map((c) => ({ value: c.id, label: c.claimNumber }))} />
            </Field>
          </FormGrid>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="visibleToClient" /> Share with client in the portal
          </label>
          <button type="submit" className="btn-primary">
            Upload
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-400">Max 25 MB. Allowed: PDF, images, Office docs, text.</p>
      </div>
    </>
  );
}
