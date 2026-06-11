import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { fmtDate } from "@/lib/domain/dates";
import { deleteEmailTemplate, saveEmailTemplate } from "../actions";

export const metadata = { title: "Email templates" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";
  const { edit } = await searchParams;

  const templates = await prisma.emailTemplate.findMany({ orderBy: { key: "asc" } });
  const editing = edit ? templates.find((t) => t.key === edit) : undefined;

  return (
    <>
      <PageHeader
        title="Email templates"
        description="Reusable subjects and bodies. Placeholders like {{clientName}} are substituted at send time."
        actions={<Link href="/settings" className="btn">← Settings</Link>}
      />

      <div className="card mb-6 overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Key</th>
              <th>Name</th>
              <th>Subject</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-slate-400">No templates yet.</td>
              </tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/settings/templates?edit=${t.key}`} className="font-medium text-indigo-700 hover:underline">
                      {t.key}
                    </Link>
                  </td>
                  <td>{t.name}</td>
                  <td className="max-w-xs truncate">{t.subject}</td>
                  <td>{fmtDate(t.updatedAt)}</td>
                  <td className="text-right">
                    {isAdmin ? (
                      <form action={deleteEmailTemplate.bind(null, t.id)}>
                        <ConfirmButton message={`Delete template "${t.key}"?`}>Delete</ConfirmButton>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isAdmin ? (
        <div className="card-pad max-w-3xl">
          <h2 className="section-title mb-3">{editing ? `Edit "${editing.key}"` : "New / edit template"}</h2>
          <form action={saveEmailTemplate} className="space-y-4">
            <FormGrid>
              <Field label="Key" required hint="Stable identifier, e.g. renewal-notice">
                <input name="key" required defaultValue={editing?.key ?? ""} className="input" />
              </Field>
              <Field label="Name" required>
                <input name="name" required defaultValue={editing?.name ?? ""} className="input" />
              </Field>
            </FormGrid>
            <Field label="Subject" required>
              <input name="subject" required defaultValue={editing?.subject ?? ""} className="input" />
            </Field>
            <Field label="Body" required hint="Plain text; {{placeholders}} allowed">
              <textarea name="body" rows={8} required defaultValue={editing?.body ?? ""} className="input font-mono text-xs" />
            </Field>
            <button type="submit" className="btn-primary">Save template</button>
          </form>
        </div>
      ) : (
        <p className="text-xs text-slate-400">Editing templates requires the ADMIN role.</p>
      )}
    </>
  );
}
