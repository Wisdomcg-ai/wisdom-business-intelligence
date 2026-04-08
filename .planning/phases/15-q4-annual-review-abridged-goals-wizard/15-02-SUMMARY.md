---
phase: 15-q4-annual-review-abridged-goals-wizard
plan: "02"
subsystem: services
tags: [typescript, annual-review, strategic-sync, financial-goals, strategic-initiatives]

# Dependency graph
requires:
  - phase: 15-q4-annual-review-abridged-goals-wizard
    plan: "01"
    provides: InitiativeStatus, StepType extensions, source='annual_review' type
provides:
  - syncAnnualReview method on StrategicSyncService
  - Annual sync wired into completeWorkshop in useQuarterlyReview
affects:
  - 15-03 (detection banner reading annual_review-sourced initiatives)
  - Goals Wizard (reads business_financial_goals Y1/Y2/Y3 columns updated by this sync)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Targeted update on business_financial_goals (year1/year2/year3 only) — never overwrites current-year actuals"
    - "Multi-ID fallback for business_financial_goals lookup (businessId, user.id, business_profile_id)"
    - "Non-blocking annual sync in completeWorkshop — errors logged, workshop completion unaffected"
    - "UUID check to distinguish carry-forward (UPDATE) vs new (INSERT) initiatives"

key-files:
  created: []
  modified:
    - src/app/quarterly-review/services/strategic-sync-service.ts
    - src/app/quarterly-review/hooks/useQuarterlyReview.ts

key-decisions:
  - "syncAnnualReview placed BEFORE syncAll in service for readability; called AFTER syncAll in completeWorkshop so quarterly sync runs first"
  - "Targeted update on business_financial_goals — only year1/year2/year3 columns, no current-year columns touched"
  - "Y2 roll-forward retains current row value (not derived from A4.3) — Y3 target moves to Y2 was considered but plan spec keeps Y2 as is"
  - "Non-blocking: annual sync errors logged but never prevent workshop completion"
  - "UUID check determines UPDATE vs INSERT for carry-forward initiatives"

# Metrics
duration: ~7min
completed: 2026-04-08
---

# Phase 15 Plan 02: Annual Review Sync Service Summary

**syncAnnualReview method added to StrategicSyncService and wired into completeWorkshop — when a coach completes an annual review, A4.3 financial targets roll forward to Year 1 and A4.4 initiatives are synced to strategic_initiatives with fiscal_year stamp**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-08T00:20:00Z
- **Completed:** 2026-04-08T00:26:31Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `syncAnnualReview()` method added to `StrategicSyncService` with two-part implementation:
  - Part A: Loads `business_financial_goals` row (multi-ID fallback), then targeted update of year1/year2/year3 columns only — `next_year_targets` becomes Year 1, current Year 2 retained, stretch targets or current Year 3 used for Year 3
  - Part B: Iterates `annualInitiativePlan.initiatives`, UPDATEs existing (UUID) or INSERTs new rows in `strategic_initiatives` with `fiscal_year = nextYear` and `source = 'annual_review'`
- Annual sync wired into `completeWorkshop()` in `useQuarterlyReview.ts` after `syncAll()`, guarded by `reviewType === 'annual'` and data existence checks
- Both `NextYearTargets` and `AnnualInitiativePlan` imported from `'../types'`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add syncAnnualReview to StrategicSyncService** - `504e1b4` (feat)
2. **Task 2: Wire syncAnnualReview into completeWorkshop** - `98d0c5c` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/app/quarterly-review/services/strategic-sync-service.ts` — Added syncAnnualReview method (~145 lines), imported NextYearTargets + AnnualInitiativePlan
- `src/app/quarterly-review/hooks/useQuarterlyReview.ts` — Added annual sync block (20 lines) after syncAll try/catch, before post-sync snapshot

## Decisions Made
- Used targeted `business_financial_goals` update (not `FinancialService.saveFinancialGoals()`) to avoid overwriting current-year actuals — matches plan spec exactly
- Year 2 forward: retained from current row (plan spec says "current Year 2 stays as new Year 2 baseline") — not rolling Y3→Y2 since the A4.3 targets provide the new Y1 directly
- Annual sync is strictly non-blocking: any error is caught, logged, and does not prevent `completeWorkshop()` from completing
- `syncBusinessId` (already resolved as `profileBusinessId || getSnapshotBusinessId() || businessId`) used — correct business_profiles.id passed to syncAnnualReview

## Deviations from Plan

None — plan executed exactly as written.

The worktree was behind main (missing 15-01 commits). A catch-up merge commit was added before task commits to bring in the type foundation. This is an execution-environment concern, not a plan deviation.

## Issues Encountered
None — TypeScript compiled cleanly after each task with no new errors.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- `syncAnnualReview` is callable and typed. Plan 15-03 can read `strategic_initiatives` rows where `source = 'annual_review'` to show the detection banner.
- Financial goals row will have rolled-forward Y1/Y2/Y3 values after any annual review completion.
- Initiatives in `strategic_initiatives` for `fiscal_year = nextYear` with `source = 'annual_review'` are ready for Goals Wizard pre-population.

## Self-Check: PASSED

- FOUND: src/app/quarterly-review/services/strategic-sync-service.ts
- FOUND: src/app/quarterly-review/hooks/useQuarterlyReview.ts
- FOUND: commit 504e1b4 (Task 1)
- FOUND: commit 98d0c5c (Task 2)

---
*Phase: 15-q4-annual-review-abridged-goals-wizard*
*Completed: 2026-04-08*
