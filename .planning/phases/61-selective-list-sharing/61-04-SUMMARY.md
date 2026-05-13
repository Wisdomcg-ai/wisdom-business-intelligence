---
phase: 61-selective-list-sharing
plan: 04
subsystem: api
tags: [nextjs, app-router, api-routes, sharing, rls-consumer, rpc-proxy, sentry, security-definer, daily_tasks, ideas]

# Dependency graph
requires:
  - "61-02: SECURITY DEFINER RPCs public.mark_task_complete(uuid, boolean) and public.mark_idea_status(uuid, text); broadened SELECT policies; 42501/22P02 error codes"
  - "61-03: service layer methods shareTask/shareIdea/markTaskComplete/markIdeaStatus (delegated-style is documented as an option; this plan calls Supabase directly so all validation lives in one place — see Decisions Made)"
provides:
  - "PATCH /api/todos/[id]/share — owner-only generic UPDATE; body { mode, userIds? }"
  - "PATCH /api/ideas/[id]/share — symmetric to todos/share, response key `idea`"
  - "PATCH /api/todos/[id]/complete — proxies supabase.rpc('mark_task_complete'); 42501 -> 403"
  - "PATCH /api/ideas/[id]/status — proxies supabase.rpc('mark_idea_status'); 42501 -> 403, 22P02 -> 400"
affects:
  - "61-05 (UI) can wire the share dialog and recipient mark-complete button to these endpoints"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Asymmetric route style: 'share' routes use a generic UPDATE with owner-only filters (mutations are owner-only by RLS); 'complete/status' routes proxy to SECURITY DEFINER RPCs (the only non-owner mutation channel)"
    - "404 vs 403 split: RLS-hidden row -> 404 (indistinguishable from non-existent); visible-but-not-owner -> 403 (friendly contract for recipients)"
    - "Body validation happens BEFORE row fetch where it is mode-independent (mode shape, completed-is-boolean, status-is-string) and AFTER fetch where it depends on row state (business_id null check)"
    - "Teammate validation against business_users.status='active' rejects stale UUIDs with HTTP 400 and `{ invalid: [...] }`; no UPDATE issued"
    - "PG error codes mapped explicitly: 42501 (insufficient_privilege) -> 403; 22P02 (invalid_text_representation) -> 400; 42501 and 22P02 do NOT call Sentry (expected user-error paths)"
    - "Sentry.captureException for unexpected paths only, with tags.route set per route ('todos/share', 'todos/complete', 'ideas/share', 'ideas/status')"
    - "force-dynamic on all four routes (Vercel pattern for mutation endpoints — these are PATCH handlers, never cached)"

key-files:
  created:
    - "src/app/api/todos/[id]/share/route.ts (132 lines)"
    - "src/app/api/todos/[id]/complete/route.ts (84 lines)"
    - "src/app/api/ideas/[id]/share/route.ts (130 lines)"
    - "src/app/api/ideas/[id]/status/route.ts (89 lines)"
    - "src/app/api/todos/[id]/share/__tests__/route.test.ts (264 lines, 16 tests)"
    - "src/app/api/todos/[id]/complete/__tests__/route.test.ts (175 lines, 11 tests)"
    - "src/app/api/ideas/[id]/share/__tests__/route.test.ts (252 lines, 16 tests)"
    - "src/app/api/ideas/[id]/status/__tests__/route.test.ts (195 lines, 12 tests)"
  modified: []

key-decisions:
  - "Direct Supabase calls (NOT delegated to dailyTasksService.shareTask / ideasService.shareIdea). Both styles exist in the codebase; the plan documented either as acceptable. Direct keeps all auth, body validation, ownership 403/404 split, AND business_users teammate validation in a single file per route. The 61-03 service methods remain unused by this route but stay available for non-HTTP callers."
  - "42501 and 22P02 deliberately bypass Sentry. These are expected user-error paths (recipient hit a row they cannot see, or sent a bogus status string). Sending them to Sentry would create noise. All other RPC errors and unexpected throws DO go to Sentry."
  - "Teammate validation rejects with HTTP 400 (not 422). The plan-check called this 'invalid teammate user_ids' and the existing codebase uses 400 for all body-shape and value-domain rejects on PATCH routes (e.g., forecast/seed-from-prior)."
  - "Routes return the bare row decorated with `is_owner: boolean` (NOT the full Task/Idea decoration with owner_display_name). The share route always returns `is_owner: true` (caller is the owner — that's the only path that reaches the success branch). The complete/status routes derive is_owner from the RPC return row's user_id vs auth.uid. owner_display_name is left for the service layer / UI to resolve from list reads (61-03)."

