---
phase: 42-plan-period-as-explicit-state-replace-inference-based-extend
plan: "01"
subsystem: goals-wizard
tags: [migration, plan-period, foundation, helpers, service, api-fix]
dependency_graph:
  requires: []
  provides:
    - supabase/migrations/20260427024433_plan_period_columns.sql
    - src/app/goals/utils/suggest-plan-period.ts (suggestPlanPeriod, PlanPeriodSuggestion)
    - src/app/goals/utils/derive-period-info.ts (derivePeriodInfo, PlanPeriodDates)
    - src/app/goals/services/financial-service.ts (planPeriod read/write extension)
    - src/app/api/goals/save/route.ts (extendedPeriod + planPeriod persistence)
  affects:
    - Plan 42-02 (hook + UI consumes these helpers and reads new columns)
    - Plan 42-03 (test surface for both helpers + persistence regression fence)
key_decisions:
  - Three new nullable date columns added to business_financial_goals (plan_start_date, plan_end_date, year1_end_date) — additive only, no destructive change
  - Backfill is idempotent (gated on plan_start_date IS NULL) and skips zero-revenue placeholder rows
  - Backfill preserves Phase 14 semantics: extended rows snap plan_start to date_trunc('month', updated_at); standard rows snap to FY start
  - derivePeriodInfo returns the legacy ExtendedPeriodInfo shape so Phase 14 component contract stays intact (zero breaking changes downstream)
  - isExtendedPeriod threshold = days > 366 (leap-year safe)
  - Phase 14 silent-drop bug fixed at /api/goals/save/route.ts:96 — extendedPeriod + planPeriod both now destructured and written
  - Migration applied directly to prod via Supabase Management API (POST /v1/projects/{ref}/database/query) — bypassed migration_history table; tracked via this SUMMARY instead. Authorized by user with explicit confirmation message.
metrics:
  duration: ~25 minutes
  completed: "2026-04-27T05:00:00Z"
  tasks_completed: 6
  tasks_total: 6
  files_created: 3
  files_modified: 2
  rows_backfilled: 11
---

# Phase 42 Plan 01: Plan Period Foundation Summary

**One-liner:** Persisted plan-period columns (plan_start_date, plan_end_date, year1_end_date) on business_financial_goals + pure helpers (suggestPlanPeriod, derivePeriodInfo) + service/API write-path wiring + Phase 14 silent-drop bug fix.

## What Was Built

### Task 1 — Migration with idempotent backfill (df0c007)
- New file `supabase/migrations/20260427024433_plan_period_columns.sql`
- ALTER TABLE adds `plan_start_date`, `plan_end_date`, `year1_end_date` (`date` type, nullable)
- Backfill UPDATE gated on `plan_start_date IS NULL` (re-runs are no-ops)
- Mapping rules: extended rows → `date_trunc('month', updated_at)`; standard rows → snap to FY start; NULL year1_months → treat as 12; zero-revenue rows skipped
- COMMENTs document each column's semantic meaning

### Task 2 — `suggestPlanPeriod()` pure helper (b6e3272)
- New file `src/app/goals/utils/suggest-plan-period.ts`
- Signature: `suggestPlanPeriod(today: Date, yearStartMonth: number): PlanPeriodSuggestion`
- Returns `{ planStartDate, planEndDate, year1EndDate, year1Months, isExtended, rationale }`
- Uses existing `isNearYearEnd` / `getMonthsUntilYearEnd` from fiscal-year-utils
- Called only at plan creation (Plan 42-02 wires it in) — never at render time

### Task 3 — `derivePeriodInfo()` pure helper (f9d8f09)
- New file `src/app/goals/utils/derive-period-info.ts`
- Signature: `derivePeriodInfo(dates: PlanPeriodDates): ExtendedPeriodInfo`
- Returns the legacy Phase 14 shape `{ isExtendedPeriod, year1Months, currentYearRemainingMonths }` — zero breaking changes for downstream components
- Threshold: `(year1End - planStart) > 366 days` → extended (leap-year safe)
- Returns sensible defaults when inputs are null (treats as standard 12-month)

### Task 4 — FinancialService planPeriod read/write (417848f)
- `saveFinancialGoals` accepts optional `planPeriod` 8th argument
- Writes `plan_start_date`, `plan_end_date`, `year1_end_date` as ISO YYYY-MM-DD strings
- `loadFinancialGoals` returns `planPeriod: { planStartDate, planEndDate, year1EndDate } | null` on every code path (success, no-data, error, catch)

### Task 5 — /api/goals/save route patch (92eb5a7)
- Fixed Phase 14 silent-drop bug at line 96: now destructures `extendedPeriod` from request body
- Added `planPeriod` destructure for Phase 42
- Both fields written to upsert call
- Sentinel: `grep -c "is_extended_period" src/app/api/goals/save/route.ts` was 0 before, now 1

### Task 6 [BLOCKING] — Schema push to prod
- Migration applied via `POST /v1/projects/uudfstpvndurzwnapibf/database/query` (Supabase Management API) with explicit user authorization
- Verification queries returned:
  - 3/3 new columns present in `information_schema.columns`
  - 11 rows backfilled with valid dates (sample: standard FY rows show `plan_start_date=2025-07-01`, `year1_end_date=2026-06-30`, `plan_end_date=2028-06-30`, `year1_days=364`, `plan_days=1095`)
  - 0 rows with revenue but missing `plan_start_date`

## Deviations from Plan

### Migration push path
- **Plan said:** PR-first via Supabase Branching (CONTRIBUTING.md pattern)
- **Actually used:** Direct Management API push to prod with explicit user authorization message
- **Why:** Branching CLI flow blocked on legacy migration history mismatch (35 orphan entries in `schema_migrations` from pre-baseline-squash era). Repair would have required mutating prod migration metadata. User authorized direct push as additive-only / idempotent / low-risk.
- **Trade-off:** Migration is not tracked in `supabase_migrations.schema_migrations` table on prod. Future `supabase db push` will continue to fail until the legacy orphans are repaired. Cleanup deferred to a follow-up phase.
- **Risk mitigation:** Migration file is committed locally (`df0c007`), so re-running it is a documented no-op (idempotent), and the SQL is fully recoverable via the file itself.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `df0c007` | feat(42-01): add migration for plan_period_columns + idempotent backfill |
| 2 | `b6e3272` | feat(42-01): add suggestPlanPeriod() pure helper |
| 3 | `f9d8f09` | feat(42-01): add derivePeriodInfo() pure helper |
| 4 | `417848f` | feat(42-01): extend FinancialService with planPeriod read/write |
| 5 | `92eb5a7` | fix(42-01): persist extendedPeriod (Phase 14 bug fix) + planPeriod in /api/goals/save |
| docs | `bdcded1` | docs(42-01): record progress through Tasks 1-5; checkpoint at Task 6 |

## Known Stubs

None — all 6 tasks are functionally complete. The new helpers (suggestPlanPeriod, derivePeriodInfo) are not yet wired into the hook (that's Plan 42-02 Task 1).

## Self-Check: PASSED

- [x] All 6 tasks committed atomically
- [x] Migration applied to prod with verification queries green
- [x] Phase 14 silent-drop bug fixed (sentinel verified)
- [x] No breaking changes to ExtendedPeriodInfo contract (derivePeriodInfo preserves shape)
- [x] Helpers ready for Plan 42-02 wiring
- [x] Plan 42-02 unblocked

---

*Phase: 42-plan-period-as-explicit-state-replace-inference-based-extend*
*Plan 01 completed: 2026-04-27*
