---
phase: 47-input-validation-rollout
plan: 02
subsystem: api-input-validation
tags: [zod, observe-mode, read-routes, VALID-02]
requires: ["47-01 withSchema/withQuerySchema wrapper"]
provides: ["5 read-only routes carrying observe-mode Zod schemas"]
affects:
  - src/app/api/coach/stats/route.ts
  - src/app/api/notifications/route.ts
  - src/app/api/health/route.ts
  - src/app/api/admin/check-auth/route.ts
  - src/app/api/cfo/summaries/route.ts
tech-stack:
  added: []
  patterns: ["Option B wrap — handler body verbatim, only export line wraps via withSchema/withQuerySchema"]
key-files:
  created: []
  modified:
    - src/app/api/coach/stats/route.ts
    - src/app/api/notifications/route.ts
    - src/app/api/health/route.ts
    - src/app/api/admin/check-auth/route.ts
    - src/app/api/cfo/summaries/route.ts
    - src/__tests__/api/sentry-capture-wiring.test.ts
decisions:
  - "Used Option B (rename export to inner handler, wrap on export line) uniformly across all 5 routes"
  - "Routes reading neither body nor query got a permissive z.object({}).passthrough() via withQuerySchema so the success grep stays uniform"
  - "Schemas authored permissive/optional — these are read routes where false-rejects are observe-mode noise, not behavior"
metrics:
  duration: ~20m
  completed: 2026-06-01
---

# Phase 47 Plan 02: Observe-Mode Schemas on 5 Read-Only Routes Summary

Attached Zod schemas in OBSERVE mode to the 5 lowest-risk read-only routes (VALID-02) — the first real consumers of the VALID-01 wrapper, proving the integration pattern with zero behavior change before financial routes are touched.

## What Was Done

| Route | routeId | Wrapper | Schema fields |
| ----- | ------- | ------- | ------------- |
| coach/stats `GET` | `coach/stats` | `withQuerySchema` | 0 (permissive `z.object({}).passthrough()` — no inputs) |
| notifications `GET` | `notifications` | `withQuerySchema` | 2 (`unread_only?`, `limit?` — string query) |
| notifications `PUT` | `notifications` | `withSchema` | 2 (`notification_id?`, `mark_all_read?` — body) |
| health `GET` | `health` | `withQuerySchema` | 0 (permissive — no inputs) |
| admin/check-auth `GET` | `admin/check-auth` | `withQuerySchema` | 0 (permissive — no inputs) |
| cfo/summaries `GET` | `cfo/summaries` | `withQuerySchema` | 1 (`month?` — YYYY-MM query) |

**Wrap mechanic (uniform across all 5):** Option B — keep each handler body verbatim, rename `export async function GET/PUT` to an inner `async function getHandler/putHandler`, and change only the export line to `export const GET = withQuerySchema('<routeId>', Schema, getHandler)`. Schemas are inline `const ... = z.object({...})` at the top of each file, all marked optional + `.passthrough()` (read routes; false-rejects are observe noise). No route added to `ZOD_ENFORCE_ROUTES`. No auth/structure changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] cfo/summaries handler param widened NextRequest → Request**
- **Found during:** Task 1 (tsc gate)
- **Issue:** `getHandler(request: NextRequest)` is not assignable to the wrapper's `(request: Request) => ...` contract (contravariance). The handler only reads `request.url`, a plain `Request` property.
- **Fix:** Widened the param to `Request`; removed the now-unused `NextRequest` import (eslint).
- **Files modified:** `src/app/api/cfo/summaries/route.ts`
- **Commit:** 007df12f

**2. [Rule 1 - Test contract] Adapted SEC-07 canary test to wrapped GET signature**
- **Found during:** Task 2 (tsc + full suite)
- **Issue:** `sentry-capture-wiring.test.ts` called `await GET()` with zero args. The wrapped `GET` now requires a `Request` (the wrapper calls `new URL(request.url)`), causing TS2554 and a runtime throw.
- **Fix:** Test now passes `new Request('http://localhost/api/coach/stats')`. The route reads no query; observe mode is a no-op and control still drops into the catch block (500) — test intent unchanged.
- **Files modified:** `src/__tests__/api/sentry-capture-wiring.test.ts`
- **Commit:** 007df12f
- **Note:** Fixed by adapting to the new (correct) call contract, NOT by special-casing the wrapper or weakening behavior — consistent with the plan's directive.

## Gates

- grep count of `withSchema|withQuerySchema` across the 5 route dirs == **5** ✅
- `npx tsc --noEmit` — **clean** ✅
- `npx eslint <5 routes + test>` — **clean** ✅
- `npx vitest run` (full suite) — **1733 passed, 1 failed** ✅ The single failure is the known timezone flake at `src/__tests__/goals/plan-period-banner.test.tsx` (`2026-03-31` vs `2026-04-01`), the only acceptable failure. All route tests including the adapted canary passed.

## Known Stubs

None.

## Commit

- `007df12f` — feat(47-02): attach observe-mode schemas to 5 read-only routes (VALID-02)
