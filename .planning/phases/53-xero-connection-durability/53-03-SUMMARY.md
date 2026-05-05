---
phase: 53-xero-connection-durability
plan: 03
subsystem: xero-token-lifecycle
tags: [xero, oauth, token-refresh, race-condition, observability-scaffolding]
requires:
  - 53-RESEARCH.md (race interleaving §4, error-code semantics §8)
provides:
  - "Race-closed getValidAccessToken (Hole A: post-lock row refetch + fresh refresh_token re-decrypt before Xero call)"
  - "Race-closed refreshTokenWithRetry (Hole B: pre-deactivation row refetch — suppresses deactivation on rotation race)"
  - "Tightened categorizeError per-error-code policy: unauthorized_client retries x3 before deactivating; invalid_client never deactivates; access_denied split into its own branch"
  - "Stable deactivation rationale enum (5 values) — 53-05 reuses these as Sentry tag values"
  - "logDeactivationDecision (single Sentry insertion point for 53-05)"
  - "categorizeError now exported for direct unit testing (3rd `attempt` parameter added)"
affects:
  - 53-02: signature unchanged → centralization unblocked
  - 53-04: cron will call getValidAccessToken → race-protection automatic
  - 53-05: logDeactivationDecision is the single seam to wrap with Sentry.captureException; rationale enum is the canonical tag set
tech-stack:
  added: []
  patterns:
    - "Post-lock refetch (close lock-acquire-to-Xero-call race window)"
    - "Pre-deactivation refetch (defensive race re-check before is_active=false write)"
    - "Per-attempt error-code policy (categorizeError takes attempt as 3rd arg)"
    - "Structured single-line deactivation log (JSON payload, Sentry-ready)"
key-files:
  created:
    - src/__tests__/xero/token-manager.test.ts
  modified:
    - src/lib/xero/token-manager.ts
decisions:
  - "Lock TTL 30s preserved — worst-case retry budget ~3.5s typical, ~13.5s under 5s-stall Xero (well under TTL)"
  - "previousErrorCode plumbing NOT added — categorizeError-by-attempt is sufficient; YAGNI"
  - "categorizeError exported (not previously) so C1/C2/D1/E1 direct unit tests can run"
  - "Empty stash containing unrelated STATE.md edits dropped at end of execution; STATE.md updates handled fresh by gsd-tools"
metrics:
  duration_minutes: 22
  red_test_count: 8  # tests failing on HEAD before Task 2
  green_test_count: 18  # all tests after Task 2
  net_loc:
    src/lib/xero/token-manager.ts: 367  # +401 -34
    src/__tests__/xero/token-manager.test.ts: 794
  completed_date: 2026-05-06
---

# Phase 53 Plan 03: Tighten Deactivation Logic in token-manager.ts — Summary

Closes the two race-condition holes documented in `53-RESEARCH.md` §4 that caused healthy Xero connections to be falsely marked `is_active=false` under concurrent refresh load. Tightens per-error-code deactivation policy so transient credential errors don't permanently kill connections on first occurrence. Adds the observability scaffolding (single-line structured deactivation log) that 53-05 will wrap with Sentry capture.

## What shipped

### Hole A — post-lock refetch

`getValidAccessToken` now re-fetches the connection row **immediately after acquiring the refresh lock** and re-decrypts the refresh_token before calling Xero. If a sibling rotated successfully during our lock-acquire window, `expires_at` is past threshold and we short-circuit to success without calling Xero.

**Trace:** `src/lib/xero/token-manager.ts` lines 245–298 (post-lock refetch + threshold short-circuit + fresh refresh_token re-decrypt).

### Hole B — pre-deactivation refetch

`refreshTokenWithRetry` now re-fetches the row **before every `is_active=false` write**. If `expires_at` advanced past threshold OR `updated_at` is newer than our pre-refresh snapshot, deactivation is suppressed and the sibling's rotated access_token is returned instead.

**Trace:** `src/lib/xero/token-manager.ts` lines 366–420 (call to `refetchConnectionForRaceCheck` + race-detected branch + structured log).

### Per-error-code policy (categorizeError)

