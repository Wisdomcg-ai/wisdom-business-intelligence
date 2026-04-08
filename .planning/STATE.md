---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Executing Phase 20
last_updated: "2026-04-08T03:49:07.723Z"
progress:
  total_phases: 23
  completed_phases: 6
  total_plans: 17
  completed_plans: 16
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

## Completed Work (This Session)

- Plan 20-01: schema migration (6 columns + 1 index) + 4 API route fixes for coaching_sessions 400 errors — COMPLETE (31f6f8b, 5beb176)

## Position

- Current: Phase 20, Plan 01 — COMPLETE
- Stopped at: Completed 20-01-PLAN.md

## Last Session

- 2026-04-07T00:15:00Z — Completed 20-01-PLAN.md
