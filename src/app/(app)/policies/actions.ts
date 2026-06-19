"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStr, fStrOpt, fNum, fDate, fEnum, fBool } from "@/lib/form";
import { expectedCommission, validateSplits } from "@/lib/domain/commissions";
import { proRataReturn, shortRateReturn, prorateEndorsement } from "@/lib/domain/proration";
import { addYears } from "@/lib/domain/dates";
import { reinstatementEligibility, lapseHandlingNote } from "@/lib/domain/reinstatement";
import { scheduleTouchpoint } from "@/lib/touchpoint-engine";
import { ALL_LOBS } from "@/lib/labels";
import type { EndorsementRequestType, EndorsementRequestStatus } from "@prisma/client";
import { coverageTemplateFor } from "@/lib/domain/coverage-templates";
import { toNum, roundMoney } from "@/lib/money";
import type { BillingType, LineOfBusiness, PolicyStatus, Prisma } from "@prisma/client";

const BILLING: BillingType[] = ["AGENCY_BILL", "DIRECT_BILL"];
const STATUSES: PolicyStatus[] = ["QUOTE", "BOUND", "ACTIVE", "RENEWED", "CANCELLED", "EXPIRED", "NON_RENEWED"];

// ── Coverage + risk-item parsing (Wave A) ────────────────────────────

