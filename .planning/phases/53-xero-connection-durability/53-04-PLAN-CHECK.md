# 53-04 Plan Check

**Verdict:** PASS with 2 non-blocking FLAGs

## Goal-backward decomposition

Phase goal restated: a refresh-only cron at `0 */6 * * *` keeps every active Xero connection alive 4× per day, with clean per-connection telemetry.

| # | Required truth | Plan addresses? |
|---|---|---|
| T1 | Cron registered at `0 */6 * * *` on `/api/cron/refresh-xero-tokens` | YES |
| T2 | Handler iterates `is_active=true` rows + calls `getValidAccessToken` per row | YES |
| T3 | Per-connection telemetry distinguishes refreshed/still_valid/failed/deactivated | YES |
| T4 | One bad connection does not abort the run | YES |
| T5 | Fails closed when `CRON_SECRET` unset | YES (Test 4) |
| T6 | Aggregate + per-connection failures land in Sentry with non-colliding tags | YES |
| T7 | DO NOT MERGE before 53-03 is live | YES (3 places) |
| T8 | Out-of-scope work explicitly excluded | YES |

## FLAGs (non-blocking)

### FLAG-1: Citation drift
The plan refers to `cron/daily-health-report:13-15` as the fail-closed template, but that file's line 13 is the LOOSER pattern. An executor literally copying lines 13-15 would copy the wrong pattern.

**Fix:** Update citation to `src/app/api/Xero/sync-all/route.ts:46-50` or to the SEC-02 regression test file `src/__tests__/api/xero-sync-all-cron-auth.test.ts`.

### FLAG-2: Hardcoded threshold duplication
The 15-min threshold is hard-coded as `15 * 60 * 1000` in the cron, duplicating `REFRESH_THRESHOLD_MINUTES` from `token-manager.ts:15`. Currently consistent with 53-03 (which preserves the constant), but a future change would silently desync `still_valid`/`refreshed` inference.

**Fix:** Either (a) export `REFRESH_THRESHOLD_MINUTES` from token-manager and import, OR (b) add inline comment "MUST stay in sync with token-manager.REFRESH_THRESHOLD_MINUTES".

## Dimension scorecard
All 10 dimensions PASS or N/A. Sentry invariant uniqueness verified — zero collisions with existing tags.

## Bottom line
**PASS.** Recommend FLAG-1 fixed before executor handoff (one-line citation fix). FLAG-2 is optional polish.
