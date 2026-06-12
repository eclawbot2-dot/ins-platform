import { lossRatioReport } from "@/lib/reports/loss-ratio";
import { csvResponse } from "@/lib/csv-response";

export async function GET(req: Request) {
  const by = new URL(req.url).searchParams.get("by") === "lob" ? "lob" : "carrier";
  const report = await lossRatioReport();
  const rows = (by === "lob" ? report.byLob : report.byCarrier).map((r) => ({
    group: r.label,
    policies: r.policyCount,
    writtenPremium: r.premium,
    claims: r.claimCount,
    paid: r.paid,
    reserve: r.reserve,
    incurred: r.incurred,
    lossRatioPct: r.lossRatioPct ?? "",
    tier: r.tier,
  }));
  return csvResponse(`loss-ratio-${by}.csv`, rows);
}
