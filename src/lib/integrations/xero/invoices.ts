/**
 * Xero invoice sync — both directions, adapted from gcon.
 *
 * PUSH: agency-bill invoices (DRAFT/SENT, not yet in Xero) become Xero
 * ACCREC invoices. Idempotency rides on InvoiceNumber (Xero enforces
 * ACCREC number uniqueness).
 *
 * PULL: ACCREC invoices since the checkpoint mirror status back:
 * PAID → PAID (paidAt from Xero's FullyPaidOnDate), VOIDED/DELETED →
 * VOID, plus the OnlineInvoiceUrl ("Pay now" link) is captured so the
 * UI can surface Xero online payment — Xero is the system of record,
 * never a direct Stripe charge.
 */

import { prisma } from "@/lib/prisma";
import { captureException, log } from "@/lib/log";
import { runSyncJob, getCursor, setCursor, type SyncJobResult } from "@/lib/integrations/sync-job";
import { ensureXeroTenant, getXeroAccessToken, isXeroConfigured, xeroHeaders } from "./auth";
import { xeroDate, xeroDateToIso, xeroGetAllPages } from "./paging";
import { mapXeroInvoiceStatus } from "./status";
import { toNum } from "@/lib/money";

export { mapXeroInvoiceStatus } from "./status";

const API = "https://api.xero.com/api.xro/2.0";

type XeroInvoice = {
  InvoiceID: string;
  InvoiceNumber?: string;
  Status?: string;
  AmountPaid?: number;
  Total?: number;
  FullyPaidOnDate?: string;
  UpdatedDateUTC?: string;
};

