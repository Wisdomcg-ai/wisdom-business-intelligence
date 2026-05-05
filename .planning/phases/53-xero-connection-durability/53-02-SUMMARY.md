---
phase: 53-xero-connection-durability
plan: 02
subsystem: api
tags: [xero, oauth, refresh-token, centralization, deduplication, token-manager, vitest]

# Dependency graph
requires:
  - phase: 53-01
    provides: server-side disconnect endpoint baseline pattern (auth + RBAC + dual-ID resolution)
  - phase: 53-03
    provides: tightened token-manager (post-lock row re-fetch closes Hole A; pre-deactivation refetch closes Hole B; per-error-code policy)
provides:
  - exactly-one refresh-token grant call site in src/app/api + src/lib (token-manager.ts)
  - reactivate route delegated to centralized helper (inherits 53-03 deactivation policy)
  - 4 invariant tests that lock the no-duplicates centralization goal in CI
  - eliminated /api/Xero/refresh-tokens dead route (was the lock-bypassing path that most likely caused JDS 2026-05-05 drop)
affects:
  - phase 53-04 (proactive refresh cron will iterate connections + call getValidAccessToken — will benefit from the lock + race-aware policy)
  - phase 53-05 (Sentry capture in token-manager will catch 100% of deactivation events because all paths now route through it)
  - any future Xero API consumer (must use getValidAccessToken; CI fails on duplicate via Test 3)

# Tech tracking
tech-stack:
  added: []  # No new dependencies — pure consolidation
  patterns:
    - "Invariant grep-tests in vitest: lock architectural invariants (one-call-site rules) by greping the source tree from inside a test and asserting file-list equality"
    - "Route delegation to centralized helpers via { id } sentinel: pass minimal sentinel + admin client so the helper re-fetches the row internally, sidestepping stale-in-memory race risk"

key-files:
  created:
    - src/__tests__/xero/phase-53-02-centralized-refresh.test.ts
  modified:
    - src/app/api/Xero/reactivate/route.ts
  deleted:
    - src/app/api/Xero/refresh-tokens/route.ts

key-decisions:
  - "Reactivate calls getValidAccessToken({ id }) instead of passing the full XeroConnection — forces fresh re-fetch inside the helper, closing any stale-in-memory race window between the route's connection lookup and the helper's lock acquire"
  - "Reactivate maps both 'token_expired_permanently' and 'token_revoked' to HTTP 401 + error: 'token_expired' (HEAD only mapped invalid_grant → 401; access_denied went to 500). Behavioral improvement; verified no FE caller branches on status===500 for this route"
  - "Test 3 (sharper invariant) restricts grep scope to src/app/api + src/lib (excludes __tests__ to avoid self-match, excludes scripts/ per F3 out-of-scope ruling)"
  - "Test 2 keeps wider URL-substring count + explicit allowlist (token-manager + callback) — this catches any new file pulling the URL string even if it doesn't yet form a refresh-token grant (defense in depth)"

patterns-established:
  - "Pattern: Invariant tests via greppable source tree — lock 'exactly N call sites' rules by listing files matching a pattern and asserting toEqual against the canonical allowlist. Future regressions trip CI before merge"
  - "Pattern: Centralization-via-deletion — when a 'good' helper exists and 'bad' duplicates exist, deletion + delegation is preferable to refactoring duplicates into wrappers. One commit per file (chore: delete + refactor: delegate + test: lock invariant)"

requirements-completed: ["53-02"]

# Metrics
duration: 18min
completed: 2026-05-06
---

# Phase 53 Plan 02: Centralize Xero Refresh Through token-manager Summary

**Deleted the lock-bypassing `/api/Xero/refresh-tokens` dead route + refactored reactivate to delegate refresh to the centralized `getValidAccessToken` helper, leaving exactly one `grant_type=refresh_token` call site in the runtime tree (token-manager.ts) — locked by 4 invariant vitest tests.**

## Performance

- **Duration:** ~18 min (08:30 → 08:48 UTC)
- **Started:** 2026-05-06T08:30:00Z
- **Completed:** 2026-05-06T08:48:00Z
- **Tasks:** 3
- **Files modified:** 3 (1 deleted, 1 refactored, 1 created)

## Accomplishments

