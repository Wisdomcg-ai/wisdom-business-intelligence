---
phase: 72
plan: 01
subsystem: forecast-wizard
tags: [diagnosis, read-only, extended-period, step-3, armstrong]
dependency-graph:
  requires:
    - 68-04 (Phase 68 B15 deriveCurrentRemainderColumn — same root cause family, goals-wizard side)
  provides:
    - plan-period-aware-step-3-fix-scope (for 72-02)
  affects:
    - src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx (no modification this plan; 72-02 will modify)
tech-stack:
  added: []
  patterns:
    - Read-only investigation pattern (no src/ modification)
    - File:line evidence pinning for every claim
    - Same-family audit across sibling components (Steps 4-8)
key-files:
  created:
    - .planning/phases/72-.../72-01-PLAN.md
    - .planning/phases/72-.../72-DIAGNOSIS.md
  modified: []
decisions:
  - Extract shared util (getPlanY1MonthKeys + getActualMonthKeysForPlanY1) to src/lib/utils/plan-period.ts in 72-02 — sibling to Phase 68 B15's deriveCurrentRemainderColumn, NOT a refactor of it
  - PlanPeriod added as new ForecastWizardState slice (not on BusinessProfile) — separation reflects source-of-truth (business_financial_goals vs business_profiles)
  - Step 8 GrowthPlan summary-aggregation under-count deferred to follow-up phase — out of scope for 72
  - Steps 4-7 audited; no same-family bug found (different data models, no FY-aligned per-month grid)
  - Correction to planner's prompt: extended-period columns live on business_financial_goals (NOT business_profiles); plan_start_date also on strategic_plans
metrics:
  duration: 4m 11s
  completed: 2026-05-31
  files_inspected: 12
  files_modified: 0
  src_modifications: 0
---

# Phase 72 Plan 01: Diagnose Step 3 Extended-Period Bug Summary

Read-only investigation produced `72-DIAGNOSIS.md` naming the root cause as **"wizard-blind-to-plan-period"** — Step 3 hardcodes a 12-month current-FY window without consulting `is_extended_period` / `plan_start_date` / `year1_months` / `year1_end_date`, which are returned by `/api/goals` but discarded by `ForecastWizardV4.tsx`.

## What Shipped

- `72-01-PLAN.md` — 5-task investigation plan, autonomous, wave 1, zero requirements.
- `72-DIAGNOSIS.md` — root cause, evidence (file:line × 5), fix scope (4 phases), same-family audit (Steps 4-8), verification checklist for 72-02.

## Root Cause (one-liner)

`Step3RevenueCOGS.tsx:311` derives `monthKeys` from `fiscalYear-1` (12 hardcoded months of the current FY) and `:545-547` computes `remainingMonthsCount = 12 - currentYTD.months_count` — neither consults plan-period boundaries that exist in DB and API but are discarded in the wizard's goals-loader (`ForecastWizardV4.tsx:131-162`).

For Armstrong on 2026-05-31: monthKeys = `2025-07..2026-06`, `completedMonthsCount = 9`, `remainingMonthsCount = 3` → 3 editable cells. Plan Y1 actually = `2026-06..2027-06` (13 months) — 12 of which don't appear in the grid at all.

## Evidence Located

| Claim | File:Line |
|---|---|
| Hardcoded 12-month range | `Step3RevenueCOGS.tsx:311` |
| Underlying `generateMonthKeys` hardcoded 12 | `types.ts:1028` |
| `remainingMonthsCount` calc | `Step3RevenueCOGS.tsx:545-547` |
| `actualMonthKeys` membership | `Step3RevenueCOGS.tsx:350-355` |
| Step 3 props (no plan-period inputs) | `Step3RevenueCOGS.tsx:240-244` |
| `BusinessProfile` narrow shape | `types.ts:56-62` |
| `ForecastWizardState` (no plan-period slice) | `types.ts:735-757` |
| Goals loader discards fields | `ForecastWizardV4.tsx:131-162` |
| Fields already deserialised by service | `financial-service.ts:265-275` |
| Schema location (NOT business_profiles) | `baseline_schema.sql:1777-1779` + `20260427024433_plan_period_columns.sql` |
| Phase 68 B15 sibling solution | `quarters.ts:246-312` |

## Decisions Made

**1. Shared util vs inline:** Extract a new shared module `src/lib/utils/plan-period.ts` with two pure functions (`getPlanY1MonthKeys`, `getActualMonthKeysForPlanY1`). Reasoning: Phase 68 just paid down drift between two derivations of "what months does plan Y1 cover?" — inlining a parallel implementation in Step 3 would re-introduce the exact hazard. `deriveCurrentRemainderColumn` is NOT modified (it serves the goals wizard); the new util is a sibling, not a refactor.

**2. PlanPeriod slice vs BusinessProfile extension:** Recommend new `planPeriod` slice on `ForecastWizardState` (not extending `BusinessProfile`). The fields are sourced from `business_financial_goals` / `strategic_plans`, not from `business_profiles` — separating slices keeps the source-of-truth clear and avoids stuffing goals-row data into a profile-row interface.

**3. Step 8 GrowthPlan deferral:** Latent under-count in Y1 aggregation (12-month rollup of a 13-month plan) acknowledged but explicitly deferred — Matt's reported bug is Step 3 only, and Step 8's symptom is a summary-display error not a workflow blocker.

**4. Scope correction (planner prompt):** Planner suggested extended-period columns live on `business_profiles`. They do not — they live on `business_financial_goals` (`is_extended_period`, `year1_months`, `plan_start_date`, `year1_end_date`) and `strategic_plans` (`plan_start_date`). Documented in DIAGNOSIS so 72-02 starts from the correct schema.

## Same-Family Audit (Steps 4-8)

| Step | Verdict |
|---|---|
| 4 Team | No bug — per-employee periods, no FY-aligned grid |
| 5 OpEx | No bug — annual totals, no monthly grid |
| 6 CapEx | No bug — per-item periods |
| 6 Subscriptions | No bug — vendor-level monthly budget |
| 7 Other | No bug |
| 8 GrowthPlan | **Latent** under-count in Y1 aggregation (12-month rollup of 13-month plan). Deferred to follow-up phase. |
| 8 Review | No bug — yearly totals only |

## Deviations from Plan

None — plan executed exactly as written. Zero `src/` modifications (verified via `git status --porcelain src/ | wc -l` → `0`).

## Commits

- `bb02009d` docs(72-01): diagnose Step 3 extended-period bug — wizard-blind-to-plan-period

## Self-Check: PASSED

- [x] `72-DIAGNOSIS.md` exists at `.planning/phases/72-.../72-DIAGNOSIS.md`
- [x] Contains `## Root Cause` heading with named root cause + file:line evidence
- [x] Contains `## Fix Scope` section (Phases A-D detailed)
- [x] Decides extract-util vs inline (extract, with reason)
- [x] Documents Step 4-8 same-family audit (no fixes applied)
- [x] Zero modifications to `src/` (`git status --porcelain src/ | wc -l == 0`)
- [x] Commit `bb02009d` exists in git history (verified via `git rev-parse --short HEAD`)
