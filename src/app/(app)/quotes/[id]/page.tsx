import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, DetailItem } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { LOB_LABELS, QUOTE_STATUS_LABELS } from "@/lib/labels";
import { fmtMoney, toNum } from "@/lib/money";
import { fmtDate, fmtDateInput } from "@/lib/domain/dates";
import { addQuote, bindQuote, markRequestLost, setQuoteStatus } from "../actions";

export const dynamic = "force-dynamic";

export default async function QuoteRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const qr = await prisma.quoteRequest.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      lead: { select: { id: true, firstName: true, lastName: true } },
      owner: { select: { id: true, name: true } },
      quotes: { include: { carrier: { select: { name: true } }, boundPolicy: { select: { id: true, policyNumber: true } } }, orderBy: { premium: "asc" } },
    },
  });
  if (!qr) notFound();

  const [carriers, producers] = await Promise.all([
    prisma.carrier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true, role: { in: ["ADMIN", "PRODUCER"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const lowest = qr.quotes.length > 0 ? Math.min(...qr.quotes.map((q) => toNum(q.premium))) : null;
  const subjectName = qr.client?.name ?? (qr.lead ? `${qr.lead.firstName} ${qr.lead.lastName}` : "—");

  return (
    <>
      <PageHeader
        title={`Quote request — ${subjectName}`}
        description={
          <>
            {LOB_LABELS[qr.lineOfBusiness]} · <Badge tone={qr.status === "BOUND" ? "green" : qr.status === "LOST" ? "red" : "blue"}>{qr.status}</Badge>
          </>
        }
        actions={
          <>
            {qr.quotes.length > 0 ? (
              <Link href={`/quotes/${qr.id}/proposal`} className="btn">
                <FileText className="h-4 w-4" /> Proposal
              </Link>
            ) : null}
            {qr.status !== "BOUND" && qr.status !== "LOST" ? (
              <form action={markRequestLost.bind(null, qr.id)}>
                <button type="submit" className="btn-danger">
                  Mark lost
                </button>
              </form>
            ) : null}
          </>
        }
      />

      <div className="card-pad mb-6">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <DetailItem label="For">
            {qr.client ? (
              <Link href={`/clients/${qr.client.id}`} className="text-indigo-700 hover:underline">
                {qr.client.name}
              </Link>
            ) : qr.lead ? (
              <Link href={`/leads/${qr.lead.id}`} className="text-indigo-700 hover:underline">
                {qr.lead.firstName} {qr.lead.lastName} (lead)
              </Link>
            ) : (
              "—"
            )}
          </DetailItem>
          <DetailItem label="Line">{LOB_LABELS[qr.lineOfBusiness]}</DetailItem>
          <DetailItem label="Target effective">{qr.effectiveDate ? fmtDate(qr.effectiveDate) : "—"}</DetailItem>
          <DetailItem label="Owner">{qr.owner.name}</DetailItem>
        </dl>
        {qr.notes ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{qr.notes}</p> : null}
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Carrier</th>
              <th className="text-right">Premium</th>
              <th>Status</th>
              <th>Valid until</th>
              <th>Coverage summary</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {qr.quotes.map((quote) => {
              const isLowest = lowest != null && toNum(quote.premium) === lowest;
              return (
                <tr key={quote.id} className={isLowest ? "bg-emerald-50/50" : ""}>
                  <td className="font-medium text-slate-800">
                    {quote.carrier.name} {isLowest ? <Badge tone="green">Lowest</Badge> : null}
                  </td>
                  <td className="text-right font-semibold">{fmtMoney(quote.premium)}</td>
                  <td>
                    <Badge tone={quote.status === "ACCEPTED" ? "green" : quote.status === "DECLINED" ? "red" : "blue"}>
                      {QUOTE_STATUS_LABELS[quote.status]}
                    </Badge>
                  </td>
                  <td>{quote.validUntil ? fmtDate(quote.validUntil) : "—"}</td>
                  <td className="max-w-xs truncate text-xs text-slate-500">{quote.coverageSummary ?? "—"}</td>
                  <td>
                    {quote.boundPolicy ? (
                      <Link href={`/policies/${quote.boundPolicy.id}`} className="text-indigo-700 hover:underline">
                        {quote.boundPolicy.policyNumber}
                      </Link>
                    ) : qr.status !== "BOUND" && qr.status !== "LOST" ? (
                      <div className="flex gap-1.5">
                        {quote.status !== "PRESENTED" ? (
                          <form action={setQuoteStatus.bind(null, qr.id, quote.id, "PRESENTED")}>
                            <button className="btn btn-sm" type="submit">
                              Present
                            </button>
                          </form>
                        ) : null}
                        <form action={setQuoteStatus.bind(null, qr.id, quote.id, "DECLINED")}>
                          <button className="btn btn-sm text-red-600" type="submit">
                            Decline
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {qr.quotes.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  No quotes yet — add carrier quotes below.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {qr.status !== "BOUND" && qr.status !== "LOST" ? (
          <div className="card-pad">
            <h2 className="section-title mb-3">
              <Plus className="mr-1 inline h-4 w-4" /> Add carrier quote
            </h2>
            <form action={addQuote.bind(null, qr.id)} className="space-y-4">
              <FormGrid>
                <Field label="Carrier" required>
                  <Select name="carrierId" options={carriers.map((c) => ({ value: c.id, label: c.name }))} />
                </Field>
                <Field label="Annual premium ($)" required>
                  <input name="premium" type="number" step="0.01" min="0" required className="input" />
                </Field>
                <Field label="Status">
                  <Select
                    name="status"
                    defaultValue="RECEIVED"
                    options={Object.entries(QUOTE_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                  />
                </Field>
                <Field label="Valid until">
                  <input type="date" name="validUntil" className="input" />
                </Field>
              </FormGrid>
              <Field label="Coverage summary">
                <textarea name="coverageSummary" rows={2} className="input" placeholder="Limits, deductibles, endorsements…" />
              </Field>
              <button type="submit" className="btn-primary">
                Add quote
              </button>
            </form>
          </div>
        ) : null}

        {qr.status !== "BOUND" && qr.status !== "LOST" && qr.quotes.some((q) => q.status !== "DECLINED") ? (
          <div className="card-pad">
            <h2 className="section-title mb-3">Bind a quote</h2>
            <p className="mb-3 text-xs text-slate-500">
              Binding creates the policy, marks this request bound, and (for a lead) converts it to a client.
            </p>
            <form action={bindFirst(qr.quotes.filter((q) => q.status !== "DECLINED"))} className="space-y-4">
              <Field label="Quote to bind" required>
                <Select
                  name="quoteId"
                  options={qr.quotes
                    .filter((q) => q.status !== "DECLINED")
                    .map((q) => ({ value: q.id, label: `${q.carrier.name} — ${fmtMoney(q.premium)}` }))}
                />
              </Field>
              <FormGrid>
                <Field label="Policy number" required>
                  <input name="policyNumber" required className="input" />
                </Field>
                <Field label="Effective date">
                  <input type="date" name="effectiveDate" defaultValue={fmtDateInput(qr.effectiveDate ?? new Date())} className="input" />
                </Field>
                <Field label="Billing type">
                  <Select
                    name="billingType"
                    defaultValue="DIRECT_BILL"
                    options={[
                      { value: "DIRECT_BILL", label: "Direct bill" },
                      { value: "AGENCY_BILL", label: "Agency bill" },
                    ]}
                  />
                </Field>
                <Field label="Commission rate (%)" hint="Blank = carrier schedule rate">
                  <input name="commissionRatePct" type="number" step="0.01" min="0" className="input" />
                </Field>
                <Field label="Producer">
                  <Select name="producerId" allowEmpty emptyLabel="Request owner" options={producers.map((u) => ({ value: u.id, label: u.name }))} />
                </Field>
              </FormGrid>
              <button type="submit" className="btn-primary">
                Bind quote → policy
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </>
  );
}

/**
 * The bind form selects which quote to bind via a <select>; this
 * wrapper reads the selected quoteId from the form data and dispatches
 * to the bindQuote server action.
 */
function bindFirst(quotes: Array<{ id: string }>) {
  return async function (formData: FormData) {
    "use server";
    const quoteId = String(formData.get("quoteId") ?? quotes[0]?.id ?? "");
    await bindQuote(quoteId, formData);
  };
}
