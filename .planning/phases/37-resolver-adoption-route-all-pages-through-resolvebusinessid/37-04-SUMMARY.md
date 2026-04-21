---
phase: 37-resolver-adoption
plan: 04
status: complete
completed: 2026-04-22
---

# Plan 37-04 — Summary

## Files migrated vs delegated

| File | Status |
|---|---|
| `src/app/one-page-plan/services/plan-data-assembler.ts` | **Migrated** — client branch now uses resolver + `businesses.id → business_profiles.id` translation via `business_id` FK (was `user_id` match). Correctness improvement: team members whose `user_id` doesn't match the profile row now resolve correctly. |
| `src/app/one-page-plan/page.tsx` | **Migrated** — snapshot resolution uses resolver + profile translation. |
| `src/app/goals/page.tsx` | **Delegated** — no direct resolution; passes `userRole` to already-migrated assembler. Zero edits. |
| `src/app/goals/hooks/useStrategicPlanning.ts` | **Migrated** — normal-user branch now resolves via helper, translates to business_profiles.id via `business_id` FK. SWOT `ownerUser` still = `user.id` (client self-view branch). Three-ID contract preserved. |
| `src/app/goals/components/OperationalPlanTab.tsx` | **Delegated** — no direct resolution block; uses `businessId` prop passed from parent (`useStrategicPlanning` now resolver-backed). Zero edits. |
| `src/app/business-dashboard/hooks/useBusinessDashboard.ts` | **Migrated** — three-branch chain collapsed to: override > cached > resolver+translate. |

## Acceptance criteria — all pass

- ✅ Four files import from `@/lib/business/resolveBusinessId`
- ✅ Two files (`goals/page.tsx`, `OperationalPlanTab.tsx`) delegate — no import needed, no owner_id patterns
- ✅ `npx tsc --noEmit` passes with zero errors
- ✅ Three-ID architecture preserved: SWOT still keys on `user.id`, goals/initiatives/KPIs still key on `business_profiles.id`, coach-client links still key on `businesses.id`

## Correctness improvements (not behavior changes, strictly improvements)

1. **plan-data-assembler client branch** — Old lookup `business_profiles.user_id = user.id` would miss for team members. New lookup `business_profiles.business_id = <resolved businesses.id>` handles both team members and owners correctly.
2. **useStrategicPlanning normal-user branch** — Same pattern: `business_profiles.business_id = <resolved businesses.id>` replaces `business_profiles.user_id = user.id`. Currently only reachable for client self-view so behavior-equivalent in practice, but structurally more correct.

## Behaviour parity preserved

- `assemblePlanData` activeBusiness branch — UNCHANGED
- Goals Wizard initialization — UNCHANGED
- Operational plan tab team-member loading — UNCHANGED
- Business dashboard auto-save, dirty tracking, KPIs — UNCHANGED
- SWOT queries still land on the correct user_id (owner's)

## Git

One commit for all files. Branch: `feat/resolver-adoption`.