- Eliminated the over-eager 400-deactivation duplicate route (`refresh-tokens`) that was the most-likely root cause of the 2026-05-05 JDS connection drop (per 53-RESEARCH §4 worst-case interleaving — concurrent refresh against stale rt + "any 400 → is_active=false" handler)
- Reactivate route now inherits 53-03's tightened deactivation policy for free: post-lock row re-fetch (closes rotation race), `unauthorized_client` retries 3× with backoff, never deactivates on 5xx/network/generic-400
- Reactivate now goes through the `token_refreshing_at` lock — concurrent reactivate + user-request can no longer both call Xero with the same stale refresh_token
- 4 invariant vitest tests lock the no-duplicates rule in CI permanently; a future PR re-introducing a duplicate refresh implementation OR an inline `fetch(identity.xero.com)` in reactivate fails before merge

## Task Commits

1. **Task 1: pre-deletion safety audit + delete refresh-tokens route** — `6611945` (chore)
   - Pre-deletion grep audit confirmed ZERO callers in src/, scripts/, vercel.json, public/ (logged at `/tmp/53-02-task1-audit.log`)
   - Deleted file (208 LOC); empty parent directory removed automatically
   - tsc clean, lint clean

2. **Task 2: refactor reactivate to delegate refresh to getValidAccessToken** — `1d2acf9` (refactor)
   - Replaced ~80 LOC inline block (`decrypt → fetch identity.xero.com → encrypt → save → flip`) with `getValidAccessToken({ id }, supabaseAdmin)` call + targeted `is_active=true` flip
   - Removed `decrypt`/`encrypt` imports — token-manager owns refresh-token crypto now
   - Auth + RBAC + dual-ID resolution + "already active early return" preserved exactly

3. **Task 3: lock centralized refresh invariant** — `23a0187` (test)
   - 4 tests, all GREEN; full Xero suite 148/148 GREEN (144 existing + 4 new)
   - Test 3 scope narrowed to `src/app/api + src/lib` to avoid self-match (the test file contains the grep pattern as a literal)

## Files Created/Modified

- **DELETED** `src/app/api/Xero/refresh-tokens/route.ts` (208 LOC) — duplicate refresh implementation, zero callers, over-eager deactivation
- **MODIFIED** `src/app/api/Xero/reactivate/route.ts` (193 → 196 LOC, +62 / -57 net) — now delegates refresh to `getValidAccessToken`; FE-facing response shape preserved for the existing 401/200/404/403 paths; behavioral diff documented inline (see Decisions)
- **CREATED** `src/__tests__/xero/phase-53-02-centralized-refresh.test.ts` (275 LOC) — 4 invariant tests

## Decisions Made

### F1 (PLAN-CHECK must-fix): document the access_denied 500→401 status change

For terminal failures:
- **HEAD:** all non-`invalid_grant` errors returned HTTP 500 / `error: 'refresh_failed'`.
- **Now:** `token_expired_permanently` (invalid_grant) AND `token_revoked` (access_denied OR `unauthorized_client` × MAX_RETRIES exhausted) BOTH return HTTP 401 / `error: 'token_expired'`.

This is a small behavioral improvement vs HEAD — terminal "user must reconnect" failures now correctly signal re-auth via 401 instead of being lumped into a generic 500. The change is documented in the route's JSDoc and in the commit message for `1d2acf9`.

**FE caller scan (per F1 requirement):**
- `src/app/integrations/page.tsx` end-to-end read: only logs `res.status` for the disconnect path (line 119); no branching on `status === 500` for the reactivate route. **No FE follow-up needed.**
- `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx:1430-1464`: branches on `syncRes.status === 404` and `reactivateResult.success` only — does NOT inspect the reactivate response status code. **No FE follow-up needed.**

### F2 (PLAN-CHECK must-fix): Test 2 invariant tightening

Per the plan-check, the original Test 2 (URL-substring count) and the actual goal ("exactly ONE refresh-implementation") were conflated. Resolution:

- **Test 2 renamed** to "URL-substring count" with explicit comment that this is a wide net (includes `callback` for authorization_code, would include middleware for CSP if scoped wider). Scope narrowed to `src/app/api + src/lib` so middleware drops out cleanly.
- **Test 3 added** as the SHARPER invariant: greps for both `grant_type=refresh_token` (URL-encoded form-body) AND `grant_type: 'refresh_token'` (JS object literal) shapes. Asserts exactly ONE match in `src/app/api + src/lib`, and it MUST be `src/lib/xero/token-manager.ts`. ~7 lines + test scaffolding.
- Test 4 (delegation test) preserves the runtime-behavior assertion for reactivate.

