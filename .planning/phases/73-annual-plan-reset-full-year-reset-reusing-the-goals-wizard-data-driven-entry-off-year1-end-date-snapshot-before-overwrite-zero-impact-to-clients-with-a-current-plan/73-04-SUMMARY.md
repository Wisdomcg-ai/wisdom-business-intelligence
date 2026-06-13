---
phase: 73-annual-plan-reset
plan: "04"
subsystem: goals-wizard
tags: [annual-reset, goals, quarterly-review, rollover, idempotent-guard]
dependency_graph:
  requires: [73-02, 73-03]
  provides: [reset-mode-wiring, rollover-on-arrival]
  affects: [src/app/goals/page.tsx, src/app/goals/hooks/useStrategicPlanning.ts]
tech_stack:
  added: []
  patterns:
    - resetRanRef guard (useRef(false)) for StrictMode-safe once-per-mount execution
    - localBusinessesId local-var pattern (mirrors localFiscalYearStart) for sync capture before async setState
    - const→let destructure to allow re-assignment after rollover re-load
key_files:
  modified:
    - src/app/goals/hooks/useStrategicPlanning.ts
    - src/app/goals/page.tsx
  created: []
decisions:
  - "Direct deep import from @/app/quarterly-review/utils/annual-reset-entry (leaf — zero imports, no circular dep). No barrel/index re-export needed."
  - "getPlanningQuarter imported from @/app/quarterly-review/types (returns {quarter, year} needed for calculateQuarters call). quarterly-review/types has no goals imports, so one-way dependency only."
  - "Pre-existing plan-period-banner.test.tsx failure (1/88) is out of scope — date-offset bug unrelated to 73-04 changes, confirmed identical before and after stash."
metrics:
  duration: ~20m
  completed: "2026-06-13"
  tasks_completed: 1
  tasks_total: 2
  tasks_awaiting_human: 1
---

# Phase 73 Plan 04: Rollover Mode Wiring (resetMode → useStrategicPlanning) Summary

Thread `?reset=annual` query param from `/goals` page into `useStrategicPlanning` hook with a once-per-mount gated call to `executeAnnualReset` — using `detectAnnualResetState` to guard against rolling clients who don't actually need it, and a `resetRanRef` guard against StrictMode double-invoke.

## Tasks

### Task 1: Thread resetMode COMPLETE

**Commit:** `20d3c762`

**Files modified:**
- `src/app/goals/page.tsx` — derives `resetMode = searchParams?.get('reset') === 'annual'` and passes `{ resetMode }` as second arg to `useStrategicPlanning`
- `src/app/goals/hooks/useStrategicPlanning.ts` — extended signature, added reset gate block

**Key changes in the hook:**

1. Four new imports added (Phase 73-04 comment block):
   - `calculateQuarters` from `../utils/quarters`
   - `getPlanningQuarter` from `@/app/quarterly-review/types`
   - `detectAnnualResetState` from `@/app/quarterly-review/utils/annual-reset-entry`
   - `annualResetService` from `../services/annual-reset-service`

2. Signature extended to `useStrategicPlanning(overrideBusinessId?, { resetMode = false } = {})`

3. `resetRanRef = useRef(false)` added at hook top (StrictMode-safe once-per-mount guard)

4. `localBusinessesId` local variable introduced (mirrors `localFiscalYearStart` pattern) — captured synchronously at each `setBusinessesId()` call site before async state flush

5. `const` destructuring of `loadFinancialGoals` result changed to `let` to allow re-assignment after rollover

6. Annual reset gate block inserted after `loadFinancialGoals` returns, before any state setters:
   - Only runs when `resetMode && !resetRanRef.current`
   - Computes `planningQuarterStart` via `getPlanningQuarter(loadedYearType)` + `calculateQuarters`
   - Calls `detectAnnualResetState` — only proceeds to rollover if state is `'needs-reset'`
   - `executeAnnualReset({ businessId: bizId, businessesId: localBusinessesId, userId, yearStartMonth: localFiscalYearStart })`
   - Re-loads goals row on success so rest of effect applies rolled values
   - Logs and continues on failure (non-fatal for UI — the service itself aborts safely)

**Verification:**
- `grep -q "reset') === 'annual'" src/app/goals/page.tsx` → PASS
- `grep -q "executeAnnualReset" src/app/goals/hooks/useStrategicPlanning.ts` → PASS
- `grep -q "detectAnnualResetState" src/app/goals/hooks/useStrategicPlanning.ts` → PASS
- `grep -q "resetRanRef" src/app/goals/hooks/useStrategicPlanning.ts` → PASS
- `npx madge --circular ... useStrategicPlanning.ts` → `No circular dependency found!`
- `npx tsc --noEmit` → clean (no errors in modified files)
- `npx vitest run src/__tests__/goals` → 87/88 pass (1 pre-existing failure in plan-period-banner date-offset, out of scope)

### Task 2: Human-verify reset end-to-end — APPROVED ✅ (2026-06-13)

`checkpoint:human-verify` gate. Matt ran the dry-run against the Vercel preview (PR #290) using the read-only [`73-04-DRY-RUN-RUNBOOK.md`](73-04-DRY-RUN-RUNBOOK.md): Precision (year1_end 2026-06-30) rolled correctly (revenue_year1 3.4M→4.5M, FY27 dates, `annual_reset_FY2026` snapshot, 22 initiatives carried) and the already-planned controls (Armstrong, Fit2Shine — year1_end 2027-06-29) were untouched. Signalled **approved**. Phase proceeded to 73-05 + 73-06.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no placeholder data or stub values introduced.

## Self-Check

- [x] Task 1 commit `20d3c762` exists: `git log --oneline | grep 20d3c762`
- [x] `src/app/goals/hooks/useStrategicPlanning.ts` modified (59 new lines)
- [x] `src/app/goals/page.tsx` modified (resetMode wired)
- [x] No circular dependency introduced
- [x] TypeScript clean

## Self-Check: PASSED
