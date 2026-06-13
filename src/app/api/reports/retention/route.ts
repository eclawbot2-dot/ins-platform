import { retentionReport } from "@/lib/reports/retention";
import { csvResponse } from "@/lib/csv-response";
import { requireApiSession } from "@/lib/auth";

export async function GET() {
  const gate = await requireApiSession();
  if (gate instanceof Response) return gate;
  const report = await retentionReport(365);
  return csvResponse(
    "retention.csv",
    report.rows.map((r) => ({
      policyNumber: r.policyNumber,
      client: r.clientName,
      lineOfBusiness: r.lineOfBusiness,
      carrier: r.carrierName,
      premium: r.premium,
      expired: r.expirationDate,
      outcome: r.outcome,
    })),
  );
}