| Error code (status) | shouldDeactivate (HEAD) | shouldDeactivate (53-03) | Retry behavior |
|---------------------|-------------------------|--------------------------|----------------|
| `invalid_grant` (400) | true | true (after race re-check) | No retry — terminal |
| `access_denied` (400) | true (collapsed with unauthorized_client) | true (after race re-check) | No retry — terminal — **own branch** |
| `unauthorized_client` (400) | true (first occurrence) | `attempt >= MAX_RETRIES` | Retry on attempts 1–2; deactivate on 3 |
| `invalid_client` (401) | (fell to catch-all by accident; F1) | **false** — explicit branch | Treated as transient |
| Generic 400 (no error field) | false | false (preserved) | Treated as transient |
| 429 / 5xx / network | transient (preserved) | transient (preserved) | Retry with backoff |

`categorizeError` gained a 3rd `attempt: number` parameter and is now `export`ed so C1/C2/D1/E1 direct unit tests can run.

### Structured deactivation log (Sentry insertion point for 53-05)

Every `is_active=false` write is preceded by a single `console.error('[Token Manager] deactivation_decision', JSON.stringify(payload))` carrying:

```ts
{
  decision: 'deactivate' | 'no_deactivate',
  rationale: 'invalid_grant_confirmed'
           | 'unauthorized_client_3x_exhausted'
           | 'access_denied_terminal'
           | 'invalid_client_ops_bug_no_deactivate'
           | 'race_detected_no_deactivate'
           | 'generic_400_no_deactivate',
  connection_id, business_id, tenant_id,           // <-- F3 fix
  attempt,
  xero_status, xero_error_code, xero_error_body,   // body truncated to 500 chars
  expires_at_pre, expires_at_post,                 // <-- F3 fix (no 'unknown' literal)
  updated_at_pre, updated_at_post
}
```

The rationale enum is the canonical Sentry tag value set 53-05 will use. `logDeactivationDecision` is the **single insertion point** 53-05 needs to wrap.

## F3 fix details (53-PLAN-CHECK WARNING — load-bearing for 53-05)

The plan check flagged that `DeactivationLogPayload` declared `business_id` and `tenant_id` but `refetchConnectionForRaceCheck` SELECTed only `id, expires_at, updated_at, access_token, is_active` — never populating them. Also `expires_at_pre: 'unknown'` was a literal string discarding data already in scope.

**Fix shipped:**

1. `refetchConnectionForRaceCheck` SELECT extended to: `id, business_id, tenant_id, expires_at, updated_at, access_token, refresh_token, is_active`. The cost is one extra column in the same query — negligible.
2. `getValidAccessToken` now passes a `RefreshContext` to `refreshTokenWithRetry` containing `{ business_id, tenant_id, expires_at_pre, updated_at_pre }` sourced from the post-lock `freshRow` (or pre-lock `connection` if lock not acquired).
3. The deactivation log payload populates `business_id` / `tenant_id` from `postFailureRow` (preferred) with `ctx` fallback. `expires_at_pre` always populated from the pre-Xero-call snapshot — never `'unknown'`.
4. Test B2 asserts:
   - `payload.business_id === 'biz-1'`
   - `payload.tenant_id === 'tenant-xyz'`
   - `payload.expires_at_pre` is truthy AND not `'unknown'`

Without this, 53-05's Sentry tags would have been missing critical fields (`business_id`, `tenant_id`) needed for per-business filtering and alerting.

## RED → GREEN test transitions

**8 tests failing on HEAD** (RED), all 18 tests passing post-Task-2 (GREEN). Per-test confirmation:

