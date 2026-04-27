---
phase: 43-plan-period-as-explicit-state-replace-inference-based-extend
plan: "03"
subsystem: goals-wizard
tags: [tests, vitest, regression-fence, coach-owner-equivalence, persistence]
dependency_graph:
  requires:
    - .planning/phases/42-plan-period-as-explicit-state-replace-inference-based-extend/42-01-SUMMARY.md
    - .planning/phases/42-plan-period-as-explicit-state-replace-inference-based-extend/42-02-SUMMARY.md
  provides:
    - src/__tests__/goals/suggest-plan-period.test.ts
    - src/__tests__/goals/derive-period-info.test.ts
    - src/__tests__/goals/plan-period-banner.test.tsx
    - src/__tests__/goals/plan-period-coach-owner-equivalence.test.ts (CI regression fence for REQ-42-06)
    - src/__tests__/goals/plan-period-persistence.test.ts (CI regression fence for REQ-42-07)
key_decisions:
  - Source-code-reading regression test approach used for REQ-42-06 — readFileSync + grep assertion that survives even if React renderHook mocking becomes impossible. This is the durable fence.
  - Test the helper's actual contract, not the prose narrative. derivePeriodInfo for Apr 2026→Jun 2027 returns year1Months=15 per inclusive-end formula, even though Fit2Shine narrative said "14 months" — semantic ambiguity documented, helper contract remains source of truth.
  - vitest.config.ts updated with oxc.jsx runtime override for Banner/Modal component tests
  - Vercel preview smoke test approved by user on Fit2Shine (businesses.id 389167dc-acb9-4a56-a594-aa77eae15745) — original 2026-04-24 incident reproduced + resolved
metrics:
  duration: ~17 minutes (autonomous tasks)
  completed: "2026-04-27T06:15:00Z"
  tasks_completed: 6
  tasks_total: 6
  files_created: 5
  test_count: 38
  full_suite_count: 299
---

# Phase 42 Plan 03: Test Coverage + Smoke Verification Summary

**One-liner:** Five vitest test files (38 assertions) covering Phase 42's pure helpers, Banner+Modal components, coach/owner equivalence regression fence, and persistence round-trip — plus user-approved Vercel preview smoke test on Fit2Shine reproducing + resolving the original 2026-04-24 incident.

## What Was Built

### Tasks 1-5 — Test files (autonomous, 38/38 pass)

| Task | File | Tests | Commit |
|------|------|-------|--------|
| 1 | suggest-plan-period.test.ts | 10 | `b2011de` |
| 2 | derive-period-info.test.ts | 7 | `2767b8f` |
| 3 | plan-period-banner.test.tsx (Banner + Modal) | 13 | `a8ad838` |
| 4 | plan-period-coach-owner-equivalence.test.ts | 4 | `9f95bc3` + `bab8a4d` |
| 5 | plan-period-persistence.test.ts | 4 | `99b6cb7` |
| docs | STATE.md / ROADMAP.md progress | n/a | `dc2f194` |

**Full suite:** 299/299 pass, zero unhandled errors. No new tsc errors introduced.

### Task 6 — Vercel preview smoke test on Fit2Shine

**Status:** Approved by user 2026-04-27.

**What was verified:** Coach login → `/coach/clients/389167dc-acb9-4a56-a594-aa77eae15745/goals` (Fit2Shine). Step 1 displays the `PlanPeriodBanner` with the correct date range and Year 1 month count derived from the persisted `plan_start_date` / `year1_end_date` columns, not from `new Date()`. The 2026-04-24 incident (Year 1 = mostly-past FY26 quarters because coach view was excluded from extended-period detection) is resolved — Year 1 row now shows the combined label backed by persisted dates.

## Regression Fences Live in CI

Two of the test files exist primarily to lock in Phase 42's user-visible contracts so future refactors can't silently undo them:

1. **plan-period-coach-owner-equivalence.test.ts** — readFileSync of useStrategicPlanning.ts and asserts the literal string `ownerUser === user.id` is absent. Survives any future React rendering changes because it reads source text directly. If anyone reintroduces the role guard, CI fails.

2. **plan-period-persistence.test.ts** — round-trip through FinancialService mock: save planPeriod → reload → identical Date values. Catches regressions where the new columns get silently dropped from save/load (the same bug class as the Phase 14 silent-drop bug fixed in Plan 42-01 Task 5).

## Deviations from Plan

### Helper contract vs narrative ambiguity (T2)
- **Plan said:** Test derivePeriodInfo for Apr 2026 → Jun 2027 input.
- **Found:** Helper returns `year1Months=15` per inclusive-end month-diff formula. ROADMAP narrative said "14 months" for the Fit2Shine example.
- **Decision:** Test the helper's actual contract (15). Document the ambiguity in this SUMMARY so future devs understand the semantics and don't silently change the helper to match prose.

### Component test runtime (T3)
- **Plan said:** Add Banner + Modal component tests using @testing-library/react.
- **Found:** Default vitest jsx runtime didn't pick up the components cleanly.
- **Auto-fix:** Added `vitest.config.ts` override for oxc.jsx runtime + minor package.json/package-lock.json regeneration. Documented in commit `a8ad838`.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `b2011de` | test(42-03): suggestPlanPeriod unit tests (10 cases) |
| 2 | `2767b8f` | test(42-03): derivePeriodInfo unit tests (7 cases) |
| 3 | `a8ad838` | test(42-03): PlanPeriodBanner + PlanPeriodAdjustModal component tests + vitest config |
| 4 | `9f95bc3` | test(42-03): coach/owner equivalence regression fence — REQ-42-06 |
| 4 | `bab8a4d` | test(42-03): tighten coach/owner source-code sentinel assertions |
| 5 | `99b6cb7` | test(42-03): planPeriod persistence round-trip — REQ-42-07 |
| docs | `dc2f194` | docs(42-03): record Tasks 1-5 progress; checkpoint at Task 6 (smoke test) |

## Self-Check: PASSED

- [x] All 6 tasks complete
- [x] 38/38 goals tests pass; 299/299 full suite passes
- [x] Both regression fences (REQ-42-06, REQ-42-07) live in CI
- [x] Vercel preview smoke test approved on Fit2Shine — original incident reproduced + resolved
- [x] Phase 42 ready to mark [COMPLETE]

---

*Phase: 42-plan-period-as-explicit-state-replace-inference-based-extend*
*Plan 03 completed: 2026-04-27*
