---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Phase 43 complete (Phase 42 = save flow consolidation merged from origin; Phase 43 = plan period as explicit state, renumbered from local 42 due to phase number collision)
last_updated: "2026-04-27T06:30:00Z"
progress:
  total_phases: 43
  completed_phases: 17
  total_plans: 68
  completed_plans: 68
  percent: 100
---

# Project State

## Current Phase: Phase 1 — Fix OpEx double-counting

## Status: Ready to execute

## Context

- Project initialized 2026-04-05
- Codebase map complete (7/7 docs)
- Extensive Xero integration work done in this session
- Active client: Just Digital Signage (Aeris Solutions Pty Ltd)
- Coach login: mattmalouf@wisdomcg.com.au

## Key Decisions

- Autonomy: Ask before acting
- Granularity: Fine-grained phases
- OpEx double-counting is Phase 1 priority (CRITICAL bug in production)
- Full platform roadmap spans 10 phases across 3 milestones

## Known Issues

- Some coach shell navigation still breaks context
- coaching_sessions endpoint returns 400 (pre-existing)
- Wizard version currently at 8

## Key Decisions

- Fix at calculation layer only (D-05) — no data migration, no schema change
- isTeamCost() from opex-classifier.ts is single source of truth for team line detection
- netProfit formula unchanged; only opex sum corrected

## Completed Work (This Session)

- Xero P&L categorisation fix (COGS vs Revenue)
- Multi-tenant org selection for Xero OAuth
- Business ID resolver for dual-ID system (businesses.id vs business_profiles.id)
- FK constraint dropped on xero_connections
- Employee type mapping and hours extraction
- Accounting parentheses ($X) across 64 files
- COGS card added to Step 2
- Tabbed P&L view (Prior Year / Current Year) on Step 2
- opex_by_month tracking in pl-summary
- Plan 01-01: useForecastWizard and BudgetTracker OpEx double-counting fix (calculation layer) — COMPLETE (ed00a9d, 7d6e60f)
- Plan 14-01: DB migration + fiscal year proximity helpers + types + service layer for extended period — COMPLETE (2701620, 5886924)
- Plan 14-02: API + hook extended period detection wired — COMPLETE (4b02938, 0573c19, b92094b)

## Position

- Current: Phase 16, Plan 02 — COMPLETE (2 tasks done, TypeScript clean)
- Stopped at: Completed 16-02-PLAN.md

## Phase 14 Decisions

- CR maps to Q1 in getNextQuarter (current_remainder precedes Q1 in extended period flow)
- extendedPeriod defaults to { isExtendedPeriod: false, year1Months: 12, currentYearRemainingMonths: 0 } on all error/no-data paths
- localFiscalYearStart local variable used in detection block to avoid async useState race
- extendedPeriodInfo passed as optional prop for backwards compatibility
- allPeriods replaces QUARTERS.map only in initiative grid sections; financial/KPI tables keep q1-q4 typed columns
- Sprint InitiativesTab receives sprintInitiatives as display prop when extended; writes still route to currentQuarterKey (q1)

## Completed Work (This Session)

- Plan 14-03 Tasks 1 & 2: Step 4 Current Year Remainder bucket + Step 5 Year End Bridge sprint (7f2c07e, 03299c8)
- Plan 14-03 Task 3: Human verification approved — Phase 14 fully COMPLETE

## Phase 15 Decisions

- InitiativeStatus extended additively with 'deferred' and 'planned' — no runtime risk
- StrategicInitiative.source extended with 'annual_review' for Phase 15 sync service
- StepType in strategic-sync-service extended with 'current_remainder' for extended period support
- Inline status union in mapDecisionToInitiative replaced with shared InitiativeStatus import (single source of truth)

## Completed Work (This Session)

- Plan 15-01: Type foundation — InitiativeStatus + source + StrategicInitiativeRef + StepType extended — COMPLETE (4463e9b, caf71a0)
- Plan 15-02: syncAnnualReview method + completeWorkshop wiring — COMPLETE (504e1b4, 98d0c5c)

## Phase 15 Plan 02 Decisions

- Targeted update on business_financial_goals (year1/year2/year3 only) — never overwrites current-year actuals
- Y2 retained from current row as baseline (A4.3 Y1 target drives Year 1 only)
- Annual sync non-blocking in completeWorkshop — errors logged, workshop completion unaffected
- UUID check distinguishes carry-forward (UPDATE) vs new (INSERT) initiatives
- syncBusinessId already resolved as profileBusinessId — passed directly to syncAnnualReview

