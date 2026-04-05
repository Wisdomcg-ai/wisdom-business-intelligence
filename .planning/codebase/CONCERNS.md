# Codebase Concerns

**Analysis Date:** 2026-04-04

## Tech Debt

### [Critical] Duplicate / macOS-Copy Files and Directories Polluting the Codebase

- Issue: There are 16 duplicate directories (named with " 2" / " 3" suffix) and 13 duplicate files scattered through `src/`. These are macOS Finder copy artifacts that should never have been committed. Some are in routing-significant paths (e.g. `src/app/auth/login 2/`, `src/app/auth/callback 3/`) which Next.js may attempt to serve.
- Files:
  - `src/app/auth/login 2/`, `src/app/auth/login 3/`
  - `src/app/auth/callback 2/`, `src/app/auth/callback 3/`
  - `src/app/dashboard/integrations/xero 2/`
  - `src/app/team/org-chart/page 2.tsx`, `src/app/team/org-chart/types 2.ts`
  - `src/app/team/org-chart/components 2/`, `src/app/team/org-chart/utils 2/`
  - `src/app/api/forecast/[id] 2/`, `src/app/api/monthly-report/sync-xero 2/`
  - `src/app/finances/forecast/components/CashflowForecastChart 2.tsx` (and 5 more)
  - `src/app/finances/monthly-report/components 2/`, `services 2/`, `constants 2/`, `types 2/`, `hooks 2/`, `utils 2/`
  - `src/app/dashboard/coach-link 2.txt`
- Impact: Build confusion, dead code shipped to production, potential route conflicts. The `node_modules/` directory also has 32 duplicate `" 3"` directories, indicating a corrupted install.
- Fix approach: Delete all `" 2"` and `" 3"` suffixed files/directories. Run `rm -rf node_modules && npm install` to clean up `node_modules/`. Add `.DS_Store` and `*" "*` patterns to `.gitignore`.

### [Critical] Four Generations of Forecast Wizard Coexisting

- Issue: There are **five** separate forecast wizard implementations all living in the codebase simultaneously:
  1. `src/app/finances/forecast/components/ForecastWizard.tsx` (1051 lines)
  2. `src/app/finances/forecast/components/ForecastWizardV2.tsx` (980 lines)
  3. `src/app/finances/forecast/components/wizard-v3/ForecastWizardV3.tsx` (885 lines)
  4. `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` (1909 lines) -- current
  5. `src/app/finances/forecast/components/setup-wizard/SetupWizard.tsx` + steps
  6. `src/app/finances/forecast/components/forecast-builder/ForecastBuilder.tsx` + steps
- Files: `src/app/finances/forecast/components/` (102 files, ~45,600 lines total across the directory)
- Impact: Massive maintenance burden, confusion about which version is active, duplicated logic. Only wizard-v4 appears to be the current version (used in `page.tsx`).
- Fix approach: Confirm wizard-v4 is the only active version. Remove ForecastWizard.tsx, ForecastWizardV2.tsx, wizard-v3/, setup-wizard/, forecast-builder/, and wizard-steps/ directories. Estimated removal: ~30 files, ~8,000+ lines.

### [Warning] Dual Supabase Client Libraries (auth-helpers-nextjs + ssr)

- Issue: Two different Supabase client libraries are used side-by-side. `@supabase/ssr` (the current recommended approach) and the deprecated `@supabase/auth-helpers-nextjs` are both imported across the codebase.
- Files using deprecated `@supabase/auth-helpers-nextjs`:
  - `src/lib/supabase-server.ts` (`createServerComponentClient`)
  - `src/app/auth/callback 2/route.ts`, `src/app/auth/callback 3/route.ts` (`createRouteHandlerClient`)
  - `src/components/todos/CoachDashboard.tsx`, `src/components/todos/hooks/useMorningRitual.ts`, `src/components/todos/MorningRitual.tsx` (type imports)
  - `src/app/api/forecasts/scenarios/route.ts` (`createRouteHandlerClient`)
  - `src/app/finances/forecast/components/wizard-v4/components/AICFOPanel.tsx` (`createClientComponentClient`)
- Files using modern `@supabase/ssr`:
  - `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/middleware.ts`, and ~14 other imports
