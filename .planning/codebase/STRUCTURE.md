# Codebase Structure

**Analysis Date:** 2026-05-30

---

## Directory Layout

```
business-coaching-platform/
├── src/
│   ├── app/                    # Next.js App Router pages + API routes
│   │   ├── api/                # 130 route.ts files — all server endpoints
│   │   │   ├── Xero/           # Xero OAuth + data routes (capital X — see Inconsistencies)
│   │   │   ├── admin/          # Super-admin management routes
│   │   │   ├── ai/             # AI assistant/advisor routes
│   │   │   ├── analytics/      # Coach analytics routes
│   │   │   ├── cfo/            # CFO dashboard routes
│   │   │   ├── coach/          # Coach-facing client management routes
│   │   │   ├── consolidation/  # Multi-entity consolidation routes
│   │   │   ├── cron/           # Scheduled job routes (5 crons)
│   │   │   ├── forecast/       # Forecast data routes
│   │   │   ├── forecast-wizard-v4/  # Wizard generation route
│   │   │   ├── forecasts/      # Forecast CRUD + scenarios
│   │   │   ├── monthly-report/ # Monthly reporting routes (~12 sub-routes)
│   │   │   └── [others]/       # goals, kpis, sessions, todos, ideas, etc.
│   │   ├── admin/              # Super-admin UI pages
│   │   ├── auth/               # Auth pages (login, signup, reset)
│   │   ├── coach/              # Coach portal pages
│   │   │   └── clients/[id]/view/[...path]/  # Coach "view as client" catch-all shell
│   │   ├── cfo/                # CFO dashboard page
│   │   ├── finances/
│   │   │   ├── forecast/       # Forecast builder + wizard UI (heavy client-side)
│   │   │   ├── cashflow/       # Cashflow planner UI
│   │   │   └── monthly-report/ # Monthly report viewer UI
│   │   └── [feature-pages]/    # dashboard, goals, swot, ideas, sessions, etc.
│   ├── __tests__/              # Vitest unit + integration tests (74 files)
│   │   ├── api/                # Route-handler tests
│   │   ├── xero/               # Xero sync/parser tests + fixtures
│   │   ├── forecast/           # Forecast calculation tests
│   │   ├── services/           # Service-layer tests
│   │   ├── lib/                # Library util tests
│   │   ├── security/           # Auth/RLS tests
│   │   ├── vercel/             # Cron registration parity test
│   │   └── [others]/           # coach, components, finance, goals, etc.
│   ├── components/             # Shared React components
│   │   ├── layout/             # Sidebar, nav, shell components
│   │   ├── layouts/            # CoachViewLayout and other wrapper layouts
│   │   ├── shared/             # Generic UI components
│   │   ├── admin/              # Admin-specific components
│   │   ├── coach/              # Coach-specific components
│   │   ├── client/             # Client-specific components
│   │   ├── dashboard/          # Dashboard components
│   │   ├── integrations/       # Xero connection components
│   │   └── providers/          # Context providers (ContextErrorToast, etc.)
│   ├── contexts/
│   │   └── BusinessContext.tsx # Single global React context for active business
│   └── lib/                    # All business logic, utilities, integrations
│       ├── ai/                 # AI integration helpers
│       ├── auth/               # Role lookup (roles.ts, lock-recovery.ts)
│       ├── business/           # resolveBusinessId.ts (role-aware resolver)
│       ├── cashflow/           # Cashflow calculation helpers
│       ├── consolidation/      # Multi-entity consolidation engine (18 files)
│       ├── cron/               # heartbeat.ts helper
│       ├── email/              # Resend email helpers
│       ├── finance/            # net-profit.ts calculation
│       ├── hooks/              # React hooks
│       ├── kpi/                # KPI definitions + helpers
│       ├── monthly-report/     # shared.ts, net-profit.ts report helpers
│       ├── permissions/        # Section permission check + enforcement
│       ├── reports/            # Report token, build-report-url, revert-report
│       ├── security/           # Security utilities
│       ├── services/           # Service objects (forecast-read, historical-pl, etc.)
│       ├── store/              # wizardStore.ts (Zustand — forecast wizard only)
│       ├── supabase/           # Client factories + key resolver
│       ├── types/              # ids.ts (branded types)
│       ├── utils/              # Resolvers, encryption, rate-limiter, validation, etc.
│       └── xero/               # Xero pipeline (sync-orchestrator, token-manager, parsers)
├── supabase/
│   ├── migrations/             # ~70 SQL migration files (baseline + incremental)
│   └── functions/              # Supabase Edge Functions (3: send-notifications, etc.)
├── scripts/                    # ~50 operational/diagnostic Node.js scripts (.ts + .mjs)
├── e2e/                        # Playwright E2E tests (2 spec files)
├── lambda/                     # AWS Lambda Xero OAuth handler (retired, not deployed)
├── public/                     # Static assets (images, logos)
├── docs/                       # Archive docs, build sessions, DB docs
├── vercel.json                 # Cron schedule (5 crons)
├── next.config.js              # Next.js config + Sentry + bundle analyzer
├── tsconfig.json               # TypeScript config
├── vitest.config.ts            # Test runner config
└── playwright.config.ts        # E2E test config
```