const fInt = (fd: FormData, key: string): number | null => {
  const v = fStr(fd, key);
  if (v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};
const fDec = (fd: FormData, key: string): number | null => {
  const v = fStr(fd, key).replace(/[$,]/g, "");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const count = (fd: FormData, key: string): number => {
  const n = parseInt(fStr(fd, key), 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 50) : 0;
};
/** A money-or-split value: pure number → amount; anything else → text. */
function limitValue(raw: string): { amount: number | null; text: string | null } {
  const v = raw.trim();
  if (v === "") return { amount: null, text: null };
  const cleaned = v.replace(/[$,]/g, "");
  if (/^\d+(\.\d+)?$/.test(cleaned)) return { amount: Number(cleaned), text: null };
  return { amount: null, text: v };
}

type ParsedItems = {
  coverages: Prisma.CoverageCreateManyPolicyInput[];
  vehicles: Prisma.VehicleCreateManyPolicyInput[];
  drivers: Prisma.DriverCreateManyPolicyInput[];
  dwellings: Prisma.DwellingCreateManyPolicyInput[];
  scheduledItems: Prisma.ScheduledItemCreateManyPolicyInput[];
  watercraft: Prisma.WatercraftCreateManyPolicyInput[];
  locations: Prisma.InsuredLocationCreateManyPolicyInput[];
};

/**
 * Parse the LOB-driven coverage schedule + risk-item editors out of the
 * policy form. Coverage rows are keyed by the template index; risk-item
 * rows are repeatable, gated by the LOB template so only applicable
 * tables are written.
 */
function coverageAndRiskItemsFrom(formData: FormData, lob: LineOfBusiness): ParsedItems {
  const template = coverageTemplateFor(lob);
  const out: ParsedItems = { coverages: [], vehicles: [], drivers: [], dwellings: [], scheduledItems: [], watercraft: [], locations: [] };

  // Coverages — one row per template coverage; skip rows with nothing entered.
  const covCount = Math.min(count(formData, "cov_count"), template.coverages.length);
  for (let i = 0; i < covCount; i++) {
    const code = fStr(formData, `cov_code_${i}`);
    if (!code) continue;
    const label = fStr(formData, `cov_label_${i}`) || code;
    const limit = limitValue(fStr(formData, `cov_limit_${i}`));
    const deduct = limitValue(fStr(formData, `cov_deduct_${i}`));
    const premiumPart = fDec(formData, `cov_premium_${i}`);
    if (limit.amount == null && limit.text == null && deduct.amount == null && deduct.text == null && premiumPart == null) continue;
    out.coverages.push({
      code,
      label,
      limitText: limit.text,
      limitAmount: limit.amount,
      deductibleText: deduct.text,
      deductibleAmount: deduct.amount,
      premiumPart,
      sortOrder: i,
    });
  }

  const apply = template.riskItems;
  if (apply.includes("vehicle")) {
    const n = count(formData, "veh_count");
    for (let i = 0; i < n; i++) {
      const make = fStr(formData, `veh_make_${i}`);
      const model = fStr(formData, `veh_model_${i}`);
      const year = fInt(formData, `veh_year_${i}`);
      const vin = fStrOpt(formData, `veh_vin_${i}`);
      if (!make && !model && year == null && !vin) continue;
      out.vehicles.push({
        year,
        make: make || null,
        model: model || null,
        vin,
        garagingZip: fStrOpt(formData, `veh_zip_${i}`),
        usage: fStrOpt(formData, `veh_usage_${i}`),
        annualMiles: fInt(formData, `veh_miles_${i}`),
      });
    }
  }
  if (apply.includes("driver")) {
    const n = count(formData, "drv_count");
    for (let i = 0; i < n; i++) {
      const name = fStr(formData, `drv_name_${i}`);
      if (!name) continue;
      out.drivers.push({
        name,
        licenseNumber: fStrOpt(formData, `drv_lic_${i}`),
        licenseState: fStrOpt(formData, `drv_state_${i}`),
        relationship: fStrOpt(formData, `drv_rel_${i}`),
      });
    }
  }
  if (apply.includes("dwelling")) {
    const n = count(formData, "dwl_count");
    for (let i = 0; i < n; i++) {
      const addr = fStr(formData, `dwl_addr_${i}`);
      const rcv = fDec(formData, `dwl_rcv_${i}`);
      if (!addr && rcv == null && !fStr(formData, `dwl_city_${i}`)) continue;
      out.dwellings.push({
        addressLine1: addr || null,
        city: fStrOpt(formData, `dwl_city_${i}`),
        state: fStrOpt(formData, `dwl_state_${i}`),
        zip: fStrOpt(formData, `dwl_zip_${i}`),
        yearBuilt: fInt(formData, `dwl_year_${i}`),
        construction: fStrOpt(formData, `dwl_constr_${i}`),
        roofType: fStrOpt(formData, `dwl_roof_${i}`),
        squareFeet: fInt(formData, `dwl_sqft_${i}`),
        replacementCost: rcv,
        occupancy: fStrOpt(formData, `dwl_occ_${i}`),
        mortgageeName: fStrOpt(formData, `dwl_mortgagee_${i}`),
        loanNumber: fStrOpt(formData, `dwl_loan_${i}`),
      });
    }
  }
  if (apply.includes("scheduledItem")) {
    const n = count(formData, "sch_count");
    for (let i = 0; i < n; i++) {
      const desc = fStr(formData, `sch_desc_${i}`);
      const value = fDec(formData, `sch_value_${i}`);
      if (!desc && value == null) continue;
      out.scheduledItems.push({
        type: fStr(formData, `sch_type_${i}`) || "item",
        description: desc || "Scheduled item",
        value: value ?? 0,
        appraisalOnFile: fBool(formData, `sch_appraisal_${i}`),
      });
    }
  }
  if (apply.includes("watercraft")) {
    const n = count(formData, "wct_count");
    for (let i = 0; i < n; i++) {
      const make = fStr(formData, `wct_make_${i}`);
      const type = fStr(formData, `wct_type_${i}`);
      if (!make && !type) continue;
      out.watercraft.push({
        type: type || null,
        year: fInt(formData, `wct_year_${i}`),
        make: make || null,
        length: fDec(formData, `wct_length_${i}`),
        hullId: fStrOpt(formData, `wct_hull_${i}`),
        motorHp: fInt(formData, `wct_hp_${i}`),
      });
    }
  }
  if (apply.includes("location")) {
    const n = count(formData, "loc_count");
    for (let i = 0; i < n; i++) {
      const addr = fStr(formData, `loc_addr_${i}`);
      const bldg = fDec(formData, `loc_bldg_${i}`);
      if (!addr && bldg == null && !fStr(formData, `loc_city_${i}`)) continue;
      out.locations.push({
        addressLine1: addr || null,
        city: fStrOpt(formData, `loc_city_${i}`),
        state: fStrOpt(formData, `loc_state_${i}`),
        zip: fStrOpt(formData, `loc_zip_${i}`),
        buildingValue: bldg,
        contentsValue: fDec(formData, `loc_cont_${i}`),
        occupancy: fStrOpt(formData, `loc_occ_${i}`),
        sqFt: fInt(formData, `loc_sqft_${i}`),
        yearBuilt: fInt(formData, `loc_year_${i}`),
      });
    }
  }

  return out;
}

/** Persist parsed coverage + risk items for a policy (replace-all). */
async function writeCoverageAndRiskItems(policyId: string, items: ParsedItems, replace: boolean) {
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (replace) {
    ops.push(
      prisma.coverage.deleteMany({ where: { policyId } }),
      prisma.vehicle.deleteMany({ where: { policyId } }),
      prisma.driver.deleteMany({ where: { policyId } }),
      prisma.dwelling.deleteMany({ where: { policyId } }),
      prisma.scheduledItem.deleteMany({ where: { policyId } }),
      prisma.watercraft.deleteMany({ where: { policyId } }),
      prisma.insuredLocation.deleteMany({ where: { policyId } }),
    );
  }
  if (items.coverages.length) ops.push(prisma.coverage.createMany({ data: items.coverages.map((c) => ({ ...c, policyId })) }));
  if (items.vehicles.length) ops.push(prisma.vehicle.createMany({ data: items.vehicles.map((c) => ({ ...c, policyId })) }));
  if (items.drivers.length) ops.push(prisma.driver.createMany({ data: items.drivers.map((c) => ({ ...c, policyId })) }));
  if (items.dwellings.length) ops.push(prisma.dwelling.createMany({ data: items.dwellings.map((c) => ({ ...c, policyId })) }));
  if (items.scheduledItems.length) ops.push(prisma.scheduledItem.createMany({ data: items.scheduledItems.map((c) => ({ ...c, policyId })) }));
  if (items.watercraft.length) ops.push(prisma.watercraft.createMany({ data: items.watercraft.map((c) => ({ ...c, policyId })) }));
  if (items.locations.length) ops.push(prisma.insuredLocation.createMany({ data: items.locations.map((c) => ({ ...c, policyId })) }));
  if (ops.length) await prisma.$transaction(ops);
}

function policyDataFrom(formData: FormData) {
  const premium = fNum(formData, "premium");
  const commissionRatePct = fNum(formData, "commissionRatePct");
  const effectiveDate = fDate(formData, "effectiveDate") ?? new Date();
  const expirationDate = fDate(formData, "expirationDate") ?? addYears(effectiveDate, 1);
  return {
    policyNumber: fStr(formData, "policyNumber"),
    clientId: fStr(formData, "clientId"),
    carrierId: fStr(formData, "carrierId"),
    mga: fStrOpt(formData, "mga"),
    lineOfBusiness: fEnum(formData, "lineOfBusiness", ALL_LOBS, "AUTO"),
    status: fEnum(formData, "status", STATUSES, "QUOTE"),
    billingType: fEnum(formData, "billingType", BILLING, "DIRECT_BILL"),
    premium,
    commissionRatePct,
    commissionAmount: expectedCommission(premium, commissionRatePct),
    isNewBusiness: fBool(formData, "isNewBusiness"),
    effectiveDate,
    expirationDate,
    producerId: fStr(formData, "producerId"),
    csrId: fStrOpt(formData, "csrId"),
    notes: fStrOpt(formData, "notes"),
  };
}

export async function createPolicy(formData: FormData) {
  const session = await requireSession();
  const data = policyDataFrom(formData);
  if (!data.policyNumber || !data.clientId || !data.carrierId || !data.producerId) {
    redirect(`/policies/new?toastError=${encodeURIComponent("Policy number, client, carrier and producer are required")}`);
  }
  const exists = await prisma.policy.findUnique({ where: { policyNumber: data.policyNumber } });
  if (exists) {
    redirect(`/policies/new?toastError=${encodeURIComponent(`Policy number ${data.policyNumber} already exists`)}`);
  }
  const policy = await prisma.policy.create({
    data: { ...data, boundAt: data.status === "BOUND" || data.status === "ACTIVE" ? new Date() : null },
  });
  // Default 100% split to the producer.
  await prisma.policyProducerSplit.create({
    data: { policyId: policy.id, producerId: data.producerId, pct: 100 },
  });
  // Coverage schedule + risk items, gated by the saved line's template.
  await writeCoverageAndRiskItems(policy.id, coverageAndRiskItemsFrom(formData, data.lineOfBusiness), false);
  await audit({ userId: session.userId, action: "POLICY_CREATE", entityType: "Policy", entityId: policy.id, detail: policy.policyNumber });
  redirect(`/policies/${policy.id}?toast=${encodeURIComponent("Policy created")}`);
}

export async function updatePolicy(id: string, formData: FormData) {
  const session = await requireSession();
  const data = policyDataFrom(formData);
  await prisma.policy.update({ where: { id }, data });
  // Replace the coverage schedule + risk items for the saved line.
  await writeCoverageAndRiskItems(id, coverageAndRiskItemsFrom(formData, data.lineOfBusiness), true);
  await audit({ userId: session.userId, action: "POLICY_UPDATE", entityType: "Policy", entityId: id });
  redirect(`/policies/${id}?toast=${encodeURIComponent("Policy updated")}`);
}

// ── Lifecycle state-transition guards ────────────────────────────────
// Each transition is gated by updateMany({ where: { id, status: { in:
// <legal predecessors> } }). count === 0 means the policy was in an illegal
// state (or vanished) — reject instead of doing a blind status overwrite that
// could, e.g., resurrect a CANCELLED policy to ACTIVE. Mirrors the AR
// invoice-transition guard in accounting/actions.ts.

/** Statuses a policy may carry an endorsement against (an in-force term). */
const ENDORSABLE_STATUSES: PolicyStatus[] = ["BOUND", "ACTIVE", "RENEWED"];

export async function bindPolicy(id: string) {
  const session = await requireSession();
  // Bind a quote → BOUND. Only a QUOTE may be bound.
  const { count } = await prisma.policy.updateMany({
    where: { id, status: "QUOTE" },
    data: { status: "BOUND", boundAt: new Date() },
  });
  if (count === 0) {
    redirect(`/policies/${id}?toastError=${encodeURIComponent("Only a quote can be bound")}`);
  }
  await audit({ userId: session.userId, action: "POLICY_BIND", entityType: "Policy", entityId: id });
  redirect(`/policies/${id}?toast=${encodeURIComponent("Policy bound")}`);
}

export async function activatePolicy(id: string) {
  const session = await requireSession();
  // Activate a bound policy → ACTIVE. Only a BOUND policy may be activated.
  const { count } = await prisma.policy.updateMany({
    where: { id, status: "BOUND" },
    data: { status: "ACTIVE" },
  });
  if (count === 0) {
    redirect(`/policies/${id}?toastError=${encodeURIComponent("Only a bound policy can be activated")}`);
  }
  await audit({ userId: session.userId, action: "POLICY_ACTIVATE", entityType: "Policy", entityId: id });
  redirect(`/policies/${id}?toast=${encodeURIComponent("Policy active")}`);
}

export async function cancelPolicy(id: string, formData: FormData) {
  const session = await requireSession();
  const policy = await prisma.policy.findUnique({ where: { id } });
  if (!policy) redirect(`/policies?toastError=${encodeURIComponent("Policy not found")}`);
  const cancelDate = fDate(formData, "cancelledAt") ?? new Date();
  const reason = fStr(formData, "cancellationReason") || "Not specified";
  const method = fStr(formData, "method"); // PRO_RATA | SHORT_RATE
  const premium = toNum(policy.premium);
  const returned =
    method === "SHORT_RATE"
      ? shortRateReturn(premium, policy.effectiveDate, policy.expirationDate, cancelDate)
      : proRataReturn(premium, policy.effectiveDate, policy.expirationDate, cancelDate);
  await prisma.policy.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: cancelDate, cancellationReason: `${reason} (${method === "SHORT_RATE" ? "short-rate" : "pro-rata"} return ≈ $${returned.toFixed(2)})` },
  });
  await audit({ userId: session.userId, action: "POLICY_CANCEL", entityType: "Policy", entityId: id, detail: reason });
  // A kind save-attempt outreach when a policy is cancelled (needs approval).
  await scheduleTouchpoint("cancel-ack-save", policy!.clientId, { related: { type: "Policy", id }, anchorKey: `cancel:${id}` });
  redirect(`/policies/${id}?toast=${encodeURIComponent(`Policy cancelled — return premium ≈ $${returned.toFixed(2)}`)}`);
}