- Impact: Inconsistent auth cookie handling, potential session mismatches between old and new client patterns.
- Fix approach: Migrate all `@supabase/auth-helpers-nextjs` imports to `@supabase/ssr`. Remove the legacy `src/lib/supabase-server.ts` file and the `@supabase/auth-helpers-nextjs` dependency.

### [Warning] Inconsistent Supabase Client Creation Patterns

- Issue: Multiple competing patterns for creating Supabase clients:
  1. **Singleton browser client:** `src/lib/supabase/client.ts` (recommended)
  2. **Legacy browser client:** `src/lib/supabase.ts` (re-exports `createBrowserClient`)
  3. **Legacy server client:** `src/lib/supabase-server.ts` (deprecated helpers)
  4. **Modern server client:** `src/lib/supabase/server.ts` (recommended)
  5. **Inline `createClient`/`createBrowserClient` calls:** scattered across ~12 files (e.g., `src/components/swot/SwotActionPanel.tsx`, `src/components/todos/TodoManagerV2.tsx`, `src/app/assessment/[id]/page.tsx`)
  6. **Inline `createClient` with service key:** ~26 API routes create their own admin clients
- Impact: Some components bypass the singleton client, which could cause auth flickering. Admin client creation is duplicated across dozens of API routes instead of using the centralized `src/lib/supabase/admin.ts`.
- Fix approach: Standardize all browser client usage through `src/lib/supabase/client.ts`. Standardize all API route admin clients through `src/lib/supabase/admin.ts`. Remove `src/lib/supabase.ts` and `src/lib/supabase-server.ts`.

### [Warning] Backup/Dead Files in Source Tree

- Issue: Backup and old files are checked into the source tree:
  - `src/app/vision-mission/page-old-backup.tsx`
  - `src/app/dashboard/page-old.tsx`
  - `src/lib/supabase/helpers-backup.ts`
  - `src/app/coach-dashboard/page.tsx` (437 lines, legacy route replaced by `src/app/coach/dashboard/page.tsx`)
  - `src/app/dashboard/coach-link.txt`, `src/app/dashboard/coach-link 2.txt`
- Impact: Confusion about active vs. dead code. New developers may reference wrong files.
- Fix approach: Delete all backup files. Move `coach-dashboard` redirect to the new location or remove entirely.

### [Warning] `_archive/` Directory Contains 163 Files (2.8MB)

- Issue: The untracked `_archive/` directory at project root contains stale source code, SQL scripts, migration backups, and even a PDF. This is not in `.gitignore`.
- Files: `_archive/` (163 files including `src/`, `stray-routes/`, `supabase-migrations/`, `supabase-scripts/`, `schema_dump.sql`)
- Impact: Untracked clutter that could accidentally be committed. May contain outdated patterns that confuse AI tools or developers.
- Fix approach: Either delete or add `_archive/` to `.gitignore`.

### [Info] Root-Level Stray Files

- Issue: Several development artifacts, HTML mockups, and scripts exist at the project root:
  - `mockup-step4-actuals.html` (HTML mockup)
  - `dwa_resources.html` (resource page)
  - `check_spm_kpis.mjs` (debugging script)
  - `packaged.yaml` (SAM build artifact)
  - `template.yml` (AWS SAM template with hardcoded RDS hostname)
  - `BRANDING_UPDATE_PLAN.md`, `DESIGN_SYSTEM_PLAN.md`, `UI_UX_AUDIT_REPORT.md`, `UI_UX_IMPLEMENTATION_PLAN.md` (planning docs)
- Impact: Repo clutter. The `template.yml` contains a hardcoded RDS hostname that reveals infrastructure details.
- Fix approach: Move docs to `docs/`. Delete HTML mockups and debugging scripts. Remove or `.gitignore` SAM artifacts.

### [Info] 12 `.DS_Store` Files in Source Tree

- Issue: macOS `.DS_Store` files are scattered through `src/`. While `.gitignore` excludes them, they are present on disk and some may have been committed before the rule was added.
- Files: 12 `.DS_Store` files across `src/`, `src/app/`, `src/components/`, `src/lib/`, etc.
- Fix approach: Run `git rm -r --cached '*.DS_Store'` to ensure none are tracked.

## Known Bugs

### [Warning] Disabled Onboarding Flow

- Symptoms: New users skip business profile and assessment onboarding steps and go directly to all routes.
- Files: `src/middleware.ts` (lines 140-168)
- Trigger: The onboarding checks are commented out with `// TEMPORARILY DISABLED: Onboarding checks removed to allow business plan access`. The associated TODO says to re-enable once business plan development is complete.
- Workaround: Users can access all features without completing profile or assessment, which may cause downstream data issues.