---

## Directory Purposes

**`src/app/api/`:**
- All server-side logic triggered by fetch calls from the browser
- Each sub-directory = one logical endpoint group
- Naming: `route.ts` is the handler; `__tests__/` may be co-located inside some route dirs (e.g. `src/app/api/Xero/pl-summary/__tests__/`, `src/app/api/forecast/[id]/__tests__/`)

**`src/app/api/Xero/`:**
- Xero OAuth and data routes
- Critical routes: `auth/`, `callback/`, `complete-connection/`, `pending-connection/`, `status/`, `sync/`, `sync-all/`, `connection-health/`, `refresh-pl/`, `pl-summary/`, `balance-sheet/`, `employees/`, `disconnect/`, `reactivate/`

**`src/app/api/cron/`:**
- 5 scheduled routes: `refresh-xero-tokens/`, `sync-all-xero/`, `reconciliation-watch/`, `daily-health-report/`, `weekly-digest/`
- All use the `Bearer ${CRON_SECRET}` fail-closed auth pattern
- All call `recordHeartbeat()` after auth gate

**`src/app/api/monthly-report/`:**
- 12 sub-routes: `generate/`, `commentary/`, `settings/`, `snapshot/`, `sync-xero/`, `consolidated/`, `consolidated-bs/`, `consolidated-cashflow/`, `account-mappings/`, `auto-map/`, `full-year/`, `wages-detail/`, `subscription-detail/`, `templates/`, `debug/`

**`src/app/coach/clients/[id]/view/[...path]/`:**
- Catch-all route that re-renders any client page inside the coach view shell
- `page.tsx` contains an exhaustive component map of every client path
- Calls `setActiveBusiness(clientId)` to point BusinessContext at the client

**`src/lib/xero/`:**
- `sync-orchestrator.ts` — main sync entry point (`syncBusinessXeroPL`, `runSyncForAllBusinesses`)
- `token-manager.ts` — `getValidAccessToken`, `REFRESH_THRESHOLD_MINUTES`
- `xero-api-client.ts` — `fetchXeroWithRateLimit`, `RateLimitDailyExceededError`
- `pl-single-period-parser.ts` — parses Xero `Reports/ProfitAndLoss` single-period JSON
- `bs-single-period-parser.ts` — parses Xero `Reports/BalanceSheet` single-period JSON
- `pl-by-month-parser.ts` — coverage computation helpers
- `pl-reconciler.ts` — monthly_sum vs fy_total reconciliation gate
- `accounts-catalog.ts` — `refreshXeroAccountsCatalog`, `classifyByXeroType`
- `organisation.ts` — `getXeroOrgTimezone` (fetches BaseCurrency + timezone)
- `trialbalance-parser.ts` — trial balance parser (used in scripts, not main sync)

**`src/lib/consolidation/`:**
- `engine.ts` — main entry point
- `account-alignment.ts` — cross-tenant account universe alignment
- `fx.ts` — FX translation
- `eliminations.ts` — intercompany elimination rules
- `balance-sheet.ts` — BS consolidation
- `cashflow.ts` — cashflow consolidation
- `oxr.ts` — OpenExchangeRates sync
- `types.ts` — shared TypeScript types

**`src/lib/utils/`:**
- `resolve-business-ids.ts` — bidirectional `businesses.id` ↔ `business_profiles.id` resolver
- `resolve-xero-business-id.ts` — 3-try xero_connections resolver
- `verify-business-access.ts` — shared `verifyBusinessAccess()` (dual-ID aware)
- `encryption.ts` — token encryption/decryption
- `rate-limiter.ts` — in-memory rate limit
- `fiscal-year-utils.ts` — FY month generation
- `account-matching.ts` — fuzzy account name matching for monthly report
- `validation.ts`, `vendor-normalization.ts`, `needs-fx-consolidation.ts`

**`src/lib/services/`:**
- `forecast-read-service.ts` — reads financial_forecasts + forecast_pl_lines
- `forecast-seed-service.ts` — seeds forecast from Xero actuals
- `historical-pl-summary.ts` — historical P&L aggregation for forecast wizard

**`supabase/migrations/`:**
- `00000000000000_baseline_schema.sql` — 14,690-line baseline dump (all tables, RLS, functions)
- All subsequent migrations named `YYYYMMDDNNNNNN_description.sql`
- Recent (post-2026-04-28): xero_pl_lines long-format, sync_jobs, xero_bs_lines, section permissions, sharing columns, cron heartbeats

