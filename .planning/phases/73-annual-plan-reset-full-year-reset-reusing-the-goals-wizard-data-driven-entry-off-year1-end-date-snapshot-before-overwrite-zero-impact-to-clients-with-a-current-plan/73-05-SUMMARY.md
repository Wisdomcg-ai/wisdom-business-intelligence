---
phase: 73-annual-plan-reset
plan: "05"
subsystem: quarterly-review
tags: [annual-reset, quarterly-review, retire-legacy, single-annual-path]
dependency_graph:
  requires: [73-04]
  provides: [annual-steps-retired, q4-button-removed]
  affects:
    - src/app/quarterly-review/types/index.ts
    - src/app/quarterly-review/workshop/page.tsx
    - src/app/quarterly-review/page.tsx
    - src/app/quarterly-review/__tests__/quarter-helpers.test.ts
key_files:
  modified:
    - src/app/quarterly-review/types/index.ts
    - src/app/quarterly-review/workshop/page.tsx
    - src/app/quarterly-review/page.tsx
    - src/app/quarterly-review/__tests__/quarter-helpers.test.ts
  created: []
decisions:
  - "Removed A4.1–A4.4 from ANNUAL_WORKSHOP_STEPS only. Left the WorkshopStep union, STEP_LABELS, PART_LABELS, getStepPart, and PART_DURATIONS A4.* entries in place (harmless, avoids wide type churn) — they can no longer sequence, so they're unreachable."
  - "workshop/page.tsx: removed the 4 annual-step imports + 4 switch cases. Left the update* handlers (updateYearInReview/VisionStrategy/NextYearTargets/AnnualInitiativePlan) destructured from useQuarterlyReview — noUnusedLocals=false + next/core-web-vitals does not error on unused vars, and the hook is kept for the preserved syncAnnualReview path. The 4 step component FILES remain on disk."
  - "page.tsx: removed the isQ4 'Start Annual Review' button + the explanatory paragraph, then the now-dead isQ4 local and its isLastQuarterOfYear import. Kept Star (still used by other buttons), startNewReview (signature unchanged; only 'quarterly' is called now), quarterly_reviews jsonb columns, and syncAnnualReview (defensive for historical annual reviews)."
metrics:
  completed: "2026-06-13"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 73 Plan 05: Retire the bolted-on annual path

The quarterly-review module no longer routes into the four annual-planning steps (A4.1 Year in Review, A4.2 Vision & Strategy, A4.3 Next Year Targets, A4.4 Annual Initiative Plan), and the Q4-gated "Start Annual Review" button is gone. The goals-wizard reset (`/goals?reset=annual`, Plans 01–04) is now the single annual planning path.

## Task 1 — A4.* removed from the annual sequence
- `ANNUAL_WORKSHOP_STEPS` no longer contains A4.1–A4.4; it is now identical to `WORKSHOP_STEPS`.
- Added 4 assertions to `quarter-helpers.test.ts`: quarterly sequence unchanged (`toEqual(WORKSHOP_STEPS)`), default type = quarterly, annual contains no A4.*, annual === quarterly (length + contents).
- `npx vitest run src/app/quarterly-review/__tests__/quarter-helpers.test.ts` → **12 passed**.

## Task 2 — render branches + Q4 button removed
- `workshop/page.tsx`: deleted the 4 annual-step imports and the `case 'A4.1'..'A4.4'` render branches. Step component files preserved on disk.
- `page.tsx`: deleted the `isQ4` "Start Annual Review" button + explanatory paragraph, and the now-dead `isQ4` local + `isLastQuarterOfYear` import.
- `npx tsc --noEmit` clean; quarterly-review tests green; the 4 step component files + `syncAnnualReview` confirmed present.

## Preserved (historical safety)
- All `quarterly_reviews` annual jsonb columns.
- The 4 annual step component files.
- `syncAnnualReview` + its guarded call site in `useQuarterlyReview.ts`.

## Self-Check: PASSED
- [x] No `A4.` in `ANNUAL_WORKSHOP_STEPS`; `WORKSHOP_STEPS` unchanged
- [x] No `Start Annual Review`; no annual-step imports/cases in workshop
- [x] Step component files + `syncAnnualReview` still on disk
- [x] tsc clean; quarter-helpers tests pass
