import Link from "next/link";
import { FileText, Receipt, ShieldAlert, CalendarClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal";
import {
  OPEN_CLAIM_STATUSES,
  OPEN_INVOICE_STATUSES,
  portalPolicyWhere,
} from "@/lib/domain/portal-scope";
import { fmtDate } from "@/lib/domain/dates";
import { fmtMoneyCents, toNum } from "@/lib/money";
import { LOB_LABELS } from "@/lib/labels";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function PortalDashboardPage() {
  // Gate BEFORE the first query; every query below is scoped by the
  // session's clientId — never by anything from the request.
  const session = await requirePortalSession();
  const clientId = session.clientId;

  const [client, agency, activePolicies, openInvoices, openClaimsCount] = await Promise.all([
    prisma.client.findUnique({
      where: { id: clientId },
      select: {
        name: true,
        producer: { select: { name: true, phone: true, email: true } },
        csr: { select: { name: true, phone: true, email: true } },
      },
    }),
    prisma.agencyProfile.findUnique({ where: { id: "agency" } }),
    prisma.policy.findMany({
      where: { ...portalPolicyWhere(clientId), status: { in: ["ACTIVE", "BOUND"] } },
      select: { id: true, policyNumber: true, lineOfBusiness: true, expirationDate: true },
      orderBy: { expirationDate: "asc" },
    }),
    prisma.invoice.findMany({
      where: { clientId, status: { in: OPEN_INVOICE_STATUSES } },
      select: { amount: true, paidAmount: true },
    }),
    prisma.claim.count({ where: { clientId, status: { in: OPEN_CLAIM_STATUSES } } }),
  ]);

  const now = new Date();
  const nextRenewal = activePolicies.find((p) => p.expirationDate >= now) ?? null;
  const openBalance = openInvoices.reduce((acc, i) => acc + toNum(i.amount) - toNum(i.paidAmount), 0);

  const stats = [
    {
      label: "Active policies",
      value: String(activePolicies.length),
      href: "/portal/policies",
      icon: FileText,
      sub: "View coverage details",
    },
    {
      label: "Next renewal",
      value: nextRenewal ? fmtDate(nextRenewal.expirationDate) : "—",
      href: nextRenewal ? `/portal/policies/${nextRenewal.id}` : "/portal/policies",
      icon: CalendarClock,
      sub: nextRenewal ? `${LOB_LABELS[nextRenewal.lineOfBusiness]} · ${nextRenewal.policyNumber}` : "No upcoming renewals",
    },
    {
      label: "Open invoices",
      value: String(openInvoices.length),
      href: "/portal/invoices",
      icon: Receipt,
      sub: openInvoices.length ? `${fmtMoneyCents(openBalance)} outstanding` : "Nothing due",
    },
    {
      label: "Open claims",
      value: String(openClaimsCount),
      href: "/portal/claims",
      icon: ShieldAlert,
      sub: "Track or report a claim",
    },
  ];

  return (
    <>
      <div className="mb-5">
        <h1 className="page-title">Welcome back</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Account overview for <span className="font-medium text-slate-700">{client?.name}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card-pad min-w-0 overflow-hidden transition hover:border-navy-300 hover:shadow">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="break-words text-xs font-semibold uppercase tracking-wide text-slate-500">{s.label}</div>
                <div title={s.value} className="mt-1 truncate text-xl font-semibold tabular-nums text-navy-700 md:text-2xl">{s.value}</div>
                <div className="mt-1 break-words text-xs text-slate-500">{s.sub}</div>
              </div>
              <s.icon className="h-5 w-5 shrink-0 text-gold-500" />
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card-pad">
          <h2 className="section-title mb-3">Your agency team</h2>
          <dl className="space-y-3 text-sm">
            {client?.producer ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your agent</dt>
                <dd className="mt-0.5 text-slate-800">
                  {client.producer.name}
                  {client.producer.phone ? ` · ${client.producer.phone}` : ""}
                  {client.producer.email ? ` · ${client.producer.email}` : ""}
                </dd>
              </div>
            ) : null}
            {client?.csr ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account manager</dt>
                <dd className="mt-0.5 text-slate-800">
                  {client.csr.name}
                  {client.csr.phone ? ` · ${client.csr.phone}` : ""}
                  {client.csr.email ? ` · ${client.csr.email}` : ""}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agency office</dt>
              <dd className="mt-0.5 text-slate-800">
                {agency?.name ?? BRAND.name}
                {agency?.phone ? ` · ${agency.phone}` : ""}
                {agency?.email ? ` · ${agency.email}` : ""}
              </dd>
              {agency?.addressLine1 ? (
                <dd className="text-slate-600">
                  {agency.addressLine1}
                  {agency.city ? `, ${agency.city}` : ""} {agency.state ?? ""} {agency.zip ?? ""}
                </dd>
              ) : null}
            </div>
          </dl>
        </div>

        <div className="card-pad">
          <h2 className="section-title mb-3">Quick actions</h2>
          <div className="grid grid-cols-1 gap-2">
            <Link href="/portal/claims/new" className="btn justify-start">Report a claim (FNOL)</Link>
            <Link href="/portal/certificates" className="btn justify-start">Request a certificate of insurance</Link>
            <Link href="/portal/invoices" className="btn justify-start">View & pay invoices</Link>
            <Link href="/portal/profile" className="btn justify-start">Update contact information</Link>
          </div>
        </div>
      </div>
    </>
  );
}
