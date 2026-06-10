import type { NextRequest } from "next/server";
import { bookOfBusiness, type BookGroupBy } from "@/lib/reports/book";
import { csvResponse } from "@/lib/csv-response";

export async function GET(req: NextRequest) {
  const byRaw = req.nextUrl.searchParams.get("by");
  const by: BookGroupBy = byRaw === "lob" || byRaw === "producer" ? byRaw : "carrier";
  const report = await bookOfBusiness(by);
  return csvResponse(
    `book-of-business-by-${by}.csv`,
    report.rows.map((r) => ({
      group: r.group,
      policies: r.policyCount,
      premium: r.premium,
      expectedCommission: r.commission,
      sharePct: r.sharePct,
    })),
  );
}
