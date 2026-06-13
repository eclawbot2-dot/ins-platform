/**
 * Seed — realistic demo agency so every page renders meaningful data.
 *
 *   npm run db:seed   (or npm run setup)
 *
 * Wipes and re-creates all rows (dev-only data). Logins:
 *   staff admin:   ericbbowman2@gmail.com / Ins2026!
 *   client portal: client@taboragency.com / Client2026!
 */

import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient, type LineOfBusiness, type PolicyStatus, type TouchpointCategory as TouchpointCategoryT, type TouchpointTrigger as TouchpointTriggerT } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

// ── Date helpers (UTC, relative to "today") ──────────────────────────

const TODAY = new Date();
function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}
function daysFromNow(days: number): Date {
  return new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), TODAY.getUTCDate() + days));
}
function monthsAgo(months: number, day = 15): Date {
  return new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth() - months, day));
}
function addYearsUtc(d: Date, years: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate()));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function main() {
  console.log("Seeding ins-platform…");

  // ── Wipe (dependency order) ────────────────────────────────────────
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.portalInvite.deleteMany(),
    prisma.syncCursor.deleteMany(),
    prisma.syncJob.deleteMany(),
    prisma.integrationConnection.deleteMany(),
    prisma.document.deleteMany(),
    prisma.certificateCoverage.deleteMany(),
    prisma.certificate.deleteMany(),
    prisma.certificateHolder.deleteMany(),
    prisma.commissionStatementLine.deleteMany(),
    prisma.commissionStatement.deleteMany(),
    prisma.invoiceLine.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.ceCredit.deleteMany(),
    prisma.license.deleteMany(),
    prisma.eoPolicy.deleteMany(),
    prisma.referral.deleteMany(),
    prisma.task.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.claim.deleteMany(),
    prisma.renewal.deleteMany(),
    prisma.quote.deleteMany(),
    prisma.quoteRequest.deleteMany(),
    prisma.opportunity.deleteMany(),
    prisma.policyProducerSplit.deleteMany(),
    prisma.endorsement.deleteMany(),
    // Wave A: coverage + risk items + X-dates (cascade on policy/client,
    // but deleted explicitly so the wipe is order-independent).
    prisma.coverage.deleteMany(),
    prisma.vehicle.deleteMany(),
    prisma.driver.deleteMany(),
    prisma.dwelling.deleteMany(),
    prisma.scheduledItem.deleteMany(),
    prisma.watercraft.deleteMany(),
    prisma.insuredLocation.deleteMany(),
    prisma.priorPolicy.deleteMany(),
    // Wave D-final.
    prisma.surplusLinesFiling.deleteMany(),
    prisma.signatureRequest.deleteMany(),
    prisma.groupPlan.deleteMany(),
    prisma.carrierAppetiteRow.deleteMany(),
    prisma.policy.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.campaign.deleteMany(),
    prisma.scheduledTouchpoint.deleteMany(),
    prisma.touchpointTemplate.deleteMany(),
    prisma.clientCommunicationPreferences.deleteMany(),
    prisma.contact.deleteMany(),
    prisma.client.deleteMany(),
    prisma.household.deleteMany(),
    prisma.commissionSchedule.deleteMany(),
    prisma.carrierContact.deleteMany(),
    prisma.carrier.deleteMany(),
    prisma.leadIntakeKey.deleteMany(),
    prisma.emailTemplate.deleteMany(),
    prisma.workspaceConnection.deleteMany(),
    prisma.agencyProfile.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // ── Users ──────────────────────────────────────────────────────────
  const pw = await bcrypt.hash("Ins2026!", 12);
  const [eric, sarah, james, dana, molly] = await Promise.all([
    prisma.user.create({
      data: { email: "ericbbowman2@gmail.com", name: "Eric Bowman", password: pw, role: "ADMIN", npn: "18223344", phone: "843-555-0100" },
    }),
    prisma.user.create({
      data: { email: "sarah@ins.jahdev.com", name: "Sarah Mitchell", password: pw, role: "PRODUCER", npn: "17665522", phone: "843-555-0101", defaultSplitPct: 100 },
    }),
    prisma.user.create({
      data: { email: "james@ins.jahdev.com", name: "James Carter", password: pw, role: "PRODUCER", npn: "19884411", phone: "843-555-0102", defaultSplitPct: 100 },
    }),
    prisma.user.create({
      data: { email: "dana@ins.jahdev.com", name: "Dana Reyes", password: pw, role: "PRODUCER", npn: "20119876", phone: "843-555-0103", defaultSplitPct: 100 },
    }),
    prisma.user.create({
      data: { email: "molly@ins.jahdev.com", name: "Molly Tran", password: pw, role: "CSR", phone: "843-555-0104" },
    }),
  ]);
  const producers = [sarah, james, dana];

  // ── Agency profile + templates + intake key + workspace ───────────
  await prisma.agencyProfile.create({
    data: {
      id: "agency",
      name: "Tabor Agency",
      addressLine1: "1310 Meeting Street, Suite 200",
      city: "Charleston",
      state: "SC",
      zip: "29405",
      phone: "843-555-0100",
      email: "office@taboragency.com",
      website: "https://taboragency.com",
      licenseNumber: "SC-AGY-204477",
    },
  });
  await prisma.emailTemplate.createMany({
    data: [
      {
        key: "renewal-notice",
        name: "Renewal notice",
        subject: "Your {{lineOfBusiness}} policy renews on {{expirationDate}}",
        body: "Hi {{clientName}},\n\nYour policy {{policyNumber}} with {{carrierName}} is coming up for renewal on {{expirationDate}}. We are reviewing the market to make sure you have the best fit.\n\n— {{producerName}}, Tabor Agency",
      },
      {
        key: "new-client-welcome",
        name: "New client welcome",
        subject: "Welcome to Tabor Agency",
        body: "Hi {{clientName}},\n\nThanks for trusting us with your insurance. Your service team is {{producerName}} (producer) and {{csrName}} (account manager).\n\n— Tabor Agency",
      },
      {
        key: "coi-delivery",
        name: "Certificate delivery",
        subject: "Certificate of insurance {{certNumber}}",
        body: "Attached is certificate {{certNumber}} for {{holderName}}.\n\n— Tabor Agency",
      },
    ],
  });
  await prisma.leadIntakeKey.create({
    data: { label: "ins-website-sandy.vercel.app", key: "ins_lk_demo_website_key_2026", active: true, lastUsedAt: daysFromNow(-2) },
  });
  await prisma.workspaceConnection.create({
    data: { id: "workspace", enabled: false, subject: null, domain: null },
  });

  // ── Carriers (12) + schedules ──────────────────────────────────────
  type CarrierSpec = {
    name: string;
    naic: string;
    amBest: string;
    portal: string;
    phone: string;
    appt: "APPOINTED" | "PENDING" | "NOT_APPOINTED";
    apptExpires?: Date;
    lobs: Array<[LineOfBusiness, number, number]>; // lob, new %, renewal %
  };
  const carrierSpecs: CarrierSpec[] = [
    { name: "Progressive", naic: "24260", amBest: "A+", portal: "https://foragentsonly.com", phone: "800-776-4737", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 1), lobs: [["AUTO", 12, 10], ["HOME", 13, 11], ["RENTERS", 12, 10], ["COMMERCIAL_AUTO", 14, 12], ["MOTORCYCLE", 13, 11], ["BOAT", 13, 11], ["RV", 13, 11]] },
    { name: "Travelers", naic: "25658", amBest: "A++", portal: "https://agenthq.travelers.com", phone: "800-842-5075", appt: "APPOINTED", apptExpires: daysFromNow(38), lobs: [["AUTO", 12, 10], ["HOME", 14, 12], ["CONDO", 14, 12], ["BOP", 16, 14], ["GENERAL_LIABILITY", 15, 13], ["UMBRELLA", 12, 10], ["COMMERCIAL_UMBRELLA", 13, 11], ["WORKERS_COMP", 10, 9], ["FLOOD", 12, 12]] },
    { name: "Hartford", naic: "19682", amBest: "A+", portal: "https://eba.thehartford.com", phone: "860-547-5000", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 1), lobs: [["BOP", 17, 15], ["WORKERS_COMP", 11, 9], ["GENERAL_LIABILITY", 15, 13], ["COMMERCIAL_PROPERTY", 16, 14]] },
    { name: "Liberty Mutual", naic: "23043", amBest: "A", portal: "https://agentsolutions.libertymutual.com", phone: "800-225-2467", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 2), lobs: [["AUTO", 11, 9], ["HOME", 13, 11], ["COMMERCIAL_AUTO", 14, 12]] },
    { name: "Chubb", naic: "20281", amBest: "A++", portal: "https://agents.chubb.com", phone: "800-252-4670", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 1), lobs: [["HOME", 15, 13], ["UMBRELLA", 13, 11], ["CYBER", 18, 16], ["PROFESSIONAL", 17, 15], ["VALUABLE_ARTICLES", 16, 14], ["DIRECTORS_OFFICERS", 17, 15], ["EPLI", 16, 14]] },
    { name: "Nationwide", naic: "23787", amBest: "A", portal: "https://agentcenter.nationwide.com", phone: "877-669-6877", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 1), lobs: [["AUTO", 12, 10], ["HOME", 13, 11], ["LIFE", 40, 5], ["BOP", 16, 14]] },
    { name: "Safeco", naic: "39012", amBest: "A", portal: "https://now.safeco.com", phone: "800-332-3226", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 2), lobs: [["AUTO", 12, 10], ["HOME", 13, 11], ["UMBRELLA", 12, 10], ["RENTERS", 12, 10]] },
    { name: "Hanover", naic: "22292", amBest: "A", portal: "https://tap.hanover.com", phone: "800-922-8427", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 1), lobs: [["BOP", 16, 14], ["COMMERCIAL_PROPERTY", 16, 14], ["INLAND_MARINE", 15, 13], ["BUILDERS_RISK", 16, 14], ["LIQUOR_LIABILITY", 16, 14]] },
    { name: "CNA", naic: "20443", amBest: "A", portal: "https://agent.cna.com", phone: "800-262-2000", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 1), lobs: [["GENERAL_LIABILITY", 15, 13], ["WORKERS_COMP", 10, 9], ["PROFESSIONAL", 17, 15]] },
    { name: "Berkshire GUARD", naic: "42390", amBest: "A+", portal: "https://www.guard.com/agents", phone: "800-673-2465", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 2), lobs: [["WORKERS_COMP", 11, 10], ["BOP", 15, 13]] },
    { name: "Hiscox", naic: "10200", amBest: "A", portal: "https://partner.hiscox.com", phone: "866-283-7545", appt: "PENDING", lobs: [["PROFESSIONAL", 18, 16], ["ERRORS_OMISSIONS", 18, 16], ["CYBER", 18, 16], ["GENERAL_LIABILITY", 15, 13]] },
    { name: "Foremost", naic: "11185", amBest: "A", portal: "https://foremoststar.com", phone: "800-527-3905", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 1), lobs: [["HOME", 13, 11], ["CONDO", 13, 11], ["RENTERS", 12, 10], ["INLAND_MARINE", 14, 12], ["MOTORCYCLE", 13, 11], ["RV", 13, 11], ["BOAT", 13, 11]] },
  ];
  const carriers: Record<string, { id: string }> = {};
  for (const spec of carrierSpecs) {
    const carrier = await prisma.carrier.create({
      data: {
        name: spec.name,
        naicCode: spec.naic,
        amBestRating: spec.amBest,
        portalUrl: spec.portal,
        phone: spec.phone,
        paymentTermsDays: 30,
        appointmentStatus: spec.appt,
        appointedAt: spec.appt === "APPOINTED" ? addYearsUtc(TODAY, -3) : null,
        appointmentExpiresAt: spec.apptExpires ?? null,
        schedules: { create: spec.lobs.map(([lob, n, r]) => ({ lineOfBusiness: lob, newPct: n, renewalPct: r })) },
        contacts: {
          create: [{ name: `${spec.name} Marketing Rep`, role: "Territory manager", email: `rep@${spec.name.toLowerCase().replace(/[^a-z]/g, "")}.example.com`, phone: spec.phone }],
        },
      },
    });
    carriers[spec.name] = carrier;
  }

  // ── Campaigns ──────────────────────────────────────────────────────
  const [campMail, campSearch, campReferral] = await Promise.all([
    prisma.campaign.create({
      data: { name: "Spring homeowner mailers", channel: "DIRECT_MAIL", budget: 2500, startDate: monthsAgo(3, 1), endDate: monthsAgo(1, 30), notes: "5k postcards, Mt Pleasant + Daniel Island" },
    }),
    prisma.campaign.create({
      data: { name: "Google Local Services", channel: "PAID_SEARCH", budget: 1800, startDate: monthsAgo(5, 1), notes: "Always-on LSA budget" },
    }),
    prisma.campaign.create({
      data: { name: "Client referral program", channel: "REFERRAL", budget: 1000, startDate: monthsAgo(11, 1), notes: "$50 gift card per bound referral" },
    }),
  ]);

  // ── Clients (25) ───────────────────────────────────────────────────
  type ClientSpec = {
    name: string;
    type: "INDIVIDUAL" | "BUSINESS";
    status?: "PROSPECT" | "ACTIVE" | "INACTIVE" | "FORMER";
    email: string;
    city: string;
    industry?: string;
    source?: string;
    producer: typeof sarah;
  };
  const clientSpecs: ClientSpec[] = [
    { name: "Walter & Janet Simmons", type: "INDIVIDUAL", email: "wsimmons@example.com", city: "Charleston", source: "referral", producer: sarah },
    { name: "Harborview Builders LLC", type: "BUSINESS", email: "office@harborviewbuilders.example.com", city: "Mount Pleasant", industry: "Construction", source: "referral", producer: james },
    { name: "Maria Gonzalez", type: "INDIVIDUAL", email: "mgonzalez@example.com", city: "North Charleston", source: "website", producer: sarah },
    { name: "Palmetto Coffee Roasters", type: "BUSINESS", email: "hello@palmettocoffee.example.com", city: "Charleston", industry: "Food & Beverage", source: "website", producer: dana },
    { name: "David Chen", type: "INDIVIDUAL", email: "dchen@example.com", city: "Summerville", source: "paid search", producer: james },
    { name: "Seaside Property Management", type: "BUSINESS", email: "admin@seasidepm.example.com", city: "Isle of Palms", industry: "Real Estate", source: "referral", producer: sarah },
    { name: "Angela Whitfield", type: "INDIVIDUAL", email: "awhitfield@example.com", city: "Charleston", source: "website", producer: dana },
    { name: "Coastal HVAC Services", type: "BUSINESS", email: "dispatch@coastalhvac.example.com", city: "North Charleston", industry: "Trades", source: "cold call", producer: james },
    { name: "Robert & Lisa Patel", type: "INDIVIDUAL", email: "rpatel@example.com", city: "Daniel Island", source: "referral", producer: sarah },
    { name: "Battery Row Bistro", type: "BUSINESS", email: "gm@batteryrow.example.com", city: "Charleston", industry: "Restaurant", source: "event", producer: dana },
    { name: "Thomas Nguyen", type: "INDIVIDUAL", email: "tnguyen@example.com", city: "Goose Creek", source: "paid search", producer: james },
    { name: "Ashley River Dental", type: "BUSINESS", email: "frontdesk@ashleyriverdental.example.com", city: "West Ashley", industry: "Healthcare", source: "referral", producer: sarah },
    { name: "Brianna Scott", type: "INDIVIDUAL", email: "bscott@example.com", city: "James Island", source: "social", producer: dana },
    { name: "Lowtide Charters", type: "BUSINESS", email: "captain@lowtidecharters.example.com", city: "Folly Beach", industry: "Marine Tourism", source: "website", producer: james },
    { name: "Kevin O'Malley", type: "INDIVIDUAL", email: "komalley@example.com", city: "Mount Pleasant", source: "referral", producer: sarah },
    { name: "Charleston Tech Collective", type: "BUSINESS", email: "ops@chstechcollective.example.com", city: "Charleston", industry: "Technology", source: "website", producer: dana },
    { name: "Sandra Kim", type: "INDIVIDUAL", email: "skim@example.com", city: "Summerville", source: "direct mail", producer: james },
    { name: "Magnolia Landscaping Co", type: "BUSINESS", email: "office@magnolialandscape.example.com", city: "Johns Island", industry: "Landscaping", source: "cold call", producer: james },
    { name: "Frank DiNapoli", type: "INDIVIDUAL", email: "fdinapoli@example.com", city: "Charleston", source: "website", producer: sarah },
    { name: "Wando River Logistics", type: "BUSINESS", email: "fleet@wandologistics.example.com", city: "Hanahan", industry: "Transportation", source: "referral", producer: dana },
    { name: "Grace Thompson", type: "INDIVIDUAL", status: "PROSPECT", email: "gthompson@example.com", city: "Charleston", source: "website", producer: sarah },
    { name: "Old Village Books", type: "BUSINESS", status: "PROSPECT", email: "shop@oldvillagebooks.example.com", city: "Mount Pleasant", industry: "Retail", source: "event", producer: dana },
    { name: "Marcus Bell", type: "INDIVIDUAL", status: "FORMER", email: "mbell@example.com", city: "North Charleston", source: "paid search", producer: james },
    { name: "Pinckney Street Yoga", type: "BUSINESS", email: "studio@pinckneyyoga.example.com", city: "Charleston", industry: "Fitness", source: "social", producer: sarah },
    { name: "Henry & Doris Calhoun", type: "INDIVIDUAL", email: "hcalhoun@example.com", city: "West Ashley", source: "referral", producer: dana },
  ];
  const clients: Array<{ id: string; name: string }> = [];
  for (const [i, spec] of clientSpecs.entries()) {
    const isBiz = spec.type === "BUSINESS";
    const client = await prisma.client.create({
      data: {
        type: spec.type,
        status: spec.status ?? "ACTIVE",
        name: spec.name,
        businessName: isBiz ? spec.name : null,
        firstName: isBiz ? null : spec.name.split(" ")[0],
        lastName: isBiz ? null : spec.name.split(" ").slice(-1)[0],
        email: spec.email,
        phone: `843-555-0${String(200 + i)}`,
        addressLine1: `${100 + i * 7} ${["King St", "Meeting St", "Coleman Blvd", "Rivers Ave", "Maybank Hwy"][i % 5]}`,
        city: spec.city,
        state: "SC",
        zip: ["29401", "29464", "29405", "29412", "29455"][i % 5],
        industry: spec.industry,
        source: spec.source,
        producerId: spec.producer.id,
        csrId: molly.id,
        contacts: isBiz
          ? { create: [{ name: `${spec.name.split(" ")[0]} Office Manager`, title: "Office manager", email: spec.email, isPrimary: true }] }
          : undefined,
      },
    });
    clients.push(client);
  }

  // ── Lifecycle touchpoint demo data ─────────────────────────────────
  // A preferredName + DOB on a couple of individuals so birthday and 360
  // timeline salutations render warmly.
  await prisma.client.update({
    where: { id: clients[0]!.id }, // Walter & Janet Simmons
    data: { preferredName: "Walt", dateOfBirth: new Date(Date.UTC(1962, 5, 14)) },
  });
  await prisma.client.update({
    where: { id: clients[8]!.id }, // Robert & Lisa Patel
    data: { preferredName: "Rob", dateOfBirth: new Date(Date.UTC(1979, 2, 3)) },
  });

  // ── Client-portal demo login ───────────────────────────────────────
  // Linked to Harborview Builders LLC (clients[1]) — that client has
  // policies, claims, invoices and documents, so /portal renders fully.
  const pwClient = await bcrypt.hash("Client2026!", 12);
  await prisma.user.create({
    data: {
      email: "client@taboragency.com",
      name: "Harborview Builders LLC",
      password: pwClient,
      role: "CLIENT",
      clientId: clients[1]!.id,
      phone: "843-555-0201",
    },
  });

  // ── Policies (40) ──────────────────────────────────────────────────
  // [clientIdx, carrier, lob, premium, status, effMonthsAgo, isNew, billing, producer]
  type PolicySpec = [number, string, LineOfBusiness, number, PolicyStatus, number, boolean, "AGENCY_BILL" | "DIRECT_BILL", typeof sarah];
  const policySpecs: PolicySpec[] = [
    // Active personal lines, staggered effective dates (trend) + X-dates
    [0, "Travelers", "HOME", 2850, "ACTIVE", 9, false, "DIRECT_BILL", sarah],
    [0, "Progressive", "AUTO", 1980, "ACTIVE", 9, false, "DIRECT_BILL", sarah],
    [2, "Safeco", "AUTO", 1540, "ACTIVE", 2, true, "DIRECT_BILL", sarah],
    [2, "Safeco", "RENTERS", 280, "ACTIVE", 2, true, "DIRECT_BILL", sarah],
    [4, "Liberty Mutual", "AUTO", 2210, "ACTIVE", 4, true, "DIRECT_BILL", james],
    [6, "Chubb", "HOME", 4400, "ACTIVE", 11, false, "DIRECT_BILL", dana],
    [6, "Chubb", "UMBRELLA", 620, "ACTIVE", 11, false, "DIRECT_BILL", dana],
    [8, "Travelers", "HOME", 3150, "ACTIVE", 1, true, "DIRECT_BILL", sarah],
    [8, "Travelers", "AUTO", 2050, "ACTIVE", 1, true, "DIRECT_BILL", sarah],
    [10, "Nationwide", "AUTO", 1720, "ACTIVE", 6, true, "DIRECT_BILL", james],
    [12, "Foremost", "RENTERS", 310, "ACTIVE", 3, true, "DIRECT_BILL", dana],
    [14, "Safeco", "HOME", 2660, "ACTIVE", 7, false, "DIRECT_BILL", sarah],
    [14, "Safeco", "UMBRELLA", 540, "ACTIVE", 7, false, "DIRECT_BILL", sarah],
    [16, "Nationwide", "AUTO", 1610, "ACTIVE", 5, true, "DIRECT_BILL", james],
    [16, "Nationwide", "LIFE", 1200, "ACTIVE", 5, true, "DIRECT_BILL", james],
    [18, "Progressive", "AUTO", 1890, "ACTIVE", 10, false, "DIRECT_BILL", sarah],
    [24, "Travelers", "HOME", 2980, "ACTIVE", 8, false, "DIRECT_BILL", dana],
    [24, "Travelers", "UMBRELLA", 480, "ACTIVE", 8, false, "DIRECT_BILL", dana],
    // Commercial book
    [1, "Hartford", "GENERAL_LIABILITY", 9800, "ACTIVE", 4, false, "AGENCY_BILL", james],
    [1, "Berkshire GUARD", "WORKERS_COMP", 14200, "ACTIVE", 4, false, "AGENCY_BILL", james],
    [1, "Progressive", "COMMERCIAL_AUTO", 7600, "ACTIVE", 4, false, "AGENCY_BILL", james],
    [3, "Hartford", "BOP", 3400, "ACTIVE", 6, true, "AGENCY_BILL", dana],
    [3, "Berkshire GUARD", "WORKERS_COMP", 4100, "ACTIVE", 6, true, "AGENCY_BILL", dana],
    [5, "Hanover", "COMMERCIAL_PROPERTY", 11800, "ACTIVE", 2, false, "AGENCY_BILL", sarah],
    [5, "Travelers", "GENERAL_LIABILITY", 5200, "ACTIVE", 2, false, "AGENCY_BILL", sarah],
    [7, "CNA", "GENERAL_LIABILITY", 4700, "ACTIVE", 5, true, "AGENCY_BILL", james],
    [7, "Berkshire GUARD", "WORKERS_COMP", 8900, "ACTIVE", 5, true, "AGENCY_BILL", james],
    [9, "Hartford", "BOP", 5300, "ACTIVE", 3, false, "AGENCY_BILL", dana],
    [11, "CNA", "PROFESSIONAL", 6100, "ACTIVE", 7, false, "AGENCY_BILL", sarah],
    [11, "Chubb", "CYBER", 2300, "ACTIVE", 7, true, "DIRECT_BILL", sarah],
    [13, "Hanover", "INLAND_MARINE", 3900, "ACTIVE", 1, true, "AGENCY_BILL", james],
    [15, "Hiscox", "PROFESSIONAL", 2800, "ACTIVE", 0, true, "DIRECT_BILL", dana],
    [15, "Chubb", "CYBER", 1900, "BOUND", 0, true, "DIRECT_BILL", dana],
    [17, "Travelers", "BOP", 2700, "ACTIVE", 9, false, "AGENCY_BILL", james],
    [19, "Progressive", "COMMERCIAL_AUTO", 16800, "ACTIVE", 2, false, "AGENCY_BILL", dana],
    [23, "Nationwide", "BOP", 1950, "ACTIVE", 4, true, "AGENCY_BILL", sarah],
  ];

  const lobPrefix: Partial<Record<LineOfBusiness, string>> = {
    AUTO: "PA", HOME: "HO", RENTERS: "RT", UMBRELLA: "UM", LIFE: "LF",
    GENERAL_LIABILITY: "GL", COMMERCIAL_PROPERTY: "CP", BOP: "BP",
    WORKERS_COMP: "WC", COMMERCIAL_AUTO: "CA", CYBER: "CY", PROFESSIONAL: "PL", INLAND_MARINE: "IM",
  };

  // Carrier schedule lookup for commission rates.
  const scheduleMap = new Map<string, { newPct: number; renewalPct: number }>();
  for (const spec of carrierSpecs) {
    for (const [lob, n, r] of spec.lobs) scheduleMap.set(`${spec.name}:${lob}`, { newPct: n, renewalPct: r });
  }

  let seq = 1000;
  const policyIds: Array<{ id: string; policyNumber: string; clientIdx: number; carrier: string; premium: number; ratePct: number; lob: LineOfBusiness; producerId: string }> = [];
  for (const [clientIdx, carrierName, lob, premium, status, effMonthsAgo, isNew, billing, producer] of policySpecs) {
    const sched = scheduleMap.get(`${carrierName}:${lob}`);
    const ratePct = sched ? (isNew ? sched.newPct : sched.renewalPct) : 12;
    const effectiveDate = monthsAgo(effMonthsAgo, ((seq * 7) % 27) + 1);
    const policyNumber = `${lobPrefix[lob] ?? "PX"}-${carrierName.slice(0, 3).toUpperCase()}-${seq++}`;
    const policy = await prisma.policy.create({
      data: {
        policyNumber,
        clientId: clients[clientIdx]!.id,
        carrierId: carriers[carrierName]!.id,
        lineOfBusiness: lob,
        status,
        billingType: billing,
        premium,
        commissionRatePct: ratePct,
        commissionAmount: round2(premium * (ratePct / 100)),
        isNewBusiness: isNew,
        effectiveDate,
        expirationDate: addYearsUtc(effectiveDate, 1),
        boundAt: effectiveDate,
        producerId: producer.id,
        csrId: molly.id,
      },
    });
    policyIds.push({ id: policy.id, policyNumber, clientIdx, carrier: carrierName, premium, ratePct, lob, producerId: producer.id });
  }

  // Renewal chains: 4 expired terms that renewed (status RENEWED → successor) and 2 lost.
  const chains: Array<[number, string, LineOfBusiness, number, number, typeof sarah, "RENEWED" | "CANCELLED" | "NON_RENEWED"]> = [
    // [clientIdx, carrier, lob, oldPremium, expiredMonthsAgo, producer, outcome]
    [0, "Travelers", "HOME", 2610, 9, sarah, "RENEWED"],
    [1, "Hartford", "GENERAL_LIABILITY", 9100, 4, james, "RENEWED"],
    [6, "Chubb", "HOME", 4100, 11, dana, "RENEWED"],
    [14, "Safeco", "HOME", 2520, 7, sarah, "RENEWED"],
    [22, "Liberty Mutual", "AUTO", 1450, 3, james, "NON_RENEWED"],
    [20, "Nationwide", "AUTO", 1380, 5, sarah, "CANCELLED"],
  ];
  for (const [clientIdx, carrierName, lob, oldPremium, expiredMonthsAgo, producer, outcome] of chains) {
    const sched = scheduleMap.get(`${carrierName}:${lob}`);
    const ratePct = sched ? sched.renewalPct : 10;
    const expirationDate = monthsAgo(expiredMonthsAgo, 12);
    const effectiveDate = addYearsUtc(expirationDate, -1);
    const policyNumber = `${lobPrefix[lob] ?? "PX"}-${carrierName.slice(0, 3).toUpperCase()}-${seq++}`;
    const old = await prisma.policy.create({
      data: {
        policyNumber,
        clientId: clients[clientIdx]!.id,
        carrierId: carriers[carrierName]!.id,
        lineOfBusiness: lob,
        status: outcome,
        billingType: "DIRECT_BILL",
        premium: oldPremium,
        commissionRatePct: ratePct,
        commissionAmount: round2(oldPremium * (ratePct / 100)),
        isNewBusiness: false,
        effectiveDate,
        expirationDate,
        boundAt: effectiveDate,
        cancelledAt: outcome === "CANCELLED" ? monthsAgo(expiredMonthsAgo + 2, 5) : null,
        cancellationReason: outcome === "CANCELLED" ? "Insured sold the vehicle" : null,
        producerId: producer.id,
        csrId: molly.id,
      },
    });
    if (outcome === "RENEWED") {
      // Link the matching active successor (same client/carrier/lob).
      const successor = policyIds.find((p) => p.clientIdx === clientIdx && p.carrier === carrierName && p.lob === lob);
      if (successor) await prisma.policy.update({ where: { id: successor.id }, data: { renewalOfId: old.id, isNewBusiness: false } });
    }
  }

  // Producer splits: shared accounts.
  const split1 = policyIds.find((p) => p.policyNumber.startsWith("GL-HAR"));
  if (split1) {
    await prisma.policyProducerSplit.createMany({
      data: [
        { policyId: split1.id, producerId: james.id, pct: 60 },
        { policyId: split1.id, producerId: sarah.id, pct: 40 },
      ],
    });
  }
  const split2 = policyIds.find((p) => p.policyNumber.startsWith("CA-PRO") && p.premium === 16800);
  if (split2) {
    await prisma.policyProducerSplit.createMany({
      data: [
        { policyId: split2.id, producerId: dana.id, pct: 50 },
        { policyId: split2.id, producerId: james.id, pct: 50 },
      ],
    });
  }

  // Endorsements.
  const endorse = policyIds.find((p) => p.lob === "COMMERCIAL_AUTO" && p.premium === 7600);
  if (endorse) {
    await prisma.endorsement.create({
      data: { policyId: endorse.id, effectiveDate: monthsAgo(1, 20), description: "Added 2024 Ford Transit (VIN …4821)", premiumChange: 940 },
    });
  }
  const endorse2 = policyIds.find((p) => p.lob === "HOME" && p.premium === 2850);
  if (endorse2) {
    await prisma.endorsement.create({
      data: { policyId: endorse2.id, effectiveDate: monthsAgo(2, 8), description: "Scheduled jewelry rider $15,000", premiumChange: 120 },
    });
  }

  // ── Coverage detail + risk items (Wave A) ──────────────────────────
  // Give a representative slice of the book real coverage schedules and
  // risk items so every new surface renders meaningful data.
  const byPrefix = (prefix: string, clientIdx?: number) =>
    policyIds.find((p) => p.policyNumber.startsWith(prefix) && (clientIdx == null || p.clientIdx === clientIdx));

  // Harborview Builders GL (the client-portal demo login) — full GL schedule.
  const harborGlPol = byPrefix("GL-HAR", 1);
  if (harborGlPol) {
    await prisma.coverage.createMany({
      data: [
        { policyId: harborGlPol.id, code: "GL_OCC", label: "Each occurrence", limitAmount: 1000000, premiumPart: 5200, sortOrder: 0 },
        { policyId: harborGlPol.id, code: "GL_AGG", label: "General aggregate", limitAmount: 2000000, sortOrder: 1 },
        { policyId: harborGlPol.id, code: "GL_PRODCOMP", label: "Products/completed-ops aggregate", limitAmount: 2000000, sortOrder: 2 },
        { policyId: harborGlPol.id, code: "GL_PERSADV", label: "Personal & advertising injury", limitAmount: 1000000, sortOrder: 3 },
        { policyId: harborGlPol.id, code: "GL_MEDEXP", label: "Medical expense (any one person)", limitAmount: 5000, sortOrder: 4 },
        { policyId: harborGlPol.id, code: "GL_DAMPREM", label: "Damage to rented premises", limitAmount: 100000, sortOrder: 5 },
      ],
    });
    await prisma.insuredLocation.create({
      data: { policyId: harborGlPol.id, addressLine1: "107 Coleman Blvd", city: "Mount Pleasant", state: "SC", zip: "29464", buildingValue: 750000, contentsValue: 180000, occupancy: "Contractor office + yard", sqFt: 6200, yearBuilt: 2008 },
    });
  }
  // Harborview Workers Comp — statutory schedule.
  const harborWcPol = byPrefix("WC-BER", 1);
  if (harborWcPol) {
    await prisma.coverage.createMany({
      data: [
        { policyId: harborWcPol.id, code: "WC_STATUTORY", label: "Workers compensation (statutory)", limitText: "Statutory", sortOrder: 0 },
        { policyId: harborWcPol.id, code: "EL_ACCIDENT", label: "E.L. each accident", limitAmount: 1000000, sortOrder: 1 },
        { policyId: harborWcPol.id, code: "EL_DISEASE_EE", label: "E.L. disease — each employee", limitAmount: 1000000, sortOrder: 2 },
        { policyId: harborWcPol.id, code: "EL_DISEASE_POL", label: "E.L. disease — policy limit", limitAmount: 1000000, sortOrder: 3 },
      ],
    });
  }
  // Harborview Commercial Auto — vehicle + driver risk items.
  const harborCaPol = byPrefix("CA-PRO", 1);
  if (harborCaPol) {
    await prisma.coverage.createMany({
      data: [
        { policyId: harborCaPol.id, code: "BI", label: "Bodily injury liability", limitText: "1,000,000 CSL", sortOrder: 0 },
        { policyId: harborCaPol.id, code: "COMP", label: "Comprehensive", deductibleAmount: 1000, sortOrder: 1 },
        { policyId: harborCaPol.id, code: "COLL", label: "Collision", deductibleAmount: 1000, sortOrder: 2 },
      ],
    });
    const foreman = await prisma.driver.create({
      data: { policyId: harborCaPol.id, name: "Diego Ramirez", relationship: "Employee", licenseNumber: "SC-DL-882211", licenseState: "SC" },
    });
    await prisma.vehicle.createMany({
      data: [
        { policyId: harborCaPol.id, year: 2022, make: "Ford", model: "F-250", vin: "1FT7W2BT0NEC04821", garagingZip: "29464", usage: "business", annualMiles: 18000 },
        { policyId: harborCaPol.id, year: 2021, make: "RAM", model: "2500", vin: "3C6UR5DL2MG573210", garagingZip: "29464", usage: "business", annualMiles: 22000 },
      ],
    });
    // Link a primary driver to the first truck.
    const firstTruck = await prisma.vehicle.findFirst({ where: { policyId: harborCaPol.id }, orderBy: { createdAt: "asc" } });
    if (firstTruck) await prisma.vehicle.update({ where: { id: firstTruck.id }, data: { primaryDriverId: foreman.id } });
  }

  // Personal-lines demo: Walter & Janet Simmons (client 0) HOME + AUTO.
  const simmonsHome = byPrefix("HO-TRA", 0);
  if (simmonsHome) {
    await prisma.coverage.createMany({
      data: [
        { policyId: simmonsHome.id, code: "COV_A", label: "Coverage A — Dwelling", limitAmount: 420000, premiumPart: 1900, sortOrder: 0 },
        { policyId: simmonsHome.id, code: "COV_B", label: "Coverage B — Other structures", limitAmount: 42000, sortOrder: 1 },
        { policyId: simmonsHome.id, code: "COV_C", label: "Coverage C — Personal property", limitAmount: 210000, sortOrder: 2 },
        { policyId: simmonsHome.id, code: "COV_D", label: "Coverage D — Loss of use", limitAmount: 84000, sortOrder: 3 },
        { policyId: simmonsHome.id, code: "COV_E", label: "Coverage E — Personal liability", limitAmount: 500000, sortOrder: 4 },
        { policyId: simmonsHome.id, code: "COV_F", label: "Coverage F — Medical payments", limitAmount: 5000, sortOrder: 5 },
        { policyId: simmonsHome.id, code: "DEDUCT", label: "All-perils deductible", deductibleAmount: 1000, sortOrder: 6 },
        { policyId: simmonsHome.id, code: "WIND_HAIL", label: "Wind/hail deductible", deductibleText: "2% of Cov A", sortOrder: 7 },
      ],
    });
    await prisma.dwelling.create({
      data: { policyId: simmonsHome.id, addressLine1: "100 King St", city: "Charleston", state: "SC", zip: "29401", yearBuilt: 1996, construction: "Masonry veneer", roofType: "Architectural shingle", squareFeet: 2850, replacementCost: 465000, occupancy: "Owner", mortgageeName: "First Palmetto Bank, ISAOA", mortgageeClause: "ISAOA/ATIMA", loanNumber: "FPB-2287740" },
    });
    await prisma.scheduledItem.create({
      data: { policyId: simmonsHome.id, type: "jewelry", description: "Diamond engagement ring (1.8ct)", value: 15000, appraisalOnFile: true },
    });
  }
  const simmonsAuto = byPrefix("PA-PRO", 0);
  if (simmonsAuto) {
    await prisma.coverage.createMany({
      data: [
        { policyId: simmonsAuto.id, code: "BI", label: "Bodily injury liability", limitText: "100/300", sortOrder: 0 },
        { policyId: simmonsAuto.id, code: "PD", label: "Property damage liability", limitAmount: 100000, sortOrder: 1 },
        { policyId: simmonsAuto.id, code: "UM", label: "Uninsured/underinsured motorist", limitText: "100/300", sortOrder: 2 },
        { policyId: simmonsAuto.id, code: "MED", label: "Medical payments", limitAmount: 5000, sortOrder: 3 },
        { policyId: simmonsAuto.id, code: "COMP", label: "Comprehensive", deductibleAmount: 500, sortOrder: 4 },
        { policyId: simmonsAuto.id, code: "COLL", label: "Collision", deductibleAmount: 500, sortOrder: 5 },
      ],
    });
    const [walter, janet] = await Promise.all([
      prisma.driver.create({ data: { policyId: simmonsAuto.id, name: "Walter Simmons", relationship: "Named insured", licenseNumber: "SC-DL-114477", licenseState: "SC" } }),
      prisma.driver.create({ data: { policyId: simmonsAuto.id, name: "Janet Simmons", relationship: "Spouse", licenseNumber: "SC-DL-114478", licenseState: "SC" } }),
    ]);
    const v1 = await prisma.vehicle.create({
      data: { policyId: simmonsAuto.id, year: 2020, make: "Toyota", model: "Highlander", vin: "5TDGZRBH2LS012345", garagingZip: "29401", usage: "commute", annualMiles: 12000, primaryDriverId: walter.id },
    });
    void v1;
    await prisma.vehicle.create({
      data: { policyId: simmonsAuto.id, year: 2018, make: "Honda", model: "CR-V", vin: "2HKRW2H85JH567890", garagingZip: "29401", usage: "pleasure", annualMiles: 7000, primaryDriverId: janet.id },
    });
  }

  // ── X-dates (prior/competitor policies) ────────────────────────────
  // Mix of prospect leads and existing clients with competitor coverage
  // expiring soon — fuels the X-date dashboard tile + worklist.
  await prisma.priorPolicy.createMany({
    data: [
      // Prospect Grace Thompson (client 20) — auto + umbrella elsewhere.
      { clientId: clients[20]!.id, lineOfBusiness: "AUTO", currentCarrier: "State Farm", currentPremium: 1840, expirationDate: daysFromNow(18), notes: "Bundling target — quoting HO now, round out with auto." },
      { clientId: clients[20]!.id, lineOfBusiness: "UMBRELLA", currentCarrier: "State Farm", currentPremium: 410, expirationDate: daysFromNow(18) },
      // Existing client Maria Gonzalez (client 2) — competitor home not with us.
      { clientId: clients[2]!.id, lineOfBusiness: "HOME", currentCarrier: "Allstate", currentPremium: 2480, expirationDate: daysFromNow(47), notes: "We write her auto; cross-sell HOME at her X-date." },
      // Existing client Robert & Lisa Patel (client 8) — boat with competitor.
      { clientId: clients[8]!.id, lineOfBusiness: "BOAT", currentCarrier: "GEICO Marine", currentPremium: 720, expirationDate: daysFromNow(74) },
      // Overdue (acted late) — David Chen (client 4) home with competitor.
      { clientId: clients[4]!.id, lineOfBusiness: "HOME", currentCarrier: "Farmers", currentPremium: 2200, expirationDate: daysFromNow(-9), notes: "Missed last cycle — follow up for next term." },
    ],
  });

  // Renewal records for policies expiring within 90 days.
  const soonExpiring = await prisma.policy.findMany({
    where: { status: { in: ["ACTIVE", "BOUND"] }, expirationDate: { lte: daysFromNow(90) } },
    select: { id: true, expirationDate: true, producerId: true },
  });
  for (const [i, p] of soonExpiring.entries()) {
    await prisma.renewal.create({
      data: {
        policyId: p.id,
        expirationDate: p.expirationDate,
        status: i % 3 === 0 ? "REMARKETING" : "PENDING_REVIEW",
        assignedToId: p.producerId,
        tasks: {
          create: [
            {
              title: "Review renewal terms with carrier",
              dueDate: new Date(p.expirationDate.getTime() - 30 * 86400000),
              priority: "HIGH",
              assignedToId: p.producerId,
              createdById: eric.id,
              policyId: p.id,
            },
          ],
        },
      },
    });
  }

  // ── Leads (10) ─────────────────────────────────────────────────────
  const leadSpecs: Array<{
    first: string; last: string; email: string; phone?: string; zip?: string;
    lob?: LineOfBusiness; source: string; status: "NEW" | "CONTACTED" | "QUALIFIED" | "CONVERTED" | "LOST";
    campaignId?: string; clientIdx?: number; message?: string;
  }> = [
    { first: "Grace", last: "Thompson", email: "gthompson@example.com", phone: "843-555-0301", zip: "29401", lob: "HOME", source: "website", status: "CONVERTED", clientIdx: 20, message: "Closing on a house downtown next month, need a homeowners quote." },
    { first: "Oliver", last: "Banks", email: "obanks@example.com", phone: "843-555-0302", zip: "29464", lob: "BOP", source: "referral", status: "CONVERTED", campaignId: campReferral.id, clientIdx: 21, message: "Opening a bookshop, referred by Harborview Builders." },
    { first: "Priya", last: "Raman", email: "praman@example.com", phone: "843-555-0303", zip: "29403", lob: "PROFESSIONAL", source: "paid search", status: "CONVERTED", campaignId: campSearch.id, clientIdx: 15 },
    { first: "Caleb", last: "Foster", email: "cfoster@example.com", phone: "843-555-0304", zip: "29412", lob: "AUTO", source: "website", status: "QUALIFIED", message: "Two cars and a teenage driver. Help." },
    { first: "Nina", last: "Alvarez", email: "nalvarez@example.com", zip: "29405", lob: "RENTERS", source: "social", status: "CONTACTED" },
    { first: "Hank", last: "Boudreaux", email: "hboudreaux@example.com", phone: "843-555-0306", lob: "COMMERCIAL_AUTO", source: "cold call", status: "CONTACTED" },
    { first: "Wendy", last: "Liu", email: "wliu@example.com", phone: "843-555-0307", zip: "29466", lob: "HOME", source: "direct mail", status: "NEW", campaignId: campMail.id, message: "Got your postcard — shopping my homeowners at renewal." },
    { first: "Jorge", last: "Mendes", email: "jmendes@example.com", zip: "29418", lob: "WORKERS_COMP", source: "website", status: "NEW", message: "Roofing crew of 8, need WC and GL." },
    { first: "Tasha", last: "Green", email: "tgreen@example.com", phone: "843-555-0309", lob: "AUTO", source: "paid search", status: "LOST", campaignId: campSearch.id },
    { first: "Earl", last: "Whitman", email: "ewhitman@example.com", zip: "29401", lob: "UMBRELLA", source: "referral", status: "NEW", campaignId: campReferral.id },
  ];
  const { scoreLead } = await import("../src/lib/domain/lead-scoring");
  const leads: Array<{ id: string }> = [];
  for (const ls of leadSpecs) {
    const lead = await prisma.lead.create({
      data: {
        firstName: ls.first,
        lastName: ls.last,
        email: ls.email,
        phone: ls.phone,
        zip: ls.zip,
        lineOfBusiness: ls.lob,
        message: ls.message,
        source: ls.source,
        status: ls.status,
        score: scoreLead({ email: ls.email, phone: ls.phone, zip: ls.zip, message: ls.message, lineOfBusiness: ls.lob ?? null, source: ls.source }),
        assignedToId: producers[leads.length % 3]!.id,
        campaignId: ls.campaignId,
        clientId: ls.clientIdx != null ? clients[ls.clientIdx]!.id : null,
      },
    });
    leads.push(lead);
  }

  // Lead-based X-date (prospect Caleb Foster, lead 3 — competitor auto).
  await prisma.priorPolicy.create({
    data: { leadId: leads[3]!.id, lineOfBusiness: "AUTO", currentCarrier: "Progressive", currentPremium: 2600, expirationDate: daysFromNow(33), notes: "Teen driver added; shopping at renewal." },
  });

  // ── Opportunities (pipeline) ───────────────────────────────────────
  const oppSpecs: Array<[string, "NEW" | "CONTACTED" | "QUOTING" | "PROPOSAL" | "BOUND" | "LOST", LineOfBusiness, number, number | null, typeof sarah]> = [
    ["Old Village Books — BOP", "QUOTING", "BOP", 2100, 21, dana],
    ["Grace Thompson — Homeowners", "BOUND", "HOME", 2900, 20, sarah],
    ["Jorge Mendes — WC + GL package", "CONTACTED", "WORKERS_COMP", 9500, null, james],
    ["Caleb Foster — Personal auto", "QUOTING", "AUTO", 2400, null, sarah],
    ["Wando River Logistics — Umbrella", "PROPOSAL", "UMBRELLA", 3800, 19, dana],
    ["Hank Boudreaux — Fleet", "NEW", "COMMERCIAL_AUTO", 12500, null, james],
    ["Tasha Green — Auto", "LOST", "AUTO", 1700, null, sarah],
    ["Pinckney Street Yoga — Cyber add-on", "NEW", "CYBER", 1400, 23, sarah],
  ];
  for (const [name, stage, lob, premium, clientIdx, owner] of oppSpecs) {
    await prisma.opportunity.create({
      data: {
        name,
        stage,
        lineOfBusiness: lob,
        premiumEstimate: premium,
        clientId: clientIdx != null ? clients[clientIdx]!.id : null,
        ownerId: owner.id,
        lostReason: stage === "LOST" ? "Stayed with current carrier on price" : null,
        expectedCloseDate: stage === "BOUND" || stage === "LOST" ? null : daysFromNow(30),
      },
    });
  }

  // ── Quote requests + quotes (6 requests) ───────────────────────────
  const qrSpecs: Array<{ clientIdx?: number; leadIdx?: number; lob: LineOfBusiness; status: "OPEN" | "QUOTED" | "PRESENTED" | "BOUND" | "LOST"; owner: typeof sarah; quotes: Array<[string, number, "RECEIVED" | "PRESENTED" | "ACCEPTED" | "DECLINED"]> }> = [
    { clientIdx: 21, lob: "BOP", status: "QUOTED", owner: dana, quotes: [["Hartford", 2150, "RECEIVED"], ["Travelers", 2380, "RECEIVED"], ["Nationwide", 2040, "RECEIVED"]] },
    { leadIdx: 3, lob: "AUTO", status: "QUOTED", owner: sarah, quotes: [["Progressive", 2310, "RECEIVED"], ["Safeco", 2455, "RECEIVED"]] },
    { leadIdx: 7, lob: "WORKERS_COMP", status: "OPEN", owner: james, quotes: [] },
    { clientIdx: 19, lob: "UMBRELLA", status: "PRESENTED", owner: dana, quotes: [["Chubb", 3650, "PRESENTED"], ["Travelers", 3920, "PRESENTED"]] },
    { clientIdx: 20, lob: "HOME", status: "BOUND", owner: sarah, quotes: [["Travelers", 2980, "ACCEPTED"], ["Safeco", 3140, "DECLINED"]] },
    { clientIdx: 23, lob: "CYBER", status: "OPEN", owner: sarah, quotes: [["Chubb", 1350, "RECEIVED"]] },
  ];
  for (const qr of qrSpecs) {
    await prisma.quoteRequest.create({
      data: {
        clientId: qr.clientIdx != null ? clients[qr.clientIdx]!.id : null,
        leadId: qr.leadIdx != null ? leads[qr.leadIdx]!.id : null,
        lineOfBusiness: qr.lob,
        status: qr.status,
        effectiveDate: daysFromNow(25),
        ownerId: qr.owner.id,
        quotes: {
          create: qr.quotes.map(([carrierName, premium, status]) => ({
            carrierId: carriers[carrierName]!.id,
            premium,
            status,
            validUntil: daysFromNow(45),
            coverageSummary: "Per carrier proposal",
          })),
        },
      },
    });
  }

  // ── Claims (5) ─────────────────────────────────────────────────────
  const claimSpecs: Array<[string, number, "REPORTED" | "OPEN" | "UNDER_REVIEW" | "APPROVED" | "CLOSED", string, number | null, number | null]> = [
    // [policyNumber prefix to find, daysAgo loss, status, description, reserve, paid]
    ["HO-TRA", 24, "OPEN", "Wind damage to roof shingles after June squall line.", 18000, null],
    ["PA-PRO", 12, "UNDER_REVIEW", "Rear-end collision on I-26, other party cited.", 7500, null],
    ["GL-HAR", 60, "APPROVED", "Slip and fall at job site — visitor sprained wrist.", 12000, 4200],
    ["WC-BER", 35, "OPEN", "Employee laceration, ER visit and 4 days light duty.", 9000, 1100],
    ["CA-PRO", 95, "CLOSED", "Box truck backed into loading dock bollard.", 4000, 3650],
  ];
  for (const [i, [prefix, lossDaysAgo, status, description, reserve, paid]] of claimSpecs.entries()) {
    const policy = policyIds.find((p) => p.policyNumber.startsWith(prefix));
    if (!policy) continue;
    await prisma.claim.create({
      data: {
        claimNumber: `CLM-${TODAY.getUTCFullYear()}-${String(i + 1).padStart(5, "0")}`,
        policyId: policy.id,
        clientId: clients[policy.clientIdx]!.id,
        carrierClaimRef: `${policy.carrier.slice(0, 3).toUpperCase()}-${771000 + i * 13}`,
        status,
        dateOfLoss: daysFromNow(-lossDaysAgo),
        reportedAt: daysFromNow(-lossDaysAgo + 1),
        description,
        adjusterName: ["Pat Connors", "Reggie Hall", "June Park", "Felicia Moore", "Stan Hubbard"][i],
        adjusterPhone: `800-555-04${10 + i}`,
        adjusterEmail: `adjuster${i + 1}@carrier.example.com`,
        reserveAmount: reserve,
        paidAmount: paid,
        closedAt: status === "CLOSED" ? daysFromNow(-lossDaysAgo + 30) : null,
      },
    });
  }

  // ── Commission statements + reconciliation ─────────────────────────
  const { reconcileLine } = await import("../src/lib/domain/commissions");
  const reconcilable = policyIds.map((p) => ({
    id: p.id,
    policyNumber: p.policyNumber,
    expectedCommission: round2(p.premium * (p.ratePct / 100)),
  }));

  const stmtSpecs: Array<{ carrier: string; monthsBack: number; lines: Array<{ pn: string; type: "NEW_BUSINESS" | "RENEWAL"; deltaPct?: number; unmatched?: boolean }> }> = [
    {
      carrier: "Progressive",
      monthsBack: 0,
      lines: [
        { pn: "PA-PRO", type: "RENEWAL" },
        { pn: "CA-PRO", type: "RENEWAL" },
        { pn: "XX-UNKNOWN-1", type: "NEW_BUSINESS", unmatched: true },
      ],
    },
    {
      carrier: "Travelers",
      monthsBack: 1,
      lines: [
        { pn: "HO-TRA", type: "RENEWAL" },
        { pn: "GL-TRA", type: "RENEWAL", deltaPct: -8 }, // variance: short-paid
        { pn: "BP-TRA", type: "RENEWAL" },
        { pn: "UM-TRA", type: "RENEWAL" },
      ],
    },
    {
      carrier: "Hartford",
      monthsBack: 2,
      lines: [
        { pn: "GL-HAR", type: "RENEWAL" },
        { pn: "BP-HAR", type: "NEW_BUSINESS", deltaPct: 6 }, // variance: overpaid
      ],
    },
  ];

  for (const spec of stmtSpecs) {
    const lineRows: Array<{ policyNumber: string; insuredName: string | null; transactionType: "NEW_BUSINESS" | "RENEWAL"; premium: number | null; commissionAmount: number }> = [];
    for (const l of spec.lines) {
      if (l.unmatched) {
        lineRows.push({ policyNumber: l.pn, insuredName: "Unknown Insured LLC", transactionType: l.type, premium: 2400, commissionAmount: 288 });
        continue;
      }
      const matches = policyIds.filter((p) => p.policyNumber.startsWith(l.pn));
      for (const p of matches) {
        const expected = round2(p.premium * (p.ratePct / 100));
        const actual = l.deltaPct ? round2(expected * (1 + l.deltaPct / 100)) : expected;
        lineRows.push({
          policyNumber: p.policyNumber,
          insuredName: clients[p.clientIdx]!.name,
          transactionType: l.type,
          premium: p.premium,
          commissionAmount: actual,
        });
      }
    }
    const total = round2(lineRows.reduce((acc, r) => acc + r.commissionAmount, 0));
    const statement = await prisma.commissionStatement.create({
      data: {
        carrierId: carriers[spec.carrier]!.id,
        statementDate: monthsAgo(spec.monthsBack, 5),
        periodLabel: monthsAgo(spec.monthsBack, 1).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
        totalAmount: total,
        status: "RECONCILING",
      },
    });
    let unmatchedCt = 0;
    let varianceCt = 0;
    for (const row of lineRows) {
      const result = reconcileLine({ policyNumber: row.policyNumber, commissionAmount: row.commissionAmount }, reconcilable);
      if (result.matchStatus === "UNMATCHED") unmatchedCt++;
      if (result.matchStatus === "VARIANCE") varianceCt++;
      await prisma.commissionStatementLine.create({
        data: {
          statementId: statement.id,
          policyNumber: row.policyNumber,
          insuredName: row.insuredName,
          transactionType: row.transactionType,
          premium: row.premium,
          commissionAmount: row.commissionAmount,
          policyId: result.policyId,
          matchStatus: result.matchStatus,
          varianceAmount: result.varianceAmount,
        },
      });
    }
    await prisma.commissionStatement.update({
      where: { id: statement.id },
      data: { status: unmatchedCt === 0 && varianceCt === 0 ? "RECONCILED" : "RECONCILING" },
    });
  }

  // ── Compliance: licenses + CE + E&O ────────────────────────────────
  const licSarah = await prisma.license.create({
    data: {
      userId: sarah.id, state: "SC", licenseNumber: "SC-PC-118822", npn: "17665522",
      licenseClass: "PROPERTY_CASUALTY", issuedAt: addYearsUtc(TODAY, -4), expiresAt: daysFromNow(22), ceRequiredHours: 24,
    },
  });
  await prisma.ceCredit.createMany({
    data: [
      { licenseId: licSarah.id, courseName: "SC P&C Law Update", provider: "WebCE", hours: 6, completedAt: monthsAgo(4, 10) },
      { licenseId: licSarah.id, courseName: "Ethics for Producers", provider: "Kaplan", hours: 3, isEthics: true, completedAt: monthsAgo(3, 2) },
      { licenseId: licSarah.id, courseName: "Flood Insurance Fundamentals", provider: "WebCE", hours: 4, completedAt: monthsAgo(1, 18) },
    ],
  });
  const licJames = await prisma.license.create({
    data: {
      userId: james.id, state: "SC", licenseNumber: "SC-PC-204311", npn: "19884411",
      licenseClass: "PROPERTY_CASUALTY", issuedAt: addYearsUtc(TODAY, -2), expiresAt: daysFromNow(52), ceRequiredHours: 24,
    },
  });
  await prisma.ceCredit.createMany({
    data: [
      { licenseId: licJames.id, courseName: "Commercial Lines Coverage Gaps", provider: "IIABSC", hours: 8, completedAt: monthsAgo(5, 7) },
      { licenseId: licJames.id, courseName: "Ethics in Insurance", provider: "WebCE", hours: 3, isEthics: true, completedAt: monthsAgo(2, 21) },
    ],
  });
  const licDana = await prisma.license.create({
    data: {
      userId: dana.id, state: "SC", licenseNumber: "SC-PC-309876", npn: "20119876",
      licenseClass: "PROPERTY_CASUALTY", issuedAt: addYearsUtc(TODAY, -1), expiresAt: addYearsUtc(TODAY, 1), ceRequiredHours: 24,
    },
  });
  await prisma.ceCredit.createMany({
    data: [
      { licenseId: licDana.id, courseName: "Cyber Liability Essentials", provider: "Kaplan", hours: 5, completedAt: monthsAgo(2, 14) },
    ],
  });
  await prisma.license.create({
    data: {
      userId: dana.id, state: "GA", licenseNumber: "GA-NR-77120", npn: "20119876",
      licenseClass: "PROPERTY_CASUALTY", issuedAt: addYearsUtc(TODAY, -1), expiresAt: addYearsUtc(TODAY, 1), ceRequiredHours: 0,
      notes: "Non-resident license",
    },
  });
  await prisma.license.create({
    data: {
      userId: eric.id, state: "SC", licenseNumber: "SC-PC-099001", npn: "18223344",
      licenseClass: "PROPERTY_CASUALTY", issuedAt: addYearsUtc(TODAY, -6), expiresAt: addYearsUtc(TODAY, 2), ceRequiredHours: 24,
    },
  });
  await prisma.eoPolicy.create({
    data: {
      carrierName: "Westport (Swiss Re)", policyNumber: "EO-2025-88431",
      limitEach: 1000000, limitAggregate: 2000000, premium: 4850,
      effectiveDate: daysFromNow(-320), expirationDate: daysFromNow(45),
      notes: "Renewal quote requested from Utica as comparison.",
    },
  });

  // ── Invoices (agency bill) ─────────────────────────────────────────
  const agencyBillPolicies = policyIds.filter((p) =>
    ["GL-HAR", "WC-BER", "CP-HAN", "BP-HAR", "IM-HAN"].some((pre) => p.policyNumber.startsWith(pre)),
  );
  const invoiceStatuses: Array<["SENT" | "PARTIAL" | "PAID" | "DRAFT", number, number]> = [
    ["SENT", -75, 0],      // 45 days past due → 31–60 bucket
    ["PARTIAL", -40, 0.5], // 10 days past due, half paid
    ["SENT", -20, 0],      // 10 days to due → current
    ["PAID", -90, 1],
    ["DRAFT", 0, 0],
  ];
  for (const [i, p] of agencyBillPolicies.slice(0, 5).entries()) {
    const [status, dueOffset, paidFrac] = invoiceStatuses[i]!;
    const amount = p.premium;
    await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-${TODAY.getUTCFullYear()}-${String(i + 1).padStart(5, "0")}`,
        clientId: clients[p.clientIdx]!.id,
        policyId: p.id,
        status,
        issueDate: daysFromNow(dueOffset - 30),
        dueDate: daysFromNow(dueOffset + 30),
        amount,
        paidAmount: round2(amount * paidFrac),
        paidAt: status === "PAID" ? daysFromNow(dueOffset + 10) : null,
        // Demo Xero "Pay now" link on open invoices — the portal's only
        // online-payment path (Xero is the accounting system of record).
        xeroPaymentUrl: status === "SENT" || status === "PARTIAL" ? `https://in.xero.com/pay/demo-${i + 1}` : null,
        lines: { create: [{ description: `Premium — policy ${p.policyNumber}`, quantity: 1, unitAmount: amount, amount }] },
      },
    });
  }

  // ── Certificates ───────────────────────────────────────────────────
  const [holderGC, holderBank, holderLandlord] = await Promise.all([
    prisma.certificateHolder.create({
      data: { name: "Meridian General Contractors", addressLine1: "44 Line St", city: "Charleston", state: "SC", zip: "29403", email: "compliance@meridiangc.example.com" },
    }),
    prisma.certificateHolder.create({
      data: { name: "First Palmetto Bank, ISAOA", addressLine1: "200 Broad St", city: "Charleston", state: "SC", zip: "29401" },
    }),
    prisma.certificateHolder.create({
      data: { name: "Shem Creek Properties LLC", addressLine1: "1106 Shem Dr", city: "Mount Pleasant", state: "SC", zip: "29464", email: "leases@shemcreekprop.example.com" },
    }),
  ]);
  const harborGl = policyIds.find((p) => p.policyNumber.startsWith("GL-HAR"));
  const harborWc = policyIds.find((p) => p.policyNumber.startsWith("WC-BER") && p.clientIdx === 1);
  if (harborGl && harborWc) {
    const harborPolicies = await prisma.policy.findMany({ where: { id: { in: [harborGl.id, harborWc.id] } }, include: { carrier: true } });
    await prisma.certificate.create({
      data: {
        certNumber: `COI-${TODAY.getUTCFullYear()}-00001`,
        clientId: clients[1]!.id,
        holderId: holderGC.id,
        policyId: harborGl.id,
        descriptionOfOps: "RE: Project 2287 — Meridian is named additional insured with respect to general liability arising from operations performed by the named insured.",
        additionalInsured: true,
        waiverOfSubrogation: true,
        issuedById: molly.id,
        issuedAt: daysFromNow(-12),
        coverages: {
          create: harborPolicies.map((p) => ({
            policyId: p.id,
            coverageType: p.lineOfBusiness === "GENERAL_LIABILITY" ? "Commercial General Liability" : "Workers Compensation",
            carrierName: p.carrier.name,
            policyNumber: p.policyNumber,
            effectiveDate: p.effectiveDate,
            expirationDate: p.expirationDate,
            limitsText: p.lineOfBusiness === "GENERAL_LIABILITY"
              ? "EACH OCCURRENCE $1,000,000\nGENERAL AGGREGATE $2,000,000"
              : "E.L. EACH ACCIDENT $1,000,000",
          })),
        },
      },
    });
  }
  const bistroBop = policyIds.find((p) => p.policyNumber.startsWith("BP-HAR") && p.clientIdx === 9);
  if (bistroBop) {
    const bp = await prisma.policy.findUnique({ where: { id: bistroBop.id }, include: { carrier: true } });
    if (bp) {
      await prisma.certificate.create({
        data: {
          certNumber: `COI-${TODAY.getUTCFullYear()}-00002`,
          clientId: clients[9]!.id,
          holderId: holderLandlord.id,
          policyId: bp.id,
          descriptionOfOps: "Certificate holder is landlord at 14 Battery Row; listed as additional insured per lease agreement.",
          additionalInsured: true,
          issuedById: molly.id,
          issuedAt: daysFromNow(-30),
          coverages: {
            create: [{
              policyId: bp.id,
              coverageType: "Business Owners Policy",
              carrierName: bp.carrier.name,
              policyNumber: bp.policyNumber,
              effectiveDate: bp.effectiveDate,
              expirationDate: bp.expirationDate,
              limitsText: "EACH OCCURRENCE $1,000,000\nPROPERTY $250,000",
            }],
          },
        },
      });
    }
  }
  void holderBank;

  // ── Wave B: servicing artifacts ────────────────────────────────────

  // (a) A recently-cancelled AUTO policy that is REINSTATABLE — cancelled
  // for non-payment 11 days ago, term still in force. David Chen (client 4).
  {
    const effectiveDate = monthsAgo(7, 5);
    const reinstatable = await prisma.policy.create({
      data: {
        policyNumber: `PA-LIB-${seq++}`,
        clientId: clients[4]!.id,
        carrierId: carriers["Liberty Mutual"]!.id,
        lineOfBusiness: "AUTO",
        status: "CANCELLED",
        billingType: "DIRECT_BILL",
        premium: 1690,
        commissionRatePct: 12,
        commissionAmount: round2(1690 * 0.12),
        isNewBusiness: false,
        effectiveDate,
        expirationDate: addYearsUtc(effectiveDate, 1),
        boundAt: effectiveDate,
        cancelledAt: daysFromNow(-11),
        cancellationReason: "Non-payment of premium (pro-rata return ≈ $710.00)",
        producerId: james.id,
        csrId: molly.id,
      },
    });
    await prisma.coverage.createMany({
      data: [
        { policyId: reinstatable.id, code: "BI", label: "Bodily injury liability", limitText: "100/300", sortOrder: 0 },
        { policyId: reinstatable.id, code: "PD", label: "Property damage liability", limitAmount: 100000, sortOrder: 1 },
        { policyId: reinstatable.id, code: "COMP", label: "Comprehensive", deductibleAmount: 500, sortOrder: 2 },
        { policyId: reinstatable.id, code: "COLL", label: "Collision", deductibleAmount: 500, sortOrder: 3 },
      ],
    });
    await prisma.vehicle.create({
      data: { policyId: reinstatable.id, year: 2019, make: "Subaru", model: "Outback", vin: "4S4BSANC5K3251199", garagingZip: "29483", usage: "commute", annualMiles: 14000 },
    });
  }

  // (b) An open endorsement request on the Harborview commercial-auto
  // policy (the typical "add a truck" workflow), still awaiting processing.
  const harborCaForReq = policyIds.find((p) => p.policyNumber.startsWith("CA-PRO") && p.clientIdx === 1);
  if (harborCaForReq) {
    await prisma.endorsementRequest.create({
      data: {
        policyId: harborCaForReq.id,
        requestType: "ADD_VEHICLE",
        status: "IN_REVIEW",
        source: "STAFF",
        summary: "Add 2024 Ford Transit 350 (VIN 1FTBW2CM4RKA12345) — replacing leased unit",
        effectiveDate: daysFromNow(3),
        notes: "Fleet manager emailed the new VIN; awaiting carrier confirmation of rate.",
        requestedById: james.id,
      },
    });
  }
  // A portal-sourced request on the Harborview GL (client-portal demo login).
  const harborGlForReq = policyIds.find((p) => p.policyNumber.startsWith("GL-HAR"));
  if (harborGlForReq) {
    await prisma.endorsementRequest.create({
      data: {
        policyId: harborGlForReq.id,
        requestType: "ADD_LIENHOLDER",
        status: "REQUESTED",
        source: "PORTAL",
        summary: "Add Meridian General Contractors as additional insured for Project 2310",
        effectiveDate: daysFromNow(7),
      },
    });
  }

  // (c) Evidence of Property issued to the Simmons mortgagee (the
  // property analogue of the seeded COI).
  const simmonsHomeEoi = policyIds.find((p) => p.policyNumber.startsWith("HO-TRA") && p.clientIdx === 0);
  if (simmonsHomeEoi) {
    const hp = await prisma.policy.findUnique({ where: { id: simmonsHomeEoi.id }, include: { carrier: { select: { name: true } } } });
    if (hp) {
      await prisma.evidenceOfProperty.create({
        data: {
          eoiNumber: `EOI-${TODAY.getUTCFullYear()}-00001`,
          kind: "EVIDENCE_OF_PROPERTY",
          clientId: clients[0]!.id,
          policyId: hp.id,
          carrierName: hp.carrier.name,
          policyNumber: hp.policyNumber,
          effectiveDate: hp.effectiveDate,
          expirationDate: hp.expirationDate,
          propertyAddress: "100 King St, Charleston SC 29401",
          coverageALimit: 420000,
          deductibleText: "$1,000 (2% wind/hail)",
          holderName: "First Palmetto Bank, ISAOA",
          holderInterest: "MORTGAGEE",
          holderAddress: "200 Broad St, Charleston SC 29401",
          loanNumber: "FPB-2287740",
          remarks: "ISAOA/ATIMA. Evidence furnished at the request of the lender.",
          issuedById: molly.id,
          issuedAt: daysFromNow(-6),
        },
      });
    }
  }

  // (d) At-risk signals: give David Chen (client 4, AUTO-only mono-line)
  // a recent claim and a badly past-due invoice so he scores at-risk.
  const chenAuto = policyIds.find((p) => p.policyNumber.startsWith("PA-LIB") && p.clientIdx === 4);
  if (chenAuto) {
    await prisma.claim.create({
      data: {
        claimNumber: `CLM-${TODAY.getUTCFullYear()}-00006`,
        policyId: chenAuto.id,
        clientId: clients[4]!.id,
        status: "OPEN",
        dateOfLoss: daysFromNow(-40),
        reportedAt: daysFromNow(-39),
        description: "Hail damage to hood and roof during spring storm.",
        adjusterName: "Toni Vega",
        reserveAmount: 5200,
        paidAmount: null,
      },
    });
    await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-${TODAY.getUTCFullYear()}-00006`,
        clientId: clients[4]!.id,
        policyId: chenAuto.id,
        status: "SENT",
        issueDate: daysFromNow(-120),
        dueDate: daysFromNow(-95), // 95 days past due → 90+ bucket
        amount: 1690,
        paidAmount: 0,
        xeroPaymentUrl: "https://in.xero.com/pay/demo-chen",
        lines: { create: [{ description: `Premium — policy ${chenAuto.policyNumber}`, quantity: 1, unitAmount: 1690, amount: 1690 }] },
      },
    });
  }

  // ── Referrals ──────────────────────────────────────────────────────
  await prisma.referral.createMany({
    data: [
      { referrerName: "Walter Simmons", clientId: clients[8]!.id, rewardAmount: 50, notes: "Referred the Patels — gift card sent." },
      { referrerName: "Harborview Builders", leadId: leads[1]!.id, rewardAmount: 50, notes: "Referred Old Village Books." },
    ],
  });

  // ── Activities + tasks ─────────────────────────────────────────────
  const activitySpecs: Array<[typeof sarah, "NOTE" | "CALL" | "EMAIL" | "MEETING", string, string | null, number]> = [
    [sarah, "CALL", "Renewal review call with Walter Simmons", "Discussed wind/hail deductible options ahead of the Travelers renewal.", 0],
    [james, "MEETING", "Job-site walkthrough — Harborview Builders", "Reviewed subcontractor COI collection process; they need a WC audit prep checklist.", 1],
    [dana, "EMAIL", "Sent BOP comparison to Palmetto Coffee", "Hartford vs Nationwide side-by-side, recommended Hartford for spoilage coverage.", 3],
    [molly, "NOTE", "Updated lienholder on Chen auto policy", null, 4],
    [sarah, "CALL", "FNOL follow-up — Simmons roof claim", "Adjuster inspection scheduled Friday; sent client prep checklist.", 0],
    [james, "EMAIL", "Requested loss runs from CNA", "3-year loss runs for Coastal HVAC GL renewal remarketing.", 7],
    [dana, "MEETING", "Quarterly review — Wando River Logistics", "Fleet up to 14 units; umbrella proposal presented.", 19],
    [molly, "NOTE", "COI issued to Meridian GC for Harborview", null, 1],
  ];
  for (const [user, type, subject, body, clientIdx] of activitySpecs) {
    await prisma.activity.create({
      data: { type, subject, body, userId: user.id, clientId: clients[clientIdx]!.id },
    });
  }
  const taskSpecs: Array<[string, number, "OPEN" | "IN_PROGRESS", "HIGH" | "NORMAL" | "URGENT", typeof sarah, number | null]> = [
    ["Collect updated driver list from Wando River Logistics", 3, "OPEN", "HIGH", dana, 19],
    ["Send welcome kit to Grace Thompson", 1, "IN_PROGRESS", "NORMAL", sarah, 20],
    ["Prepare WC audit worksheet for Harborview", 7, "OPEN", "NORMAL", james, 1],
    ["Quote umbrella for the Patels", 5, "OPEN", "NORMAL", sarah, 8],
    ["Chase Hiscox appointment paperwork", -2, "IN_PROGRESS", "URGENT", eric, null],
    ["Confirm E&O renewal quote received", 10, "OPEN", "HIGH", eric, null],
  ];
  for (const [title, dueOffset, status, priority, assignee, clientIdx] of taskSpecs) {
    await prisma.task.create({
      data: {
        title,
        dueDate: daysFromNow(dueOffset),
        status,
        priority,
        assignedToId: assignee.id,
        createdById: eric.id,
        clientId: clientIdx != null ? clients[clientIdx]!.id : null,
      },
    });
  }

  // ── Documents (small real files so download works) ─────────────────
  const uploadsDir = path.join(process.cwd(), "uploads");
  await mkdir(uploadsDir, { recursive: true });
  // [fileName, content, docType, clientIdx, policyNumber prefix, visibleToClient]
  const docSpecs: Array<[string, string, "POLICY_DOC" | "LOSS_RUN" | "CERTIFICATE", number, string | null, boolean]> = [
    ["simmons-ho-declarations.txt", "Sample declarations page — Travelers homeowners HO-TRA series.\nSeed data for ins-platform demo.", "POLICY_DOC", 0, "HO-TRA", false],
    ["coastal-hvac-loss-runs.txt", "3-year loss run summary — Coastal HVAC Services.\nNo open losses as of last carrier report.\nSeed data for ins-platform demo.", "LOSS_RUN", 7, "GL-CNA", false],
    // Shared to the client portal (Harborview Builders demo login).
    ["harborview-gl-declarations.txt", "General liability declarations — Harborview Builders LLC.\nShared with the client via the Tabor Agency portal.\nSeed data for ins-platform demo.", "POLICY_DOC", 1, "GL-HAR", true],
    ["harborview-coi-meridian.txt", "Certificate of insurance issued to Meridian General Contractors for Harborview Builders LLC.\nSeed data for ins-platform demo.", "CERTIFICATE", 1, "GL-HAR", true],
  ];
  for (const [fileName, content, docType, clientIdx, pnPrefix, visibleToClient] of docSpecs) {
    const stored = `seed-${fileName}`;
    await writeFile(path.join(uploadsDir, stored), content, "utf8");
    const policy = pnPrefix ? policyIds.find((p) => p.policyNumber.startsWith(pnPrefix)) : null;
    await prisma.document.create({
      data: {
        fileName,
        storedPath: stored,
        mimeType: "text/plain",
        sizeBytes: Buffer.byteLength(content),
        docType,
        clientId: clients[clientIdx]!.id,
        policyId: policy?.id ?? null,
        visibleToClient,
        uploadedById: molly.id,
      },
    });
  }

  // ── Touchpoint templates (warm lifecycle journeys) ─────────────────
  // category, channel default EMAIL. Every body auto-gets a sender-identity
  // + unsubscribe footer at SEND time (touchpoint-render.ts), so footers are
  // NOT hand-written here. {{merge}} fields per the spec.
  type Tpl = {
    key: string; name: string; category: TouchpointCategoryT; trigger: TouchpointTriggerT;
    offsetDays?: number; holidayKey?: string; tenureMonths?: number; requiresApproval?: boolean;
    subject: string; body: string;
  };
  const tpls: Tpl[] = [
    // ONBOARDING
    { key: "onboard-welcome", name: "Welcome (onboarding)", category: "ONBOARDING", trigger: "LIFECYCLE_EVENT",
      subject: "Welcome to {{agencyName}}, {{firstName}}!",
      body: "Hi {{firstName}},\n\nWelcome to {{agencyName}} — we're genuinely glad you're here. Your dedicated team is {{producerName}}, and we're here whenever you need us at {{agencyPhone}}.\n\nWe'll take good care of you.\n\nWarmly,\n{{producerName}}" },
    { key: "onboard-portal-nudge", name: "Portal nudge (onboarding)", category: "ONBOARDING", trigger: "LIFECYCLE_EVENT",
      subject: "Your {{agencyName}} client portal is ready",
      body: "Hi {{firstName}},\n\nYou now have 24/7 access to your policies, documents, invoices, and claims through your secure portal: {{portalUrl}}\n\nReporting a claim or requesting a certificate takes just a minute there. Of course, we're always a phone call away too.\n\n{{producerName}}, {{agencyName}}" },
    { key: "onboard-checkin", name: "30-day check-in (onboarding)", category: "ONBOARDING", trigger: "LIFECYCLE_EVENT",
      subject: "How's everything going, {{firstName}}?",
      body: "Hi {{firstName}},\n\nIt's been a few weeks since you joined {{agencyName}}, and I wanted to personally check in. Is there anything about your coverage you'd like to revisit, or any questions I can answer?\n\nNo rush — just reply or call {{agencyPhone}} whenever it's convenient.\n\n{{producerName}}" },
    // SATISFACTION (sensitive → approval)
    { key: "nps-onboard", name: "Onboarding NPS", category: "SATISFACTION", trigger: "LIFECYCLE_EVENT", requiresApproval: true,
      subject: "A quick question, {{firstName}}",
      body: "Hi {{firstName}},\n\nOn a scale of 0–10, how likely are you to recommend {{agencyName}} to a friend or colleague? Your honest answer helps us serve you better.\n\nJust reply with a number — and feel free to add a line about what we could do better.\n\nThank you,\n{{agencyName}}" },
    { key: "csat-postclaim", name: "Post-claim satisfaction", category: "SATISFACTION", trigger: "LIFECYCLE_EVENT", requiresApproval: true,
      subject: "How did we handle your claim, {{firstName}}?",
      body: "Hi {{firstName}},\n\nNow that claim {{claimNumber}} has wrapped up, we'd love to know how the experience felt from your side. Were we responsive? Clear? Is there anything we could have done better?\n\nYour feedback shapes how we care for every client.\n\nWith appreciation,\n{{agencyName}}" },
    { key: "annual-checkin", name: "Annual coverage check-in", category: "SATISFACTION", trigger: "POLICY_ANNIVERSARY", offsetDays: 0, requiresApproval: true,
      subject: "Time for your annual coverage review, {{firstName}}",
      body: "Hi {{firstName}},\n\nIt's been a year on your {{lineOfBusiness}} policy — a great moment to make sure your coverage still fits your life. Anything change? New vehicle, home improvement, a growing family or business?\n\nLet's find 15 minutes to review. Reply here or call {{agencyPhone}}.\n\n{{producerName}}, {{agencyName}}" },
    { key: "review-request", name: "Online review request", category: "SATISFACTION", trigger: "MANUAL", requiresApproval: true,
      subject: "Would you share your experience, {{firstName}}?",
      body: "Hi {{firstName}},\n\nIf {{agencyName}} has made your insurance simpler, a short online review would mean the world to us — and helps neighbors find an agency that truly cares.\n\nOnly if you have a moment. Either way, thank you for trusting us.\n\n{{agencyName}}" },
    // RENEWAL
    { key: "renewal-90", name: "Renewal — 90 days", category: "RENEWAL", trigger: "RENEWAL_RELATIVE", offsetDays: -90,
      subject: "Looking ahead to your {{lineOfBusiness}} renewal, {{firstName}}",
      body: "Hi {{firstName}},\n\nYour {{lineOfBusiness}} policy {{policyNumber}} with {{carrierName}} renews on {{expirationDate}}. We've already started reviewing the market on your behalf to make sure you keep the right coverage at the right price.\n\nThere's nothing you need to do yet — we'll be in touch. Questions any time: {{agencyPhone}}.\n\n{{producerName}}" },
    { key: "renewal-60", name: "Renewal — 60 days", category: "RENEWAL", trigger: "RENEWAL_RELATIVE", offsetDays: -60,
      subject: "Your renewal review is underway, {{firstName}}",
      body: "Hi {{firstName}},\n\nA quick update: your {{lineOfBusiness}} renewal ({{expirationDate}}) is in progress. We're comparing options and confirming your coverage still matches your needs.\n\nIf anything's changed on your end, let me know so I can factor it in.\n\n{{producerName}}, {{agencyName}}" },
    { key: "renewal-30", name: "Renewal — 30 days", category: "RENEWAL", trigger: "RENEWAL_RELATIVE", offsetDays: -30, requiresApproval: true,
      subject: "Your {{lineOfBusiness}} renewal is almost here, {{firstName}}",
      body: "Hi {{firstName}},\n\nYour {{lineOfBusiness}} policy {{policyNumber}} renews on {{expirationDate}}. Here's where things stand — let's connect briefly to confirm everything looks right before it goes into effect.\n\nReply here or call {{agencyPhone}} and we'll take care of the rest.\n\n{{producerName}}" },
    { key: "renewal-thankyou", name: "Renewal thank-you", category: "RENEWAL", trigger: "RENEWAL_RELATIVE", offsetDays: 1,
      subject: "Thank you for renewing with us, {{firstName}}",
      body: "Hi {{firstName}},\n\nThank you for continuing to trust {{agencyName}} with your {{lineOfBusiness}} coverage. It's a privilege to keep protecting what matters to you.\n\nWe're here all year — never hesitate to reach out.\n\nWith gratitude,\n{{producerName}}" },
    // PAYMENT
    { key: "payment-upcoming", name: "Payment reminder (upcoming)", category: "PAYMENT", trigger: "PAYMENT_DUE_RELATIVE", offsetDays: -7,
      subject: "A friendly reminder: invoice {{invoiceNumber}}",
      body: "Hi {{firstName}},\n\nJust a gentle heads-up that invoice {{invoiceNumber}} for {{invoiceAmount}} is due on {{dueDate}}. You can pay securely here whenever it's convenient: {{payNowUrl}}\n\nAlready taken care of? Thank you — please disregard. Questions? Call {{agencyPhone}}.\n\n{{agencyName}}" },
    { key: "payment-receipt", name: "Payment receipt", category: "PAYMENT", trigger: "LIFECYCLE_EVENT",
      subject: "Payment received — thank you, {{firstName}}",
      body: "Hi {{firstName}},\n\nWe've received your payment for invoice {{invoiceNumber}} ({{invoiceAmount}}). Thank you! Your account is all set.\n\nWe appreciate you,\n{{agencyName}}" },
    { key: "payment-grace", name: "Payment past-due (grace)", category: "PAYMENT", trigger: "PAYMENT_DUE_RELATIVE", offsetDays: 5, requiresApproval: true,
      subject: "Let's keep your coverage active, {{firstName}}",
      body: "Hi {{firstName}},\n\nWe noticed invoice {{invoiceNumber}} ({{invoiceAmount}}, due {{dueDate}}) is still open. We'd hate for a missed payment to affect your coverage, so we wanted to reach out kindly.\n\nYou can pay here: {{payNowUrl}} — or call {{agencyPhone}} and we'll sort it out together. If there's a hardship, tell us; we'll help.\n\n{{agencyName}}" },
    // CLAIM (sensitive → approval on follow-ups)
    { key: "claim-ack", name: "Claim acknowledgement", category: "CLAIM", trigger: "LIFECYCLE_EVENT",
      subject: "We've got your claim, {{firstName}} ({{claimNumber}})",
      body: "Hi {{firstName}},\n\nWe're sorry you're dealing with this. Your claim {{claimNumber}} has been reported and we're on it. Someone from our team will guide you through every step — you won't be doing this alone.\n\nIf you need anything right now, call {{agencyPhone}}.\n\nHere for you,\n{{agencyName}}" },
    { key: "claim-checkin", name: "Claim check-in", category: "CLAIM", trigger: "LIFECYCLE_EVENT", requiresApproval: true,
      subject: "Checking in on your claim, {{firstName}}",
      body: "Hi {{firstName}},\n\nJust wanted to check in on claim {{claimNumber}}. How are things going? If there's anything you're waiting on or worried about, tell me and I'll chase it down for you.\n\n{{producerName}}, {{agencyName}}" },
    { key: "claim-closed", name: "Claim closed", category: "CLAIM", trigger: "LIFECYCLE_EVENT", requiresApproval: true,
      subject: "Your claim {{claimNumber}} is resolved, {{firstName}}",
      body: "Hi {{firstName}},\n\nGood news — claim {{claimNumber}} has been closed. We hope everything is back to normal. If anything still feels unfinished, please tell us; we're happy to help.\n\nThank you for your patience throughout.\n\n{{agencyName}}" },
    // APPRECIATION
    { key: "birthday", name: "Birthday wishes", category: "APPRECIATION", trigger: "BIRTHDAY", offsetDays: 0,
      subject: "Happy Birthday, {{firstName}}!",
      body: "Hi {{firstName}},\n\nHappy Birthday from all of us at {{agencyName}}! We hope your day is filled with the people and moments you love. Thank you for letting us be part of looking after what matters to you.\n\nCheers to you,\n{{agencyName}}" },
    { key: "policy-anniversary", name: "Policy anniversary", category: "APPRECIATION", trigger: "POLICY_ANNIVERSARY", offsetDays: 0,
      subject: "Celebrating a year together, {{firstName}}",
      body: "Hi {{firstName}},\n\nIt's been a year since your {{lineOfBusiness}} policy began with {{agencyName}} — thank you for your trust. We're proud to keep protecting what's important to you.\n\nWith appreciation,\n{{producerName}}" },
    { key: "tenure-3yr", name: "3-year tenure milestone", category: "APPRECIATION", trigger: "TENURE_MILESTONE", tenureMonths: 36,
      subject: "{{tenureYears}} years together — thank you, {{firstName}}",
      body: "Hi {{firstName}},\n\nYou've been part of the {{agencyName}} family for {{tenureYears}} years now, and that means the world to us. Thank you for your loyalty and trust. We're honored to keep serving you.\n\nWith heartfelt thanks,\n{{agencyName}}" },
    { key: "holiday-thanksgiving", name: "Thanksgiving greeting", category: "APPRECIATION", trigger: "HOLIDAY", holidayKey: "thanksgiving", offsetDays: -2,
      subject: "Grateful for you this Thanksgiving, {{firstName}}",
      body: "Hi {{firstName}},\n\nAs Thanksgiving approaches, we're reflecting on what we're grateful for — and clients like you are right at the top of that list. Thank you for trusting {{agencyName}}.\n\nWishing you a warm and happy Thanksgiving,\nThe {{agencyName}} team" },
    { key: "holiday-newyear", name: "New Year greeting", category: "APPRECIATION", trigger: "HOLIDAY", holidayKey: "newyear", offsetDays: -1,
      subject: "Happy New Year from {{agencyName}}, {{firstName}}!",
      body: "Hi {{firstName}},\n\nAs a new year begins, thank you for letting us be part of yours. Here's to a happy, healthy, and well-protected year ahead.\n\nWith warm wishes,\nThe {{agencyName}} team" },
    { key: "referral-thankyou", name: "Referral thank-you", category: "APPRECIATION", trigger: "LIFECYCLE_EVENT",
      subject: "Thank you for the referral, {{firstName}}!",
      body: "Hi {{firstName}},\n\nThank you so much for referring someone to {{agencyName}} — there's no higher compliment. We'll take wonderful care of them, just as we aim to for you.\n\nWith sincere gratitude,\n{{producerName}}" },
    // OFFBOARDING (sensitive → approval)
    { key: "cancel-ack-save", name: "Cancellation acknowledgement / save", category: "OFFBOARDING", trigger: "LIFECYCLE_EVENT", requiresApproval: true,
      subject: "We received your request, {{firstName}}",
      body: "Hi {{firstName}},\n\nWe've received your request regarding your {{lineOfBusiness}} coverage. Before anything changes, I'd love a quick conversation — sometimes there's an option that fits better, and either way we want to part (or stay) on the best possible terms.\n\nCould we talk this week? Reply here or call {{agencyPhone}}.\n\n{{producerName}}, {{agencyName}}" },
    { key: "goodbye", name: "Goodbye (offboarding)", category: "OFFBOARDING", trigger: "LIFECYCLE_EVENT", requiresApproval: true,
      subject: "Thank you for the trust, {{firstName}}",
      body: "Hi {{firstName}},\n\nThank you for the time you spent with {{agencyName}}. It's been our privilege to serve you. The door is always open — if your needs change, we'd be glad to welcome you back.\n\nWishing you all the best,\n{{agencyName}}" },
    { key: "winback-30", name: "Win-back — 30 days", category: "OFFBOARDING", trigger: "LIFECYCLE_EVENT", requiresApproval: true,
      subject: "Thinking of you, {{firstName}}",
      body: "Hi {{firstName}},\n\nIt's been about a month, and we wanted you to know we'd welcome you back any time. If you'd like a no-pressure review of your current coverage, just say the word.\n\nWarmly,\n{{producerName}}, {{agencyName}}" },
    { key: "winback-60", name: "Win-back — 60 days", category: "OFFBOARDING", trigger: "LIFECYCLE_EVENT", requiresApproval: true,
      subject: "A quick hello, {{firstName}}",
      body: "Hi {{firstName}},\n\nWe hope you're doing well. If your insurance ever feels more complicated than it should, we're here and happy to help — no obligation at all.\n\n{{agencyName}}" },
    { key: "winback-90", name: "Win-back — 90 days", category: "OFFBOARDING", trigger: "LIFECYCLE_EVENT", requiresApproval: true,
      subject: "The door's still open, {{firstName}}",
      body: "Hi {{firstName}},\n\nJust a final friendly note to say {{agencyName}} would love to earn back your business whenever the time is right. Either way, we wish you well.\n\nWith warm regards,\n{{agencyName}}" },
  ];
  await prisma.touchpointTemplate.createMany({
    data: tpls.map((t) => ({
      key: t.key, name: t.name, category: t.category, channel: "EMAIL" as const,
      triggerType: t.trigger, offsetDays: t.offsetDays ?? 0, holidayKey: t.holidayKey ?? null,
      tenureMonths: t.tenureMonths ?? null, subject: t.subject, body: t.body,
      active: true, requiresApproval: t.requiresApproval ?? false,
    })),
  });

  // Communication preferences for the first 12 clients (defaults: opted in).
  // One client opts out of appreciation; one is do-not-contact (so the
  // engine demonstrably skips them).
  for (const [i, c] of clients.slice(0, 12).entries()) {
    await prisma.clientCommunicationPreferences.create({
      data: {
        clientId: c.id,
        optAppreciation: i !== 4, // clients[4] opted out of appreciation
        doNotContact: i === 11, // clients[11] is do-not-contact
      },
    });
  }

  // A few already-SENT history rows on the demo client (Harborview, clients[1])
  // so the 360 communication timeline shows real history.
  const harborGlForTp = policyIds.find((p) => p.policyNumber.startsWith("GL-HAR"));
  const historySpecs: Array<[string, number, "SENT" | "SKIPPED", string | null]> = [
    ["onboard-welcome", -210, "SENT", null],
    ["onboard-portal-nudge", -208, "SENT", null],
    ["renewal-90", -95, "SENT", harborGlForTp?.id ?? null],
    ["holiday-thanksgiving", -45, "SENT", null],
  ];
  for (const [key, dayOffset, status, relId] of historySpecs) {
    const tpl = tpls.find((t) => t.key === key)!;
    await prisma.scheduledTouchpoint.create({
      data: {
        clientId: clients[1]!.id,
        templateKey: key,
        channel: "EMAIL",
        status,
        scheduledFor: daysFromNow(dayOffset),
        sentAt: status === "SENT" ? daysFromNow(dayOffset) : null,
        toAddress: status === "SENT" ? "office@harborviewbuilders.example.com" : null,
        renderedSubject: status === "SENT" ? tpl.subject.replace("{{firstName}}", "Harborview Builders LLC").replace("{{agencyName}}", "Tabor Agency") : null,
        renderedBody: status === "SENT" ? "Seed history — see template for full copy." : null,
        relatedType: relId ? "Policy" : "LifecycleEvent",
        relatedId: relId,
        idempotencyKey: `seed:${key}:${clients[1]!.id}:${dayOffset}`,
      },
    });
  }
  // One PENDING (needs-approval) row so the staff queue isn't empty on first load.
  await prisma.scheduledTouchpoint.create({
    data: {
      clientId: clients[0]!.id,
      templateKey: "annual-checkin",
      channel: "EMAIL",
      status: "PENDING",
      scheduledFor: daysFromNow(0),
      relatedType: "LifecycleEvent",
      relatedId: null,
      idempotencyKey: `seed:annual-checkin:${clients[0]!.id}:pending`,
    },
  });

  // ── AI Compare / coverage-analysis demo rows (Wave D) ───────────────
  // Seed a few PolicyAnalysis rows so every surface renders: one public
  // ANALYZED-with-gaps (powers the public results + staff queue), one
  // CLIENT_PORTAL analyzed for Harborview (the portal checkup demo), and
  // one PENDING public submission (the manual-review path). The gap/rec
  // JSON mirrors the shapes produced by the deterministic gap engine.
  const harborClient = clients[1]; // Harborview Builders LLC (portal demo)

  // A realistic under-insured personal-auto report (grade C).
  const autoGaps = {
    lineOfBusiness: "AUTO",
    score: 68,
    grade: "C",
    gapCount: 3,
    findings: [
      { key: "auto-bi-low", kind: "UNDER_LIMIT", severity: "high", code: "BI", label: "Bodily injury liability",
        detail: "Bodily-injury limits are below the 100/300 the agency recommends. A serious at-fault accident can easily exceed low state-minimum limits, exposing personal assets.",
        found: "50/100", recommended: "≥ 100/300" },
      { key: "auto-um-missing", kind: "MISSING", severity: "high", code: "UM", label: "Uninsured/underinsured motorist",
        detail: "No uninsured/underinsured motorist coverage found. Roughly 1 in 8 drivers is uninsured — UM/UIM pays YOUR injuries when an at-fault driver can't.", recommended: "Match BI limits" },
      { key: "auto-med-missing", kind: "MISSING", severity: "low", code: "MED", label: "Medical payments",
        detail: "No medical-payments coverage — a low-cost add-on that covers medical bills for you and your passengers regardless of fault.", recommended: "$5,000" },
      { key: "auto-bi-okp", kind: "PRESENT_OK", severity: "info", code: "PD", label: "Property damage liability",
        detail: "Property-damage liability is present." },
    ],
  };
  const autoRecs = {
    recommendations: [
      { key: "auto-bi-low", title: "Increase Bodily injury liability to ≥ 100/300", severity: "high",
        detail: "Bodily-injury limits are below the 100/300 the agency recommends." },
      { key: "auto-um-missing", title: "Add Uninsured/underinsured motorist", severity: "high",
        detail: "Roughly 1 in 8 drivers is uninsured — UM/UIM pays your injuries when an at-fault driver can't." },
      { key: "auto-med-missing", title: "Add Medical payments", severity: "low",
        detail: "A low-cost add-on that covers medical bills regardless of fault." },
    ],
    crossSell: [
      { key: "home-from-auto", lob: "HOME", title: "Cross-sell homeowners", priority: 2, estPremium: 2400,
        rationale: "Auto-only client — bundle a homeowners policy for a multi-policy discount and stickier retention." },
    ],
  };

  await prisma.policyAnalysis.create({
    data: {
      source: "PUBLIC_UPLOAD",
      status: "ANALYZED",
      uploaderName: "Morgan Reyes",
      uploaderEmail: "morgan.reyes@example.com",
      lineOfBusiness: "AUTO",
      carrierName: "Progressive",
      summaryText:
        "This Personal Auto policy with Progressive scores 68/100 (grade C) — adequate but with meaningful gaps to close. Your liability limits are on the low side at 50/100, and there's no uninsured-motorist coverage, which leaves you exposed if an at-fault driver can't pay. Raising your liability to 100/300 and adding UM/UIM are inexpensive moves that meaningfully improve your protection. Let's review your options together.",
      score: 68,
      gapsJson: autoGaps,
      recommendationsJson: autoRecs,
      extractedJson: {
        lineOfBusiness: "AUTO", carrierName: "Progressive", namedInsureds: ["Morgan Reyes"],
        coverages: [
          { code: "BI", label: "Bodily injury", limitText: "50/100" },
          { code: "PD", label: "Property damage", limitAmount: 50000 },
        ], vehicles: ["2021 Honda CR-V"],
      },
    },
  });

  // A clean homeowners checkup for the portal client (grade A).
  if (harborClient) {
    await prisma.policyAnalysis.create({
      data: {
        source: "CLIENT_PORTAL",
        status: "ANALYZED",
        clientId: harborClient.id,
        lineOfBusiness: "GENERAL_LIABILITY",
        carrierName: "Travelers",
        summaryText:
          "This General Liability policy with Travelers scores 88/100 (grade B) — solid, with a few improvements worth considering. Your per-occurrence and aggregate limits meet the $1M/$2M most contracts require. Consider confirming products/completed-operations coverage is adequate for your construction work. Overall this is well-rounded protection.",
        score: 88,
        gapsJson: {
          lineOfBusiness: "GENERAL_LIABILITY", score: 88, grade: "B", gapCount: 1,
          findings: [
            { key: "gl-occ-okp", kind: "PRESENT_OK", severity: "info", code: "GL_OCC", label: "Each occurrence", detail: "Per-occurrence GL limit meets the $1M baseline." },
            { key: "tpl-GENERAL_LIABILITY-GL_DAMPREM", kind: "MISSING", severity: "low", code: "GL_DAMPREM", label: "Damage to rented premises",
              detail: "Damage to rented premises is part of a complete general liability policy but was not found on this one. Confirm whether it was declined or simply not listed." },
          ],
        },
        recommendationsJson: {
          recommendations: [
            { key: "tpl-GENERAL_LIABILITY-GL_DAMPREM", title: "Add Damage to rented premises", severity: "low",
              detail: "Confirm whether this common GL coverage was declined or simply not listed." },
          ],
          crossSell: [
            { key: "cyber-roundout", lob: "CYBER", title: "Add cyber liability", priority: 4, estPremium: 2200,
              rationale: "No cyber line on a commercial account — nearly every business has a data/ransomware exposure." },
          ],
        },
      },
    });
  }

  // A pending public submission (manual-review path before any AI key).
  await prisma.policyAnalysis.create({
    data: {
      source: "PUBLIC_UPLOAD",
      status: "PENDING",
      uploaderName: "Casey Lin",
      uploaderEmail: "casey.lin@example.com",
      lineOfBusiness: "HOME",
    },
  });

  // ── Wave D-final demo data ─────────────────────────────────────────

  // Household linking two related individual clients (Walter & Janet
  // Simmons as primary + Robert & Lisa Patel) so the combined 360 and
  // cross-sell-across-the-household demo has data.
  const household = await prisma.household.create({
    data: { name: "Simmons–Patel household", primaryClientId: clients[0]!.id },
  });
  await prisma.client.update({ where: { id: clients[0]!.id }, data: { householdId: household.id, householdRole: "PRIMARY" } });
  await prisma.client.update({ where: { id: clients[8]!.id }, data: { householdId: household.id, householdRole: "SPOUSE" } });

  // Carrier appetite rows so the market finder has data. Progressive
  // (preferred auto), Travelers (preferred home/condo), and a couple more.
  const appetiteSpecs: Array<[string, LineOfBusiness, "PREFERRED" | "STANDARD" | "RESTRICTED" | "DECLINE", string | null]> = [
    ["Progressive", "AUTO", "PREFERRED", "SC, NC, GA"],
    ["Progressive", "MOTORCYCLE", "STANDARD", null],
    ["Travelers", "HOME", "PREFERRED", "SC"],
    ["Travelers", "CONDO", "PREFERRED", "SC"],
    ["Travelers", "UMBRELLA", "STANDARD", null],
    ["Nationwide", "HOME", "STANDARD", null],
    ["Nationwide", "CONDO", "RESTRICTED", "No coastal within 1 mile"],
    ["The Hartford", "GENERAL_LIABILITY", "PREFERRED", null],
    ["The Hartford", "BOP", "PREFERRED", null],
    ["Chubb", "HOME", "PREFERRED", "High-value only — TIV > $1M"],
  ];
  for (const [carrierName, lob, appetite, notes] of appetiteSpecs) {
    const carrier = carriers[carrierName];
    if (!carrier) continue;
    await prisma.carrierAppetiteRow.upsert({
      where: { carrierId_lineOfBusiness: { carrierId: carrier.id, lineOfBusiness: lob } },
      update: { appetite, classNotes: notes },
      create: { carrierId: carrier.id, lineOfBusiness: lob, appetite, states: lob === "AUTO" || lob === "HOME" || lob === "CONDO" ? (carrierName === "Progressive" ? "SC,NC,GA" : "SC") : null, classNotes: notes },
    });
  }
  // UW guidelines + binding authority notes on one carrier.
  const hartford = carriers["The Hartford"];
  if (hartford) {
    await prisma.carrier.update({
      where: { id: hartford.id },
      data: {
        uwGuidelinesUrl: "https://agents.thehartford.example.com/uw-guidelines",
        uwGuidelinesNotes: "Small-business sweet spot; refer any single location with TIV > $10M.",
        bindingAuthorityNotes: "Bind GL/BOP up to $25k premium; refer anything above or with prior losses.",
        bindingAuthorityLimit: 25000,
      },
    });
  }

  // A surplus-lines policy + its filing. Pick a commercial policy and mark
  // it as a non-admitted placement that still needs filing (PENDING).
  const slPolicy = policyIds.find((p) => p.lob === "GENERAL_LIABILITY") ?? policyIds[0];
  if (slPolicy) {
    await prisma.surplusLinesFiling.upsert({
      where: { policyId: slPolicy.id },
      update: {},
      create: {
        policyId: slPolicy.id,
        state: "SC",
        status: "PENDING",
        taxRatePct: 6,
        surplusLinesTax: Math.round(slPolicy.premium * 0.06 * 100) / 100,
        stampingFee: 25,
        diligentSearchDone: true,
        affidavitOnFile: false,
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        notes: "Non-admitted E&S placement — affidavit pending the insured's signature.",
      },
    });
  }

  // An e-signature request (manual flow — no provider configured by default).
  await prisma.signatureRequest.create({
    data: {
      provider: "MANUAL",
      status: "SENT",
      docKind: "PROPOSAL",
      title: `Proposal — ${clients[1]!.name}`,
      signerName: clients[1]!.name,
      signerEmail: "office@harborviewbuilders.example.com",
      clientId: clients[1]!.id,
      policyId: policyIds.find((p) => p.clientIdx === 1)?.id ?? null,
      message: "Please review and sign the attached commercial proposal.",
      sentAt: new Date(),
      createdById: james.id,
    },
  });

  // A group benefits plan for an employer client (light stub module).
  await prisma.groupPlan.create({
    data: {
      clientId: clients[1]!.id,
      planType: "GROUP_HEALTH",
      planName: "2026 Group Medical PPO",
      carrierName: "Blue Cross Blue Shield SC",
      groupNumber: "GRP-HARB-2026",
      effectiveDate: new Date(new Date().getFullYear(), 0, 1),
      renewalDate: new Date(new Date().getFullYear() + 1, 0, 1),
      eligibleCount: 42,
      enrolledCount: 31,
      rateBasis: "PEPM",
      monthlyPremium: 24800,
      notes: "Renews 1/1. Considering adding a dental line at renewal.",
    },
  });
  await prisma.client.update({ where: { id: clients[1]!.id }, data: { hasBenefits: true } });

  // ── Summary ────────────────────────────────────────────────────────
  const counts = await prisma.$transaction([
    prisma.user.count(), prisma.carrier.count(), prisma.client.count(), prisma.policy.count(),
    prisma.lead.count(), prisma.quote.count(), prisma.claim.count(), prisma.commissionStatement.count(),
    prisma.license.count(), prisma.campaign.count(), prisma.invoice.count(), prisma.certificate.count(),
  ]);
  console.log(
    `Seeded: ${counts[0]} users, ${counts[1]} carriers, ${counts[2]} clients, ${counts[3]} policies, ` +
    `${counts[4]} leads, ${counts[5]} quotes, ${counts[6]} claims, ${counts[7]} statements, ` +
    `${counts[8]} licenses, ${counts[9]} campaigns, ${counts[10]} invoices, ${counts[11]} certificates.`,
  );
  console.log("Admin login: ericbbowman2@gmail.com / Ins2026!");
  console.log("Portal login: client@taboragency.com / Client2026! (Harborview Builders LLC)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
