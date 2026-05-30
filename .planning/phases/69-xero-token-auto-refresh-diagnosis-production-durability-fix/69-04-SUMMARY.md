---
phase: 69-xero-token-auto-refresh-diagnosis-production-durability-fix
plan: 04
subsystem: monitoring
tags: [xero, cron, sentry, observability, regression-guard]
dependency_graph:
  requires:
    - 69-01 (diagnosis identifies cron-not-firing as root cause + names "no invocation-cadence monitoring" as the contributing factor)
    - 53-04 (the refresh cron this plan instruments)
    - 53-05 (the XeroHealthPill that this plan verifies)
  provides:
    - Pre-expiry Sentry warning (`xero_token_pre_expiry` invariant) per tenant when token <24h from expiry and cron did not refresh
    - `cron_heartbeats` append-only invocation log + helper rolled across all 5 cron routes
    - Monitoring runbook with Sentry alert config + cadence SQL + XeroHealthPill verification procedure
  affects:
    - All 5 cron routes under src/app/api/cron/* (each now writes one heartbeat per real invocation)
    - Tests for cron-sync-all + reconciliation-watch (new heartbeat-helper mock declaration)
tech_stack:
  added: []
  patterns: [fail-soft-telemetry, append-only-RLS-table, sentry-invariant-tagging]
key_files:
  created:
    - supabase/migrations/20260530000000_phase69_cron_heartbeats.sql
    - src/lib/cron/heartbeat.ts
    - src/__tests__/lib/cron-heartbeat.test.ts
    - src/__tests__/api/cron-refresh-xero-tokens-pre-expiry.test.ts
    - .planning/phases/69-xero-token-auto-refresh-diagnosis-production-durability-fix/69-04-MONITORING-RUNBOOK.md
  modified:
    - src/app/api/cron/refresh-xero-tokens/route.ts
    - src/app/api/cron/sync-all-xero/route.ts
    - src/app/api/cron/reconciliation-watch/route.ts
    - src/app/api/cron/daily-health-report/route.ts
    - src/app/api/cron/weekly-digest/route.ts
    - src/__tests__/api/cron-refresh-xero-tokens.test.ts
    - src/__tests__/api/cron-sync-all.test.ts
    - src/__tests__/api/reconciliation-watch-cron.test.ts
key_decisions:
  - "Pre-expiry warning fires alongside cron_refresh_xero_tokens_failed when both apply — they are SEPARATE failure modes (token-aging vs transient-refresh-failure), honouring 53-05's 'one event per failure mode' invariant rather than violating it."
  - "Heartbeat helper is fail-soft: catches every DB error + every helper throw. A telemetry failure must NEVER abort the cron's primary work."
  - "Heartbeats are written AFTER the auth gate so 'heartbeat presence == real invocation occurred'. A wrong CRON_SECRET produces no heartbeat (those failures stay in Vercel access logs)."
  - "cron_heartbeats is append-only: RLS denies UPDATE and DELETE explicitly. Service-role inserts only; super_admin can SELECT for ops triage."
  - "PRE_EXPIRY_WARNING_HOURS = 24 (4 cron ticks of grace) — one missed tick still leaves 3 chances to warn before the token dies."
metrics:
  duration: ~25 min
  tasks_completed: 4
  files_created: 5
  files_modified: 8
  tests_added: 14 (6 heartbeat-helper + 8 cron pre-expiry/heartbeat)
  tests_passing: 38/38 across 6 cron-related test files
---

# Phase 69 Plan 04: Pre-expiry monitoring + cron_heartbeats Summary

Add pre-expiry Sentry warning + invocation-cadence cron_heartbeats so the next "tokens dying despite Phase 53" regression class surfaces within hours (not the 7+ days that Phase 70 audit experienced). Closes the named diagnostic gap from 69-DIAGNOSIS.md root cause 2.

## What shipped

### 1. `cron_heartbeats` append-only invocation log

New `public.cron_heartbeats` table (migration `20260530000000_phase69_cron_heartbeats.sql`). Columns: `id`, `cron_path`, `ran_at`, `status` (`success|failed|partial`), `error_message`, `metadata jsonb`. Indexed on `(cron_path, ran_at DESC)` for cadence queries. RLS enabled — super_admin SELECT, no UPDATE, no DELETE. Service-role inserts only.

### 2. `recordHeartbeat` helper

New `src/lib/cron/heartbeat.ts` exports `recordHeartbeat({cronPath, status, errorMessage?, metadata?})`. Fail-soft (any DB or helper error is caught + Sentry-warned + console-warned, never thrown). Truncates error_message at 2000 chars. Caps metadata at 50 keys. 6 vitest cases pin shape, truncation, fail-soft on DB error AND on insert throw.

### 3. Pre-expiry warning in `/api/cron/refresh-xero-tokens`

New constants `PRE_EXPIRY_WARNING_HOURS = 24` + `PRE_EXPIRY_WARNING_MS`. Per-row block (after the existing status-mapping loop) fires `Sentry.captureMessage` with `invariant: 'xero_token_pre_expiry'` when the row's `expires_at - now() < 24h` AND its current-tick status is not `refreshed` or `deactivated`. Tags carry `connection_id`, `business_id`, `tenant_id`, `hours_until_expiry`, `last_status`. Level: `warning` (signal, not failure).

Distinct from `cron_refresh_xero_tokens_failed` — that fires on transient per-tick Xero failures only. `xero_token_pre_expiry` is the OBSERVATION that the token is about to die regardless of whether the current tick succeeded structurally. Per 53-05's "one event per failure mode" invariant, these are SEPARATE failure modes; emitting both when both apply is correct, not duplicative.

### 4. Heartbeats rolled across all 5 cron routes

Every cron registered in `vercel.json` now writes exactly one heartbeat per real invocation:
- `/api/cron/refresh-xero-tokens` — `success | partial | failed` based on per-row counters; metadata carries `total / refreshed / still_valid / failed / deactivated`.
- `/api/cron/sync-all-xero` — `success | partial | failed`; metadata carries `total / success / partial / errored`.
- `/api/cron/reconciliation-watch` — `success | partial | failed`; metadata carries `sync_jobs_scanned / drift_count`.
- `/api/cron/daily-health-report` — `success | partial | failed`; metadata carries `health_overall / email_sent`.
- `/api/cron/weekly-digest` — `success | partial | failed`; metadata carries `coaches_found / sent / errors`.

Heartbeat write happens AFTER auth gate — failed CRON_SECRET attempts produce no heartbeat (heartbeat presence == real invocation).

### 5. Monitoring runbook

`.planning/phases/69-xero-token-auto-refresh-diagnosis-production-durability-fix/69-04-MONITORING-RUNBOOK.md` documents:
- 4 Sentry alerts to configure (1 new — pre-expiry; 1 telemetry self-health — heartbeat insert failures; 2 confirmation of existing — `xero_connection_deactivated` and `cron_refresh_xero_tokens`).
- The exact cadence SQL query that would have surfaced Phase 69 on day 1 (`SELECT cron_path, MAX(ran_at), ... GROUP BY cron_path`).
- XeroHealthPill verified at `src/components/coach/ClientOverviewTable.tsx:66-122` (defined locally, NOT a shared file) — pill states + 12h "verified" threshold + intentional pre-expiry coverage gap documented.
- Stale-sync banner status: `XeroConnectionBanner.tsx` shows `last_synced_at` but has no >48h staleness branch — out of scope, Phase 71+ UX work.
- 7-day post-deploy soak checklist.

## Test status

- New: `src/__tests__/lib/cron-heartbeat.test.ts` (6 cases) — all pass.
- New: `src/__tests__/api/cron-refresh-xero-tokens-pre-expiry.test.ts` (8 cases — 5 pre-expiry + 3 heartbeat) — all pass.
- Updated: `src/__tests__/api/cron-refresh-xero-tokens.test.ts` (9 cases, the 53-04 regression suite) — added 1 mock declaration for the heartbeat helper; still pass.
- Updated: `src/__tests__/api/cron-sync-all.test.ts` (4 cases) — added heartbeat mock; pass.
- Updated: `src/__tests__/api/reconciliation-watch-cron.test.ts` (6 cases) — added heartbeat mock; pass.
- Untouched but exercised: `src/__tests__/api/xero-sync-all-cron-auth.test.ts` (5 cases) — pass.

Total scoped: **38/38 pass**. Typecheck clean.

## Scope extension (locked by user 2026-05-30)

The original 69-04 plan covered only the pre-expiry warning + XeroHealthPill verification + runbook. The user-locked scope extension added `cron_heartbeats` (table + helper + rollout across all 5 cron routes + cadence query in runbook). The original three deliverables are still all here; heartbeats sit alongside them as the broader observability layer that 69-DIAGNOSIS.md named as the missing piece.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Test fragility] Pre-expiry test hours_until_expiry expectation**
- **Found during:** Task 2 GREEN run.
- **Issue:** First pre-expiry test expected `hours_until_expiry === '6'` exactly, but `Math.floor(msUntilExpiry / (60*60*1000))` lands on `5` when a few ms elapse between row construction and the cron's `Date.now()` check.
- **Fix:** Buffered the test's `rowExpiringIn` by +30s AND accepted `['5', '6']` as valid values in the assertion. The point of the test is "warning fired with the right invariant and tags" — exact-hour assertion was over-specified.
- **Files modified:** `src/__tests__/api/cron-refresh-xero-tokens-pre-expiry.test.ts`
- **Commit:** part of `74a1ea85`

**2. [Rule 2 — Missing telemetry mock] Existing cron test files**
- **Found during:** Task 3 rollout to other cron routes.
- **Issue:** `cron-sync-all.test.ts` and `reconciliation-watch-cron.test.ts` did not mock the new heartbeat helper, so the real helper would run against a non-existent supabase admin client in test (the helper is fail-soft, so tests didn't break, but they were unnecessarily exercising telemetry).
- **Fix:** Added `vi.mock('@/lib/cron/heartbeat', ...)` at module boundary in both files. Zero assertion changes.
- **Files modified:** `src/__tests__/api/cron-sync-all.test.ts`, `src/__tests__/api/reconciliation-watch-cron.test.ts`
- **Commits:** `0bdd36b5`

No authentication gates occurred during execution.

## Known Stubs

None — every code path added is wired end-to-end through the cron routes + migration + helper + tests.

## Action Required From Matt

1. Configure the 4 Sentry alerts per `69-04-MONITORING-RUNBOOK.md` once 69-03 ships and the new `xero_token_pre_expiry` events are flowing.
2. After deploy, run the cadence SQL query daily for 7 days to verify heartbeats are landing for all 5 crons.
3. If Vercel Dashboard → Project → Settings → Crons does not show `/api/cron/refresh-xero-tokens` after redeploy, the H1a sub-cause from 69-DIAGNOSIS is confirmed and a clean re-deploy is needed to re-register the cron with Vercel's scheduler.

## Self-Check: PASSED

- `supabase/migrations/20260530000000_phase69_cron_heartbeats.sql` — FOUND
- `src/lib/cron/heartbeat.ts` — FOUND
- `src/__tests__/lib/cron-heartbeat.test.ts` — FOUND
- `src/__tests__/api/cron-refresh-xero-tokens-pre-expiry.test.ts` — FOUND
- `.planning/phases/69-xero-token-auto-refresh-diagnosis-production-durability-fix/69-04-MONITORING-RUNBOOK.md` — FOUND
- Commit `51527c77` (task 1 — migration + helper + helper test) — FOUND
- Commit `2029438d` (task 2 RED — failing tests) — FOUND
- Commit `74a1ea85` (task 2 GREEN — cron route changes) — FOUND
- Commit `0bdd36b5` (task 3 — heartbeats across other 4 cron routes) — FOUND
- Commit `508d39e4` (task 4 — monitoring runbook) — FOUND
- All 38 scoped tests pass
- Typecheck clean
- `grep xero_token_pre_expiry src/app/api/cron/refresh-xero-tokens/route.ts` → 2 matches (literal invariant + comment)
- `grep PRE_EXPIRY_WARNING_HOURS src/app/api/cron/refresh-xero-tokens/route.ts` → 2 matches (definition + usage)
