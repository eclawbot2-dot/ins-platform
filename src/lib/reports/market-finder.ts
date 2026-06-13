/**
 * Market finder (Wave D-final) — DB glue over the pure ranking logic.
 * Given an LOB (and optional state), join carriers + their appetite rows
 * + commission schedule and return the eligibility-ranked market list.
 */

import { prisma } from "@/lib/prisma";
import { rankMarkets, type MarketCarrierInput, type MarketCarrierResult } from "@/lib/domain/market-finder";
import { toNum } from "@/lib/money";
import type { LineOfBusiness } from "@prisma/client";

export async function findMarkets(
  lob: LineOfBusiness,
  opts: { state?: string | null } = {},
): Promise<MarketCarrierResult[]> {
  const carriers = await prisma.carrier.findMany({
    select: {
      id: true,
      name: true,
      appointmentStatus: true,
      isMga: true,
      appetites: { where: { lineOfBusiness: lob }, take: 1 },
      schedules: { where: { lineOfBusiness: lob }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  const inputs: MarketCarrierInput[] = carriers.map((c) => {
    const appetite = c.appetites[0] ?? null;
    const schedule = c.schedules[0] ?? null;
    return {
      carrierId: c.id,
      carrierName: c.name,
      appointmentStatus: c.appointmentStatus,
      appetite: appetite?.appetite ?? null,
      states: appetite?.states ?? null,
      classNotes: appetite?.classNotes ?? null,
      newPct: schedule ? toNum(schedule.newPct) : null,
      renewalPct: schedule ? toNum(schedule.renewalPct) : null,
      isMga: c.isMga,
    };
  });

  return rankMarkets(inputs, opts);
}
