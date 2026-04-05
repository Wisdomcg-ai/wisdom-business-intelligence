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
- Plan 01-01: useForecastWizard and BudgetTracker OpEx double-counting fix (calculation layer)
- Plan 01-02: Step5OpEx UI fix — isTeamCost guards in reducers, greyed-out team cost rows (commit 5d35d44)

## Position
- Current: Phase 01, Plan 02 — awaiting human verification (checkpoint:human-verify)
- Stopped at: Task 2 of 01-02-PLAN.md — browser verification of OpEx fix

## Last Session
- 2026-04-05T03:13:45Z — Completed Task 1 of 01-02, awaiting human verify
