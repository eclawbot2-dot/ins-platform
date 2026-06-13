import { crossSellWorklist } from "@/lib/reports/cross-sell";
import { csvResponse } from "@/lib/csv-response";
import { LOB_LABELS } from "@/lib/labels";
import { requireApiSession } from "@/lib/auth";

export async function GET() {
  const gate = await requireApiSession();
  if (gate instanceof Response) return gate;
  const rows = await crossSellWorklist();
  // One CSV row per (client, suggestion) so the worklist is actionable.
  const out = rows.flatMap((r) =>
    r.suggestions.map((s) => ({
      client: r.clientName,
      producer: r.producerName ?? "",
      currentLines: r.activeLobs.map((l) => LOB_LABELS[l]).join(" / "),
      suggestion: s.title,
      line: LOB_LABELS[s.lob],
      rationale: s.rationale,
      estPremium: s.estPremium,
      priority: s.priority,
    })),
  );
  return csvResponse("cross-sell.csv", out);
}
