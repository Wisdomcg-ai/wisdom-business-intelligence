---
phase: 59-forecast-seed-from-prior-fy
plan: "04"
subsystem: forecast
tags: [integration-tests, verification, tdd, rules-of-hooks-fix]
dependency_graph:
  requires: [forecast-seed-service, POST /api/forecast/seed-from-prior, dual-CTA-empty-state]
  provides: [59-integration-tests, 59-VERIFICATION.md]
  affects: []
tech_stack:
  added: []
  patterns: [integration-test-no-mocks, vitest-describe-groups, real-function-pipeline]
key_files:
  created:
    - src/lib/services/__tests__/forecast-seed-service.integration.test.ts
    - .planning/phases/59-forecast-seed-from-prior-fy/59-VERIFICATION.md
  modified:
    - src/app/finances/forecast/page.tsx
decisions:
  - "Integration test covers seam between 59-01 transformer and convertAssumptionsToPLLines (the two-step chain 59-02 runs in production)"
  - "Sparse revenue line (6-of-12 months) correctly stays sparse through full pipeline — test assertion updated from 12-key to range-validity check"
  - "handleSeedForecast useCallback moved before early returns in page.tsx (Rules of Hooks fix)"
metrics:
  duration_seconds: 1440
  completed_date: "2026-05-11"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
  tests_written: 23
---

# Phase 59 Plan 04: Integration Tests + Verification — Summary

## One-liner

23-test integration suite exercises seedForecastFromPrior → convertAssumptionsToPLLines pipeline with no mocks (month-range alignment, $600k sum preservation, multi-year carry, idempotency, CapEx/Goals exclusion, expectedMonths shift, plannedHires clearing); 59-VERIFICATION.md maps all 7 PHASE.md criteria to evidence; Rules-of-Hooks lint error in page.tsx fixed as auto-fix.

## What Was Built

### `src/lib/services/__tests__/forecast-seed-service.integration.test.ts`

23 tests across 7 groups exercising the exact two-step chain `59-02`'s route runs in production:

- **Group A** (3 tests): Month-range alignment — after seed+pl-lines, zero FY26 keys in output, all keys within FY27 range, dense revenue line has exactly 12 keys
- **Group B** (2 tests): Sum preservation — "Management Consulting" $50k × 12 = $600k round-trips within $1; "Advisory Services" sparse $120k round-trips within $1
- **Group C** (3 tests): Multi-year carry — `forecastDuration=2` passes through, 24-month range keys are all within FY27+FY28, zero FY26 leakage
- **Group D** (2 tests): Idempotency — `isForecastSeedable(seededAssumptions, plLines.length)` returns `false` after pipeline; also returns `false` based on `revenue.lines.length > 0` alone
- **Group E** (5 tests): CapEx + Goals exclusion — seeded assumptions have `capex = {items:[]}` and no `goals` key; pl_lines have no 'CapEx' or 'Goals' category; no 'Depreciation' line generated
- **Group F** (3 tests): expectedMonths integration — adhoc `expectedMonths` shifted to `['2026-10', '2027-03']`; pl_line has values at shifted months, NOT at `'2025-10'`/`'2026-03'`; total equals $24,000
- **Group G** (4 tests): plannedHires cleared — `plannedHires === []` in seeded assumptions; wages line present from existingTeam; Bob's $80k/yr salary absent from wage calculations; existingTeam (Sarah + James) preserved

**Fixture:** `makeFY26Fixture()` — JDS-style portfolio business with 2 revenue lines, 1 COGS line, 3 opex lines (fixed/variable/adhoc), 2 existing team members + 1 planned hire, capex item, goals, version 11.

### `.planning/phases/59-forecast-seed-from-prior-fy/59-VERIFICATION.md`