| Test | HEAD | post-Task-2 | Notes |
|------|------|------------|-------|
| A1 — already-valid token short-circuits | PASS | PASS | regression preservation |
| A2 — lock-not-acquired waits 2s, re-uses sibling-rotated token | PASS | PASS | regression preservation |
| **A3** — POST-LOCK refetch sees rotation, short-circuits | **FAIL** | **PASS** | Hole A new |
| **A4** — POST-LOCK refetch reads fresh refresh_token | **FAIL** | **PASS** | Hole A new |
| **B1** — invalid_grant + race detected → NO deactivate | **FAIL** | **PASS** | Hole B new |
| **B2** — invalid_grant + no race → DEACTIVATE (with full Sentry payload) | **FAIL** | **PASS** | Hole B + F3 |
| **B3** — race detection via updated_at advance | **FAIL** | **PASS** | Hole B alt-signal |
| **C1** — unauthorized_client attempt 1 returns shouldDeactivate=false | **FAIL** | **PASS** | policy new |
| C2 — unauthorized_client attempt 3 returns shouldDeactivate=true | (skip-fallback) | PASS | direct unit |
| **C3** — 3x unauthorized_client → 3 retries → deactivate | **FAIL** | **PASS** | integration |
| **C4** — 2x unauthorized_client + ok → success, no deactivate | **FAIL** | **PASS** | integration |
| D1 — invalid_client direct unit returns shouldDeactivate=false | (skip-fallback) | PASS | direct unit |
| D2 — 3x invalid_client → no deactivate | PASS | PASS | regression preservation |
| E1 — generic 400 direct unit returns shouldDeactivate=false | (skip-fallback) | PASS | direct unit |
| E2 — 3x generic 400 → no deactivate | PASS | PASS | regression preservation |
| F1 — 502 then 502 then 200 → success | PASS | PASS | regression preservation |
| F2 — 3x network error → network_error, no deactivate | PASS | PASS | regression preservation |
| G1 — ok response → row updated with new tokens | PASS | PASS | regression preservation |

(`skip-fallback` on HEAD = `categorizeError` was not exported, so the test took the `else` branch and trivially passed; post-Task-2 the export exists and the real assertion runs.)

C1/C2 unit-test branches gated on `typeof mod.categorizeError === 'function'` — gracefully degrade when the function is internal (HEAD), real-assert when exported (post-Task-2).

**Final tally:** 18/18 GREEN; full xero suite 134/134 GREEN (no regressions in employees-route, sync-orchestrator, organisation, parser tests).

## Verification — F2 corrected math (53-PLAN-CHECK)

Plan-check flagged that the plan's lock-TTL math overstated the worst case. The corrected math (used here):

- **Sleeps:** Only 1s + 2s fire (before attempts 2 and 3). After attempt 3 fails, no 4th sleep — we go straight to deactivation. Total sleep = **3s**.
- **Refetch:** Only 1× refetch on the deactivation path (post-failure refetch). The post-lock refetch is unconditional but happens BEFORE the retry loop. So in the retry loop itself: 1 refetch.
- **Xero call latency:** ~50–500ms typical, up to 5s under degraded conditions.
- **Worst-case typical:** 3s sleep + 3 × 500ms Xero = **~4.5s**
- **Worst-case under 5s-stall Xero:** 3s sleep + 3 × 5s Xero = **~18s** (still under 30s lock TTL)

**Conclusion:** Lock TTL stays at 30s. No bump applied. Plan F4 also flagged Test C3's misleading "1000ms → 2000ms → 4000ms" backoff assertion — corrected to assert only the 1s + 2s sleeps that actually fire.

## F1 corrected comment (53-PLAN-CHECK)

The plan's per-error policy table comment about HEAD's `invalid_client` handling said it "falls into unauthorized_client OR access_denied branch — bug." The actual HEAD behavior was that `invalid_client` fell to the **catch-all** (no deactivate **by accident**, with no rationale string and no clear policy). The rewritten `categorizeError` JSDoc reflects the real HEAD defect (`token-manager.ts` line 503: *"On HEAD, `invalid_client` had no explicit branch — it actually fell to the catch-all (no deactivate by accident), but with no rationale string and no clear policy."*).

## previousErrorCode plumbing — NO

The plan optionally allowed adding a `previousErrorCode` parameter through the recursive `refreshTokenWithRetry` call so that "if attempt 2's error code differs from attempt 1's, switch policy mid-flight" semantics could be implemented. This was **not added** in 53-03. `categorizeError(status, errorText, attempt)` looks at the current attempt's status/code only; the per-attempt policy emerges from `attempt >= MAX_RETRIES` for `unauthorized_client`.

