/**
 * Merge-field rendering for lifecycle touchpoints. Pure (no DB): given a
 * body string with {{...}} placeholders and a typed MergeContext, resolve
 * the placeholders, append the sender-identity + unsubscribe footer, and
 * (for email) wrap the result in the brand HTML shell.
 *
 * Missing fields are SAFE — an unresolved {{field}} renders as an empty
 * string, never the literal braces, so a half-populated context never
 * leaks "{{producerName}}" into a customer's inbox.
 */

import { BRAND } from "@/lib/brand";

export type MergeContext = {
  client: { name: string; preferredName?: string | null; firstName?: string | null; email?: string | null };
  policy?: { policyNumber?: string; lineOfBusiness?: string; carrierName?: string; expirationDate?: string; effectiveDate?: string } | null;
  invoice?: { invoiceNumber?: string; amount?: string; dueDate?: string } | null;
  claim?: { claimNumber?: string; status?: string; dateOfLoss?: string } | null;
  agency: { name: string; phone?: string | null; address?: string | null; email?: string | null };
  producerName?: string | null;
  csrName?: string | null;
  tenureYears?: string | null;
  holidayName?: string | null;
  portalUrl?: string | null;
  payNowUrl?: string | null;
  unsubscribeUrl: string;
};

/** Optional AI rewrite hook (dormant — see CLUSTER F). */
export type Personalizer = (ctx: MergeContext) => Promise<{ subject: string; body: string }>;

/** A warm salutation: preferred name → first name → full name. */
export function salutation(client: MergeContext["client"]): string {
  return (client.preferredName?.trim() || client.firstName?.trim() || client.name || "there").trim();
}

/** Flatten a MergeContext into the {{token}} → value table. */
export function mergeTable(ctx: MergeContext): Record<string, string> {
  const t: Record<string, string> = {
    clientName: ctx.client.name ?? "",
    firstName: salutation(ctx.client),
    preferredName: salutation(ctx.client),
    agencyName: ctx.agency.name ?? BRAND.name,
    agencyPhone: ctx.agency.phone ?? BRAND.phone,
    agencyEmail: ctx.agency.email ?? BRAND.email,
    agencyAddress: ctx.agency.address ?? "",
    producerName: ctx.producerName ?? ctx.agency.name ?? BRAND.name,
    csrName: ctx.csrName ?? "",
    tenureYears: ctx.tenureYears ?? "",
    holidayName: ctx.holidayName ?? "",
    portalUrl: ctx.portalUrl ?? "",
    payNowUrl: ctx.payNowUrl ?? "",
    unsubscribeUrl: ctx.unsubscribeUrl,
    policyNumber: ctx.policy?.policyNumber ?? "",
    lineOfBusiness: ctx.policy?.lineOfBusiness ?? "",
    carrierName: ctx.policy?.carrierName ?? "",
    expirationDate: ctx.policy?.expirationDate ?? "",
    effectiveDate: ctx.policy?.effectiveDate ?? "",
    invoiceNumber: ctx.invoice?.invoiceNumber ?? "",
    invoiceAmount: ctx.invoice?.amount ?? "",
    dueDate: ctx.invoice?.dueDate ?? "",
    claimNumber: ctx.claim?.claimNumber ?? "",
    claimStatus: ctx.claim?.status ?? "",
    dateOfLoss: ctx.claim?.dateOfLoss ?? "",
  };
  return t;
}

/** Resolve {{token}} placeholders. Unknown/empty tokens → "" (never literal braces). */
export function renderTemplate(body: string, ctx: MergeContext): string {
  const table = mergeTable(ctx);
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => table[key] ?? "");
}

/**
 * Plain-text sender-identity + one-click unsubscribe footer (CAN-SPAM).
 * `personal` emails (birthday / anniversary / holiday greetings — relationship
 * messages, not marketing) drop the unsubscribe/"you're receiving this" block so
 * they read like a genuine note from the agency. They keep a quiet contact line
 * (address + phone) as a signature.
 */