export async function nonRenewPolicy(id: string) {
  const session = await requireSession();
  // Non-renew an in-force / expiring term. A QUOTE, an already-CANCELLED,
  // already-NON_RENEWED, or already-RENEWED term can't be non-renewed.
  const { count } = await prisma.policy.updateMany({
    where: { id, status: { in: ["BOUND", "ACTIVE", "EXPIRED"] } },
    data: { status: "NON_RENEWED" },
  });
  if (count === 0) {
    redirect(`/policies/${id}?toastError=${encodeURIComponent("Only an in-force or expired policy can be marked non-renewed")}`);
  }
  await audit({ userId: session.userId, action: "POLICY_NON_RENEW", entityType: "Policy", entityId: id });
  redirect(`/policies/${id}?toast=${encodeURIComponent("Marked non-renewed")}`);
}

export async function addEndorsement(policyId: string, formData: FormData) {
  await requireSession();
  const policy = await prisma.policy.findUnique({ where: { id: policyId } });
  if (!policy) redirect(`/policies?toastError=${encodeURIComponent("Policy not found")}`);
  // Only an in-force term (BOUND/ACTIVE/RENEWED) can be endorsed — never a
  // quote, cancelled, expired, or non-renewed term.
  if (!ENDORSABLE_STATUSES.includes(policy.status)) {
    redirect(`/policies/${policyId}?toastError=${encodeURIComponent("Endorsements require a bound, active, or renewed policy")}`);
  }
  const effectiveDate = fDate(formData, "effectiveDate") ?? new Date();
  const annualized = fNum(formData, "premiumChange");
  const prorated = prorateEndorsement(annualized, policy.effectiveDate, policy.expirationDate, effectiveDate);
  const newPremium = roundMoney(toNum(policy.premium) + prorated);
  await prisma.$transaction([
    prisma.endorsement.create({
      data: {
        policyId,
        effectiveDate,
        description: fStr(formData, "description") || "Endorsement",
        premiumChange: prorated,
      },
    }),
    prisma.policy.update({
      where: { id: policyId },
      data: {
        premium: newPremium,
        commissionAmount: expectedCommission(newPremium, toNum(policy.commissionRatePct)),
      },
    }),
  ]);
  revalidatePath(`/policies/${policyId}`);
  redirect(`/policies/${policyId}?toast=${encodeURIComponent(`Endorsement added (prorated $${prorated.toFixed(2)})`)}`);
}