**`scripts/`:**
- Operational TypeScript/ESM scripts run directly with `tsx` or `node`
- Pattern: `canary-*.ts` (production smoke tests), `audit-*.ts` (data quality), `diag-*.ts` (triage), `verify-*.ts` (migration verification), `capture-*-fixture.ts` (Xero response capture), `resync-*.ts` (force re-sync for specific clients), `68-*.mjs` / `armstrong-*.mjs` (client-specific onboarding data scripts)

---

## Key File Locations

**Entry Points:**
- `src/app/layout.tsx` — root layout, wraps all pages in `BusinessContextProvider` + `SidebarLayout`
- `src/middleware.ts` — Edge middleware (auth, CSRF, security headers)
- `src/app/page.tsx` — root page (redirects based on role)

**Supabase Clients:**
- `src/lib/supabase/client.ts` — browser singleton
- `src/lib/supabase/server.ts` — `createRouteHandlerClient()`, `createServerComponentClient()`
- `src/lib/supabase/admin.ts` — `createServiceRoleClient()`
- `src/lib/supabase/keys.ts` — key resolution with new/legacy env var fallback

**Identity / Access:**
- `src/lib/types/ids.ts` — `BusinessId`, `UserId`, `BusinessProfileId` branded types (used in only 4 files)
- `src/lib/business/resolveBusinessId.ts` — role-aware resolver (newest, most correct)
- `src/lib/utils/resolve-business-ids.ts` — bidirectional resolver (most widely used — 75 files)
- `src/lib/utils/resolve-xero-business-id.ts` — Xero-connection resolver
- `src/lib/utils/verify-business-access.ts` — shared access check (15 routes import)
- `src/lib/auth/roles.ts` — system role lookup
- `src/contexts/BusinessContext.tsx` — client-side active business + user context

**Xero Sync Core:**
- `src/lib/xero/sync-orchestrator.ts` — `syncBusinessXeroPL()`, `runSyncForAllBusinesses()`
- `src/lib/xero/token-manager.ts` — `getValidAccessToken()`, `REFRESH_THRESHOLD_MINUTES`
- `src/app/api/cron/refresh-xero-tokens/route.ts` — proactive 6h token refresh cron
- `src/app/api/cron/sync-all-xero/route.ts` — daily full sync cron
- `src/app/api/Xero/sync-all/route.ts` — manual + cron shim pointing at orchestrator
- `src/app/api/Xero/callback/route.ts` — OAuth callback (tokens + initial sync)

**Monthly Report:**
- `src/app/api/monthly-report/generate/route.ts` — main report generation
- `src/lib/monthly-report/shared.ts` — shared helpers (calcVariance, buildSubtotal, etc.)

**Forecast:**
- `src/app/finances/forecast/page.tsx` — forecast page entry
- `src/app/finances/forecast/components/wizard-v4/` — current active wizard
- `src/app/api/forecast/[id]/recompute/route.ts` — forecast recomputation trigger

**Configuration:**
- `vercel.json` — 5 cron schedules
- `next.config.js` — Next.js + Sentry + bundle analyzer config
- `vitest.config.ts` — test runner

---

## Naming Conventions

**Files:**
- Route handlers: `route.ts` (always, enforced by Next.js)
- Pages: `page.tsx`
- Layouts: `layout.tsx`
- Components: `PascalCase.tsx` (e.g. `BusinessContext.tsx`, `KPIInitializer.tsx`)
- Library modules: `kebab-case.ts` (e.g. `sync-orchestrator.ts`, `token-manager.ts`, `resolve-business-ids.ts`)
- Test files: `*.test.ts` in `src/__tests__/` hierarchy

**Directories:**
- App routes: `kebab-case` (e.g. `monthly-report/`, `coach-dashboard/`)
- Exception: `src/app/api/Xero/` uses capital **X** — this is an inconsistency (see below)
- Dynamic segments: `[id]`, `[businessId]`, `[...path]`

**Functions:**
- Route handlers: `GET`, `POST`, `PUT`, `DELETE`, `PATCH` (exported, uppercase)
- Library functions: `camelCase` (e.g. `resolveBusinessIds`, `syncBusinessXeroPL`)
- React components: `PascalCase`
- Supabase client factories: `createXxxClient()` pattern

---

## Where to Add New Code

**New API endpoint:**
- Create `src/app/api/<feature>/<action>/route.ts`
- Pattern: auth via `createRouteHandlerClient()`, data via `createServiceRoleClient()` or imported from `src/lib/supabase/admin.ts`
- Add access check: `import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'`
- If touches Xero data: use `resolveBusinessIds` from `src/lib/utils/resolve-business-ids.ts`

**New client page:**
- Create `src/app/<feature>/page.tsx` with `'use client'`
- Add to the component map in `src/app/coach/clients/[id]/view/[...path]/page.tsx` so coaches can view it

