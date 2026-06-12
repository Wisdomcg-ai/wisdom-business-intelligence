---
phase: 73-annual-plan-reset
plan: "03"
subsystem: quarterly-review/annual-reset-entry
tags: [annual-reset, data-driven, entry-detection, read-only, tdd, armstrong-guard]
dependency_graph:
  requires:
    - calculateQuarters (src/app/goals/utils/quarters.ts)
    - getPlanningQuarter (src/app/quarterly-review/types/index.ts)
  provides:
    - detectAnnualResetState (pure decision function)
    - AnnualResetState union type
    - annual-reset CTA on quarterly-review landing
  affects:
    - src/app/quarterly-review/page.tsx (CTA region, goals query)
    - src/app/quarterly-review/utils/annual-reset-entry.ts (new)
    - src/__tests__/quarterly-review/annual-reset-entry.test.ts (new)
tech_stack:
  added: []
  patterns:
    - Pure decision function with UTC date-only comparison (no TZ drift)
    - useMemo for planningQuarterStart + resetState derivation
    - Loading guard: year1EndDate=undefined defaults to normal-review (no flash)
key_files:
  created:
    - src/app/quarterly-review/utils/annual-reset-entry.ts
    - src/__tests__/quarterly-review/annual-reset-entry.test.ts
  modified:
    - src/app/quarterly-review/page.tsx
decisions:
  - "UTC getters (getUTCFullYear/Month/Date) used in toDateOnly() to prevent AEST/NZST timezone offset from shifting calendar dates — e.g. '2026-06-30T23:59:59Z' must always resolve to 2026-06-30"
  - "year1EndDate state starts as undefined (not null) so the loading guard distinguishes 'not yet loaded' from 'plan has no date' — prevents reset CTA flash on page load"
  - "Legacy isQ4 annual review button retained but gated to normal-review state only — it will not show when resetState=needs-reset (Plan 05 removes it entirely after end-to-end verification)"
  - "Reset CTA uses <a href> (not router.push) for the /goals?reset=annual route so it works correctly with the coach-view path prefix from getPath()"
metrics:
  duration_minutes: 25
  completed_date: "2026-06-13"
  tasks_completed: 2
  files_changed: 3
  tests_added: 12
---

# Phase 73 Plan 03: Annual-Reset Data-Driven Entry — Summary

**One-liner:** Pure `detectAnnualResetState` function (UTC date-only comparison, 3 states) wired into the quarterly-review landing as a read-only CTA, with Armstrong/Fit2Shine explicitly guarded to `normal-review`.

## What Was Built

### Task 1: detectAnnualResetState + tests (TDD RED → GREEN)

Created `src/app/quarterly-review/utils/annual-reset-entry.ts` exporting:
- `AnnualResetState` union type: `'initial-setup' | 'needs-reset' | 'normal-review'`
- `detectAnnualResetState({ planningQuarterStart, year1EndDate })` — pure, side-effect-free

Decision rule (locked):
1. `year1EndDate == null/undefined` → `'initial-setup'` (JVJ — no plan set up yet)
2. `planningQuarterStart (UTC date-only) > year1EndDate (UTC date-only)` → `'needs-reset'` (FY26 clients)
3. Otherwise → `'normal-review'` (Armstrong, Fit2Shine, any within-year quarter)

12 tests covering: initial-setup (null + undefined), needs-reset (FY26, Oh Nine CY Q1 2027), normal-review (Armstrong/Fit2Shine CRITICAL assertion, Oh Nine Q4 within year, mid-year), boundary (start === year1End → normal-review), and time-component stripping.

**Key implementation detail:** UTC getters (`getUTCFullYear/Month/Date`) used in `toDateOnly()` so `2026-06-30T23:59:59Z` is always calendar date 2026-06-30 regardless of machine timezone.

### Task 2: Wire read-only detection into landing CTA

Modified `src/app/quarterly-review/page.tsx`:
1. Extended goals query: `.select('year_type, year1_end_date')`
2. New `year1EndDate` state (starts `undefined` = loading guard)
3. `planningQuarterStart` computed via `calculateQuarters(yearType, year).find(q => q.id === 'q'+quarter)?.startDate`
4. `resetState` computed via `detectAnnualResetState`; defaults to `'normal-review'` while loading
5. CTA region replaced with three branches:
   - `needs-reset`: primary "Set your FY{year} Annual Plan" → `/goals?reset=annual` + secondary quarterly review button
   - `initial-setup`: primary "Set up your Annual Plan" → `/goals`
   - `normal-review`: unchanged quarterly CTA + "Adjust annual plan" secondary link + legacy Q4 annual button (gated)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] UTC getters required in toDateOnly to prevent timezone drift**
- **Found during:** Task 1 GREEN phase
- **Issue:** `new Date('2026-06-30T23:59:59Z')` with local getters (`getFullYear/Month/Date`) returns July 1 in AEST (+10) and NZST (+12/+13) timezones, causing a false-positive `needs-reset` when start date is `2026-07-01`
- **Fix:** Replaced local getters with UTC getters (`getUTCFullYear/Month/Date`) in `toDateOnly()` — the test `ignores time on year1EndDate — still needs-reset when start is next day` caught this during the GREEN run
- **Files modified:** `src/app/quarterly-review/utils/annual-reset-entry.ts`
- **Commit:** baadd821 (folded into GREEN commit)

## Verification Results

- `npx vitest run src/__tests__/quarterly-review/annual-reset-entry.test.ts` — 12/12 pass
- `npx tsc --noEmit` — 0 errors in page.tsx; 0 errors total in src/
- `grep -q "detectAnnualResetState" page.tsx` — PASS
- `grep -q "calculateQuarters" page.tsx` — PASS
- `grep -q "year1_end_date" page.tsx` — PASS
- `grep -q "reset=annual" page.tsx` — PASS
- No `.update/.insert/.upsert/.delete` added to page.tsx — PASS (read-only constraint honored)

## Commits

| Hash | Type | Description |
|------|------|-------------|
| a3f9ff46 | test | RED: entry detection 3 states + already-planned guard |
| baadd821 | feat | GREEN: detectAnnualResetState (UTC date-only, 12 tests pass) |
| 58372ba4 | feat | Task 2: wire read-only detection into landing CTA |

## Self-Check: PASSED

- `src/app/quarterly-review/utils/annual-reset-entry.ts` — FOUND
- `src/__tests__/quarterly-review/annual-reset-entry.test.ts` — FOUND
- Commit a3f9ff46 — FOUND (git log confirms)
- Commit baadd821 — FOUND
- Commit 58372ba4 — FOUND
