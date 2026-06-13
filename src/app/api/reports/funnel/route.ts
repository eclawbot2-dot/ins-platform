import { prisma } from "@/lib/prisma";
import { conversionFunnel, winRate } from "@/lib/domain/pipeline";
import { csvResponse } from "@/lib/csv-response";
import { requireApiSession } from "@/lib/auth";

export async function GET() {
  const gate = await requireApiSession();
  if (gate instanceof Response) return gate;
  const opportunities = await prisma.opportunity.findMany({ select: { stage: true } });
  const stages = opportunities.map((o) => o.stage);
  const funnel = conversionFunnel(stages);
  const rate = winRate(stages);
  return csvResponse(
    "pipeline-funnel.csv",
    funnel.map((f) => ({
      stage: f.stage,
      reached: f.count,
      reachedPct: f.reachedPct,
      winRatePct: rate ?? "",
    })),
  );
}
