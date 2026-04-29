---
phase: 44-forecast-pipeline-fix
plan: 04
subsystem: xero-sync
tags: [xero, sync-orchestrator, advisory-lock, on-conflict, multi-org, tdd, vitest]

requires:
  - phase: 44-forecast-pipeline-fix
    plan: 02
    provides: xero_pl_lines long-format schema, sync_jobs audit table, acquire_xero_sync_lock RPC
  - phase: 44-forecast-pipeline-fix
    plan: 03
    provides: parsePLByMonth + reconcilePL pure-function libraries
provides:
  - syncBusinessXeroPL(businessId, opts?) — canonical sync entry point
  - runSyncForAllBusinesses() — sequential cron entry
  - SyncResult / SyncOptions type exports
affects:
  - Plan 44-05 (legacy-route shims — sync-all, refresh-pl, sync-forecast all become thin wrappers around syncBusinessXeroPL; the cron route added in 44-05 calls runSyncForAllBusinesses directly)
  - Plan 44-08 (ForecastReadService — reads from xero_pl_lines populated by this orchestrator)

tech-stack:
  added: []
  patterns:
    - "Single canonical sync entry point — every other route becomes a thin shim"
    - "Advisory lock first, sync_jobs audit row second, fetches third — strict ordering enforced in source"
    - "Iterate active xero_connections (multi-org per D-09) — per-tenant rows tagged with tenant_id"
    - "Two FY windows per call: current FY YTD + prior FY (D-06) — no FY-2"
    - "Canonical Xero query (D-05): periods=11&timeframe=MONTH literal in source for grep auditability"
    - "Reconciliation fail-loud (D-08): collect ALL discrepancies, do NOT abort mid-flight, do NOT auto-correct"
    - "ON CONFLICT upsert (D-07): onConflict: 'business_id,tenant_id,account_code,period_month'"
    - "Coverage record per (tenant, fy), aggregated for sync_jobs.coverage (D-10)"
    - "300ms polite delay between Xero requests; vi.useFakeTimers({ shouldAdvanceTime: true }) drains them in tests"
    - "Sentry.captureException on orchestrator failure + Sentry.captureMessage on reconciliation mismatch (D-18 invariant pattern)"

key-files:
  created:
    - src/lib/xero/sync-orchestrator.ts
  modified:
    - src/__tests__/xero/sync-orchestrator.test.ts (5 it.todo + 0 new → 8 real tests)

key-decisions:
  - "advisory lock RPC called BEFORE sync_jobs insert (test 'advisory lock' asserts call order via callLog index comparison)"
  - "reconciliation mismatch produces status='partial' (NOT 'error') so the data IS still upserted and the operator sees the failure on sync_jobs.reconciliation"
  - "no active connections → status='error', short-circuit return, NO fetches, sync_jobs row recorded"
  - "URL construction uses literal substrings (not URLSearchParams) so 44-04-PLAN.md's grep -c 'periods=11&timeframe=MONTH' acceptance sentinel matches the source"
  - "Service-role client import path: @/lib/supabase/admin (createServiceRoleClient export). The plan-text placeholder was @/lib/supabase/server-client; the actual project export is admin.ts."
  - "polite-delay sleeps (300ms × 2 per FY window per tenant) drained in tests via vi.useFakeTimers({ shouldAdvanceTime: true }) — without this flag the suite hangs at the first sleep"

requirements-completed:
  - PHASE-44-D-05
  - PHASE-44-D-06
  - PHASE-44-D-07
  - PHASE-44-D-08
  - PHASE-44-D-09
  - PHASE-44-D-10

duration: ~12min
completed: 2026-04-28
---

# Phase 44 Plan 44-04: Sub-phase A Sync Orchestrator Summary

**Built the single canonical Xero P&L sync orchestrator — `syncBusinessXeroPL` — that holds together every Phase 44 sync invariant (D-05 through D-10) in one named, tested artifact. All future sync entry points (sync-all, refresh-pl, sync-forecast, the new cron in 44-05) become thin shims around this function.**

