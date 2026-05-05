---
phase: 53-xero-connection-durability
plan: 04
subsystem: xero-integration / cron
tags: [cron, xero, token-refresh, vercel-cron, sentry, observability]
status: shipped
pr: 110
branch: feat/53-04-refresh-xero-tokens-cron
base: 4f7495c
requirements: [53-04]
dependency_graph:
  requires:
    - 53-02 (centralized refresh through getValidAccessToken — merged 4f7495c)
    - 53-03 (race-aware deactivation policy — merged b5a233d)
  provides:
    - "Proactive 6-hourly refresh that resets Xero's 60-day idle TTL on every active connection"
    - "Clean per-connection token-health telemetry distinct from sync-pipeline noise"
    - "Foundation for 53-05 Sentry tag enrichment (invariants already in place)"
  affects:
    - vercel.json crons (new entry, 4 total)
    - token-manager.ts (REFRESH_THRESHOLD_MINUTES now exported — public API)
tech_stack:
  added: []
  patterns:
    - "Fail-closed cron auth (SEC-02 standard from src/app/api/Xero/sync-all/route.ts:46-50)"
    - "Snapshot-then-iterate over xero_connections rows; tolerate mid-loop deactivation"
    - "Per-connection try/catch isolation so one bad row never aborts the run"
    - "Distinct Sentry invariant tags per failure mode for clean alerting"
    - "Imported constants over duplicated literals (REFRESH_THRESHOLD_MINUTES)"
key_files:
  created:
    - src/app/api/cron/refresh-xero-tokens/route.ts (260 LOC)
    - src/__tests__/api/cron-refresh-xero-tokens.test.ts (313 LOC, 9 tests)
  modified:
    - vercel.json (+4 LOC, 4th cron entry)
    - src/lib/xero/token-manager.ts (+3 LOC comment, +1 word `export`)
decisions:
  - "F1 fix: copied fail-closed auth pattern from src/app/api/Xero/sync-all/route.ts:46-50 (NOT daily-health-report which uses the looser form). Test 4 explicitly covers env-unset → 401."
  - "F2 fix (option a): exported REFRESH_THRESHOLD_MINUTES from token-manager rather than adding an in-route comment. Trivial export; eliminates desync risk permanently."
  - "Kept this cron SEPARATE from sync-all-xero (per 53-RESEARCH §Open Questions #1) — refresh-only is faster, cheaper, and produces clean telemetry independent of data-fetch failures."
  - "Sequential per-connection iteration (not parallel) — avoids hammering Xero's identity endpoint and rate-limit risk. ~20 connections × ~200ms = ~4s, well under 300s budget."
  - "Sentry capture wrapped in try/catch (mirrors sync-orchestrator.ts) — Sentry failures must never abort a cron run."
metrics:
  duration_minutes: ~30
  tasks_completed: 2
  tests_added: 9
  tests_passing: 9
  typecheck: clean
  lint_warnings_delta: 0 (181 → 181)
  files_changed: 4
  loc_added: ~580
  completed_date: 2026-05-06
---

# Phase 53 Plan 53-04: Proactive Xero Refresh Cron — Summary

**One-liner:** Adds `/api/cron/refresh-xero-tokens` running every 6 hours; iterates active `xero_connections`, calls `getValidAccessToken` per row, and surfaces per-connection token-health to Sentry with distinct invariant tags. Resets Xero's 60-day idle TTL 4× per day.

## Shipped vs Plan

| Item | Spec | Shipped | Notes |
|---|---|---|---|
| Route file | `src/app/api/cron/refresh-xero-tokens/route.ts` with GET, dynamic, maxDuration | Yes | 260 LOC; full JSDoc + inline pitfall comments |
| Test file | 9 vitest cases per spec | Yes | 9/9 pass |
| vercel.json | New cron at `0 */6 * * *` | Yes | 4 entries total, others unchanged byte-for-byte |
| Fail-closed auth | `if (!cronSecret \|\| header !== ...)` | Yes | F1 fix — uses `sync-all/route.ts:46-50` pattern |
| Snapshot-then-iterate | IDs queried once, mid-loop deactivation tolerated | Yes | Test 7 verifies |
| Per-connection isolation | One bad connection cannot abort the run | Yes | Test 6 verifies |
| Status mapping | refreshed / still_valid / failed / deactivated | Yes | Uses imported `REFRESH_THRESHOLD_MINUTES` (F2) |
| Sentry capture | aggregate + per-connection with distinct invariants | Yes | 4 distinct invariants; all wrapped in try/catch |
| Aggregate response shape | `{ success, total, refreshed, still_valid, failed, deactivated, results }` | Yes | HTTP 200 even when individual connections fail |

