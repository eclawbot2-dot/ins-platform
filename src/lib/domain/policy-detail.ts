/**
 * Shared mappers for a policy's coverage schedule + risk items. Used by
 * the edit form (pre-fill), the policy detail page, and the portal
 * policy view — one place that normalizes Decimal → number.
 */

import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import type { ExistingRiskItems } from "@/app/(app)/policies/coverage-editor";

/** Include clause for loading a policy's full coverage + risk items. */
export const policyDetailInclude = {
  coverages: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
  vehicles: { orderBy: { createdAt: "asc" as const } },
  drivers: { orderBy: { createdAt: "asc" as const } },
  dwellings: { orderBy: { createdAt: "asc" as const } },
  scheduledItems: { orderBy: { createdAt: "asc" as const } },
  watercraft: { orderBy: { createdAt: "asc" as const } },
  locations: { orderBy: { createdAt: "asc" as const } },
};

/** Load the coverage + risk items for a policy as form-ready rows. */
export async function loadPolicyExisting(policyId: string): Promise<ExistingRiskItems> {
  const [coverages, vehicles, drivers, dwellings, scheduledItems, watercraft, locations] = await Promise.all([
    prisma.coverage.findMany({ where: { policyId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.vehicle.findMany({ where: { policyId }, orderBy: { createdAt: "asc" } }),
    prisma.driver.findMany({ where: { policyId }, orderBy: { createdAt: "asc" } }),
    prisma.dwelling.findMany({ where: { policyId }, orderBy: { createdAt: "asc" } }),
    prisma.scheduledItem.findMany({ where: { policyId }, orderBy: { createdAt: "asc" } }),
    prisma.watercraft.findMany({ where: { policyId }, orderBy: { createdAt: "asc" } }),
    prisma.insuredLocation.findMany({ where: { policyId }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    coverages: coverages.map((c) => ({
      code: c.code,
      label: c.label,
      limitText: c.limitText,
      limitAmount: c.limitAmount == null ? null : toNum(c.limitAmount),
      deductibleText: c.deductibleText,
      deductibleAmount: c.deductibleAmount == null ? null : toNum(c.deductibleAmount),
      premiumPart: c.premiumPart == null ? null : toNum(c.premiumPart),
      notes: c.notes,
    })),
    vehicles: vehicles.map((v) => ({ year: v.year, make: v.make, model: v.model, vin: v.vin, garagingZip: v.garagingZip, usage: v.usage, annualMiles: v.annualMiles })),
    drivers: drivers.map((d) => ({ name: d.name, licenseNumber: d.licenseNumber, licenseState: d.licenseState, relationship: d.relationship })),
    dwellings: dwellings.map((d) => ({ addressLine1: d.addressLine1, city: d.city, state: d.state, zip: d.zip, yearBuilt: d.yearBuilt, construction: d.construction, roofType: d.roofType, squareFeet: d.squareFeet, replacementCost: d.replacementCost == null ? null : toNum(d.replacementCost), occupancy: d.occupancy, mortgageeName: d.mortgageeName, loanNumber: d.loanNumber })),
    scheduledItems: scheduledItems.map((s) => ({ type: s.type, description: s.description, value: toNum(s.value), appraisalOnFile: s.appraisalOnFile })),
    watercraft: watercraft.map((w) => ({ type: w.type, year: w.year, make: w.make, length: w.length == null ? null : toNum(w.length), hullId: w.hullId, motorHp: w.motorHp })),
    locations: locations.map((l) => ({ addressLine1: l.addressLine1, city: l.city, state: l.state, zip: l.zip, buildingValue: l.buildingValue == null ? null : toNum(l.buildingValue), contentsValue: l.contentsValue == null ? null : toNum(l.contentsValue), occupancy: l.occupancy, sqFt: l.sqFt, yearBuilt: l.yearBuilt })),
  };
}