### [Warning] Unimplemented TODO Features in Production Code

- Symptoms: Multiple placeholder features that users may encounter:
  - `src/app/settings/team/page.tsx:430` - "TODO: Implement email resend" -- team invite resend button does nothing
  - `src/app/coach-dashboard/page.tsx:384` - "TODO: Implement scheduling" -- scheduling button is non-functional
  - `src/app/finances/forecast/components/forecast-cfo/ForecastCFO.tsx:99` - "TODO: Save forecast to database" -- AI-generated forecasts not persisted
  - `src/app/finances/forecast/components/forecast-cfo/CFOConversation.tsx:501` - "TODO: Save to database" -- conversation data lost
  - `src/app/finances/forecast/components/AnnualPlanProgressWidget.tsx:59-61` - ytdRevenue, ytdGrossProfit, ytdNetProfit all hardcoded to 0
- Impact: Users see buttons/features that don't work. Financial data shows incorrect zero values.
- Workaround: None for end users.

### [Info] Coach Client View Missing Features

- Files: `src/app/coach/clients/[id]/page.tsx`
  - Line 556: `// TODO: Uncomment when stop_doing_list table is created`
  - Line 668: `// TODO: Run the RLS fix migration then uncomment this`
- Impact: Coach cannot see client's stop-doing list or certain data sections.

## Security Considerations

### [Critical] 16 API Routes Missing Authentication Checks

- Risk: Multiple API routes use the Supabase service role key (bypasses RLS) but do not verify the calling user's identity. Any authenticated user (or potentially unauthenticated requests, since API routes are excluded from middleware) could access these endpoints.
- Files (all using `SUPABASE_SERVICE_KEY!` without `getUser()` check):
  - `src/app/api/Xero/subscription-transactions/route.ts` (1153 lines)
  - `src/app/api/Xero/reconciliation/route.ts`
  - `src/app/api/Xero/chart-of-accounts/route.ts`
  - `src/app/api/Xero/sync-forecast/route.ts`
  - `src/app/api/Xero/callback/route.ts`
  - `src/app/api/Xero/employees/route.ts`
  - `src/app/api/monthly-report/auto-map/route.ts`
  - `src/app/api/monthly-report/settings/route.ts`
  - `src/app/api/monthly-report/wages-detail/route.ts`
  - `src/app/api/monthly-report/snapshot/route.ts`
  - `src/app/api/monthly-report/subscription-detail/route.ts`
  - `src/app/api/monthly-report/commentary/route.ts`
  - `src/app/api/monthly-report/account-mappings/route.ts`
  - `src/app/api/monthly-report/full-year/route.ts`
  - `src/app/api/subscription-budgets/route.ts`
  - `src/app/api/health/route.ts` (acceptable for health check)
- Current mitigation: Middleware does not apply to `/api` routes (see matcher config at `src/middleware.ts:223-234`). These routes rely solely on Supabase RLS -- but they use the **service role key which bypasses RLS**.
- Recommendations: Add `getUser()` auth check to every API route that reads or mutates user data. Use the anon key + server client (which respects RLS) or add explicit user verification before service-role operations.

### [Critical] Hardcoded Demo Credentials in Source Code

- Risk: Default demo account credentials are hardcoded in source code.
- Files: `src/app/api/admin/demo-client/route.ts` (lines 20-21)
  - `email: process.env.DEMO_CLIENT_EMAIL || 'demo@smithsplumbing.com.au'`
  - `password: process.env.DEMO_CLIENT_PASSWORD || 'DemoPassword123!'`
- Current mitigation: Environment variable overrides exist but fallback values are committed.
- Recommendations: Remove hardcoded fallback credentials. Require env vars and fail if missing.

### [Warning] CSRF Protection Implemented But Never Used

- Risk: A full CSRF protection system exists (`src/lib/security/csrf.ts` with `csrfProtection()`, `validateCsrfToken()`, `withCsrf()`) and the middleware sets CSRF tokens in cookies (`src/middleware.ts:22-31`). However, **zero API routes actually call `csrfProtection()`** and **zero client-side fetch calls use `withCsrf()`** (only the definition file itself references it).
- Files:
  - `src/lib/security/csrf.ts` (defines the protection)
  - `src/middleware.ts` (sets the cookie)
  - No API route imports `csrfProtection`
