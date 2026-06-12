import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/domain/dates";
import { EOI_HOLDER_INTEREST_LABELS } from "@/lib/labels";
import { fmtMoney } from "@/lib/money";

export const metadata = { title: "Evidence of Property" };
export const dynamic = "force-dynamic";

export default async function EoiListPage() {
  const eois = await prisma.evidenceOfProperty.findMany({
    include: { client: { select: { id: true, name: true } }, issuedBy: { select: { name: true } } },
    orderBy: { issuedAt: "desc" },
    take: 200,
  });

  return (
    <>
      <PageHeader
        title="Evidence of Property"
        description="ACORD 27/28-style evidence of insurance for property policies — issued to mortgagees and lenders."
        actions={
          <Link href="/eoi/new" className="btn-primary">
            <Plus className="h-4 w-4" /> Issue EOI
          </Link>
        }
      />

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>EOI #</th>
              <th>Insured</th>
              <th>Policy</th>
              <th>Holder</th>
              <th>Interest</th>
              <th className="text-right">Cov. A</th>
              <th>Issued</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {eois.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sm text-slate-400">
                  No evidence of property issued yet.
                </td>
              </tr>
            ) : (
              eois.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link href={`/eoi/${e.id}`} className="font-medium text-navy-700 hover:underline">
                      {e.eoiNumber}
                    </Link>
                  </td>
                  <td>
                    <Link href={`/clients/${e.client.id}`} className="text-navy-700 hover:underline">
                      {e.client.name}
                    </Link>
                  </td>
                  <td>{e.policyNumber}</td>
                  <td>{e.holderName}</td>
                  <td>
                    <Badge tone="slate">{EOI_HOLDER_INTEREST_LABELS[e.holderInterest]}</Badge>
                  </td>
                  <td className="text-right">{e.coverageALimit != null ? fmtMoney(e.coverageALimit) : "—"}</td>
                  <td>{fmtDate(e.issuedAt)}</td>
                  <td>{e.issuedBy.name}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
