import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import {
  TOUCHPOINT_CATEGORY_LABELS,
  TOUCHPOINT_TRIGGER_LABELS,
  touchpointCategoryTone,
} from "@/lib/labels";
import { saveTouchpointTemplate, toggleTouchpointTemplate } from "../actions";

export const metadata = { title: "Touchpoint journeys" };
export const dynamic = "force-dynamic";

export default async function TouchpointTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";
  const { edit } = await searchParams;

  const templates = await prisma.touchpointTemplate.findMany({ orderBy: [{ category: "asc" }, { key: "asc" }] });
  const editing = edit ? templates.find((t) => t.key === edit) : undefined;

  const cats = Object.entries(TOUCHPOINT_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
  const trigs = Object.entries(TOUCHPOINT_TRIGGER_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <>
      <PageHeader
        title="Touchpoint journeys"
        description="Every automated email a client can receive. Merge fields like {{firstName}} resolve at send time. These are client-specific lifecycle messages (birthday, reminders, renewals, claims) — they send WITHOUT an unsubscribe footer so they read like a genuine note. Only promotional marketing email carries an unsubscribe."
        actions={<Link href="/touchpoints" className="btn">← Touchpoints</Link>}
      />

      <div className="card mb-6 overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Key</th><th>Name</th><th>Category</th><th>Trigger</th><th>Offset</th><th>Footer</th><th>Approval</th><th>Active</th><th></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link href={`/touchpoints/templates?edit=${t.key}`} className="font-medium text-navy-700 hover:underline">{t.key}</Link>
                </td>
                <td>{t.name}</td>
                <td><Badge tone={touchpointCategoryTone(t.category)}>{TOUCHPOINT_CATEGORY_LABELS[t.category]}</Badge></td>
                <td className="text-xs">{TOUCHPOINT_TRIGGER_LABELS[t.triggerType]}</td>
                <td className="tabular-nums">{t.offsetDays !== 0 ? `${t.offsetDays > 0 ? "+" : ""}${t.offsetDays}d` : t.tenureMonths ? `${t.tenureMonths}mo` : "—"}</td>
                <td><Badge tone="green">Personal · no unsubscribe</Badge></td>
                <td>{t.requiresApproval ? <Badge tone="amber">Required</Badge> : <Badge tone="green">Auto</Badge>}</td>
                <td>{t.active ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Off</Badge>}</td>
                <td className="text-right">
                  {isAdmin ? (
                    <form action={toggleTouchpointTemplate.bind(null, t.id)}>
                      <button type="submit" className="btn btn-sm">{t.active ? "Disable" : "Enable"}</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
            {templates.length === 0 ? (
              <tr><td colSpan={9} className="py-8 text-center text-sm text-slate-400">No journeys yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {isAdmin ? (
        <div className="card-pad max-w-3xl">
          <h2 className="section-title mb-3">{editing ? `Edit "${editing.key}"` : "New / edit journey"}</h2>
          <form action={saveTouchpointTemplate} className="space-y-4">
            <FormGrid>
              <Field label="Key" required hint="Stable id, e.g. birthday">
                <input name="key" required defaultValue={editing?.key ?? ""} className="input" />
              </Field>
              <Field label="Name" required>
                <input name="name" required defaultValue={editing?.name ?? ""} className="input" />
              </Field>
              <Field label="Category" required>
                <Select name="category" defaultValue={editing?.category ?? "APPRECIATION"} options={cats} />
              </Field>
              <Field label="Trigger" required>
                <Select name="triggerType" defaultValue={editing?.triggerType ?? "MANUAL"} options={trigs} />
              </Field>
              <Field label="Offset days" hint="Signed; -90 = 90 days before the anchor">
                <input name="offsetDays" type="number" defaultValue={editing?.offsetDays ?? 0} className="input" />
              </Field>
              <Field label="Holiday key" hint="thanksgiving / newyear (HOLIDAY trigger)">
                <input name="holidayKey" defaultValue={editing?.holidayKey ?? ""} className="input" />
              </Field>
              <Field label="Tenure months" hint="TENURE_MILESTONE trigger, e.g. 36">
                <input name="tenureMonths" type="number" defaultValue={editing?.tenureMonths ?? ""} className="input" />
              </Field>
            </FormGrid>
            <Field label="Subject" required>
              <input name="subject" required defaultValue={editing?.subject ?? ""} className="input" />
            </Field>
            <Field label="Body" required hint="{{merge}} fields allowed; footer auto-appended">
              <textarea name="body" rows={8} required defaultValue={editing?.body ?? ""} className="input font-mono text-xs" />
            </Field>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} /> Active
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="requiresApproval" defaultChecked={editing?.requiresApproval ?? false} /> Requires staff approval
              </label>
            </div>
            <button type="submit" className="btn-primary">Save journey</button>
          </form>
        </div>
      ) : (
        <p className="text-xs text-slate-400">Editing journeys requires the ADMIN role.</p>
      )}
    </>
  );
}
