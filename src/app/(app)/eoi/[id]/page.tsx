import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/ui/print-button";
import { fmtDate } from "@/lib/domain/dates";
import { fmtMoney } from "@/lib/money";
import { EOI_HOLDER_INTEREST_LABELS } from "@/lib/labels";
import { eoiHeading } from "@/lib/documents/eoi";

export const metadata = { title: "Evidence of Property" };
export const dynamic = "force-dynamic";

export default async function EoiDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [eoi, agency] = await Promise.all([
    prisma.evidenceOfProperty.findUnique({
      where: { id },
      include: {
        client: true,
        policy: { select: { id: true, carrier: { select: { naicCode: true } } } },
        issuedBy: { select: { name: true } },
      },
    }),
    prisma.agencyProfile.findUnique({ where: { id: "agency" } }),
  ]);
  if (!eoi) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/eoi" className="btn">← Evidence of Property</Link>
        <PrintButton label="Print evidence" />
      </div>

      <div className="print-page card bg-white p-8 text-[13px] leading-snug text-slate-900">
        <div className="mb-2 flex items-start justify-between border-b-2 border-slate-800 pb-2">
          <h1 className="text-lg font-bold tracking-wide">{eoiHeading(eoi.kind)}</h1>
          <div className="text-right text-xs">
            <div><span className="font-semibold">DATE:</span> {fmtDate(eoi.issuedAt)}</div>
            <div><span className="font-semibold">EOI #:</span> {eoi.eoiNumber}</div>
          </div>
        </div>

        <p className="mb-3 text-[10px] uppercase text-slate-500">
          This evidence of property insurance is issued as a matter of information only and confers no rights upon the
          additional interest named below. It does not affirmatively or negatively amend, extend or alter the coverage
          afforded by the policy listed below.
        </p>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div className="border border-slate-300 p-2">
            <div className="text-[10px] font-bold uppercase text-slate-500">Agency</div>
            <div className="font-semibold">{agency?.name ?? BRAND.name}</div>
            <div>{agency?.addressLine1}</div>
            <div>{[agency?.city, agency?.state, agency?.zip].filter(Boolean).join(", ")}</div>
            <div>{agency?.phone ?? BRAND.phone}</div>
            <div>{agency?.email ?? BRAND.email}</div>
          </div>
          <div className="border border-slate-300 p-2">
            <div className="text-[10px] font-bold uppercase text-slate-500">Company (insurer)</div>
            <div className="font-semibold">{eoi.carrierName}</div>
            <div>NAIC #: {eoi.policy.carrier.naicCode ?? "—"}</div>
          </div>
        </div>

        <div className="mb-3 border border-slate-300 p-2">
          <div className="text-[10px] font-bold uppercase text-slate-500">Named insured &amp; policy</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div><div className="text-[9px] uppercase text-slate-400">Insured</div><div className="font-semibold">{eoi.client.name}</div></div>
            <div><div className="text-[9px] uppercase text-slate-400">Policy #</div><div className="font-semibold">{eoi.policyNumber}</div></div>
            <div><div className="text-[9px] uppercase text-slate-400">Effective</div><div>{fmtDate(eoi.effectiveDate)}</div></div>
            <div><div className="text-[9px] uppercase text-slate-400">Expiration</div><div>{fmtDate(eoi.expirationDate)}</div></div>
          </div>
        </div>

        <div className="mb-3 border border-slate-300 p-2">
          <div className="text-[10px] font-bold uppercase text-slate-500">Property &amp; coverage</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div><div className="text-[9px] uppercase text-slate-400">Property / location</div><div className="font-semibold">{eoi.propertyAddress ?? "Per policy"}</div></div>
            <div><div className="text-[9px] uppercase text-slate-400">Coverage A / dwelling limit</div><div className="font-semibold">{eoi.coverageALimit != null ? fmtMoney(eoi.coverageALimit) : "Per policy terms"}</div></div>
            <div><div className="text-[9px] uppercase text-slate-400">Deductible</div><div>{eoi.deductibleText ?? "Per policy"}</div></div>
          </div>
        </div>

        <div className="mb-3 border border-slate-300 p-2">
          <div className="text-[10px] font-bold uppercase text-slate-500">
            Additional interest ({EOI_HOLDER_INTEREST_LABELS[eoi.holderInterest]})
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div><div className="text-[9px] uppercase text-slate-400">Name</div><div className="font-semibold">{eoi.holderName}</div></div>
            <div><div className="text-[9px] uppercase text-slate-400">Loan number</div><div>{eoi.loanNumber ?? "—"}</div></div>
            <div><div className="text-[9px] uppercase text-slate-400">Address</div><div>{eoi.holderAddress ?? "—"}</div></div>
          </div>
        </div>

        {eoi.remarks ? (
          <div className="mb-3 border border-slate-300 p-2">
            <div className="text-[10px] font-bold uppercase text-slate-500">Remarks</div>
            <p className="whitespace-pre-wrap">{eoi.remarks}</p>
          </div>
        ) : null}

        <div className="mt-4 flex items-end justify-between">
          <p className="max-w-md text-[10px] text-slate-500">
            Cancellation: should the described policy be cancelled before its expiration date, the company will endeavor
            to provide the additional interest notice in accordance with the policy provisions.
          </p>
          <div className="border-t border-slate-400 pt-1 text-[10px]">
            <span className="font-semibold">Authorized representative:</span> {eoi.issuedBy.name}
          </div>
        </div>
      </div>
    </div>
  );
}
