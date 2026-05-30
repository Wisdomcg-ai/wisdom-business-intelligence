# Architecture

**Analysis Date:** 2026-05-30

---

## Pattern Overview

**Overall:** Multi-tenant SaaS — Next.js 15 App Router, single Supabase (Postgres) backend, Xero as the financial data source of truth.

**Key Characteristics:**
- All server work happens in Next.js Route Handlers (`src/app/api/**`); there are no separate micro-services
- React Server Components are used for pages; complex financial UI (forecast wizard, monthly report) is client-side heavy
- Supabase RLS is the second layer of auth; API routes do their own access checks as the first layer
- Xero data is cached in `xero_pl_lines` / `xero_bs_lines`; the app never queries Xero live for reporting (only for OAuth callbacks and sync jobs)
- The consolidation engine is a pure TypeScript library inside `src/lib/consolidation/` called by API routes

---

## Layers

**Middleware (Edge):**
- Purpose: Session refresh, CSRF token injection, role-based redirects, security headers, onboarding gate
- Location: `src/middleware.ts`
- Depends on: `@supabase/ssr` anon client (cookie-backed)
- Note: Middleware does NOT call service-role — it only reads `auth.uid()` and `system_roles`. Heavy onboarding logic (checking business_profiles) was removed; lightweight coach/admin exemption only.

**Route Handlers (API layer):**
- Purpose: All server-side mutations and data fetches triggered by the browser
- Location: `src/app/api/**` — 130 `route.ts` files
- Pattern: `createRouteHandlerClient()` for auth checks, then `createServiceRoleClient()` or a module-level `createClient(url, serviceKey)` for data operations
- Access control: `verifyBusinessAccess` from `src/lib/utils/verify-business-access.ts` (15 routes use the shared utility); 3 routes declare inline versions (`src/app/api/kpis/route.ts`, `src/app/api/Xero/sync/route.ts`, `src/app/api/processes/[id]/route.ts`)
- Cron routes: `src/app/api/cron/` — 5 routes authenticated via `Bearer ${CRON_SECRET}` (fail-closed pattern)

**Service/Library Layer (`src/lib/`):**
- Purpose: Business logic kept out of route handlers
- Xero: `src/lib/xero/` — sync orchestrator, token manager, parsers, API client
- Consolidation: `src/lib/consolidation/` — multi-entity P&L/BS/cashflow engine
- Business resolvers: `src/lib/business/resolveBusinessId.ts`, `src/lib/utils/resolve-business-ids.ts`, `src/lib/utils/resolve-xero-business-id.ts`
- Finance: `src/lib/monthly-report/`, `src/lib/finance/`
- Auth: `src/lib/auth/roles.ts`, `src/lib/permissions/`
- Services: `src/lib/services/` — forecast read/seed, historical P&L summary

**Context Layer (Client):**
- Purpose: Single shared identity for "which business am I looking at"
- Location: `src/contexts/BusinessContext.tsx`
- Provides: `currentUser` (UserId branded), `activeBusiness` (BusinessId branded), `businessProfileId` (BusinessProfileId branded), `viewerContext`, `setActiveBusiness`, `buildHref`
- The `buildHref` helper rewrites `/sessions` → `/coach/clients/{id}/view/sessions` when a coach is viewing a client, keeping navigation links correct in both contexts

**Component Layer:**
- Location: `src/components/`
- Organized by: `layout/`, `shared/`, `coach/`, `client/`, `dashboard/`, `admin/`, `integrations/`, `providers/`
- Page-specific components co-located in `src/app/finances/forecast/components/`, `src/app/finances/monthly-report/components/`

**Database (Supabase / Postgres):**
- ~110 tables in baseline schema (`supabase/migrations/00000000000000_baseline_schema.sql`, 14,690 lines)
- 154 tables have RLS enabled
- ~60 migrations applied post-baseline (2026-04 through 2026-05-30)
- RLS helper functions: `auth_can_manage_business()`, `auth_get_accessible_business_ids()`, `auth_is_super_admin()`, `auth_can_manage_team()` — all `SECURITY DEFINER`, defined in baseline

---

## The Dual Business-Identity System (Architectural Seam)

This is the most pervasive architectural problem in the codebase.

