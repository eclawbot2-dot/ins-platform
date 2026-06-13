import { commissionRevenue } from "@/lib/reports/commission-revenue";
import { csvResponse } from "@/lib/csv-response";
import { requireApiSession } from "@/lib/auth";

export async function GET() {
  const gate = await requireApiSession();
  if (gate instanceof Response) return gate;
  const months = await commissionRevenue(12);
  return csvResponse(
    "commission-revenue.csv",
    months.map((m) => ({ month: m.month, commission: m.commission, statementLines: m.lineCount })),
  );
}