- Current mitigation: None for state-changing requests. SameSite=strict cookies provide some protection.
- Recommendations: Either wire up `csrfProtection()` in all POST/PUT/DELETE API routes (ideally via shared middleware) or document why it is not needed.

### [Warning] Rate Limiting Covers Only 11 of 88 API Routes

- Risk: The in-memory rate limiter (`src/lib/utils/rate-limiter.ts`) is only applied to 11 routes, leaving 77 API routes unprotected against abuse.
- Files:
  - Protected: `src/app/api/ai/advisor/route.ts`, `src/app/api/ai/forecast-assistant/route.ts`, `src/app/api/ai-assist/route.ts`, `src/app/api/processes/ai-mapper/route.ts`, `src/app/api/wizard/chat/route.ts`, `src/app/api/email/send/route.ts`, `src/app/api/auth/reset-password/route.ts`, `src/app/api/auth/update-password/route.ts`, `src/app/api/admin/reset-password/route.ts`, `src/app/api/sessions/[id]/analyze-transcript/route.ts`, `src/app/api/monthly-report/generate/route.ts`
  - Unprotected: All other 77 routes including Xero sync, subscription management, client management, KPI operations
- Current mitigation: In-memory rate limiter (not shared across serverless instances).
- Recommendations: Apply rate limiting to at least all data-mutation and external API proxy routes. Consider middleware-level rate limiting. For production with multiple instances, migrate to Redis-backed rate limiting.

### [Warning] Encryption Key Fallback Chain Is Risky

- Risk: The encryption module (`src/lib/utils/encryption.ts`) falls back through multiple env vars for the key: `APP_SECRET_KEY` -> `ENCRYPTION_KEY` -> `SUPABASE_SERVICE_KEY`. Using the Supabase service key as an encryption key means rotating it would break all encrypted data. The PBKDF2 salt is hardcoded (`'xero-tokens-salt-v1'`).
- Files: `src/lib/utils/encryption.ts` (lines 19-41, 148-153)
- Current mitigation: PBKDF2 derivation with 100,000 iterations when using non-standard key formats.
- Recommendations: Require a dedicated `ENCRYPTION_KEY` env var. Do not fall back to the Supabase service key. Use a random salt stored alongside the encrypted data.

### [Info] `template.yml` Exposes Infrastructure Details

- Risk: The AWS SAM template at project root contains a hardcoded RDS hostname: `buinsess-coaching-financial.ch6q24kwynr1.ap-southeast-2.rds.amazonaws.com` (also note the typo "buinsess").
- Files: `template.yml` (line 13)
- Recommendations: Remove from version control or parameterize.

## Performance Bottlenecks

### [Warning] Oversized Page Components

- Problem: Several page-level components are extremely large, combining data fetching, state management, and rendering in single files. This prevents code splitting and increases initial bundle size.
- Files (largest by line count):
  - `src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx` (2890 lines)
  - `src/app/goals/components/Step5SprintPlanning.tsx` (2800 lines)
  - `src/app/finances/monthly-report/services/monthly-report-pdf-service.ts` (2523 lines)
  - `src/app/business-profile/page.tsx` (2199 lines)
  - `src/app/quarterly-review/components/steps/QuarterlyPlanStep.tsx` (2088 lines)
  - `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` (1909 lines)
  - `src/app/goals/components/Step4AnnualPlan.tsx` (1848 lines)
  - `src/app/reviews/weekly/page.tsx` (1719 lines)
- Cause: No component decomposition. Business logic, UI, and data access all in one file.
- Improvement path: Extract business logic into hooks/services. Break UI into smaller sub-components. Use React.lazy() for heavy wizard steps.

### [Warning] Middleware Executes Two DB Queries Per Request

- Problem: The middleware (`src/middleware.ts`) calls `supabase.auth.getUser()` (1 auth API call) and for non-exempt routes also queries `system_roles` table (1 DB query). This happens on every navigation.
- Files: `src/middleware.ts` (lines 80, 128-132)
- Cause: Role checking in middleware rather than caching the role in session/cookie.
- Improvement path: Cache user role in a signed cookie or JWT claim to eliminate the second query. Consider using Supabase custom claims.

### [Info] No Loading States for Most Pages

