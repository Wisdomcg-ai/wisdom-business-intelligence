# WisdomBI — Requirements

## Milestone v1.1: Codebase Hardening (Active)

**Source:** `CODEBASE-AUDIT.md` at repo root (production readiness 55/100, written 2026-04-28)
**Goal:** Take the codebase from 55/100 to ~75/100 (Series-A defensible) over 6 phases (Phase 44–49), with zero client disruption.

**Guiding constraint:** Every requirement either (a) makes no observable change to clients, or (b) ships behind a feature flag, observe-mode, or shadow-compute pattern. **Phases ordered by blast radius — smallest first.**

### Test Gate & CI Hardening (TEST)
*Goal: every PR is automatically blocked on quality. Precondition for everything else.*

- [x] **TEST-01**: `npm test` runs successfully on a clean checkout (currently fails: `Cannot find module '@vitejs/plugin-react'`).
- [ ] **TEST-02**: CI workflow blocks merges on `next lint` passing (today: ESLint suppressed via `next.config.js:4-6`).
- [ ] **TEST-03**: CI workflow blocks merges on `tsc --noEmit` passing (already runs; confirm staying green).
- [x] **TEST-04**: CI workflow blocks merges on `vitest run` passing (already configured but currently broken — see TEST-01).
- [ ] **TEST-05**: CI workflow blocks merges on `next build` succeeding.
- [x] **TEST-06**: Nightly Playwright job runs `e2e/smoke.spec.ts` against a Vercel preview URL.

### Invisible Cleanup (CLEAN)
*Goal: delete what no one references. ~192 files / 2.1 MB / ~6,000 LOC removed without behaviour change.*

- [ ] **CLEAN-01**: Delete `src/app/finances/forecast/components/wizard-v3/` and `wizard-steps/` (zero importers, ~4,400 LOC).
- [ ] **CLEAN-02**: Delete `_archive/`, `.archive/`, `supabase/archive/` directories. Move `_archive/Urban Roads Finance Report Jan 2026.pdf` to client-secure storage first.
- [ ] **CLEAN-03**: Delete root-level cruft: `dwa_resources.html`, `mockup-step4-actuals.html`, `check_spm_kpis.mjs`, `packaged.yaml`, `template.yml` (AWS SAM remnants), `eslint.config.mjs` (dead flat config), the four root-level `*_PLAN.md`/`UI_UX_*.md` files.
- [ ] **CLEAN-04**: Remove `axios` from `package.json` (0 imports in `src/`, 2 known HIGH CVEs).
- [ ] **CLEAN-05**: Untrack committed `tsconfig.tsbuildinfo` (`git rm --cached`); already in `.gitignore`.
- [ ] **CLEAN-06**: Rewrite root `README.md` to project-specific onboarding (currently default `create-next-app` boilerplate).
- [ ] **CLEAN-07**: Move stale `docs/*.md` files (executed plans from v1.0) to `docs/archive/` — preserve history, lose noise.
- [ ] **CLEAN-08**: Delete `database/migrations/` after confirming `supabase/migrations/` is canonical.
- [ ] **CLEAN-09**: Add `@next/bundle-analyzer` script to `package.json` so future bundle work is measurable.

### Server-Side Hardening (SEC)
*Goal: close internal-only security gaps with no contract change. Clients can't tell the difference.*