/** Replace the policy's producer splits. Percentages must sum to 100. */
export async function setSplits(policyId: string, formData: FormData) {
  await requireSession();
  const splits: Array<{ producerId: string; pct: number }> = [];
  for (let i = 0; i < 4; i++) {
    const producerId = fStr(formData, `producerId${i}`);
    const pct = fNum(formData, `pct${i}`);
    if (producerId && pct > 0) splits.push({ producerId, pct });
  }
  if (!validateSplits(splits)) {
    redirect(`/policies/${policyId}?toastError=${encodeURIComponent("Split percentages must be >0 and sum to exactly 100")}`);
  }
  await prisma.$transaction([
    prisma.policyProducerSplit.deleteMany({ where: { policyId } }),
    prisma.policyProducerSplit.createMany({ data: splits.map((s) => ({ policyId, ...s })) }),
  ]);
  revalidatePath(`/policies/${policyId}`);
  redirect(`/policies/${policyId}?toast=${encodeURIComponent("Producer splits updated")}`);
}

/**
 * Renew a policy: create the next-term policy chained via renewalOf,
 * mark the old term RENEWED, and complete any renewal record.
 */
export async function renewPolicy(id: string, formData: FormData) {
  const session = await requireSession();
  const policy = await prisma.policy.findUnique({ where: { id } });
  if (!policy) redirect(`/policies?toastError=${encodeURIComponent("Policy not found")}`);
  const premium = fNum(formData, "premium") || toNum(policy.premium);
  const ratePct = fNum(formData, "commissionRatePct") || toNum(policy.commissionRatePct);
  const newNumber = fStr(formData, "policyNumber") || `${policy.policyNumber}-R`;

  const exists = await prisma.policy.findUnique({ where: { policyNumber: newNumber } });
  if (exists) {
    redirect(`/policies/${id}?toastError=${encodeURIComponent(`Policy number ${newNumber} already exists`)}`);
  }

  const renewal = await prisma.policy.create({
    data: {
      policyNumber: newNumber,
      clientId: policy.clientId,
      carrierId: policy.carrierId,
      mga: policy.mga,
      lineOfBusiness: policy.lineOfBusiness,
      status: "ACTIVE",
      billingType: policy.billingType,
      premium,
      commissionRatePct: ratePct,
      commissionAmount: expectedCommission(premium, ratePct),
      isNewBusiness: false,
      effectiveDate: policy.expirationDate,
      expirationDate: addYears(policy.expirationDate, 1),
      boundAt: new Date(),
      producerId: policy.producerId,
      csrId: policy.csrId,
      renewalOfId: policy.id,
    },
  });
  await prisma.policyProducerSplit.create({ data: { policyId: renewal.id, producerId: policy.producerId, pct: 100 } });
  await prisma.policy.update({ where: { id }, data: { status: "RENEWED" } });
  await prisma.renewal.updateMany({
    where: { policyId: id, status: { notIn: ["RENEWED", "LOST"] } },
    data: { status: "RENEWED" },
  });
  await audit({ userId: session.userId, action: "POLICY_RENEW", entityType: "Policy", entityId: id, detail: `→ ${renewal.policyNumber}` });
  redirect(`/policies/${renewal.id}?toast=${encodeURIComponent(`Renewed as ${renewal.policyNumber}`)}`);
}

