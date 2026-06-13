/**
 * Household 360 aggregation (Wave D-final) — DB glue over the pure
 * household logic. Assembles every member's book into a combined view and
 * runs household-level account-rounding.
 */

import { prisma } from "@/lib/prisma";
import { householdCrossSell, type HouseholdCrossSell, type HouseholdMemberBook } from "@/lib/domain/household";
import { toNum } from "@/lib/money";
import type { LineOfBusiness, PolicyStatus } from "@prisma/client";

const ACTIVE_POLICY_STATUSES: PolicyStatus[] = ["ACTIVE", "BOUND", "RENEWED"];

export type HouseholdMemberRow = {
  clientId: string;
  name: string;
  role: string;
  status: string;
  isBusiness: boolean;
  policyCount: number;
  premium: number;
  lobs: LineOfBusiness[];
};

export type HouseholdPolicyRow = {
  id: string;
  policyNumber: string;
  clientId: string;
  clientName: string;
  lineOfBusiness: LineOfBusiness;
  status: PolicyStatus;
  premium: number;
  carrierName: string;
  expirationDate: Date;
};

export type HouseholdSummary = {
  id: string;
  name: string;
  notes: string | null;
  primaryClientId: string | null;
  members: HouseholdMemberRow[];
  policies: HouseholdPolicyRow[];
  totalPremium: number;
  crossSell: HouseholdCrossSell;
};

/** Full 360 for one household — members, every member's policies, household cross-sell. */
export async function householdSummary(householdId: string): Promise<HouseholdSummary | null> {
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    select: { id: true, name: true, notes: true, primaryClientId: true },
  });
  if (!household) return null;

  const members = await prisma.client.findMany({
    where: { householdId },
    select: {
      id: true,
      name: true,
      householdRole: true,
      status: true,
      type: true,
      notes: true,
      policies: {
        select: {
          id: true,
          policyNumber: true,
          lineOfBusiness: true,
          status: true,
          premium: true,
          expirationDate: true,
          carrier: { select: { name: true } },
        },
      },
      priorPolicies: { select: { lineOfBusiness: true } },
    },
    orderBy: { householdRole: "asc" },
  });

  const memberRows: HouseholdMemberRow[] = [];
  const policyRows: HouseholdPolicyRow[] = [];
  const books: HouseholdMemberBook[] = [];
  let totalPremium = 0;

  for (const m of members) {
    const active = m.policies.filter((p) => ACTIVE_POLICY_STATUSES.includes(p.status));
    const memberPremium = active.reduce((acc, p) => acc + toNum(p.premium), 0);
    totalPremium += memberPremium;
    const lobs = Array.from(new Set(active.map((p) => p.lineOfBusiness)));

    memberRows.push({
      clientId: m.id,
      name: m.name,
      role: m.householdRole,
      status: m.status,
      isBusiness: m.type === "BUSINESS",
      policyCount: active.length,
      premium: memberPremium,
      lobs,
    });

    for (const p of m.policies) {
      policyRows.push({
        id: p.id,
        policyNumber: p.policyNumber,
        clientId: m.id,
        clientName: m.name,
        lineOfBusiness: p.lineOfBusiness,
        status: p.status,
        premium: toNum(p.premium),
        carrierName: p.carrier.name,
        expirationDate: p.expirationDate,
      });
    }

    books.push({
      clientId: m.id,
      clientName: m.name,
      isBusiness: m.type === "BUSINESS",
      notes: m.notes,
      activeLobs: lobs,
      priorLobs: Array.from(new Set(m.priorPolicies.map((pp) => pp.lineOfBusiness))),
    });
  }

  return {
    id: household.id,
    name: household.name,
    notes: household.notes,
    primaryClientId: household.primaryClientId,
    members: memberRows,
    policies: policyRows.sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime()),
    totalPremium,
    crossSell: householdCrossSell(books),
  };
}
