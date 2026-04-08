---
phase: 17-quarterly-review-forecast-integration
plan: "02"
subsystem: ui+api
tags: [quarterly-review, forecast, variance, confidence-realignment, adjust-forward]

requires:
  - phase: 17-01
    provides: GET /api/forecast/quarterly-summary + getMonthKeysForQuarter/sumMonthsForKeys helpers

provides:
  - Forecast vs Actuals variance panel in ConfidenceRealignmentStep (step 4.1)
  - PATCH /api/forecast/[id]/adjust-forward endpoint to scale remaining revenue forecast months

affects:
  - 17-03 (any further quarterly review integration work)
  - Quarterly review coaches who use step 4.1

tech-stack:
  added: []
  patterns:
    - "Forecast variance display: 3-column table (forecast/actual/variance) with color-coded variance column"
    - "Adjustment factor: 1 + (adjustmentPct / 100), applied to forecast_months JSONB for revenue lines only"
    - "Remaining months: allKeys.filter(key => key >= currentKey) using YYYY-MM lexicographic comparison"
    - "Locked forecast guard: 403 response before any DB mutation"

key-files:
  created:
    - src/app/api/forecast/[id]/adjust-forward/route.ts
  modified:
    - src/app/quarterly-review/components/steps/ConfidenceRealignmentStep.tsx

key-decisions:
  - "Forecast lookup uses .in('business_id', [profileId, review.business_id]) to handle dual-ID system"
  - "forecastLoading initialized to true and set false in finally block alongside isLoading"
  - "Only revenue lines adjusted — COGS and OpEx excluded per plan spec (start simple)"
  - "actual_months never read or written in adjust-forward — only forecast_months modified"
  - "adjustmentPct comment in route.ts doc block is documentation only — no DB operation references actual_months"
  - "Variance color: green for positive (actual > forecast), red for negative, gray for zero"
  - "Empty state renders graceful info message when no forecast exists for review year"

requirements-completed:
  - REQ-17-01
  - REQ-17-05
  - REQ-17-06
  - REQ-17-08

duration: ~5min
completed: 2026-04-08
---

# Phase 17 Plan 02: Forecast vs Actuals Variance Panel + Adjust-Forward API Summary

**Forecast vs Actuals variance card wired into ConfidenceRealignmentStep (step 4.1) showing Q-level revenue/GP/NP deltas with an Apply to Forecast button backed by a PATCH adjust-forward endpoint that scales remaining revenue months by adjustment percentage**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-08T03:03:22Z
- **Completed:** 2026-04-08T03:08:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Extended `ConfidenceRealignmentStep.tsx` with a "Forecast vs Actuals — Q{N}" card above the annual targets table. The card fetches from `financial_forecasts` (dual-ID aware) and calls the quarterly-summary API. It renders a 3-column table for Revenue, Gross Profit, and Net Profit with forecast, actual, and color-coded variance ($ and %).
- Added `handleApplyAdjustment` that calls the new adjust-forward PATCH endpoint. UI shows a percentage input and "Apply to Forecast" button (disabled when pct=0), success message on completion, and locked-forecast info state.
- Created `PATCH /api/forecast/[id]/adjust-forward` endpoint. Validates input, checks lock status (403), computes remaining month keys from today forward, and multiplies `forecast_months` values for revenue lines only by the adjustment factor. Returns count of adjusted lines and months.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Forecast vs Actuals variance panel** - `e23a888` (feat)
2. **Task 2: Create PATCH /api/forecast/[id]/adjust-forward** - `6d24ee0` (feat)

## Files Created/Modified

- `src/app/quarterly-review/components/steps/ConfidenceRealignmentStep.tsx` — +201 lines: new state, forecast fetch, variance table UI, apply-adjustment handler
- `src/app/api/forecast/[id]/adjust-forward/route.ts` — New file, 165 lines; full auth, validation, lock check, revenue-only JSONB update

## Decisions Made

- Dual-ID system handled by `.in('business_id', [profileId, review.business_id])` in the forecast lookup — consistent with existing project patterns
- `forecastLoading` is separate from `isLoading` so the variance card has its own loading skeleton without blocking the main page render
- Only revenue lines adjusted per plan specification ("start simple") — COGS and OpEx excluded
- `actual_months` is never referenced in any DB operation in adjust-forward; the only mention is in the file's doc comment
- Remaining months determined by `YYYY-MM >= currentKey` lexicographic comparison — zero extra date math, proven correctness
- Adjustment factor computed as `1 + (adjustmentPct / 100)` — clean, readable, no risk of sign confusion

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — TypeScript compiled clean on first attempt for both tasks.

## User Setup Required

None.

## Next Phase Readiness

- Phase 17 Plan 03 (if any) can rely on the variance panel being present in step 4.1
- The adjust-forward endpoint is generic enough to be called from other contexts (e.g., annual review)
- Lock guard in adjust-forward prevents accidental writes to completed forecasts

---
*Phase: 17-quarterly-review-forecast-integration*
*Completed: 2026-04-08*