patterns-established:
  - "API surface pattern for selective-sharing: one share endpoint per resource (owner-only generic UPDATE with teammate validation), one status-flip endpoint per resource (RPC proxy with explicit PG error code mapping). Reusable for any future table that wants Private/Team/Specific with bounded recipient capabilities."

requirements-completed: []

# Metrics
duration: ~12min
completed: 2026-05-14
tasks-total: 4
tasks-completed: 4
files-created: 8
files-modified: 0
tests-added: 55
tests-passing: 55
---

# Phase 61 Plan 04: API Routes — Share, Complete, Status — Summary

**Four new App Router PATCH endpoints expose the sharing surface over HTTP. Share routes are owner-only with teammate validation against `business_users.status='active'`. Complete/status routes proxy to the SECURITY DEFINER RPCs from 61-02 — the only non-owner mutation channel. PG error codes 42501 and 22P02 are mapped to clean HTTP 403/400 responses without Sentry noise. 55 unit tests pin the contract. Zero `createServiceRoleClient`. Zero new `console.error`.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-14T09:29Z
- **Completed:** 2026-05-14T09:33Z
- **Tasks:** 4 of 4
- **Files created:** 8 (4 routes + 4 paired test suites)
- **Files modified:** 0
- **Tests added:** 55 (16 + 16 + 11 + 12)
- **Tests passing:** 55/55

## Accomplishments

