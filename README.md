# ins-platform — Tabor Agency

**Tabor Agency** insurance agency management system (AMS) + client portal —
CRM, policies, quoting, renewals, claims, commissions, certificates,
compliance, accounting, marketing, and reporting for an independent P&C
agency, plus a customer-facing portal at `/portal`.

- **Live URL:** https://ins.jahdev.com (Cloudflare tunnel → localhost:3220);
  the client portal also answers at https://portal.taboragency.com (NS cutover pending)
- **Staff login:** `b@taboragency.com` at `/login` — the seed RANDOMIZES the
  admin password (set `SEED_ADMIN_PASSWORD` before seeding to choose it); the
  live password is whatever the owner last set — never reset it for QA
- **Client portal login:** `client@taboragency.com` / `Client2026!` (seeded demo client) at `/portal/login`
- **Brand:** all brand strings live in `src/lib/brand.ts` (navy `#13294B` / gold palette in `globals.css`)
- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind 4 ·
  Prisma 7 on PostgreSQL 16 (`@prisma/adapter-pg`) · NextAuth v5 (credentials + bcrypt) · Vitest

## Quick start

```bash
# Prereqs: Node 22+, PostgreSQL 16 with database `ins` (user ins / ins_dev)
cp .env.example .env        # fill in AUTH_SECRET at minimum
npm install
npm run setup               # prisma generate + migrate deploy + seed
npm run dev                 # http://localhost:3220
```

Production-style run:

```bash
npm run build
npm run start               # serves on port 3220
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `npm run start` | Dev / production server on port **3220** |
| `npm run build` | Next.js production build |
| `npm test` | Vitest unit tests (pure domain logic, no DB) |
| `npm run db:generate` | Prisma client generation |
| `npm run db:migrate` | Apply migrations (`migrate deploy`) |
| `npm run db:seed` | Reset + seed demo data (25 clients, 42 policies, 12 carriers, …) |
| `npm run setup` | generate + migrate + seed |

## Modules

| Area | Routes |
| --- | --- |
| Dashboard (KPIs, compliance alerts, activity) | `/dashboard` |
| CRM — clients, leads, pipeline, tasks | `/clients` `/leads` `/opportunities` `/tasks` |
| Policies (lifecycle, endorsements, splits, cancel/renew) | `/policies` |
| Quoting (multi-carrier compare, bind, proposal) | `/quotes` |
| Renewals (X-date pipeline, remarket logic) | `/renewals` |
| Claims (FNOL → close) | `/claims` |
| Certificates (ACORD-25-style COIs, holders) | `/certificates` |
| Carriers (appointments, commission schedules) | `/carriers` |
| Documents (uploads under `uploads/`, gitignored) | `/documents` |
| Commissions (statements, CSV import, reconciliation, payables) | `/commissions` |
| Accounting (agency-bill invoices, AR aging, Xero) | `/accounting` |
| Compliance (licenses, CE, E&O, appointments) | `/compliance` |
| Team (users, roles, production) | `/team` |
| Marketing (campaigns, source ROI, referrals) | `/marketing` |
| Reports (book, production, retention, trend, commission revenue, funnel — CSV everywhere) | `/reports` |
| **AI Compare / coverage analysis** (see below) | `/compare` `/tools/coverage-analysis` `/portal/checkup` |
| Settings (profile, integrations, templates, intake keys, audit log) | `/settings` |
| **Client portal** (see below) | `/portal` |

## AI Compare / coverage analysis

The marquee product capability: a complete pipeline (upload → extract →
summarize → gap analysis → recommendations → lead/record) built on the Claude
API. It is both a **lead-gen funnel** and a **staff/client tool**.

| Surface | Route | What it does |
| --- | --- | --- |
| Public funnel | `/compare`, `/coverage-checkup` | Anyone uploads a dec page (PDF/image) or pastes details + contact info → instant coverage report. Creates a Lead (`source=coverage-checkup`) + staff task. Posts to `POST /api/public/compare` (rate-limited + honeypot). |
| Public results | `/compare/[id]` | The submitter's report (summary + gaps + recommendations + "talk to an agent" CTA), reachable via the unguessable id. Only `PUBLIC_UPLOAD` rows are exposed. |
| Staff tool | `/tools/coverage-analysis` (+ `/[id]`) | Queue of public submissions; analyze a client's **stored** coverage schedule (no re-upload); upload/key a prospect policy; one-click **create opportunity** from the recommendations. |
| Portal checkup | `/portal/checkup` (+ `/[id]`) | Authed clients run a checkup on their own policies (clientId-scoped) → personalized gap report + **request a review** (→ staff task). |

**How it works.** `src/lib/ai/` holds the pipeline:
- `coverage-gap-rules.ts` — the **deterministic** gap engine. Compares
  extracted coverages against the per-LOB Wave-A coverage templates +
  best-practice thresholds (auto liability minimums, UM/UIM, homeowners
  replacement-cost / water-backup, umbrella when assets warrant, GL limits…)
  → MISSING / UNDER_LIMIT findings with severity, a 0–100 score, and a letter
  grade. **Pure — no key, no network.** This is the backbone; the rules give
  the report real value even in manual-review mode.
- `extract.ts` — AI extraction via `client.messages.parse()` +
  `zodOutputFormat` (structured output). PDF/image via `document`/`image`
  content blocks. **Never throws** — returns a typed result.
- `coverage-analysis.ts` — orchestrates rules + an AI narrative summary
  (falls back to a deterministic template summary when no key).
- `analysis-service.ts` — persists a `PolicyAnalysis` row and wires the
  upload/keyed paths.

**Activation.** Set `ANTHROPIC_API_KEY` (model `claude-opus-4-8`, override with
`AI_MODEL`; billed per use) to light up AI extraction + narrative
**automatically** — no code change. **Until then it runs in manual-review
mode:** uploads are stored + queued for staff, and the deterministic gap rules
still produce a full report once coverages are keyed (or pulled from a client's
stored `Coverage` rows). The pipeline always degrades gracefully — a missing
key or an API failure routes to PENDING/MANUAL_REVIEW, never an error to the
user.

## Client portal

Customers sign in at `/portal/login` (Tabor-branded, separate from the staff
login) and get a mobile-first portal scoped to THEIR client record only:

| Page | What it shows |
| --- | --- |
| `/portal` | Dashboard — active policies, next renewal, open invoices/claims, agency contact card |
| `/portal/policies` (+ `/[id]`) | Coverage, premium, carrier, term, endorsements, shared documents |
| `/portal/checkup` (+ `/[id]`) | Run a coverage checkup on your own policies → gap report + request a review |
| `/portal/documents` | Only documents staff marked **visibleToClient** (download via `/api/portal/documents/[id]`) |
| `/portal/invoices` | Open/paid invoices with Xero **Pay now** links when present (no direct card charges) |
| `/portal/claims` (+ `/new`, `/[id]`) | Claim tracking + FNOL form (creates a `REPORTED` claim + staff task) |
| `/portal/certificates` | COI request form (creates a staff task with holder details) |
| `/portal/profile` | Contact info on file + change-request form (→ staff task) |

**Access model.** Portal logins are `User` rows with role `CLIENT` and a
`clientId` link. The middleware terminally blocks CLIENT sessions from every
staff page/API (and staff from `/portal`); every portal page re-checks the
session before its first query, and every query is scoped by the session's
`clientId` — ids from params/bodies are never trusted.

**Invite flow.** On a staff client page → *Portal access* → **Invite to
portal**: creates a single-use `PortalInvite` (SHA-256 token hash, 7-day
expiry, revocable/resendable) and emails a link to
`/portal/accept-invite?token=…` where the customer sets a password. Prospects
can apply via the public, rate-limited `/portal/request-access` form (creates
a staff task).

**Hostnames.** The app serves both `https://ins.jahdev.com` and
`https://portal.taboragency.com`. Links in client emails use `PORTAL_URL`;
in-app redirects are always relative (tunnel rule).

