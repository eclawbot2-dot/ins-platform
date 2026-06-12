/**
 * Agency-wide cross-sell worklist (Wave B).
 *
 * Runs the account-rounding engine over every active client and returns
 * the ranked opportunities, plus a per-client estimated premium total so
 * the worklist sorts by dollar opportunity.
 */

import { prisma } from "@/lib/prisma";
import {
  crossSellSuggestions,
  totalOpportunity,
  type CrossSellSuggestion,
} from "@/lib/domain/account-rounding";
import type { LineOfBusiness } from "@prisma/client";

const ACTIVE_POLICY_STATUSES: ("ACTIVE" | "BOUND" | "RENEWED")[] = ["ACTIVE", "BOUND", "RENEWED"];

export type ClientCrossSellRow = {
  clientId: string;
  clientName: string;
  isBusiness: boolean;
  producerName: string | null;
  activeLobs: LineOfBusiness[];
  suggestions: CrossSellSuggestion[];
  estOpportunity: number;
};

/** Build the cross-sell opportunities for a single client (client-360 panel). */
export async function crossSellForClient(clientId: string): Promise<CrossSellSuggestion[]> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      type: true,
      notes: true,
      policies: { where: { status: { in: ACTIVE_POLICY_STATUSES } }, select: { lineOfBusiness: true } },
      priorPolicies: { select: { lineOfBusiness: true } },
    },
  });
  if (!client) return [];
  return crossSellSuggestions({
    activeLobs: Array.from(new Set(client.policies.map((p) => p.lineOfBusiness))),
    priorLobs: Array.from(new Set(client.priorPolicies.map((p) => p.lineOfBusiness))),
    isBusiness: client.type === "BUSINESS",
    notes: client.notes,
  });
}

/** Agency-wide ranked cross-sell worklist. */
export async function crossSellWorklist(): Promise<ClientCrossSellRow[]> {
  const clients = await prisma.client.findMany({
    where: { status: { in: ["ACTIVE", "PROSPECT"] } },
    select: {
      id: true,
      name: true,
      type: true,
      notes: true,
      producer: { select: { name: true } },
      policies: { where: { status: { in: ACTIVE_POLICY_STATUSES } }, select: { lineOfBusiness: true } },
      priorPolicies: { select: { lineOfBusiness: true } },
    },
  });

  const rows: ClientCrossSellRow[] = [];
  for (const c of clients) {
    const activeLobs = Array.from(new Set(c.policies.map((p) => p.lineOfBusiness)));
    const suggestions = crossSellSuggestions({
      activeLobs,
      priorLobs: Array.from(new Set(c.priorPolicies.map((p) => p.lineOfBusiness))),
      isBusiness: c.type === "BUSINESS",
      notes: c.notes,
    });
    if (suggestions.length === 0) continue;
    rows.push({
      clientId: c.id,
      clientName: c.name,
      isBusiness: c.type === "BUSINESS",
      producerName: c.producer?.name ?? null,
      activeLobs,
      suggestions,
      estOpportunity: totalOpportunity(suggestions),
    });
  }

  return rows.sort((a, b) => b.estOpportunity - a.estOpportunity);
}
