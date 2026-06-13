import type { NextRequest } from "next/server";
import { producerProduction } from "@/lib/reports/production";
import { csvResponse } from "@/lib/csv-response";
import { startOfYear } from "@/lib/domain/dates";
import { requireApiSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const gate = await requireApiSession();
  if (gate instanceof Response) return gate;
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const rows = await producerProduction({
    from: from ? new Date(`${from}T00:00:00Z`) : startOfYear(new Date()),
    to: to ? new Date(`${to}T23:59:59Z`) : undefined,
  });
  return csvResponse(
    "producer-production.csv",
    rows.map((r) => ({
      producer: r.producerName,
      policies: r.policyCount,
      newBusinessPolicies: r.newPolicyCount,
      writtenPremium: r.writtenPremium,
      commission: r.commission,
    })),
  );
}