### F3 (PLAN-CHECK informational): scripts/ blind spot

`scripts/resync-envisage-now.ts:83` IS a real refresh duplicate — bypasses the lock, calls `https://identity.xero.com/connect/token` directly. Plan correctly out-of-scopes it (operator-only ops script, manually invoked). The invariant tests intentionally do NOT scan `scripts/` so this is a known blind spot for the test suite.

**Future cleanup work** should fold `resync-envisage-now.ts` into the centralized refresh path, OR replace it with a wrapper that calls `getValidAccessToken`. Documented here for the 53-closeout / future cleanup phase. Tracking: not opened as a separate plan because it's operator-script churn, but a single-task chore-PR could land it.

### Other decisions

- **Pass `{ id }` not full row to `getValidAccessToken`** — forces the helper to re-fetch internally, sidestepping any stale-in-memory race window between the route's `select * from xero_connections` and the helper's lock acquire. The helper's signature accepts both shapes; `{ id }` is the safer call site for reactivate.
- **Single targeted UPDATE for is_active flip** — do NOT re-write tokens here. token-manager already saved fresh `access_token` / `refresh_token` / `expires_at` in its successful refresh path. Re-writing them here would be redundant and could re-trigger the rotation behavior.
- **Re-read row after flip** to surface fresh `expires_at` to the FE — preserves existing "expires in N minutes" display semantics.

## Deviations from Plan

None of substance. The plan was executed exactly as written, with the three PLAN-CHECK fixes (F1, F2, F3) applied inline per the executor instructions in the prompt.

One mechanical adjustment: **Test 3's grep scope was narrowed to `src/app/api + src/lib`** (excluding `src/__tests__`) because the test file itself contains the grep pattern as a literal string — including `src/` in the scope caused the test to self-match. Restricting to runtime trees is the correct semantic anyway (per F3, scripts/ is intentionally out-of-scope; per F2, the meaningful invariant is on the runtime surface). Documented in test inline comments.

## Issues Encountered

**File-system / worktree side effect (operator note):**

The Write tool's first attempt at `src/app/api/Xero/reactivate/route.ts` resolved to the **main repo path** (`/Users/mattmalouf/Desktop/business-coaching-platform/src/...`) rather than this worktree's path (`/Users/mattmalouf/Desktop/business-coaching-platform/.claude/worktrees/agent-a01ef62a/src/...`), because the absolute path I supplied began with `/Users/mattmalouf/Desktop/business-coaching-platform/src/`. The Bash sandbox blocks me from operating on the main repo directory directly, so I cannot revert the accidental change there.

**Status:** the main repo's working tree is dirty on `feat/quality-ci-upgrade` with my refactor of `reactivate/route.ts`. The change is correct content (matches what's now committed in this worktree as `1d2acf9`) but it is uncommitted and on the wrong branch.