113-line verification document:
- 7-row success-criteria table mapping each PHASE.md criterion to concrete evidence + status
- Test run summary: 82 Phase 59 tests (36 + 23 + 23), all pass
- Console.error budget table: 4 (below Phase 46 baseline of 5, no regression)
- 3-row critical decisions audit (D1/D2/D3) with grep evidence
- 3-row scope-correction audit with grep evidence
- 15-item manual smoke checklist for JDS preview deploy
- Pre-existing issues documented (untracked diag scripts causing build failure, plan-period-banner test)

### `src/app/finances/forecast/page.tsx` (lint fix)

**[Rule 1 — Bug] Moved `handleSeedForecast` useCallback before early returns.**

59-03 placed the `useCallback` after 3 early returns (`!mounted || isLoading`, `!businessId`, `!forecast`), violating React Rules of Hooks. ESLint error: `React Hook "useCallback" is called conditionally.` Fixed by moving the entire `handleSeedForecast` definition to before the first early return. The handler uses `forecast?.fiscal_year` with optional chaining so it is safe to call when `forecast` is null. Lint now exits 0.

## Quality Gates Summary

| Gate | Exit Code | Notes |
|---|---|---|
| `npx tsc --noEmit` (app source only) | 0 | 6 errors in untracked diag scripts/stray copies — not in committed code |
| `npx vitest run` (Phase 59 files) | 0 | 82 tests, all pass |
| `npx vitest run` (full suite) | 1 | 1 pre-existing failure (plan-period-banner date test — confirmed before Phase 59 changes) |
| `npm run lint` | 0 | Clean after Rules-of-Hooks fix |
| `npm run build` | 1 | Fails only on untracked `scripts/diag-jds-pl-summary-recon.ts` — pre-existing, not deployed to Vercel |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `handleSeedForecast` useCallback placed after early returns (Rules of Hooks violation)**

- **Found during:** Task 2 (lint quality gate — `npm run lint exit: 1`)
- **Issue:** 59-03 added `handleSeedForecast = useCallback(...)` after 3 `if (!x) return` early returns in `page.tsx`, violating React Rules of Hooks
- **Fix:** Moved `handleSeedForecast` to before the first early return block (line ~394). Handler uses `forecast?.fiscal_year` with optional chaining — safe to define before `forecast` is guaranteed non-null.
- **Files modified:** `src/app/finances/forecast/page.tsx`
- **Commit:** `63cb396e`

**2. [Rule 1 — Bug] Sparse revenue line assertion adjusted**

- **Found during:** Task 1 (integration test execution — 1 test failed)
- **Issue:** Group A test assumed all revenue lines would have 12 keys after `convertAssumptionsToPLLines`. But "Advisory Services" has only 6 prior-FY keys (sparse design), and the converter correctly preserves sparsity.
- **Fix:** Split the test into (a) dense line check: "Management Consulting" has exactly 12 keys, (b) range-validity check: all revenue line keys are in FY27 range (covers both dense and sparse). This is a fixture-understanding fix, not a production code fix.
- **Files modified:** `src/lib/services/__tests__/forecast-seed-service.integration.test.ts`
- **Commit:** `f2f16160` (fix was inline during test authoring)

## Known Stubs

None. Integration test uses real `seedForecastFromPrior` and real `convertAssumptionsToPLLines` (no mocks on either). VERIFICATION.md has no placeholder tokens. The only PENDING item is the manual smoke checklist, which requires a deployed preview and is explicitly called out as PENDING-SMOKE (operator action).

## Self-Check: PASSED

- `src/lib/services/__tests__/forecast-seed-service.integration.test.ts` — FOUND
- `.planning/phases/59-forecast-seed-from-prior-fy/59-VERIFICATION.md` — FOUND
- Commit `f2f16160` (integration tests RED+GREEN) — FOUND in git log
- Commit `63cb396e` (VERIFICATION.md + lint fix) — FOUND in git log
- 23 integration tests passing — VERIFIED
- Lint exit 0 — VERIFIED
- No placeholder tokens in VERIFICATION.md — VERIFIED (`grep -c "{captured\|{date\|{N}" = 0`)
- All 7 PHASE.md criteria audited — VERIFIED (9 PASS/FAIL/PENDING-SMOKE mentions)
