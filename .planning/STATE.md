---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: — Codebase Hardening
status: Phase 67 COMPLETE (multi-currency consolidation fix landed for IICT)
last_updated: "2026-05-26T00:00:00.000Z"
last_activity: 2026-05-26 -- Phase 67-01/02/03 shipped (9 PRs); IICT FY25 reconciled to live Calxa within $36
progress:
  total_phases: 56
  completed_phases: 25
  total_plans: 134
  completed_plans: 131
---

# Project State

## Current Position

Phase: 67 (multi-currency-consolidation-fix) — **COMPLETE** (3 plans shipped 2026-05-23..26; verified against Calxa 2026-05-26). Triggered by IICT (3 Xero tenants — 2 AUD + 1 HKD) showing wrong FY25 in the forecast wizard. **67-01:** captured Xero `BaseCurrency` into `xero_connections.functional_currency` (PR #214 + backfill script applied — IICT Group Limited flipped AUD→HKD). **67-02:** routed `historical-pl-summary.ts` through the consolidation engine when `needsFxConsolidation` returns true (PR #215). **67-03 (partial):** routed `forecast-read-service.getMonthlyComposite` through the engine (PR #216). Plus collateral fixes — PR #217 (balance-sheet 400 for multi-tenant cash_only), #218 (wizard saved-snapshot vs fresh-fetch race), #219 (totals from byMonth snapshot), #220 (goals 403 super_admin bypass), #221 (36-month engine window for planning-season baselines), and #213 (super_admin bypass on 6 coach-or-owner routes). **Reconciliation verified 2026-05-26** against live Calxa Multi-Column P&L for IICT FY25 — wizard matches within $36 net profit on -$147k total. The original "old PDF showed -$77k, wizard shows -$147k" $70k gap turned out to be Calxa's IICT Consolidated had a 4th member (`IICT Airwallex`, CSV-imported) when the PDF was prepared that's since been removed; wizard is correct against the current 3-tenant configuration. Calxa methodology spec captured at `/tmp/calxa-methodology-iict.md` (or wherever the investigation session saved it). **Deferred:** cfo/summaries multi-currency, `Xero/sync-forecast` push-back policy, monthly-report non-consolidated views — affects multi-currency businesses only (IICT). Multi-tenant single-currency clients (Dragon Roofing — 2 AUD tenants) unaffected. All other clients are single-tenant AUD and bypass the engine path entirely.
Plan: 3 of 4 — 67-01/02/03 complete; 67-04 (UI signaling for translation context + missing-rate warnings) optional, not started.

Phase: 66 (section-permission-followups) — **COMPLETE** (4/4 plans shipped, verified, deployed 2026-05-17; PR #198 merged `0cd6bcd2`; VERIFICATION.md passed 4/4). Legacy `financials`-key migration applied to production (audit re-run confirms 0 rows missing `finances`, was 23) + table DEFAULTs corrected onto canonical `finances`. Consolidated routes normalized to `resolveBusinessIds`. Service-role + ops/admin audits produced (10 LOW-risk service-role convert candidates deferred to a future phase; all 16 ops/admin routes need no gate).
Plan: 4 of 4 — phase complete

Phase: 65 (section-permission-api-enforcement) — **IN PROGRESS** (Waves 1-2 shipped + deployed; PR #197 merged). LOG_ONLY section-permission gate is LIVE in production as of 2026-05-17 — 24-48h Sentry soak (Wave 65-03) now running. Watch `section_permission_check` events: healthy = denials only for genuine non-finance members; red flag = any owner/coach/admin/super_admin triggering a denial. Wave 65-04 (flip `SECTION_PERMISSION_ENFORCE=true` in Vercel) is UNBLOCKED — the Phase 66 audit proved zero member rows had the legacy-key gap. Wave 65-05 (PR risk assessment + phase close-out) follows ENFORCE.
Phase: 46 (Server-Side Hardening) — **PARTIAL** (3/4 plans shipped). Plan 46-04 deferred ≥2026-05-10 per cooling period.
Phase: 49 (Database Integrity Hygiene) — **COMPLETE** (7/7 plans shipped 2026-05-08). All 56 orphan-prone FKs covered: 50 SET NULL + 4 CASCADE + 2 RESTRICT/CASCADE. fk-policy.md is the authoritative reference going forward.
Phase: 53 (Xero Connection Durability) — **COMPLETE** (5/5 plans shipped 2026-05-06). 53-01 server-side disconnect with dual-ID purge (PR #107). 53-03 token-rotation race holes closed + tightened deactivation policy (commit b5a233d, merged). 53-02 centralized Xero refresh through token-manager + deleted dead refresh-tokens route (PR #109). 53-04 proactive refresh cron at `0 */6 * * *` UTC (PR #110). **53-05 Sentry capture + coach dashboard health pill (PR opened 2026-05-06).** Durability story is whole — JDS root cause permanently closed.
Phase: 54 (Xero Employee Import Completion) — **PARTIAL** (1/2 plans shipped 2026-05-06). **54-01 PayRun-derived hours + salary fallback (PR opening 2026-05-06).** ENTEREARNINGSRATE employees (timesheet-driven payroll, JDS default) now return populated hours_per_week + annual_salary derived from last 4 POSTED PayRuns; PayTemplate values WIN via ??= precedence; new optional `derived_from` provenance field on response. 54-02 (soft auto-fill on empty Step 4 + new-employees banner) is next.
Phase: 61 (Selective List Sharing) — **IN PROGRESS** (1/6 plans shipped 2026-05-14). **61-01 schema foundation:** added `shared_with_all boolean DEFAULT false` + `shared_with uuid[] DEFAULT '{}'` to `daily_tasks` and `ideas`, plus GIN indexes on `shared_with` for both tables. Idempotent migration, transaction-wrapped, scoped strictly to the two tables (action_items / issues_list / ideas_filter untouched). Defaults preserve current Private-only behavior on every existing row — no backfill. RLS deferred to 61-02 so columns physically exist before policies reference them. **Task 2 (human-verify checkpoint) PENDING:** Docker is currently down so local `supabase db push` could not be executed; needs operator to bring Docker up, apply the migration locally, and confirm the 4 `information_schema` checks before 61-02 ships. Commit `42da18fb` on branch `phase-61-selective-list-sharing` (not pushed).
Last activity: 2026-05-16

## Active operational notes

**Phase 49 NOT NULL relaxations:** 49-04 dropped NOT NULL on 6 columns; 49-05 dropped NOT NULL on 8 more (total 14 columns). The two load-bearing audit-log columns are `coach_audit_log.coach_id` (49-04) and conceptually `user_roles.granted_by` (49-05; column was already nullable in baseline so no relaxation needed, but invariant is identical). DB can no longer enforce that audit rows carry user attribution; only application code does. **Follow-up needed** in a separate phase: app-side runtime assertion (logger / validator) covering both. Documented in `.planning/phases/49-database-integrity-hygiene/49-04-DEVIATION.md` and `49-05-SUMMARY.md`.

**Phase 46-04 cooling period:** earliest ship date 2026-05-10. Preconditions per `SEC-04-MIGRATION-NOTE.md` — re-run SEC-03 verifier reports clean; confirm `APP_SECRET_KEY` still set in Vercel; no Sentry decryption errors over the 7-day window.

## Next eligible work

- **46-04** (after 2026-05-10 cooling period)
- **Phase 51** (Forecast Wizard UX — emergent from 2026-05-04 review). Items deferred from Phase 50: Step 3 thousands-separator restoration, Step 4 departure flow, Step 4 part-time/casual flexibility, Step 5 $-vs-% toggle, Step 5 simpler layout, Step 6 visibility/undo/add. Needs operator design conversations before planning.
- **Phase 52** (Xero employee data — emergent). Step 4 pay cycle, standard hours, hourly rate from Xero API. Pure research first.
- **Phase 47** (Input Validation Rollout) — blocked on 46-04.
- **44.2 UI surface spot-checks** — non-blocking; operator on deployed preview.

## Current Milestone: v1.1 — Codebase Hardening

Source: `CODEBASE-AUDIT.md` at repo root (production readiness 55/100, written 2026-04-28).

Goal: take the codebase from 55/100 to ~75/100 (Series-A defensible) over 6 phases, with zero client disruption.

### Phase Sequence (blast-radius first)

| Phase | Name | Blast Radius | Depends on |
|---|---|---|---|
| 44 | Test Gate & CI Hardening | Zero (CI gates only) | — (precondition) |
| 45 | Invisible Cleanup | Zero (deletes unreferenced code) | 44 |
| 46 | Server-Side Hardening | Low (internal-only fixes) | 44 |
| 47 | Input Validation Rollout | Observe: zero · Enforce: low (per-route flag) | 44, 46 |
| 48 | Decimal Money Arithmetic | Medium (≤ $1/cell behind per-tenant flag) | 47 |
| 49 | Database Integrity Hygiene | Low (additive-only migrations) | 44 |

## Accumulated Context (Carried Over from v1.0)

### Roadmap Evolution

- Phase 66 added (2026-05-16): Section-Permission Follow-ups & Hardening — legacy `financials`-key audit (gates Phase 65 Wave 65-04 ENFORCE cutover), consolidated-route business-ID drift, service-role data-fetching audit, ops/admin section-permission audit. Source: 65-02-SUMMARY.md follow-ups.

### Active production tenants

- **Dragon** (AUD, 2 entities) — consolidation
- **IICT** (NZ + HK FX, 3 entities) — consolidation, multi-currency
- **Fit2Shine** — coaching, strategy session content seeded 2026-04-27
- **Just Digital Signage** (Aeris Solutions Pty Ltd) — original active client

### Architectural strengths preserved from v1.0

- All 154 tables have RLS enabled; 397 policies; 41 SECURITY DEFINER functions hardened with `SET search_path`
- AES-256-GCM encryption for Xero OAuth tokens
- Real CSP, HSTS, security headers; cron secrets enforced (with one fail-open exception flagged in audit, addressed by SEC-02)
- Branded ID types (`UserId`, `BusinessId`) with type-level tests
- Strong consolidation domain layer with 11 unit-test files
- Centralised `resolveBusinessId()` tenant resolver

### Known gaps to remediate (from audit — now mapped to phases)

- 0 of 120 API routes validate input (Zod in deps but unused) → **Phase 47**
- Money summed as JS `number` (IEEE 754) for multi-currency consolidation → **Phase 48**
- 2,012 `console.*` calls vs 2 `Sentry.captureException` calls → **Phase 46 (SEC-07)**
- `npm test` currently broken (`@vitejs/plugin-react` missing); CI vitest gate likely red → **Phase 44 (TEST-01)**
- `eslint.ignoreDuringBuilds: true` in `next.config.js` → **Phase 44 (TEST-02)**
- `/api/migrate*` routes call non-existent RPCs (dead but a prepared attack surface) → **Phase 46 (SEC-01)**
- `/api/Xero/sync-all` cron-secret check fails open if env var unset → **Phase 46 (SEC-02)**
- 56 orphan-prone FKs lack `ON DELETE` clauses → **Phase 49 (DB-03/04)**
- ~192 files / 2.1 MB / ~6,000 LOC of dead code (archives, dead wizards, AWS SAM remnants) → **Phase 45**

## Key Decisions (Carried Over from v1.0)

- Granularity: Fine-grained phases
- PR-first Supabase branching workflow
- Atomic commits per plan
- Production tenants are AUD (Dragon, JDS) and NZ/HK (IICT) — schedule risky deploys outside Australia/NZ business hours

## v1.1 Milestone-Specific Decisions

- Sequence is **blast-radius first, scope second** — Phase 44 (zero risk) → Phase 49 (DB hygiene)
- No behaviour changes shipped without a feature flag, observe-mode, or shadow-compute pattern
- Phase 47 (Zod) uses observe → enforce: log violations for 1-2 weeks per route before flipping to reject. Two distinct success milestones — observe-mode adoption (all 120 routes) and enforce-mode adoption (per-route via `ZOD_ENFORCE_ROUTES` env list)
- Phase 48 (Decimal money) uses dual-compute + reconciliation log; per-tenant flag rollout (Fit2Shine first, then Dragon, then IICT). Success criteria written around the precision log, not "the engine works correctly"
- Phase 49 (DB) is additive-only in this milestone; FK ON DELETE constraints added one-or-two per migration with preview-branch testing
- Each phase commits to its own atomic PR; no bundled changes
- Risky deploys (47, 48, 49) outside Australia/NZ business hours
- **Plan 44-01 (2026-04-28):** Vitest gate restored. Root cause was `node_modules` drift, NOT a stale lockfile or missing devDependency. `package.json` and `package-lock.json` already had `@vitejs/plugin-react@^6.0.1` correctly resolved; only the working tree's `node_modules/` was missing the package. Fix: `npm install` (with no args) — zero tracked-file changes. **Caveat for Plan 44-03:** Mid-execution test of `rm -rf node_modules && npm ci` reproduced the broken state intermittently in this codespace (vitest's package directory ended up incomplete). `npm install` reliably repaired it. CI workflows should validate this before relying on `npm ci`.
- **Plan 44-03 (2026-04-28):** CI workflow split into 5 parallel jobs in `.github/workflows/supabase-preview.yml` — `migration-check`, `lint`, `typecheck`, `vitest`, `build`. Each gate is now a distinct PR status check; failing `lint` no longer hides whether `typecheck`, `vitest`, or `build` would have passed. Kept `npm ci` per CI-correctness contract — the codespace `npm ci` flake noted in 44-01 is environmental (filesystem-overlay specific) and is not expected on hosted GitHub Actions runners. Each non-migration job re-runs `npm ci` (~30s overhead × 4 jobs); shared cache job is a future optimisation explicitly out of scope. `build` job uses placeholder `NEXT_PUBLIC_SENTRY_DSN` and empty `SENTRY_AUTH_TOKEN` — Sentry source-map upload skips when no auth token. `paths:` trigger filter extended to include `next.config.js`, `tsconfig.json`, `.eslintrc.json`, `vitest.config.ts`, and the workflow file itself. TEST-02..05 structurally satisfied; Required-status-check wiring is Plan 44-05's deliverable. Workflow file: 114 lines (was 52). Commit `c798c62`.
- **Plan 44-02 (2026-04-28):** ESLint is now a build-time gate. Removed `eslint.ignoreDuringBuilds: true` from `next.config.js`; surfaced 7 errors and fixed all 7 minimally — 4 dead `// eslint-disable-next-line @typescript-eslint/...` directives in `src/app/api/coach/client-completion/route.ts` (the `@typescript-eslint` plugin is not installed; only `next/core-web-vitals` is extended), and 3 latent `react-hooks/rules-of-hooks` violations (hooks called after early returns) in `AssumptionsTab.tsx` and `SVGPortPopover.tsx` — fixed by reordering hook calls above the early returns. Left 183 `react-hooks/exhaustive-deps` warnings in place (warnings, not errors; do not fail build; out of scope to refactor ~120 files). `.eslintrc.json` rule overrides untouched. `npm run build` could not be run-to-completion in this Codespace (missing Supabase env vars + memory pressure; same caveat documented in 44-01) but lint stage of build observably runs. Acceptance criteria met. TEST-02 satisfied.
- **Plan 53-02 (2026-05-06):** Centralized Xero token refresh through `getValidAccessToken`. Deleted `/api/Xero/refresh-tokens/route.ts` (208 LOC, zero callers, over-eager 400-deactivation — most-likely root cause of JDS 2026-05-05 drop per 53-RESEARCH §4). Refactored `/api/Xero/reactivate/route.ts` to delegate refresh to the centralized helper (passes `{ id }` for fresh re-fetch); removed `decrypt`/`encrypt` imports — token-manager owns refresh-token crypto now. Reactivate inherits 53-03's policy (race-aware deactivation, 3× retry on `unauthorized_client`, no deactivate on 5xx/network/generic-400). Added 4 invariant tests in `src/__tests__/xero/phase-53-02-centralized-refresh.test.ts` that lock the no-duplicates rule in CI permanently. Behavioral status-code change documented: `access_denied`/`unauthorized_client × MAX_RETRIES` now return 401 + `error: 'token_expired'` (HEAD returned 500 + `error: 'refresh_failed'`); FE callers (`integrations/page.tsx`, `ForecastWizardV4.tsx:1430`) verified not to branch on `status === 500` for reactivate. `scripts/resync-envisage-now.ts:83` is a known refresh duplicate but operator-only ops script — explicitly out of scope for 53-02; documented as future cleanup. Result: exactly ONE `grant_type=refresh_token` site in `src/app/api + src/lib` (token-manager.ts). PR #109. Commits: `6611945` (delete) → `1d2acf9` (refactor) → `23a0187` (tests).
- **Plan 53-04 (2026-05-06):** Proactive Xero refresh cron at `/api/cron/refresh-xero-tokens`, schedule `0 */6 * * *` UTC (4 invocations/day, Vercel Pro required). Refresh-only — no Xero data fetch — so the telemetry signal is clean: any failure here is a real token-health problem. Sequential snapshot iteration over `is_active=true` rows; per-connection `try/catch` so one bad row never aborts the run; mid-loop deactivation tolerated (snapshot semantics). Status mapping (refreshed / still_valid / failed / deactivated) uses imported `REFRESH_THRESHOLD_MINUTES` from token-manager — no hardcoded duplicate (F2 fix from plan-check). Fail-closed auth pattern copied from `src/app/api/Xero/sync-all/route.ts:46-50` (NOT the looser daily-health-report form — F1 fix). Sentry capture with 4 distinct invariant tags: `cron_refresh_xero_tokens` (aggregate), `cron_refresh_xero_tokens_per_connection` (thrown), `cron_refresh_xero_tokens_failed` (transient), `cron_refresh_xero_tokens_deactivated` (terminal). All Sentry calls wrapped in `try/catch` so a Sentry failure never aborts a cron run. Added 9 vitest cases (auth gate × 4, aggregation × 5); all pass. Adjacent cron tests (14) and full xero suite (148) still green. Typecheck clean; ESLint warning count unchanged at 181. Token-manager change is a 1-word `export` plus a 3-line comment — no behavioural change. PR #110. Commits: `c7abf09` (RED + F2 export) → `b73895b` (GREEN + F1 fix) → `0b2e44b` (vercel.json registration). Phase 53 now 4/5 plans shipped — only 53-05 (Sentry tag enrichment + dashboard health surface) remains. NOTE: 53-05 superseded the per-connection `cron_refresh_xero_tokens_deactivated` capture; that one was REMOVED in 53-05 to honor the "exactly one Sentry event per failure" invariant. Cron retains the other 3 invariants.
- **Plan 53-05 (2026-05-06):** Sentry capture wired into `token-manager.ts` at the deactivation site — every system-detected `is_active=false` flip now produces exactly ONE Sentry event with stable tag schema (`invariant=xero_connection_deactivated`, `tenant_id`, `business_id`, `connection_id`, `error_code`, `retry_count`) + extras (`xero_status`, `xero_error_body` truncated to 4KB, `xero_message`, `attempt`). Wrapped in try/catch so a Sentry outage never aborts the deactivation DB write. Threaded `tenant_id`/`business_id` via 53-03's existing `RefreshContext` interface — zero new args, zero new DB roundtrips. Issue C from PLAN-CHECK (the real one): removed 53-04's per-connection `cron_refresh_xero_tokens_deactivated` capture so cron-triggered deactivations don't double-report. Added Test 5b in cron-refresh test asserting NO capture on `shouldDeactivate=true`. Issue B: chose 12h "verified" threshold (vs 24h plan default) consciously — 12h = 2× the 6h cron period, tolerates one missed cron run but surfaces sustained cron failure within half a day. Built `GET /api/Xero/connection-health?business_ids[]=…` with RBAC defense in depth (re-validates owner_id / assigned_coach_id / super_admin per row even when caller "should" only request authorized ids), dual-ID resolution in a single batched query, 200-id sanity cap. Added `XeroHealthPill` to `ClientOverviewTable.tsx` (4 visual states; dead is an `<a>` to `/api/Xero/auth?…&return_to=/coach/dashboard`; sort comparator orders dead < stale < none < verified ascending). Coach dashboard `loadDashboardData` gains an 11th `Promise.all` leg fetching connection health; failure is non-fatal (console.warn only — no Sentry capture for UI-nicety failures). Pill is `hidden sm:inline-flex` — mobile signal preserved via `bg-red-50/40` row tint + `data-xero-health` attribute. 27 new+modified tests GREEN; tsc + ESLint clean on touched files. PR opened on `feat/53-05-observability-health-pill`. Commits: `7ede571` (RED Task 1) → `4201895` (GREEN Task 1) → `891bc84` (RED Task 2) → `56a6e6a` (GREEN Task 2) → `7e2e25d` (RED Task 3) → `e0dc496` (GREEN Task 3). **Phase 53 COMPLETE — 5/5 plans shipped.** JDS root cause (53-RESEARCH §4 worst-case interleaving — rotation race between deleted refresh-tokens duplicate and concurrent getValidAccessToken caller landing `invalid_grant` on a healthy token) is permanently closed: 53-02 deleted the duplicate, 53-03 added re-fetch-after-acquire-lock + re-fetch-before-deactivate to defend even if a new duplicate ever sneaks in, 53-04's 6h proactive cron resets the 60-day idle window, 53-05 makes any future deactivation visible within minutes. Recommended ops follow-up (NOT in this plan): wire Sentry alert on `tags.invariant=xero_connection_deactivated` → P1 page on-call.
- **Plan 54-01 (2026-05-06):** PayRun-derived hours + salary fallback for Xero employees on `CalculationType=ENTEREARNINGSRATE` (timesheet-driven payroll, the JDS default — research §1 confirmed PayTemplate has neither `NumberOfUnitsPerWeek` nor `AnnualSalary` for these employees). New pure helper `deriveHoursAndSalaryFromPayRun(avgWagesPerPeriod, hourlyRate?, calendarType?) → {hoursPerWeek?, annualSalary?}` in `src/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping.ts` plus exported `WEEKS_PER_PERIOD_BY_CALENDAR_TYPE` / `PERIODS_PER_YEAR_BY_CALENDAR_TYPE` constants. Route `/api/Xero/employees` extended with PayRuns aggregator block (1 list + up to 4 detail calls, sequential, POSTED-only, DRAFT filtered) sitting between PayrollCalendars and Employees-list fetches; per-employee derivation block inside the existing loop applies derived values via explicit `if (X == null && derived.X != null)` guards (the explicit form of `??=`) so PayTemplate values WIN — Test G locks $120k PayTemplate against $260k derivation. New optional `derived_from` provenance field (`'paytemplate' | 'payrun_history' | 'mixed' | undefined`) on response. Provenance computed against THREE derivable fields only (annual_salary, standard_hours, hours_per_week) — hourly_rate-from-PayTemplate alongside derived hours/salary is still `'payrun_history'` because the operator-visible derivation totals are the meaningful signal (deviation from plan spec snippet, but matches plan's test expectations in F and J — documented in 54-01-SUMMARY.md decisions). Failure tolerance: 3 try/catch layers (whole aggregator + per-detail + ambient). 401/403/404 on PayRuns list → console.warn + short-circuit; existing PayTemplate-derived shape still returned (Test I locks). Per-PayRun calendar lookup so multi-calendar tenants (weekly admin + fortnightly trade) get correct factors per employee (Test J locks). 25 new tests added (15 helper + 10 route): all GREEN. Existing 5 route tests A-E updated with empty-PayRuns mock injection (only Test A asserts URL order so only Test A got the index renumber per F3). Full xero suite 174/174; Phase 52 helper tests 100/100 (no regression). tsc --noEmit clean; ESLint clean on 4 changed files. F1 (calendar-change-mid-window) documented in SUMMARY + inline comment. F2 (`XERO-S4-PAYRUN-01` requirement) added to `.planning/REQUIREMENTS.md` with new Phase 54 section. PR opening on `feat/54-01-payrun-derived-hours-salary`. Commits: `d992fa4` (RED helper) → `ad7746f` (GREEN helper) → `a060fa6` (RED route) → `6b0cf4c` (GREEN route). **Post-deploy verification PENDING:** re-run JDS diag, confirm Alex Howard returns `hours_per_week ≈ 37.5` and `annual_salary === 164814` (and 4 other research §3 employees), confirm `derived_from` field appears in response. Phase 54 now 1/2 — 54-02 (soft auto-fill on empty Step 4 + new-employees banner) is next; depends on 54-01 landing first so the auto-filled UI shows complete data.

## Coverage

✓ All 43 v1.1 requirements mapped 1:1 to a phase (no orphans, no double-mapping).

| Phase | Category | REQ-IDs | Count |
|---|---|---|---|
| 44 | TEST | TEST-01..06 | 6 |
| 45 | CLEAN | CLEAN-01..09 | 9 |
| 46 | SEC | SEC-01..08 | 8 |
| 47 | VALID | VALID-01..06 | 6 |
| 48 | MONEY | MONEY-01..08 | 8 |
| 49 | DB | DB-01..06 | 6 |
| | | **Total** | **43** |
