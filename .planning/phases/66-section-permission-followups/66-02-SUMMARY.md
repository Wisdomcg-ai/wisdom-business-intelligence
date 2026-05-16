---
phase: 66-section-permission-followups
plan: "02"
subsystem: api-finance
tags: [business-id-resolution, section-permissions, consolidated-routes, dual-id]
dependency_graph:
  requires: [65-02]
  provides: [consolidated-route-id-normalization]
  affects: [consolidated, consolidated-bs, consolidated-cashflow]
tech_stack:
  added: []
  patterns: [resolveBusinessIds-adoption, dual-id-normalization]
key_files:
  created:
    - src/app/api/monthly-report/consolidated/__tests__/business-id-resolution.test.ts
  modified:
    - src/app/api/monthly-report/consolidated/route.ts
    - src/app/api/monthly-report/consolidated-bs/route.ts
    - src/app/api/monthly-report/consolidated-cashflow/route.ts
decisions:
  - "Service-role client passed to resolveBusinessIds (not auth-bound) because business_profiles may be RLS-restricted"
  - "Auth-bound client kept as first arg to requireSectionPermission per Phase 65 invariant"
  - "ids.bizId used for access check, section gate, business_profiles lookup, and engine call"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-17"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 4
---

# Phase 66 Plan 02: Consolidated-Route Business-ID Normalization Summary

**One-liner:** `resolveBusinessIds` wired into all 3 consolidated routes so the access check, section gate, business_profiles lookup, and engine call all use the resolved `businesses.id` (`ids.bizId`), normalizing dual-ID handling consistent with all other Phase 65-02 finance routes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wire resolveBusinessIds into consolidated/route.ts | d08d8e1e | src/app/api/monthly-report/consolidated/route.ts |
| 2 | Wire resolveBusinessIds into consolidated-bs and consolidated-cashflow | d089af3d | src/app/api/monthly-report/consolidated-bs/route.ts, src/app/api/monthly-report/consolidated-cashflow/route.ts |
| 3 | Regression test pinning ids.bizId usage | 09e29d05 | src/app/api/monthly-report/consolidated/__tests__/business-id-resolution.test.ts |

## What Changed

### All 3 Routes (consolidated, consolidated-bs, consolidated-cashflow)

Each route received identical structural changes:

1. Added `import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'`
2. After body parse / required-field validation, added a `resolve_business_ids` stage that calls `resolveBusinessIds(supabase, business_id)` using the module-level service-role client
3. Access check: `.eq('id', business_id)` → `.eq('id', ids.bizId)`
4. `requireSectionPermission(authSupabase, user.id, business_id, 'finances')` → third argument changed to `ids.bizId`; auth-bound client unchanged (Phase 65 invariant)
5. `business_profiles` lookup: `.eq('business_id', business_id)` → `.eq('business_id', ids.bizId)`
6. Engine call: `businessId: business_id` → `businessId: ids.bizId`

### Regression Test

Created `src/app/api/monthly-report/consolidated/__tests__/business-id-resolution.test.ts` with two tests:

- **Test 1:** When body sends a `business_profiles.id`, `resolveBusinessIds` is called with the raw input and `requireSectionPermission` receives the resolved `businesses.id` (`ids.bizId`), not the raw input id.
- **Test 2:** When body sends `businesses.id` (the live-tenant case), `ids.bizId` equals the input — confirms no behavior change for Dragon/IICT.

## Verification

```
npx vitest run src/app/api/monthly-report/consolidated/route.test.ts
  Tests  4 passed (4)

npx vitest run src/app/api/monthly-report/consolidated/__tests__/business-id-resolution.test.ts
  Tests  2 passed (2)

npx vitest run src/app/api/monthly-report/consolidated-bs/route.test.ts
  Tests  5 passed (5)

npx tsc --noEmit → clean (no errors)
```

All 11 tests pass across the 3 suites. TypeScript is clean.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data flows are wired. The consolidated routes call `resolveBusinessIds` and pass `ids.bizId` through the full chain.

## Self-Check: PASSED

- `src/app/api/monthly-report/consolidated/route.ts` — FOUND with `resolveBusinessIds` import and `ids.bizId` usage
- `src/app/api/monthly-report/consolidated-bs/route.ts` — FOUND with `resolveBusinessIds` import and `ids.bizId` usage
- `src/app/api/monthly-report/consolidated-cashflow/route.ts` — FOUND with `resolveBusinessIds` import and `ids.bizId` usage
- `src/app/api/monthly-report/consolidated/__tests__/business-id-resolution.test.ts` — FOUND, both tests pass
- Commits d08d8e1e, d089af3d, 09e29d05 — verified in git log
