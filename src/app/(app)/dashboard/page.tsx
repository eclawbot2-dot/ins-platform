import Link from "next/link";
import {
  FileText,
  Users,
  TrendingUp,
  RefreshCw,
  ShieldAlert,
  GitBranch,
  Wallet,
  BookOpen,
  AlertTriangle,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { fmtMoney, toNum } from "@/lib/money";
import { addDays, fmtDate, startOfMonth, startOfYear } from "@/lib/domain/dates";
import { expirationSeverity } from "@/lib/domain/compliance";
import { pipelineValue } from "@/lib/domain/pipeline";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const in30 = addDays(now, 30);
  const in60 = addDays(now, 60);
  const in90 = addDays(now, 90);
  const ytd = startOfYear(now);
  const mtd = startOfMonth(now);

  const [
    activePolicies,
    bookPremiumAgg,
    activeClients,
    ytdNewBusinessAgg,
    renew30,
    renew60,
    renew90,
    openClaims,
    openOpps,
    commissionsMtdAgg,
    recentActivities,
    expiringLicenses,
    expiringAppointments,
    expiringEo,
    openTasks,
  ] = await Promise.all([
    prisma.policy.count({ where: { status: { in: ["ACTIVE", "BOUND"] } } }),
    prisma.policy.aggregate({ where: { status: { in: ["ACTIVE", "BOUND"] } }, _sum: { premium: true } }),
    prisma.client.count({ where: { status: "ACTIVE" } }),
    prisma.policy.aggregate({
      where: { isNewBusiness: true, effectiveDate: { gte: ytd }, status: { notIn: ["QUOTE"] } },
      _sum: { premium: true },
    }),
    prisma.policy.count({
      where: { status: { in: ["ACTIVE", "BOUND"] }, expirationDate: { gte: now, lte: in30 } },
    }),
    prisma.policy.count({
      where: { status: { in: ["ACTIVE", "BOUND"] }, expirationDate: { gt: in30, lte: in60 } },
    }),
    prisma.policy.count({
      where: { status: { in: ["ACTIVE", "BOUND"] }, expirationDate: { gt: in60, lte: in90 } },
    }),
    prisma.claim.count({ where: { status: { notIn: ["CLOSED", "DENIED"] } } }),
    prisma.opportunity.findMany({
      where: { stage: { in: ["NEW", "CONTACTED", "QUOTING", "PROPOSAL"] } },
      select: { stage: true, premiumEstimate: true },
    }),
    prisma.commissionStatementLine.aggregate({
      where: { statement: { statementDate: { gte: mtd } } },
      _sum: { commissionAmount: true },
    }),
    prisma.activity.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { name: true } }, client: { select: { id: true, name: true } } },
    }),
    prisma.license.findMany({
      where: { expiresAt: { lte: addDays(now, 60) } },
      include: { user: { select: { name: true } } },
      orderBy: { expiresAt: "asc" },
    }),
    prisma.carrier.findMany({
      where: { appointmentExpiresAt: { not: null, lte: addDays(now, 60) }, appointmentStatus: "APPOINTED" },
      orderBy: { appointmentExpiresAt: "asc" },
    }),
    prisma.eoPolicy.findMany({ where: { expirationDate: { lte: addDays(now, 60) } } }),
    prisma.task.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: { dueDate: "asc" },
      take: 8,
      include: { assignedTo: { select: { name: true } } },
    }),
  ]);

  const bookPremium = toNum(bookPremiumAgg._sum.premium);
  const ytdNew = toNum(ytdNewBusinessAgg._sum.premium);
  const commissionsMtd = toNum(commissionsMtdAgg._sum.commissionAmount);
  const pipeline = pipelineValue(
    openOpps.map((o) => ({ stage: o.stage, premiumEstimate: o.premiumEstimate ? toNum(o.premiumEstimate) : null })),
  );

  const complianceAlerts = [
    ...expiringLicenses.map((l) => ({
      key: `lic-${l.id}`,
      label: `${l.user.name} — ${l.state} license ${l.licenseNumber}`,
      date: l.expiresAt,
      href: "/compliance",
    })),
    ...expiringAppointments.map((c) => ({
      key: `app-${c.id}`,
      label: `${c.name} — carrier appointment`,
      date: c.appointmentExpiresAt!,
      href: `/carriers/${c.id}`,
    })),
    ...expiringEo.map((e) => ({
      key: `eo-${e.id}`,
      label: `Agency E&O ${e.policyNumber} (${e.carrierName})`,
      date: e.expirationDate,
      href: "/compliance",
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <>
      <PageHeader title="Dashboard" description="Agency book, pipeline, and compliance at a glance." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Book premium" value={fmtMoney(bookPremium)} sub="Active + bound policies" icon={BookOpen} href="/policies" />
        <StatCard label="Active policies" value={activePolicies} icon={FileText} href="/policies?status=ACTIVE" />
        <StatCard label="Active clients" value={activeClients} icon={Users} href="/clients?status=ACTIVE" />
        <StatCard label="YTD new business" value={fmtMoney(ytdNew)} icon={TrendingUp} href="/reports/production" tone="good" />
        <StatCard
          label="Renewals 30 / 60 / 90"
          value={`${renew30} / ${renew60} / ${renew90}`}
          sub="Policies by days to X-date"
          icon={RefreshCw}
          href="/renewals"
          tone={renew30 > 0 ? "warn" : "default"}
        />
        <StatCard label="Open claims" value={openClaims} icon={ShieldAlert} href="/claims" tone={openClaims > 0 ? "warn" : "default"} />
        <StatCard label="Pipeline value" value={fmtMoney(pipeline)} sub={`${openOpps.length} open opportunities`} icon={GitBranch} href="/opportunities" />
        <StatCard label="Commissions MTD" value={fmtMoney(commissionsMtd)} sub="From carrier statements" icon={Wallet} href="/commissions" />
      </div>

      {complianceAlerts.length > 0 ? (
        <div className="card mt-6 border-amber-200 bg-amber-50/60 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" /> Compliance — expiring within 60 days
          </div>
          <ul className="space-y-1">
            {complianceAlerts.map((a) => {
              const sev = expirationSeverity(a.date);
              return (
                <li key={a.key} className="flex items-center justify-between gap-2 text-sm text-amber-900">
                  <Link href={a.href} className="hover:underline">
                    {a.label}
                  </Link>
                  <span className="flex items-center gap-2">
                    <Badge tone={sev === "EXPIRED" || sev === "CRITICAL" ? "red" : "amber"}>
                      {sev === "EXPIRED" ? "Expired" : fmtDate(a.date)}
                    </Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card-pad">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Activity feed</h2>
            <Link href="/clients" className="text-xs text-navy-700 hover:underline">
              View clients →
            </Link>
          </div>
          <ul className="space-y-3">
            {recentActivities.length === 0 ? (
              <li className="text-sm text-slate-400">No activity yet.</li>
            ) : (
              recentActivities.map((a) => (
                <li key={a.id} className="border-b border-slate-100 pb-2 text-sm last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">{a.subject}</span>
                    <span className="shrink-0 text-xs text-slate-400">{fmtDate(a.createdAt)}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {a.user.name}
                    {a.client ? (
                      <>
                        {" · "}
                        <Link href={`/clients/${a.client.id}`} className="text-navy-700 hover:underline">
                          {a.client.name}
                        </Link>
                      </>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="card-pad">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Tasks due</h2>
            <Link href="/tasks" className="text-xs text-navy-700 hover:underline">
              All tasks →
            </Link>
          </div>
          <ul className="space-y-2">
            {openTasks.length === 0 ? (
              <li className="text-sm text-slate-400">No open tasks.</li>
            ) : (
              openTasks.map((t) => {
                const overdue = t.dueDate < now;
                return (
                  <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-slate-800">{t.title}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                      {t.assignedTo?.name ?? "Unassigned"}
                      <Badge tone={overdue ? "red" : "slate"}>{fmtDate(t.dueDate)}</Badge>
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>
    </>
  );
}