export function senderFooterText(ctx: MergeContext, personal = false): string {
  if (personal) {
    const parts = [ctx.agency.address, ctx.agency.phone].filter(Boolean);
    return parts.length ? `\n\n${parts.join("\n")}` : "";
  }
  const addr = ctx.agency.address ? `\n${ctx.agency.address}` : "";
  return (
    `\n\n—\n${ctx.agency.name}` +
    addr +
    (ctx.agency.phone ? `\n${ctx.agency.phone}` : "") +
    `\n\nYou're receiving this because you're a valued ${ctx.agency.name} client. ` +
    `To update your email preferences or unsubscribe, visit:\n${ctx.unsubscribeUrl}`
  );
}

/** HTML sender-identity + unsubscribe footer. `personal` drops the unsubscribe block. */
export function senderFooterHtml(ctx: MergeContext, personal = false): string {
  if (personal) {
    const parts = [ctx.agency.address, ctx.agency.phone].filter(Boolean).map((p) => escapeHtml(p as string));
    return parts.length
      ? `<p style="color:#94a3b8;font-size:12px;line-height:1.5;margin-top:16px">${parts.join("<br/>")}</p>`
      : "";
  }
  return (
    `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />` +
    `<p style="color:#64748b;font-size:12px;line-height:1.5">` +
    `<strong>${escapeHtml(ctx.agency.name)}</strong>` +
    (ctx.agency.address ? `<br/>${escapeHtml(ctx.agency.address)}` : "") +
    (ctx.agency.phone ? `<br/>${escapeHtml(ctx.agency.phone)}` : "") +
    `</p>` +
    `<p style="color:#94a3b8;font-size:12px;line-height:1.5">` +
    `You're receiving this because you're a valued ${escapeHtml(ctx.agency.name)} client. ` +
    `<a href="${ctx.unsubscribeUrl}" style="color:#64748b">Update email preferences or unsubscribe</a>.` +
    `</p>`
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Wrap a rendered (plain-text) body in the brand HTML shell + footer. */
export function wrapHtml(renderedBody: string, ctx: MergeContext, personal = false): string {
  const paragraphs = renderedBody
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return (
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;font-size:15px;line-height:1.6">` +
    `<div style="border-bottom:2px solid #0f3d61;padding-bottom:12px;margin-bottom:20px">` +
    `<span style="font-size:18px;font-weight:600;color:#0f3d61">${escapeHtml(ctx.agency.name)}</span>` +
    `</div>` +
    paragraphs +
    senderFooterHtml(ctx, personal) +
    `</div>`
  );
}

/** A fully-rendered email (subject + text + html) ready for sendEmail(). */
export type RenderedEmail = { subject: string; text: string; html: string };

/**
 * Render a template body+subject into a sendable email. When a
 * personalize hook is supplied (CLUSTER F, ANTHROPIC_API_KEY set), it may
 * rewrite the copy in the client's tone — but it NEVER blocks a send: any
 * failure falls back to the deterministic seeded copy.
 */
export async function renderEmail(
  subject: string,
  body: string,
  ctx: MergeContext,
  opts?: { personalize?: Personalizer; personal?: boolean },
): Promise<RenderedEmail> {
  const personal = opts?.personal ?? false;
  let renderedSubject = renderTemplate(subject, ctx);
  let renderedBody = renderTemplate(body, ctx);
  if (opts?.personalize) {
    try {
      const out = await opts.personalize(ctx);
      if (out?.subject) renderedSubject = renderTemplate(out.subject, ctx);
      if (out?.body) renderedBody = renderTemplate(out.body, ctx);
    } catch {
      /* AI rewrite is best-effort — keep the seeded copy. */
    }
  }
  return {
    subject: renderedSubject,
    text: renderedBody + senderFooterText(ctx, personal),
    html: wrapHtml(renderedBody, ctx, personal),
  };
}
