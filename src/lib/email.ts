/**
 * Transactional email transport — Resend, with a log-only fallback.
 *
 *   EMAIL_TRANSPORT=resend  (RESEND_API_KEY, EMAIL_FROM)
 *   anything else / unset   → log only, no actual send
 *
 * Sender is no-reply@ins.jahdev.com (EMAIL_FROM). The ins.jahdev.com
 * domain is NOT yet verified in Resend, so the transport stays "log"
 * until it is. NEVER use braetr.com as the sender for this app.
 *
 * sendEmail() never throws — failures log a warn + return ok=false.
 */

import { log } from "@/lib/log";

export type EmailMessage = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
};

export async function sendEmail(
  msg: EmailMessage,
): Promise<{ ok: boolean; transport: string; id?: string; error?: string }> {
  const transport = (process.env.EMAIL_TRANSPORT ?? "log").toLowerCase();
  const from = process.env.EMAIL_FROM ?? "no-reply@ins.jahdev.com";
  try {
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

async function sendViaResend(msg: EmailMessage, from: string) {
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
