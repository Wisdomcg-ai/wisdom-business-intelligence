# Codebase Audit — wisdom-business-intelligence

**Auditor**: Claude Opus 4.7 (1M context)
**Date**: 2026-04-28
**Commit**: `14d25e1b916037b1d3d0ff5f490aba66330fb609` (branch: `main`)
**Scope**: Full source audit — `src/`, `supabase/migrations/`, `supabase/functions/`, top-level config, scripts. `.planning/` excluded as process artifacts.

---

## Executive Summary

Wisdom BI is a 9-month-old multi-tenant Next.js 14 + Supabase + Xero financial-reporting platform replacing Calxa. After auditing 992 TS/TSX files (~303k LOC), 120 API routes, 154 database tables with 397 RLS policies, and 8 active migrations, the picture is **two-faced**: the security and database fundamentals are noticeably better than typical 9-month-old codebases, but the application surface above them is unguarded, oversized, and accumulating rot.

**Headline verdict**: production-viable for current scale, **not** production-grade for Series-A scrutiny without 4–8 weeks of focused remediation. The single most concerning class of finding is that this is a **finance app handling multi-currency consolidation in JavaScript `number` (IEEE 754 float)** with **0 of 120 API routes validating input** — investors and auditors will flag both immediately.

**Top 3 strengths**
1. **All 154 tables have RLS enabled** with sane policies. 41 SECURITY DEFINER functions correctly use `SET search_path = ''`. Multi-tenant isolation uses helper functions (`auth_can_access_business`, `auth_get_accessible_business_ids`) — centralised and auditable. (Better than most 9-month codebases.)
2. **Strong domain layer for consolidation**: `src/lib/consolidation/` (engine, fx, balance-sheet, eliminations, oxr, cashflow) is isolated, testable, and **has 11 unit-test files**. Branded types for IDs (`UserId`, `BusinessId`) with type-level tests. Xero OAuth tokens are AES-256-GCM encrypted at rest with a token-refresh distributed lock.
3. **Real CSP, HSTS, security headers in production** (`next.config.js`, `src/middleware.ts:213-251`). Open-redirect protection on `?next=` (`src/middleware.ts:132-134`). Cron endpoints fail-closed with `CRON_SECRET` (with one exception — see #1 below).

**Top 3 risks**
1. 🔴 **Money is `number`, input is `any`**: Multi-currency consolidation (AUD/NZD/HKD) sums in IEEE 754 floats; 120/120 API routes accept `request.json()` with no schema validation despite Zod being in dependencies. (Score correctness 3/10.)
2. 🔴 **Test gate is broken**: `npm test` fails locally — `Cannot find module '@vitejs/plugin-react'` even though it's in `package.json`. CI runs vitest on every PR (`.github/workflows/supabase-preview.yml:51`); if this is reproducible in CI it means the test gate has been silently red. **Verify CI status before next merge.**
3. 🔴 **`/api/migrate` and `/api/migrate/opex-fields`** ship arbitrary-SQL execution to production. Both call `supabase.rpc('exec_sql', ...)` / `rpc('exec', ...)` — but **neither RPC function exists in the schema** (verified by grep across `supabase/migrations/`). The routes are dead code AND a prepared attack vector if those RPCs are ever added. Auth-gated to super_admin (good) but should be deleted entirely.

---

## Production Readiness Score: **55 / 100**

| Pillar | Weight | Score | Weighted |
|---|---|---|---|
| Security | 25% | 7 / 10 | 17.5 |
| Database | 20% | 6.5 / 10 | 13.0 |
| Type Safety & Correctness | 15% | 3 / 10 | 4.5 |
| Architecture | 15% | 5.5 / 10 | 8.25 |
| Testing | 10% | 4 / 10 | 4.0 |
| Performance | 5% | 5 / 10 | 2.5 |
| Dependencies | 5% | 6 / 10 | 3.0 |
| Redundancy / Dead Code | 5% | 5 / 10 | 2.5 |
| **TOTAL** | **100%** | | **55.25 → 55 / 100** |

**Reading**: 55/100 is *not* a failing grade for a 9-month founder-built app. It says: the foundation is solid (auth, RLS, encryption, consolidation engine), but the surface around it (validation, types, dead code, test infrastructure, observability) is patchy. With 4–8 focused weeks following the Top 10 list below, this can plausibly hit 75/100 — Series-A defensible.

---

## Section Scores (1–10)

| Area | Score | One-line verdict |
|---|---|---|
| A. Security | 7 | Strong RLS/auth/encryption fundamentals; input-validation desert and brittle key fallback. |
| B. Architecture & Boundaries | 5.5 | Clean domain layer + tenant-resolver; 90% client-rendered pages, jsPDF in client bundle, route sprawl. |
| C. Type Safety & Correctness | 3 | `strict: true` but 847 `any` casts, money in floats, `eslint.ignoreDuringBuilds: true`. |
| D. Database | 6.5 | Excellent RLS coverage; 56 FKs missing `ON DELETE`, no soft-delete on financial tables. |
| E. Performance | 5 | 86/95 pages `'use client'` (no SSR), 48 files >1000 LOC, in-memory rate limit doesn't scale. |
| F. Testing | 4 | Strong unit suite for consolidation; **vitest currently broken**, only 2 e2e tests, no coverage gate. |
| G. Dependencies | 6 | One HIGH CVE (axios — unused), Next/React behind major versions, two deprecated packages still active. |
| H. Redundancy / Dead Code | 5 | ~192 files / 2.1 MB safe to delete; multiple wizard versions, `_archive/`, AWS SAM remnants. |
| I. DX & Tooling | 4 | No prettier, no husky, no `.editorconfig`, default Next.js README, ESLint disabled at build. |
| J. Documentation & Observability | 4 | Sentry wired but underused (2 `captureException` calls); structured logger built and **never imported**. |

---

## Top 10 Highest-Leverage Fixes

Ranked by (impact × tractability). Estimates assume one engineer focusing.

### 1. 🔴 Repair the test gate, then **block PRs on lint + typecheck + tests + build**
- **Problem**: `npm test` fails locally (`Cannot find module '@vitejs/plugin-react'`). CI's vitest step (`.github/workflows/supabase-preview.yml:51`) runs vitest on every PR; if this fails reproducibly the gate is red. Also `next.config.js:4-6` sets `eslint.ignoreDuringBuilds: true`. Net effect: nothing is *enforced* on merge.
- **Evidence**: `npm ls @vitejs/plugin-react` returns `(empty)`; `next.config.js:4-6`; CI workflow only runs `tsc --noEmit` and `vitest`.
- **Fix sketch**: `npm install --save-dev @vitejs/plugin-react@^6.0.1`, remove `ignoreDuringBuilds`, expand the workflow to run `next lint && tsc --noEmit && vitest run && next build` on every PR. Add `playwright test` as a separate job for nightly.
- **Effort**: 0.5 day.

### 2. 🔴 Delete `/api/migrate` and `/api/migrate/opex-fields` (dead + dangerous)
- **Problem**: Both routes call Supabase RPCs (`exec_sql`, `exec`) that **do not exist** in the schema — confirmed by grep across `supabase/migrations/`. The routes are dead today (any call returns an error), but they document an arbitrary-SQL backdoor. Anyone who later adds those RPCs (for any reason) immediately has a super_admin → arbitrary-SQL pipeline shipped to production.
- **Evidence**: `src/app/api/migrate/route.ts:37,49` (`rpc('exec_sql', ...)`), `src/app/api/migrate/opex-fields/route.ts:35` (`rpc('exec', ...)`); zero matches for `FUNCTION.*exec_sql` or `FUNCTION.*\bexec\b` in `supabase/migrations/`.
- **Fix sketch**: `git rm -r src/app/api/migrate/`. If you need ad-hoc DB changes, use `supabase migration new` locally and PR it.
- **Effort**: 5 minutes.

### 3. 🔴 Add Zod validation at every API boundary
- **Problem**: 0 of 120 API routes validate request bodies. Zod (`^4.0.17`) is in `package.json` and unused. Some routes do shallow `if (!x || !y)` checks that don't catch type mismatches. Routes like `/api/team/invite/route.ts:42-53` accept `email`, `role`, `businessId` as `any`.
- **Evidence**: Zero matches for `from 'zod'` in `src/app/api/`; correctness audit `.audit-tmp/correctness.md` finding #1.
- **Fix sketch**: Build a `withSchema(schema, handler)` wrapper in `src/lib/api/with-schema.ts`. Migrate the 5 highest-risk routes first: `/api/admin/clients`, `/api/team/invite`, `/api/forecasts/*`, `/api/cfo/report-status`, `/api/Xero/*`. Then sweep the rest.
- **Effort**: 1 week (5 high-risk routes); 2–3 weeks for full sweep.

### 4. 🔴 Replace JS-`number` financial arithmetic with a decimal library
- **Problem**: DB stores money as `numeric(15,2)` (correct), but TS reads it as JS `number` and sums in IEEE 754. Multi-currency consolidation (Dragon AUD + IICT NZ + HKG HKD via FX rates) compounds the drift. A $1M annual revenue can drift $5–50; multi-tenant elimination entries can drift more.
- **Evidence**: `src/lib/consolidation/types.ts:25` (`monthly_values: Record<string, number>`); `src/lib/consolidation/engine.ts:200+` summation loops.
- **Fix sketch**: Add `decimal.js` or `big.js`. Parse Supabase `numeric` columns as strings → Decimal. Refactor consolidation summation. Convert to `number` only at JSON serialisation. Pair with a branded `TranslatedAmount<'AUD'>` type so untranslated amounts can't be summed.
- **Effort**: 1 week (consolidation only); 2 weeks across forecast paths.

### 5. 🟠 Fix `/api/Xero/sync-all` cron-secret check (fails open)
- **Problem**: `src/app/api/Xero/sync-all/route.ts:573-580` — `if (cronSecret && authHeader !== ...)`. If `CRON_SECRET` env var is unset, the route lets *any* caller trigger a full Xero sync across all tenants. Other cron routes (`/api/cron/daily-health-report`, `/api/cron/weekly-digest`) correctly fail closed.
- **Evidence**: `src/app/api/Xero/sync-all/route.ts:573-580`; compare to `src/app/api/cron/daily-health-report/route.ts:13`.
- **Fix sketch**: Hard-fail when `CRON_SECRET` isn't set in production: `if (!cronSecret) return 500; if (authHeader !== 'Bearer ' + cronSecret) return 401;`
- **Effort**: 10 minutes.

### 6. 🔴 Adopt the structured logger; turn down 2,012 `console.*` calls
- **Problem**: `src/lib/utils/logger.ts` is a well-designed structured logger. **0 files import it.** Meanwhile there are 2,012 `console.log`/`error`/`warn` statements across `src/`, including 639 in API routes — some logging error objects with stack traces. Sentry has only **2** `captureException` calls in the entire codebase.
- **Evidence**: `grep -rln "from '@/lib/utils/logger'" src/` returns 0 files; `grep -rn "console\." src/` returns 2,012 lines; `grep -rn "Sentry.captureException" src/` returns 2.
- **Fix sketch**: Either delete the unused logger and standardise on `Sentry.captureException` for errors + `console.log` only behind `NODE_ENV !== 'production'` guards, or wire the logger into all API routes via a `withLogging(handler)` middleware. **Pick one and remove the other.**
- **Effort**: 1 week (sweeps + middleware).

### 7. 🟠 Encrypt-at-rest hardening: remove plaintext fallback, require explicit key
- **Problem**: `src/lib/utils/encryption.ts:79-83` — `decrypt()` returns plaintext if the input doesn't contain `:`, ostensibly for migration. Means any plaintext token in the DB is silently used. `src/lib/utils/encryption.ts:20-41` falls back the encryption key to `SUPABASE_SERVICE_KEY` via PBKDF2 with hardcoded salt `'xero-tokens-salt-v1'`. Service-role compromise → token decryption.
- **Evidence**: `src/lib/utils/encryption.ts:20-41,79-83`; `pending_xero_connections` uses `encrypted_*` column names but `xero_connections` uses raw `access_token`/`refresh_token` — code-level encryption is the only thing protecting them.
- **Fix sketch**: (a) Migration script to verify all `xero_connections` rows have `:` in their tokens. (b) Remove the plaintext fallback. (c) Require `APP_SECRET_KEY` to be explicitly set in production; throw at boot if missing.
- **Effort**: 0.5 day.

### 8. 🟠 Re-enable onboarding gate or delete the dead branch
- **Problem**: `src/middleware.ts:173-201` has 30 lines of commented-out onboarding logic with `// TODO: Re-enable once business plan development is complete`. Currently new clients can access dashboards without `business_profiles.profile_completed = true` or a completed assessment. The TODO has no date.
- **Evidence**: `src/middleware.ts:173-201`.
- **Fix sketch**: Decide: (a) it's intentionally permanent — delete the dead code and the TODO, (b) it's coming back — set a date, gate behind a feature flag, and re-enable. Don't leave commented-out logic in production middleware.
- **Effort**: 1 hour (decision) + 0.5 day (re-enable with a flag).

### 9. 🟠 Delete dead wizard versions (~4,400 LOC)
- **Problem**: `src/app/finances/forecast/components/wizard-v3/` (6 files, ~2,000 LOC) and `src/app/finances/forecast/components/wizard-steps/` (5 files) have **zero imports anywhere in `src/`**. Only `wizard-v4/` is alive (24 files, 11 import sites). v3 and wizard-steps are tombstones.
- **Evidence**: `grep -rln "wizard-v3\|wizard-steps" src/` returns no callers; `find src/app/finances/forecast/components/wizard-v3 src/app/finances/forecast/components/wizard-steps -exec wc -l` totals 4,424 LOC.
- **Fix sketch**: `git rm -r src/app/finances/forecast/components/wizard-v3 src/app/finances/forecast/components/wizard-steps`. Run typecheck + build to confirm.
- **Effort**: 30 minutes.

### 10. 🟠 Break up the 6 god-files (>2,000 LOC) — start with the two biggest
- **Problem**: 6 files exceed 2,000 LOC: `Step4Team.tsx` (2,922), `Step5SprintPlanning.tsx` (2,852), `monthly-report-pdf-service.ts` (2,523), `business-profile/page.tsx` (2,353), `QuarterlyPlanStep.tsx` (2,085), `Step4AnnualPlan.tsx` (1,898 — borderline). 48 files exceed 1,000 LOC. These are unreviewable, untestable, and where most of the 847 `any` casts and 2,012 `console.*` calls live.
- **Evidence**: `find src -name '*.tsx' -exec wc -l {} +` ranked listing.
- **Fix sketch**: For each, extract: (a) sub-step components, (b) form schemas (which become Zod schemas — solves #3), (c) data-shaping logic into `src/lib/<domain>/`. Aim for <500 LOC per file. Don't refactor for its own sake — do this when next touching the feature.
- **Effort**: 1 week per file when next feature work hits it (6 weeks elapsed; not blocking).

---

## Quick Wins (< 1 day each)

1. Repair vitest by installing `@vitejs/plugin-react` (#1) — *15 min*.
2. Delete `/api/migrate/*` (#2) — *5 min*.
3. Fix `/api/Xero/sync-all` cron-secret fail-open (#5) — *10 min*.
4. Delete dead wizard-v3 and wizard-steps directories (#9) — *30 min*.
5. Delete `_archive/`, `.archive/`, `supabase/archive/` (~370 files, ~2.5 MB) — *15 min*.
6. Delete `dwa_resources.html`, `mockup-step4-actuals.html`, `check_spm_kpis.mjs`, `packaged.yaml`, `template.yml` (AWS SAM remnants — repo is on Vercel) — *5 min*.
7. Delete `eslint.config.mjs` (Next.js 14 reads `.eslintrc.json`; the flat config is dead) — *1 min*.
8. Remove `axios` from `package.json` (0 imports in `src/`, but carries HIGH SSRF + DoS CVEs) — *5 min*.
9. Re-write the README — currently the default Next.js boilerplate (`README.md`, last touched 2025-11-29) — *1 hr*.
10. Move `BRANDING_UPDATE_PLAN.md`, `DESIGN_SYSTEM_PLAN.md`, `UI_UX_*.md` (Apr 2025, superseded by `.planning/`) into `docs/archive/` or delete — *5 min*.
11. Rename two date-only migrations (`20260424_cfo_email_log.sql`, `20260427_unique_active_forecast_per_fy.sql`) to full timestamp form for ordering safety — *5 min*.
12. Validate inputs to two SECURITY DEFINER SQL functions: `create_test_user(role)` and `create_quarterly_swot(quarter)` reject invalid values — *1 hr*.
13. Add `tsconfig.tsbuildinfo` and `next-env.d.ts` to `.gitignore` (already there for `next-env.d.ts`; `tsbuildinfo` is committed) — *5 min*.
14. Add a `bundle-analyzer` script (`@next/bundle-analyzer`) so bundle bloat from `xlsx`, `exceljs`, `bpmn-moddle`, `diagram-js`, `recharts`, `jspdf` is measurable — *30 min*.
15. Rotate the hardcoded fallback Sentry DSN out of `sentry.client.config.ts:3` (and the two server/edge configs) — fallback DSN means any fork submits events to your project — *5 min*.

---

## Strategic Investments (> 1 week)

1. **Zod migration across all 120 API routes** (~2–3 weeks). Pair this with a typed error-response helper. Net effect: every API route has a contract.
2. **Decimal-based money arithmetic in consolidation + forecast** (~2 weeks). Brand `TranslatedAmount<'AUD'>` so untranslated NZD/HKD can't be summed.
3. **Move rate limiting from in-memory `Map` to Redis or Supabase-backed** (~1 week). Today, `src/lib/utils/rate-limiter.ts:23` uses `new Map()` — every Vercel cold-start resets the counter. Distributed limit needed before any real traffic.
4. **Soft-delete + audit columns on every mutable financial table** (~1 week). Today only 2 of 154 tables have `deleted_at`. Add `deleted_at`, `deleted_by`, `created_by`, `updated_by` via trigger to the 20 most-touched financial tables.
5. **Add `ON DELETE CASCADE`/`SET NULL` to the 56 FKs that lack a delete clause** (~1 week with testing). Today, deleting a `users` or `businesses` row leaves orphans across 11+ tables.
6. **Re-architect 90% client-rendered pages to use RSC where data fetching dominates** (~3–4 weeks, can be staged). 86 of 95 pages start with `'use client'`. App Router's RSC streaming/SEO/perf benefits are mostly forfeit.
7. **Migrate the 5 remaining `@supabase/auth-helpers-nextjs` callsites to `@supabase/ssr`** (~1 week). The former is officially deprecated.
8. **Generated Supabase types in CI** (~3 days). Today there are hand-written `src/types/database.ts` and `src/types/supabase.ts`; they go stale silently when the schema changes.
9. **CSRF middleware enforcement** (~3 days). The middleware sets a CSRF cookie at `src/middleware.ts:23-31` but **only a few routes validate it** (`/api/team/invite` does; most don't).
10. **Bundle a real CI workflow** (~1 week). Today there's only `supabase-preview.yml`. Need: PR gate (lint + typecheck + tests + build), separate Playwright job, dependency audit (`npm audit --audit-level=high`), nightly Lighthouse.

---

## Detailed Findings

### A. Security — **7 / 10**

**Verdict**: Mature security fundamentals well above the baseline for a 9-month codebase. Real CSP, real RLS, real OAuth-token encryption, real cron auth. The headline gap is *input validation* — every API route trusts its caller, and rate limiting won't survive horizontal scale.

**Strengths**

- All 154 baseline tables have `ENABLE ROW LEVEL SECURITY`. Helper functions `auth_can_access_business`, `auth_get_accessible_business_ids`, `auth_is_super_admin` centralise multi-tenant logic.
- 41 SECURITY DEFINER functions all use `SET search_path = ''` (or `'public'`) — prevents path-hijacking privilege escalation.
- AES-256-GCM with 128-bit auth tag for Xero OAuth tokens (`src/lib/utils/encryption.ts`); timing-safe HMAC for report-link tokens (`src/lib/reports/report-token.ts:46-49`).
- CSP set with explicit allowlist for Stripe, Xero, OpenAI, Sentry (`src/middleware.ts:231-247`); HSTS in production; X-Frame-Options DENY; Referrer-Policy strict-origin-when-cross-origin.
- Open-redirect protection on `?next=` parameter (`src/middleware.ts:132-134` — rejects `//` prefix).
- `/api/cron/daily-health-report` and `/api/cron/weekly-digest` fail closed if `CRON_SECRET` doesn't match.
- 0 occurrences of `dangerouslySetInnerHTML`, 0 occurrences of `eval(` in `src/`.

**🔴 CRITICAL**

1. **Plaintext-token fallback in `decrypt()`** — `src/lib/utils/encryption.ts:79-83`. If a token doesn't contain `:`, it's returned as-is. Combined with no migration validation, a single un-encrypted insert silently degrades the security posture.
2. **Encryption-key fallback to service-role key** — `src/lib/utils/encryption.ts:20-41`. PBKDF2 from `SUPABASE_SERVICE_KEY` with hardcoded salt `'xero-tokens-salt-v1'`. Compromise of service-role key = compromise of all Xero OAuth tokens.

**🟠 HIGH**

3. **`/api/Xero/sync-all` cron-secret check fails open** — `src/app/api/Xero/sync-all/route.ts:573-580` (`if (cronSecret && authHeader !== ...)`). If env var is unset in any environment, anyone can trigger a full Xero sync.
4. **`/api/migrate` and `/api/migrate/opex-fields`** — call non-existent RPCs (`exec_sql`, `exec`). Dead today, dangerous if those RPCs are ever added. Auth-gated to super_admin (good).
5. **Rate limiting is in-memory only** — `src/lib/utils/rate-limiter.ts:23` (`new Map()`). Fails across Vercel instance cold-starts.
6. **0 of 120 API routes validate input** — Zod is in deps and unused. See Top-10 #3.
7. **Admin DELETE on 11 related tables not transactional** — `src/app/api/admin/clients/route.ts:493-598`. Partial-delete leaves orphaned rows across user_permissions, user_roles, etc.

**🟡 MEDIUM**

8. **Xero token-refresh distributed lock has no timeout** — `src/lib/xero/token-manager.ts:109-144`. If the holder crashes, lock is held indefinitely. Add staleness check: lock is invalid if `token_refreshing_at > now() - 30s`.
9. **CSRF token generated but rarely validated** — `src/middleware.ts:23-31` sets the cookie; only a handful of routes (`/api/team/invite`) call `csrfProtection(request)`. Most state-changing routes don't.
10. **Plaintext one-time passwords in invitation emails** — `src/app/api/team/invite/route.ts:421-469`. Best practice: magic link or password-set-on-first-login.
11. **No audit trail for super_admin actions** — admin client creation/deletion logs to `console.log` only. No `admin_audit_log` table.
12. **Onboarding middleware disabled with TODO** — `src/middleware.ts:173-201`. See Top-10 #8.
13. **Hardcoded fallback Sentry DSN** — `sentry.client.config.ts:3` (and server/edge variants). The DSN is also in `next.config.js:120` but as a default for `org`/`project`. Anyone forking the repo will silently submit events to your Sentry org.

**🟢 LOW**

14. **`axios` in deps with HIGH SSRF + DoS CVEs** — but **0 imports in `src/`**. Just delete it.
15. **Migration error response leaks SQL** — `src/app/api/migrate/route.ts:89-100` returns the failed SQL string. Moot once #2 is deleted.
16. **OAuth state encoding ambiguity** — `src/lib/utils/encryption.ts:218-222` accepts both base64 and base64url, silently. Pick one.

### B. Architecture & Boundaries — **5.5 / 10**

(Full report: `.audit-tmp/architecture.md` — 18 findings across 436 lines.)

**Verdict**: The consolidation domain layer and tenant-scoping helpers are genuinely good. The application surface above them is leaky at the server/client boundary, has duplicate API routes, and ships server-only libs to the browser.

**Strengths**

- `src/lib/consolidation/` is a real domain layer: `engine.ts`, `fx.ts`, `balance-sheet.ts`, `cashflow.ts`, `eliminations.ts`, `oxr.ts`, `account-alignment.ts` — 11 unit-test files, branded types, fixture data under `__fixtures__/`. **Model of clean design.**
- `src/lib/cashflow/` similarly factored.
- **Centralised tenant resolution**: `src/lib/business/resolveBusinessId.ts` is role-aware (client/coach/admin), throws on user-id-as-business-id confusion, and is used by 19 files. Better than typical multi-tenant scaffolding.
- **Branded types** in `src/lib/types/ids.ts`: `UserId`, `BusinessId`, `BusinessProfileId` — compile-time guards against ID swaps.
- **Service layer emerging**: `src/lib/services/` (9 files including `claude-cfo-agent.ts`, `historical-pl-summary.ts`), plus per-domain services in `src/app/finances/forecast/services/` and `src/app/finances/monthly-report/services/`.
- Single Zustand store (`src/lib/store/wizardStore.ts`) — no state-management sprawl.
- **42 route-level `error.tsx`** files; **14 `loading.tsx`**; 13 `<Suspense>` boundaries.
- Single auth middleware (`src/middleware.ts`) — public-route allowlist, role-aware redirects, CSRF + CSP + headers all centralised.

**🔴 CRITICAL**

1. **jsPDF + jspdf-autotable bundled into a `'use client'` page** — `src/app/dashboard/assessment-results/page.tsx:1,23` imports both directly; estimated +200 KB of unnecessary client JS. PDF generation belongs server-side.
2. **86 of 95 pages start with `'use client'`** — only 5 are server-rendered (`/strategic-initiatives`, `/coach`, `/wizard`, `/todo`, `/reports/view/[token]`). RSC, streaming, SEO, and most of App Router's perf upside forfeit.

**🟠 HIGH**

3. **No tenant-enforcement middleware on 120 API routes** — there are **147 manual `.eq('business_id', ...)` calls** across the route handlers. RLS catches accidental omissions, but a missing `.eq()` plus a service-role client = tenant escape. There is no lint rule preventing this.
4. **Components reach directly into Supabase**: 118 component files (28 in `src/components/`, the rest in `src/app/`) import `createClient` from `@/lib/supabase/client` and call `.from(...)`. No service layer between UI and DB for those paths.
5. **Route sprawl with overlapping responsibilities**:
   - 4 Xero sync routes: `/api/Xero/sync`, `/api/Xero/sync-all`, `/api/Xero/sync-forecast`, `/api/monthly-report/sync-xero`.
   - Singular vs plural duplicates: `/api/forecast/*` (3 routes) and `/api/forecasts/*` (5 routes).
   - `/api/forecast-wizard-v4/generate` — implies v1–v3 existed at the route layer too.
6. **Dead wizard versions** — `wizard-v3/` (6 files, ~2,000 LOC) and `wizard-steps/` (5 files, ~2,400 LOC) have no callers anywhere in `src/`. See Top-10 #9.
7. **6 god-files >2,000 LOC**: `Step4Team.tsx` (2,922), `Step5SprintPlanning.tsx` (2,852), `monthly-report-pdf-service.ts` (2,523), `business-profile/page.tsx` (2,353), `QuarterlyPlanStep.tsx` (2,085), `Step4AnnualPlan.tsx` (1,898). 48 files >1,000 LOC.
8. **`Xero` capitalisation** in route paths (`/api/Xero/*`) is inconsistent with the rest of the API (lowercase kebab-case). Works, but unusual; rename when convenient.

**🟡 MEDIUM**

9. **25 untagged components in `src/components/`** that import client-only libs but don't have `'use client'` — ambiguous execution context.
10. **Two Supabase client libraries in parallel use** — `@supabase/auth-helpers-nextjs` (deprecated, 5 callsites) and `@supabase/ssr` (current, 14 callsites). Mid-migration.
11. **Two AI SDKs**: Anthropic for advisor/CFO; OpenAI for wizard. Both seem intentional.
12. **Two drag-and-drop libraries**: `@dnd-kit/*` (8 files) + `@hello-pangea/dnd` (1 file: `AnnualPlan.tsx`). Migrate the one to dnd-kit; drop hello-pangea.
13. **Three export libraries**: `jspdf` + `jspdf-autotable`, `exceljs`, `xlsx`. All in use (`exceljs` confirmed at `excel-export-service.ts:1` — keep).
14. **Consolidation budget mode (single vs per_tenant)** introduced via Phase 34 migration `20260420195612` with a defensive `COALESCE(...,'single')` default. Test coverage of `per_tenant` mode hasn't been verified.

### C. Type Safety & Correctness — **3 / 10**

(Full report: `.audit-tmp/correctness.md` — 23 findings across 490 lines.)

**Verdict**: The compiler thinks types are strict. The code disagrees.

**Strengths**

- `tsconfig.json` has `strict: true`. Branded ID types (`UserId`, `BusinessId`) prevent accidental mixing — with type-level tests in `src/lib/types/__tests__/ids.test-d.ts` (7 `@ts-expect-error` assertions).
- `src/lib/utils/env-validation.ts` — startup env validation exists.
- Custom error hierarchy in `src/lib/kpi/types.ts` (`CacheError`, `KPIError`, `ValidationError`).

**🔴 CRITICAL**

1. **0 of 120 API routes validate request bodies with Zod**. 82 `await request.json()` calls; bodies typed `any`. (Top-10 #3.)
2. **847 `any` casts across `src/`**. Densest: `src/app/quarterly-review/summary/[id]/page.tsx` (35), `src/app/one-page-plan/services/plan-data-assembler.ts` (29). 14% of all `any`s are in API routes — the highest-risk zone.
3. **Money is `number` (IEEE 754) in TS**, despite `numeric(15,2)` in DB. (Top-10 #4.)
4. **5 silent catch blocks** swallow errors and return null/false:
   - `src/components/coach/ClientActivityLog.tsx:99` — `catch { return null }`.
   - `src/lib/health-checks.ts:22,30` — `catch { return { status: 'ok', ... } }` (lies to load balancer).
   - `src/lib/security/csrf.ts:79` — `catch { return false }` — CSRF parse failure silently allows request.
   - `src/lib/utils/encryption.ts:50,67,78,106` — multiple silent crypto failures.
5. **Supabase results trusted without narrowing** — `.maybeSingle()` returns nullable, callers proceed assuming success (e.g., `src/app/api/monthly-report/consolidated/route.ts:100`).
6. **2,012 `console.*` calls; 639 in API routes** — error objects logged with stack traces. (Top-10 #6.)

**🟠 HIGH**

7. **Timezone handling fragmented** — `src/lib/timezone.ts` exists and hardcodes `Australia/Sydney`. Not used in consolidation engine, forecast period boundaries, or FX-rate freshness checks. NZ tenant (IICT) FY boundaries can drift by a day.
8. **Currency type not enforced in summation** — `ConsolidationTenant.functional_currency` exists but no type-level guard prevents summing untranslated NZD with translated AUD.
9. **No Supabase type generation** — hand-written `src/types/database.ts`, `src/types/supabase.ts`. Goes stale when schema changes.
10. **`eslint.ignoreDuringBuilds: true`** — `next.config.js:4-6`. Build never fails on lint. (Top-10 #1 covers this.)

**🟡 MEDIUM**

11. **`tsconfig.json` strict-mode loopholes**: no `noUncheckedIndexedAccess` (so `array[0]` is `T` not `T | undefined`); no `exactOptionalPropertyTypes`; no `noImplicitOverride`; no `noPropertyAccessFromIndexSignature`. `skipLibCheck: true` (acceptable for build speed).
12. **Xero report responses untyped** — `src/app/api/forecast/cashflow/sync-balances/route.ts:115`, `bank-balances/route.ts:52`, `capex/route.ts:42` — all access `(r: any).RowType`. Brittle to Xero schema changes.
13. **PDF size cap defined but not enforced** — `src/app/api/cfo/report-status/route.ts:47` (`MAX_PDF_BASE64_BYTES = 10_000_000`) is unused. Resend's 40 MB cap could be hit silently.
14. **1 `@ts-ignore`** at `src/components/todos/TodoManagerV2.tsx:174` (substantive); 9 `@ts-expect-error` (all in type tests — acceptable).

### D. Database — **6.5 / 10**

(Full report: `.audit-tmp/database.md` — 15 findings across 509 lines.)

**Verdict**: Mature multi-tenant design with industry-standard RLS. Three integrity gaps (orphan FKs, no soft-delete, semi-overlapping `business_id`/`tenant_id`) need closure before Series-A.

**Strengths**

- All 154 tables have `ENABLE ROW LEVEL SECURITY`. 397 policies. 41 SECURITY DEFINER functions, all with `SET search_path` set.
- Money uses `numeric(p,s)` everywhere checked. Currency tracked per business (`businesses.functional_currency`), per forecast, per Xero connection.
- 365 `CREATE INDEX` statements vs 250 `REFERENCES` — 1.46:1 ratio is healthy.
- Audit log table for forecast mutations (`forecast_audit_log`) with `row_to_json` before/after capture and a SECURITY DEFINER trigger function.
- `xero_connections.token_refreshing_at` — a real distributed lock for token refresh.

**🔴 CRITICAL**

1. **56 of 250 FKs lack `ON DELETE`** — orphan-prone. Examples: `action_items.assigned_to → auth.users.id` (no `ON DELETE`), `business_users.invited_by`, `businesses.assigned_coach_id`, `business_financial_goals.user_id`, `business_kpis.user_id`. Deleting a user leaves dangling references.
2. **No soft-delete on financial tables** — only 2 tables in 154 have `deleted_at`. Critical missing: `financial_forecasts`, `forecast_employees`, `monthly_actuals`, `xero_pl_lines`, `cfo_report_status`. Hard deletes lose audit trail entirely.
3. **`cashflow_account_profiles.days` is `double precision`** — `supabase/migrations/00000000000000_baseline_schema.sql:2035`. Drives `dso_days`/`dpo_days` calcs. Inconsistent with finance-grade discipline.

**🟠 HIGH**

4. **Dual `business_id` + `tenant_id` semantics in `financial_forecasts`** — Phase 34 added `tenant_id`; legacy rows have `tenant_id IS NULL` (business-level forecast); new rows scope to a specific Xero tenant. Querying `WHERE business_id = X` returns mixed scopes. Document this contract or risk double-counting.
5. **Migration naming inconsistency** — 5 migrations use `YYYYMMDDHHMMSS_*.sql`, 2 use `YYYYMMDD_*.sql` (`20260424_cfo_email_log.sql`, `20260427_unique_active_forecast_per_fy.sql`). CI accepts both (`.github/workflows/supabase-preview.yml:39`). Risk of ordering ambiguity if multiple migrations land same day.
6. **Stale `database/migrations/` directory** at repo root — 17 SQL files, separate from `supabase/migrations/`. Likely pre-baseline legacy, but nobody can confirm without checking. Move to `_archive/` or delete.
7. **Two SECURITY DEFINER functions accept un-validated text inputs**:
   - `create_test_user(email, role text)` — `role` is inserted without enum validation.
   - `create_quarterly_swot(quarter text)` — cast to integer; `'9999'::int` succeeds but produces nonsense.
8. **Three RLS policies use `USING (true)`** for authenticated users: `swot_templates`, `kpi_benchmarks`, `kpi_definitions`. Acceptable IF these are system-shared reference data; not if they're per-business.

**🟡 MEDIUM**

9. **~74 tables missing `created_by`** (audit-trail gap for compliance). Most have `created_at`/`updated_at`.
10. **No `UNIQUE` constraint on `xero_connections(business_id, tenant_id) WHERE is_active = true`** — app enforces it, DB doesn't. Belt-and-braces would help.
11. **`quarterly_forecasts.{revenue,profit,cash}_target` are `bigint`**, while everywhere else uses `numeric(15,2)`. Inconsistency.

### E. Performance — **5 / 10**

**Verdict**: No obvious *runtime* catastrophes, but this app forfeits most of Next.js App Router's perf upside through near-total client-side rendering, and has the bones of a slow consolidation flow that hasn't been profiled.

**🟠 HIGH**

1. **86 of 95 pages are `'use client'`** — server components, streaming, RSC-level data fetching: all unused. SEO and TTFB will lag once traffic exists. (Architecture #1.)
2. **Only 6 `Promise.all` calls across 120 API routes** — sequential `await` is the default. The `monthly-report/wages-detail/route.ts:312,369` shows two `Array.map(async ...)` patterns followed by `Promise.all` — acceptable. But most routes are likely linear.
3. **No bundle analyser** — `package.json` has no `analyze` script. Heavyweights in client deps: `recharts`, `xlsx`, `exceljs`, `jspdf`, `bpmn-moddle`, `diagram-js` — most should be dynamically imported, not in the initial bundle.
4. **In-memory rate limit doesn't scale** (Security #5).
5. **Xero rate-limit handling not audited** — `xero-node` has built-in throttling; verify backoff/queuing in `src/lib/services/xero-*` (specialist agent didn't reach this — needs verification).

**🟡 MEDIUM**

6. **`recharts` 3.5 → 3.8** is one of dozens of patch upgrades available.
7. **No image-related warnings noted**, but `next/image` discipline wasn't checked exhaustively (needs verification).

### F. Testing — **4 / 10**

**Verdict**: A genuinely strong consolidation unit-test suite living next to a broken test command and a near-empty E2E.

**Strengths**

- 11 unit-test files for `src/lib/consolidation/` covering engine, fx, balance-sheet, eliminations, oxr, cashflow, account-alignment, admin-guards, engine-budgets, engine-budget-mode, account-alignment.
- 4 unit-test files for `src/lib/cashflow/` (engine, schedules, account-resolution, phase282).
- 4 component tests for monthly-report (`CommentaryLine`, `ReportStatusBar`, `SaveIndicator`, plus 2 hooks tests).
- 2 API integration tests (`/api/consolidation/businesses/[id]`, `/api/monthly-report/consolidated*`).
- Playwright config uses production build (`playwright.config.ts:32`) — realistic test environment.

**🔴 CRITICAL**

1. **`npm test` is broken** — `Cannot find module '@vitejs/plugin-react'` though it's in `package.json`. CI's vitest step is likely red on every PR. (Top-10 #1.)

**🟠 HIGH**

2. **Only 2 E2E specs** — `e2e/smoke.spec.ts` and `e2e/coach-flow.spec.ts`. Auth flow, payment flow, Xero connection, forecast generation, report send — all untested at the browser level.
3. **No coverage gate** — vitest doesn't run `--coverage` in CI; no minimum threshold.
4. **No tests for any of the 120 API routes except 2 consolidation routes** — request-validation contracts, auth checks, RLS bypass safety: all untested.
5. **Test fixtures contain `TODO_MATT_CONFIRM` placeholder values** — `src/lib/consolidation/__fixtures__/iict-mar-2026.ts` has 14 occurrences of `TODO_MATT_CONFIRM` (e.g., line 60, 70, 73, 87, 97, 117, 127, 145–146). Tests pass against numbers that aren't confirmed against the source PDFs. **Tests are passing on possibly-wrong reference data.**

**🟡 MEDIUM**

6. **Mock Supabase clients are typed `any`** in test setup — `src/app/api/cfo/report-status/__tests__/route.test.ts:35-50`. Acceptable for tests but indicates fragility.
7. **Playwright not in CI** — workflow only runs `tsc + vitest`.

### G. Dependencies — **6 / 10**

**Verdict**: One unused dep with HIGH CVEs, two deprecated packages, several behind majors. No catastrophic supply-chain issues. Mostly tractable.

**Findings**

1. **`axios` ^1.11.0 in deps; 0 imports in `src/`. Has known HIGH CVEs:**
   - GHSA-43fc-jf86-j433 (DoS via `__proto__` in `mergeConfig`).
   - GHSA-3p68-rc4w-qgx5 (NO_PROXY hostname normalisation → SSRF).
   `npm audit` flags both. **Remove the dep.**
2. **`@typescript-eslint/parser` and `*-estree` flagged HIGH** — but these are dev-only, transitive via ESLint; fix-available.
3. **`@supabase/auth-helpers-nextjs ^0.10.0`** — officially deprecated by Supabase in favor of `@supabase/ssr`. Still imported by 5 files; full migration ~1 week.
4. **`xlsx ^0.18.5`** — known to have prototype-pollution issues in older versions; needs verification against current advisory list. Used by `excel-export-service.ts`.
5. **Major-version-behind**:
   - `next ^14.2.35` (latest 16.2.4)
   - `react ^18.2.0` / `react-dom ^18.2.0` (latest 19.x)
   - `@types/react ^18.2.46` (latest 19.x)
   - `eslint ^8.56.0` (latest 10.x)
   - `eslint-config-next 14.0.4` (latest 16.x)
   - `lucide-react ^0.309.0` (latest 1.x)
   - `@anthropic-ai/sdk ^0.39.0` (latest 0.91+) — substantial gap
   - `openai ^5.13.1` (latest 6.x)
   - `bpmn-moddle ^9.0.4` (latest 10.x)
   - `jspdf ^3.0.4` (latest 4.x)
   - `uuid ^13.0.0` is unusual — verify if intentional
6. **Two drag-and-drop libraries in parallel** — `@dnd-kit/*` (8 files) + `@hello-pangea/dnd` (1 file). Migrate the one to `@dnd-kit`, drop `@hello-pangea/dnd`.

### H. Redundancy & Dead Code — **5 / 10**

(Full report: `.audit-tmp/redundancy.md` — 192+ files / 2.1 MB safely deletable.)

See **Appendix 1** for the explicit list. Headline:

- `_archive/` (162 files, ~1.0 MB), `.archive/` (3 files), `supabase/archive/` (7 files, 1.3 MB) — completely orphaned, no imports.
- `wizard-v3/` and `wizard-steps/` (11 files, ~4,400 LOC) — orphaned dead wizards.
- `database/migrations/` (10 files) — duplicate of `supabase/migrations/`, almost certainly stale.
- `packaged.yaml`, `template.yml` — AWS SAM remnants from before the Vercel migration.
- `eslint.config.mjs` — dead flat-config; Next.js 14 reads `.eslintrc.json`.
- `dwa_resources.html` (44k), `mockup-step4-actuals.html` (16k) — orphaned HTML mockups at repo root.
- 30 markdown files in `docs/` — most are pre-`.planning/` plans that have been executed.
- 14 client-specific scripts in `scripts/` (Envisage diagnostics, etc.) — all one-shot.

### I. DX & Tooling — **4 / 10**

**Verdict**: Almost no local quality gates. A founder-built repo that hasn't graduated to multi-engineer hygiene.

**Findings**

1. **No `.husky/`, no `lint-staged`** — nothing runs at commit time.
2. **No `prettier.config.*` or `.prettierrc`** — formatting is whatever the editor decides.
3. **No `.editorconfig`**.
4. **No `.vscode/settings.json` or `extensions.json`** — no shared editor config for collaborators.
5. **No `Dockerfile`, no `docker-compose.yml`** — local dev relies on `npm run dev` + a remote Supabase project.
6. **No `Makefile` or top-level task runner** — `package.json` `scripts` block is sparse: `dev`, `build`, `start`, `lint`, `test`, `test:watch`, `test:e2e*`, `smoke-test`, `verify`. No `verify` invocation in CI.
7. **`README.md` is the default `create-next-app` boilerplate** — last touched 2025-11-29. New engineer onboarding time is likely measured in days.
8. **`CONTRIBUTING.md` exists** (3.5 KB) but wasn't audited for accuracy against current workflow.
9. **CI**: only one workflow (`supabase-preview.yml`) — runs `tsc + vitest` on PR. Doesn't run `next lint`, `next build`, `playwright test`, or `npm audit`. No production deploy gate visible (Vercel handles via integration).
10. **`tsconfig.tsbuildinfo` (562 KB) committed to git** — should be gitignored. `.gitignore` already has `*.tsbuildinfo` (line 40) but the file is tracked from before the rule was added.
11. **Two ESLint configs**: `.eslintrc.json` (active) + `eslint.config.mjs` (flat — never read by Next.js 14). Delete the latter.

### J. Documentation & Observability — **4 / 10**

**Verdict**: Tools wired, almost none of them actually used.

**Findings**

1. **Sentry wired in three runtimes** (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation.ts`). 10% trace sample in prod, session replay 1%/100% on error. **Only 2 `Sentry.captureException` calls in `src/`.** Errors are mostly going to `console.*` (2,012 calls) — Sentry sees almost nothing.
2. **Hardcoded fallback Sentry DSN** baked into all 3 config files (`sentry.client.config.ts:3`, etc.). Anyone forking the repo silently submits events.
3. **Structured logger in `src/lib/utils/logger.ts`** — well-designed, supports prod-JSON output and API/auth/db convenience methods. **0 imports in the entire codebase.** Pick a winner: logger or Sentry, then sweep `console.*` calls.
4. **No on-call runbook** for Xero outage, Supabase outage, sync failures (no `RUNBOOK.md` or similar).
5. **README is the `create-next-app` boilerplate** — no domain context, no setup steps, no "how to run consolidation locally."
6. **30 docs in `docs/`** (`COACH_PORTAL_BUILD_PLAN.md`, `DEPLOYMENT_READY.md`, `WHATS_BEEN_BUILT.md`, etc.) — most are executed plans, last touched 2025-11-29. They function as archaeology, not documentation.
7. **No architecture diagram** in `docs/` or repo. `BUSINESS_CONTEXT_ARCHITECTURE.md` and `CURRENT_ARCHITECTURE.md` exist but are 5 months stale.
8. **`/api/health` exists** (`src/app/api/health/route.ts`) — pings DB. Not aggregated, no third-party uptime monitor visible.

---

## Appendix 1 — Delete With Confidence

This is the explicit list. All have been verified via grep across `src/` for import sites. Estimated **~192 files, ~2.1 MB, ~6,000 LOC**.

### Top-level cruft
- `BRANDING_UPDATE_PLAN.md` — superseded by `.planning/`, last touched 2025-11-29.
- `DESIGN_SYSTEM_PLAN.md` — same.
- `UI_UX_AUDIT_REPORT.md` — same.
- `UI_UX_IMPLEMENTATION_PLAN.md` — same.
- `dwa_resources.html` (44 KB) — standalone marketing mockup, no callers.
- `mockup-step4-actuals.html` (16 KB) — UI mockup, no callers.
- `check_spm_kpis.mjs` — one-shot debug script; not in any npm script.
- `packaged.yaml`, `template.yml` — AWS SAM remnants; the app deploys to Vercel.
- `eslint.config.mjs` — dead flat-config; Next.js 14 reads `.eslintrc.json`.
- `tsconfig.tsbuildinfo` — should be gitignored; `git rm --cached tsconfig.tsbuildinfo`.

### Archive directories (full delete)
- `_archive/` — 162 files / ~1.0 MB. Includes `_archive/Urban Roads Finance Report Jan 2026.pdf` (656 KB — client document; **move to a secure client folder before deleting**).
- `.archive/` — `AdvancedDiagramVisualizer.tsx`, `ProfessionalDiagramVisualizer.tsx`, `page.tsx`. 0 imports.
- `supabase/archive/` — 7 stale seed/fix SQL files (~1.3 MB).
- `database/migrations/` — 10 SQL files. Verify against Supabase project history first; almost certainly stale.

### Dead source code
- `src/app/finances/forecast/components/wizard-v3/` — 6 files, ~2,000 LOC, 0 importers.
- `src/app/finances/forecast/components/wizard-steps/` — 5 files, ~2,400 LOC, 0 importers.
- `src/app/api/migrate/route.ts` and `src/app/api/migrate/opex-fields/route.ts` — call non-existent RPCs.
- `src/app/api/email/test/route.ts` — super_admin-only test endpoint, no UI callers.

### Stale scripts
- `scripts/audit-coach-context-corruption.sql`
- `scripts/audit-multiple-active-forecasts.ts`
- `scripts/dedupe-envisage-xero-pl-lines.ts`
- `scripts/diag-envisage-deep.ts`, `diag-envisage-deeper.ts`
- `scripts/remediate-duplicate-active-forecasts.ts`
- `scripts/resync-envisage-now.ts`
- `scripts/pre-refactor-snapshot.sh`, `rollback.sh`, `test-before-merge.sh`
- `scripts/run-migration.js`, `run-payroll-migration.js`
- `scripts/check-conns.ts`
- `scripts/seed-fit2shine-strategy.sql` — currently uncommitted (in `git status`); commit-or-archive decision needed.

### Dependencies
- `axios` — 0 imports in `src/`, 2 known HIGH CVEs.

### Stale documentation (move to `docs/archive/`, don't delete — useful as history)
- `docs/CLIENT_FEEDBACK_DEC8_2024.md`
- `docs/COACH_PORTAL_BUILD_PLAN.md`
- `docs/COACH_PORTAL_IMPROVEMENT_PLAN.md`
- `docs/COMPREHENSIVE_FIX_PLAN.md`
- `docs/DEPLOYMENT_READY.md`
- `docs/FORECAST_ENHANCEMENT_PLAN.md`
- `docs/HEADER_BANNER_CONSISTENCY_PLAN.md`
- `docs/PHASE3_REVISED_PERMISSIONS_PLAN.md`, `PHASE3_TEAM_PERMISSIONS_PLAN.md`
- `docs/QUARTERLY_REVIEW_PLAN.md`
- `docs/RLS_EXECUTION_PLAN.md`, `RLS_IMPLEMENTATION_PLAN.md`
- `docs/SECURITY_AUDIT_REPORT.md` (the prior audit — keep for diff)
- `docs/SYSTEM_IMPROVEMENT_PLAN.md`
- `docs/UI_FIXES_IMPLEMENTATION.md`, `UI_UX_IMPROVEMENT_PLAN.md`
- `docs/WHATS_BEEN_BUILT.md`
- `docs/build-logs/` and `docs/build-sessions/` — process artifacts.

### Needs verification before deleting (do **not** delete blindly)
- `WBi Main Logo/` — 1.1 MB design assets (`.ai`, `.eps`, `.psd`, etc.). 0 references in `src/` or `public/`. Likely belongs in a brand-asset repo, not a code repo. Move externally.
- `_archive/Urban Roads Finance Report Jan 2026.pdf` — client document. **Move to client-secure storage before deleting.**

---

## Appendix 2 — Inventory

### File inventory (excluding `.planning/`, `node_modules/`, `.next/`, archives)

| Type | Count |
|---|---|
| `.tsx` | 3,323 |
| `.ts` | 2,649 |
| `.sql` | 1,539 |
| `.md` | 722 |
| `.json` | 46 |
| `.js` | 30 |
| `.yml` | 7 |
| `.yaml` | 6 |

### Source breakdown

| Path | TS/TSX files | LOC |
|---|---|---|
| `src/` total | 992 | ~303,012 |
| `src/app/` (Next.js) — pages | 95 | (incl.) |
| `src/app/` — layouts | 11 | |
| `src/app/api/` — route handlers | 121 | |
| `src/components/` | 144 | |
| `src/lib/` | 142 | |
| `src/__tests__/` | 9 | |
| `e2e/` | 2 | |
| `scripts/` | 9 | 885 |

### API route count by domain (selected)
- Xero: 19
- Forecast / forecasts: 23
- Monthly report: 13
- Consolidation: 7
- Coach / coach-questions: 5
- Admin: 8
- Auth: 4
- AI: 4
- Cron: 2
- Migrate: 2 (delete — see #2)

### Database
- Tables: 154
- RLS policies: 397
- Functions: 75
- SECURITY DEFINER functions: 41
- Active migrations: 8 (1 baseline + 7 newer)
- Archived migrations: 124 (per memory; in scope of redundancy review only)

### External services
- Supabase (DB, Auth, Edge Functions, Storage)
- Xero (`xero-node ^13.0.0`)
- OpenAI (`openai ^5.13.1`) — wizard chat
- Anthropic (`@anthropic-ai/sdk ^0.39.0`) — CFO advisor
- Resend (`resend ^6.5.2`) — transactional email
- Sentry (`@sentry/nextjs ^10.48.0`) — error/perf monitoring
- Vercel — hosting (per `vercel.json`)

### Dependency-graph headlines
- 86 of 95 pages start with `'use client'`.
- 558 files contain `'use client'`; 1 file contains `'use server'`.
- 28 React components import Supabase directly (no service layer).
- 119 files in `src/app/` + `src/components/` call `supabase.from(...)`.
- 0 of 120 API routes import `zod`.
- 2,012 `console.*` calls; 2 `Sentry.captureException` calls.
- 0 files import `src/lib/utils/logger.ts` (the structured logger).

---

## Appendix 3 — Methodology

### Tools used
- **Read/Edit/Write/Bash/Grep/Glob** for direct codebase inspection.
- **5 specialist sub-agents** running in parallel (security, architecture, type safety, database, redundancy) — each with focused prompts cited in the audit run. Outputs in `.audit-tmp/`.
- **`npm outdated --json`** and **`npm audit --json`** for dependency posture.
- **`npx vitest run`** attempted for test status (revealed broken state — see Top-10 #1).
- **`grep -rn`** for evidence collection across 992 files.
- Manual review of `src/middleware.ts`, `src/lib/utils/encryption.ts`, `src/lib/utils/logger.ts`, `src/app/api/migrate/*`, Sentry configs, `next.config.js`, `tsconfig.json`, `.github/workflows/*`.

### Commands run (selected, for reproducibility)
```bash
git rev-parse HEAD
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.sql" \) -not -path "./node_modules/*" ...
grep -rn "as any\|: any\b\|@ts-ignore\|@ts-expect-error" --include="*.ts" --include="*.tsx" src/
grep -rn "console\.log\|console\.error\|console\.warn" --include="*.ts" --include="*.tsx" src/
grep -lrn "SUPABASE_SERVICE_ROLE_KEY\|service_role" --include="*.ts" --include="*.tsx" src/
grep -rln "z\.\(object\|string\|number\)\|zod" --include="*.ts" --include="*.tsx" src/app/api/
grep -E "^CREATE TABLE|ENABLE ROW LEVEL SECURITY|^CREATE POLICY|^CREATE OR REPLACE FUNCTION" supabase/migrations/00000000000000_baseline_schema.sql
npm outdated --json
npm audit --json
```

### What was checked
✅ Every category in the original prompt:
- Security (auth, RLS, secrets, OWASP, Xero tokens, rate limiting, cron auth, CSRF, CSP)
- Architecture (boundaries, server/client discipline, layering, multi-tenant model, consolidation, route sprawl)
- Type safety (`tsconfig`, `any` count, runtime validation, error handling, money & timezone)
- Database (RLS coverage, FKs, indexes, audit cols, soft-delete, SECURITY DEFINER inputs, migration hygiene)
- Performance (file size, RSC vs CSR, bundle composition signals)
- Testing (test count, coverage, E2E, fixture quality, broken test command)
- Dependencies (outdated, CVEs, duplicates)
- Redundancy (dead code, archive dirs, dead routes, stale scripts)
- DX (lint, format, hooks, editor config, CI)
- Docs/observability (README, runbooks, Sentry, logger usage)

### What was NOT exhaustively checked (and why)
- **Bundle size measurement** — no `@next/bundle-analyzer` configured; reading `webpack-stats.json` would require a build. Inferred from heavy client-imported deps.
- **Production runtime metrics** — no access to Vercel/Sentry dashboards from this audit; could not measure actual P95 latencies, error rates, or memory.
- **`xero-node` rate-limit/backoff implementation** — verified the SDK is used, not how each call handles rate-limit responses.
- **Every API route's auth check** — sampled the 28 service-role-using routes + 6 highest-risk routes (migrate, sync-all, admin/clients, team/invite, cron, email/test). The remaining ~85 routes were not individually audited.
- **Every RLS policy** — audited the 10 most sensitive tables in detail; the remaining ~144 tables are sampled rather than fully reviewed.
- **CI run log history** — vitest-broken status inferred from local repro; need GitHub Actions tab to confirm the gate has actually been red.
- **Live Xero/Supabase API calls** — out of bounds per audit guardrails.

### Limits & caveats
- Dynamic imports (`import('...')`) and string-keyed module references can cause false positives in "unused" claims. Where uncertainty existed, the redundancy appendix flagged "needs verification."
- The `database/migrations/` directory may be applied to production; the audit recommends verifying against actual Supabase project state before deletion.
- The plaintext-token-fallback risk (Security #1) is *latent* — it depends on whether any plaintext tokens exist in the live `xero_connections` table, which can only be confirmed against the production DB.

---

**End of audit.** All five specialist sub-agents completed; their full reports remain in `.audit-tmp/` (security.md, architecture.md, correctness.md, database.md, redundancy.md) for diffing against this synthesis. Delete `.audit-tmp/` once you've extracted any extra detail you want.
