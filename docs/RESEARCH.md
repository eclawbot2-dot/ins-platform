# AMS Research — what a modern insurance agency management system must do

Researched June 2026 against the feature sets of Applied Epic, EZLynx, HawkSoft,
NowCerts, AgencyZoom, Veruna, and AgencyBloc, plus independent-agency workflow
literature (commission reconciliation, ACORD certificates, producer licensing).

## 1. The market

| System | Positioning | Signature strengths |
|---|---|---|
| **Applied Epic** | Enterprise AMS for larger/multi-location agencies | Full policy lifecycle, integrated agency accounting, carrier connectivity (IVANS downloads), workflow automation, deep reporting |
| **EZLynx** | Rater-first platform for growing agencies | Real-time comparative rating across ~300 P&C carriers, client portal, marketing automation; lighter on commissions/accounting |
| **HawkSoft** | Independent-agency favorite | Client+policy management, document storage, e-sign, task tracking, strong support; entry ~$250/mo |
| **NowCerts** | Modern cloud AMS | Self-service certificates (ACORD 25), automation, carrier downloads, commissions |
| **AgencyZoom** | Sales/CRM layer | Lead pipelines, lead-source ROI, producer scoreboards, onboarding journeys |
| **Veruna** | Salesforce-native AMS | CRM-grade customization, open data model |
| **AgencyBloc** | Life & health niche | Commission processing, carrier appointment tracking, compliance |

Key takeaway: an AMS is the agency's system of record for **clients, policies,
carriers, commissions, claims, certificates, and compliance** — with a CRM/sales
pipeline bolted to the front and accounting/reporting bolted to the back.

## 2. Core domain workflows

### Policy lifecycle
Quote → Bound → Active → (Endorsements mid-term) → Renewal offer at X-date →
Renewed | Cancelled (insured- or carrier-initiated) | Expired | Non-renewed.
Personal lines: Auto, Home, Renters, Umbrella, Life, Health. Commercial lines:
GL, Commercial Property, BOP, Workers Comp, Commercial Auto, Cyber,
Professional/E&O, Inland Marine. Each policy carries carrier (and optionally an
MGA/wholesaler), premium, commission rate & amount, billing type, term dates,
producer + CSR assignment.

### Agency bill vs direct bill
- **Agency bill**: the agency invoices the insured, collects premium, deducts
  its commission, remits net to the carrier. Commission is received up front;
  the agency carries AR (hence invoices + AR aging in the AMS).
- **Direct bill**: the carrier bills the insured directly and pays commission
  to the agency later (often monthly statements, up to a quarter behind).
  Reconciliation of those statements against expected commission is the
  most labor-intensive back-office workflow in agencies.

### Commission reconciliation (the #1 pain point per Applied/Vertafore)
Every carrier delivers commission statements in different formats (75% of PDFs
are unique formats); teams reconcile in spreadsheets. The AMS must: ingest
statement line items (CSV at minimum), match each line to a policy by policy
number, compare actual vs expected commission (premium × negotiated rate for
the LOB, new vs renewal), flag variances, and roll up producer payables from
split rules (% per producer per policy).

### Renewals / remarketing
The renewal pipeline is driven by expiration dates ("X-dates"). 30/60/90-day
buckets are standard dashboard tiles. Workflow: Pending review → (if premium
jump or poor fit) Remarketing across carriers → Quoted → Renewed | Lost.
Renewal tasks are auto-generated ahead of the X-date. Retention rate
(renewed / expiring) is the headline agency KPI.

### Certificates of insurance (ACORD 25)
Most-issued document in commercial lines. Fields: producer (agency) info,
named insured, insurer(s) (A/B/C... letters), per-coverage rows (type, policy
number, effective/expiration, limits), description of operations, certificate
holder, cancellation clause, authorized representative. Agencies keep a
certificate-holder directory and reissue at renewal. Flags: additional
insured, waiver of subrogation.

### Claims (FNOL)
First Notice of Loss entry: date of loss, description, policy, carrier claim
ref once assigned, adjuster contact, reserve and paid amounts, status workflow
(Reported → Open → Under review → Approved/Denied → Closed), follow-up tasks.
The agency tracks claims for advocacy even though the carrier adjudicates.

