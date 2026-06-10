import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { SearchBar, Pagination, PAGE_SIZE, parsePage } from "@/components/ui/list-controls";
import { fmtDate } from "@/lib/domain/dates";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Certificates" };
export const dynamic = "force-dynamic";

export default async function CertificatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageRaw } = await searchParams;
  const page = parsePage(pageRaw);

  const where: Prisma.CertificateWhereInput = q
    ? {
        OR: [
          { certNumber: { contains: q, mode: "insensitive" } },
          { client: { name: { contains: q, mode: "insensitive" } } },
          { holder: { name: { contains: q, mode: "insensitive" } } },
        ],
      }
    : {};

  const [certs, total] = await Promise.all([
    prisma.certificate.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        client: { select: { name: true } },
        holder: { select: { name: true } },
        issuedBy: { select: { name: true } },
        coverages: { select: { id: true } },
      },
    }),
    prisma.certificate.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Certificates of insurance"
        description="ACORD 25-style certificate issuance records."
        actions={
          <>
            <Link href="/certificates/holders" className="btn">
              <Users className="h-4 w-4" /> Holder directory
            </Link>
            <Link href="/certificates/new" className="btn-primary">
              <Plus className="h-4 w-4" /> Issue COI
            </Link>
          </>
        }
      />
      <div className="mb-4">
        <SearchBar action="/certificates" q={q} placeholder="Search cert #, insured, holder…" />
      </div>
      <DataTable
        rows={certs}
        rowHref={(c) => `/certificates/${c.id}`}
        emptyMessage="No certificates issued."
        columns={[
          { key: "certNumber", header: "Cert #" },
          { key: "client", header: "Insured", render: (c) => c.client.name },
          { key: "holder", header: "Certificate holder", render: (c) => c.holder.name },
          { key: "coverages", header: "Coverages", render: (c) => c.coverages.length },
          { key: "flags", header: "Flags", render: (c) => [c.additionalInsured ? "AI" : null, c.waiverOfSubrogation ? "WOS" : null].filter(Boolean).join(", ") || "—" },
          { key: "issued", header: "Issued", render: (c) => fmtDate(c.issuedAt) },
          { key: "by", header: "Issued by", render: (c) => c.issuedBy.name },
        ]}
      />
      <div className="mt-3">
        <Pagination basePath="/certificates" page={page} total={total} params={{ q }} />
      </div>
    </>
  );
}
