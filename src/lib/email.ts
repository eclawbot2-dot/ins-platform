/**
 * Transactional email transport — Gmail (Workspace SA), Resend, or log-only.
 *
 *   EMAIL_TRANSPORT=gmail   (GOOGLE_WORKSPACE_SA_KEY[_FILE], GMAIL_SENDER_SUBJECT, EMAIL_FROM)
 *   EMAIL_TRANSPORT=resend  (RESEND_API_KEY, EMAIL_FROM)
 *   anything else / unset   → log only, no actual send
 *
 * Gmail transport: sends via the Gmail API as a real taboragency.com
 * Workspace user, impersonated through the shared platform service
 * account's domain-wide delegation. The impersonated sender is
 * GMAIL_SENDER_SUBJECT (b@taboragency.com). Token scope is gmail.send
 * when the DWD grant includes it, otherwise it transparently retries
 * with gmail.modify (a superset that also permits users.messages.send).
 *
 * From header (lesson ported from psdmfg-mgmt): EMAIL_FROM is passed
 * through as-is — Gmail enforces send-as identity itself, so an alias
 * like no-reply@taboragency.com is honored only when registered as a
 * send-as on the impersonated mailbox, and anything else is rewritten
 * by Gmail to the authenticated user. When EMAIL_FROM has no parseable
 * address we fall back to the impersonated sender.
 *
 * Degradation: if the DWD grant is missing (token mint returns
 * unauthorized_client — e.g. the shared SA client ID is not yet
 * authorized in the Tabor tenant) or the Gmail API answers 403, the
 * transport logs the exact Admin-console fix and falls back to the
 * NEXT transport: Resend when RESEND_API_KEY is set (currently the
 * working path), else log-only. sendEmail() never throws — failures
 * log a warn + return ok=false so callers can handle.
 *
 * NEVER use braetr.com as the sender for this app.
 */

import { log } from "@/lib/log";
import { BRAND } from "@/lib/brand";
import { getServiceAccountToken, type ServiceAccountKey } from "@/lib/workspace/google-jwt";
import { getWorkspaceServiceAccountKey } from "@/lib/workspace/sa-key";

export type EmailMessage = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
};

export type SendResult = { ok: boolean; transport: string; id?: string; error?: string };

export type EmailTransport = "gmail" | "resend" | "log";

