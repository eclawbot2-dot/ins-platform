import { atRiskWorklist } from "@/lib/reports/client-health";
import { HEALTH_TIER_LABELS } from "@/lib/domain/client-health";
import { csvResponse } from "@/lib/csv-response";
import { requireApiSession } from "@/lib/auth";

export async function GET() {
  const gate = await requireApiSession();
  if (gate instanceof Response) return gate;
  const rows = await atRiskWorklist();
  return csvResponse(
    "at-risk-clients.csv",
    rows.map((r) => ({
      client: r.clientName,
      producer: r.producerName ?? "",
      score: r.score,
      tier: HEALTH_TIER_LABELS[r.tier],
      topFactor: r.topFactor ?? "",
      activePolicies: r.activePolicyCount,
      pastDueAmount: r.pastDueAmount,
      recentClaims: r.recentClaimCount,
    })),
  );
}