// ── Reinstatement (Wave B) ───────────────────────────────────────────

/**
 * Reinstate a CANCELLED policy back to ACTIVE within the carrier window.
 * Records a Reinstatement row (lapse + handling note) and audits it.
 */
export async function reinstatePolicy(id: string, formData: FormData) {
  const session = await requireSession();
  const policy = await prisma.policy.findUnique({ where: { id } });
  if (!policy) redirect(`/policies?toastError=${encodeURIComponent("Policy not found")}`);

  const eligibility = reinstatementEligibility({
    status: policy.status,
    cancelledAt: policy.cancelledAt,
    expirationDate: policy.expirationDate,
  });
  if (!eligibility.eligible) {
    redirect(`/policies/${id}?toastError=${encodeURIComponent(`Cannot reinstate — ${eligibility.reason}`)}`);
  }

  const reason = fStr(formData, "reason") || "Reinstated per carrier";
  const lapseDays = eligibility.lapseDays ?? 0;
  const handling = fStrOpt(formData, "lapseHandling") ?? lapseHandlingNote(lapseDays);

  await prisma.$transaction([
    prisma.policy.update({
      where: { id },
      data: { status: "ACTIVE", cancelledAt: null, cancellationReason: null },
    }),
    prisma.reinstatement.create({
      data: {
        policyId: id,
        cancelledAt: policy.cancelledAt!,
        reinstatedAt: new Date(),
        lapseDays,
        reason,
        lapseHandling: handling,
        reinstatedById: session.userId,
      },
    }),
  ]);
  await audit({
    userId: session.userId,
    action: "POLICY_REINSTATE",
    entityType: "Policy",
    entityId: id,
    detail: `${reason} (lapse ${lapseDays}d)`,
  });
  redirect(`/policies/${id}?toast=${encodeURIComponent(`Policy reinstated${lapseDays > 0 ? ` — ${lapseDays}-day lapse recorded` : " — no lapse"}`)}`);
}

