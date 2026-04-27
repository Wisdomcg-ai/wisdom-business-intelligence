---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Executing Phase 42
last_updated: "2026-04-27T01:42:46.607Z"
progress:
  total_phases: 41
  completed_phases: 15
  total_plans: 58
  completed_plans: 54
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

- Current: Phase 21, Plan 03 — COMPLETE (Phase 21 fully complete)
- Stopped at: Completed 21-03-PLAN.md

## Last Session

- 2026-04-08T04:31:09Z — Completed 21-03-PLAN.md (Phase 21 fully complete)

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
- Plan 35-02: `buildReportUrl` strips trailing slashes from `appUrl` (normalizes `https://x.com/` and `https://x.com` to same URL); URL-encodes portal slugs; accepts `periodMonth` as YYYY-MM-DD or YYYY-MM and always emits YYYY-MM in portal URL (D-22).
- Plan 35-02: `.env.example` was gitignored (pattern `.env*` at line 34); force-added with `-f` per the `.gitignore` comment allowing opt-in.

## Completed Work (Phase 35)

- Plan 35-01: cfo_email_log table DDL + RLS + composite index on (business_id, period_month) — COMPLETE (7377b6c). Foundation for APPR-02/03/04. Migration APPLY is a deploy-time task for Matt.
- Plan 35-02: report-token.ts (HMAC sign/verify) + build-report-url.ts (forward-compat URL helper) + .env.example REPORT_LINK_SECRET doc — COMPLETE (490418e, 5a4621b, 7203f79). 19 unit tests passing. Wave 2 (plans 35-04/05/06) unblocked.

## Phase 42 Decisions (executing)

- Plan 42-00: Lift useDebouncedCallback verbatim from ForecastWizardV4.tsx:23-42 to src/lib/hooks/use-debounced-callback.ts. Pitfall 1 paid down inside the shared hook — useEffect with empty deps clears timeoutRef on unmount. Every future consumer (incl. upcoming useAutoSaveReport in 42-01) inherits the fix automatically.
- Plan 42-00: Use `it.todo` (not `it.skip`) for Wave 0 scaffolds — todos render as "pending" giving a visible burn-down indicator (28 todos at Wave 0 → 0 at Phase 42 close). Skip would read as a regression risk.
- Plan 42-00: Sonner mock pre-declared in every scaffold header so downstream plans (42-01..42-04) don't re-derive the import contract from ReportStatusBar.test.tsx.
- Plan 42-00: Harness component for debounce tests (not @testing-library/react-hooks renderHook) — Pitfall 1 regression test exercises real RTL component lifecycle including the useEffect cleanup.

## Completed Work (Phase 42)

- Plan 42-00: shared useDebouncedCallback hook + 4 it.todo test scaffolds (28 todos enumerating D-01..D-15 + D-17) — COMPLETE (ba90c46, b4f34ea). Full vitest suite green: 323 pass, 28 todo, 0 fail. tsc clean. Wave 0 Nyquist gate satisfied; plans 42-01..42-04 unblocked.

## Position

- Current: Phase 42, Plan 00 — COMPLETE (2 tasks done, 5 new debounce tests passing, 28 todos pending, tsc clean)
- Stopped at: Completed 42-00-PLAN.md

## Last Session

- 2026-04-27T01:41:08Z — Completed 42-00-PLAN.md (Wave 0 foundation: shared debounce hook with unmount cleanup + 4 it.todo scaffolds for downstream Phase 42 plans)
