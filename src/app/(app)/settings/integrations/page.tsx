import Link from "next/link";
import { CheckCircle2, Plug, RefreshCw, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/form";
import { fmtDate } from "@/lib/domain/dates";
import { isXeroConfigured, xeroRedirectUri } from "@/lib/integrations/xero/auth";
import { getWorkspaceSummary } from "@/lib/workspace/client";
import { runXeroSync } from "../../accounting/actions";
import { disconnectXero, saveWorkspaceSettings } from "../actions";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

function StatusDot({ ok }: { ok: boolean }) {
  return ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-slate-300" />;
}

export default async function IntegrationsPage() {
  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";

  const [xeroConn, workspace, syncJobs] = await Promise.all([
    prisma.integrationConnection.findFirst({ where: { provider: "XERO" }, orderBy: { createdAt: "desc" } }),
    getWorkspaceSummary(),
    prisma.syncJob.findMany({ orderBy: { startedAt: "desc" }, take: 15 }),
  ]);

  const xeroConfigured = isXeroConfigured();
  const xeroConnected = !!xeroConn && xeroConn.status !== "DISCONNECTED";
  const resendConfigured = (process.env.EMAIL_TRANSPORT ?? "log").toLowerCase() === "resend" && !!process.env.RESEND_API_KEY;
  const saKeyPath = process.env.GOOGLE_WORKSPACE_SA_KEY_FILE ?? "C:/Users/bot/secrets/ins-workspace-sa.json";

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connection status for Xero, Google Workspace, and Resend."
        actions={<Link href="/settings" className="btn">← Settings</Link>}
      />

      <div className="space-y-6">
        {/* ── Xero ────────────────────────────────────────────────── */}
        <div className="card-pad">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="section-title flex items-center gap-2">
              <Plug className="h-4 w-4 text-navy-500" /> Xero (accounting)
            </h2>
            <span className="flex items-center gap-2">
              <StatusDot ok={xeroConnected && xeroConn?.status === "CONNECTED"} />
              <Badge
                tone={
                  !xeroConfigured ? "slate" : xeroConn?.status === "CONNECTED" ? "green" : xeroConn?.status === "TOKEN_EXPIRED" || xeroConn?.status === "ERROR" ? "red" : "slate"
                }
              >
                {!xeroConfigured ? "Not configured" : xeroConnected ? xeroConn!.status : "Not connected"}
              </Badge>
            </span>
          </div>

          {!xeroConfigured ? (
            <div className="text-sm text-slate-600">
              <p className="mb-2">To enable Xero invoice sync and online "Pay now" links:</p>
              <ol className="list-decimal space-y-1 pl-5 text-xs">
                <li>Create an app at developer.xero.com → My Apps (OAuth 2.0, web app).</li>
                <li>
                  Register redirect URI <code className="rounded bg-slate-100 px-1">{xeroRedirectUri()}</code>
                </li>
                <li>Put XERO_CLIENT_ID / XERO_CLIENT_SECRET into .env and restart the app.</li>
                <li>Return here and click Connect.</li>
              </ol>
              <p className="mt-2 text-xs text-slate-400">
                Payments policy: invoices surface Xero "Pay now" links only — never direct card charges.
              </p>
            </div>
          ) : (
            <div className="text-sm text-slate-600">
              {xeroConnected ? (
                <>
                  <p>
                    Organisation: <span className="font-medium">{xeroConn!.organisation ?? "(resolving…)"}</span>
                    {" · "}last sync {xeroConn!.lastSyncedAt ? fmtDate(xeroConn!.lastSyncedAt) : "never"}
                    {xeroConn!.lastSyncNote ? <span className="text-xs text-slate-400"> — {xeroConn!.lastSyncNote}</span> : null}
                  </p>
                  {isAdmin ? (
                    <div className="mt-3 flex gap-2">
                      <form action={runXeroSync}>
                        <button type="submit" className="btn btn-sm">
                          <RefreshCw className="h-3.5 w-3.5" /> Sync now
                        </button>
                      </form>
                      <form action={disconnectXero}>
                        <button type="submit" className="btn btn-sm">Disconnect</button>
                      </form>
                      <a href="/api/integrations/xero/connect" className="btn btn-sm">Reconnect</a>
                    </div>
                  ) : null}
                </>
              ) : isAdmin ? (
                <a href="/api/integrations/xero/connect" className="btn-primary inline-flex">
                  Connect Xero
                </a>
              ) : (
                <p className="text-xs text-slate-400">An admin can connect Xero here.</p>
              )}
            </div>
          )}
        </div>

        {/* ── Google Workspace ────────────────────────────────────── */}
        <div className="card-pad">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="section-title flex items-center gap-2">
              <Plug className="h-4 w-4 text-navy-500" /> Google Workspace (Gmail + Calendar)
            </h2>
            <span className="flex items-center gap-2">
              <StatusDot ok={workspace.saConfigured && workspace.enabled} />
              <Badge tone={workspace.saConfigured ? (workspace.enabled ? "green" : "amber") : "slate"}>
                {!workspace.saConfigured ? "SA key missing" : workspace.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </span>
          </div>

          {!workspace.saConfigured ? (
            <div className="text-sm text-slate-600">
              <p className="mb-2">
                Service-account key not found at <code className="rounded bg-slate-100 px-1">{saKeyPath}</code>. The app
                runs fine without it — Gmail/Calendar features stay off. To enable:
              </p>
              <ol className="list-decimal space-y-1 pl-5 text-xs">
                <li>Create a GCP service account; enable the Gmail and Calendar APIs on its project.</li>
                <li>Create a JSON key and save it to the path above (or set GOOGLE_WORKSPACE_SA_KEY_FILE).</li>
                <li>
                  In Workspace Admin → Security → API controls → Domain-wide delegation, authorize the SA client ID with
                  scopes <code className="rounded bg-slate-100 px-1">gmail.send</code> and{" "}
                  <code className="rounded bg-slate-100 px-1">calendar</code>.
                </li>
                <li>Enter the user to impersonate below and enable.</li>
              </ol>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              SA key loaded. Subject: <span className="font-medium">{workspace.subject ?? "(not set)"}</span>
              {workspace.domain ? ` · domain ${workspace.domain}` : ""}
            </p>
          )}

          {isAdmin ? (
            <form action={saveWorkspaceSettings} className="mt-3 flex flex-wrap items-end gap-3">
              <Field label="Impersonation subject" hint="The Workspace user to send/book as">
                <input name="subject" type="email" defaultValue={workspace.subject ?? ""} className="input w-72" />
              </Field>
              <label className="mb-2 flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="enabled" defaultChecked={workspace.enabled} /> Enabled
              </label>
              <button type="submit" className="btn btn-sm">Save</button>
            </form>
          ) : null}
        </div>

        {/* ── Resend ──────────────────────────────────────────────── */}
        <div className="card-pad">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="section-title flex items-center gap-2">
              <Plug className="h-4 w-4 text-navy-500" /> Resend (transactional email)
            </h2>
            <span className="flex items-center gap-2">
              <StatusDot ok={resendConfigured} />
              <Badge tone={resendConfigured ? "green" : "amber"}>{resendConfigured ? "Active" : "Log-only fallback"}</Badge>
            </span>
          </div>
          <p className="text-sm text-slate-600">
            Sender: <code className="rounded bg-slate-100 px-1">{process.env.EMAIL_FROM ?? "no-reply@ins.jahdev.com"}</code>.{" "}
            {resendConfigured
              ? "Emails are sent via Resend."
              : "Emails are currently logged, not sent. To activate: verify the ins.jahdev.com domain in Resend, then set EMAIL_TRANSPORT=resend and RESEND_API_KEY in .env. Never send from braetr.com for this app."}
          </p>
        </div>

        {/* ── Sync history ────────────────────────────────────────── */}
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Sync job</th>
                <th>Status</th>
                <th>Started</th>
                <th className="text-right">Read</th>
                <th className="text-right">Written</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {syncJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-400">No sync jobs yet.</td>
                </tr>
              ) : (
                syncJobs.map((j) => (
                  <tr key={j.id}>
                    <td className="font-medium">{j.kind}</td>
                    <td>
                      <Badge tone={j.status === "OK" ? "green" : j.status === "RUNNING" ? "blue" : j.status === "PARTIAL" ? "amber" : "red"}>
                        {j.status}
                      </Badge>
                    </td>
                    <td>{fmtDate(j.startedAt)}</td>
                    <td className="text-right">{j.recordsRead}</td>
                    <td className="text-right">{j.recordsWritten}</td>
                    <td className="max-w-xs truncate text-xs text-red-600">{j.error ?? ""}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
