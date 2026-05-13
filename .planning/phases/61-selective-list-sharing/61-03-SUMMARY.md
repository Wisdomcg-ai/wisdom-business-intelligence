---
phase: 61-selective-list-sharing
plan: 03
subsystem: service-layer
tags: [supabase, service-layer, sharing, ownership, rls-consumer, daily_tasks, ideas, ideas_filter-untouched, postgrest-nested-select]

# Dependency graph
requires:
  - "61-01: daily_tasks.shared_with_all + daily_tasks.shared_with + ideas.shared_with_all + ideas.shared_with columns exist"
  - "61-02: RLS broadened so RLS — not service code — gates row visibility"
  - "61-02: SECURITY DEFINER RPCs public.mark_task_complete(uuid, boolean) and public.mark_idea_status(uuid, text)"
provides:
  - "dailyTasksService.shareTask(taskId, mode, userIds?) — private/team/specific, defensive .eq('user_id'), validation"
  - "dailyTasksService.markTaskComplete(taskId, completed) — RPC-only path; no direct UPDATE"
  - "dailyTasksService READ functions (getTodaysTasks, getTodaysCompletedTasks, getArchivedTasks, getAllTasks) return rows with is_owner + owner_display_name; RLS handles visibility"
  - "ideasService.shareIdea(id, mode, userIds?) mirrors shareTask"
  - "ideasService.markIdeaStatus(id, status) — RPC-only; no direct UPDATE"
  - "ideasService.getActiveIdeas (legacy mode) + getIdeasByStatus + getIdeaById decorate rows with is_owner + owner_display_name"
  - "ideasService.getIdeaById(id, viewerId?) — new optional viewerId; tags is_owner; backward-compatible"
  - "ideasService ownership-gap fixes: updateIdea + archiveIdea both add defensive .eq('user_id', userId)"
affects:
  - "61-04 (API routes) can call shareTask/shareIdea/markTaskComplete/markIdeaStatus directly"
  - "61-05 (UI) can render is_owner / owner_display_name without an extra round-trip per row"
  - "61-06 (coach counts) consumes the same broadened read path"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PostgREST nested select for owner display name: `*, owner:users!user_id(first_name, last_name, email)` — single-query enrichment"
    - "Defensive owner-only mutation filter (`.eq('user_id', userId)`) is_owner_complementing the RLS owner-only UPDATE policy from 61-02 (belt-and-suspenders)"
    - "RPC delegation for cross-owner status flips — service NEVER bypasses with a direct UPDATE on daily_tasks / ideas status columns"
    - "Decoration helpers `decorateTask` / `decorateIdea` strip the join key off the return shape so callers see a clean `Task` / `Idea`"
    - "Silent-null error convention preserved for new methods (zero new console.error calls)"

key-files:
  created:
    - "src/lib/services/__tests__/dailyTasksService.share.test.ts"
    - "src/lib/services/__tests__/ideasService.share.test.ts"
  modified:
    - "src/lib/services/dailyTasksService.ts"
    - "src/lib/services/ideasService.ts"

key-decisions:
  - "owner_display_name resolved via `public.users` (not `business_users`). The plan's resolved_flags specified business_users.first_name/last_name, but the baseline schema places those columns on public.users — keyed identically to user_id. Single-query nested select gives the same data with the same fallback semantics (First Last → First → Last → email → 'Team member')."
  - "Recipient status flips MUST go through the RPC. Both markTaskComplete and markIdeaStatus call supabase.rpc(...) — the test suite explicitly asserts that from('daily_tasks') / from('ideas') were never invoked during the call."
  - "ideasService.getIdeaById signature change is backwards-compatible (viewerId is optional). All three existing callers in src/app/ideas/ continue to work without modification."
  - "updateIdea and archiveIdea now require a user to be authenticated (throws 'Not authenticated' if no user). Was previously silently a no-op via RLS rejection; now fails fast at the service layer."
  - "Silent-null path for new methods avoids inflating console.error counts. Existing methods' console.error logging is preserved verbatim."

