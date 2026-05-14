# 61-03 PLAN-CHECK

**Verdict:** PASS

## Coverage analysis
Delivers (a) read broadening — drops `.eq('user_id', userId)` on the 4 daily_tasks reads and 3 ideas reads so RLS handles visibility, with `is_owner` derived; (b) `shareTask` / `shareIdea` mutation paths; (c) `markTaskComplete` / `markIdeaStatus` RPC proxies; (d) the three pre-existing ownership-gap fixes (`updateIdea`, `archiveIdea`, `getIdeaById`) called out in RESEARCH.md §3.

## Decision compliance
- `markTaskComplete` / `markIdeaStatus` explicitly route through `supabase.rpc(...)` — NOT a direct UPDATE. The "do NOT issue a direct `from('daily_tasks').update(...)`" assertion is a test in Group C of Task 1. This is the owner-only-UPDATE rule (D-2) enforced at the service layer.
- Owner-only mutations (`updateTaskStatus`, `updateTaskPriority`, `updateTaskDueDate`, `deleteTask`) keep their `.eq('user_id')` filter — Group D regression test pins this (D-2).
- Ownership-gap fixes land in 61-03 as required (D-7).
- `ideas_filter` helpers explicitly NOT touched — Group G regression test pins this (D-6).
- `getActiveIdeas` business-wide mode (when `businessId` provided) is UNTOUCHED — Group A2 regression test pins this (D-5 coexistence).

## Test coverage
Strong. ≥15 cases on dailyTasksService + ≥18 on ideasService = ≥33 unit tests. Covers all 4 expected dimensions: read broadening, share, RPC routing, owner-only retention. TDD shape (RED then GREEN commits).

## Issues found
None blocking.

Minor:
- Line 195: shareTask returns row "(with `is_owner: true` since the caller is the owner here)". Defensive but assumes the `.eq('user_id', userId)` filter succeeded — which it must have for `.select().single()` to return a row. Correct logic, just worth noting in code comments.
- The plan does not flag the route-style ambiguity (`/api/todos/[id]/share` vs alternative), but that lives in 61-04 — appropriate to defer.

## Nice-to-haves
- The chainable-mock pattern is reused across both test files — consider extracting to `__tests__/_supabaseMock.ts` if not already present. Executor's discretion.
- `getIdeaById` signature change (adds optional `viewerId`) preserves backwards compat — existing callers won't break.