**Two identity tables:**
- `businesses` — the tenancy root. Has `owner_id`, `assigned_coach_id`. Used by `business_users`, `business_kpis`, nearly all non-Xero tables.
- `business_profiles` — a 1:1 sidecar of `businesses` (FK: `business_profiles.business_id → businesses.id`). Has `fiscal_year_start`, `functional_currency`, `user_id`. Used historically as the Xero-adjacent identity.

**The split across tables:**
- ~98 tables' `business_id` FK targets `businesses.id` (the majority)
- 6 tables' `business_id` FK targets `business_profiles.id`: `custom_kpis_library`, `stage_transitions`, `stop_doing_activities`, `stop_doing_hourly_rates`, `stop_doing_items`, `stop_doing_time_logs`, `user_roles`
- `xero_pl_lines`: has TWO FK constraints — baseline added `→ businesses.id`; migration `20260430000002_xero_pl_lines_business_id_fk.sql` added a SECOND constraint `→ business_profiles.id`. The migration comment says every row must be a `business_profiles.id` — so the baseline FK is effectively superseded but not dropped.
- `xero_bs_lines` (added in `20260430000010_xero_bs_lines.sql`): FK → `business_profiles.id` only (no legacy FK)
- `financial_forecasts`: `business_id` has no explicit FK in baseline (no `financial_forecasts_business_id_fkey` line found); resolved in practice by `resolveBusinessIds`

**Three resolvers that paper over it:**
1. `src/lib/utils/resolve-business-ids.ts` — `resolveBusinessIds(supabase, businessId)` — bidirectional, module-level in-process cache, returns `{ bizId, profileId, all }`. Used by sync orchestrator, consolidation engine, monthly report generate. 75 files call one of the three resolvers.
2. `src/lib/utils/resolve-xero-business-id.ts` — `resolveXeroBusinessId(supabase, businessId)` — 3-try chain, Xero-connection-focused, returns `{ connectionBusinessId, connection }`. Used by OAuth callback, Xero status/sync routes.
3. `src/lib/business/resolveBusinessId.ts` — `resolveBusinessId(supabase, params)` — role-aware, returns branded `BusinessId | null` with a reason string. The most correct resolver; used in newer routes. Throws if resolved ID equals userId (invariant guard).

**Inline 3-try chains (not using a resolver):**
- `src/app/api/Xero/reconciliation/route.ts` lines 63–71
- `src/app/api/Xero/chart-of-accounts/route.ts` lines 105–113
- `src/app/api/Xero/chart-of-accounts-full/route.ts` lines 142–147
- `src/app/api/forecast/cashflow/sync-balances/route.ts` lines 143–155
- `src/app/api/forecast/cashflow/capex/route.ts` lines 103–115
- `src/app/api/forecast/cashflow/bank-balances/route.ts` lines 114–126

**RLS `auth_get_accessible_business_ids()` returns BOTH `businesses.id` and `business_profiles.id` rows** (line 158 of baseline) — this is the DB-level mitigation for the same problem. `auth_can_manage_business()` also checks both tables (line 116 of baseline), and still contains the vestigial `check_business_id = auth.uid()` fallback that the resolver invariant guard was specifically designed to prevent.

---

## Data Flow — Typical Authenticated Request

```
Browser
  └─ fetch('/api/monthly-report/generate', { body: { business_id, report_month, fiscal_year } })
       │
       ├─ middleware.ts  (Edge)
       │    • createServerClient (anon) → refresh session cookies
       │    • security headers
       │
       └─ src/app/api/monthly-report/generate/route.ts  (Node.js runtime)
            │
            ├─ createRouteHandlerClient()         // anon-key, cookie-backed → auth.getUser()
            ├─ checkRateLimit(user.id)            // in-memory (src/lib/utils/rate-limiter.ts)
            ├─ createClient(url, serviceKey)      // service-role, RLS-bypass
            ├─ resolveBusinessIds(supabase, business_id) → { bizId, profileId, all }
            ├─ requireSectionPermission(authClient, user.id, businessId, 'finances')
            │    └─ src/lib/permissions/requireSectionPermission.ts
            │         • Supabase RPC: auth_get_section_permissions(business_id)
            │         • enforceSectionPermission() — LOG_ONLY by default
            │
            ├─ Query xero_pl_lines WHERE business_id IN [profileId, bizId]
            ├─ Query financial_forecasts WHERE business_id = bizId
            ├─ createForecastReadService(supabase, forecastId)
            │    └─ src/lib/services/forecast-read-service.ts
            │
            └─ NextResponse.json({ reportLines })
```

