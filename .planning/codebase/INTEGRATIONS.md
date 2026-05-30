# External Integrations

**Analysis Date:** 2026-05-30

---

## Xero — OAuth 2.0 + REST API (Primary Integration)

**Purpose:** Source of financial truth — P&L, Balance Sheet, accounts catalog, payroll employees, organisation metadata.

### Configuration
- Client credentials: `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` (loaded directly from `process.env` in multiple route files)
- Redirect URI: `${NEXT_PUBLIC_APP_URL}/api/Xero/callback`
- Scopes: `offline_access`, `accounting.transactions.read`, `accounting.reports.read`, `accounting.settings.read`, `accounting.contacts.read`, `payroll.employees`, `payroll.employees.read`, `payroll.payruns.read`, `payroll.settings`, `payroll.settings.read`
- `prompt=consent` forced on every OAuth initiation to allow multi-org picker

### OAuth Flow Entry Points
| File | Role |
|------|------|
| `src/app/api/Xero/auth/route.ts` | Initiates OAuth — builds Xero authorize URL with HMAC-signed state |
| `src/app/api/Xero/callback/route.ts` | Handles Xero redirect — exchanges code for tokens, saves to DB |
| `src/app/api/Xero/complete-connection/route.ts` | Multi-tenant path — user selects org from `pending_xero_connections` |
| `src/app/api/Xero/pending-connection/route.ts` | Returns pending connection list for org-selector UI |

### Token Storage & Encryption
- Tokens stored in `xero_connections` table in Supabase
- `access_token` and `refresh_token` are encrypted at rest with AES-256-GCM
- Encryption key: `APP_SECRET_KEY` (or `ENCRYPTION_KEY`) — must be 64-char hex or 44-char base64
- Encryption/decryption: `src/lib/utils/encryption.ts` — `encrypt()` / `decrypt()`
- **Strict decryption**: decryption failure throws an Error (no silent plaintext fallback since Phase 46)
- `functional_currency` (Xero `BaseCurrency`) captured at callback and stored on the connection row

### Token Refresh Pipeline — Critical Path

The entire Xero connection durability system lives in `src/lib/xero/token-manager.ts`.

**Key constants:**
- `REFRESH_THRESHOLD_MINUTES = 15` — refresh if token expires within 15 minutes (exported)
- `MAX_RETRIES = 3`
- `INITIAL_RETRY_DELAY_MS = 1000` — exponential backoff: 1s, 2s, 4s
- Lock expiry: 30 seconds

**Refresh flow (`getValidAccessToken`):**
1. Always re-fetches connection row from DB to get latest state
2. If token expires beyond threshold: return decrypted access token directly
3. Attempt to acquire DB-level distributed lock via `token_refreshing_at` column UPDATE with `OR` condition
4. **If lock NOT acquired** (sibling holds it): sleep 2s, re-fetch, return fresh token if valid
5. **If lock acquired** (Hole A close): immediately re-fetch row post-lock to detect sibling rotation during lock acquisition window
6. Call `https://identity.xero.com/connect/token` with `grant_type=refresh_token`
7. On success: encrypt new tokens, update DB row, release lock
8. On failure: categorize error, apply per-error-code policy (see below), release lock

**Error policy (per `categorizeError` in `token-manager.ts`):**
| Error Code | Policy |
|-----------|--------|
| `invalid_grant` | Terminal — pre-deactivation race-check, then deactivate if no race |
| `access_denied` | Terminal — pre-deactivation race-check, then deactivate if no race |
| `unauthorized_client` | Retry ×3; deactivate only if all 3 attempts fail (race-check first) |
| `invalid_client` | Never deactivate (config/ops bug); retry like transient |
| `400` (no `error` field) | Never deactivate; retry like transient |
| `429` | Transient retry |
| `5xx` | Transient retry |

**Hole B close (pre-deactivation refetch):** Before any deactivation write, `refetchConnectionForRaceCheck` re-fetches the row to see if a sibling already refreshed the token. If `expires_at` has advanced past threshold OR `updated_at` is newer, deactivation is suppressed and the sibling's token is returned.

**Sentry:** One `captureMessage('Xero connection deactivated')` per real terminal deactivation, tagged with `invariant: 'xero_connection_deactivated'`, `tenant_id`, `business_id`, `connection_id`, `error_code`, `retry_count`. Wrapped in try/catch so Sentry outage never aborts the DB write.

