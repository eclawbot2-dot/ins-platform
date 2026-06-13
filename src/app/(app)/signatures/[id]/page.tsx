import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, DetailItem } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import {
  SIGNATURE_STATUS_LABELS,
  SIGNATURE_DOC_KIND_LABELS,
  SIGNATURE_PROVIDER_LABELS,
  signatureStatusTone,
} from "@/lib/labels";
import { fmtDate } from "@/lib/domain/dates";
import { BRAND } from "@/lib/brand";
import { buildSignHerePacket, isOpen, isTerminal } from "@/lib/domain/signatures";
import { eSignEnabled } from "@/lib/signatures/provider";
import { sendSignatureRequest, markSigned, voidSignature, declineSignature } from "../actions";

export const dynamic = "force-dynamic";

export default async function SignatureDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const req = await prisma.signatureRequest.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      policy: { select: { id: true, policyNumber: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!req) notFound();

  const agency = await prisma.agencyProfile.findUnique({ where: { id: "agency" } });
  const live = eSignEnabled();

  const packet = buildSignHerePacket({
    agencyName: agency?.name ?? BRAND.name,
    title: req.title,
    signerName: req.signerName,
    docKindLabel: SIGNATURE_DOC_KIND_LABELS[req.docKind],
    message: req.message,
    date: fmtDate(req.createdAt),
  });

  return (
    <>
      <PageHeader
        title={req.title}
        description={
          <>
            {SIGNATURE_DOC_KIND_LABELS[req.docKind]} · <Badge tone={signatureStatusTone(req.status)}>{SIGNATURE_STATUS_LABELS[req.status]}</Badge>
          </>
        }
        actions={<Link href="/signatures" className="btn">All requests</Link>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card-pad">
            <h2 className="section-title mb-3">Request</h2>
            <dl className="grid grid-cols-2 gap-3">
              <DetailItem label="Signer">{req.signerName}</DetailItem>
              <DetailItem label="Signer email">{req.signerEmail}</DetailItem>
              <DetailItem label="Provider">{SIGNATURE_PROVIDER_LABELS[req.provider]}</DetailItem>
              <DetailItem label="Created by">{req.createdBy?.name ?? "—"}</DetailItem>
              <DetailItem label="Client">
                {req.client ? <Link href={`/clients/${req.client.id}`} className="text-navy-700 hover:underline">{req.client.name}</Link> : "—"}
              </DetailItem>
              <DetailItem label="Policy">
                {req.policy ? <Link href={`/policies/${req.policy.id}`} className="text-navy-700 hover:underline">{req.policy.policyNumber}</Link> : "—"}
              </DetailItem>
              <DetailItem label="Sent">{req.sentAt ? fmtDate(req.sentAt) : "—"}</DetailItem>
              <DetailItem label="Signed">{req.signedAt ? fmtDate(req.signedAt) : "—"}</DetailItem>
              <DetailItem label="Expires">{req.expiresAt ? fmtDate(req.expiresAt) : "—"}</DetailItem>
              <DetailItem label="Envelope">{req.envelopeId ?? "—"}</DetailItem>
            </dl>
            {req.message ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{req.message}</p> : null}
            {req.declineReason ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Declined: {req.declineReason}</p> : null}
          </div>

          {!live ? (
            <div className="card-pad">
              <h2 className="section-title mb-3">Printable sign-here packet</h2>
              <p className="mb-3 text-xs text-slate-500">
                No e-sign provider configured. Print this packet, collect a wet signature, then mark the request signed.
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">{packet}</pre>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="card-pad">
            <h2 className="section-title mb-3">Actions</h2>
            <div className="space-y-3">
              {req.status === "DRAFT" ? (
                <form action={sendSignatureRequest.bind(null, req.id)}>
                  <button type="submit" className="btn-primary w-full justify-center">Send for signature</button>
                </form>
              ) : null}

              {isOpen(req.status) ? (
                <>
                  <form action={markSigned.bind(null, req.id)}>
                    <ConfirmButton className="btn-primary w-full justify-center" message="Mark this request as signed?">
                      Mark signed
                    </ConfirmButton>
                  </form>
                  <form action={declineSignature.bind(null, req.id)} className="space-y-2">
                    <Field label="Decline reason">
                      <input name="declineReason" className="input" placeholder="Signer declined" />
                    </Field>
                    <button type="submit" className="btn w-full justify-center">Mark declined</button>
                  </form>
                  <form action={voidSignature.bind(null, req.id)}>
                    <ConfirmButton className="btn w-full justify-center" message="Void this signature request?">
                      Void request
                    </ConfirmButton>
                  </form>
                </>
              ) : null}

              {isTerminal(req.status) ? (
                <p className="text-sm text-slate-500">This request is closed ({SIGNATURE_STATUS_LABELS[req.status]}).</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