/** Pure, env-driven transport selection (exported for tests). */
export function chooseTransport(env: Record<string, string | undefined> = process.env): EmailTransport {
  const t = (env.EMAIL_TRANSPORT ?? "").trim().toLowerCase();
  if (t === "gmail" || t === "resend") return t;
  return "log";
}

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const transport = chooseTransport();
  const from = process.env.EMAIL_FROM ?? `no-reply@${BRAND.domain}`;
  try {
    if (transport === "gmail") return await sendViaGmail(msg, from);
    if (transport === "resend") return await sendViaResend(msg, from);
    log.info("email (log-only transport)", {
      module: "email",
      to: String(msg.to),
      subject: msg.subject,
    });
    return { ok: true, transport: "log" };
  } catch (err) {
    log.warn("email send failed", { module: "email", transport, to: String(msg.to) }, err);
    return { ok: false, transport, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendViaResend(msg: EmailMessage, from: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY missing");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from,
      to: arr(msg.to),
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      cc: msg.cc ? arr(msg.cc) : undefined,
      bcc: msg.bcc ? arr(msg.bcc) : undefined,
      reply_to: msg.replyTo,
    }),
  });
  if (!res.ok) throw new Error(`resend ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { id?: string };
  return { ok: true, transport: "resend", id: json.id };
}

function arr(v: string | string[]): string[] {
  return Array.isArray(v) ? v : [v];
}

// ---------------------------------------------------------------------------
// Gmail transport (Workspace service account + domain-wide delegation)
// ---------------------------------------------------------------------------

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
/** Broader scope some tenants grant for ingest; also permits messages.send. */
const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const DEFAULT_GMAIL_SENDER = "b@taboragency.com";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

/** Which scope the DWD grant actually accepted; memoized per process. */
let gmailWorkingScope: string | null = null;

/** Reset the memoized DWD scope (tests + after an Admin-console grant change). */
export function resetGmailTransportCache(): void {
  gmailWorkingScope = null;
}

/** The exact remediation step, surfaced in logs on DWD auth failures. */
export function dwdGrantFixMessage(key: Pick<ServiceAccountKey, "client_email" | "client_id">, sender: string): string {
  return (
    `Gmail send blocked: the domain-wide delegation grant for service account ` +
    `${key.client_email} (client ID ${key.client_id ?? "unknown"}) is not authorized in the ` +
    `${BRAND.domain} Workspace. Fix: admin.google.com (as a ${BRAND.domain} super admin) → ` +
    `Security → Access and data control → API controls → Domain-wide Delegation → ` +
    `Add new (or edit) client ID ${key.client_id ?? "<SA client_id>"} → scopes must include ` +
    `${GMAIL_SEND_SCOPE} → Authorize. Also verify GMAIL_SENDER_SUBJECT (${sender}) is a real, ` +
    `active mailbox in that Workspace.`
  );
}

/** Token-mint / API errors that mean "DWD or impersonation not authorized". */
export function isUnauthorizedClientError(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /unauthorized_client|invalid_scope|access_denied|invalid_grant|PERMISSION_DENIED/i.test(m);
}

/**
 * Mint a DWD token able to call users.messages.send as `subject`.
 * Prefers least-privilege gmail.send; falls back to the broader
 * gmail.modify when only that is granted. The working scope is memoized
 * so steady-state sends do exactly one (cached) token exchange.
 */
async function mintGmailSendToken(key: ServiceAccountKey, subject: string): Promise<string> {
  if (gmailWorkingScope) return getServiceAccountToken(key, gmailWorkingScope, subject);
  try {
    const token = await getServiceAccountToken(key, GMAIL_SEND_SCOPE, subject);
    gmailWorkingScope = GMAIL_SEND_SCOPE;
    return token;
  } catch (err) {
    if (!isUnauthorizedClientError(err)) throw err;
    const token = await getServiceAccountToken(key, GMAIL_MODIFY_SCOPE, subject);
    gmailWorkingScope = GMAIL_MODIFY_SCOPE;
    log.warn(
      "gmail transport: gmail.send not in the DWD grant; sending via the broader gmail.modify scope. " +
        "For least privilege, add gmail.send to the SA client ID in the Admin console " +
        "(Security → API controls → Domain-wide Delegation).",
      { module: "email", clientId: key.client_id ?? null },
    );
    return token;
  }
}

/**
 * Honest degradation when the Gmail path is blocked: log the actionable
 * error, then fall back to the NEXT transport — Resend when configured
 * (the currently-working path), else log-only.
 */
async function gmailFallback(msg: EmailMessage, from: string, error: string): Promise<SendResult> {
  log.error(error, { module: "email", transport: "gmail" });
  if (process.env.RESEND_API_KEY) {
    log.info("gmail transport unavailable — falling back to resend", {
      module: "email",
      to: String(msg.to),
      subject: msg.subject,
    });
    try {
      return await sendViaResend(msg, from);
    } catch (err) {
      log.warn("resend fallback after gmail failure also failed", { module: "email", to: String(msg.to) }, err);
      return { ok: false, transport: "resend", error: err instanceof Error ? err.message : String(err) };
    }
  }
  log.info("email (log-only fallback from gmail)", { module: "email", to: String(msg.to), subject: msg.subject });
  return { ok: false, transport: "gmail", error };
}

async function sendViaGmail(msg: EmailMessage, emailFrom: string): Promise<SendResult> {
  const key = getWorkspaceServiceAccountKey();
  if (!key) {
    return gmailFallback(
      msg,
      emailFrom,
      "gmail transport selected but no Workspace service-account key is configured " +
        "(set GOOGLE_WORKSPACE_SA_KEY_FILE or GOOGLE_WORKSPACE_SA_KEY).",
    );
  }
  const sender = (process.env.GMAIL_SENDER_SUBJECT ?? "").trim() || DEFAULT_GMAIL_SENDER;

  let token: string;
  try {
    token = await mintGmailSendToken(key, sender);
  } catch (err) {
    if (isUnauthorizedClientError(err)) return gmailFallback(msg, emailFrom, dwdGrantFixMessage(key, sender));
    throw err; // network/etc — outer catch logs + returns ok=false
  }

  const from = gmailFromHeader(emailFrom, sender);
  const mime = buildMimeMessage(msg, from);
  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ raw: base64Url(Buffer.from(mime, "utf8")) }),
  });
  if (res.status === 403) {
    const body = await res.text().catch(() => "");
    return gmailFallback(msg, emailFrom, `${dwdGrantFixMessage(key, sender)} (Gmail API 403: ${body.slice(0, 300)})`);
  }
  if (!res.ok) throw new Error(`gmail ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { id?: string };
  return { ok: true, transport: "gmail", id: json.id };
}

