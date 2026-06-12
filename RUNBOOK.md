# RUNBOOK — ins-platform (Tabor Agency)

Operations guide for the host running https://ins.jahdev.com.

## Topology

```
Internet → Cloudflare tunnel ─ ins.jahdev.com ──────────┐
                             └ portal.taboragency.com ──┤→ localhost:3220 (Next.js) → PostgreSQL 16 (127.0.0.1:5432/ins)
```

One Next.js process serves BOTH hostnames (staff app + client portal at
`/portal`). `portal.taboragency.com` goes live when taboragency.com NS cuts
over to Cloudflare; the tunnel ingress already exists. Client-facing email
links are built from `PORTAL_URL`.

## Services (Windows)

Intended service layout (register with nssm or `sc.exe` when promoting to
always-on; not yet installed by this repo):

| Service | Command | Notes |
| --- | --- | --- |
| `ins-next` | `npm run start` in `C:\Users\bot\Projects\ins-platform` | Port 3220; needs `.env` present |
| `ins-cloudflared` | `cloudflared tunnel run <tunnel>` | Maps ins.jahdev.com → http://localhost:3220 |

Manual run (foreground):

```bash
cd C:/Users/bot/Projects/ins-platform
npm run build && npm run start
```

### Scheduled task: `ins-touchpoints` (customer-appreciation engine)

A daily Windows Task Scheduler job hits the touchpoint engine at ~07:00.
It evaluates the book (schedules due renewal/birthday/anniversary/holiday/
tenure touchpoints) and runs the send sweep (emails APPROVED, due rows).
Idempotent — the `idempotencyKey` @unique makes re-runs no-ops, so it can
never double-send. Auth is the `X-Cron-Key` header (env `CRON_KEY`).

The task runs `scripts\run-touchpoints.cmd`, which POSTs to the route with
the key. Register (Bash on this host, PowerShell is broken):

```bash
export MSYS_NO_PATHCONV=1
# scripts/run-touchpoints.cmd contains the curl + CRON_KEY (keep out of git logs)
schtasks /Create /TN "ins-touchpoints" /SC DAILY /ST 07:00 /RL HIGHEST /F \
  /TR "C:\\Users\\bot\\Projects\\ins-platform\\scripts\\run-touchpoints.cmd"
schtasks /Query /TN "ins-touchpoints"        # confirm Ready + Next Run Time
schtasks /Run   /TN "ins-touchpoints"        # fire once on demand
```

Manual one-off (e.g. to test): `dryRun=1` counts due and sends nothing.

```bash
curl -s -X POST "http://localhost:3220/api/cron/touchpoints?dryRun=1" \
  -H "x-cron-key: $CRON_KEY" -H "content-type: application/json" -d '{}'
```

## Environment (.env)

| Key | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | `postgresql://ins:ins_dev@127.0.0.1:5432/ins?schema=public` |
| `AUTH_SECRET` | yes | `openssl rand -base64 32`; also keys integration-token encryption |
| `NEXTAUTH_URL` / `APP_URL` | yes | `https://ins.jahdev.com` — all absolute URLs derive from this |
| `AUTH_TRUST_HOST` | yes | `true` (behind the tunnel) |
| `EMAIL_TRANSPORT` | no | `log` (default, no sends) or `resend` |
| `RESEND_API_KEY` | for resend | Send-only key; **verify ins.jahdev.com in Resend first** |
| `EMAIL_FROM` | no | `no-reply@ins.jahdev.com` — never braetr.com |
| `PORTAL_URL` | no | Base URL for client-facing links (portal invites); default `https://ins.jahdev.com`, switch to `https://portal.taboragency.com` after NS cutover |
| `LEAD_INTAKE_KEY` | yes | Shared secret for `POST /api/public/leads` |
| `CRON_KEY` | yes | Shared secret for `POST /api/cron/touchpoints` (the `ins-touchpoints` task). If unset, the route 503s and never runs unauthenticated. |
| `ANTHROPIC_API_KEY` / `TOUCHPOINT_AI` | no | Both set → dormant AI rewrite of touchpoint copy (`claude-opus-4-8`). Unset → engine runs on seeded templates only; never blocks a send. |
| `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` | for Xero | See Xero setup below |
| `GOOGLE_WORKSPACE_SA_KEY_FILE` | no | Default `C:/Users/bot/secrets/ins-workspace-sa.json`; app degrades cleanly when absent |
| `GOOGLE_WORKSPACE_SUBJECT` | no | DWD impersonation user (can also be set in Settings → Integrations) |

