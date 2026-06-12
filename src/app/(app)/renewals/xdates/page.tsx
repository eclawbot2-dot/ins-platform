import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { LOB_LABELS } from "@/lib/labels";
import { fmtMoney } from "@/lib/money";
import { fmtDate, daysUntil, addDays } from "@/lib/domain/dates";
import { xDateBucket } from "@/lib/domain/xdates";

export const metadata = { title: "X-dates due" };
export const dynamic = "force-dynamic";

/**
 * X-dates worklist: prospect/client competitor-policy expirations due in
 * the next 90 days (plus overdue). Each row is a cross-sell / win-back
 * trigger — call before the competitor renews.
 */
export default async function XDatesPage({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const { window } = await searchParams;
  const now = new Date();
  const windowDays = window === "60" ? 60 : window === "30" ? 30 : 90;
  const horizon = addDays(now, windowDays);

  const xdates = await prisma.priorPolicy.findMany({
    where: { expirationDate: { lte: horizon } },
    orderBy: { expirationDate: "asc" },
    include: {
      client: { select: { id: true, name: true } },
      lead: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const overdue = xdates.filter((x) => daysUntil(x.expirationDate, now) < 0).length;
  const in30 = xdates.filter((x) => { const d = daysUntil(x.expirationDate, now); return d >= 0 && d <= 30; }).length;
  const in60 = xdates.filter((x) => { const d = daysUntil(x.expirationDate, now); return d > 30 && d <= 60; }).length;
  const in90 = xdates.filter((x) => { const d = daysUntil(x.expirationDate, now); return d > 60 && d <= 90; }).length;

  return (
    <>
      <PageHeader
        title="X-dates due"
        description="Competitor policy expirations to act on before they renew."
        actions={
          <div className="flex gap-2">
            {(["30", "60", "90"] as const).map((w) => (
              <Link
                key={w}
                href={`/renewals/xdates?window=${w}`}
                className={`btn btn-sm ${String(windowDays) === w ? "btn-primary" : ""}`}
              >
                {w} days
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Overdue" value={overdue} icon={CalendarClock} tone={overdue > 0 ? "warn" : "default"} />
        <StatCard label="Due ≤ 30 days" value={in30} icon={CalendarClock} tone={in30 > 0 ? "warn" : "default"} />
        <StatCard label="31–60 days" value={in60} icon={CalendarClock} />
        <StatCard label="61–90 days" value={in90} icon={CalendarClock} />
      </div>

      <div className="card-pad mt-6">
        <div className="overflow-x-auto">
          <table className="table-base min-w-[720px]">
            <thead>
              <tr>
                <th>Prospect / client</th>
                <th>Line</th>
                <th>Current carrier</th>
                <th className="text-right">Premium</th>
                <th>X-date</th>
                <th>Window</th>
              </tr>
            </thead>
            <tbody>
              {xdates.map((x) => {
                const bucket = xDateBucket(x.expirationDate, now);
                const tone = bucket === "OVERDUE" ? "red" : bucket === "DUE_30" ? "amber" : bucket === "DUE_60" ? "violet" : "slate";
                const who = x.client
                  ? { href: `/clients/${x.client.id}`, name: x.client.name }
                  : x.lead
                    ? { href: `/leads/${x.lead.id}`, name: `${x.lead.firstName} ${x.lead.lastName}` }
                    : { href: null, name: "—" };
                return (
                  <tr key={x.id}>
                    <td>
                      {who.href ? (
                        <Link href={who.href} className="font-medium text-navy-700 hover:underline">
                          {who.name}
                        </Link>
                      ) : (
                        who.name
                      )}
                    </td>
                    <td>{LOB_LABELS[x.lineOfBusiness]}</td>
                    <td>{x.currentCarrier ?? "—"}</td>
                    <td className="text-right">{x.currentPremium != null ? fmtMoney(x.currentPremium) : "—"}</td>
                    <td className="whitespace-nowrap">{fmtDate(x.expirationDate)}</td>
                    <td>
                      <Badge tone={tone}>{bucket === "OVERDUE" ? "Overdue" : `${daysUntil(x.expirationDate, now)}d`}</Badge>
                    </td>
                  </tr>
                );
              })}
              {xdates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No X-dates due within {windowDays} days.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