**Failure modes:**
- If `XERO_CLIENT_ID`/`XERO_CLIENT_SECRET` are wrong: `invalid_client` → never deactivates, silently fails on every refresh tick
- If `APP_SECRET_KEY` rotated with un-migrated rows: `decrypt()` throws → `database_error` result, `shouldDeactivate: true` — will deactivate connections with unreadable tokens
- Network failures to `identity.xero.com`: retried ×3 with backoff, returns `network_error` if all fail (no deactivation)

### Rate-Limit-Aware API Client
File: `src/lib/xero/xero-api-client.ts` — `fetchXeroWithRateLimit()`

All Xero API data calls (P&L, Balance Sheet, accounts) go through this client.

**Retry behavior:**
| Condition | Action |
|-----------|--------|
| 200 | Return immediately |
| 429 `concurrent` | 1 retry after 500ms |
| 429 `minute`/`appminute` | Sleep `Retry-After` seconds (default 60s); 1 retry |
| 429 `daily` | Throw `RateLimitDailyExceededError` — caller must mark tenant paused |
| 5xx | Exponential backoff `[1s, 2s, 5s, 15s, 60s]`; max 5 attempts |
| 4xx (other) | No retry; throw with response body |
| Network error | Uses same 5xx backoff sequence |

**Sentry:** Breadcrumb on every Xero API response with rate-limit headers for observability (`X-DayLimit-Remaining`, `X-MinLimit-Remaining`, `Retry-After`, etc.)

### Sync Orchestrator
File: `src/lib/xero/sync-orchestrator.ts`

Per-tenant flow:
1. Read `business_profiles.fiscal_year_start`
2. Pre-fetch `/Organisation` → IANA timezone
3. Pre-fetch `/Accounts` → refresh `xero_accounts` catalog
4. Per FY window: single-period monthly P&L fetches (calendar order) + FY-total oracle
5. Run `augmentWithResiduals` (regression detector) + `reconcilePL`
6. Upsert to `xero_pl_lines` (long-format, natural-key unique constraint)
7. Balance Sheet single-period per-month upsert to `xero_bs_snapshots`

Entry: `runSyncForAllBusinesses()` — invoked by both cron routes.

### Xero API Routes (data endpoints, not OAuth)
All under `src/app/api/Xero/`:
- `accounts/`, `chart-of-accounts/`, `chart-of-accounts-full/` — account catalog
- `balance-sheet/` — BS fetcher
- `pl-summary/`, `refresh-pl/` — P&L summary / force-refresh
- `sync/`, `sync-all/`, `sync-forecast/` — sync triggers (user-driven + cron)
- `reconciliation/` — reconciliation status
- `employees/` — payroll employee fetch
- `subscription-transactions/` — subscription data
- `status/`, `connection-health/` — connection health check
- `disconnect/` — user-initiated disconnect (marks `is_active=false` in DB)
- `reactivate/` — reactivate a deactivated connection
- `active-tenants/` — list active tenant connections

### Stability Risks
1. **Cron non-invocation (Phase 69 root cause):** The `refresh-xero-tokens` cron stopped firing for multiple 6-hour windows without producing any Sentry signal, because Sentry only fires when the cron runs. `cron_heartbeats` table (Phase 69-04) closes this gap — see heartbeat helper at `src/lib/cron/heartbeat.ts`.
2. **60-day refresh token TTL:** Xero refresh tokens expire after 60 days of non-use. The proactive-refresh cron (every 6h) resets this TTL continuously. If the cron is down for >60 days, all tokens expire — requiring manual reconnect for all tenants.
3. **Token encryption key rotation:** If `APP_SECRET_KEY` is rotated without migrating existing rows, every decrypt call throws, triggering `shouldDeactivate: true` policy and mass-deactivation. Requires a migration script to re-encrypt rows.
4. **`xero-node` package installed but unused:** `package.json` declares `xero-node ^13.0.0` (installed 13.3.0) but zero imports in `src/`. All Xero API calls use raw `fetch`. Dead dependency adds bundle weight and a supply-chain attack surface.
5. **Legacy AWS Lambda client:** `src/lib/api/xero-client.ts` still targets an AWS API Gateway endpoint (`execute-api.ap-southeast-2.amazonaws.com`). This file is not imported by any current route; the Lambda at `lambda/xero-oauth-handler/` appears to be superseded by the in-app OAuth flow. Both artifacts remain in the repo.