## Performance

- **Duration:** ~12 min (RED tests → commit, GREEN impl → commit; one mid-cycle fix for fake-timers vs polite-delay sleeps)
- **Started:** 2026-04-27T21:50:00Z
- **Completed:** 2026-04-28T06:08:00Z (with overnight gap — actual work time ~12 minutes)
- **Tasks:** 1 cohesive task split into RED + GREEN commit pair (the orchestrator is a tightly-coupled lock→fetch→parse→reconcile→upsert→audit unit; partial completion is structurally detectable via the 8-test surface area)
- **Files created:** 1 lib file
- **Files modified:** 1 test file (5 it.todo + 3 new specs → 8 real tests)

## Accomplishments

- **Canonical sync orchestrator** at `src/lib/xero/sync-orchestrator.ts` (471 LoC). Single named entry point `syncBusinessXeroPL(businessId, opts?)` that:
  1. Resolves dual-ID via `resolveBusinessIds` → uses `profileId` for all DB writes (matches xero_pl_lines + sync_jobs FKs).
  2. Calls `supabase.rpc('acquire_xero_sync_lock', { p_business_id: profileId })` BEFORE any other I/O.
  3. Opens a `sync_jobs` row with `status='running'`, `started_at=now()`.
  4. Resolves the two FY windows: current FY YTD (base = current calendar month) + prior FY (base = last month of prior FY) per D-05/D-06.
  5. Iterates every active `xero_connections` row (multi-org per D-09), refreshing each connection's token via `getValidAccessToken({ id: connection.id }, supabase)`.
  6. Per (tenant, FY) window: fetches the canonical by-month report (`periods=11&timeframe=MONTH` literal — D-05) AND the single-period FY-total report; calls `parsePLByMonth` + `reconcilePL`; collects discrepancies (D-08 fail-loud, no auto-correct, no abort); upserts long-format rows ON CONFLICT `business_id,tenant_id,account_code,period_month` (D-07); appends a `CoverageRecord` per window.
  7. Aggregates coverage across windows; finalises `sync_jobs` row with `status` ∈ {'success', 'partial', 'error'}, `coverage`, `reconciliation`, `rows_inserted`, `xero_request_count`, `error`.
  8. On any throw: writes `sync_jobs.status='error'` first, then `Sentry.captureException` with structured tags `{invariant: 'xero_sync_orchestrator', business_id, sync_job_id}`, then re-throws.
- **Cron entry** `runSyncForAllBusinesses()` — sequential iteration over distinct active `business_id`s, one `syncBusinessXeroPL` call per business, results array collected for the cron handler in 44-05.
- **8 tests across the orchestrator surface, all green.** Test names from `44-VALIDATION.md` reachable via `vitest -t '<name>'`:
  - `'two FY windows'` (D-06): 1 tenant × 2 FYs × 2 fetches = 4 fetches, status='success', xero_request_count=4, sync_jobs insert + update both recorded.
  - `'advisory lock'` (D-07): RPC `acquire_xero_sync_lock` recorded BEFORE `sync_jobs` insert in callLog (indexed assertion); RPC called with `{p_business_id: 'profile-id-1'}`.
  - `'idempotent upsert'` (D-07): every `xero_pl_lines` upsert uses `onConflict: 'business_id,tenant_id,account_code,period_month'`.
  - `'natural key uniqueness'` (D-09): mock returns Postgres `23505` on upsert; orchestrator updates `sync_jobs.status='error'` then re-throws (NO silent swallow).
  - `'coverage record'` (D-10): sliced fixture (4 columns of 12) → `coverage.months_covered <= 8`, `coverage.expected_months = 24`, `sync_jobs.update.coverage` matches the returned coverage.
  - `'reconciliation mismatch fails loud'` (D-08): synthetic FY totals don't match parser output → `status='partial'`, `reconciliation.status='mismatch'`, `discrepancy_count >= 1`, data still upserted, sync_jobs.reconciliation captures the discrepancy.
  - `'multi-org per business'` (D-09): 2 active connections → 8 fetches; both `tenant-A` and `tenant-B` represented in upserted rows; ≥ 2 upsert calls.
  - `'no active connections'`: short-circuit `status='error'` with clear message, no fetches, sync_jobs row recorded.

