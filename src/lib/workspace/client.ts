/**
 * Google Workspace client — service-account domain-wide delegation,
 * ported from gcon and trimmed to the two capabilities this app uses:
 *   - Gmail: SEND mail as the impersonated subject
 *   - Calendar: create events for tasks / renewal X-dates
 *
 * One instance impersonates ONE subject. Tokens are minted per-scope
 * via the hand-rolled RS256 JWT path (google-jwt.ts) — no googleapis
 * dependency. Degrades gracefully: resolveWorkspace() returns an
 * explained failure when the SA key file or subject is missing.
 */

import { prisma } from "@/lib/prisma";
import { gapi, getServiceAccountToken, type ServiceAccountKey } from "./google-jwt";
import { getWorkspaceServiceAccountKey, isWorkspaceSaConfigured } from "./sa-key";
import { SCOPES } from "./scopes";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";

export class WorkspaceClient {
  private readonly key: ServiceAccountKey;
  private readonly subject: string;

  constructor(key: ServiceAccountKey, subject: string) {
    if (!key?.private_key || !key?.client_email) throw new Error("workspace: invalid service-account key");
    if (!subject?.trim()) throw new Error("workspace: an impersonation subject is required");
    this.key = key;
    this.subject = subject.trim().toLowerCase();
  }

  get impersonating(): string {
    return this.subject;
  }

  private token(scope: string): Promise<string> {
    return getServiceAccountToken(this.key, scope, this.subject);
  }

  /** Send an email via the Gmail API as the impersonated subject. */
  async sendMail(args: { to: string; subject: string; text?: string; html?: string }): Promise<{ id: string }> {
    const token = await this.token(SCOPES.gmail);
    const boundary = "ins-mail-boundary";
    const lines = [
      `To: ${args.to}`,
      `Subject: ${args.subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      args.text ?? "",
    ];
    if (args.html) {
      lines.push(`--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', "", args.html);
    }
    lines.push(`--${boundary}--`);
    const raw = Buffer.from(lines.join("\r\n"), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const res = await gapi<{ id: string }>(token, `${GMAIL_BASE}/me/messages/send`, {
      method: "POST",
      body: JSON.stringify({ raw }),
    });
    return { id: res.id };
  }

  /** Create a calendar event on the subject's primary calendar. */
  async createCalendarEvent(args: {
    title: string;
    description?: string;
    start: Date;
    end: Date;
    allDay?: boolean;
  }): Promise<{ id: string; htmlLink: string | null }> {
    const token = await this.token(SCOPES.calendar);
    const body = args.allDay
      ? {
          summary: args.title,
          description: args.description,
          start: { date: args.start.toISOString().slice(0, 10) },
          end: { date: args.end.toISOString().slice(0, 10) },
        }
      : {
          summary: args.title,
          description: args.description,
          start: { dateTime: args.start.toISOString() },
          end: { dateTime: args.end.toISOString() },
        };
    const res = await gapi<{ id: string; htmlLink?: string }>(
      token,
      `${CAL_BASE}/calendars/primary/events`,
      { method: "POST", body: JSON.stringify(body) },
    );
    return { id: res.id, htmlLink: res.htmlLink ?? null };
  }
}

export type WorkspaceResolution =
  | { ok: true; client: WorkspaceClient; reason: null }
  | { ok: false; client: null; reason: string };

/**
 * Resolve a usable WorkspaceClient, or an explained failure. Requires:
 * the WorkspaceConnection row enabled, a configured subject, and the SA
 * key present on disk / in env. Never throws.
 */
export async function resolveWorkspace(): Promise<WorkspaceResolution> {
  let conn = null;
  try {
    conn = await prisma.workspaceConnection.findUnique({ where: { id: "workspace" } });
  } catch {
    conn = null;
  }
  if (!conn || !conn.enabled) {
    return { ok: false, client: null, reason: "Google Workspace is not enabled. Enable it in Settings → Integrations." };
  }
  const subject = conn.subject ?? process.env.GOOGLE_WORKSPACE_SUBJECT;
  if (!subject) {
    return { ok: false, client: null, reason: "No impersonation subject configured (the Workspace user to act as)." };
  }
  const key = getWorkspaceServiceAccountKey();
  if (!key) {
    return {
      ok: false,
      client: null,
      reason:
        "Service-account key not found. Place the SA JSON at the path in GOOGLE_WORKSPACE_SA_KEY_FILE " +
        "(default C:/Users/bot/secrets/ins-workspace-sa.json).",
    };
  }
  try {
    return { ok: true, client: new WorkspaceClient(key, subject), reason: null };
  } catch (e) {
    return { ok: false, client: null, reason: e instanceof Error ? e.message : String(e) };
  }
}

export type WorkspaceSummary = {
  saConfigured: boolean;
  enabled: boolean;
  subject: string | null;
  domain: string | null;
};

/** Compact, non-secret summary for the Settings status surface. Never throws. */
export async function getWorkspaceSummary(): Promise<WorkspaceSummary> {
  const saConfigured = isWorkspaceSaConfigured();
  let conn = null;
  try {
    conn = await prisma.workspaceConnection.findUnique({ where: { id: "workspace" } });
  } catch {
    conn = null;
  }
  return {
    saConfigured,
    enabled: !!conn?.enabled,
    subject: conn?.subject ?? process.env.GOOGLE_WORKSPACE_SUBJECT ?? null,
    domain: conn?.domain ?? null,
  };
}