---

## Supabase — Database + Auth + Realtime

**Purpose:** Primary data store, authentication, Row Level Security.

### Configuration
- URL: `NEXT_PUBLIC_SUPABASE_URL`
- New publishable key: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (fallback: `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- New secret key: `SUPABASE_SECRET_KEY` (fallback: `SUPABASE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`)
- Key resolver: `src/lib/supabase/keys.ts` — prefers new key format, falls back to legacy JWT keys (valid until end of 2026 per Supabase migration timeline)

### Client Variants

| Client | File | Key | RLS | When Used |
|--------|------|-----|-----|-----------|
| Browser singleton | `src/lib/supabase/client.ts` | Publishable | Enforced | Client components, hooks |
| Server component | `src/lib/supabase/server.ts` → `createServerComponentClient()` | Publishable | Enforced | Server components |
| Route handler | `src/lib/supabase/server.ts` → `createRouteHandlerClient()` | Publishable | Enforced | API routes (user context) |
| Admin / service-role | `src/lib/supabase/admin.ts` → `createServiceRoleClient()` | Secret | **Bypassed** | Cron routes, admin ops, Xero callback |
| Legacy direct client | `src/lib/supabase.ts` | (legacy) | Varies | Legacy code only |

**Browser client settings:**
- Singleton pattern to prevent auth state flickering
- `auth.lockAcquireTimeout: 10_000` — prevents navigator.locks hang from orphaned locks

**Admin client settings:**
- `autoRefreshToken: false`, `persistSession: false`
- `fetch` overridden with `cache: 'no-store'` to prevent stale data in Vercel edge cache

### Auth Flow
- Supabase Auth with cookie-based sessions
- Middleware (`src/middleware.ts`) runs on Edge Runtime — checks session via `supabase.auth.getUser()` on every non-static request
- Auth helpers: `@supabase/ssr` (current) + `@supabase/auth-helpers-nextjs` (deprecated, still installed — see CONCERNS)
- Role system: `system_roles` table with `user_id` + `role` (`client`, `coach`, `super_admin`)

### Database Schema
- 45 SQL migrations; earliest baseline in `supabase/migrations/00000000000000_baseline_schema.sql`
- Most recent: `20260530000000_phase69_cron_heartbeats.sql`
- Key tables relevant to integrations:
  - `xero_connections` — `id`, `business_id`, `tenant_id`, `access_token` (encrypted), `refresh_token` (encrypted), `expires_at`, `is_active`, `token_refreshing_at` (lock column), `functional_currency`
  - `pending_xero_connections` — temporary token staging for multi-tenant org selection
  - `xero_pl_lines` — long-format P&L lines per account per month
  - `xero_bs_snapshots` — Balance Sheet snapshots
  - `xero_accounts` — accounts catalog
  - `sync_jobs` — sync audit log with reconciliation JSONB
  - `cron_heartbeats` — cron invocation telemetry (Phase 69-04)
  - `businesses` + `business_profiles` — dual-ID business entity (see CONCERNS)
  - `financial_metrics` — legacy metrics table with partially deprecated write paths
  - `fx_rates` — FX rates for consolidation (source: OXR)

### RLS
- RLS enabled and enforced for user-context clients
- Admin client explicitly bypasses RLS — used exclusively in server-side code

### Failure Modes
- If Supabase is down: all data operations fail; middleware auth check fails → redirects to login
- If secret key is missing/wrong: `createServiceRoleClient()` throws at construction; cron routes and admin ops fail hard
- Orphaned navigator.locks (browser tab crash): `lockAcquireTimeout: 10s` surfaces `LockAcquireTimeoutError` instead of infinite hang

### Supabase Edge Functions (likely undeployed)
Three Deno-runtime functions in `supabase/functions/`:
- `check-session-reminders/index.ts` — checks upcoming coaching sessions
- `check-actions-due/index.ts` — checks overdue actions
- `send-notifications/index.ts` — notification dispatch

These use `SUPABASE_SERVICE_ROLE_KEY` (legacy key name) and appear to be development-era artifacts. No evidence of active Vercel or Supabase scheduler registration. The notification infrastructure has since been replaced by the Vercel cron + Resend pipeline.

---

## Resend — Transactional Email

**Purpose:** All outbound email — client invitations, password resets, weekly digest, daily health report, CFO report delivery.

### Configuration
- API key: `RESEND_API_KEY`
- Sender: `WisdomBI <noreply@mail.wisdombi.ai>` (default in `src/lib/email/resend.ts`)
- CFO report sender: `REPORT_FROM_EMAIL` / `REPORT_FROM_NAME` (typically `cfo@wisdombi.ai`)
- Client: `resend` npm package v6.6.0; initialized as module-level singleton in `src/lib/email/resend.ts`

### Email Types
| Function | Trigger | File |
|----------|---------|------|
| `sendClientInvitation()` | Coach invites client | `src/lib/email/resend.ts` |
| `sendPasswordReset()` | Auth reset flow | `src/lib/email/resend.ts` |
| `sendSessionReminder()` | Session reminder | `src/lib/email/resend.ts` |
| `sendMessageNotification()` | New chat message | `src/lib/email/resend.ts` |
| `sendTestEmail()` | Branding verification | `src/lib/email/resend.ts` |
| CFO report delivery | Manual coach trigger | `src/lib/email/send-report.ts` |
| Weekly digest | Cron (Sunday 20:00 UTC) | `src/app/api/cron/weekly-digest/route.ts` |
| Daily health report | Cron (07:00 UTC) | `src/app/api/cron/daily-health-report/route.ts` |

### Failure Modes
- `sendEmail()` wraps Resend SDK call in try/catch; returns `{ success: false, error }` on failure — does **not** throw
- Rate limiting: in-memory `RATE_LIMIT_CONFIGS.email` (10/hour/user) applied at route level — not enforced in server-side cron paths
- No retry logic on transient Resend failures
- Missing `RESEND_API_KEY`: Resend client initializes with `undefined` — emails silently fail (no hard startup error)

---

## Sentry — Error Monitoring + Session Replay

**Purpose:** Error tracking, performance monitoring, deactivation telemetry, cron observability.

### Configuration
- Three config files — one per runtime:
  - Server: `sentry.server.config.ts` — `SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN`
  - Client: `sentry.client.config.ts` — `NEXT_PUBLIC_SENTRY_DSN`
  - Edge: `sentry.edge.config.ts` — `SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN`
- Hard fail in production if DSN unset (throws `Error` at startup)
- Source map upload: `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` (default: `'wisdombi'`) + `SENTRY_PROJECT` (default: `'wisdom-bi'`) — configured in `next.config.js`

### Sampling
- `tracesSampleRate`: 10% in production, 100% in dev
- `replaysSessionSampleRate`: 1% (client-side only)
- `replaysOnErrorSampleRate`: 100% on sessions with errors

### Ignored Client Errors
- `ResizeObserver loop`
- `Network request failed`
- `Load failed`
- `ChunkLoadError`

### Key Sentry Invariant Tags
These structured tags are used for alert routing:

| Invariant Tag | Source | Meaning |
|---------------|--------|---------|
| `xero_connection_deactivated` | `src/lib/xero/token-manager.ts` | Terminal Xero token failure |
| `cron_refresh_xero_tokens_failed` | `src/app/api/cron/refresh-xero-tokens/route.ts` | Per-connection transient failure |
| `cron_refresh_xero_tokens_per_connection` | Same | Unexpected exception in refresh loop |
| `cron_refresh_xero_tokens` | Same | Aggregate cron failure (whole run threw) |
| `cron_sync_all_xero` | `src/app/api/cron/sync-all-xero/route.ts` | Sync orchestrator threw |
| `xero_token_pre_expiry` | `src/app/api/cron/refresh-xero-tokens/route.ts` | Token within 24h of expiry, cron did not refresh |
| `cron_heartbeat_insert_failed` | `src/lib/cron/heartbeat.ts` | Heartbeat DB write failed |

### Failure Modes
- Sentry calls are wrapped in `try/catch` throughout the codebase — a Sentry outage never aborts business logic
- Source map upload disabled if `SENTRY_AUTH_TOKEN` is absent (error capture still works; stack traces may be minified)

---

## Vercel Cron — Scheduled Jobs

**Purpose:** All recurring background work runs as Vercel cron jobs, not Supabase Edge Functions or external schedulers.

### Registration
Declared in `vercel.json` — Vercel validates this file at deploy time and registers crons automatically.

| Cron Path | Schedule (UTC) | Local Time (AEST/AEDT) | Purpose |
|-----------|---------------|------------------------|---------|
| `/api/cron/refresh-xero-tokens` | `0 */6 * * *` | 00:00, 06:00, 12:00, 18:00 AEST | Proactive token refresh — prevents 60-day TTL expiry |
| `/api/cron/sync-all-xero` | `0 16 * * *` | 02:00 AEDT / 03:00 AEST | Nightly P&L + BS sync |
| `/api/cron/reconciliation-watch` | `0 18 * * *` | 04:00 AEDT (2h after sync) | Detect P&L/BS reconciliation drift |
| `/api/cron/daily-health-report` | `0 7 * * *` | 17:00 AEDT | Email health summary to `ADMIN_EMAIL` |
| `/api/cron/weekly-digest` | `0 20 * * 0` | Sunday 06:00 AEDT | Email weekly coach digest via Resend |

### Authentication
All cron routes gate on `Authorization: Bearer ${CRON_SECRET}`. Vercel supplies this header automatically when `CRON_SECRET` is set. Pattern is fail-closed: if `CRON_SECRET` is unset, OR the header doesn't match, the route returns 401.

**Important:** `sync-all-xero/route.ts` uses the looser check form (`auth !== \`Bearer ${CRON_SECRET}\``). The dedicated `refresh-xero-tokens/route.ts` uses the tighter two-part guard (`!cronSecret || authHeader !== \`Bearer ${cronSecret}\``). The looser form passes when both sides are `undefined` — regression test at `src/__tests__/api/xero-sync-all-cron-auth.test.ts` covers the original SEC-02 fix.

