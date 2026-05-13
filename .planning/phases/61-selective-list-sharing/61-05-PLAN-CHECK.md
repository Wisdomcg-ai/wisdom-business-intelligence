# 61-05 PLAN-CHECK

**Verdict:** FLAG (proceed with nice-to-have adjustments)

## Coverage analysis
Delivers the user-visible surface: ShareDialog with three radio modes (Private / Everyone on team / Specific people), TeammatePicker, SharedByBadge, useBusinessTeammates hook, and the wiring into /todo and /ideas pages. Recipient mark-complete routes to the new dedicated endpoint, not the owner-only path.

## Decision compliance
- Three modes correctly mapped: private → `{mode:'private'}`, team → `{mode:'team'}`, specific → `{mode:'specific', userIds:[...]}`. Matches CONTEXT.md specifics.
- `is_owner === false` rows show SharedByBadge, hide/disable Edit/Archive/Delete/Share, and use the recipient mark-complete path (D-2 owner-only mutation enforced at UI layer).
- Status sync: recipient flipping status calls the RPC route, which updates the single shared row — owner sees the new status on next read (D-4).
- Coexistence: ShareDialog has an explicit SCOPE BOUNDARY comment block stating it does NOT touch `action_items`, `issues_list`, or the existing ideas business-wide shared-board mode (D-5). Task 3 explicitly preserves the businessId-mode branch in /ideas/page.tsx with a diff check in the `done` criteria.
- No direct supabase calls from React components — UI goes through services/API only (asserted in verify §3).

## Test coverage
ShareDialog + TeammatePicker have testing-library suites (mode toggling, search filter, fetch body shape, error toast, hook mock). 6+ manual cells in Task 4 checkpoint (3 todos + 3 ideas) cover the critical user flows including the off-boarding "remove access" path. Reasonable coverage given the matrix is 24 cells total — combined with 61-02's 9 RLS-layer cells, the matrix is well-exercised.

## Issues found
None blocking. The 4 planner-flagged ambiguities concentrate here:

1. **Owner display name** (line 26, line 254): Plan defers resolution — "extend the read path to include owner email/name, or use a small lookup … fall back to email/uuid for now and document as a follow-up." This is documented for the executor, but a stub fallback (`Shared by {email}`) should be the floor. Acceptable as flagged.

2. **TeammatePicker join shape**: `business_users` → `users(email, display_name)` — plan says "verify the exact join shape works in this Supabase schema — if there's no `users.display_name` column, use email-only." Documented for executor.

3. **Toast library**: plan says "Most likely `sonner`" — executor should grep before importing. Documented.

The owner-name resolution is the highest-risk loose end. Recommend the executor add a small `owner_email` field to the service read response (61-03 returns rows from `daily_tasks` / `ideas` — joining `users(email)` via owner_user_id is cheap) so the UI doesn't ship with raw UUIDs.

## Nice-to-haves
- Add an explicit subtask: "extend `getTodaysTasks` (and ideas reads) to include `owner_user:users(email)` so SharedByBadge has a real label." Currently implicit.
- Consider adding optimistic-rollback test case — plan mentions optimistic UI but no specific test pins the rollback path.
