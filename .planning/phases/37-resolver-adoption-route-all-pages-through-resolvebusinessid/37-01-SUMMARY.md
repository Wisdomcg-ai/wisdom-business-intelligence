---
phase: 37-resolver-adoption
plan: 01
status: complete
completed: 2026-04-22
---

# Plan 37-01 — Summary

## Files migrated

| File | Change |
|---|---|
| `src/hooks/useUnreadMessages.ts` | Client-branch owner/team lookup (lines 28-46) replaced with single `resolveBusinessId` call. Coach branch untouched. |
| `src/app/dashboard/components/SessionActionsCard.tsx` | Whole resolution block (lines ~33-66) replaced with one resolver call + existing null guard. |
| `src/app/dashboard/hooks/useDashboardData.ts` | Owner-fallback branch (final `else` in the resolution chain) replaced with resolver + `business_profiles.id` translation. Cached-profile and activeBusiness branches preserved. |

## Acceptance criteria — all pass

- ✅ All three files import from `@/lib/business/resolveBusinessId`
- ✅ `grep -rE "\.eq\('owner_id', user\.id\)"` → 0 matches across these files
- ✅ `grep -rE "\.eq\('user_id', targetOwnerId\)"` → 0 matches (old fallback removed)
- ✅ Each file calls `resolveBusinessId(supabase, ...)` exactly once
- ✅ `npx tsc --noEmit` passes with zero errors

## Surprises

None. `currentUser` had to be added to the `useBusinessContext()` destructure in `useDashboardData.ts` (expected per the plan) and to the `useCallback` dep array for `loadDashboardData`.

## Behaviour parity preserved

- useUnreadMessages coach branch (`assigned_coach_id` lookup) left entirely alone
- SessionActionsCard empty-state still triggers on null businessId
- useDashboardData cached-profile (fast-path) and activeBusiness branches unchanged; `business_profiles.id` translation still happens for downstream queries
- Realtime subscription in useUnreadMessages unchanged
- targetUserId for `weekly_reviews` user-scoped query left as `activeBusiness?.ownerId || user.id` (out of scope — that's a user_id query, not business resolution)

## Git

One commit coming after this summary is written. Branch: `feat/resolver-adoption`.