### Compliance
- **Producer licensing**: per-state licenses with license number, NPN
  (national producer number), class (P&C, L&H, personal lines, surplus,
  adjuster), expiration; CE requirements typically 24 hours per biennium
  with ~3 ethics hours; credits are tracked per license.
- **Carrier appointments**: a producer/agency must be appointed by a carrier
  to sell its paper; appointment status + dates are tracked per carrier.
- **Agency E&O**: the agency's own errors & omissions policy must never lapse
  (limits, term, carrier tracked; expiration alerts).
- Alerting standard: dashboard warnings within 60 days of any expiration.

### CRM / sales
Leads with sources (referral is the highest-converting source), lead scoring,
opportunity pipeline (New → Contacted → Quoting → Proposal → Bound → Lost),
activities/notes/tasks with due dates, and a "client 360" view aggregating
policies, claims, invoices, documents, and the activity timeline.

### Marketing
Campaigns by channel with budget; lead-source ROI (leads → bound conversion,
premium per source); referral tracking.

### Reporting
Book of business by carrier / LOB / producer; retention; new vs renewal
premium trend; commission revenue; pipeline funnel; producer production
reports. Everything exports to CSV (agency finance lives in Excel).

## 3. Integration landscape

- **Accounting**: QuickBooks/Xero sync of agency-bill invoices; online
  payment links surfaced from the accounting system (this portfolio's rule:
  Xero is the accounting system of record — surface Xero "Pay now" links,
  never direct Stripe charges).
- **Email/calendar**: Google Workspace / M365 for correspondence + renewal
  calendar events.
- **Rating**: comparative raters (EZLynx, PL Rating) — paid APIs, out of scope.
- **Carrier connectivity**: IVANS download — proprietary, out of scope.
- **E-signature**: DocuSign et al — out of scope for v1 (printable HTML
  proposals/COIs instead).

## Sources

- [Brightway — Best AMS Platforms 2025](https://www.brightway.com/news/best-agency-management-systems-ams-platforms-for-insurance-agencies-2025)
- [GloveBox — 5 Best Insurance AMS feedback](https://glovebox.io/blog/best-insurance-agency-management-systems/)
- [SelectHub — EZLynx vs HawkSoft 2026](https://www.selecthub.com/insurance-agency-management-systems/ezlynx-vs-hawksoft/)
- [unLocked CRM — Best AMS 2026](https://www.unlockedcrm.ai/blog/best-agency-management-system-insurance-2026)
- [Catalyit — AMS Guide](https://catalyit.com/guides/ams)
- [Applied Systems — Why Commission Reconciliation Is Breaking Agencies](https://www1.appliedsystems.com/en-us/blog/posts/how-to-fix-reconciliation-applied-recon/)
- [Vertafore Ascend](https://www.vertafore.com/ascend)
- [SelectSys — Direct Bill Commission Reconciliation](https://www.selectsys.com/blog/direct-bill-commission-reconciliation-pc-insurance)
- [ePayPolicy — Agency Bill or Direct Bill](https://epaypolicy.com/blog/agency-bill-or-direct-bill/)
- [HawkSoft — Direct vs agency bill pain points](https://blog.hawksoft.com/direct-vs-agency-bill-solving-pain-points)
- [Infrrd — ACORD 25 Guide](https://www.infrrd.ai/blog/acord-25-certificate-of-liability-insurance-guide)
- [TotalCSR — Completing the ACORD 25](https://totalcsr.com/insurance-agency-blog/how-to-complete-the-acord-25-certificate-of-liability/)
- [Vertikal RMS — ACORD 25/27 explained](https://www.vertikalrms.com/article/acord-25-27-forms-complete-insurance-certificate-guide/)
- [Agenzee — Insurance License Management for Agencies](https://agenzee.com/insurance-license-management-for-agencies-compliance-requirements-best-practices/)
- [NIPR — CE requirements](https://nipr.com/licensing-center/continuing-education-requirements)
- [NIPR — Licensing center](https://nipr.com/licensing-center)