patterns-established:
  - "Service-layer pattern for selective-sharing reads: drop user_id filter, derive is_owner against the caller, hydrate owner_display_name via PostgREST nested select against public.users."
  - "Service-layer pattern for recipient-allowed mutations: route through SECURITY DEFINER RPC, never a direct UPDATE — keeps owner-only UPDATE policies intact."

requirements-completed: []

# Metrics
duration: ~25min
completed: 2026-05-14
tasks-total: 4
tasks-completed: 4
files-created: 2
files-modified: 2
tests-added: 56
tests-passing: 56
---

# Phase 61 Plan 03: Service Layer Sharing — Summary

**Two service modules broadened to read shared rows, two RPC proxy methods added, three pre-existing ownership gaps closed, and 56 unit tests pinning the contract — all without inflating console.error logging.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-14
- **Completed:** 2026-05-14
- **Tasks:** 4 of 4
- **Files modified:** 2 (`dailyTasksService.ts`, `ideasService.ts`)
- **Files created:** 2 (test files)
- **Tests added:** 56 (26 daily_tasks + 30 ideas)
- **Tests passing:** 56/56

## Accomplishments

1. **Read broadening.** Dropped `.eq('user_id', userId)` from 7 service reads (4 in `dailyTasksService`, 3 in `ideasService`). RLS from 61-02 is now the sole gate on row visibility — shared rows naturally surface alongside owned rows.

2. **Owner-derivation.** Every returned `Task` and `Idea` now carries:
   - `is_owner: boolean` — `row.user_id === viewerId`
   - `owner_display_name: string` — coalesce(first+last, first, last, email, 'Team member') resolved via a single PostgREST nested select against `public.users`. Tests cover all four fallback branches with a fixture row where the owner is a different user from the viewer.

3. **Share methods.** `shareTask(id, mode, userIds?)` and `shareIdea(id, mode, userIds?)`:
   - Three modes (`private` / `team` / `specific`).
   - `specific` mode validates `userIds` is non-empty (returns null on violation).
   - Defensive `.eq('user_id', userId)` on the UPDATE chain — RLS also enforces; this is belt-and-suspenders.
   - Returns the decorated row with `is_owner: true` on success, null on error.

4. **Recipient-safe status flips.** `markTaskComplete(id, completed)` and `markIdeaStatus(id, status)`:
   - Both call `supabase.rpc('mark_task_complete', ...)` / `supabase.rpc('mark_idea_status', ...)` from 61-02.
   - Test suite asserts the `from(...)` spy was NEVER invoked for the underlying table during these calls — the RPC is the only path.

5. **Ownership-gap fixes (RESEARCH.md §3).**
   - **§3.1 `updateIdea`** (line 251): added `.eq('user_id', userId)` at line **264**. Now also requires an authenticated user (throws if not).
   - **§3.2 `archiveIdea`** (line 278): added `.eq('user_id', userId)` at line **291**. Same auth requirement.
   - **§3.3 `getIdeaById`** (line 196): signature broadened to accept optional `viewerId` so the row can be tagged with `is_owner`. No `.eq('user_id')` added — recipients must read shared rows. Backward-compatible (all existing callers pass `(id)` only and still work).

6. **Untouched (regression-pinned).**
   - `ideas_filter` helpers (`getIdeasFilterByIdeaId`, `upsertIdeasFilter`) — stay per-user per CONTEXT.md.
   - `getIdeasWithFilters` — still per-user (verified by Group G test).
   - `getActiveIdeas` shared-board mode (when `businessId` provided) — still queries by `business_id` only (verified by Group A2 test).

## Task Commits

1. **Task 1: RED — failing dailyTasksService tests** — `d43558e0` (test)
2. **Task 2: GREEN — dailyTasksService implementation** — `5e782c1c` (feat)
3. **Task 3: RED — failing ideasService tests** — `d306b93b` (test)
4. **Task 4: GREEN — ideasService implementation** — `bea1e35d` (feat)

## Files Created/Modified

