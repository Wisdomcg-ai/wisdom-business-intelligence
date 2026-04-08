---
phase: 15-q4-annual-review-abridged-goals-wizard
plan: "03"
subsystem: ui
tags: [typescript, goals-wizard, quarterly-review, strategic-initiatives, supabase]

# Dependency graph
requires:
  - phase: 15-q4-annual-review-abridged-goals-wizard
    plan: "01"
    provides: InitiativeStatus extended with deferred/planned, annual_review source value
  - phase: 15-q4-annual-review-abridged-goals-wizard
    plan: "02"
    provides: syncAnnualReview() that writes next-year initiatives to strategic_initiatives
provides:
  - hasNextYearAnnualPlan detection flag in useStrategicPlanning hook
  - annualReviewYear state exposed by useStrategicPlanning
  - "Already planned in Q4 review" info banner on Goals Wizard Step 1
  - fiscal_year safety filter on AnnualInitiativePlanStep carry-forward query
affects:
  - Goals Wizard Step 1 (banner display)
  - Annual review carry-forward initiative loading

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Detection query pattern: query quarterly_reviews for completed annual review to drive UI state"
    - "Carry-forward safety filter: exclude fiscal_year=nextFY rows to prevent duplicate loading after annual sync"

key-files:
  created: []
  modified:
    - src/app/goals/hooks/useStrategicPlanning.ts
    - src/app/goals/page.tsx
    - src/app/quarterly-review/components/steps/AnnualInitiativePlanStep.tsx

key-decisions:
  - "Detection uses businessesId (businesses.id) as primary lookup since quarterly_reviews.business_id stores businesses.id, falls back to businessId"
  - "Banner renders on Step 1 only (not steps 2-5) — coach sees it when setting year 1 goals"
  - "nextFY filter is conditional (only applied when nextFY is truthy) to avoid breaking query when year is unavailable"
  - "fiscal_year column added to carry-forward SELECT so filter value is confirmed in the result set"

patterns-established:
  - "useStrategicPlanning exposes detection flags; page.tsx renders UI from those flags — clean separation"

requirements-completed:
  - "Goals Wizard detects existing next-year data: Already planned in Q4 review"
  - "Carry forward fiscal_year filter to prevent duplicate initiative loading"

# Metrics
duration: 12min
completed: 2026-04-08
---

# Phase 15 Plan 03: Detection Banner & Carry-Forward Filter Summary

**teal info banner on Goals Wizard Step 1 when a completed Q4 annual review exists, plus fiscal_year filter on carry-forward query to prevent next-year initiative duplication**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-08T00:16:00Z
- **Completed:** 2026-04-08T00:28:13Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `useStrategicPlanning` now queries `quarterly_reviews` for a completed annual review (`review_type = 'annual'`, `status = 'completed'`, `year = currentFY`) and exposes `hasNextYearAnnualPlan` + `annualReviewYear`
- Goals Wizard Step 1 shows a teal banner ("Already planned in Q4 review") when the detection flag is true, using `CheckCircle2` icon with correct brand styling
- `AnnualInitiativePlanStep` carry-forward query now excludes rows where `fiscal_year = nextFY`, preventing already-synced next-year initiatives from appearing as carry-forward candidates

## Task Commits

Each task was committed atomically:

1. **Task 1: Add hasNextYearAnnualPlan detection to useStrategicPlanning** - `84218be` (feat)
2. **Task 2: Add banner to Goals Wizard page + fiscal_year filter on carry-forward** - `2aaaff4` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/app/goals/hooks/useStrategicPlanning.ts` - Added getCurrentFiscalYear/startMonthFromYearType imports; new state variables; detectAnnualPlan useEffect querying quarterly_reviews; flags in return object
- `src/app/goals/page.tsx` - Added CheckCircle2 import; destructured hasNextYearAnnualPlan + annualReviewYear; teal banner JSX on Step 1
- `src/app/quarterly-review/components/steps/AnnualInitiativePlanStep.tsx` - Carry-forward query refactored to builder pattern with conditional `.neq('fiscal_year', nextFY)` filter

## Decisions Made
- Used `businessesId || businessId` as detection query key since `quarterly_reviews.business_id` stores `businesses.id`. When `businessesId` is not yet set (e.g., normal user flow before `businessesId` state is populated), fall back to `businessId`. Detection runs once either ID is available.
- Banner placed at top of Step 1 content area, above `Step1GoalsAndKPIs` — visible immediately when coach enters Step 1
- Carry-forward query uses `.neq()` (not equal) rather than a range filter so rows with `null` fiscal_year still load (only rows explicitly set to nextFY are excluded)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 15 Plan 03 is the final detection/safety layer for the Q4 annual review flow
- The three plans (01 types, 02 sync, 03 detection) together deliver the full Q4 Annual Review wizard feature
- No blockers for phase completion

## Self-Check: PASSED

- FOUND: src/app/goals/hooks/useStrategicPlanning.ts
- FOUND: src/app/goals/page.tsx
- FOUND: src/app/quarterly-review/components/steps/AnnualInitiativePlanStep.tsx
- FOUND: .planning/phases/15-q4-annual-review-abridged-goals-wizard/15-03-SUMMARY.md
- FOUND: commit 84218be (Task 1)
- FOUND: commit 2aaaff4 (Task 2)

---
*Phase: 15-q4-annual-review-abridged-goals-wizard*
*Completed: 2026-04-08*
