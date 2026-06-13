import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import {
  SIGNATURE_STATUS_LABELS,
  SIGNATURE_DOC_KIND_LABELS,
  SIGNATURE_PROVIDER_LABELS,
  signatureStatusTone,
} from "@/lib/labels";
import { fmtDate } from "@/lib/domain/dates";
import { eSignEnabled, configuredProvider } from "@/lib/signatures/provider";

export const metadata = { title: "E-signatures" };
export const dynamic = "force-dynamic";

export default async function SignaturesPage() {
  const requests = await prisma.signatureRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { client: { select: { name: true } }, policy: { select: { policyNumber: true } } },
  });

  const provider = configuredProvider();
  const live = eSignEnabled();

  return (
    <>
      <PageHeader
        title="E-signatures"
        description="Send proposals, applications and certificates for signature. Track each request through to signed."
        actions={
          <Link href="/signatures/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New request
          </Link>
        }
      />

      <div className="card-pad mb-4 text-sm">
        Provider: <span className="font-medium">{SIGNATURE_PROVIDER_LABELS[provider]}</span>{" "}
        {live ? (
          <Badge tone="green">Live</Badge>
        ) : (
          <Badge tone="slate">Manual — print &amp; sign</Badge>
        )}
        {!live ? (
          <span className="ml-2 text-xs text-slate-500">
            No e-sign provider configured — requests produce a printable sign-here packet and are marked signed by hand.
          </span>
        ) : null}
      </div>

      <DataTable
        rows={requests}
        rowHref={(r) => `/signatures/${r.id}`}
        emptyMessage="No signature requests yet."
        columns={[
          { key: "title", header: "Document", render: (r) => r.title },
          { key: "kind", header: "Type", render: (r) => SIGNATURE_DOC_KIND_LABELS[r.docKind] },
          { key: "signer", header: "Signer", render: (r) => r.signerName },
          { key: "client", header: "Client", render: (r) => r.client?.name ?? "—" },
          { key: "policy", header: "Policy", render: (r) => r.policy?.policyNumber ?? "—" },
          {
            key: "status",
            header: "Status",
            render: (r) => <Badge tone={signatureStatusTone(r.status)}>{SIGNATURE_STATUS_LABELS[r.status]}</Badge>,
          },
          { key: "created", header: "Created", render: (r) => fmtDate(r.createdAt) },
        ]}
      />
    </>
  );
}
