import { premiumTrend } from "@/lib/reports/trend";
import { csvResponse } from "@/lib/csv-response";
import { requireApiSession } from "@/lib/auth";

export async function GET() {
  const gate = await requireApiSession();
  if (gate instanceof Response) return gate;
  const months = await premiumTrend(12);
  return csvResponse(
    "premium-trend.csv",
    months.map((m) => ({
      month: m.month,
      newPremium: m.newPremium,
      renewalPremium: m.renewalPremium,
      total: m.total,
    })),
  );
}
