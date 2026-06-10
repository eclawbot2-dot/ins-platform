# ins-platform — Requirements

Derived from docs/RESEARCH.md (AMS market study, June 2026). Everything below
is in scope for v1 and implemented unless marked *deferred*.

## R1 Dashboard
- KPI tiles: total book premium (active), active policies, clients, YTD new
  business premium, renewals due 30/60/90, open claims, pipeline value,
  commissions MTD.
- Activity feed (latest activities across the agency).
- Compliance warnings: producer licenses / carrier appointments / agency E&O
  expiring within 60 days.

## R2 CRM
- Clients: individual + business types; statuses Prospect/Active/Inactive/
  Former; producer + CSR assignment; full address; client 360 detail view
  (policies, claims, invoices, certificates, documents, contacts, activity
  timeline, open tasks).
- Contacts per client (primary flag).
- Leads: source, optional campaign, status (New/Contacted/Qualified/
  Converted/Lost), deterministic 0–100 score + A–D grade, assignment,
  convert-to-client action.
- Opportunities: pipeline stages New → Contacted → Quoting → Proposal →
  Bound → Lost; premium estimate; weighted pipeline value; lost reasons.
- Activities (note/call/email/meeting) attachable to client, lead, policy,
  claim, opportunity. Tasks with due dates, priorities, statuses, assignee.

## R3 Policies
- Full lifecycle: Quote/Bound/Active/Renewed/Cancelled/Expired/Non-renewed.
- 14 lines of business (6 personal, 8 commercial).
- Carrier + optional MGA, premium, commission rate % + computed amount,
  billing type (agency/direct bill), effective/expiration dates, producer,
  CSR, new-vs-renewal flag, renewal chain (renewalOf).
- Endorsement history with premium change (prorated helper).
- Cancellation with reason + date; pro-rata / short-rate return premium math.
- Producer splits (% per producer per policy, must sum to 100).

## R4 Carriers
- Directory with NAIC code, AM Best rating, portal URL, phone, payment terms.
- Appointment status (Appointed/Pending/Terminated/Not appointed) + dates,
  expiration alerts.
- Commission schedules per LOB: new % vs renewal %.
- Carrier contacts.

## R5 Quoting
- Quote requests per lead/client + LOB; statuses Open/Quoted/Presented/
  Bound/Lost.
- Multi-carrier quote comparison grid per request.
- Bind action: quote → policy (carries premium, carrier, LOB, dates,
  commission from carrier schedule).
- Printable proposal (HTML, print stylesheet).

## R6 Renewals
- Renewal records driven by expiration dates of active policies (90-day
  window auto-generation + manual).
- Statuses: Pending review / Remarketing / Quoted / Renewed / Lost.
- Renewal task auto-generation; premium-change % + remarket threshold logic.
- "Generate renewals" action scans the book and creates missing records.

## R7 Claims
- FNOL entry: policy, client, date of loss, description.
- Claim number auto-assigned (CLM-YYYY-NNNNN); carrier claim ref.
- Status workflow Reported/Open/Under review/Approved/Denied/Closed.
- Adjuster info, reserve + paid amounts, follow-up tasks, documents.

## R8 Commissions
- Carrier statement entry + CSV import (policyNumber, insuredName,
  transactionType, premium, commissionAmount).
- Reconciliation: line ↔ policy match by normalized policy number; expected
  commission = premium × rate; variance flag beyond $1 tolerance; statement
  summary (matched/variance/unmatched/net variance).
- Producer split rules per policy; producer payables report (commission ×
  split % over reconciled statements).

## R9 Certificates (ACORD 25 model)
- Certificate-holder directory.
- Certificate issuance: insured (client), holder, coverage rows (type,
  carrier, policy number, dates, limits), description of operations,
  additional-insured + waiver-of-subrogation flags.
- COI numbers (COI-YYYY-NNNNN); printable ACORD-25-style HTML.

## R10 Documents
- Uploads stored under uploads/ (gitignored), attached to client/policy/
  claim, typed (policy doc, application, endorsement, certificate, claim
  doc, correspondence, ID card, loss run, other), authenticated download.

## R11 Compliance
- Producer licenses: state, number, NPN, class, expiration, CE required
  hours; CE credits (course, hours, ethics flag, completion date) with
  progress computation.
- Agency E&O policy tracking (limits, term).
- Carrier appointment expirations.
- Dashboard + compliance-page alerts within 60 days (CRITICAL ≤30).

## R12 Team / producers
- User management (admin): roles ADMIN/PRODUCER/CSR, activate/deactivate,
  password set, default split %.
- Production report per producer: written premium, policy count, commission,
  by period.

## R13 Marketing
- Campaigns: name, channel, budget, dates.
- Lead-source ROI report: leads → bound conversion, premium per source.
- Referral tracking (referrer, reward).

## R14 Accounting / Xero
- Invoices for agency-bill policies (number INV-YYYY-NNNNN, lines, due
  dates, status Draft/Sent/Partial/Paid/Void).
- AR aging view (Current/1–30/31–60/61–90/90+).
- Xero OAuth connect in Settings → Integrations; invoice push (ACCREC),
  status pull, **Xero "Pay now" online-payment links** surfaced on invoices
  (never direct Stripe). Sync-job history. Degrades cleanly without
  XERO_CLIENT_ID/SECRET.

## R15 Google Workspace
- SA + domain-wide delegation (key file C:/Users/bot/secrets/
  ins-workspace-sa.json — graceful degradation + setup instructions when
  absent). Gmail send; Calendar event creation for tasks/renewals.

## R16 Reporting
- Book of business by carrier / LOB / producer; retention rate; new vs
  renewal premium trend (12 months); commission revenue; pipeline funnel.
  All with CSV export.

## R17 Settings
- Agency profile; users (R12); integrations status (Xero, Google, Resend);
  email templates; lead-intake key management; audit log (logins + critical
  changes).

## R18 Public lead intake API
- POST /api/public/leads, JSON {firstName,lastName,email,phone,zip,
  lineOfBusiness,message,source}; header X-Lead-Key must match env
  LEAD_INTAKE_KEY or an active DB-managed key; CORS for
  https://ins.jahdev.com; creates Lead + scores it + notification task.

## Non-functional
- Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4, Prisma 7 on
  PostgreSQL 16, NextAuth v5 credentials + bcrypt, port 3220.
- All absolute URLs from APP_URL (Cloudflare-tunnel rule) — never req.url.
- Password reset says "Email not found" for unknown emails (portfolio UX rule).
- Email via Resend pattern, log-only fallback, sender no-reply@ins.jahdev.com.
- CI: tsc --noEmit + vitest run; 60+ unit tests on domain logic.
- Seeded demo data so every page renders meaningfully.

### Deferred (need paid/proprietary APIs)
- Comparative rating (EZLynx-class), IVANS carrier downloads, e-signature,
  NIPR/PDB license verification, PDF OCR statement ingest, SMS.