## Phase 16 Decisions

- fiscal_year filter added at DB level in getOrCreateForecast — prevents wrong-FY rows being returned when multiple FY forecasts exist
- Removed needsUpdate fiscal_year check after DB filter guarantees the match
- Planning season threshold 3 months — within 3 months of year end, getForecastFiscalYear returns currentFY+1
- isReadOnly guarded in both handleComplete and performAutoSave to fully block writes on locked forecasts
- Duplicate still available on locked forecasts so users can create editable copies
- FYSelectorTabs renders single-tab as informational label when only one FY available (no interactive selector needed)
- PlanningSeasonBanner dismiss stored in sessionStorage per nextFiscalYear key so it reappears on next session
- selectedFiscalYear added to useEffect deps so FY tab change triggers loadInitialData automatically
- FY selection preserved across reload cycles via if (!selectedFiscalYear) guard in loadInitialData
- actuals-summary endpoint works for any forecast (locked or not) — wizard controls locked-only policy at call-site
- Lock button only shown for is_completed=true forecasts to prevent premature locking
- priorYearForecastData stored separately; effectivePriorYear selects between forecast data and Xero data

## Completed Work (This Session)

- Plan 16-01: fiscal_year filter + planning-season getForecastFiscalYear + lock enforcement in ForecastSelector and ForecastWizardV4 — COMPLETE (3f3acc3, eeb38dd)
- Plan 16-02: FYSelectorTabs + PlanningSeasonBanner components + wired into forecast page.tsx — COMPLETE (f150a37, e11096b)
- Plan 16-03: actuals-summary API + wizard prior-year wiring + lock button on forecast page — COMPLETE (d0baa82, ef2187f)

## Phase 17 Decisions

- getMonthKeysForQuarter uses generateFiscalMonthKeys slice — zero new calendar math, reuses proven function
- sumMonthsForKeys handles null/undefined JSONB gracefully returning 0 — safe for lines without actuals
- variancePct returns 0 when forecast is 0 to avoid divide-by-zero
- quarterly-summary route copies isRevenue/isCOGS classification from actuals-summary for consistency
- hasActuals true if ANY actual value is non-zero across all lines for the quarter

## Completed Work (This Session)

- Plan 17-01: getMonthKeysForQuarter + sumMonthsForKeys helpers + GET /api/forecast/quarterly-summary endpoint — COMPLETE (c83bf4e, 4563dfe)
- Plan 17-02: Forecast vs Actuals variance panel in ConfidenceRealignmentStep + PATCH /api/forecast/[id]/adjust-forward endpoint — COMPLETE (e23a888, 6d24ee0)

## Phase 17 Plan 02 Decisions

- Forecast lookup uses .in('business_id', [profileId, review.business_id]) to handle dual-ID system
- Only revenue lines adjusted in adjust-forward — COGS and OpEx excluded (start simple per plan spec)
- actual_months never read or written in adjust-forward — only forecast_months modified
- Remaining months: YYYY-MM >= currentKey lexicographic comparison — zero extra date math
- Locked forecast guard returns 403 before any DB mutation attempt
- forecastLoading separate from isLoading so variance card has its own skeleton state

## Phase 19 Decisions

- profile query moved outside if/else in generate/full-year routes — yearStartMonth available in all code paths
- getFYStartMonth helper deleted from both routes — generateFiscalMonthKeys is single source of truth for FY range calculation
- handleMonthChange made async to await loadSnapshot — safe because it fires only on explicit user click
- existingCommentary merges only accounts present in both snapshot and fresh data — prevents ghost entries

## Completed Work (This Session)

- Plan 19-01: commentary persistence across month changes + FY fix in generate and full-year routes — COMPLETE (a41e00f, 94c24e2)

## Phase 20 Decisions

- session_actions links via session_note_id to session_notes — no FK to coaching_sessions
- actions/route.ts queries session_notes (not coaching_sessions) for access check and business_id
- AI-extracted actions from analyze-transcript set session_note_id: null (no session_notes row exists at analysis time)
- action_number computed via count query (existing rows + 1) before each insert
- status enum: pending | completed | missed | carried_over — 'open' is invalid and removed
- Rock linkage uses business_profiles.id for strategic_initiatives queries (dual-ID pattern) — NOT businesses.id
- Rock selector uses autoFocus + onBlur dismiss — lightweight, no modal needed
- Teal color used for rock badge/icon to distinguish from orange action UI