---

## Auth / Access-Control Flow

**Client-side session:** Browser uses `createBrowserClient` (singleton, `src/lib/supabase/client.ts`) with `auth.lockAcquireTimeout: 10000` to prevent orphaned lock hangs.

**Middleware (Edge):** Reads session via anon key; redirects unauthenticated users to `/auth/login`, `/coach/login`, or `/admin/login` based on path prefix. Queries `system_roles` for role-based post-login redirects.

**Role determination:** `src/lib/auth/roles.ts` → `getUserSystemRole()` — checks `system_roles` first, falls back to `users.system_role`. Returns `null` on transient error (never defaults to 'client' on error since that caused coaches to fall into a random business).

**API route auth pattern (standard):**
```typescript
const supabase = await createRouteHandlerClient()        // anon client
const { data: { user } } = await supabase.auth.getUser() // validate session
// ...
const hasAccess = await verifyBusinessAccess(user.id, businessId)
// src/lib/utils/verify-business-access.ts: checks owner_id, assigned_coach_id,
//   business_profiles fallback, business_users membership, system_roles super_admin
```

**Cron route auth (SEC-02 pattern):**
```typescript
const cronSecret = process.env.CRON_SECRET
const authHeader = req.headers.get('authorization')
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
// Fail-closed: undefined CRON_SECRET rejects all requests
```

**RLS (database layer):** Service-role client bypasses RLS. Anon/authed client respects policies. Key RLS functions:
- `auth_can_manage_business(id)` — owner OR coach OR `business_users` member OR `business_profiles.user_id` OR the vestigial `id = auth.uid()` fallback
- `auth_get_accessible_business_ids()` — returns array including both `businesses.id` and `business_profiles.id` for the current user
- Most financial tables use: `USING (auth_is_super_admin() OR business_id = ANY(auth_get_accessible_business_ids()))`

**BusinessContext (client-side):** `src/contexts/BusinessContext.tsx` — wraps the entire app. Sets `activeBusiness.id` (businesses.id) from coach's `setActiveBusiness(clientId)` call or client's own `business_users` row. Uses branded `BusinessId` / `UserId` / `BusinessProfileId` types from `src/lib/types/ids.ts`.

**Coach "view as client" shell:** `src/app/coach/clients/[id]/view/[...path]/page.tsx` — catch-all that dynamically imports client page components and calls `setActiveBusiness(clientId)`. Layout: `src/app/coach/clients/[id]/view/layout.tsx` → `CoachViewLayout`.

**Section permissions (Phase 65):** `src/lib/permissions/requireSectionPermission.ts` — checks whether the viewer has access to a specific feature section (finances, forecasts, etc.) per business. Currently `LOG_ONLY` mode globally (enforced only via `SECTION_PERMISSION_ENFORCE=true` env var redeploy gate).

---

## Xero Sync Pipeline

**OAuth flow:**
1. Client clicks "Connect Xero" → `GET /api/Xero/auth` → redirects to `https://login.xero.com/identity/connect/authorize` with signed HMAC state
2. Xero redirects to `GET /api/Xero/callback` → exchanges code for tokens → encrypts tokens → upserts `xero_connections` row keyed by `(business_id, tenant_id)`
3. Multi-tenant: if user has >1 Xero org, stores encrypted tokens in `pending_xero_connections`, redirects to `/xero-connect/select-org?pending_id=...`, then `POST /api/Xero/complete-connection` finalizes the selected org

**Token management:** `src/lib/xero/token-manager.ts` — `getValidAccessToken({ id: connectionId }, supabase)`
- 15-minute refresh threshold (`REFRESH_THRESHOLD_MINUTES = 15`)
- 30s DB lock + post-lock row re-fetch prevents race conditions
- Per-error-code policy: `invalid_grant` = terminal (deactivate), `unauthorized_client` = retry ×3, `invalid_client` = never deactivate (config bug signal), 5xx/network = transient
- Tokens stored encrypted via `src/lib/utils/encryption.ts`

**Proactive token refresh cron:** `src/app/api/cron/refresh-xero-tokens/route.ts` — runs every 6h (`0 */6 * * *`). Sequential per-connection loop. Phase 69-04 adds pre-expiry 24h Sentry warning (`xero_token_pre_expiry`) and `cron_heartbeats` table row per invocation.

