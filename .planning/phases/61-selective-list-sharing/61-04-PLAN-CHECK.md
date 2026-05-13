# 61-04 PLAN-CHECK

**Verdict:** PASS

## Coverage analysis
Delivers four PATCH endpoints: share/complete for todos, share/status for ideas. Share routes are owner-only with teammate validation against `business_users.status='active'`. Complete/status routes proxy to the SECURITY DEFINER RPCs from 61-02 — the only non-owner mutation channel.

## Decision compliance
- Asymmetric RLS at the API layer: share routes do a generic `UPDATE` with `.eq('user_id', user.id)` (owner-only), complete/status routes call `supabase.rpc('mark_task_complete' | 'mark_idea_status', ...)` (D-2, D-3).
- 404 vs 403 split is correct: RLS-hidden row → 404, visible-but-not-owner → 403. This is meaningful because a recipient WILL see the row via the broadened SELECT.
- `createServiceRoleClient()` is explicitly forbidden — grep-asserted in both Task 2 and Task 4 verify blocks. Honors CONTEXT.md service-role-bypass note.
- Sentry.captureException replaces console.error (project standard per Phase 46 SEC-07) — assertion is "Zero new console.error calls".
- PG error code mapping (42501 → 403, 22P02 → 400 for invalid status) is explicit and tested.
- Body shape matches CONTEXT.md specifics: `{ mode, userIds? }` for share, `{ completed }` for complete, `{ status }` for status flip.
- Teammate validation: `mode='specific'` cross-checks every userId against `business_users` with `status='active'`. Returns 400 with `{ invalid: [...] }` if any are stale (good — prevents stale UUIDs from being added even though RLS would block them later).

## Test coverage
Strong. ≥14 tests per share route + ≥10 per complete/status route = ≥48 tests across 4 suites. Covers auth, body validation, visibility/ownership, success, error mapping, hygiene (no console.error).

## Issues found
None blocking.

Minor:
- Route style ambiguity (one of the 4 planner-flagged ambiguities): plan picks `/api/todos/[id]/complete` and `/api/ideas/[id]/status` — separate paths rather than reusing status routes. This is consistent with CONTEXT.md `<specifics>` which proposed "OR a separate route" — the planner made a defensible choice. Worth flagging in SUMMARY.md per the planner's own ambiguity note.
- Test verify block uses square brackets in glob paths (`src/app/api/todos/[id]/share/...`). Vitest accepts this but executor should quote if shell-expanded.

## Nice-to-haves
- Sentry tags `route: 'todos/share'` etc. follow Phase 46 convention.
- Consider mentioning Vercel deployment implications (`force-dynamic` is set — good — these are mutation endpoints).
