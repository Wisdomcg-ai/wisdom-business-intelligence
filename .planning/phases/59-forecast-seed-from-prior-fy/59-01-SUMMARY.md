---
phase: 59-forecast-seed-from-prior-fy
plan: "01"
subsystem: forecast
tags: [pure-service, transformer, unit-tests, tdd]
dependency_graph:
  requires: []
  provides: [forecast-seed-service]
  affects: [59-02-api-route, 59-03-empty-state-ui]
tech_stack:
  added: []
  patterns: [structuredClone-for-purity, MONTH_KEY_REGEX-validation, TDD-red-green]
key_files:
  created:
    - src/lib/services/forecast-seed-service.ts
    - src/lib/services/__tests__/forecast-seed-service.test.ts
  modified: []
decisions:
  - "plannedHires cleared (not shifted) per operator decision — year-specific hire plans reset for new FY"
  - "forecastDuration copied verbatim from prior forecast row — coaches reforecast same horizon"
  - "opex.expectedMonths shifted +1 year — adhoc schedule must reference months in target FY"
  - "seasonalitySource fixture fixed from 'override' (invalid) to 'manual' during GREEN (auto-fix, Rule 1)"
metrics:
  duration_seconds: 222
  completed_date: "2026-05-11"
  tasks_completed: 2
  files_created: 2
  tests_written: 36
---

# Phase 59 Plan 01: Forecast Seed Service — Summary

## One-liner

Pure `seedForecastFromPrior()` transformer with `shiftMonthKeys` + `isForecastSeedable` helpers: deep-clones prior-FY ForecastAssumptions, strips goals/capex/plannedSpends, shifts all YYYY-MM month keys +1 year, clears plannedHires, and shifts opex.expectedMonths — all 36 unit tests green, zero I/O.

## What Was Built

### `src/lib/services/forecast-seed-service.ts`

Exports:
- `shiftMonthKeys(src, yearDelta)` — shifts `Record<string, number>` YYYY-MM keys by yearDelta years; malformed keys silently dropped via `/^\d{4}-\d{2}$/` regex guard (research pitfall 2)
- `isForecastSeedable(assumptions, plLineCount)` — idempotency gate: returns `true` iff `assumptions.revenue.lines.length === 0` AND `plLineCount === 0`; null/undefined assumptions treated as seedable (research pitfall 4)
- `seedForecastFromPrior(priorAssumptions, targetFiscalYear, priorForecastDuration)` — deep-clones via `structuredClone`, strips 5 sections, shifts 6 month-key fields, clears plannedHires, shifts expectedMonths, returns `SeedResult`
- `SeedResult` interface — `{ assumptions: ForecastAssumptions; forecastDuration: number }`

### `src/lib/services/__tests__/forecast-seed-service.test.ts`

36 tests across 8 groups:
- **Group A** (5 tests): `shiftMonthKeys` — happy path, empty, undefined, malformed-key drop, delta=2
- **Group B** (11 tests): stripping — goals/subscriptions/priorYearByMonth absent, capex/plannedSpends empty, plannedHires cleared, existingTeam/ratios preserved, opex length preserved, fiscalYearStart/industry/employeeCount preserved
- **Group C** (6 tests): month-key shifting — revenue year1/2/3Monthly, cogs year1/2/3Monthly, year2Quarterly/year3Quarterly → undefined, sparsity preserved
- **Group D** (2 tests): opex.expectedMonths shifting — adhoc lines shifted, lines without expectedMonths unchanged
- **Group E** (3 tests): metadata — createdAt is fresh, updatedAt equals createdAt, version preserved
- **Group F** (2 tests): forecastDuration passthrough — 1 and 2
- **Group G** (5 tests): isForecastSeedable — null/undefined/empty/non-empty/plLineCount>0
- **Group H** (2 tests): purity — no mutation of input, two calls produce structurally identical output

## Operator Decisions Honored

| Decision | Implementation |
|---|---|
| `team.plannedHires` CLEARED | `next.team = { ...next.team, plannedHires: [] }` |
| `forecastDuration` COPIED verbatim | `return { assumptions: next, forecastDuration: priorForecastDuration }` |
| `opex.expectedMonths` SHIFTED +1 year | filter with MONTH_KEY_REGEX, then `parseInt(year) + 1` |

## Research Pitfalls Addressed

| Pitfall | Mitigation |
|---|---|
| Pitfall 2: malformed YYYY-MM keys | `MONTH_KEY_REGEX = /^\d{4}-\d{2}$/` — invalid keys silently dropped in both `shiftMonthKeys` and `expectedMonths` shift |
| Pitfall 4: idempotency check blocking legit seeds | `isForecastSeedable` checks `revenue.lines.length`, not `assumptions !== null` |

## Purity Invariant

```
grep -v "^[[:space:]]*//" src/lib/services/forecast-seed-service.ts | \
  grep -v "^[[:space:]]*\*" | \
  grep -E "fetch|supabase|createClient|process\.env"
# → CLEAN (zero matches in non-comment code)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed invalid `seasonalitySource: 'override'` in test fixture**

- **Found during:** Task 2 (GREEN — TypeScript typecheck revealed the issue)
- **Issue:** Test fixture used `seasonalitySource: 'override'` which is not in the `'xero' | 'manual' | 'industry_default'` union type defined in `RevenueAssumptions`
- **Fix:** Changed fixture value to `'manual'` (a valid union member)
- **Files modified:** `src/lib/services/__tests__/forecast-seed-service.test.ts`
- **Commit:** `02aa9b90` (included in GREEN commit alongside implementation)

No architectural deviations. No additional tests were needed — the 36 tests were sufficient to drive the implementation without surfacing additional edge cases.

## Known Stubs

None. This plan is a pure service with no UI rendering, no hardcoded placeholders, and no stub data. All outputs are computed from inputs.

## Self-Check: PASSED

- `src/lib/services/forecast-seed-service.ts` — FOUND
- `src/lib/services/__tests__/forecast-seed-service.test.ts` — FOUND
- `.planning/phases/59-forecast-seed-from-prior-fy/59-01-SUMMARY.md` — FOUND
- Commit `a9ec1633` (RED tests) — FOUND in git log
- Commit `02aa9b90` (GREEN implementation) — FOUND in git log
- 36 tests passing — VERIFIED
- TypeScript clean on service files — VERIFIED
- Purity invariant (no fetch/supabase/process.env) — VERIFIED
