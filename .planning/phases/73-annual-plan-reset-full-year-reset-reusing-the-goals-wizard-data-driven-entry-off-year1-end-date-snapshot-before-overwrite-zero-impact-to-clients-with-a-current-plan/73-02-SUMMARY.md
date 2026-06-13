---
phase: 73-annual-plan-reset
plan: 02
subsystem: goals
tags: [annual-reset, rollover, ladder-shift, snapshot-gate, TDD]
dependency_graph:
  requires: [73-01]
  provides: [AnnualResetService.executeAnnualReset, computeRolledLadder, computeRolledPlanDates]
  affects: [business_financial_goals, strategic_initiatives]
tech_stack:
  added: []
  patterns:
    - snapshot-gate (capture before write)
    - self-read contract (service reads own prior row)
    - D3 ladder shift (new_current=prior_year1, new_year1=prior_year2, new_year2=prior_year3, new_year3=prior_year3)
    - local-date formatting to avoid UTC-shift in positive-offset timezones
key_files:
  created:
    - src/app/goals/utils/rollover-math.ts
    - src/app/goals/services/annual-reset-service.ts
    - src/__tests__/goals/rollover-math.test.ts
    - src/__tests__/goals/annual-reset-service.test.ts
  modified: []
decisions:
  - "toLocalDateString() helper used instead of .toISOString().slice(0,10) to prevent UTC-offset shift on AEST machines (new Date(2026,6,1).toISOString() returns 2026-06-30T14:00:00Z)"
  - "vi.hoisted() used for mockCaptureAnnualResetSnapshot to satisfy vitest vi.mock factory hoisting requirement"
  - "Initiative carry-forward uses .in('id', incompleteIds).eq('business_id', ...) pattern — queries incomplete IDs first then updates by ID array so completed/cancelled rows are never touched"
metrics:
  duration_minutes: 5
  completed_date: "2026-06-13"
  tasks_completed: 2
  files_changed: 4
---

# Phase 73 Plan 02: Annual Reset Rollover Orchestrator Summary

**One-liner:** Snapshot-gated `executeAnnualReset` with D3 ladder shift, date roll, and initiative carry-forward — all behind a captureAnnualResetSnapshot safety gate.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 (RED) | Rollover math tests | `1229deb0` | `src/__tests__/goals/rollover-math.test.ts` |
| 1 (GREEN) | rollover-math.ts implementation | `ca0a821d` | `src/app/goals/utils/rollover-math.ts` |
| 2 (RED) | Annual reset service tests | `66f11083` | `src/__tests__/goals/annual-reset-service.test.ts` |
| 2 (GREEN) | annual-reset-service.ts implementation | `af951dd9` | `src/app/goals/services/annual-reset-service.ts` |

## What Was Built

### `rollover-math.ts` (pure, no I/O)

- **`computeRolledLadder(priorRow)`** — applies the D3 shift to all 12 metric prefixes × 4 suffixes (48 keys). Rule: `new_current=prior_year1`, `new_year1=prior_year2`, `new_year2=prior_year3`, `new_year3=prior_year3` (extrapolate). Missing/null/undefined → 0.
- **`computeRolledPlanDates(priorYear1EndDate, yearType, yearStartMonth)`** — computes `planStartDate`, `year1EndDate`, `planEndDate` for the new year using `getFiscalYearStartDate`/`getFiscalYearEndDate`. FY (ysm=7): prior 2026-06-30 → start 2026-07-01, year1End 2027-06-30, planEnd 2029-06-30. CY (ysm=1): prior 2026-12-31 → start 2027-01-01, year1End 2027-12-31, planEnd 2029-12-31.

### `annual-reset-service.ts`

- **`AnnualResetService.executeAnnualReset({ businessId, businessesId, userId, yearStartMonth })`** (NO `priorRow` param)
  1. Self-reads prior `business_financial_goals` row (`.select('*').eq('business_id', businessId).maybeSingle()`)
  2. Derives `endingFY` from `priorRow.year1_end_date`
  3. Calls `captureAnnualResetSnapshot` — **ABORT with zero writes if snapshot fails**
  4. Builds rolled ladder + dates + `quarterly_targets: {}` + `is_extended_period: false`, `year1_months: 12`, `current_year_remaining_months: 0`
  5. `UPDATE business_financial_goals` (preserving `year_type`)
  6. Carry-forward: queries `strategic_initiatives` WHERE `status IN ('not_started','in_progress','on_hold')` AND `business_id = businessesId` → UPDATE with `status='not_started'`, `selected=false`, `fiscal_year=newFY`
  7. Returns `{ success, snapshotId, newFY, carriedForwardCount }`

## Test Coverage

- 10 unit tests for `rollover-math.ts` (ladder shift, null coercion, FY/CY boundaries)
- 14 unit tests for `annual-reset-service.ts` (snapshot gate, self-read, happy path, initiative carry-forward)
- **24/24 passing**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] UTC-offset date shift on AEST machines**
- **Found during:** Task 2 GREEN (1 test failing: `plan_start_date` showed `2026-06-30` instead of `2026-07-01`)
- **Issue:** `getFiscalYearStartDate` returns a local-time `Date`. `.toISOString().slice(0,10)` converts to UTC first, so `new Date(2026, 6, 1)` (July 1 local AEST) serialized to `2026-06-30T14:00:00Z` → sliced to `2026-06-30`.
- **Fix:** Added `toLocalDateString(d)` helper using `d.getFullYear()`, `d.getMonth()+1`, `d.getDate()` — formats using local date parts, no UTC conversion.
- **Files modified:** `src/app/goals/services/annual-reset-service.ts`
- **Commit:** `af951dd9`

**2. [Rule 3 - Blocking] vitest vi.mock hoisting issue**
- **Found during:** Task 2 RED (module mock error: "Cannot access 'mockCaptureAnnualResetSnapshot' before initialization")
- **Issue:** `vi.mock()` factory is hoisted to the top of the file by vitest's transform. A top-level `const mockCaptureAnnualResetSnapshot = vi.fn()` is not yet initialized when the factory runs.
- **Fix:** Changed to `vi.hoisted(() => vi.fn())` so the mock fn is created during the hoist phase and available to the factory.
- **Files modified:** `src/__tests__/goals/annual-reset-service.test.ts`
- **Commit:** Updated in same GREEN commit (`af951dd9`)

## Known Stubs

None — all exported functions are fully implemented with correct behavior.

## Acceptance Criteria Verification

- `grep -q "captureAnnualResetSnapshot" annual-reset-service.ts` — PASS
- `executeAnnualReset` has NO `priorRow` param — PASS
- Service self-reads with `.from('business_financial_goals').select('*')` before any `.update(` — PASS (line 100 vs line 183)
- `quarterly_targets` set to `{}` — PASS
- `selected: false` in carry-forward — PASS
- Snapshot failure → zero goals writes (test proves it) — PASS
- Completed/cancelled initiatives NOT mutated (test proves 0 carries when 0 incomplete) — PASS
- `npx vitest run rollover-math.test.ts annual-reset-service.test.ts` — 24/24 PASS
- `npx tsc --noEmit` clean for new files — PASS

## Self-Check: PASSED

Files created:
- `src/app/goals/utils/rollover-math.ts` — FOUND
- `src/app/goals/services/annual-reset-service.ts` — FOUND
- `src/__tests__/goals/rollover-math.test.ts` — FOUND
- `src/__tests__/goals/annual-reset-service.test.ts` — FOUND

Commits:
- `1229deb0` — FOUND
- `ca0a821d` — FOUND
- `66f11083` — FOUND
- `af951dd9` — FOUND