- Problem: Only a handful of pages have `loading.tsx` files. Nearly all 99 page routes lack loading states, meaning users see blank screens during navigation.
- Files: Most `src/app/*/page.tsx` routes are missing corresponding `loading.tsx`.
- Improvement path: Add `loading.tsx` skeleton components to high-traffic routes (dashboard, goals, finances, coach).

## Fragile Areas

### [Warning] Forecast Components Directory (102 Files, ~45,600 Lines)

- Files: `src/app/finances/forecast/components/`
- Why fragile: Five different wizard implementations, multiple overlapping step components (wizard-steps/, setup-wizard/steps/, forecast-builder/steps/, wizard-v3/, wizard-v4/steps/), shared state hooks. Changes to shared types or services can break any of the five wizards.
- Safe modification: Only modify files in `wizard-v4/` (the active version). Do not modify other wizard versions.
- Test coverage: No automated tests exist for any forecast wizard.

### [Warning] Quarterly Review Step Components (27 Files)

- Files: `src/app/quarterly-review/components/steps/` (27 step files)
- Why fragile: Heavy use of `eslint-disable-next-line react-hooks/exhaustive-deps` (9 occurrences) indicates dependency array issues in effects. Multiple steps share data through a complex hook (`useQuarterlyReview`) with catch-all error suppression.
- Safe modification: Test each step in isolation. Verify effect dependencies before changing state shapes.
- Test coverage: No automated tests.

### [Warning] Xero Integration

- Files: `src/app/api/Xero/` (15 route files), `src/lib/xero/token-manager.ts`, `src/lib/api/xero-client.ts`
- Why fragile: OAuth token refresh logic is complex with multiple failure modes. Many Xero API routes create their own Supabase admin client instead of sharing one. The token manager handles rate limiting, refresh, and encryption -- a failure in any part breaks all Xero operations.
- Safe modification: Always test with Xero sandbox. Ensure token refresh works before deploying changes.
- Test coverage: No automated tests.

## Scaling Limits

### [Warning] In-Memory Rate Limiter

- Current capacity: Works for single-process deployment.
- Limit: Rate limit state is not shared across Vercel serverless function instances. Each cold start gets a fresh `Map()`.
- Scaling path: Migrate to Redis-backed rate limiting (Upstash Redis is a common choice for Vercel).
- Files: `src/lib/utils/rate-limiter.ts`

### [Info] 102 Supabase Migration Files

- Current capacity: Functional but growing.
- Limit: At 102 migrations with some being iterative fixes (e.g., `fix_goals_wizard_save`, `fix_goals_wizard_complete`), the migration history is becoming unwieldy.
- Scaling path: Consider squashing older migrations into a baseline. Ensure migration naming is consistent.
- Files: `supabase/migrations/` (102 files)

## Dependencies at Risk

### [Critical] Vulnerable Dependencies

- Risk: `npm audit` reports vulnerabilities in several dependencies:
  - **critical:** `jspdf` -- used for PDF generation
  - **high:** `axios`, `next`, `@typescript-eslint/parser`, `flatted`, `minimatch`
  - **moderate:** `ajv`, `brace-expansion`, `dompurify`
- Impact: Security vulnerabilities in production dependencies.
- Migration plan: Run `npm audit fix`. For `jspdf` critical vulnerability, evaluate upgrading or switching to an alternative PDF library. Update `next` to the latest 14.x patch.

### [Warning] Duplicate Drag-and-Drop Libraries

- Risk: Both `@dnd-kit/core` + `@dnd-kit/sortable` and `@hello-pangea/dnd` are installed. They serve the same purpose.
- Impact: Unnecessary bundle size (~50KB+ extra). `@hello-pangea/dnd` is only imported in 1 file (`src/components/AnnualPlan.tsx`) while `@dnd-kit/*` is used in 8 files.
- Migration plan: Migrate `src/components/AnnualPlan.tsx` from `@hello-pangea/dnd` to `@dnd-kit`. Remove `@hello-pangea/dnd`.

### [Warning] Dual Toast Libraries

- Risk: Both `react-hot-toast` and `sonner` are installed for toast notifications.
- Impact: Inconsistent toast UX across the app. `react-hot-toast` is used in 5 files, `sonner` usage is minimal.
- Migration plan: Standardize on one library (recommend `sonner` as it is the newer, more maintained option). Migrate the 5 `react-hot-toast` call sites.