### maxDuration Settings
| Route | maxDuration |
|-------|------------|
| `refresh-xero-tokens` | 300s |
| `sync-all-xero` | 300s |
| `reconciliation-watch` | 60s |
| `daily-health-report` | (not set; defaults to Vercel's plan limit) |
| `weekly-digest` | (not set; defaults to Vercel's plan limit) |

### Heartbeat Telemetry (Phase 69-04)
All cron routes call `recordHeartbeat()` from `src/lib/cron/heartbeat.ts` on both success and failure paths. Writes to `cron_heartbeats` table with `cron_path`, `status`, `error_message`, `metadata`. Fail-soft — heartbeat failure never aborts cron work.

### Failure Modes
- **Cron non-invocation (Phase 69 root cause):** Vercel's scheduler can silently stop invoking a cron without generating Sentry signal. The `cron_heartbeats` table detects this — any gap >12h in heartbeat rows for a given `cron_path` indicates a missed invocation.
- **Sequential iteration bottleneck:** `refresh-xero-tokens` iterates connections sequentially. At current scale (~20 connections), ~4s total. At ~400 connections, approaches the 300s maxDuration limit.
- **No retry on cron failure:** If a cron run fails (500), Vercel does not retry — next invocation is at the next scheduled tick.

---

## AI Providers — Anthropic Claude + OpenAI GPT

**Purpose:** CFO agent conversations, salary/cost estimates, forecast assistant, session transcript analysis.

### Anthropic Claude
- SDK: `@anthropic-ai/sdk ^0.39.0`
- Key: `ANTHROPIC_API_KEY`
- Models used (hardcoded in `src/lib/services/claude-cfo-agent.ts`):
  - `claude-sonnet-4-20250514` — fast interactions
  - `claude-opus-4-20250514` — review/analysis
  - `claude-haiku-3-5-20241022` — parsing + structured output
- Client lazy-initialized via `require()` with graceful fallback if SDK absent
- Used by: `src/lib/services/claude-cfo-agent.ts`, `src/app/api/ai/advisor/route.ts`

### OpenAI
- SDK: `openai ^5.13.1`
- Key: `OPENAI_API_KEY`
- Model: `gpt-3.5-turbo` (used as fallback in `advisor/route.ts` when Anthropic fails)
- Also used in `src/lib/ai/openaiParser.ts`, wizard chat routes
- Rate-limited: `RATE_LIMIT_CONFIGS.ai` (30 req/hour/user) applied in AI route handlers
- In-memory rate limiter — resets on cold start; ineffective under multi-instance scaling

### Failure Modes
- AI routes fall through Anthropic → OpenAI on failure; if both fail, route returns structured error
- Missing API keys: SDK initializes but calls throw authentication errors at request time
- No retry logic on AI API calls; no circuit-breaker

---

## Open Exchange Rates (OXR) — FX Rate Sync

**Purpose:** FX rates for multi-currency consolidation (P&L monthly average, Balance Sheet closing spot). Replicates Calxa's rate derivation (IAS 21).

### Configuration
- API key: `OPENEXCHANGERATES_APP_ID`
- Base URL: `https://openexchangerates.org/api` (hardcoded in `src/lib/consolidation/oxr.ts`)
- Plan: Free tier (base currency always USD; cross-rates derived by `rates.AUD / rates.HKD`)

### Usage
- Triggered manually from admin consolidation UI or via `/api/consolidation/fx-rates/sync-oxr`
- Health check: `/api/consolidation/fx-rates/sync-oxr/health`
- Writes to `fx_rates` table with `source='oxr'`
- Rate limit: 1,000 requests/month free; one currency pair / one month backfill = 28–31 requests

### Failure Modes
- `OPENEXCHANGERATES_APP_ID` absent: route returns 500 with clear message ("Add it to .env.local … and Vercel env vars")
- Free plan quota exhausted: OXR returns 429 — no retry logic in `oxr.ts` per-day-fetch loop
- Future-date requests return no data (handled via `enumerateMonthDays` which caps to today)

---

## Legacy / Superseded Integrations

### AWS Lambda (Retired)
- Lambda function source: `lambda/xero-oauth-handler/`
- AWS SAM build artifacts: `.aws-sam/`
- Client file: `src/lib/api/xero-client.ts` — still targets API Gateway endpoint `fxbc3bbjo9.execute-api.ap-southeast-2.amazonaws.com`
- **Not imported by any current route.** The in-app Next.js OAuth flow completely supersedes this.
- Risk: the `NEXT_PUBLIC_XERO_API_URL` env var can still route calls to the Lambda if set; misconfiguration could silently bypass the current token pipeline.

### Supabase Edge Functions (Superseded)
- `supabase/functions/check-session-reminders/`, `check-actions-due/`, `send-notifications/`
- Deno runtime (pinned to `@supabase/supabase-js@2` via esm.sh)
- Use legacy `SUPABASE_SERVICE_ROLE_KEY` variable name
- No evidence these are currently deployed or scheduled
- Functionality replaced by Vercel cron + Resend pipeline

---

## Summary of Required Secrets (Production Checklist)

| Secret | Where Set | Required? |
|--------|-----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel env | Hard required |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | Vercel env | Hard required |
| `SUPABASE_SECRET_KEY` (or legacy names) | Vercel env | Hard required |
| `XERO_CLIENT_ID` | Vercel env | Required for Xero |
| `XERO_CLIENT_SECRET` | Vercel env | Required for Xero |
| `APP_SECRET_KEY` (or `ENCRYPTION_KEY`) | Vercel env | Required for Xero token encryption |
| `CRON_SECRET` | Vercel env | Required for all 5 crons |
| `SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN` | Vercel env | Required (throws in prod if absent) |
| `RESEND_API_KEY` | Vercel env | Required for email |
| `ADMIN_EMAIL` | Vercel env | Required for daily health report |
| `NEXT_PUBLIC_APP_URL` | Vercel env | Required for Xero OAuth redirect |
| `OAUTH_STATE_SECRET` | Vercel env | Required for Xero OAuth CSRF protection |
| `REPORT_LINK_SECRET` | Vercel env | Required for public report view links |
| `ANTHROPIC_API_KEY` | Vercel env | Required for CFO agent |
| `OPENAI_API_KEY` | Vercel env | Optional (AI fallback) |
| `OPENEXCHANGERATES_APP_ID` | Vercel env | Required for FX consolidation |
| `SENTRY_AUTH_TOKEN` | Vercel env | Optional (source maps only) |

---

*Integration audit: 2026-05-30*
