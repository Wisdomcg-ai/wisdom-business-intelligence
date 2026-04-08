---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Executing Phase 16
last_updated: "2026-04-08T02:30:00.000Z"
progress:
  total_phases: 23
  completed_phases: 3
  total_plans: 11
  completed_plans: 10
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

## Completed Work (This Session)

- Plan 16-01: fiscal_year filter + planning-season getForecastFiscalYear + lock enforcement in ForecastSelector and ForecastWizardV4 — COMPLETE (3f3acc3, eeb38dd)
- Plan 16-02: FYSelectorTabs + PlanningSeasonBanner components + wired into forecast page.tsx — COMPLETE (f150a37, e11096b)

## Last Session

- 2026-04-08T02:30:00Z — Completed 16-02-PLAN.md (FY selector tabs + planning season banner complete)