This is YAGNI: the only multi-error-code interleaving that would matter is "first attempt unauthorized_client, second invalid_grant" — and that case is already handled correctly: invalid_grant on attempt 2 returns shouldDeactivate=true regardless of attempt count, race re-check still applies, deactivation proceeds appropriately. Adding `previousErrorCode` plumbing would add complexity without changing any observable behavior.

## Verification of all 16 call sites

`grep -rn "getValidAccessToken" src/ scripts/` returns 84 hits (imports + comments + actual calls). The 16 distinct routes documented in `53-RESEARCH.md` §2 plus chart-of-accounts' double-call site all compile cleanly under `npx tsc --noEmit -p tsconfig.json` (no output → clean).

Spot-checked:
- `src/app/api/Xero/employees/route.ts:173` — `getValidAccessToken(connection, supabase)` shape preserved
- `src/lib/xero/sync-orchestrator.ts:613` — same
- All other consumers pass the same `(connection, supabase)` shape

## Out-of-scope verification

`git diff main -- src/app/api/Xero/refresh-tokens/route.ts src/app/api/Xero/reactivate/route.ts vercel.json src/app/integrations/page.tsx` returns **0 lines**. No Sentry imports added (53-05 owns that). No CRON_SECRET wiring touched. Phase 50/51/52 + sync-orchestrator + employees-route tests all GREEN — no regression.

## Build + lint status

- `npx tsc --noEmit -p tsconfig.json` — clean (no output)
- `npx eslint src/lib/xero/token-manager.ts src/__tests__/xero/token-manager.test.ts` — clean (no output)
- `npx vitest run src/__tests__/xero/token-manager.test.ts` — 18/18 passed
- `npx vitest run src/__tests__/xero/` — 134/134 passed
- `npm run build` — fails locally on `/api/Xero/pl-summary` collection-phase due to missing `NEXT_PUBLIC_SUPABASE_URL` env var. **Pre-existing issue, unrelated to 53-03** — verified by reverting 53-03 changes; build still fails identically. Vercel CI will pass with production env vars set.

## Notes for downstream plans

### For 53-02

`getValidAccessToken` is now the canonical refresh path. Race-protection + retry + deactivation policy are all centralized correctly. The duplicate refresh code in `/api/Xero/refresh-tokens/route.ts` and `/api/Xero/reactivate/route.ts` can now be safely funneled through `getValidAccessToken` without losing any correctness property.

### For 53-04 (cron)

The proactive-refresh cron will iterate `is_active=true` connections and call `getValidAccessToken({ id: conn.id }, serviceRoleSupabase)` per connection. Race protection is automatic (post-lock refetch handles concurrent user load; pre-deactivation refetch handles concurrent rotation). Cron will NOT see false deactivations under concurrent user load.

### For 53-05 (Sentry)

- `logDeactivationDecision` is the **single insertion point** to wrap with `Sentry.captureException`. Mirror `sync-orchestrator.ts:354–368` try/catch pattern.
- Use `tags: { invariant: 'xero_token_deactivation', rationale, business_id, tenant_id, connection_id }` (rationale is the canonical tag value set documented above).
- Use `extra: { xero_status, xero_error_code, xero_error_body, attempt, expires_at_pre, expires_at_post, updated_at_pre, updated_at_post }`.
- The `'race_detected_no_deactivate'` log line is informational, not an exception — use `Sentry.captureMessage(level: 'info')` for it (or skip Sentry — race recoveries are healthy outcomes).

## Commits

- `a6dfb7b` — `test(53-03): add failing tests for token-manager race-closure + tightened categorization` (RED)
- `4da8549` — `fix(53-03): close token rotation race + tighten deactivation policy in token-manager` (GREEN)

## PR

https://github.com/Wisdomcg-ai/wisdom-business-intelligence/pull/108

## Self-Check: PASSED

Verified:
- `src/lib/xero/token-manager.ts` exists, contains `refetchConnectionForRaceCheck`, `logDeactivationDecision`, `race_detected_no_deactivate`, `invalid_client`, `attempt >= MAX_RETRIES` markers
- `src/__tests__/xero/token-manager.test.ts` exists, 18 tests
- Commits `a6dfb7b` and `4da8549` exist in `git log`
- Branch `feat/53-03-token-manager-tighten-deactivation` pushed to origin
- PR #108 opened
