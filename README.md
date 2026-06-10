# ins-platform

Insurance agency management system (AMS) — CRM, policies, quoting, renewals,
claims, commissions, certificates, compliance, accounting, marketing, and
reporting for an independent P&C agency.

- **Live URL:** https://ins.jahdev.com (Cloudflare tunnel → localhost:3220)
- **Login:** `ericbbowman2@gmail.com` / `Ins2026!` (seeded admin)
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
| Settings (profile, integrations, templates, intake keys, audit log) | `/settings` |

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

- All absolute URLs come from `APP_URL` — never `req.url` (Cloudflare-tunnel rule).
- Email sender is `no-reply@ins.jahdev.com` via Resend (log-only fallback until
  the domain is verified). **Never** send from braetr.com.
- Online payment = Xero invoice "Pay now" links only; no direct card charges.
- Password reset intentionally says "Email not found" for unknown emails.

See [RUNBOOK.md](RUNBOOK.md) for operations and [ARCHITECTURE.md](ARCHITECTURE.md)
for the system design. Full requirements: [REQUIREMENTS.md](REQUIREMENTS.md).
