import { commissionRevenue } from "@/lib/reports/commission-revenue";
import { csvResponse } from "@/lib/csv-response";

export async function GET() {
  const months = await commissionRevenue(12);
  return csvResponse(
    "commission-revenue.csv",
    months.map((m) => ({ month: m.month, commission: m.commission, statementLines: m.lineCount })),
  );
}
