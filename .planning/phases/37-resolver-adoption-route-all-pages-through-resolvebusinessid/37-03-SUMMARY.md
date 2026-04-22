---
phase: 37-resolver-adoption
plan: 03
status: complete
completed: 2026-04-22
---

# Plan 37-03 — Summary

## Files migrated (6)

| File | Notes |
|---|---|
| `src/app/sessions/page.tsx` | Resolution block + embedded coach-lookup replaced; single `assigned_coach_id` follow-up retained. |
| `src/app/messages/page.tsx` | Same pattern; coach name display logic preserved. |
| `src/app/integrations/page.tsx` | Resolution replaced; multi-tenant `business_profiles.id` secondary candidate for Xero connections retained. |
| `src/app/settings/notifications/page.tsx` | Collapsed 20-line block (activeBusiness → team → owner chain) into resolver call. |
| `src/app/settings/team/page.tsx` | **Trickiest** — used `ResolveResult.reason` to preserve side-effects: coach-default role gating, business_name fetch, and the first-access `business_users` owner upsert. |
| `src/app/reviews/weekly/page.tsx` | Three-ID pattern: resolver → businesses.id → business_profiles.id translation. |

## Acceptance criteria — all pass

- ✅ All 6 files import from `@/lib/business/resolveBusinessId`
- ✅ `grep -lE "\.eq\('owner_id', user\.id\)"` returns zero files in scope
- ✅ Each file calls `resolveBusinessId(supabase, ...)` exactly once
- ✅ `assigned_coach_id` follow-up queries preserved in sessions + messages
- ✅ integrations multi-tenant Xero-connection key candidate (business_profiles lookup) preserved
- ✅ settings/team first-access owner upsert preserved via `reason === 'client-owner'` guard
- ✅ `npx tsc --noEmit` passes with zero errors

## Surprises

- **settings/team** required using `ResolveResult.reason` instead of a simple boolean — the upsert side-effect only applies to `reason === 'client-owner'`, not `client-team`. Without `reason` I couldn't tell the helper's internal path apart. This is a good sign that `reason` is the right shape for the API.
- **reviews/weekly** didn't match the plan's `owner_id` grep anyway — it used `.eq('user_id', user.id)` on `business_profiles`, not `.eq('owner_id', user.id)` on `businesses`. Refactored it to use the resolver (returning businesses.id) + the existing profile-translation step, which is structurally cleaner.

## Behaviour parity preserved

- Sessions list, messages thread, realtime subscription, attachment upload — unchanged
- Xero connection loading + OAuth flow in integrations — unchanged
- notification_preferences CRUD — unchanged
- settings/team member CRUD, invites, role changes — unchanged
- Weekly review load/save/sync — unchanged

## Git

One commit for all 6 files. Branch: `feat/resolver-adoption`.
