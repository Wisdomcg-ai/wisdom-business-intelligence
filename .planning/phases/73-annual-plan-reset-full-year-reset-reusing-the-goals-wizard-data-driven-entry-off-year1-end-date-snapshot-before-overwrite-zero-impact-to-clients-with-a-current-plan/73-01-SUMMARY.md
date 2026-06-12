---
phase: 73-annual-plan-reset
plan: "01"
subsystem: goals/annual-reset
tags: [snapshot, reversibility, annual-reset, tdd]
dependency_graph:
  requires: []
  provides:
    - AnnualResetSnapshotService (capture + restore)
    - annualResetSnapshotService (singleton)
  affects:
    - plan_snapshots (insert only)
    - business_financial_goals (restore write)
tech_stack:
  added: []
  patterns:
    - Chained-builder Supabase mock (same pattern as plan-period-persistence.test.ts)
    - Dual-ID split: business_profiles.id for goals, businesses.id for kpis/initiatives
    - snapshot_type reuse: 'quarterly_review_pre_sync' + free-form label for annual tag
key_files:
  created:
    - src/app/goals/services/annual-reset-snapshot-service.ts
    - src/__tests__/goals/annual-reset-snapshot.test.ts
  modified: []
decisions:
  - "Used snapshot_type='quarterly_review_pre_sync' (CHECK-allowed) + label='annual_reset_FY<n>' to avoid any schema migration — zero schema risk"
  - "restoreAnnualResetSnapshot restores only the financial goals ladder (revenue/GP/NP/customers/employees + quarterly_targets + year_type + plan dates); KPI and initiative restore intentionally deferred — financial ladder is the load-bearing reversibility path"
  - "Dual-ID split enforced in both service params and test assertions: businessId=business_profiles.id for goals; businessesId=businesses.id for kpis+initiatives"
  - "Mock fix during GREEN: proxyBuilder for kpis/initiatives must return itself from all chainable methods (.select, .eq, .order, .limit) so the then() override is preserved across the full .select().eq().eq() chain"
metrics:
  duration_seconds: 191
  completed_date: "2026-06-12"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
  tests_added: 13
---

# Phase 73 Plan 01: Annual Reset Snapshot Service Summary

**One-liner:** Reversibility foundation — `AnnualResetSnapshotService` captures the full ending-year plan (3-year ladder + quarterly_targets + KPIs + initiatives) into `plan_snapshots` as `quarterly_review_pre_sync` with `annual_reset_FY<n>` label, and restores the financial goals ladder byte-for-byte via `restoreAnnualResetSnapshot`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write failing capture/restore round-trip + read-only tests (RED) | `49b32773` | `src/__tests__/goals/annual-reset-snapshot.test.ts` |
| 2 | Implement AnnualResetSnapshotService (GREEN) | `f1bc1fc7` | `src/app/goals/services/annual-reset-snapshot-service.ts`, `src/__tests__/goals/annual-reset-snapshot.test.ts` |

## What Was Built

### `AnnualResetSnapshotService`

Two public async methods:

**`captureAnnualResetSnapshot({ businessId, businessesId, userId, endingFY })`**
- Reads `business_financial_goals` by `businessId` (business_profiles.id)
- Reads `business_kpis` (is_active=true) by `businessesId` (businesses.id)
- Reads `strategic_initiatives` by `businessesId` (businesses.id)
- Computes next version number (max+1 per business, first=1)
- Inserts ONE `plan_snapshots` row: `snapshot_type='quarterly_review_pre_sync'`, `label='annual_reset_FY<n>'`, `year=endingFY`, `plan_data={kind, endingFY, goals, kpis, initiatives}`
- Returns `{ success, snapshotId, versionNumber }`
- NEVER calls `.update`, `.upsert`, or `.delete` on any plan table

**`restoreAnnualResetSnapshot({ businessId, snapshotId })`**
- Fetches `plan_data` from `plan_snapshots` by `snapshotId`
- Extracts `plan_data.goals`, strips `id`/`created_at`/`updated_at`
- Calls `.update(payload).eq('business_id', businessId)` on `business_financial_goals`
- Returns `{ success }`
- KPI/initiative restore intentionally deferred (documented in file header JSDoc)

### Test Suite (13 tests, all green)
- Singleton export verification
- Version number: first=1, subsequent=max+1
- Snapshot shape: `snapshot_type`, `label`, `year`, `plan_data.kind/endingFY/goals/kpis/initiatives`
- Read-only guard: no `.update/.upsert/.delete` on goals/kpis/initiatives during capture
- Round-trip: capture → mutate → restore → verify goals updated with captured values
- Strip guard: `id` and `created_at` are stripped from restore payload

## Success Criteria Verification

- [x] `npx vitest run src/__tests__/goals/annual-reset-snapshot.test.ts` — 13/13 passed
- [x] Capture writes exactly one `plan_snapshots` row with `snapshot_type='quarterly_review_pre_sync'` + `label='annual_reset_FY2026'`
- [x] Capture touches no plan table with a write (read-only guard tested and passing)
- [x] Restore round-trips the captured 3-year ladder + `quarterly_targets` + `year_type` back into `business_financial_goals`
- [x] No schema migration introduced — reuses existing CHECK-allowed `snapshot_type` value
- [x] `npx tsc --noEmit` clean for new files
- [x] `annualResetSnapshotService` singleton exported
- [x] `from('plan_snapshots')` reference present
- [x] `annual_reset_FY` label present
- [x] Service min_lines=80 met (251 lines); test min_lines=60 met (529 lines)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed chained-builder mock for kpis/initiatives arrays**
- **Found during:** Task 2 GREEN run
- **Issue:** The `proxyBuilder` for `business_kpis`/`strategic_initiatives` spread `builder`, but `builder.select()` returned `builder` (not `proxyBuilder`). This meant the `then()` override (which delivers the rows array) was lost after `.select()` was called in the chain.
- **Fix:** Replaced the spread-and-override pattern with a fully self-referential `proxyBuilder` where all chainable methods (`.select`, `.eq`, `.order`, `.limit`) return `proxyBuilder` itself, preserving the `then()` override across the full `.select().eq().eq()` chain.
- **Files modified:** `src/__tests__/goals/annual-reset-snapshot.test.ts`
- **Commit:** `f1bc1fc7` (bundled with GREEN service implementation)

## Known Stubs

None. The service is fully wired: reads from real Supabase tables (mocked in tests), inserts into real `plan_snapshots` table, and restores via real `.update()` call. No hardcoded empty values or placeholder data flows to the UI.

## Self-Check: PASSED