// ---------------------------------------------------------------------------
// From-header handling (pure — exported for tests)
// ---------------------------------------------------------------------------

/** Parse `"Name" <addr>` / `Name <addr>` / bare `addr` From values. */
export function parseFromHeader(raw: string): { name: string | null; address: string | null } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (m) return { name: m[1].trim() || null, address: m[2].trim().toLowerCase() };
  const trimmed = raw.trim();
  if (/^\S+@\S+$/.test(trimmed)) return { name: null, address: trimmed.toLowerCase() };
  return { name: trimmed || null, address: null };
}

/**
 * The From header the gmail transport actually uses. Gmail enforces
 * sender identity itself: an EMAIL_FROM address is honored only when it
 * is the impersonated user or one of their REGISTERED send-as aliases
 * (e.g. no-reply@taboragency.com on b@); anything else is rewritten to
 * the authenticated user by Gmail, so passing EMAIL_FROM through is
 * safe. Falls back to the impersonated sender when EMAIL_FROM has no
 * parseable address.
 */
export function gmailFromHeader(emailFrom: string | undefined, sender: string): string {
  const parsed = emailFrom ? parseFromHeader(emailFrom) : { name: null, address: null };
  const name = parsed.name || BRAND.name;
  return `${name} <${parsed.address || sender}>`;
}

// ---------------------------------------------------------------------------
// RFC 2822 MIME builder (exported for tests)
// ---------------------------------------------------------------------------

export function base64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** RFC 2047 B-encode a header value when it contains non-ASCII characters. */
function encodeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Base64-encode a body part, wrapped at 76 chars per RFC 2045. */
function encodeBodyBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
}

/**
 * Build an RFC 2822 message (CRLF line endings) from an EmailMessage.
 * Both text+html → multipart/alternative; single body → plain part.
 * Gmail strips the Bcc header on delivery but uses it for routing.
 */
export function buildMimeMessage(msg: EmailMessage, from: string): string {
  const headers: string[] = [
    `From: ${from}`,
    `To: ${arr(msg.to).join(", ")}`,
  ];
  if (msg.cc) headers.push(`Cc: ${arr(msg.cc).join(", ")}`);
  if (msg.bcc) headers.push(`Bcc: ${arr(msg.bcc).join(", ")}`);
  if (msg.replyTo) headers.push(`Reply-To: ${msg.replyTo}`);
  headers.push(`Subject: ${encodeHeaderValue(msg.subject)}`);
  headers.push(`Date: ${new Date().toUTCString()}`);
  headers.push("MIME-Version: 1.0");

  const text = msg.text ?? "";
  const html = msg.html;

  if (html && msg.text !== undefined) {
    const boundary = `ins-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    const parts = [
      `--${boundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      encodeBodyBase64(text),
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      encodeBodyBase64(html),
      `--${boundary}--`,
    ];
    return [...headers, "", ...parts].join("\r\n");
  }

  if (html) {
    headers.push(`Content-Type: text/html; charset="UTF-8"`);
    headers.push(`Content-Transfer-Encoding: base64`);
    return [...headers, "", encodeBodyBase64(html)].join("\r\n");
  }

  headers.push(`Content-Type: text/plain; charset="UTF-8"`);
  headers.push(`Content-Transfer-Encoding: base64`);
  return [...headers, "", encodeBodyBase64(text)].join("\r\n");
}
