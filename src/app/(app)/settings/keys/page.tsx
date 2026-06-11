import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { fmtDate } from "@/lib/domain/dates";
import { createLeadIntakeKey, deleteLeadIntakeKey, toggleLeadIntakeKey } from "../actions";

export const metadata = { title: "Lead intake keys" };
export const dynamic = "force-dynamic";

function maskKey(key: string): string {
  if (key.length <= 12) return `${key.slice(0, 4)}…`;
  return `${key.slice(0, 10)}…${key.slice(-4)}`;
}

export default async function LeadIntakeKeysPage() {
  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";
  const keys = await prisma.leadIntakeKey.findMany({ orderBy: { createdAt: "desc" } });
  const envKeySet = Boolean(process.env.LEAD_INTAKE_KEY);

  return (
    <>
      <PageHeader
        title="Lead intake keys"
        description="POST /api/public/leads requires header X-Lead-Key matching the env key or an active key below."
        actions={<Link href="/settings" className="btn">← Settings</Link>}
      />

      <div className="card mb-6 overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Label</th>
              <th>Key</th>
              <th>Status</th>
              <th>Last used</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-slate-50/60">
              <td className="font-medium">Environment key (LEAD_INTAKE_KEY)</td>
              <td className="font-mono text-xs">{envKeySet ? "set in .env" : "not set"}</td>
              <td><Badge tone={envKeySet ? "green" : "slate"}>{envKeySet ? "Active" : "Unset"}</Badge></td>
              <td>—</td>
              <td>—</td>
              <td></td>
            </tr>
            {keys.map((k) => (
              <tr key={k.id}>
                <td className="font-medium">{k.label}</td>
                <td className="font-mono text-xs">{maskKey(k.key)}</td>
                <td><Badge tone={k.active ? "green" : "red"}>{k.active ? "Active" : "Disabled"}</Badge></td>
                <td>{k.lastUsedAt ? fmtDate(k.lastUsedAt) : "never"}</td>
                <td>{fmtDate(k.createdAt)}</td>
                <td className="text-right">
                  {isAdmin ? (
                    <span className="flex justify-end gap-2">
                      <form action={toggleLeadIntakeKey.bind(null, k.id)}>
                        <button type="submit" className="btn btn-sm">{k.active ? "Disable" : "Enable"}</button>
                      </form>
                      <form action={deleteLeadIntakeKey.bind(null, k.id)}>
                        <ConfirmButton message={`Delete key "${k.label}"? Any site still using it will stop submitting leads.`}>
                          Delete
                        </ConfirmButton>
                      </form>
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin ? (
        <div className="card-pad max-w-xl">
          <h2 className="section-title mb-3">Create key</h2>
          <p className="mb-3 text-xs text-slate-500">
            The full key is shown ONCE in the confirmation toast — copy it into the marketing site immediately.
          </p>
          <form action={createLeadIntakeKey} className="flex items-end gap-2">
            <Field label="Label" required>
              <input name="label" required placeholder="ins-website-sandy.vercel.app" className="input w-72" />
            </Field>
            <button type="submit" className="btn-primary">Generate</button>
          </form>
        </div>
      ) : (
        <p className="text-xs text-slate-400">Managing keys requires the ADMIN role.</p>
      )}
    </>
  );
}