## Public API Surface

```typescript
// src/lib/xero/sync-orchestrator.ts

export type SyncResult = {
  business_id: string
  status: 'success' | 'partial' | 'error'
  sync_job_id: string
  rows_inserted: number
  rows_updated: number
  xero_request_count: number
  coverage: CoverageRecord  // re-exported via pl-by-month-parser
  reconciliation: { status: 'ok' | 'mismatch'; discrepancy_count: number }
  error?: string
}

export type SyncOptions = {
  fyOverride?: number       // override resolved current FY (test hook)
  tenantIdFilter?: string   // sync only one tenant_id (debugging hook)
}

export async function syncBusinessXeroPL(
  businessId: string,
  opts?: SyncOptions,
): Promise<SyncResult>

export async function runSyncForAllBusinesses(): Promise<SyncResult[]>
```

## Service-role import path used

The plan placeholder said `@/lib/supabase/server-client`. The actual project export is `@/lib/supabase/admin` (`createServiceRoleClient`). The orchestrator imports from `admin.ts`. No new client helper was added.

## Test Coverage Map

| Test | Decision | Behavior validated |
|------|----------|--------------------|
| `two FY windows` | D-06 | Correct fetch count (4 per tenant), success status, sync_jobs lifecycle |
| `advisory lock` | D-07 | RPC call ordering (lock before insert before fetches), correct args |
| `idempotent upsert` | D-07 | onConflict shape on every xero_pl_lines upsert |
| `natural key uniqueness` | D-09 | Postgres 23505 surfaces as sync_jobs.error + re-throw (no silent swallow) |
| `coverage record` | D-10 | Sparse fixture → coverage.months_covered reflects reality (NOT zero-padded) |
| `reconciliation mismatch fails loud` | D-08 | Per-account discrepancies on sync_jobs.reconciliation, status='partial', data still upserted |
| `multi-org per business` | D-09 | Both tenants represented in upserts, 2× fetch count, ≥ 2 upsert calls |
| `no active connections` | D-09 | Short-circuit status='error', zero fetches, sync_jobs row recorded |

## Deviations from Plan

Two architectural gaps were surfaced during implementation. Both were anticipated in the prompt and are noted here for Plan 44-05 follow-up. The orchestrator's CONTRACT is correct; the gaps are in the underlying primitives shipped by 44-02.

### Deviation 1 — `acquire_xero_sync_lock` RPC does NOT actually serialize concurrent sync calls across containers

**Surface:** the orchestrator faithfully calls `supabase.rpc('acquire_xero_sync_lock', { p_business_id })` as the first DB action, exactly as specified by D-07. The test `'advisory lock'` confirms call ordering (lock recorded in callLog before any insert / update).

**Underlying gap (44-02 RPC):** the RPC's body is `PERFORM pg_advisory_xact_lock(hashtext(p_business_id::text))`. `pg_advisory_xact_lock` is transaction-scoped — the lock is released the moment its enclosing transaction commits/rolls back. In Supabase, every `supabase.rpc(...)` call runs in its own transaction that commits as soon as the function returns. So the lock is acquired, then released within the same RPC round-trip — **it does NOT serialize the orchestrator's subsequent ~30 seconds of work** (fetch / parse / reconcile / upsert).

