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
- Current: Phase 14, Plan 03 — PAUSED at Task 3 (checkpoint:human-verify)
- Stopped at: Completed 14-03-PLAN.md tasks 1 and 2, awaiting human verification (Task 3)

## Phase 14 Decisions
- CR maps to Q1 in getNextQuarter (current_remainder precedes Q1 in extended period flow)
- extendedPeriod defaults to { isExtendedPeriod: false, year1Months: 12, currentYearRemainingMonths: 0 } on all error/no-data paths
- localFiscalYearStart local variable used in detection block to avoid async useState race
- extendedPeriodInfo passed as optional prop for backwards compatibility
- allPeriods replaces QUARTERS.map only in initiative grid sections; financial/KPI tables keep q1-q4 typed columns
- Sprint InitiativesTab receives sprintInitiatives as display prop when extended; writes still route to currentQuarterKey (q1)

## Completed Work (This Session)
- Plan 14-03 Tasks 1 & 2: Step 4 Current Year Remainder bucket + Step 5 Year End Bridge sprint (7f2c07e, 03299c8)

## Last Session
- 2026-04-07T22:59:13Z — Completed 14-03 tasks 1 and 2 (Step 4/5 extended period UI), paused at human-verify checkpoint
