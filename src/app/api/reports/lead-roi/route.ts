import { leadRoi } from "@/lib/reports/lead-roi";
import { csvResponse } from "@/lib/csv-response";

export async function GET() {
  const { sources } = await leadRoi();
  return csvResponse(
    "lead-source-roi.csv",
    sources.map((s) => ({
      source: s.source,
      leads: s.leads,
      converted: s.converted,
      conversionPct: s.conversionPct,
      boundPremium: s.boundPremium,
      premiumPerLead: s.premiumPerLead,
    })),
  );
}