**No deviations from plan beyond the two FLAG fixes documented below. No deviation file written.**

## Plan-Check FLAG Resolutions

### F1 (info): Citation drift — FIXED

The plan's instruction to "mirror cron/daily-health-report:13-15" was misleading because that file's lines 13-15 are the **looser** pattern (`if (auth !== \`Bearer ${process.env.CRON_SECRET}\`)`), which passes when both sides are undefined.

**What I did:** Copied the strict fail-closed form from `src/app/api/Xero/sync-all/route.ts:46-50`:

```ts
const cronSecret = process.env.CRON_SECRET
const authHeader = req.headers.get('authorization')
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

**Test 4** explicitly covers the env-unset → 401 case (mirrors `xero-sync-all-cron-auth.test.ts:65`). The route's docstring also documents the choice with a pointer to the SEC-02 regression test.

### F2 (info): Hardcoded threshold duplication — FIXED (option a)

The plan hardcoded `15 * 60 * 1000` for `wasFreshBeforeCall`, duplicating `REFRESH_THRESHOLD_MINUTES` from `token-manager.ts:15`. A future change to that constant would silently desync the cron's status inference.

**What I did:** Exported `REFRESH_THRESHOLD_MINUTES` from `token-manager.ts` (option (a) per executor instruction — the export is a 1-word change). The route imports it and computes `REFRESH_THRESHOLD_MS = REFRESH_THRESHOLD_MINUTES * 60 * 1000` at the top of the loop. Now the cron's still_valid/refreshed inference automatically tracks the source of truth.

The export is documented inline in `token-manager.ts`:

```ts
// Standardized refresh threshold - refresh if token expires within 15 minutes.
// Exported (53-04 F2) so cron consumers can infer still_valid vs refreshed
// without duplicating the constant. If you change this, the cron's pre-call
// staleness inference automatically stays in sync.
export const REFRESH_THRESHOLD_MINUTES = 15;
```

## Test Results

**New suite: `src/__tests__/api/cron-refresh-xero-tokens.test.ts` — 9/9 pass, 0 fail, 0 flaky.**

| # | Test | Status |
|---|---|---|
| 1 | No `Authorization` header → 401 | PASS |
| 2 | Wrong Bearer → 401 | PASS |
| 3 | Valid Bearer → 200, calls supabase + getValidAccessToken | PASS |
| 4 | SEC-02 fail-closed (CRON_SECRET unset + no header → 401) | PASS |
| 5 | 3-connection aggregation (still_valid + refreshed + deactivated, Sentry tag check) | PASS |
| 6 | Per-connection throw isolated; loop continues, status='failed', Sentry tag | PASS |
| 7 | Mid-run deactivation of c1 does not abort iteration to c2 | PASS |
| 8 | Supabase fetch error → 500 + Sentry capture with `cron_refresh_xero_tokens` | PASS |
| 9 | Zero connections → 200 with all counters at 0, no Sentry capture | PASS |

**Regression check:**
- `cron-sync-all.test.ts`, `reconciliation-watch-cron.test.ts`, `xero-sync-all-cron-auth.test.ts`: **14/14 pass**
- `src/__tests__/xero/` (full xero suite, including 53-02 invariants and 53-03 race tests): **148/148 pass** — token-manager export change is non-breaking.

**Other gates:**
- `npx tsc --noEmit -p tsconfig.json` → exit 0, clean
- `npx eslint src --ext .ts,.tsx` → 181 warnings, 0 errors (identical to base `4f7495c` — no regression)
- `node -e "JSON.parse(...)"` on vercel.json → valid

## Final vercel.json Cron Snapshot

```json
{
  "crons": [
    { "path": "/api/cron/weekly-digest",          "schedule": "0 20 * * 0" },
    { "path": "/api/cron/sync-all-xero",          "schedule": "0 16 * * *" },
    { "path": "/api/cron/reconciliation-watch",   "schedule": "0 18 * * *" },
    { "path": "/api/cron/refresh-xero-tokens",    "schedule": "0 */6 * * *" }
  ]
}
```

4 entries total, well under Vercel's 100-cron-per-project limit.

## Schedule Collision Analysis

| UTC time | Crons firing | Conflict risk |
|---|---|---|
| 00:00 | refresh-xero-tokens | None |
| 06:00 | refresh-xero-tokens | None |
| 12:00 | refresh-xero-tokens | None |
| 16:00 | sync-all-xero | None (refresh-cron is at 12:00 + 18:00) |
| 18:00 | refresh-xero-tokens + reconciliation-watch | Same minute, but safe — refresh-cron completes in ~5s; reconciliation-watch reads from DB only and does not call getValidAccessToken |
| 20:00 (Sun) | weekly-digest | None |

The 18:00 UTC overlap is the only potential interaction. Both crons are safe under 53-03's per-connection 30s lock + post-lock re-fetch — the two will not deactivate connections via a rotation race.

## Commits on this PR

1. `c7abf09` — `test(53-04): add failing tests for refresh-xero-tokens cron + export REFRESH_THRESHOLD_MINUTES` (RED phase + F2 fix)
2. `b73895b` — `feat(53-04): implement refresh-only Xero token cron with per-connection isolation` (GREEN phase + F1 fix)
3. `0b2e44b` — `chore(53-04): register refresh-xero-tokens cron at 0 */6 * * *` (vercel.json registration)

## Post-Deploy Verification Checklist

These are NOT gating this plan's completion (Vercel deploy + cron tick required), but should be done before declaring **Phase 53** complete:

- [ ] **PENDING** — CI green on PR #110 (lint, typecheck, vitest, build, migration-check all pass)
- [ ] **PENDING** — Merge PR #110 to main; verify Vercel deploys without errors
- [ ] **PENDING** — At the next 6-hourly tick (or immediately via manual `curl -H "Authorization: Bearer $CRON_SECRET" https://<deployment>/api/cron/refresh-xero-tokens`), confirm:
  - Vercel Functions log shows 200 status for `/api/cron/refresh-xero-tokens`
  - Response `total` matches the count of `is_active=true` rows in `xero_connections`
  - All counters sum to `total` (`refreshed + still_valid + failed + deactivated === total`)