- **`src/lib/services/dailyTasksService.ts`** (modified) — read broadening on 4 functions; added `Task` fields `shared_with_all`, `shared_with`, `is_owner`, `owner_display_name`; added `shareTask` and `markTaskComplete` methods (both on the class and as standalone backwards-compat exports); added `decorateTask` + `resolveOwnerDisplayName` helpers; preserved every existing owner-only filter on update/delete paths.

- **`src/lib/services/ideasService.ts`** (modified) — same pattern. Read broadening on 3 functions. `Idea` type gains sharing+derived fields. `shareIdea` + `markIdeaStatus` added. Three ownership-gap fixes applied. `ideas_filter` block untouched.

- **`src/lib/services/__tests__/dailyTasksService.share.test.ts`** (created, ~410 lines) — Groups A-D, 26 tests, chainable Supabase mock with per-chain operation tracking so SELECT-vs-UPDATE filter assertions never cross-contaminate.

- **`src/lib/services/__tests__/ideasService.share.test.ts`** (created, ~485 lines) — Groups A-G, 30 tests, same mock pattern; Group G specifically pins the ideas_filter / shared-board / per-user-getIdeasWithFilters regressions.

## Verification Performed

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `npx vitest run` on both new suites | 56/56 pass | 56/56 pass | PASS |
| `npx tsc --noEmit` on changed files | no new errors | clean | PASS |
| `grep -c "rpc('mark_task_complete'" dailyTasksService.ts` | ≥1 | 1 | PASS |
| `grep -c "rpc('mark_idea_status'" ideasService.ts` | ≥1 | 1 | PASS |
| `grep -cE "console.error\(" dailyTasksService.ts` | 11 (baseline) | 11 | PASS |
| `grep -cE "console.error\(" ideasService.ts` | 17 (baseline) | 17 | PASS |
| `grep -c "shared_with" dailyTasksService.ts` | ≥3 | 9 | PASS |
| `grep -nE "user_id" ideasService.ts \| grep -E "Phase 61-03"` | 2 matches (updateIdea + archiveIdea) | 2 matches at lines 264, 291 | PASS |
| Test asserts `from('daily_tasks')` never called in `markTaskComplete` | true | confirmed by Group C test | PASS |
| Test asserts `from('ideas')` never called in `markIdeaStatus` | true | confirmed by Group F test | PASS |
| Mixed-owner fixture row asserts `is_owner` + `owner_display_name` | both groups (A on each service) | passes | PASS |

## Decisions Made

1. **`owner_display_name` resolution source.** The plan's `<resolved_flags>` block specified joining `business_users.first_name || ' ' || business_users.last_name`, but the actual `business_users` table (baseline schema lines reviewed) does NOT carry those columns — it has `business_id`, `user_id`, `role`, `status`, `section_permissions`, etc. The same data the resolved_flags block describes lives on `public.users` keyed by `id` (= `user_id`). Implementation joins `users` via `owner:users!user_id(first_name, last_name, email)`. The fallback ladder (First Last → First → Last → email → 'Team member') matches the resolved_flags spec exactly. Documented as Deviation 1 below.

2. **`updateIdea` / `archiveIdea` now require auth.** Pre-change behavior: silent no-op when no auth (RLS rejection). Post-change: throws `'Not authenticated'`. Matches every other write path in the file (`createIdea`, `upsertIdeasFilter`).

3. **Silent-null on new methods.** `shareTask`, `shareIdea`, `markTaskComplete`, `markIdeaStatus` return null on error without logging. The phase-61-03 `<critical_constraints>` rule #9 ("ZERO new `console.error` calls") drove this. Existing logging on legacy methods is preserved verbatim.

## Deviations from Plan

