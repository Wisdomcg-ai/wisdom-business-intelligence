# 53-03 Plan Check

**Verdict:** PASS with FLAGS — execution-ready. F3 should be addressed inline by executor; F1/F2/F4 are precision nits.

## Goal restated
1. No false-positive deactivation under concurrent refresh (Hole A + Hole B closed).
2. `unauthorized_client` retries 3× with backoff before deactivating.
3. `invalid_client` (config bug) never deactivates.
4. `access_denied` (legitimate revoke) deactivates immediately after defensive race-check.
5. Public signature of `getValidAccessToken` unchanged.
6. Every `is_active=false` write emits structured `logDeactivationDecision` payload.
7. Lock TTL 30s remains adequate.
8. Stays in scope (no edits to refresh-tokens, reactivate, vercel.json, Sentry, UI).

All 8 truths covered.

## Dimension scorecard
All 5 verification dimensions PASS. 18 tests across 7 describe blocks correctly cover race scenarios, per-error policies, and signature regression.

## Flags

| # | Severity | Issue | Fix |
|---|---|---|---|
| F1 | INFO | Plan's per-error table says `invalid_client` HEAD column "falls into unauthorized_client OR access_denied branch — bug". Actually falls to catch-all (no deactivate by accident); the real HEAD defect is absence of explicit branch + missing rationale string. | Update plan comment. No test change. |
| F2 | INFO | Lock TTL math overstates ("1s+2s+4s" sleeps + "3× refetch"); actual is 1s+2s only, 1× refetch. Real worst-case ~4.5s typical, ~18s under 5s-stall Xero. Conclusion (no TTL bump) still correct. | Adjust SUMMARY math. |
| F3 | **WARNING** | `DeactivationLogPayload` declares `business_id` and `tenant_id` but `refetchConnectionForRaceCheck` SELECTs only `id, expires_at, updated_at, access_token, is_active` — never populates them. Also `expires_at_pre: 'unknown'` literal discards data in scope. 53-05 needs these for Sentry tags. | (a) Extend SELECT to include `business_id, tenant_id` OR capture from outer-scope row; (b) populate `expires_at_pre` from pre-Xero-call row state; (c) add Test B2 assertion payload contains non-empty `business_id` AND `tenant_id`. |
| F4 | INFO | Test C3 asserts backoff "1000ms → 2000ms → 4000ms" but only 1s and 2s sleeps fire (no 4th attempt → no 4s sleep). | Drop the 4000ms assertion. |

## Cross-plan coordination

- `depends_on: []`, `wave: 1` — correctly positioned. 53-03 ships first, blocks 53-02/04/05 on rationale-enum + signature stability.
- 53-02: signature unchanged → centralization unblocked.
- 53-04: cron calls `getValidAccessToken` → race-protection automatic.
- 53-05: rationale enum is Sentry tag source; F3 fix required for usable tags.

## Bottom line
**PASS.** Proceed to execution. Executor fixes F3 inline (load-bearing for 53-05); may fix F1/F2/F4 as comment/SUMMARY fixes. No revision loop needed.