## Completed Work (This Session)

- Plan 20-01: schema migration (6 columns + 1 index) + 4 API route fixes for coaching_sessions 400 errors — COMPLETE (31f6f8b, 5beb176)
- Plan 20-02: Rock linkage UI on session action items — extend interface, dual-ID rock load, linkRock() function, Target icon toggle + grouped select on current and previous actions — COMPLETE (3d015f2)

## Phase 21 Decisions

- useBusinessDashboard(clientId) is the correct coach override pattern — no separate data path needed
- KPI tab in ClientFileTabs links to /coach/clients/[id]/kpi external route (same pattern as financials/goals tabs)
- FinancialSummaryCharts (Plan 21-01) not yet available; inline QTD grid used as per plan fallback
- Read-only enforced by omitting all write callbacks in the coach KPI page
- Dual-ID resolution (resolveBusinessIds) used at dashboard-actuals API level — non-negotiable per project memory
- generateFiscalMonthKeys drives month ordering — no hardcoded Jan-Dec
- null returned for zero-actual months to avoid misleading flat baseline on Recharts AreaChart
- hasData:false with 200 OK when no forecast exists — graceful empty state, not error
- Forecast area rendered first in AreaChart so actual data visually overlays on top

## Completed Work (This Session)

- Plan 21-01: dashboard-actuals API + useXeroActuals hook + FinancialSummaryCharts component — COMPLETE (ee4efb5, df897e7)
- Plan 21-02: Coach KPI dashboard page + KPI tab in client detail navigation — COMPLETE (9c93757)
- Plan 21-03: XeroSyncButton + refreshTrigger hook extension + weekly review KPI dashboard link — COMPLETE (badc4ef)

## Phase 21 Plan 03 Decisions

- refreshTrigger optional param on useXeroActuals — zero breaking change, existing callers unaffected
- XeroSyncButton as named export (consistent with FinancialSummaryCharts pattern in same directory)
- KPI link card placed above "Mark as Complete" — visible at end of review workflow regardless of completion state
- BarChart2 icon for KPI link (TrendingUp already used in business-dashboard page header)

## Position

- Current: Phase 42, Plan 03 of 3 — Tasks 1-5 COMPLETE (5 atomic test commits + 1 stability fix). Awaiting Task 6 = `checkpoint:human-action` Vercel preview Fit2Shine smoke test.
- Stopped at: Plan 42-03 Task 6 (Vercel preview smoke test) — checkpoint awaiting human

## Last Session

- 2026-04-27T06:00:00Z — Plan 42-03 Tasks 1-5 implemented (5 vitest test files: suggestPlanPeriod 10 tests, derivePeriodInfo 7 tests, banner+modal 13 tests, coach/owner equivalence regression fence 4 source-code sentinels, persistence round-trip 4 tests). 38/38 goals tests pass; full repo test suite 299/299 pass. Vitest config gained `oxc.jsx` runtime override (project tsconfig sets `jsx: 'preserve'` which Rolldown's SSR transform cannot parse) and `@testing-library/dom` was installed (peer dep of @testing-library/react). Hook behavioural test deemed too flaky in Vitest 4 (worker rpc reports unhandled rejections from the hook's lingering async chain at teardown) — replaced with structural source-code sentinels per Plan 42-03 Task 4 fallback note.

## Phase 41 Decisions