## Public lead intake

`POST /api/public/leads` with header `X-Lead-Key` (env `LEAD_INTAKE_KEY` or a
DB-managed key from Settings → Lead intake keys). The marketing site at
https://ins-website-sandy.vercel.app posts here via a server-side proxy.

```json
{ "firstName": "…", "lastName": "…", "email": "…", "phone": "…", "zip": "…",
  "lineOfBusiness": "HOME", "message": "…", "source": "website" }
```

Leads are scored 0–100 (graded A–D), a follow-up task is created, and admins
are notified.

## Conventions / house rules

- All absolute URLs come from `APP_URL` (client-facing links: `PORTAL_URL`) —
  never `req.url` (Cloudflare-tunnel rule). In-flow redirects are relative.
- Portal queries are ALWAYS scoped by the session's `clientId`
  (`src/lib/domain/portal-scope.ts`); role CLIENT is walled off from staff
  routes in `src/middleware.ts` AND in `requireSession()`.
- Email sender is `no-reply@ins.jahdev.com` via Resend (log-only fallback until
  the domain is verified). **Never** send from braetr.com.
- Online payment = Xero invoice "Pay now" links only; no direct card charges.
- Password reset intentionally says "Email not found" for unknown emails.

See [RUNBOOK.md](RUNBOOK.md) for operations and [ARCHITECTURE.md](ARCHITECTURE.md)
for the system design. Full requirements: [REQUIREMENTS.md](REQUIREMENTS.md).