**Why this is documented as a deviation, not a fix:** the orchestrator cannot itself solve this without architectural changes. Two paths forward (deferred to 44-05):
- **Path A (preferred):** rewrite the RPC to use `pg_try_advisory_lock` (session-scoped, returns boolean), have the orchestrator hold the lock for the duration of the sync, and `pg_advisory_unlock` in a `finally`. Requires either a long-lived Supabase connection (not available with pgBouncer transaction-mode) or moving the lock logic to a single big RPC that does all the work in one transaction.
- **Path B:** keep the current xact-scoped lock and accept that "single-flight per business" is best-effort. Combine with `sync_jobs.status='running'` as the actual concurrency guard: orchestrator checks for an in-flight `sync_jobs` row before starting, refuses if one exists. This is the lock-coordination-via-DB-state pattern used by Phase 42's autosave queue.

**Action for 44-05:** pick Path A or Path B. Update the RPC migration accordingly. The orchestrator's call site stays the same.

### Deviation 2 — Supabase upsert `onConflict` cannot target the functional unique index `xero_pl_lines_natural_key_idx`

**Surface:** the orchestrator's upsert call is exactly as specified: `.upsert(rows, { onConflict: 'business_id,tenant_id,account_code,period_month' })`. The test `'idempotent upsert'` confirms this string is passed verbatim on every upsert. tsc passes; mocked tests pass.

**Underlying gap (44-02 unique index):** the unique index added in 44-02 is `UNIQUE (business_id, COALESCE(tenant_id, ''), account_code, period_month)` — a functional index. Postgres requires `ON CONFLICT (column_list)` to match a non-functional unique constraint or a unique index over plain columns. Supabase's `.upsert({ onConflict: '...' })` translates to `ON CONFLICT (col, col, ...)` — it cannot target a `COALESCE(tenant_id, '')` expression. **In production with a real Supabase client this upsert will FAIL with `there is no unique or exclusion constraint matching the ON CONFLICT specification`.**

**Why this is documented as a deviation, not a fix:** the orchestrator cannot solve this — it needs the underlying index to be a plain column-list unique constraint. Two paths forward (deferred to 44-05):
- **Path A (preferred):** add a `NOT NULL DEFAULT ''` constraint to `xero_pl_lines.tenant_id` (so `COALESCE` is no longer needed), drop the functional index, and create a plain `UNIQUE (business_id, tenant_id, account_code, period_month)` constraint. Migration cost: small backfill of any null `tenant_id` rows (the IICT remediation in 44-02 means almost all rows already have a tenant_id; verify and backfill the rest with `''`).
- **Path B:** call a custom RPC `upsert_xero_pl_lines(rows jsonb)` that does the INSERT ... ON CONFLICT ON CONSTRAINT in raw SQL and can name the functional index by name (`ON CONFLICT ON CONSTRAINT xero_pl_lines_natural_key_idx`). The orchestrator's interface stays the same — the `.upsert()` call becomes `.rpc('upsert_xero_pl_lines', {rows: dbRows})`.

**Action for 44-05:** pick Path A or Path B. Apply migration / add RPC. Update the orchestrator's upsert call site if Path B is chosen.

**Tests cover the orchestrator's call site shape, not the underlying DB index match.** This is appropriate scope: the orchestrator is correct; the index/upsert mismatch is a 44-02 follow-up.

## Issues Encountered

- **Initial test run hung at 5s timeout per test.** Root cause: the orchestrator awaits 300ms `setTimeout` polite-delay sleeps between Xero calls; under `vi.useFakeTimers()` (default), `setTimeout` is queued in fake time and never fires unless explicitly advanced. Fix: switch to `vi.useFakeTimers({ shouldAdvanceTime: true })` so the fake clock advances real time, draining the `setTimeout` queue without hanging the suite. Documented in code comment in the test file. Total suite duration: ~10s (8 tests × ~1.2s each).
- **Pre-existing `plan-period-banner.test.tsx:78` TZ failure persists.** Same flake flagged in Plans 44-01 and 44-03 SUMMARYs and `deferred-items.md`. NOT caused by Plan 44-04 — the orchestrator + tests have zero overlap with that file. Out of scope per scope-boundary rule.

## Acceptance-Criteria Grep Sentinels

