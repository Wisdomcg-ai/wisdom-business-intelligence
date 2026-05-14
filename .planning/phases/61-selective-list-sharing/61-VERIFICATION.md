# Phase 61 Verification

**Verdict:** PASS
**Verified:** 2026-05-14
**Branch:** `phase-61-selective-list-sharing` (not merged, not pushed)

## Goal Achievement Matrix

| # | Dimension | Verdict | Evidence | Notes |
|---|-----------|---------|----------|-------|
| 1 | Share daily_tasks + ideas with team OR specific teammates | OK | `supabase/migrations/20260514000000_phase61_add_sharing_columns.sql:23-45` (4 columns + 2 GIN); `src/app/api/todos/[id]/share/route.ts:27-132`; `src/app/api/ideas/[id]/share/route.ts:21-123`; `src/components/sharing/ShareDialog.tsx:32-289` (three radio modes); RLS additive ORs in `…20260514000001_phase61_sharing_rls.sql:45-57,89-116` | Both tables get `shared_with_all bool` + `shared_with uuid[]`; share routes accept `{ mode, userIds? }`; ShareDialog exposes Private / Everyone on team / Specific people. |
| 2 | Default to private | OK | Migration columns `NOT NULL DEFAULT false` and `DEFAULT '{}'::uuid[]` (`…000000.sql:24,27,39,42`); ShareDialog seeds `mode = currentMode` and `deriveShareMode` returns `'private'` when both flags false/empty (`ShareDialog.tsx:280-289`); `dailyTasksService.shareTask` rejects empty specific (`dailyTasksService.ts:572-576`) | All pre-existing rows become private with no backfill needed. |
| 3 | Recipients can mark complete | OK | RPCs `mark_task_complete` (`…000001.sql:140-190`) and `mark_idea_status` (`…000001.sql:211-281`) — both SECURITY DEFINER, `search_path=public`, `GRANT EXECUTE … TO authenticated`, REVOKE PUBLIC; `/api/todos/[id]/complete/route.ts:49-67` calls `supabase.rpc('mark_task_complete', …)` (NOT a generic UPDATE); `/api/ideas/[id]/status/route.ts:48-72`; `src/app/todo/page.tsx:140-148` (recipient branch routes through `/api/todos/[id]/complete`); `TaskItem` Complete button shown regardless of ownership (`page.tsx:334-338`) | Owner-only UPDATE policies remain on tables (lines 38-41 of RLS migration); RPC is the only non-owner write channel. |
| 4 | Recipients cannot edit/delete | OK | Owner-only INSERT/UPDATE/DELETE policies intentionally **not modified** (`…000001.sql:32-41`); `dailyTasksService.ts:466,487,513,531,548,591` retain `.eq('user_id', userId)` on every mutation; `ideasService.updateIdea` (line 264) + `archiveIdea` (line 291) gained defensive `.eq('user_id', userId)`; `/todo` hides DueDate/Share/Delete on `is_owner === false` rows (`page.tsx:285,310-326`); `/ideas` hides kebab via `isOwner &&` gate (`page.tsx:260,274`) | Belt-and-suspenders: RLS + service-layer filter + UI hide. |
| 5 | Owners retain full control | OK | Share routes return `{ task: { …, is_owner: true } }` only on owner success path; ShareDialog re-derivable from row via `deriveShareMode` (`ShareDialog.tsx:280-289`); owner-only RLS unchanged so all existing flows pass through | Owner can toggle Private ↔ Team ↔ Specific any number of times via the same dialog. |
| 6 | Coach dashboard owned vs team-shared idea counts | OK | `/api/coach/client-completion/route.ts:36-39,750-805` emits `ideas_total / ideas_private / ideas_team_shared / ideas_breakdown` per client; dedup-by-id guards against double-count (lines 772-779); `/coach/clients/[id]/page.tsx:605-629` runs its own ideas query and computes `{private, teamShared}`; `OverviewTab.tsx:31-35,233-242` renders "X private · Y shared with team" sub-line ONLY when `teamShared > 0` | Headline `ideas_total` preserves pre-phase count (regression-pinned by Group D test); breakdown is conditional so single-user clients see no UI change. |
| 7 | Coexistence (action_items, issues_list, ideas_filter, business-wide shared board) | OK | Migrations: zero DDL touches forbidden tables (only header comments mention them); `grep "from\('(action_items\|issues_list\|ideas_filter)'\)"` across the phase 61 surface (sharing components, todo/ideas pages, share/complete/status routes) returns zero hits; `ideasService.getIdeasFilterByIdeaId` (line 542) and `upsertIdeasFilter` (line 563) untouched; `getActiveIdeas` shared-board mode preserved (pinned by ideasService test Group A2) | The `issues_list` reference in `client-completion/route.ts` is pre-existing coach-dashboard code, not a Phase 61 modification. |

