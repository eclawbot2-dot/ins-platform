# ARCHITECTURE — ins-platform

## Overview

A single Next.js 16 App Router application serving both UI and API, backed by
PostgreSQL 16 through Prisma 7's `@prisma/adapter-pg` driver adapter. One
process, one box, fronted by a Cloudflare tunnel at https://ins.jahdev.com.

```
src/
  app/
    (app)/            # authenticated UI (sidebar layout)
      dashboard/ clients/ leads/ opportunities/ tasks/
      policies/ quotes/ renewals/ claims/ certificates/ carriers/ documents/
      commissions/ accounting/ compliance/ team/ marketing/ reports/ settings/
    api/
      auth/[...nextauth]/        # NextAuth v5 credentials
      public/leads/              # keyed public lead intake (only public API)
      documents/[id]/download/   # authenticated file streaming
      reports/*                  # CSV exports
      integrations/xero/*        # OAuth connect + callback
    login/ forgot-password/ reset-password/
  components/         # server-first UI primitives (DataTable, forms, badges…)
  lib/
    domain/           # PURE business logic (no IO) — the unit-tested core
    reports/          # aggregation: pure group/allocate fns + thin Prisma wrappers
    integrations/     # Xero OAuth/sync, token crypto, SyncJob state machine
    workspace/        # Google SA + DWD (hand-rolled RS256 JWT, no googleapis)
    auth.ts prisma.ts email.ts audit.ts csv.ts money.ts storage.ts …
  middleware.ts       # session gate for everything non-public
prisma/               # schema, migrations, seed
tests/                # vitest — pure functions only, no DB/no Next
```

## Key decisions

**Server components + server actions, no client API layer.** Every list page
is an RSC querying Prisma directly; mutations are server actions that
`redirect()` with a `?toast=` flash message. Search/filters/pagination live in
the URL. The only client components are trivial (toast, print button, sign-out).

**Pure domain core.** Everything with business meaning — commission math and
statement reconciliation, producer splits (largest-share residual-cent
allocation), pro-rata/short-rate proration with UTC day math, renewal
bucketing/X-date logic, retention classification, lead scoring, pipeline
weighting/funnel, AR aging, ref-number generation, marketing ROI — lives in
`src/lib/domain/*` as pure functions over plain numbers/dates. The 177 vitest
tests target this layer exclusively; report wrappers lazy-import Prisma so the
modules stay importable without a database.

**Money is NUMERIC.** All currency columns are Prisma `Decimal` →
`NUMERIC(12,2)`; the `toNum()/roundMoney()` helpers normalize at the edges so
sums stay exact.

**Auth.** NextAuth v5 credentials with bcrypt, 8h JWT sessions, sliding-window
login rate limiting before the bcrypt cost, live role refresh +
`sessionsRevokedAt` revocation in the JWT callback, and middleware protecting
every route except login/reset, NextAuth, and `/api/public/*`. Roles:
ADMIN / PRODUCER / CSR; admin-only mutations call `requireAdmin()`.

**Tunnel rule.** Behind Cloudflare, `req.url` is the internal origin
(`localhost:3220`). Anything leaving the process — OAuth redirect URIs,
emailed links — is built from `APP_URL` via `appBaseUrl()`; Route Handlers
redirect with relative `Location` headers (`appRedirect()`).

**Integrations degrade, never crash.**
- *Xero:* OAuth tokens AES-256-GCM-encrypted (key derived from AUTH_SECRET);
  invoice push (ACCREC, idempotent on InvoiceNumber) and status/Pay-now-link
  pull, each wrapped in a `SyncJob` row (RUNNING → OK/PARTIAL/FAILED with an
  in-flight guard). Unconfigured → Settings shows setup steps.
- *Google Workspace:* service account + domain-wide delegation with a
  hand-rolled RS256 JWT; missing key file → "not configured".
- *Email:* Resend with a log-only fallback transport.

**Files.** Uploads land in `uploads/` (gitignored) under random hex names —
the client filename never touches the filesystem; downloads stream through an
authenticated route.

**Audit.** `audit()` appends best-effort rows for logins and critical changes
(binds, cancels, user admin, integration connects, settings edits); viewer at
`/settings/audit`.

## Data model (high level)

```
User ─┬─ Policy (producer/csr) ─┬─ Endorsement / PolicyProducerSplit / Claim
      │                         ├─ Renewal ─ Task
      │                         ├─ Certificate(Coverage) ─ CertificateHolder
      │                         ├─ Invoice(Line)  ← Xero sync
      │                         └─ CommissionStatementLine ← reconciliation
      ├─ License ─ CeCredit
      └─ Lead / Opportunity / QuoteRequest ─ Quote (bind → Policy)
Client ─ Contact / Activity / Task / Document
Carrier ─ CommissionSchedule / CarrierContact / CommissionStatement
Campaign ─ Lead;  Referral;  EoPolicy;  AgencyProfile;  EmailTemplate
LeadIntakeKey;  AuditLog;  IntegrationConnection ─ SyncJob/SyncCursor;  WorkspaceConnection
```

## Testing & CI

- `npx tsc --noEmit` — strict.
- `npx vitest run` — 177 unit tests on the pure domain layer.
- GitHub Actions (`.github/workflows/ci.yml`): npm ci → prisma generate →
  typecheck → tests on every push/PR to main.