**Operator action recommended:** in the main repo at `/Users/mattmalouf/Desktop/business-coaching-platform`, run:
```bash
git checkout -- src/app/api/Xero/reactivate/route.ts
```
to discard the unintended modification. The same content has already shipped via this PR (#109) on the proper branch.

I subsequently re-issued the Write to the worktree's absolute path; that is the change captured in commit `1d2acf9`.

## Per-caller disposition table — actual outcome (matches plan)

| File:line | Grant | Disposition | Status |
|-----------|-------|-------------|--------|
| `src/lib/xero/token-manager.ts:376` | `refresh_token` | KEEP — canonical | ✅ Unchanged |
| `src/app/api/Xero/callback/route.ts:284` | `authorization_code` | KEEP — different grant | ✅ Unchanged |
| `src/app/api/Xero/refresh-tokens/route.ts:51` | `refresh_token` | DELETE entire file | ✅ Done (commit `6611945`) |
| `src/app/api/Xero/reactivate/route.ts:106` | `refresh_token` | REFACTOR — call getValidAccessToken | ✅ Done (commit `1d2acf9`) |
| `scripts/resync-envisage-now.ts:83` | `refresh_token` | OUT OF SCOPE | Documented as future cleanup |
| `src/middleware.ts:205` | (CSP allowlist) | UNCHANGED | ✅ Unchanged |

Post-execution invariant grep (Test 3 confirms): exactly ONE `grant_type=refresh_token` site in `src/app/api + src/lib`, in `src/lib/xero/token-manager.ts`.

## 16 consumer routes — verification

None of the 16 existing `getValidAccessToken` consumers needed source changes (`getValidAccessToken` public signature unchanged per 53-03's contract). Verified by:
- tsc clean across the entire `src/` tree (would catch any signature drift)
- vitest 148/148 GREEN including any test that exercises one of the consumers
- spot check: `npx vitest run src/__tests__/xero/sync-orchestrator-bs.test.ts` and `employees-route.test.ts` (top consumer-touching suites) all pass

## Coordination notes

- **53-04 not yet shipped** at the time 53-02 lands. The deleted `/api/Xero/refresh-tokens` route had no callers, so deleting it leaves no production gap. The 60-day refresh-token idle window is still reset by:
  - User-driven traffic via the centralized `getValidAccessToken` (16 consumer routes)
  - The existing daily `/api/cron/sync-all-xero` (16:00 UTC) which calls `getValidAccessToken` per-business per-tenant via sync-orchestrator
- Until 53-04 ships, no connection is at material risk of crossing the 60-day idle TTL between active syncs.

## User Setup Required

None — no external service configuration required.

## Smoke Test

**Skipped — automated invariant tests cover the gap.**

The PLAN's optional smoke test (start dev server, click forecast wizard, observe `[Token Manager]` log lines fire while no `[Token Refresh]` lines from the deleted route appear) was not executed because:
1. The deleted route's only function was its `[Token Refresh]` log lines; deleting the file removes the possibility of those lines firing.
2. Test 1 asserts the route file is gone (filesystem check).
3. Tests 2 + 3 + 4 collectively assert the centralized helper is the only refresh path.
4. Local `npm run build` requires Supabase env vars not present in the sandbox (per the 44-01 STATE caveat), so a true dev-server smoke would require operator-side setup.

The Vercel preview build for PR #109 will exercise the runtime path during preview deployment.

## PR

**PR #109:** https://github.com/Wisdomcg-ai/the-business-coaching-platform/pull/109 (corrected URL: PR opened against the correct repo `Wisdomcg-ai/wisdom-business-intelligence`)

Title: `feat(53-02): centralize Xero refresh through token-manager; delete duplicate routes`

Awaiting:
- [ ] CI green (5 parallel jobs per 44-03: migration-check, lint, typecheck, vitest, build)
- [ ] Vercel preview build success
- [ ] Post-merge: manual sentinel on JDS preview — trigger reactivate, confirm token-manager log lines fire (no `[Token Refresh]` from the deleted route)

## Next Phase Readiness

Ready for **53-04 (Proactive refresh cron)**. With centralization complete:
- 53-04's cron loop iterates `is_active=true` connections and calls `getValidAccessToken(connection, supabase)` per row
- Each call goes through the lock + retry + race-aware deactivation policy automatically
- 53-05 (Sentry capture in token-manager) will catch 100% of deactivation events because all paths now route through `token-manager.ts:218-225`

## Self-Check: PASSED

- ✅ `src/app/api/Xero/refresh-tokens/route.ts` does not exist (Test 1 confirms)
- ✅ `src/app/api/Xero/reactivate/route.ts` calls `getValidAccessToken` and does not call `fetch(identity.xero.com)` directly (Test 4 confirms)
- ✅ Commit `6611945` (Task 1) exists
- ✅ Commit `1d2acf9` (Task 2) exists
- ✅ Commit `23a0187` (Task 3) exists
- ✅ PR #109 open against `main`
- ✅ All 4 new invariant tests GREEN
- ✅ Full `src/__tests__/xero/` suite 148/148 GREEN (no regressions)
- ✅ tsc clean, lint clean (zero new errors)
- ⚠️ `npm run build` could not complete locally (missing Supabase env vars in sandbox; same caveat as 44-01); Vercel CI will exercise

---
*Phase: 53-xero-connection-durability*
*Completed: 2026-05-06*