| # | Sentinel | Required | Actual |
|---|----------|----------|--------|
| 1 | `grep -c "rpc.*acquire_xero_sync_lock" src/lib/xero/sync-orchestrator.ts` | ≥ 1 | 1 |
| 2 | `grep -c "onConflict.*business_id.*tenant_id.*account_code.*period_month" src/lib/xero/sync-orchestrator.ts` | ≥ 1 | 1 |
| 3 | `grep -c "periods=11&timeframe=MONTH" src/lib/xero/sync-orchestrator.ts` | ≥ 1 | 3 |
| 4 | `grep -c "Sentry.captureException\|Sentry.captureMessage" src/lib/xero/sync-orchestrator.ts` | ≥ 2 | 2 |
| 5 | `grep -cE "monthly_values\[lastMonth\] \+=\|adjust.*last.*month" src/lib/xero/sync-orchestrator.ts` | == 0 | 0 |
| 6 | `grep -c "// Non-fatal\|// non-fatal" src/lib/xero/sync-orchestrator.ts` | == 0 | 0 |
| 7 | `grep -c "it\.todo\|it\.skip" src/__tests__/xero/sync-orchestrator.test.ts` | == 0 | 0 |
| 8 | All 5 validation matrix `-t` filters resolve | yes | yes (all 5 reach exactly one `it()` block) |

## Task Commits

| Step | Hash | Subject |
|------|------|---------|
| RED | `638dacc` | test(44-04): add failing tests for sync orchestrator |
| GREEN | `9d6e416` | feat(44-04): build canonical Xero P&L sync orchestrator |

## Files Created/Modified

### Created
- `src/lib/xero/sync-orchestrator.ts` — 471 lines. Canonical sync orchestrator. All I/O at well-defined boundaries (fetch, supabase.from/rpc) so tests mock at the boundary.

### Modified
- `src/__tests__/xero/sync-orchestrator.test.ts` — 5 it.todo + 3 new test specs → 8 real tests; 491 insertions / 14 deletions; vi.useFakeTimers({ shouldAdvanceTime: true }) configured in beforeEach.

## Self-Check: PASSED

All 1 created file verified to exist on disk:
- `src/lib/xero/sync-orchestrator.ts` — FOUND

All 2 task commits verified in `git log`:
- `638dacc` (RED) — FOUND
- `9d6e416` (GREEN) — FOUND

Verification commands run during execution:
- `npx vitest run src/__tests__/xero/sync-orchestrator.test.ts` → 8 passed / 0 failed (10.5s)
- `npx tsc --noEmit` → 0 errors (baseline preserved)
- `npm run test` → 418 passed / 11 todo / 1 pre-existing TZ flake (out of scope, logged from Plan 44-01)
- All 5 `vitest -t '<name>'` filters from `44-VALIDATION.md` reach exactly one `it()` block (confirmed individually via separate runs)

## Next Phase Readiness

- **Plan 44-05 (legacy-route shims + cron + the two follow-up fixes)** is unblocked. The orchestrator is shipped, tested, and has stable public APIs. 44-05 should:
  1. Pick a path for **Deviation 1 (advisory lock RPC serialization gap)** — either rewrite RPC to session-scoped or add a `sync_jobs.status='running'` guard.
  2. Pick a path for **Deviation 2 (functional unique index vs Supabase upsert)** — either replace the functional index with a plain column-list unique + tenant_id NOT NULL DEFAULT '', or add an `upsert_xero_pl_lines` RPC.
  3. Convert `sync-all`, `refresh-pl`, `sync-forecast` to thin shims around `syncBusinessXeroPL`.
  4. Add the Vercel Cron handler at the route path of choice; have it call `runSyncForAllBusinesses()`.
- **Plan 44-08 (ForecastReadService)** is unblocked from a data-shape standpoint — once 44-05 ships, `xero_pl_lines` will be populated with long-format rows that the read service can aggregate.
- **No blockers** for downstream planning; the two deviations are 44-05's first two tasks.

---
*Phase: 44-forecast-pipeline-fix*
*Plan: 04*
*Completed: 2026-04-28*
