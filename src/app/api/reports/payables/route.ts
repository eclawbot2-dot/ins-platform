import type { NextRequest } from "next/server";
import { producerPayables } from "@/lib/reports/payables";
import { csvResponse } from "@/lib/csv-response";

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const report = await producerPayables({
    from: from ? new Date(`${from}T00:00:00Z`) : undefined,
    to: to ? new Date(`${to}T23:59:59Z`) : undefined,
  });
  return csvResponse(
    "producer-payables.csv",
    report.rows.map((r) => ({
      producer: r.producerName,
      statementLines: r.lineCount,
      payableCommission: r.commission,
    })),
  );
}