- Plan 41-01: Deleted `loadBusinessProfile` and `getOrCreateBusinessProfile` methods entirely from `BusinessProfileService` (vs leaving as read-only no-ops) — prevents future contributors re-introducing lazy-create by mistake. Only `getBusinessProfileByBusinessId` remains as the public read entrypoint.
- Plan 41-01: Coach-path `.insert` in `getBusinessProfileByBusinessId` preserved; removed only the dead `|| 'My Business'` fallbacks (businesses.name is NOT NULL and loaded via SELECT before the insert, so the fallback never executed).
- Plan 41-01: One expected tsc error in `src/app/business-profile/page.tsx:255` (caller of deleted method) is accepted per the plan — Plan 41-02 Wave 2 removes the caller when refactoring the page to read from BusinessContext.
- Plan 41-01: `'My Business'` literal count in `business-profile-service.ts` is now 0 and serves as a regression sentinel going forward.
- Plan 41-02: Rewrote `/business-profile/page.tsx` to read solely from `BusinessContext` (`activeBusiness`, `currentUser`, `viewerContext`). Eliminated `supabase.auth.getUser()` + `createClient` usage from the page. Single load path: `getBusinessProfileByBusinessId(activeBusiness.id)` — no owner_id fallback.
- Plan 41-02: Role matrix implemented via three derived booleans (`canEditProfile` / `isReadOnly` / `isAdminRestricted`) computed from `viewerContext.role` at top of component. Every `<input>`/`<select>`/`<textarea>` gated with `disabled={isReadOnly}`. Both `autoSave()` and `handleFieldChange()` short-circuit with `if (isReadOnly) return` as first statement.
- Plan 41-02: Admin scoping bounded to 1 direct `<input>` reference (business_name) + a `<fieldset disabled={isAdminRestricted || isReadOnly}>` wrapper for owner_info. Sentinel count of 1 is well under the plan's ≤3 cap. Admin retains edit access to industry, annual_revenue, gross_profit, net_profit, cash_in_bank, employee_count, and all other finance/team/situation fields (structurally confirmed — none carry `isAdminRestricted`).
- Plan 41-02: Empty-state branch added for authenticated-but-no-business users. Role-aware copy: coach/admin see "Open a client from your client list"; client sees "Please contact your coach" with `mailto:support@wisdomcg.com.au` CTA. No call to `loadBusiness` in this branch — lazy-create on visit is structurally impossible.
- Plan 41-02: Task 3 human-verify approved via mechanical verification (Option A) per user direction — tsc clean + code-level role-matrix audit accepted in lieu of browser smoke test; DB sweep in Plan 41-03 will empirically re-confirm no new phantoms are created.

## Completed Work (This Session)

- Plan 41-01: Remove owner_id lazy-create from BusinessProfileService — COMPLETE (9a5f34e). File shrunk from 363 → 211 lines (−152 LOC net).
- Plan 41-02: Refactor /business-profile page to use BusinessContext with role-aware rendering — COMPLETE (24f7b76, f095f97). +202 / −39 LOC across two task commits.

## Phase 42 Decisions

- Plan 42-01 Task 1: Migration uses `date_trunc('month', updated_at)::date` for is_extended_period=true rows (proxy for the date detection ran), and snaps to FY start (Jul 1 / Jan 1) for standard rows based on year_type column. Skips zero-revenue placeholder rows so suggestPlanPeriod() generates fresh dates on their first save.
- Plan 42-01 Task 1: Backfill gated on `plan_start_date IS NULL` so the migration is a re-runnable no-op against the production DB once preview verification clears.
- Plan 42-01 Task 2: `suggestPlanPeriod()` is a pure function — `today` is passed as a parameter (no `new Date()` inside the body) for deterministic testing in Plan 42-03.
- Plan 42-01 Task 3: `derivePeriodInfo()` uses `days > 366` (NOT 365) as the extended-period threshold so leap-year FYs (365 or 366 day Year 1s) are NOT mis-classified as extended.
- Plan 42-01 Task 4: `planPeriod` parameter on `saveFinancialGoals` is OPTIONAL (8th positional arg) — existing call site at useStrategicPlanning.ts:430 still type-checks without modification.
- Plan 42-01 Task 4: `loadFinancialGoals` returns `planPeriod` as `string | null` shape (raw YYYY-MM-DD from Supabase date columns); the hook (Plan 42-02) converts to Date when constructing in-memory state.
- Plan 42-01 Task 5: Phase 14 silent-drop bug confirmed and fixed — `/api/goals/save` was destructuring only `{ financialData, coreMetrics, yearType, quarterlyTargets }`; now also destructures `extendedPeriod` (bug fix) and `planPeriod` (new) and writes both to `business_financial_goals`. Sentinel: `is_extended_period` count in `route.ts` is now exactly 1 (was 0 before this plan).

## Plan 42-01 Progress

- Task 1 (migration): COMPLETE (df0c007)
- Task 2 (suggestPlanPeriod helper): COMPLETE (b6e3272)
- Task 3 (derivePeriodInfo helper): COMPLETE (f9d8f09)
- Task 4 (FinancialService planPeriod read/write): COMPLETE (417affe1d4)
- Task 5 (/api/goals/save bug fix + planPeriod): COMPLETE (92eb5a7)
- Task 6 (schema-push to prod): COMPLETE — applied via Supabase Management API with explicit user authorization (see 42-01-SUMMARY.md)