// ── Structured endorsement requests (Wave B) ─────────────────────────

const ER_TYPES: EndorsementRequestType[] = [
  "ADD_VEHICLE", "REMOVE_VEHICLE", "ADD_DRIVER", "REMOVE_DRIVER", "CHANGE_LIMIT",
  "ADD_LIENHOLDER", "REMOVE_LIENHOLDER", "ADDRESS_CHANGE", "ADD_COVERAGE", "REMOVE_COVERAGE", "OTHER",
];
const ER_STATUSES: EndorsementRequestStatus[] = [
  "REQUESTED", "IN_REVIEW", "SUBMITTED_TO_CARRIER", "COMPLETED", "DECLINED",
];

/** Staff creates a structured endorsement request on a policy. */
export async function createEndorsementRequest(policyId: string, formData: FormData) {
  const session = await requireSession();
  const policy = await prisma.policy.findUnique({ where: { id: policyId }, select: { id: true } });
  if (!policy) redirect(`/policies?toastError=${encodeURIComponent("Policy not found")}`);
  const summary = fStr(formData, "summary");
  if (!summary) {
    redirect(`/policies/${policyId}?toastError=${encodeURIComponent("Describe the requested change")}#endorsement-requests`);
  }
  const req = await prisma.endorsementRequest.create({
    data: {
      policyId,
      requestType: fEnum(formData, "requestType", ER_TYPES, "OTHER"),
      summary,
      effectiveDate: fDate(formData, "effectiveDate"),
      notes: fStrOpt(formData, "notes"),
      source: "STAFF",
      status: "REQUESTED",
      requestedById: session.userId,
    },
  });
  await audit({ userId: session.userId, action: "ENDORSEMENT_REQUEST_CREATE", entityType: "EndorsementRequest", entityId: req.id, detail: summary });
  redirect(`/policies/${policyId}?toast=${encodeURIComponent("Endorsement request logged")}#endorsement-requests`);
}

