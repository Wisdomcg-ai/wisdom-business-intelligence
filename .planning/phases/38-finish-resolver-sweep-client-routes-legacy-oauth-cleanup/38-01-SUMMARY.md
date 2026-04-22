---
phase: 38-finish-resolver-sweep
plan: 01
status: complete
completed: 2026-04-22
---

# Plan 38-01 — Summary

## Deletions

| Path | Reason |
|---|---|
| `src/app/client/{chat,sessions,documents,analytics,actions}/` | Orphaned — zero navigation references anywhere in app. Contained old `.eq('owner_id', user.id)` pattern but unreachable. |
| `src/app/dashboard/integrations/page.tsx` | Orphaned. Used wrong-case `/api/xero/` path (doesn't exist). |
| `src/app/dashboard/integrations/xero/page.tsx` | Same. |
| `src/app/xero-connect/page.tsx` | Orphaned. Callback only redirects to `/xero-connect/select-org`, not the index. |

## Retained

- `src/app/xero-connect/select-org/` — live route, Xero OAuth callback redirects here for multi-tenant clients.

## api/actions/route.ts — fixed subtle bug

Previous logic (when no `business_id` param supplied):
1. Try `owner_id = user.id` first
2. Fall back to `assigned_coach_id = user.id` only if (1) returned nothing

This is the same bug class Phase 37 fixed — a coach who owns any business (e.g. the neutralized landing pad) would hit branch (1) and get that business's actions instead of their clients'.

New logic:
1. Fetch `system_roles` to determine user role
2. If coach/super_admin → use `assigned_coach_id` scope
3. If client → use `owner_id` scope

The `.eq('owner_id', user.id)` call remains in the file — but it is now **structurally correct** because it only runs when the user is confirmed to be a client by system_role, not via a fallthrough.

## Final grep count

```
grep -rlE "\.eq\('owner_id', user\.id\)" src/app src/hooks
```

→ 1 match: `src/app/api/actions/route.ts` (documented exemption — role-gated client branch)

Down from ~24 matches before Phase 37 (commit ed9dfa7 predecessor state).

## Acceptance criteria — all pass

- ✅ `/client/*` directory removed
- ✅ `/dashboard/integrations/*` directory removed
- ✅ `/xero-connect/page.tsx` removed, `/xero-connect/select-org/` retained
- ✅ `/api/actions/route.ts` reviewed + fixed (role-check first)
- ✅ `npx tsc --noEmit` clean
- ✅ `npm run build` passes

## Git

One commit. Branch: `feat/phase-38-finish-sweep`.
