import Link from "next/link";
import { Settings2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { fmtDate } from "@/lib/domain/dates";
import {
  TOUCHPOINT_CATEGORY_LABELS,
  TOUCHPOINT_STATUS_LABELS,
  touchpointCategoryTone,
  touchpointStatusTone,
} from "@/lib/labels";
import {
  approveTouchpoint,
  editAndApproveTouchpoint,
  skipTouchpoint,
  sendNowTouchpoint,
  snoozeTouchpoint,
} from "./actions";

export const metadata = { title: "Touchpoints" };
export const dynamic = "force-dynamic";

export default async function TouchpointsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; producer?: string; q?: string }>;
}) {
  await requireSession();
  const { category, producer, q } = await searchParams;

  const clientWhere = {
    ...(producer ? { producerId: producer } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [pending, upcoming, recent, producers] = await Promise.all([
    // Needs-approval queue.
    prisma.scheduledTouchpoint.findMany({
      where: {
        status: "PENDING",
        ...(category ? { template: { category: category as never } } : {}),
        client: clientWhere,
      },
      include: { template: true, client: { select: { id: true, name: true, email: true, producer: { select: { name: true } } } } },
      orderBy: { scheduledFor: "asc" },
      take: 100,
    }),
    // Upcoming approved + auto-sendable.
    prisma.scheduledTouchpoint.findMany({
      where: {
        status: "APPROVED",
        ...(category ? { template: { category: category as never } } : {}),
        client: clientWhere,
      },
      include: { template: true, client: { select: { id: true, name: true } } },
      orderBy: { scheduledFor: "asc" },
      take: 60,
    }),
    // Recently sent/skipped/failed.
    prisma.scheduledTouchpoint.findMany({
      where: {
        status: { in: ["SENT", "SKIPPED", "FAILED"] },
        ...(category ? { template: { category: category as never } } : {}),
        client: clientWhere,
      },
      include: { template: true, client: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.user.findMany({ where: { active: true, role: { not: "CLIENT" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const cats = Object.keys(TOUCHPOINT_CATEGORY_LABELS) as Array<keyof typeof TOUCHPOINT_CATEGORY_LABELS>;

  return (
    <>
      <PageHeader
        title="Touchpoints"
        description="Proactive client appreciation and anticipatory service — approve, edit, send, and schedule warm outreach across the whole lifecycle."
        actions={
          <Link href="/touchpoints/templates" className="btn">
            <Settings2 className="h-4 w-4" /> Journeys
          </Link>
        }
      />

      {/* Filters */}
      <form className="card-pad mb-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="q">Client</label>
          <input id="q" name="q" defaultValue={q ?? ""} placeholder="Name…" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="category">Category</label>
          <select id="category" name="category" defaultValue={category ?? ""} className="input">
            <option value="">All categories</option>
            {cats.map((c) => (
              <option key={c} value={c}>{TOUCHPOINT_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="producer">Producer</label>
          <select id="producer" name="producer" defaultValue={producer ?? ""} className="input">
            <option value="">All producers</option>
            {producers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className="btn-primary w-full justify-center">Filter</button>
        </div>
      </form>

      {/* Needs-approval queue */}
      <div className="card-pad mb-6">
        <h2 className="section-title mb-3">
          Needs approval{" "}
          <Badge tone={pending.length > 0 ? "amber" : "slate"}>{pending.length}</Badge>
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing waiting on you — every sensitive touchpoint is reviewed.</p>
        ) : (
          <ul className="space-y-4">
            {pending.map((t) => (
              <li key={t.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-slate-800">
                      <Badge tone={touchpointCategoryTone(t.template.category)}>{TOUCHPOINT_CATEGORY_LABELS[t.template.category]}</Badge>{" "}
                      {t.template.name}
                    </span>
                    <div className="mt-0.5 text-xs text-slate-500">
                      <Link href={`/clients/${t.client.id}`} className="text-navy-700 hover:underline">{t.client.name}</Link>
                      {" · "}{t.client.email ?? "no email"}{" · scheduled "}{fmtDate(t.scheduledFor)}
                      {t.client.producer?.name ? ` · ${t.client.producer.name}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <form action={approveTouchpoint.bind(null, t.id)}>
                      <button type="submit" className="btn btn-sm">Approve</button>
                    </form>
                    <form action={sendNowTouchpoint.bind(null, t.id)}>
                      <button type="submit" className="btn btn-sm">Send now</button>
                    </form>
                    <form action={snoozeTouchpoint.bind(null, t.id)} className="flex items-center gap-1">
                      <input name="days" type="number" min="1" defaultValue={7} className="input w-16 py-1 text-xs" aria-label="Snooze days" />
                      <button type="submit" className="btn btn-sm">Snooze</button>
                    </form>
                    <form action={skipTouchpoint.bind(null, t.id)}>
                      <ConfirmButton message="Skip this touchpoint? It will never send.">Skip</ConfirmButton>
                    </form>
                  </div>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-navy-700">Preview / edit copy</summary>
                  <form action={editAndApproveTouchpoint.bind(null, t.id)} className="mt-2 space-y-2">
                    <input name="renderedSubject" defaultValue={t.renderedSubject ?? t.template.subject} className="input text-sm" />
                    <textarea name="renderedBody" rows={6} defaultValue={t.renderedBody ?? t.template.body} className="input font-mono text-xs" />
                    <button type="submit" className="btn btn-sm">Edit &amp; approve</button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Upcoming (approved, auto-sendable) */}
      <div className="card mb-6 overflow-x-auto">
        <div className="px-4 pt-4"><h2 className="section-title mb-2">Upcoming ({upcoming.length})</h2></div>
        <table className="table-base">
          <thead>
            <tr><th>When</th><th>Category</th><th>Touchpoint</th><th>Client</th><th></th></tr>
          </thead>
          <tbody>
            {upcoming.map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap">{fmtDate(t.scheduledFor)}</td>
                <td><Badge tone={touchpointCategoryTone(t.template.category)}>{TOUCHPOINT_CATEGORY_LABELS[t.template.category]}</Badge></td>
                <td>{t.template.name}</td>
                <td><Link href={`/clients/${t.client.id}`} className="text-navy-700 hover:underline">{t.client.name}</Link></td>
                <td className="text-right">
                  <form action={sendNowTouchpoint.bind(null, t.id)}>
                    <button type="submit" className="btn btn-sm">Send now</button>
                  </form>
                </td>
              </tr>
            ))}
            {upcoming.length === 0 ? (
              <tr><td colSpan={5} className="py-6 text-center text-slate-400">No upcoming auto-send touchpoints.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Recent history */}
      <div className="card overflow-x-auto">
        <div className="px-4 pt-4"><h2 className="section-title mb-2">Recent activity</h2></div>
        <table className="table-base">
          <thead>
            <tr><th>Status</th><th>Touchpoint</th><th>Client</th><th>When</th></tr>
          </thead>
          <tbody>
            {recent.map((t) => (
              <tr key={t.id}>
                <td><Badge tone={touchpointStatusTone(t.status)}>{TOUCHPOINT_STATUS_LABELS[t.status]}</Badge></td>
                <td>{t.template.name}{t.failureReason ? <span className="ml-1 text-xs text-slate-400">({t.failureReason})</span> : null}</td>
                <td><Link href={`/clients/${t.client.id}`} className="text-navy-700 hover:underline">{t.client.name}</Link></td>
                <td className="whitespace-nowrap">{fmtDate(t.sentAt ?? t.createdAt)}</td>
              </tr>
            ))}
            {recent.length === 0 ? (
              <tr><td colSpan={4} className="py-6 text-center text-slate-400">No activity yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