/** Move an endorsement request along its workflow (review / submit / decline). */
export async function setEndorsementRequestStatus(requestId: string, formData: FormData) {
  const session = await requireSession();
  const status = fEnum(formData, "status", ER_STATUSES, "IN_REVIEW");
  const req = await prisma.endorsementRequest.findUnique({ where: { id: requestId }, select: { id: true, policyId: true } });
  if (!req) redirect(`/policies?toastError=${encodeURIComponent("Request not found")}`);
  await prisma.endorsementRequest.update({
    where: { id: requestId },
    data: {
      status,
      processedById: session.userId,
      declineReason: status === "DECLINED" ? fStrOpt(formData, "declineReason") : null,
    },
  });
  await audit({ userId: session.userId, action: "ENDORSEMENT_REQUEST_STATUS", entityType: "EndorsementRequest", entityId: requestId, detail: status });
  redirect(`/policies/${req.policyId}?toast=${encodeURIComponent("Request updated")}#endorsement-requests`);
}

/**
 * Process an endorsement request → spawn the realized Endorsement (reuse
 * the prorated-premium endorsement path), link it back, and mark the
 * request COMPLETED.
 */
export async function processEndorsementRequest(requestId: string, formData: FormData) {
  const session = await requireSession();
  const req = await prisma.endorsementRequest.findUnique({
    where: { id: requestId },
    include: { policy: true },
  });
  if (!req) redirect(`/policies?toastError=${encodeURIComponent("Request not found")}`);
  const policy = req.policy;
  // Processing an endorsement request realizes an Endorsement + bumps premium —
  // only valid against an in-force term.
  if (!ENDORSABLE_STATUSES.includes(policy.status)) {
    redirect(`/policies/${policy.id}?toastError=${encodeURIComponent("Endorsements require a bound, active, or renewed policy")}#endorsement-requests`);
  }
  const effectiveDate = fDate(formData, "effectiveDate") ?? req.effectiveDate ?? new Date();
  const annualized = fNum(formData, "premiumChange");
  const description = fStr(formData, "description") || req.summary;
  const prorated = prorateEndorsement(annualized, policy.effectiveDate, policy.expirationDate, effectiveDate);
  const newPremium = roundMoney(toNum(policy.premium) + prorated);

  const endorsement = await prisma.endorsement.create({
    data: { policyId: policy.id, effectiveDate, description, premiumChange: prorated },
  });
  await prisma.$transaction([
    prisma.policy.update({
      where: { id: policy.id },
      data: { premium: newPremium, commissionAmount: expectedCommission(newPremium, toNum(policy.commissionRatePct)) },
    }),
    prisma.endorsementRequest.update({
      where: { id: requestId },
      data: { status: "COMPLETED", processedById: session.userId, endorsementId: endorsement.id, effectiveDate },
    }),
  ]);
  await audit({ userId: session.userId, action: "ENDORSEMENT_REQUEST_PROCESS", entityType: "EndorsementRequest", entityId: requestId, detail: description });
  revalidatePath(`/policies/${policy.id}`);
  redirect(`/policies/${policy.id}?toast=${encodeURIComponent(`Endorsement applied (prorated $${prorated.toFixed(2)})`)}#endorsement-requests`);
}