## Plan 42-02 Decisions

- Plan 42-02 Task 1: Removed `ownerUser === user.id` role guard entirely from `useStrategicPlanning.ts` resolution branch — coach view and owner view now follow identical date-driven path. Replaces the Phase 14 inference block (formerly lines 744-771).
- Plan 42-02 Task 1: Three new useState hooks (`planStartDate`, `planEndDate`, `year1EndDate`) added — populated from persisted columns OR `suggestPlanPeriod()` (new plan) OR fallback (legacy non-backfilled row). Legacy `isExtendedPeriod` / `year1Months` / `currentYearRemainingMonths` state preserved as derived backwards-compat (computed via `derivePeriodInfo()` on every load).
- Plan 42-02 Task 1: Removed unused imports `isNearYearEnd`, `getMonthsUntilYearEnd`, `ExtendedPeriodInfo` from useStrategicPlanning.ts after the inference block was deleted.
- Plan 42-02 Task 4: `getYearLabel` signature changed from `(idx, yearType, currentYear, extendedPeriodInfo)` to `(idx, yearType, planPeriod?: PlanPeriodForLabel)`. All FY/CY boundaries derive from `planStartDate` / `year1EndDate` / `planEndDate`. Defensive `Year ${idx}` fallback when `planPeriod` is undefined.
- Plan 42-02 Task 4 (Rule 3 cascade): `CoreMetricsSection` and `KPISection` updated to accept and propagate `planPeriod` — required because their existing `getYearLabel(idx, yearType, currentYear)` call sites would have type-errored after the signature change. Also fixed downstream helpers `MobileMetricCard` (in CoreMetricsSection) and `KPITable` (in KPISection).
- Plan 42-02 Task 4 (Rule 1 cleanup): Removed unused legacy `YearLabelProps` interface from step1/types.ts — it contained the stale `currentYear: number` field that was tripping the regression sentinel.
- Plan 42-02 Task 5: `Step1GoalsAndKPIs` accepts new optional props `planPeriod`, `rationale`, `onPlanPeriodChange`. Banner mounts between year-type selector and "Required Section Header" only when `planPeriod` is non-null. Modal mounts conditionally on `showAdjustModal && planPeriod`. Existing `extendedPeriodInfo` prop preserved for one release of dual-prop-write.
- Plan 42-02 Task 5: `PlanPeriodAdjustModal` v1 clamps Year 1 length to `[12, 15]` months (Open Question 1 from 42-RESEARCH.md). Out-of-range disables Save and shows red validation message. "Reset to suggestion" button calls `suggestPlanPeriod(new Date(), fiscalYearStart)` and writes returned dates to local component state — user can still edit before pressing Save. Pitfall 5 warning rendered inline as amber Note.
- Plan 42-02 Task 7: **Phase 14 bug fix (Pitfall 2)** — coach goals page (`/coach/clients/[id]/goals/page.tsx`) Step1 render block now passes `extendedPeriodInfo` prop. Sentinel went from 0 to exactly 1. Without this, even after Phase 42 fixes persistence, the coach Step 1 banner / Year 1 label would not render the extended-period state correctly.

## Plan 42-02 Progress

- Task 1 (hook refactor + role guard removal): COMPLETE (c55e20e)
- Task 2 (PlanPeriodBanner component): COMPLETE (2acb2a7)
- Task 3 (PlanPeriodAdjustModal component): COMPLETE (a312324)
- Task 4 (getYearLabel refactor + cascading section component updates): COMPLETE (5f52d01)
- Task 5 (Step1GoalsAndKPIs banner + modal wiring): COMPLETE (dc0581b)
- Task 6 (owner goals page wiring): COMPLETE (7950f58)
- Task 7 (coach goals page wiring + Phase 14 bug fix): COMPLETE (9e77000)

## Plan 42-03 Decisions

