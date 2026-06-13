import type { NextRequest } from "next/server";
import { bookOfBusiness, type BookGroupBy } from "@/lib/reports/book";
import { csvResponse } from "@/lib/csv-response";
import { requireApiSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const gate = await requireApiSession();
  if (gate instanceof Response) return gate;
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