## Database

```bash
# Create role + database (one-time, as postgres superuser)
psql -U postgres -c "CREATE ROLE ins LOGIN PASSWORD 'ins_dev';"
psql -U postgres -c "CREATE DATABASE ins OWNER ins;"

# Apply migrations / reseed
npm run db:migrate
npm run db:seed        # DESTRUCTIVE: wipes and reloads demo data
```

Backups: `pg_dump -U ins -d ins -F c -f ins-$(date +%F).dump`.

## Xero setup

1. https://developer.xero.com → My Apps → New app (Web app).
2. Redirect URI: `https://ins.jahdev.com/api/integrations/xero/callback`.
3. Put client id/secret in `.env`, restart, then Settings → Integrations →
   **Connect Xero** (admin only).
4. "Sync now" pushes open agency-bill invoices (ACCREC) and pulls statuses +
   online-payment ("Pay now") links. Tokens are AES-256-GCM encrypted at rest
   (key derived from `AUTH_SECRET`).
5. Online payments are ONLY via the Xero Pay-now link on each invoice.

## Google Workspace setup (optional)

1. GCP project → enable **Gmail API** and **Google Calendar API**.
2. Create a service account + JSON key → save to
   `C:/Users/bot/secrets/ins-workspace-sa.json`.
3. Workspace Admin → Security → API controls → Domain-wide delegation →
   authorize the SA's client ID for scopes:
   `https://www.googleapis.com/auth/gmail.send`,
   `https://www.googleapis.com/auth/calendar`.
4. Settings → Integrations: set the impersonation subject and enable.

Missing key/subject = features report "not configured"; nothing crashes.

## Resend (email) activation

1. Verify domain **ins.jahdev.com** in Resend (DNS on Cloudflare).
2. Create a send-only API key.
3. `.env`: `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY=…`, restart.
Until then every email is logged with `email (log-only transport)`.

## Health checks

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3220/login         # expect 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:3220/portal/login  # expect 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:3220/dashboard     # expect 307 → /login when logged out
node scripts/smoke.mjs                                                     # full sweep incl. portal + role wall
```

## Client portal operations

- **Invite a client:** staff client page → *Portal access* → enter email →
  **Invite to portal**. Token is single-use, 7-day expiry; *Resend* issues a
  fresh token (old one is revoked), *Revoke* kills it.
- **Disable access:** *Portal access* → **Disable** (deactivates the CLIENT
  user and revokes live sessions immediately).
- **Share a document:** Documents → *Portal* column → toggle **Shared**
  (only `visibleToClient` documents appear/download in the portal).
- **Demo portal login:** `client@taboragency.com` / `Client2026!`
  (linked to Harborview Builders LLC by the seed).

## Troubleshooting

- **Login loops / 401 behind tunnel** — confirm `APP_URL`/`NEXTAUTH_URL` are
  `https://ins.jahdev.com` and `AUTH_TRUST_HOST=true`.
- **Redirects land on localhost:3220** — some handler built a URL from
  `req.url`; use `appBaseUrl()` / `appRedirect()` instead (grep `new URL(.*req.url)`).
- **"DATABASE_URL is not set"** — `.env` missing or service started outside the
  repo directory.
- **Xero sync FAILED with TOKEN_EXPIRED** — refresh token lapsed (>60 days
  idle); Settings → Integrations → Reconnect.
- **Uploads 410 on download** — file removed from `uploads/`; the DB row
  remains. Delete the document row or restore the file.