**1. [Rule 3 — Blocking issue] `owner_display_name` join source.**
- **Found during:** Task 2 (implementation of `dailyTasksService` read broadening).
- **Issue:** The plan's `<resolved_flags>` block references `business_users.first_name || ' ' || business_users.last_name`, but the baseline schema (`supabase/migrations/00000000000000_baseline_schema.sql`) defines `business_users` as `(id, business_id, user_id, role, status, section_permissions, ...)` — there are no `first_name` / `last_name` columns on that table. Those columns exist on `public.users` instead, keyed by `id = user_id`.
- **Fix:** Implemented the nested select against `public.users` (`*, owner:users!user_id(first_name, last_name, email)`). All four fallback branches (First Last → First → Last → email → 'Team member') match the resolved_flags spec exactly. Same single-query semantics; same UI surface.
- **Files modified:** `src/lib/services/dailyTasksService.ts`, `src/lib/services/ideasService.ts`.
- **Commits:** `5e782c1c`, `bea1e35d`.

**2. [Plan signature delta] `getIdeaById` now accepts `viewerId` (and `updateIdea` / `archiveIdea` accept `overrideUserId`).**
- These are additive optional parameters specified in the plan itself; not a deviation. Logged here only because callers that want `is_owner` on a single-fetch idea must now opt in by passing the viewerId. All three existing callers (`src/app/ideas/page.tsx`, `src/app/ideas/[id]/evaluate/page.tsx`) continue to work without changes.

## Authentication Gates

None.

## Issues Encountered

None blocking. One minor mock-design iteration: the initial chainable-Supabase mock conflated SELECT-path filter calls with UPDATE-path filter calls (because `getTodaysTasks` also runs `archiveOldCompletedTasks` which legitimately uses `.eq('user_id', userId)` on the UPDATE path). Fixed by tagging each captured filter call with the active chain op, so `selectUserIdEq()` / `mutationUserIdEq()` helpers can distinguish "broadened SELECT path has no user_id filter" from "owner-only UPDATE path retains its user_id filter".

## Deferred Items

- The plan-check note about extracting the chainable mock into a shared `__tests__/_supabaseMock.ts` was left as-is — both test files use the same shape, but the duplication is small (~80 lines each) and the per-test customizations (e.g., `upsert` for ideas, RPC response shape) made extraction marginal. Can be done later if a third sharing-related test file lands.

## User Setup Required

None.

## Next Phase Readiness

**61-04 (API routes) has everything it needs:**
- `shareTask(id, mode, userIds?)` and `shareIdea(id, mode, userIds?)` exist and validate input — the API can delegate without re-implementing the patch logic.
- `markTaskComplete(id, completed)` and `markIdeaStatus(id, status)` route through the RPCs — no carve-out logic required at the route layer.
- All four READ functions return decorated rows; the API can pass them through to the client unchanged.

**61-05 (UI) has everything it needs:**
- `is_owner` is set on every row in every list read.
- `owner_display_name` is set on every row — the "Shared by …" badge needs no second round-trip.
- The `updateIdea`/`archiveIdea` ownership-gap fixes mean shared-recipient edit attempts will surface as the same `'Not authenticated'` / RLS error pattern as anywhere else; UI can present a single error path.

**Open items:**
- 61-02 has shipped the RPCs locally but the migration must be applied to staging/prod before this service-layer code can route real traffic through `markTaskComplete` / `markIdeaStatus`. Service code is safe to deploy first — if the RPC isn't present, calls return null (no crash).

## Self-Check: PASSED

- `src/lib/services/dailyTasksService.ts` — FOUND, modified
- `src/lib/services/ideasService.ts` — FOUND, modified
- `src/lib/services/__tests__/dailyTasksService.share.test.ts` — FOUND, 26 tests pass
- `src/lib/services/__tests__/ideasService.share.test.ts` — FOUND, 30 tests pass
- `.planning/phases/61-selective-list-sharing/61-03-SUMMARY.md` — FOUND (this file)
- Commit `d43558e0` (test RED dailyTasks) — FOUND in `git log`
- Commit `5e782c1c` (feat GREEN dailyTasks) — FOUND in `git log`
- Commit `d306b93b` (test RED ideas) — FOUND in `git log`
- Commit `bea1e35d` (feat GREEN ideas) — FOUND in `git log`

---
*Phase: 61-selective-list-sharing*
*Completed: 2026-05-14*