- [ ] **SEC-01**: Delete `/api/migrate/route.ts` and `/api/migrate/opex-fields/route.ts` — both call non-existent Supabase RPCs (`exec_sql`, `exec`); dead today, prepared attack surface if those RPCs are ever added.
- [ ] **SEC-02**: Fix `/api/Xero/sync-all/route.ts:573-580` cron-secret fail-open. Match the daily-health-report pattern — fail closed if `CRON_SECRET` is unset.
- [ ] **SEC-03**: Validate plaintext-token migration window in `xero_connections` (one-shot script that asserts every row's `access_token`/`refresh_token` contains `:`).
- [ ] **SEC-04**: Remove plaintext-fallback branch from `src/lib/utils/encryption.ts:79-83` (`decrypt()` returns `encryptedData` if it doesn't contain `:`); require `APP_SECRET_KEY` to be set explicitly in production (no `SUPABASE_SERVICE_KEY` derivation).
- [ ] **SEC-05**: Add input validation to two SECURITY DEFINER SQL functions: `create_test_user(role)` rejects unknown roles; `create_quarterly_swot(quarter)` rejects out-of-range quarters.
- [ ] **SEC-06**: Decide and document the onboarding gate at `src/middleware.ts:173-201` — either re-enable behind `process.env.ONBOARDING_ENFORCED === 'true'`, or delete the dead branch entirely.
- [ ] **SEC-07**: Adopt structured logging — pick `Sentry.captureException` as the production error sink; sweep `console.error` calls in `/api/` routes (start with the 28 service-role-using routes); leave `console.log` only behind `NODE_ENV !== 'production'` guards. Delete the unused `src/lib/utils/logger.ts` if not adopted.
- [ ] **SEC-08**: Remove the hardcoded fallback Sentry DSN from `sentry.client.config.ts:3`, `sentry.server.config.ts:3`, `sentry.edge.config.ts:3` — fail loudly if `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN` is missing in production.

### Input Validation Rollout (VALID)
*Goal: every API boundary validates its input. Use observe→enforce pattern — log violations 1-2 weeks per route before rejecting.*

- [ ] **VALID-01**: Build `src/lib/api/with-schema.ts` middleware. `withSchema(schema, handler)` wrapper that, on parse failure, logs to Sentry as `zod:would-reject` and (in observe mode) continues with raw body, or (in enforce mode, gated by `ZOD_ENFORCE_ROUTES` env list) returns 400 with `error.flatten()`.
- [ ] **VALID-02**: Add Zod schemas (in observe mode) to the 5 highest-risk read-only routes: `/api/coach/stats`, `/api/notifications`, `/api/health`, `/api/admin/check-auth`, `/api/cfo/summaries`.
- [ ] **VALID-03**: Add Zod schemas (in observe mode) to the 8 highest-risk admin write routes: `/api/admin/clients` (POST/PATCH/DELETE), `/api/admin/coaches`, `/api/admin/reset-password`, `/api/admin/clients/resend-invitation`, `/api/team/invite`, `/api/team/remove-member`, `/api/clients/send-invitation`, `/api/coach/clients/[id]`.
- [ ] **VALID-04**: Add Zod schemas (in observe mode) to forecast/consolidation/Xero write routes (~25 routes including `/api/forecasts/*`, `/api/forecast/*`, `/api/Xero/sync*`, `/api/consolidation/*`, `/api/cfo/report-status`).
- [ ] **VALID-05**: Sweep the remaining ~80 API routes — any route with a request body gets a Zod schema (in observe mode).
- [ ] **VALID-06**: After 1-2 weeks of zero `zod:would-reject` events per route, flip routes to enforce mode by adding their paths to `ZOD_ENFORCE_ROUTES`. Read-only routes flip first; admin write routes second; forecast/consolidation last.

### Decimal Money Arithmetic (MONEY)
*Goal: replace JavaScript `number` summation in financial paths with `decimal.js`. Use shadow-compute + reconciliation log + per-tenant flag rollout. **The most delicate phase — must not change client-visible numbers without notice.***

- [ ] **MONEY-01**: Add `decimal.js` to dependencies. No refactor yet.
- [ ] **MONEY-02**: Build a parallel `consolidatePrecise()` function alongside `src/lib/consolidation/engine.ts:consolidate()` — same inputs, same output shape, internal arithmetic via `Decimal`.
- [ ] **MONEY-03**: Create `consolidation_precision_log` table (additive migration). Schema: `id, business_id, period, cell_key, legacy_value numeric, precise_value numeric, delta numeric, computed_at`.
- [ ] **MONEY-04**: Wire `/api/monthly-report/consolidated` to call both `consolidate()` (used) and `consolidatePrecise()` (logged). Insert per-cell deltas where `|delta| > 0.001`.
- [ ] **MONEY-05**: Build a one-page admin dashboard at `/admin/precision-log` showing delta volume per tenant per period.
- [ ] **MONEY-06**: After 2-4 weeks of shadow-compute across all 3 production tenants, review the precision log with a finance hat. Resolve any deltas > $1.
- [ ] **MONEY-07**: Per-tenant flag rollout — `consolidation_precise_mode_enabled` boolean on `businesses` table. Enable for Fit2Shine first (coaching, lowest stakes), then Dragon (AUD-only), then IICT (multi-currency, highest stakes). 48-hour client communication before each flip.
- [ ] **MONEY-08**: After all 3 tenants on precise mode for 2 months and stable, delete legacy `consolidate()` and unwind `consolidation_precision_log` insertion.

### Database Integrity Hygiene (DB)
*Goal: additive-only DB improvements. ON DELETE clauses on the 56 orphan-prone FKs and audit columns. No destructive schema changes.*

- [ ] **DB-01**: Add nullable `deleted_at`, `deleted_by` columns to the 8 most-mutated financial tables: `financial_forecasts`, `forecast_employees`, `forecast_pl_lines`, `monthly_actuals`, `xero_pl_lines`, `cfo_report_status`, `cfo_email_log`, `account_mappings`. Single additive migration.
- [ ] **DB-02**: Add nullable `created_by`, `updated_by` columns to the same 8 tables. Backfill `created_by` from `forecast_audit_log` where possible. Single additive migration.
- [ ] **DB-03**: Audit each of the 56 orphan-prone FKs (per audit Section D #1). Decide CASCADE vs SET NULL per FK; document the choice in `docs/db/fk-policy.md`.
- [ ] **DB-04**: Apply `ON DELETE` clauses one-or-two per migration, tested against a seeded preview branch by deleting a test user and confirming downstream rows behave correctly. Target: all 56 FKs covered by phase end.
- [ ] **DB-05**: Rename the two date-only migration files (`20260424_cfo_email_log.sql`, `20260427_unique_active_forecast_per_fy.sql`) to full `YYYYMMDDHHMMSS` form for ordering consistency.
- [ ] **DB-06**: Tighten the 3 over-permissive RLS policies (`swot_templates`, `kpi_benchmarks`, `kpi_definitions` use `USING (true)`) — confirm intent (system reference data vs per-business). Add comments to the migration; only narrow if intent is per-business.

---

## Future Requirements (Deferred Beyond v1.1)

These were identified in the audit but deferred to a later milestone — too disruptive for a hardening sprint, or only worth doing once Phases 44-49 land.

- **Distributed rate limiting** (Redis or Supabase-backed) — replace the in-memory `Map` in `src/lib/utils/rate-limiter.ts`. Defer to v1.2.
- **CSRF middleware enforcement** — middleware sets the cookie but routes don't validate. Defer until VALID-* lands so Zod can validate the CSRF header alongside the body.
- **`@supabase/auth-helpers-nextjs` → `@supabase/ssr` migration** for the 5 remaining callsites. Defer to v1.2.
- **RSC migration** for the 86 client-rendered pages — only when next touching the page anyway.
- **God-file extraction** for the 6 files >2,000 LOC — only when next touching the feature.
- **Major dependency upgrades** (Next 14→16, React 18→19, Anthropic SDK 0.39→0.91) — separate milestone with dedicated test budget.
- **Persistent audit log table for super_admin actions** — currently `console.log` only. Defer to v1.2.

## Out of Scope (Explicit Exclusions)

- **Architectural rewrites.** No moving from App Router to Pages Router, no changing the multi-tenant model, no replacing Supabase. The audit found these foundations sound.
- **New features.** This is a hardening milestone — zero new user-facing capabilities.
- **Touching the consolidation domain logic itself.** The engine in `src/lib/consolidation/` is the strongest part of the codebase; v1.1 only swaps its arithmetic layer (MONEY-*) without altering FX, eliminations, or balance-sheet rules.
- **Removing Sentry.** It's wired correctly; just underused. SEC-07 makes it actually used.
- **Migrating away from Vercel or Supabase.** Both are working as designed.

## Traceability (filled by roadmapper)

| Requirement | Phase | Notes |
|---|---|---|
| TEST-01 | Phase 44 | Test Gate & CI Hardening |
| TEST-02 | Phase 44 | Test Gate & CI Hardening |
| TEST-03 | Phase 44 | Test Gate & CI Hardening |
| TEST-04 | Phase 44 | Test Gate & CI Hardening |
| TEST-05 | Phase 44 | Test Gate & CI Hardening |
| TEST-06 | Phase 44 | Test Gate & CI Hardening |
| CLEAN-01 | Phase 45 | Invisible Cleanup |
| CLEAN-02 | Phase 45 | Invisible Cleanup |
| CLEAN-03 | Phase 45 | Invisible Cleanup |
| CLEAN-04 | Phase 45 | Invisible Cleanup |
| CLEAN-05 | Phase 45 | Invisible Cleanup |
| CLEAN-06 | Phase 45 | Invisible Cleanup |
| CLEAN-07 | Phase 45 | Invisible Cleanup |
| CLEAN-08 | Phase 45 | Invisible Cleanup |
| CLEAN-09 | Phase 45 | Invisible Cleanup |
| SEC-01 | Phase 46 | Server-Side Hardening |
| SEC-02 | Phase 46 | Server-Side Hardening |
| SEC-03 | Phase 46 | Server-Side Hardening |
| SEC-04 | Phase 46 | Server-Side Hardening |
| SEC-05 | Phase 46 | Server-Side Hardening |
| SEC-06 | Phase 46 | Server-Side Hardening |
| SEC-07 | Phase 46 | Server-Side Hardening |
| SEC-08 | Phase 46 | Server-Side Hardening |
| VALID-01 | Phase 47 | Input Validation Rollout |
| VALID-02 | Phase 47 | Input Validation Rollout |
| VALID-03 | Phase 47 | Input Validation Rollout |
| VALID-04 | Phase 47 | Input Validation Rollout |
| VALID-05 | Phase 47 | Input Validation Rollout |
| VALID-06 | Phase 47 | Input Validation Rollout |
| MONEY-01 | Phase 48 | Decimal Money Arithmetic |
| MONEY-02 | Phase 48 | Decimal Money Arithmetic |
| MONEY-03 | Phase 48 | Decimal Money Arithmetic |
| MONEY-04 | Phase 48 | Decimal Money Arithmetic |
| MONEY-05 | Phase 48 | Decimal Money Arithmetic |
| MONEY-06 | Phase 48 | Decimal Money Arithmetic |
| MONEY-07 | Phase 48 | Decimal Money Arithmetic |
| MONEY-08 | Phase 48 | Decimal Money Arithmetic |
| DB-01 | Phase 49 | Database Integrity Hygiene |
| DB-02 | Phase 49 | Database Integrity Hygiene |
| DB-03 | Phase 49 | Database Integrity Hygiene |
| DB-04 | Phase 49 | Database Integrity Hygiene |
| DB-05 | Phase 49 | Database Integrity Hygiene |
| DB-06 | Phase 49 | Database Integrity Hygiene |

---

## Validated (Milestone v1.0 — shipped)

The v1.0 milestone (Phases 1–43) shipped 17 phases of foundational work including OpEx double-counting fix, coach shell stability, Xero connection reliability, forecast wizard v4 (Steps 1-8), Phase 14 extended-period detection, Phase 19 monthly reporting, Phases 23-32 (Calxa replacement / monthly report pack), Phase 33 (CFO multi-client dashboard), Phase 34 (Dragon multi-entity consolidation), Phase 35 (report approval delivery workflow), Phases 37-40 (resolveBusinessId rollout + branded types + Playwright E2E), Phase 41 (phantom business orphan rows), Phase 42 (monthly report save flow), Phase 43 (plan period as explicit state).

See `.planning/ROADMAP.md` for the full v1.0 phase history.