## Test coverage

| Suite | Tests | Status |
|-------|-------|--------|
| `src/lib/services/__tests__/dailyTasksService.share.test.ts` | 26 | pass |
| `src/lib/services/__tests__/ideasService.share.test.ts` | 30 | pass |
| `src/app/api/todos/[id]/share/__tests__/route.test.ts` | 16 | pass |
| `src/app/api/todos/[id]/complete/__tests__/route.test.ts` | 11 | pass |
| `src/app/api/ideas/[id]/share/__tests__/route.test.ts` | 16 | pass |
| `src/app/api/ideas/[id]/status/__tests__/route.test.ts` | 12 | pass |
| `src/app/api/coach/client-completion/__tests__/route.test.ts` | 14 | pass |
| `src/components/sharing/__tests__/ShareDialog.test.tsx` | 14 | pass |
| `src/components/sharing/__tests__/TeammatePicker.test.tsx` | 8 | pass |
| **Total** | **147** | **147/147 pass** |

Verified locally with `npx vitest run …` in 1.22s. RLS layer (61-02) tests are SQL-based and depend on a Docker-running Supabase stack — deferred to the human-verify checkpoint documented in `61-02-SUMMARY.md` §Deferred Verification (9-cell matrix).

## Code-quality smells

- `src/app/ideas/page.tsx:694` — `void handleRecipientStatusChange;` exists only to keep the helper from being tree-shaken / lint-pruned because no button binds it yet. Documented in 61-05-SUMMARY.md as intentional (recipients flip idea status from `/ideas/[id]/evaluate`). Minor smell; rip out when a button lands.
- Field-name duplication in `/api/coach/client-completion` response (`ideas_breakdown.owned === ideas_private`, `ideas_breakdown.total === ideas_total`). Intentional reconciliation between prompt-level and plan-level contracts (documented in 61-06-SUMMARY.md §Decisions). Acceptable.
- `dailyTasksService.markTaskComplete` returns a row decorated with `owner_display_name: 'Team member'` because the RPC return doesn't carry the join (`dailyTasksService.ts:625-628`). Callers that need the resolved name must refetch via list reads. Documented in code; not a bug.

## Outstanding work

- **Migrations 20260514000000 + 20260514000001 not yet applied to staging/prod.** Both `61-01-SUMMARY.md` and `61-02-SUMMARY.md` flag the human-verify checkpoint (Docker-up + apply + 9-cell RLS matrix walkthrough). Until applied, `/api/todos/[id]/complete` and `/api/ideas/[id]/status` will return 500 + Sentry noise on the RPC-not-found path. Service-layer + UI are safe to ship first.
- **Task 4 of 61-05 + Task 4 of 61-06 are user-side visual checkpoints.** The 6-cell manual walkthrough (`61-05-SUMMARY.md` §"Manual Test Matrix") and the coach-dashboard visual check (`61-06-SUMMARY.md` §"Task 4 (Human Verification)") need a dev server + a live coach session.
- **Pre-existing TypeScript errors** in `scripts/diag-*` and duplicate `* 2.tsx` files surface on `npx tsc --noEmit` — unrelated to Phase 61 (scope-boundary).

## Recommendation

**Manual test + then PR.** All 147 automated tests pass, every dimension of the locked goal has concrete file:line evidence, and the migrations are reviewable independently. Before merging:

1. Apply the two migrations against staging, then walk the 9-cell RLS matrix from `61-02-SUMMARY.md`.
2. Walk the 6-cell UI matrix from `61-05-SUMMARY.md` (3 todo + 3 ideas cells, including the cross-business invisibility check and the coexistence cross-check).
3. Inspect `/api/coach/client-completion` in the Network tab on a coach session and confirm the sub-line renders on a client with ≥1 team-shared idea.

No code-side blockers found.