1. **Owner-only share endpoints.**
   `PATCH /api/todos/[id]/share` and `PATCH /api/ideas/[id]/share` accept `{ mode: 'private' | 'team' | 'specific', userIds?: string[] }`. They:
   - 401 when there is no authenticated user.
   - 400 when `mode` is missing, not in the allowed set, or `'specific'` with missing/empty `userIds`.
   - 404 when the row is invisible (RLS-hidden — caller cannot distinguish from "doesn't exist").
   - 403 when the row IS visible but the caller is not the owner (a recipient cannot re-share — friendlier than RLS's silent 0-row reject).
   - 400 with `{ invalid: [<bad uuids>] }` when `mode='specific'` and ≥1 of `userIds` is not an active member of the row's business — and the UPDATE is NEVER issued in that path.
   - 400 when `mode='specific'` and the row has no `business_id` (cannot resolve teammates).
   - 200 with `{ task: { ...row, is_owner: true } }` (or `{ idea: ... }`) on success.

2. **Status-flip endpoints proxy to SECURITY DEFINER RPCs.**
   `PATCH /api/todos/[id]/complete` (body `{ completed: boolean }`) calls `supabase.rpc('mark_task_complete', { p_task_id, p_completed })`.
   `PATCH /api/ideas/[id]/status` (body `{ status: string }`) calls `supabase.rpc('mark_idea_status', { p_idea_id, p_status })`.
   These are the carve-out from RESEARCH.md §5 Risk 1 — the only mutation channel a non-owner recipient can use.

3. **Explicit PG error code → HTTP mapping.**

   | PG error code | HTTP status | Body shape | Sentry? |
   |---|---|---|---|
   | `42501` (insufficient_privilege) | 403 | `{ error: 'Access denied' }` | NO |
   | `22P02` (invalid_text_representation, ideas/status only) | 400 | `{ error: 'Invalid status', code: '22P02' }` | NO |
   | Any other RPC error | 500 | `{ error: '...', code }` | YES — captureException with `tags.route` |
   | Unexpected throw (try/catch fallback) | 500 | `{ error: 'Internal server error' }` | YES |

   42501 and 22P02 are deliberately excluded from Sentry: they are expected user-error paths and would otherwise create noise on every recipient hitting a row they can't see or every typo'd status.

4. **Body-shape validation matrix (tests assert all of it).**

   | Route | Body | Validation |
   |---|---|---|
   | `todos/share` | `{ mode, userIds? }` | mode required, in {private, team, specific}; userIds non-empty array iff specific |
   | `ideas/share` | `{ mode, userIds? }` | same as todos/share |
   | `todos/complete` | `{ completed }` | completed must be `typeof === 'boolean'` (not 'true'/1/null) |
   | `ideas/status` | `{ status }` | status must be a non-empty string |

5. **Sentry tags applied consistently.**
   - `tags: { route: 'todos/share' }`, `'todos/complete'`, `'ideas/share'`, `'ideas/status'` — matches Phase 46 SEC-07 convention.
   - `extra.context` includes the route name and the task/idea id when relevant.

6. **Zero `createServiceRoleClient` usage.** All four routes use `createRouteHandlerClient()` from `@/lib/supabase/server` (the user-scoped client). RLS gates row visibility; the SECURITY DEFINER RPCs do their own visibility check.

7. **Zero new `console.error` calls.** Hygiene asserted by an afterEach spy in all four test suites: any console.error in the route fails the test.

## Task Commits

1. **Task 1 (RED):** `6fa7f336` — `test(61-04): RED — share routes for todos + ideas`
2. **Task 2 (GREEN):** `c2ef72eb` — `feat(61-04): PATCH share routes for todos + ideas`
3. **Task 3 (RED):** `ba76a253` — `test(61-04): RED — complete/status routes`
4. **Task 4 (GREEN):** `42718562` — `feat(61-04): PATCH complete/status routes via SECURITY DEFINER RPCs`

## Files Created/Modified

### Created

- `src/app/api/todos/[id]/share/route.ts` (132 lines) — owner-only PATCH; body `{ mode, userIds? }`; 4 distinct 400/403/404/500 paths.
- `src/app/api/todos/[id]/complete/route.ts` (84 lines) — RPC proxy; 42501→403, other→500+Sentry.
- `src/app/api/ideas/[id]/share/route.ts` (130 lines) — symmetric to todos/share.
- `src/app/api/ideas/[id]/status/route.ts` (89 lines) — RPC proxy; 42501→403, 22P02→400, other→500+Sentry.
- `src/app/api/todos/[id]/share/__tests__/route.test.ts` (264 lines, 16 tests across groups A-F).
- `src/app/api/todos/[id]/complete/__tests__/route.test.ts` (175 lines, 11 tests across groups A-D).
- `src/app/api/ideas/[id]/share/__tests__/route.test.ts` (252 lines, 16 tests, symmetric).
- `src/app/api/ideas/[id]/status/__tests__/route.test.ts` (195 lines, 12 tests, adds 22P02 case).

### Modified

None.

## Verification Performed

| Check | Expected | Actual | Status |
|---|---|---|---|
| `npx vitest run` on all 4 suites | 55/55 pass | 55/55 pass | PASS |
| `grep -c "createServiceRoleClient"` on all 4 routes | 0 per file | 0, 0, 0, 0 | PASS |
| `grep -c "console\.error"` on all 4 routes | 0 per file | 0, 0, 0, 0 | PASS |
| `grep -c "Sentry\.captureException"` on share routes | ≥2 per file | 2, 2 | PASS |
| `grep -c "Sentry\.captureException"` on complete/status routes | ≥2 per file | 2 calls + 1 comment, 2 calls + 1 comment | PASS |
| `grep -c "mark_task_complete"` on todos/complete | ≥1 | 2 | PASS |
| `grep -c "mark_idea_status"` on ideas/status | ≥1 | 2 | PASS |
| `npx tsc --noEmit` filtered to new files | no errors | clean | PASS |
| Test asserts no UPDATE issued when teammate validation fails | true | confirmed (`updateSpy not called` + `updatePatch undefined`) | PASS |
| Test asserts 42501 path does NOT call Sentry | true | confirmed in both complete + status suites | PASS |
| Test asserts 22P02 path does NOT call Sentry (ideas/status only) | true | confirmed | PASS |
| Test asserts Sentry tag is correct route name | true | one assertion per error-handling test in all 4 suites | PASS |
| Test asserts is_owner is derived from `data.user_id === auth.uid` | true | tested both true and false branches in complete + status | PASS |

## Decisions Made

### 1. Direct Supabase calls, not delegated to 61-03 services

The plan documented both styles ("Routes MAY call these helpers or hit Supabase directly — both styles exist") and used the direct style in its skeleton. I followed the skeleton:

- Keeps auth, body validation, ownership 403/404 split, AND `business_users` teammate validation in a single readable file per route.
- The 61-03 service methods (`shareTask`, `shareIdea`, `markTaskComplete`, `markIdeaStatus`) remain available for non-HTTP callers (server actions, internal jobs).

Trade-off: a future change to share semantics requires touching two route files instead of one service method. Acceptable — the two share routes are 95% identical and any divergence is intentional (table name, response key, Sentry tag).

### 2. 42501 and 22P02 are NOT sent to Sentry

These are expected user-error paths:
- 42501: a recipient hit a row they cannot see (RLS visibility predicate rejected — could be a stale link, a removed teammate, or a typo'd id).
- 22P02: caller sent a bogus status string (e.g., 'totally-not-a-status').

Sending these to Sentry would create noise on every legitimate access-control rejection and every typo. The route still returns a proper HTTP status + body so the client can show the right error UI. Tests explicitly assert `Sentry.captureException was NOT called` on these paths.

### 3. `is_owner` is the only enrichment

The share route always returns `is_owner: true` (the success branch is reachable only by the owner). The complete/status routes derive it from the RPC return row. **`owner_display_name` is NOT computed here** — that lives in the service layer (61-03) on list reads and is already wired into the UI hand-off for 61-05. Adding it to these PATCH responses would require either a second round-trip or a JOIN in the SECURITY DEFINER RPC; neither is justified for a mutation endpoint.

### 4. `force-dynamic` on all four routes

These are mutation endpoints, never cached. The Vercel/Next.js convention for app-router mutation routes is `export const dynamic = 'force-dynamic'` — matches the pattern in `src/app/api/forecast/seed-from-prior/route.ts` and consistent across the codebase.

## Deviations from Plan

**None functional.**

One small test-side adjustment: the plan's Task 2 verify implied asserting `updateSpy` was `toBeUndefined()` when teammate validation rejects. Because the test mock creates the `.update` spy as part of the chainable builder at `from('daily_tasks')` time (before knowing whether the route will call `.update()`), the right assertion is `expect(updateSpy).not.toHaveBeenCalled()` AND `expect(updatePatch).toBeUndefined()`. Both pin the same invariant ("no UPDATE was issued") with the correct shape. Documented inline in the test file.

## Authentication Gates

None.

## Issues Encountered

None blocking. One small mock-shape iteration: the initial test had `expect(updateSpy).toBeUndefined()` which was tautologically wrong against the chainable-mock pattern (the spy is created the moment `from('daily_tasks')` runs, even if `.update()` is never invoked). Fixed by switching to `not.toHaveBeenCalled()` and adding a complementary `updatePatch` shape check. Resolved in 2 minutes during the initial GREEN cycle, no additional commit needed.

## Deferred Items

None. The plan-check noted route-style ambiguity (separate `/complete` and `/status` paths vs. reusing existing status routes) — the planner chose separate paths and that choice is now baked in. If a future phase consolidates the status routes, this would be the migration path.

## User Setup Required

None. These routes are pure code; no env vars, no secrets, no infrastructure.

## Next Phase Readiness

**61-05 (UI) has everything it needs:**

- `PATCH /api/todos/[id]/share` — share dialog can POST `{ mode, userIds? }` and handle 200 / 400 (with `invalid: [...]` for stale teammate validation) / 403 (not owner) / 404 (RLS-hidden).
- `PATCH /api/ideas/[id]/share` — symmetric, response key is `idea`.
- `PATCH /api/todos/[id]/complete` — recipient "Mark complete" button calls this; handle 200 / 403 / 500.
- `PATCH /api/ideas/[id]/status` — recipient/owner status flip; handle 200 / 400 (invalid status, body has `code: '22P02'`) / 403 / 500.

**Open dependency:** 61-02 must be applied to staging/prod before these routes can route real traffic through the RPCs. If the RPC doesn't exist, `supabase.rpc(...)` returns a generic error (function not found) which falls through to the 500 + Sentry path — safe but noisy. Confirm 61-02 migration is applied before 61-05 UI ships.

## Self-Check: PASSED

- `src/app/api/todos/[id]/share/route.ts` — FOUND
- `src/app/api/todos/[id]/complete/route.ts` — FOUND
- `src/app/api/ideas/[id]/share/route.ts` — FOUND
- `src/app/api/ideas/[id]/status/route.ts` — FOUND
- `src/app/api/todos/[id]/share/__tests__/route.test.ts` — FOUND
- `src/app/api/todos/[id]/complete/__tests__/route.test.ts` — FOUND
- `src/app/api/ideas/[id]/share/__tests__/route.test.ts` — FOUND
- `src/app/api/ideas/[id]/status/__tests__/route.test.ts` — FOUND
- `.planning/phases/61-selective-list-sharing/61-04-SUMMARY.md` — FOUND (this file)
- Commit `6fa7f336` (RED share) — FOUND in `git log`
- Commit `c2ef72eb` (GREEN share) — FOUND in `git log`
- Commit `ba76a253` (RED complete/status) — FOUND in `git log`
- Commit `42718562` (GREEN complete/status) — FOUND in `git log`

---
*Phase: 61-selective-list-sharing*
*Plan: 04 — API routes (share + complete + status)*
*Completed: 2026-05-14*
