import Link from "next/link";
import { AlertTriangle, GraduationCap, Plus, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { fmtMoney, toNum } from "@/lib/money";
import { fmtDate, daysUntil } from "@/lib/domain/dates";
import { ceProgress, expirationSeverity, ALERT_WINDOW_DAYS } from "@/lib/domain/compliance";
import { humanize } from "@/lib/labels";
import { ThSort } from "@/components/ui/data-table";
import { applySort, parseSortParams } from "@/lib/sort";
import { addCeCredit, addEoPolicy, addLicense, deleteEoPolicy, deleteLicense, renewLicense } from "./actions";

export const metadata = { title: "Compliance" };
export const dynamic = "force-dynamic";

function sevBadge(expiresAt: Date) {
  const sev = expirationSeverity(expiresAt);
  if (sev === "EXPIRED") return <Badge tone="red">Expired</Badge>;
  if (sev === "CRITICAL") return <Badge tone="red">{daysUntil(expiresAt)}d left</Badge>;
  if (sev === "WARNING") return <Badge tone="amber">{daysUntil(expiresAt)}d left</Badge>;
  return <Badge tone="green">OK</Badge>;
}

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ apptSort?: string; apptDir?: string; eoSort?: string; eoDir?: string }>;
}) {
  const { apptSort, apptDir, eoSort, eoDir } = await searchParams;
  const apptState = parseSortParams(apptSort, apptDir, ["carrier", "expires", "status"]);
  const eoState = parseSortParams(eoSort, eoDir, ["carrier", "policy", "limitEach", "limitAggregate", "premium", "term", "status"]);
  const sortParams = { apptSort, apptDir, eoSort, eoDir };
  const [licenses, eoPolicies, expiringAppointments, users] = await Promise.all([
    prisma.license.findMany({
      orderBy: { expiresAt: "asc" },
      include: { user: { select: { id: true, name: true } }, ceCredits: { orderBy: { completedAt: "desc" } } },
    }),
    prisma.eoPolicy.findMany({ orderBy: { expirationDate: "asc" } }),
    prisma.carrier.findMany({
      where: { appointmentStatus: "APPOINTED", appointmentExpiresAt: { not: null } },
      orderBy: { appointmentExpiresAt: "asc" },
      select: { id: true, name: true, appointmentExpiresAt: true },
    }),
    prisma.user.findMany({ where: { active: true, role: { not: "CLIENT" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const alerts = [
    ...licenses
      .filter((l) => expirationSeverity(l.expiresAt) !== "OK")
      .map((l) => ({ key: `lic-${l.id}`, label: `${l.user.name} — ${l.state} ${humanize(l.licenseClass)} license ${l.licenseNumber}`, date: l.expiresAt })),
    ...expiringAppointments
      .filter((c) => c.appointmentExpiresAt && expirationSeverity(c.appointmentExpiresAt) !== "OK")
      .map((c) => ({ key: `app-${c.id}`, label: `${c.name} — carrier appointment`, date: c.appointmentExpiresAt! })),
    ...eoPolicies
      .filter((e) => expirationSeverity(e.expirationDate) !== "OK")
      .map((e) => ({ key: `eo-${e.id}`, label: `Agency E&O ${e.policyNumber} (${e.carrierName})`, date: e.expirationDate })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const sortedAppointments = applySort(
    expiringAppointments,
    {
      carrier: (c) => c.name,
      expires: (c) => c.appointmentExpiresAt,
      // Severity is derived from the expiration date, so the date IS the
      // business priority order for the status column.
      status: (c) => c.appointmentExpiresAt,
    },
    apptState,
  );
  const apptTableSort = { ...apptState, basePath: "/compliance", params: sortParams, sortParam: "apptSort", dirParam: "apptDir" };

  const sortedEo = applySort(
    eoPolicies,
    {
      carrier: (e) => e.carrierName,
      policy: (e) => e.policyNumber,
      limitEach: (e) => toNum(e.limitEach),
      limitAggregate: (e) => toNum(e.limitAggregate),
      premium: (e) => toNum(e.premium),
      term: (e) => e.effectiveDate,
      status: (e) => e.expirationDate,
    },
    eoState,
  );
  const eoTableSort = { ...eoState, basePath: "/compliance", params: sortParams, sortParam: "eoSort", dirParam: "eoDir" };

  return (
    <>
      <PageHeader
        title="Compliance"
        description={`Producer licensing, CE credits, agency E&O, and carrier appointments — alerts within ${ALERT_WINDOW_DAYS} days.`}
        actions={
          <Link href="/compliance/surplus-lines" className="btn">
            Surplus-lines worklist
          </Link>
        }
      />

      {alerts.length > 0 ? (
        <div className="card mb-6 border-amber-200 bg-amber-50/60 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" /> Action needed — expiring within {ALERT_WINDOW_DAYS} days
          </div>
          <ul className="space-y-1">
            {alerts.map((a) => (
              <li key={a.key} className="flex items-center justify-between gap-2 text-sm text-amber-900">
                <span>{a.label}</span>
                {sevBadge(a.date)}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="card mb-6 flex items-center gap-2 border-emerald-200 bg-emerald-50/60 p-4 text-sm font-medium text-emerald-800">
          <ShieldCheck className="h-4 w-4" /> No compliance items expiring within {ALERT_WINDOW_DAYS} days.
        </div>
      )}

      {/* ── Producer licenses ─────────────────────────────────────── */}
      <h2 className="section-title mb-3">Producer licenses</h2>
      <div className="space-y-4">
        {licenses.length === 0 ? (
          <div className="card-pad text-sm text-slate-400">No licenses recorded.</div>
        ) : (
          licenses.map((l) => {
            const earned = l.ceCredits.reduce((acc, c) => acc + toNum(c.hours), 0);
            const progress = ceProgress(earned, l.ceRequiredHours);
            return (
              <div key={l.id} className="card-pad">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {l.user.name} — {l.state} · {humanize(l.licenseClass)}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      License {l.licenseNumber}
                      {l.npn ? ` · NPN ${l.npn}` : ""} · issued {fmtDate(l.issuedAt)} · expires {fmtDate(l.expiresAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {sevBadge(l.expiresAt)}
                    <form action={deleteLicense.bind(null, l.id)}>
                      <ConfirmButton message={`Remove ${l.user.name}'s ${l.state} license and its CE credits?`}>
                        Remove
                      </ConfirmButton>
                    </form>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-1 font-semibold">
                        <GraduationCap className="h-3.5 w-3.5" /> CE progress
                      </span>
                      <span>
                        {progress.earned} / {progress.required} hrs
                        {progress.complete ? " — complete" : ` (${progress.remaining} remaining)`}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${progress.complete ? "bg-emerald-500" : "bg-navy-500"}`}
                        style={{ width: `${progress.pct}%` }}
                      />
                    </div>
                    {l.ceCredits.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-xs text-slate-600">
                        {l.ceCredits.map((c) => (
                          <li key={c.id} className="flex items-center justify-between gap-2">
                            <span>
                              {c.courseName}
                              {c.provider ? ` (${c.provider})` : ""}
                              {c.isEthics ? <Badge tone="violet">Ethics</Badge> : null}
                            </span>
                            <span className="shrink-0 text-slate-400">
                              {toNum(c.hours)} hrs · {fmtDate(c.completedAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <form action={addCeCredit.bind(null, l.id)} className="space-y-2 rounded-lg border border-slate-200 p-3">
                      <div className="text-xs font-semibold text-slate-600">Record CE credit</div>
                      <input name="courseName" required placeholder="Course name" className="input" />
                      <div className="flex gap-2">
                        <input name="hours" type="number" step="0.5" min="0.5" required placeholder="Hours" className="input" />
                        <input name="completedAt" type="date" className="input" />
                      </div>
                      <input name="provider" placeholder="Provider" className="input" />
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input type="checkbox" name="isEthics" /> Ethics course
                      </label>
                      <button type="submit" className="btn btn-sm">Add credit</button>
                    </form>
                    <form action={renewLicense.bind(null, l.id)} className="space-y-2 rounded-lg border border-slate-200 p-3">
                      <div className="text-xs font-semibold text-slate-600">Renew license</div>
                      <input name="expiresAt" type="date" required className="input" />
                      <button type="submit" className="btn btn-sm">Set new expiration</button>
                    </form>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="card-pad mt-4 max-w-3xl">
        <h3 className="section-title mb-3">
          <Plus className="mr-1 inline h-4 w-4" /> Add license
        </h3>
        <form action={addLicense} className="space-y-4">
          <FormGrid cols={3}>
            <Field label="Producer" required>
              <Select name="userId" options={users.map((u) => ({ value: u.id, label: u.name }))} />
            </Field>
            <Field label="State" required>
              <input name="state" maxLength={2} required className="input" placeholder="SC" />
            </Field>
            <Field label="License #" required>
              <input name="licenseNumber" required className="input" />
            </Field>
            <Field label="NPN">
              <input name="npn" className="input" />
            </Field>
            <Field label="Class">
              <Select
                name="licenseClass"
                options={["PROPERTY_CASUALTY", "LIFE_HEALTH", "PERSONAL_LINES", "SURPLUS_LINES", "ADJUSTER"].map((c) => ({
                  value: c,
                  label: humanize(c),
                }))}
              />
            </Field>
            <Field label="CE hours required">
              <input name="ceRequiredHours" type="number" defaultValue={24} className="input" />
            </Field>
            <Field label="Issued">
              <input name="issuedAt" type="date" className="input" />
            </Field>
            <Field label="Expires" required>
              <input name="expiresAt" type="date" required className="input" />
            </Field>
          </FormGrid>
          <button type="submit" className="btn-primary">Add license</button>
        </form>
      </div>

      {/* ── Carrier appointments ──────────────────────────────────── */}
      <h2 className="section-title mb-3 mt-8">Carrier appointment expirations</h2>
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <ThSort k="carrier" label="Carrier" sort={apptTableSort} />
              <ThSort k="expires" label="Appointment expires" sort={apptTableSort} />
              <ThSort k="status" label="Status" sort={apptTableSort} />
            </tr>
          </thead>
          <tbody>
            {sortedAppointments.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-sm text-slate-400">
                  No appointed carriers with expiration dates on file.
                </td>
              </tr>
            ) : (
              sortedAppointments.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/carriers/${c.id}`} className="font-medium text-navy-700 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td>{fmtDate(c.appointmentExpiresAt)}</td>
                  <td>{sevBadge(c.appointmentExpiresAt!)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">Appointment dates are managed on each carrier&apos;s page.</p>

      {/* ── Agency E&O ────────────────────────────────────────────── */}
      <h2 className="section-title mb-3 mt-8">Agency E&amp;O coverage</h2>
      <div className="card mb-4 overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <ThSort k="carrier" label="Carrier" sort={eoTableSort} />
              <ThSort k="policy" label="Policy #" sort={eoTableSort} />
              <ThSort k="limitEach" label="Limit (each)" sort={eoTableSort} className="text-right" />
              <ThSort k="limitAggregate" label="Limit (aggregate)" sort={eoTableSort} className="text-right" />
              <ThSort k="premium" label="Premium" sort={eoTableSort} className="text-right" />
              <ThSort k="term" label="Term" sort={eoTableSort} />
              <ThSort k="status" label="Status" sort={eoTableSort} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedEo.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sm text-slate-400">
                  No E&amp;O policy on file — every agency needs one.
                </td>
              </tr>
            ) : (
              sortedEo.map((e) => (
                <tr key={e.id}>
                  <td>{e.carrierName}</td>
                  <td>{e.policyNumber}</td>
                  <td className="text-right">{fmtMoney(e.limitEach)}</td>
                  <td className="text-right">{fmtMoney(e.limitAggregate)}</td>
                  <td className="text-right">{fmtMoney(e.premium)}</td>
                  <td>
                    {fmtDate(e.effectiveDate)} – {fmtDate(e.expirationDate)}
                  </td>
                  <td>{sevBadge(e.expirationDate)}</td>
                  <td className="text-right">
                    <form action={deleteEoPolicy.bind(null, e.id)}>
                      <ConfirmButton message={`Remove E&O policy ${e.policyNumber}?`}>Remove</ConfirmButton>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="card-pad max-w-3xl">
        <h3 className="section-title mb-3">
          <Plus className="mr-1 inline h-4 w-4" /> Add E&amp;O policy
        </h3>
        <form action={addEoPolicy} className="space-y-4">
          <FormGrid cols={3}>
            <Field label="Carrier" required>
              <input name="carrierName" required className="input" />
            </Field>
            <Field label="Policy #" required>
              <input name="policyNumber" required className="input" />
            </Field>
            <Field label="Premium ($)" required>
              <input name="premium" type="number" step="0.01" required className="input" />
            </Field>
            <Field label="Limit each ($)" required>
              <input name="limitEach" type="number" step="1000" required className="input" />
            </Field>
            <Field label="Limit aggregate ($)" required>
              <input name="limitAggregate" type="number" step="1000" required className="input" />
            </Field>
            <Field label="Effective" required>
              <input name="effectiveDate" type="date" required className="input" />
            </Field>
            <Field label="Expires" required>
              <input name="expirationDate" type="date" required className="input" />
            </Field>
          </FormGrid>
          <button type="submit" className="btn-primary">Add E&amp;O policy</button>
        </form>
      </div>
    </>
  );
}
