/**
 * Server-side assemblers that turn a policy id into the input objects
 * consumed by the document renderers (id-card / eoi). Shared by the
 * staff routes and the portal download so both produce identical output.
 */

import { prisma } from "@/lib/prisma";
import { BRAND } from "@/lib/brand";
import { toNum, fmtMoney } from "@/lib/money";
import type { IdCardInput, IdCardCoverage } from "./id-card";
import { lobHasIdCard } from "./id-card";
import type { EoiInput } from "./eoi";
import { eoiKindForLob } from "./eoi";

/** Coverage codes shown on an auto ID card (liability + the basics). */
const ID_CARD_CODES = new Set(["BI", "PD", "UM", "MED", "COMP", "COLL"]);

function coverageDisplay(c: { limitText: string | null; limitAmount: unknown; deductibleText: string | null; deductibleAmount: unknown }): string {
  if (c.limitText) return c.limitText;
  if (c.limitAmount != null) return fmtMoney(c.limitAmount as number);
  if (c.deductibleText) return `${c.deductibleText} ded.`;
  if (c.deductibleAmount != null) return `${fmtMoney(c.deductibleAmount as number)} ded.`;
  return "Per policy";
}

/** Build the ID-card input for a policy, or null if the line doesn't carry one. */
export async function assembleIdCardInput(policyId: string): Promise<IdCardInput | null> {
  const [policy, agency] = await Promise.all([
    prisma.policy.findUnique({
      where: { id: policyId },
      include: {
        client: { select: { name: true } },
        carrier: { select: { name: true, phone: true, naicCode: true } },
        vehicles: { orderBy: { createdAt: "asc" } },
        coverages: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    }),
    prisma.agencyProfile.findUnique({ where: { id: "agency" } }),
  ]);
  if (!policy || !lobHasIdCard(policy.lineOfBusiness)) return null;

  const coverages: IdCardCoverage[] = policy.coverages
    .filter((c) => ID_CARD_CODES.has(c.code))
    .map((c) => ({ code: c.code, label: c.label, display: coverageDisplay(c) }));

  return {
    agencyName: agency?.name ?? BRAND.name,
    agencyPhone: agency?.phone ?? BRAND.phone,
    carrierName: policy.carrier.name,
    carrierPhone: policy.carrier.phone,
    naicCode: policy.carrier.naicCode,
    policyNumber: policy.policyNumber,
    insuredName: policy.client.name,
    effectiveDate: policy.effectiveDate,
    expirationDate: policy.expirationDate,
    vehicles: policy.vehicles.map((v) => ({ year: v.year, make: v.make, model: v.model, vin: v.vin })),
    coverages,
    lineOfBusiness: policy.lineOfBusiness,
  };
}

/** Build the renderer input for an existing EvidenceOfProperty record. */
export async function assembleEoiInput(eoiId: string): Promise<EoiInput | null> {
  const [eoi, agency] = await Promise.all([
    prisma.evidenceOfProperty.findUnique({
      where: { id: eoiId },
      include: {
        client: { select: { name: true, addressLine1: true, city: true, state: true, zip: true } },
        policy: { select: { carrier: { select: { naicCode: true } } } },
        issuedBy: { select: { name: true } },
      },
    }),
    prisma.agencyProfile.findUnique({ where: { id: "agency" } }),
  ]);
  if (!eoi) return null;

  const { EOI_HOLDER_INTEREST_LABELS } = await import("@/lib/labels");
  const insuredAddress = eoi.client.addressLine1
    ? `${eoi.client.addressLine1}, ${[eoi.client.city, eoi.client.state, eoi.client.zip].filter(Boolean).join(" ")}`
    : null;

  return {
    eoiNumber: eoi.eoiNumber,
    kind: eoi.kind,
    agencyName: agency?.name ?? BRAND.name,
    agencyAddress: agency?.addressLine1
      ? `${agency.addressLine1}, ${[agency.city, agency.state, agency.zip].filter(Boolean).join(" ")}`
      : null,
    agencyPhone: agency?.phone ?? BRAND.phone,
    agencyEmail: agency?.email ?? BRAND.email,
    carrierName: eoi.carrierName,
    naicCode: eoi.policy.carrier.naicCode,
    policyNumber: eoi.policyNumber,
    effectiveDate: eoi.effectiveDate,
    expirationDate: eoi.expirationDate,
    insuredName: eoi.client.name,
    insuredAddress,
    propertyAddress: eoi.propertyAddress,
    coverageALimit: eoi.coverageALimit == null ? null : toNum(eoi.coverageALimit),
    deductibleText: eoi.deductibleText,
    holderName: eoi.holderName,
    holderInterestLabel: EOI_HOLDER_INTEREST_LABELS[eoi.holderInterest],
    holderAddress: eoi.holderAddress,
    loanNumber: eoi.loanNumber,
    remarks: eoi.remarks,
    issuedAt: eoi.issuedAt,
    issuedByName: eoi.issuedBy.name,
  };
}

/** Default property data (Coverage A + deductible + address) from a policy's dwelling/location. */
export async function eoiDefaultsForPolicy(policyId: string): Promise<{
  carrierName: string;
  policyNumber: string;
  effectiveDate: Date;
  expirationDate: Date;
  propertyAddress: string | null;
  coverageALimit: number | null;
  deductibleText: string | null;
  mortgageeName: string | null;
  loanNumber: string | null;
} | null> {
  const policy = await prisma.policy.findUnique({
    where: { id: policyId },
    include: {
      carrier: { select: { name: true } },
      dwellings: { orderBy: { createdAt: "asc" }, take: 1 },
      locations: { orderBy: { createdAt: "asc" }, take: 1 },
      coverages: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!policy) return null;

  const dwelling = policy.dwellings[0] ?? null;
  const location = policy.locations[0] ?? null;
  const covA = policy.coverages.find((c) => c.code === "COV_A" || c.code === "BLDG" || c.code === "FLOOD_BLDG" || c.code === "BR_LIMIT");
  const deduct = policy.coverages.find((c) => c.code === "DEDUCT" || c.code === "WIND_HAIL");

  const addressOf = (a: { addressLine1: string | null; city: string | null; state: string | null; zip: string | null } | null) =>
    a?.addressLine1 ? `${a.addressLine1}, ${[a.city, a.state, a.zip].filter(Boolean).join(" ")}` : null;

  return {
    carrierName: policy.carrier.name,
    policyNumber: policy.policyNumber,
    effectiveDate: policy.effectiveDate,
    expirationDate: policy.expirationDate,
    propertyAddress: addressOf(dwelling) ?? addressOf(location),
    coverageALimit: covA?.limitAmount == null ? null : toNum(covA.limitAmount),
    deductibleText: deduct ? (deduct.deductibleText ?? (deduct.deductibleAmount != null ? `$${toNum(deduct.deductibleAmount).toLocaleString()}` : null)) : null,
    mortgageeName: dwelling?.mortgageeName ?? null,
    loanNumber: dwelling?.loanNumber ?? null,
  };
}