**New Xero data fetch:**
- Add URL builder + fetcher to `src/lib/xero/xero-api-client.ts` or inline using `fetchXeroWithRateLimit`
- Parse raw Xero JSON in a dedicated `*-parser.ts` in `src/lib/xero/`
- Upsert to a DB table via service-role client

**New cron job:**
- Create `src/app/api/cron/<job>/route.ts`
- Add `Bearer ${CRON_SECRET}` fail-closed auth gate
- Call `recordHeartbeat()` from `src/lib/cron/heartbeat.ts` after auth gate
- Add to `vercel.json` `crons` array + add parity test in `src/__tests__/vercel/cron-registration.test.ts`

**New library utility:**
- If standalone: `src/lib/utils/<name>.ts`
- If Xero-specific: `src/lib/xero/<name>.ts`
- If consolidation-specific: `src/lib/consolidation/<name>.ts`

**New DB migration:**
- Create `supabase/migrations/YYYYMMDDNNNNNN_description.sql`
- Follow idempotent pattern (IF NOT EXISTS, DO blocks for constraint adds)

**New test:**
- Vitest unit/integration: `src/__tests__/<category>/<name>.test.ts`
- Co-located route test: `src/app/api/<feature>/__tests__/<name>.test.ts`
- E2E: `e2e/<name>.spec.ts`

---

## Notable Inconsistencies and Architectural Quirks

**`src/app/api/Xero/` uses capital X:**
- All other API routes are lowercase. `Xero/` is capital. This forces all OAuth redirect URIs to include the capital (e.g. `APP_URL/api/Xero/callback`). Do NOT rename without updating Xero app settings.

**Dual verifyAccess implementations:**
- `src/lib/utils/verify-business-access.ts` — shared, 4-check, dual-ID aware (15 routes import)
- `src/app/api/kpis/route.ts` — local `verifyBusinessAccess()` is a simpler 2-check version that uses `business_profiles.user_id` but NOT `business_users` membership or `system_roles`
- `src/app/api/Xero/sync/route.ts` — local `verifyUserAccess()` checks owner, coach, membership, super_admin but does NOT handle the dual-ID form

**Module-level service-role clients:**
- ~20 route files instantiate `const supabaseAdmin = createClient(url, serviceKey)` at module level (evaluated at cold start)
- Newer routes use `createServiceRoleClient()` from `src/lib/supabase/admin.ts`
- Functionally identical but the module-level pattern means Vercel preview deployments with missing env vars throw at module load, not at request time

**`src/lib/supabase/helpers.ts` and `helpers-backup.ts`:**
- `helpers-backup.ts` is a dead file (backup, not imported)
- `helpers.ts` may be superseded by the specialized factory files

**Two `forecasts` tables:**
- `financial_forecasts` — the primary forecast table (heavy, used everywhere)
- `forecasts` — a simpler legacy table referenced by some older routes (`src/app/api/forecasts/` routes)

**`xero_pl_lines` dual FK:**
- Baseline schema adds `→ businesses.id`; migration 20260430000002 adds second FK `→ business_profiles.id`
- Both constraints exist simultaneously in production. The migration intent is that `business_id` MUST be a `business_profiles.id`, making the baseline FK a dangling constraint. This has never been cleaned up.

**`auth_can_manage_business()` still contains `check_business_id = auth.uid()` fallback:**
- Line 116 of baseline: this means the RLS function allows access if the business_id happens to equal the current user's UUID — the exact bug pattern that `resolveBusinessId.ts`'s invariant guard was added to catch. The RLS function and the app-layer invariant are working at cross-purposes.

**`lambda/` directory:**
- Contains an AWS SAM Lambda for Xero OAuth (`lambda/xero-oauth-handler/`). Not deployed — the OAuth flow was migrated to the Next.js callback route. Kept for historical reference.

**`src/app/bali-retreat/` and `src/app/ai-advantage/`:**
- Marketing/landing pages that are public (exempted from auth in middleware). Domain-specific to WisdomBI.

**`xero_pl_lines_wide_compat` view:**
- A Postgres VIEW that bridges old wide-format and new long-format `xero_pl_lines` rows. Routes query this view instead of the table directly to maintain backwards compatibility. Security invoker (not SECURITY DEFINER) so RLS of underlying `xero_pl_lines` applies.

**Wizard versions:**
- `src/app/finances/forecast/components/forecast-builder/` — older wizard
- `src/app/finances/forecast/components/setup-wizard/` — intermediate version
- `src/app/finances/forecast/components/wizard-v4/` — current active version
- `src/app/finances/forecast/components/forecast-cfo/` — CFO-mode view
- Multiple versions coexist; only wizard-v4 is wired to active routes

---

*Structure analysis: 2026-05-30*