**Sync orchestrator:** `src/lib/xero/sync-orchestrator.ts` — `syncBusinessXeroPL(businessId, opts?)`
1. `resolveBusinessIds` → profileId (for xero_pl_lines/xero_bs_lines) + bizId (for xero_accounts catalog)
2. `begin_xero_sync_job` RPC (advisory lock, single-flight guard)
3. Resolve `business_profiles.fiscal_year_start`; compute current + prior FY windows
4. Iterate `xero_connections WHERE business_id IN [profileId, bizId] AND is_active=true`
5. Per connection: `getValidAccessToken`, fetch `/Organisation` (timezone + `functional_currency`), fetch `/Accounts` (catalog refresh → `xero_accounts`), per-month single-period P&L fetches, FY-total oracle, reconciler, upsert to `xero_pl_lines`, stale-row sweep
6. Balance Sheet: same month list, single-period `/BalanceSheet`, Net Assets == Equity gate, upsert to `xero_bs_lines`
7. `finalize_xero_sync_job` RPC

**Sync entry points:**
- Manual coach trigger: `POST /api/Xero/sync-all` (body `{ businessId }` or `{ all: true }`)
- Daily cron: `GET /api/cron/sync-all-xero` (runs `runSyncForAllBusinesses()`)
- Both point to the same orchestrator

**Key data tables:**
- `xero_connections` — one row per `(businesses.id, xero_tenant_id)` pair; `business_id` stores `businesses.id` in new data, `business_profiles.id` in legacy data
- `xero_pl_lines` — long-format P&L cache; `business_id` must be `business_profiles.id` (migration-enforced FK), natural key: `(business_id, tenant_id, account_id, period_month)`
- `xero_bs_lines` — point-in-time BS cache; `business_id → business_profiles.id`, natural key: `(business_id, tenant_id, account_id, balance_date)`
- `xero_accounts` — chart-of-accounts catalog; `business_id → businesses.id` (legacy FK)
- `sync_jobs` — audit trail; one parent row + one per-tenant row per sync run
- `cron_heartbeats` — cadence telemetry (Phase 69-04), one row per cron invocation

---

## Consolidation Engine

**Entry point:** `src/lib/consolidation/engine.ts` — `buildConsolidatedReport(opts)` / `buildConsolidatedBudget(opts)`

**Flow:**
1. `resolveBusinessIds` once to handle dual-ID
2. Load `xero_connections WHERE business_id IN ids.all AND is_consolidation_included=true AND is_active=true`
3. Load `xero_pl_lines` grouped by tenant_id
4. Align accounts across tenants via `src/lib/consolidation/account-alignment.ts`
5. FX translate tenants whose `functional_currency` ≠ `presentation_currency` via `src/lib/consolidation/fx.ts` (uses `fx_rates` table, seeded by `GET /api/consolidation/fx-rates/sync-oxr`)
6. Apply elimination rules via `src/lib/consolidation/eliminations.ts` (rules stored in `consolidation_elimination_rules`)
7. Return `ConsolidatedReport` with per-entity columns + consolidated total

**Balance Sheet consolidation:** `src/lib/consolidation/balance-sheet.ts`

**Budget mode:** `src/lib/consolidation/engine.ts` supports `'single'` (one financial_forecast per business) and `'per_tenant'` (one forecast per xero tenant_id). Config in `businesses.consolidation_budget_mode`.

**Admin guards:** `src/lib/consolidation/admin-guards.ts` — verifies super_admin role before consolidation mutations

---

## Monthly Report Generation

**Entry:** `POST /api/monthly-report/generate/route.ts`
- Uses `createServiceRoleClient()` for all DB access (RLS bypass)
- `resolveBusinessIds` to handle dual-ID
- Loads `xero_pl_lines_wide_compat` view (compatibility view bridging old/new schema)
- Loads `financial_forecasts` + `forecast_pl_lines` for budget lines
- `requireSectionPermission` check (LOG_ONLY)
- Builds Budget vs Actual report using `src/lib/monthly-report/shared.ts` helpers

