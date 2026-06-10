/**
 * Seed — realistic demo agency so every page renders meaningful data.
 *
 *   npm run db:seed   (or npm run setup)
 *
 * Wipes and re-creates all rows (dev-only data). Admin login:
 *   ericbbowman2@gmail.com / Ins2026!
 */

import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient, type LineOfBusiness, type PolicyStatus } from "@prisma/client";
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
    prisma.policy.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.campaign.deleteMany(),
    prisma.contact.deleteMany(),
    prisma.client.deleteMany(),
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
      name: "Lowcountry Insurance Group",
      addressLine1: "1310 Meeting Street, Suite 200",
      city: "Charleston",
      state: "SC",
      zip: "29405",
      phone: "843-555-0100",
      email: "office@ins.jahdev.com",
      website: "https://ins-website-sandy.vercel.app",
      licenseNumber: "SC-AGY-204477",
    },
  });
  await prisma.emailTemplate.createMany({
    data: [
      {
        key: "renewal-notice",
        name: "Renewal notice",
        subject: "Your {{lineOfBusiness}} policy renews on {{expirationDate}}",
        body: "Hi {{clientName}},\n\nYour policy {{policyNumber}} with {{carrierName}} is coming up for renewal on {{expirationDate}}. We are reviewing the market to make sure you have the best fit.\n\n— {{producerName}}, Lowcountry Insurance Group",
      },
      {
        key: "new-client-welcome",
        name: "New client welcome",
        subject: "Welcome to Lowcountry Insurance Group",
        body: "Hi {{clientName}},\n\nThanks for trusting us with your insurance. Your service team is {{producerName}} (producer) and {{csrName}} (account manager).\n\n— Lowcountry Insurance Group",
      },
      {
        key: "coi-delivery",
        name: "Certificate delivery",
        subject: "Certificate of insurance {{certNumber}}",
        body: "Attached is certificate {{certNumber}} for {{holderName}}.\n\n— Lowcountry Insurance Group",
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
    { name: "Progressive", naic: "24260", amBest: "A+", portal: "https://foragentsonly.com", phone: "800-776-4737", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 1), lobs: [["AUTO", 12, 10], ["HOME", 13, 11], ["RENTERS", 12, 10], ["COMMERCIAL_AUTO", 14, 12]] },
    { name: "Travelers", naic: "25658", amBest: "A++", portal: "https://agenthq.travelers.com", phone: "800-842-5075", appt: "APPOINTED", apptExpires: daysFromNow(38), lobs: [["AUTO", 12, 10], ["HOME", 14, 12], ["BOP", 16, 14], ["GENERAL_LIABILITY", 15, 13], ["UMBRELLA", 12, 10], ["WORKERS_COMP", 10, 9]] },
    { name: "Hartford", naic: "19682", amBest: "A+", portal: "https://eba.thehartford.com", phone: "860-547-5000", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 1), lobs: [["BOP", 17, 15], ["WORKERS_COMP", 11, 9], ["GENERAL_LIABILITY", 15, 13], ["COMMERCIAL_PROPERTY", 16, 14]] },
    { name: "Liberty Mutual", naic: "23043", amBest: "A", portal: "https://agentsolutions.libertymutual.com", phone: "800-225-2467", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 2), lobs: [["AUTO", 11, 9], ["HOME", 13, 11], ["COMMERCIAL_AUTO", 14, 12]] },
    { name: "Chubb", naic: "20281", amBest: "A++", portal: "https://agents.chubb.com", phone: "800-252-4670", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 1), lobs: [["HOME", 15, 13], ["UMBRELLA", 13, 11], ["CYBER", 18, 16], ["PROFESSIONAL", 17, 15]] },
    { name: "Nationwide", naic: "23787", amBest: "A", portal: "https://agentcenter.nationwide.com", phone: "877-669-6877", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 1), lobs: [["AUTO", 12, 10], ["HOME", 13, 11], ["LIFE", 40, 5], ["BOP", 16, 14]] },
    { name: "Safeco", naic: "39012", amBest: "A", portal: "https://now.safeco.com", phone: "800-332-3226", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 2), lobs: [["AUTO", 12, 10], ["HOME", 13, 11], ["UMBRELLA", 12, 10], ["RENTERS", 12, 10]] },
    { name: "Hanover", naic: "22292", amBest: "A", portal: "https://tap.hanover.com", phone: "800-922-8427", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 1), lobs: [["BOP", 16, 14], ["COMMERCIAL_PROPERTY", 16, 14], ["INLAND_MARINE", 15, 13]] },
    { name: "CNA", naic: "20443", amBest: "A", portal: "https://agent.cna.com", phone: "800-262-2000", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 1), lobs: [["GENERAL_LIABILITY", 15, 13], ["WORKERS_COMP", 10, 9], ["PROFESSIONAL", 17, 15]] },
    { name: "Berkshire GUARD", naic: "42390", amBest: "A+", portal: "https://www.guard.com/agents", phone: "800-673-2465", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 2), lobs: [["WORKERS_COMP", 11, 10], ["BOP", 15, 13]] },
    { name: "Hiscox", naic: "10200", amBest: "A", portal: "https://partner.hiscox.com", phone: "866-283-7545", appt: "PENDING", lobs: [["PROFESSIONAL", 18, 16], ["CYBER", 18, 16], ["GENERAL_LIABILITY", 15, 13]] },
    { name: "Foremost", naic: "11185", amBest: "A", portal: "https://foremoststar.com", phone: "800-527-3905", appt: "APPOINTED", apptExpires: addYearsUtc(TODAY, 1), lobs: [["HOME", 13, 11], ["RENTERS", 12, 10], ["INLAND_MARINE", 14, 12]] },
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
  const docSpecs: Array<[string, string, "POLICY_DOC" | "LOSS_RUN", number, string | null]> = [
    ["simmons-ho-declarations.txt", "Sample declarations page — Travelers homeowners HO-TRA series.\nSeed data for ins-platform demo.", "POLICY_DOC", 0, "HO-TRA"],
    ["coastal-hvac-loss-runs.txt", "3-year loss run summary — Coastal HVAC Services.\nNo open losses as of last carrier report.\nSeed data for ins-platform demo.", "LOSS_RUN", 7, "GL-CNA"],
  ];
  for (const [fileName, content, docType, clientIdx, pnPrefix] of docSpecs) {
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
        uploadedById: molly.id,
      },
    });
  }

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
