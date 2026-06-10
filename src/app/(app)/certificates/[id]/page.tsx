import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/ui/print-button";
import { fmtDate } from "@/lib/domain/dates";

export const metadata = { title: "Certificate" };
export const dynamic = "force-dynamic";

export default async function CertificateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [cert, agency] = await Promise.all([
    prisma.certificate.findUnique({
      where: { id },
      include: {
        client: true,
        holder: true,
        issuedBy: { select: { name: true } },
        coverages: { orderBy: { coverageType: "asc" } },
      },
    }),
    prisma.agencyProfile.findUnique({ where: { id: "agency" } }),
  ]);
  if (!cert) notFound();

  // Distinct insurer letters (ACORD style: INSR A, B, C…).
  const insurers = Array.from(new Set(cert.coverages.map((c) => c.carrierName)));
  const letterOf = (carrier: string) => String.fromCharCode(65 + insurers.indexOf(carrier));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/certificates" className="btn">
          ← Certificates
        </Link>
        <PrintButton label="Print certificate" />
      </div>

      <div className="print-page card bg-white p-8 text-[13px] leading-snug text-slate-900">
        <div className="mb-2 flex items-start justify-between border-b-2 border-slate-800 pb-2">
          <h1 className="text-lg font-bold tracking-wide">CERTIFICATE OF LIABILITY INSURANCE</h1>
          <div className="text-right text-xs">
            <div>
              <span className="font-semibold">DATE:</span> {fmtDate(cert.issuedAt)}
            </div>
            <div>
              <span className="font-semibold">CERT #:</span> {cert.certNumber}
            </div>
          </div>
        </div>

        <p className="mb-3 text-[10px] uppercase text-slate-500">
          This certificate is issued as a matter of information only and confers no rights upon the certificate holder.
          This certificate does not affirmatively or negatively amend, extend or alter the coverage afforded by the
          policies below.
        </p>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div className="border border-slate-300 p-2">
            <div className="text-[10px] font-bold uppercase text-slate-500">Producer</div>
            <div className="font-semibold">{agency?.name ?? "Ins Platform Agency"}</div>
            <div>{agency?.addressLine1}</div>
            <div>
              {[agency?.city, agency?.state, agency?.zip].filter(Boolean).join(", ")}
            </div>
            <div>{agency?.phone}</div>
            <div>{agency?.email}</div>
          </div>
          <div className="border border-slate-300 p-2">
            <div className="text-[10px] font-bold uppercase text-slate-500">Insured</div>
            <div className="font-semibold">{cert.client.name}</div>
            <div>{cert.client.addressLine1}</div>
            <div>{[cert.client.city, cert.client.state, cert.client.zip].filter(Boolean).join(", ")}</div>
          </div>
        </div>

        <div className="mb-3 border border-slate-300 p-2">
          <div className="text-[10px] font-bold uppercase text-slate-500">Insurers affording coverage</div>
          {insurers.map((name) => (
            <div key={name}>
              <span className="font-semibold">INSURER {letterOf(name)}:</span> {name}
            </div>
          ))}
        </div>

        <table className="mb-3 w-full border-collapse border border-slate-300 text-xs">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className="border border-slate-300 px-1.5 py-1">INSR</th>
              <th className="border border-slate-300 px-1.5 py-1">TYPE OF INSURANCE</th>
              <th className="border border-slate-300 px-1.5 py-1">POLICY NUMBER</th>
              <th className="border border-slate-300 px-1.5 py-1">EFF DATE</th>
              <th className="border border-slate-300 px-1.5 py-1">EXP DATE</th>
              <th className="border border-slate-300 px-1.5 py-1">LIMITS</th>
            </tr>
          </thead>
          <tbody>
            {cert.coverages.map((c) => (
              <tr key={c.id}>
                <td className="border border-slate-300 px-1.5 py-1 text-center font-semibold">{letterOf(c.carrierName)}</td>
                <td className="border border-slate-300 px-1.5 py-1">
                  {c.coverageType}
                  {cert.additionalInsured ? <div className="text-[10px]">Addl Insd: Y</div> : null}
                  {cert.waiverOfSubrogation ? <div className="text-[10px]">Subr Wvd: Y</div> : null}
                </td>
                <td className="border border-slate-300 px-1.5 py-1">{c.policyNumber}</td>
                <td className="border border-slate-300 px-1.5 py-1">{fmtDate(c.effectiveDate)}</td>
                <td className="border border-slate-300 px-1.5 py-1">{fmtDate(c.expirationDate)}</td>
                <td className="border border-slate-300 px-1.5 py-1 whitespace-pre-wrap">{c.limitsText}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mb-3 border border-slate-300 p-2">
          <div className="text-[10px] font-bold uppercase text-slate-500">
            Description of operations / locations / vehicles
          </div>
          <p className="whitespace-pre-wrap">{cert.descriptionOfOps ?? "—"}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="border border-slate-300 p-2">
            <div className="text-[10px] font-bold uppercase text-slate-500">Certificate holder</div>
            <div className="font-semibold">{cert.holder.name}</div>
            <div>{cert.holder.addressLine1}</div>
            <div>{[cert.holder.city, cert.holder.state, cert.holder.zip].filter(Boolean).join(", ")}</div>
          </div>
          <div className="border border-slate-300 p-2">
            <div className="text-[10px] font-bold uppercase text-slate-500">Cancellation</div>
            <p className="text-[10px]">
              Should any of the above described policies be cancelled before the expiration date thereof, notice will
              be delivered in accordance with the policy provisions.
            </p>
            <div className="mt-4 border-t border-slate-400 pt-1 text-[10px]">
              <span className="font-semibold">Authorized representative:</span> {cert.issuedBy.name}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