**Legacy wide-compat view:** `xero_pl_lines_wide_compat` — a Postgres view created in migration `20260429000004_xero_pl_lines_wide_compat_security_invoker.sql` that bridges old wide-format and new long-format `xero_pl_lines` rows. Security invoker (not definer) so RLS of the underlying table applies.

---

## Supabase Client Architecture

Three client types, strict usage rules:

| Client | Factory | Key Type | RLS | Where Used |
|---|---|---|---|---|
| Browser singleton | `src/lib/supabase/client.ts` `createClient()` | Publishable (anon) | Enforced | React components, BusinessContext |
| Server component / route auth | `src/lib/supabase/server.ts` `createRouteHandlerClient()` | Publishable (anon) | Enforced | Auth check at start of every API route |
| Service role | `src/lib/supabase/admin.ts` `createServiceRoleClient()` | Secret | Bypassed | All data mutations in API routes after auth check |

Additionally, ~20 route files instantiate a module-level `createClient(url, serviceKey)` directly (pre-pattern) rather than using `createServiceRoleClient()`. Both produce identical clients; this is a naming inconsistency, not a functional difference.

**Key resolver:** `src/lib/supabase/keys.ts` — `getSupabasePublishableKey()` / `getSupabaseSecretKey()` — prefers new `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` env vars, falls back to legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.

---

## Error Handling

**Strategy:** Sentry + structured responses. All route handlers wrap bodies in `try/catch` and capture to Sentry with `{ tags: { route, invariant }, extra: { context } }`.

**Patterns:**
- Route-level: `catch (error) { Sentry.captureException(error, { tags: { route: 'x' } }); return NextResponse.json({ error: '...' }, { status: 500 }) }`
- Xero sync: per-tenant try/catch isolation — a single tenant failure does not abort others; logged to `sync_jobs` + Sentry
- Cron: `safeSentryCapture()` wrapper — Sentry failure never aborts a cron run
- Heartbeat helper: fail-soft — DB failure during `recordHeartbeat` is swallowed
- Token deactivation: `xero_connection_deactivated` Sentry event fires ONCE from `token-manager.ts`; cron does NOT re-capture to prevent duplicate events

**BusinessContext errors:** `src/components/providers/ContextErrorToast.tsx` — surfaces transient BusinessContext failures (e.g. role-query failures) as a persistent toast rather than a broken page.

---

## Forking Seams (WisdomBI-Specific vs Reusable Core)

**Hard WisdomBI-specific (must be replaced/removed in a fork):**
- `src/app/layout.tsx` — title "WisdomBi - Business Intelligence", branding
- `src/app/auth/login/page.tsx`, `src/app/coach/login/page.tsx`, `src/app/admin/login/page.tsx` — WisdomBI branding
- Sentry org/project (`wisdombi` / `wisdom-bi`) in `next.config.js` lines 118–120
- `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` env vars — must be replaced with the fork's Xero app credentials
- `cfo@wisdombi.ai` sender in Resend email integrations
- All `scripts/68-*` and `scripts/armstrong-*`, `scripts/onboard-fit2shine.mjs` — tenant-specific data scripts

**Reusable core (portable):**
- `src/lib/xero/` — entire Xero sync pipeline; depends only on `xero_connections`, `xero_pl_lines`, `xero_bs_lines`, `xero_accounts`, `sync_jobs`
- `src/lib/consolidation/` — multi-tenant consolidation engine; pure library, no WisdomBI specifics
- `src/lib/supabase/` — client factories + key resolver
- `src/lib/utils/` — all resolvers, encryption, rate limiter, fiscal year utils
- `src/lib/business/resolveBusinessId.ts` — role-aware resolver
- `src/lib/permissions/` — section permission system
- `src/lib/auth/roles.ts` — role lookup
- `src/middleware.ts` — auth middleware (minor branding in redirect paths)
- All `supabase/migrations/` — schema is product-generic

**Grey zone (reusable but carries WisdomBI data model assumptions):**
- `src/contexts/BusinessContext.tsx` — portable, but assumes the coach/client/admin 3-role model
- `src/lib/monthly-report/` — Xero-specific but not WisdomBI-named
- Forecast wizard (`src/app/finances/forecast/components/wizard-v4/`) — portable if the DB schema is kept
- `src/app/coach/clients/[id]/view/[...path]/page.tsx` — the coach-view shell is a reusable pattern but imports every client page explicitly

---

*Architecture analysis: 2026-05-30*