- Plan 42-03 Task 1 (suggestPlanPeriod tests): Use a local-TZ safe formatter (`fmt(d) = YYYY-MM-DD via getFullYear/getMonth/getDate`) instead of `toISOString().slice(0,10)` to keep the assertions stable across timezones. The codespaces CI runs in UTC but this future-proofs the test for any env.
- Plan 42-03 Task 2 (derivePeriodInfo tests): Confirmed the helper returns **year1Months=15** for the Apr 1 2026 → Jun 30 2027 case (inclusive month diff: `(2027-2026)*12 + (5-3) + 1 = 15`). The narrative description "14 months" in the Fit2Shine context is the count of FY26-remainder + FY27 *without* counting the boundary month twice; the helper's contract is the inclusive-end calendar diff. Plan 42-03 explicitly accepted whichever value the helper returns; tests assert 15.
- Plan 42-03 Task 3 (banner + modal tests): The modal's `monthDiffInclusive(planStart, year1End)` returns 15 for the default Apr→Jun (15-month) case — out-of-range threshold is `<12 || >15` so 15 IS in range. The default Save button is enabled, validation shows for ≥16 month spans (e.g. setting year1End to Jan 31 2028).
- Plan 42-03 Task 3 (infra Rule 3): vitest.config.ts gained `oxc: { jsx: { runtime: 'automatic' } }` because the project's tsconfig has `jsx: 'preserve'` which Vite 8/Rolldown's SSR module-runner transform cannot parse. Without this, ALL `.tsx` test files fail at load with `RolldownError: Unexpected JSX expression`. Also installed `@testing-library/dom` (peer dep of `@testing-library/react` that wasn't in package.json — runtime require failed).
- Plan 42-03 Task 4 (coach/owner equivalence): Behavioural `renderHook` test was flaky in Vitest 4 because the hook chain leaves async work pending past the test boundary (4 service calls + supabase auth) which the worker rpc reports as `EnvironmentTeardownError: Closing rpc while "onUserConsoleLog" was pending`. Replaced with 4 source-code sentinels per the plan's Task 4 fallback note: (1) literal `ownerUser === user.id` absent; (2) `if (ownerUser === user.id)` guard pattern absent (regex defensive); (3) suggestPlanPeriod + derivePeriodInfo imports present; (4) `FinancialService.loadFinancialGoals(bizId)` + `setPlanStartDate/setPlanEndDate/setYear1EndDate` calls present (structural role-agnostic invariant). This is the **irreducible** REQ-42-06 regression fence — a future PR re-introducing the role guard will fail tests in CI.
- Plan 42-03 Task 5 (persistence round-trip): Mock at `@/lib/supabase/client` boundary BEFORE FinancialService import (because `private static supabase = createClient()` runs at class-load time). 4 cases: full save→reload identical ISO strings; legacy un-backfilled row returns null planPeriod fields; save without planPeriod argument writes nulls; loadFinancialGoals('') returns 'Business ID required' error.

## Plan 42-03 Progress

- Task 1 (suggestPlanPeriod unit tests, 10 cases): COMPLETE (b2011de)
- Task 2 (derivePeriodInfo unit tests, 7 cases): COMPLETE (2767b8f)
- Task 3 (PlanPeriodBanner + PlanPeriodAdjustModal component tests, 13 cases + vitest jsx infra fix): COMPLETE (a8ad838)
- Task 4 (coach/owner equivalence regression fence, 4 source-code sentinels): COMPLETE (9f95bc3 + bab8a4d)
- Task 5 (plan period persistence round-trip, 4 cases): COMPLETE (99b6cb7)
- Task 6 (Vercel preview Fit2Shine smoke test): AWAITING — `checkpoint:human-action`. User opens Vercel preview, logs in as coach, navigates to Fit2Shine goals wizard, confirms PlanPeriodBanner displays the suggested extended period, optionally clicks Adjust + verifies modal validation. Resume signal `approved — Fit2Shine reproduced + resolved` triggers SUMMARY.md creation and Phase 42 close-out.

## Accumulated Context

### Roadmap Evolution

- Phase 37 added: Resolver adoption — route all pages through resolveBusinessId (2026-04-22)
- Phase 37 COMPLETE (2026-04-22) — merged via PR #10 (5664522). 21 files migrated to shared resolver. "Coach saves to my business" bug class structurally eliminated. Runtime invariant deployed for future regression detection.
- Phases 38-40 COMPLETE (2026-04-22) — coach-context hardening sprint:
  - Phase 38: finished resolver sweep (deleted orphaned /client/* + /dashboard/integrations/* + fixed api/actions role-check) — PR #11
  - Phase 39: branded types rollout (BusinessId/UserId/BusinessProfileId at resolver + context + compile-time test) — PR #12
  - Phase 40: Playwright E2E infrastructure (smoke spec + coach-flow scaffold with test.skip + 3 scripts) — PR #13
- Phase 34 COMPLETE (2026-04-23) — bookkeeping: 34-01a (Consolidated BS, PR #2 a80ed62) and 34-02a (Consolidated Cashflow, PR #4 aa27bf2 + patches #8 #9) shipped earlier as part of the consolidation work; roadmap ticks were stale. ROADMAP.md updated to reflect reality.
- Current active roadmap: Phase 33 (CFO Multi-Client Dashboard) is next natural work — depends only on Phase 23 (done).
## Phase 35 Decisions (executing)

- Plan 35-01: cfo_email_log append-only audit table — 3 RLS policies (coach_select, super_admin_select, service_role_all). No authenticated INSERT/UPDATE/DELETE — append-only semantics enforced by absence of write policies. Migration file `supabase/migrations/20260424_cfo_email_log.sql` (7377b6c).
- Plan 35-01: filename `20260424_cfo_email_log.sql` honored per plan spec, even though recent migrations use YYYYMMDDHHMMSS. Sorts correctly after all prior migrations.
- Plan 35-02: HMAC-SHA256 chosen over JWT (D-20) — matches existing `src/lib/utils/encryption.ts` pattern, zero new deps, shorter URLs via base64url signatures (vs hex in OAuth helper).
- Plan 35-02: Token payload is ONLY base64url(statusId) — no `exp`, no `iat`, no JSON wrapper (D-21 tokens-never-expire). Global kill-switch is secret rotation.
- Plan 35-02: `buildReportUrl` strips trailing slashes from `appUrl`; URL-encodes portal slugs; accepts `periodMonth` as YYYY-MM-DD or YYYY-MM and always emits YYYY-MM in portal URL (D-22).
- Plan 35-02: `.env.example` was gitignored (pattern `.env*` at line 34); force-added with `-f` per the `.gitignore` comment allowing opt-in.

## Completed Work (Phase 35)

- Plan 35-01: cfo_email_log table DDL + RLS + composite index — COMPLETE (7377b6c).
- Plan 35-02: report-token.ts + build-report-url.ts + .env.example — COMPLETE (490418e, 5a4621b, 7203f79). 19 unit tests passing.

## Phase 42 Decisions (Save Flow Consolidation — origin/main work)

- Plan 42-00: Lift useDebouncedCallback verbatim from ForecastWizardV4.tsx:23-42 to src/lib/hooks/use-debounced-callback.ts. Pitfall 1 paid down inside the shared hook.
- Plan 42-01: useAutoSaveReport hook — debounce + blur + retry + queue + Finalise/consolidation guards.
- Plan 42-02: SaveIndicator purely presentational (no useState / useEffect / fetch).
- Plan 42-03: Replaced 88-line edit/view-mode CommentaryLine with 55-line always-editable variant. D-04 fully satisfied.

## Completed Work (Phase 42)

- Plan 42-00: shared useDebouncedCallback hook + 4 it.todo test scaffolds — COMPLETE (ba90c46, b4f34ea).
- Plan 42-01: useAutoSaveReport hook with 500ms debounce + 3-attempt backoff — COMPLETE (245ec3a). 15 vitest tests pass.
- Plan 42-02: SaveIndicator presentational component + 7 RTL tests — COMPLETE (c1980b5, ad1aa4b, 9aaa6aa).
- Plan 42-03: CommentaryLine refactored to always-editable inline textarea + 7 RTL tests — COMPLETE (1e243f3, 082ba8f).
- Plans 42-04 through 42-06 — COMPLETE (origin/main; merged via PR #18).

## Phase 43 Decisions (Plan period as explicit state — local work, completed 2026-04-27)

- Drafted locally as Phase 42 before discovering origin's Phase 42 (save flow above) was already merged via PR #18. Renumbered forward-only on 2026-04-27 — historical commit messages remain `feat(42-XX)` / `test(42-XX)` / `docs(42-XX)`, current artifacts (directory + ROADMAP entry + SUMMARY frontmatter) are 43-XX.
- Plan 43-01 (committed as 42-01): Three nullable date columns added to business_financial_goals via additive migration. Idempotent backfill gated on `plan_start_date IS NULL`; skips zero-revenue placeholder rows. Migration applied to prod 2026-04-27 via Supabase Management API with explicit user authorization.
- Plan 43-01: Phase 14 silent-drop bug fixed at /api/goals/save/route.ts:96 — extendedPeriod was being silently dropped from request body for every coach save since Phase 14 shipped.
- Plan 43-01: derivePeriodInfo helper preserves the legacy ExtendedPeriodInfo shape so Phase 14 component contract stays intact — zero breaking changes downstream. isExtendedPeriod threshold = days > 366 (leap-year safe).
- Plan 43-02 (committed as 42-02): The `ownerUser === user.id` role guard at useStrategicPlanning.ts:759 was the ONLY coach-vs-owner divergence in the load sequence. Removed in this plan. Coach view and owner view now collapse to one read path.
- Plan 43-02: PlanPeriodAdjustModal clamps year1Months to [12, 15] for v1 — relaxing the range requires Step 4/5 UI broader change.
- Plan 43-02: getYearLabel refactored to read planPeriod dates instead of `new Date()` — sentinel `grep -c "new Date()" src/app/goals/components/step1/types.ts` is now 0 (was 4).
- Plan 43-02: Phase 14 coach-page bug fixed — coach goals page now passes `extendedPeriodInfo` prop to Step1GoalsAndKPIs, parity with regular `/goals/page.tsx`.
- Plan 43-03 (committed as 42-03): Two REGRESSION FENCES live in CI permanently — coach/owner equivalence (source-text sentinel of `ownerUser === user.id` absence) + planPeriod persistence round-trip.
- Plan 43-03: derivePeriodInfo for Apr 2026 → Jun 2027 returns `year1Months = 15` per inclusive-end month-diff formula. Tests assert helper contract, not prose narrative.
- Plan 43-03: Vercel preview smoke test approved by user 2026-04-27 — Fit2Shine coach view shows the PlanPeriodBanner with date-driven Year 1 label, original 2026-04-24 incident structurally resolved.

## Completed Work (Phase 43)

- Plan 43-01: migration applied to prod (3 columns + 11 rows backfilled, 0 rows missing) + suggestPlanPeriod helper + derivePeriodInfo helper + FinancialService planPeriod r/w + /api/goals/save Phase 14 bug fix — COMPLETE (df0c007, b6e3272, f9d8f09, 417848f, 92eb5a7, bdcded1, f500116).
- Plan 43-02: hook detection block replaced with date-driven read; ownerUser guard removed; PlanPeriodBanner + PlanPeriodAdjustModal added; getYearLabel reads planPeriod dates; both goals pages thread planPeriod through; coach-page Phase 14 bug fixed — COMPLETE (c55e20e, 2acb2a7, a312324, 5f52d01, dc0581b, 7950f58, 9e77000, 553c0c9). 7 atomic tasks; all 5 sentinels green.
- Plan 43-03: 5 vitest test files (38 tests pass); full suite 299/299; smoke test approved on Fit2Shine — COMPLETE (b2011de, 2767b8f, a8ad838, 9f95bc3, bab8a4d, 99b6cb7, dc2f194, 0d8010b).

## Position

- Current: Phase 43 [COMPLETE]. Phase 42 (save flow) also [COMPLETE] (origin/main work).
- Stopped at: Completed 43-03-SUMMARY.md + Phase 43 closeout commit (0d8010b).

## Last Session

- 2026-04-27T06:30:00Z — Completed Phase 43 closeout. Resolved phase-number collision with origin's Phase 42 by renumbering local work forward to 43 (forward-only, no history rewrite).

## Roadmap Evolution

- Phase 41 added (2026-04-23): Eliminate phantom business orphan rows via active-business routing. Triggered by Jessica @ Oh Nine incident.
- Phase 42 added (2026-04-27): Monthly Report Save Flow Consolidation. Auto-save-on-blur replacing 4 confusing save buttons. Surfaced during Phase 35 Plan 35-07 UAT.
- Phase 43 added (2026-04-27): Plan period as explicit state — replace inference-based extended period detection. Triggered by Fit2Shine planning session 2026-04-24. Originally drafted locally as Phase 42; renumbered to 43 forward-only after discovering origin's Phase 42 was the save flow work above. Historical commit prefixes remain `42-XX`; current artifacts are `43-XX`.
- Phase 44 added (2026-04-27): Forecast Pipeline End-to-End Fix. Triggered by Envisage Australia diagnostic surfacing cascading sync bugs (xero_pl_lines duplicates from race, broken multi-window logic returning 12-month rolling cumulative totals instead of monthly values, broken reconciliation dumping FY totals onto a single month, sparse-tenant edge cases). Scope: whole pipeline — Xero sync architecture, wizard data flow, wizard UX, save flow, downstream consumers (monthly report + cashflow). Goal: 100% reflective of Xero + deterministic + world-class UX correct first time.