- [ ] **PENDING** — In Sentry, filter by `invariant:cron_refresh_xero_tokens*` — expect zero events under normal conditions. Any events represent real token-health problems to triage. (Note: the first 1-2 ticks after 53-03 deploy may surface connections that were transiently broken — those should self-heal as the retry backoff resolves.)
- [ ] **PENDING** — Re-run JDS manual disconnect → reconnect → forecast sync workflow; confirm the new cron does NOT cause spurious deactivations under the 53-03 rotation-race scenario.

## Forward-Looking Notes

- **Capacity planning:** Current portfolio is ~20 active Xero connections. Worst-case cron runtime ≈ 20 × 600ms = 12s, well under the 300s `maxDuration`. **When portfolio crosses ~400 active connections** (~240s expected runtime, ~80% of budget), revisit `maxDuration` and consider chunked iteration (e.g. process 100 connections per invocation, distribute across more frequent ticks). Until then, sequential single-pass is sufficient.
- **53-05 hand-off:** This plan keeps Sentry tags minimal — just enough to identify the connection (`connection_id`, `business_id`, `tenant_id`) and the failure mode (`invariant`). Plan 53-05 will enrich these with full Xero error body, error category, and structured route context. The 4 invariants registered here (`cron_refresh_xero_tokens`, `cron_refresh_xero_tokens_per_connection`, `cron_refresh_xero_tokens_failed`, `cron_refresh_xero_tokens_deactivated`) are stable and 53-05 should reuse them.
- **Schedule monitoring:** Vercel's free cron history retention is 7 days. If we ever need longer-term cron-run audit logs, that's a separate observability concern (likely lives in 53-05 or a future ops phase).

## Cross-References

- **Depended on 53-02** (PR #109, commit `4f7495c`) — centralized refresh through token-manager. The cron's `getValidAccessToken({ id }, supabase)` call goes through the single source of truth.
- **Depended on 53-03** (PR #108, commit `b5a233d`) — race-aware deactivation. Without 53-03, this cron's amplified refresh path across the entire portfolio every 6h would have triggered the rotation-race false-positive deactivation systematically — turning a sporadic JDS-style bug into a phase-wide outage.
- **Sets up 53-05** — observability + dashboard health surface. The 4 invariant tags shipped here are the foundation for 53-05's Sentry alerting and dashboard widget.

## Self-Check: PASSED

- File `src/app/api/cron/refresh-xero-tokens/route.ts`: FOUND
- File `src/__tests__/api/cron-refresh-xero-tokens.test.ts`: FOUND
- File `vercel.json` (modified): FOUND
- File `src/lib/xero/token-manager.ts` (modified): FOUND
- Commit `c7abf09`: FOUND on `feat/53-04-refresh-xero-tokens-cron`
- Commit `b73895b`: FOUND on `feat/53-04-refresh-xero-tokens-cron`
- Commit `0b2e44b`: FOUND on `feat/53-04-refresh-xero-tokens-cron`
- PR #110: opened on `Wisdomcg-ai/wisdom-business-intelligence`
- All 9 new tests pass; 14 adjacent cron tests pass; 148 xero suite tests pass; typecheck clean; ESLint warning count unchanged.