### [Warning] Dual AI Provider SDKs

- Risk: Both `openai` and `@anthropic-ai/sdk` are installed.
- Impact: Two separate AI billing accounts, two SDKs to maintain, different error handling patterns.
- Files:
  - OpenAI used in: `src/app/api/processes/ai-mapper/route.ts`, `src/app/api/ai-assist/route.ts`, `src/app/api/sessions/[id]/analyze-transcript/route.ts`, `src/app/api/wizard/chat/route.ts`
  - Anthropic used in: `src/app/api/ai/advisor/route.ts`, `src/app/api/ai/forecast-assistant/route.ts`, `src/lib/services/claude-cfo-agent.ts`
- Migration plan: Consolidate on one provider or create an abstraction layer. The stub file at `src/lib/ai/openaiParser.ts` suggests an incomplete migration.

### [Info] Deprecated `@supabase/auth-helpers-nextjs`

- Risk: This package is deprecated in favor of `@supabase/ssr`. It is still a dependency and actively imported.
- Impact: No future security patches or bug fixes.
- Migration plan: Replace all imports (listed in the "Dual Supabase Client Libraries" section above) with `@supabase/ssr` equivalents.

## Missing Critical Features

### [Critical] Zero Automated Tests

- Problem: The codebase has 853 source files and ~268,000 lines of TypeScript code with **zero test files**. No `*.test.*`, `*.spec.*`, or `__tests__/` directories exist anywhere.
- Blocks: Safe refactoring, confident deployments, regression detection.
- Files: No test framework configured (no `jest.config.*`, `vitest.config.*`).
- Priority: High. At minimum, add integration tests for API routes and unit tests for critical services (forecast calculations, encryption, token management).

### [Warning] No Input Validation on API Routes

- Problem: Zod is installed (`"zod": "^4.0.17"`) but not imported in any API route. All `request.json()` bodies are trusted without schema validation.
- Blocks: Reliable error handling, protection against malformed requests.
- Files: All 88 API routes in `src/app/api/`.
- Priority: High for routes accepting user input, especially those using service role keys.

### [Warning] No Error Monitoring / Tracking in Production

- Problem: The error tracking module (`src/lib/utils/error-tracking.ts`) exists but only logs to `console.error` in production. No Sentry, Datadog, or similar service is integrated.
- Blocks: Visibility into production errors.
- Files: `src/lib/utils/error-tracking.ts` (lines 25, 73)
- Priority: Medium. Essential for production debugging.

## Test Coverage Gaps

### [Critical] No Tests Anywhere

- What's not tested: Everything. The entire codebase -- 88 API routes, 151 client-side services, 99 pages, 102 components -- has zero automated test coverage.
- Files: All `src/**/*.ts` and `src/**/*.tsx`
- Risk: Any change could introduce regressions undetected. Financial calculations (forecast, P&L), auth flows, Xero sync, and encryption logic are all untested.
- Priority: Critical. Start with:
  1. `src/lib/utils/encryption.ts` -- encrypt/decrypt correctness
  2. `src/app/finances/forecast/services/` -- financial calculation accuracy
  3. `src/app/api/auth/` routes -- auth flow correctness
  4. `src/lib/xero/token-manager.ts` -- token refresh logic
  5. `src/app/api/coach/clients/route.ts` -- role-based access control

## Data Concerns

### [Warning] Inconsistent Service Key Environment Variable Names

- Issue: Some API routes use `SUPABASE_SERVICE_ROLE_KEY` while others use `SUPABASE_SERVICE_KEY`. These may or may not be the same value.
- Files using `SUPABASE_SERVICE_KEY!`:
  - 26 files across `src/app/api/Xero/`, `src/app/api/monthly-report/`, `src/app/api/subscription-budgets/`, `src/lib/utils/encryption.ts`
- Files using `SUPABASE_SERVICE_ROLE_KEY!`:
  - `src/lib/supabase/admin.ts`, `src/lib/notifications.ts`, `src/app/api/kpis/route.ts`, `src/app/api/admin/` routes, `src/app/api/forecasts/export/route.ts`
- Impact: If these env vars point to different values (or one is unset), some routes will fail silently or use wrong permissions.
- Fix approach: Standardize on `SUPABASE_SERVICE_ROLE_KEY` (the official Supabase name). Update all references and remove the alias.

---

*Concerns audit: 2026-04-04*