export async function pushInvoicesToXero(connectionId: string): Promise<SyncJobResult> {
  const out = await runSyncJob(connectionId, "xero.invoices.push", async () => {
    if (!isXeroConfigured()) return { recordsRead: 0, recordsWritten: 0 } as SyncJobResult;
    const tenantId = await ensureXeroTenant(connectionId);
    if (!tenantId) throw new Error("Xero tenant unavailable");
    const accessToken = await getXeroAccessToken(connectionId);

    const invoices = await prisma.invoice.findMany({
      where: { status: { in: ["DRAFT", "SENT"] }, xeroInvoiceId: null },
      include: { client: { select: { name: true } }, lines: true },
      take: 100,
    });

    let pushed = 0;
    let failed = 0;
    for (const inv of invoices) {
      const lineItems =
        inv.lines.length > 0
          ? inv.lines.map((l) => ({
              Description: l.description,
              Quantity: toNum(l.quantity),
              UnitAmount: toNum(l.unitAmount),
              LineAmount: toNum(l.amount),
            }))
          : [
              {
                Description: `Invoice ${inv.invoiceNumber}`,
                Quantity: 1,
                UnitAmount: toNum(inv.amount),
                LineAmount: toNum(inv.amount),
              },
            ];
      const payload = {
        Type: "ACCREC",
        Contact: { Name: inv.client.name },
        Date: inv.issueDate.toISOString().slice(0, 10),
        DueDate: inv.dueDate.toISOString().slice(0, 10),
        InvoiceNumber: inv.invoiceNumber,
        Reference: inv.policyId ? `Policy ${inv.policyId}` : inv.invoiceNumber,
        Status: inv.status === "DRAFT" ? "DRAFT" : "AUTHORISED",
        LineItems: lineItems,
      };
      try {
        const res = await fetch(`${API}/Invoices`, {
          method: "POST",
          headers: xeroHeaders(accessToken, tenantId),
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          // Duplicate InvoiceNumber = already pushed — skip, don't fail.
          if (res.status === 400 && /must be unique|already been used/i.test(body)) continue;
          throw new Error(`xero invoices POST ${res.status}`);
        }
        const json = (await res.json()) as { Invoices?: Array<{ InvoiceID?: string }> };
        const xeroId = json.Invoices?.[0]?.InvoiceID ?? null;
        if (xeroId) {
          await prisma.invoice.update({ where: { id: inv.id }, data: { xeroInvoiceId: xeroId } });
          // Fetch the online-payment ("Pay now") URL for the invoice.
          try {
            const onlineRes = await fetch(`${API}/Invoices/${xeroId}/OnlineInvoice`, {
              headers: xeroHeaders(accessToken, tenantId),
            });
            if (onlineRes.ok) {
              const online = (await onlineRes.json()) as {
                OnlineInvoices?: Array<{ OnlineInvoiceUrl?: string }>;
              };
              const url = online.OnlineInvoices?.[0]?.OnlineInvoiceUrl;
              if (url) await prisma.invoice.update({ where: { id: inv.id }, data: { xeroPaymentUrl: url } });
            }
          } catch (err) {
            log.warn("xero online-invoice url fetch failed", { module: "xero", invoiceId: inv.id }, err);
          }
        }
        pushed += 1;
      } catch (err) {
        failed += 1;
        captureException(err, { module: "integrations/xero/invoices", invoiceId: inv.id });
      }
    }

    return { recordsRead: invoices.length, recordsWritten: pushed, partial: failed > 0 } as SyncJobResult;
  });
  return out.result ?? { recordsRead: 0, recordsWritten: 0 };
}

export async function pullInvoicesFromXero(connectionId: string): Promise<SyncJobResult> {
  const out = await runSyncJob(connectionId, "xero.invoices.pull", async () => {
    if (!isXeroConfigured()) return { recordsRead: 0, recordsWritten: 0 } as SyncJobResult;
    const tenantId = await ensureXeroTenant(connectionId);
    if (!tenantId) throw new Error("Xero tenant unavailable");
    const accessToken = await getXeroAccessToken(connectionId);

    const since = await getCursor(connectionId, "xero.invoices.pull");
    let lastSeen = since;

    const url = new URL(`${API}/Invoices`);
    url.searchParams.set("where", 'Type=="ACCREC"');
    const headers = xeroHeaders(accessToken, tenantId);
    if (since) headers["If-Modified-Since"] = since;

    const paged = await xeroGetAllPages<XeroInvoice>({ url, headers, listKey: "Invoices" });
    if (paged.notModified) return { recordsRead: 0, recordsWritten: 0 } as SyncJobResult;

    let read = 0;
    let wrote = 0;
    for (const inv of paged.rows) {
      read += 1;
      try {
        const local = inv.InvoiceNumber
          ? await prisma.invoice.findUnique({
              where: { invoiceNumber: inv.InvoiceNumber },
              select: { id: true, status: true, paidAt: true, amount: true },
            })
          : null;
        if (local) {
          const mapped = mapXeroInvoiceStatus(inv, { status: local.status, paidAt: local.paidAt }, xeroDate(inv.FullyPaidOnDate));
          if (mapped && (mapped.status !== local.status || (mapped.paidAt?.getTime() ?? null) !== (local.paidAt?.getTime() ?? null))) {
            await prisma.invoice.update({
              where: { id: local.id },
              data: {
                status: mapped.status,
                paidAt: mapped.paidAt,
                paidAmount:
                  mapped.status === "PAID"
                    ? local.amount
                    : inv.AmountPaid != null
                      ? inv.AmountPaid
                      : undefined,
              },
            });
            wrote += 1;
          }
        }
      } catch (err) {
        captureException(err, { module: "integrations/xero/invoices", xeroInvoiceId: inv.InvoiceID });
      }
      const updatedIso = xeroDateToIso(inv.UpdatedDateUTC);
      if (updatedIso && (!lastSeen || lastSeen < updatedIso)) lastSeen = updatedIso;
    }

    if (lastSeen && lastSeen !== since) await setCursor(connectionId, "xero.invoices.pull", lastSeen);
    return { recordsRead: read, recordsWritten: wrote, partial: paged.truncated || undefined } as SyncJobResult;
  });
  return out.result ?? { recordsRead: 0, recordsWritten: 0 };
}

/** Run the full Xero sync (push then pull). */
export async function syncXero(connectionId: string): Promise<{ push: SyncJobResult; pull: SyncJobResult }> {
  const push = await pushInvoicesToXero(connectionId);
  const pull = await pullInvoicesFromXero(connectionId);
  return { push, pull };
}
