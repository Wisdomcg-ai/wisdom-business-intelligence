---
phase: 47-input-validation-rollout
plan: 01
subsystem: api-validation
tags: [zod, validation, sentry, middleware, tdd]
requires: []
provides:
  - "src/lib/api/with-schema.ts — withSchema, withQuerySchema, isEnforced"
affects:
  - "VALID-02..05 (observe-mode route sweep) attach withSchema/withQuerySchema"
  - "VALID-06 (enforce flip) toggles ZOD_ENFORCE_ROUTES only"
tech-stack:
  added: []
  patterns:
    - "Clone-and-forward (request.clone().json()) — original stream never consumed"
    - "safeParseAsync only (never .parse) — wrapper must not throw in observe mode"
    - "Generic over ...rest:TArgs so dynamic-route ctx forwards verbatim (sync + Promise params)"
    - "Env-gated observe/enforce dual mode via ZOD_ENFORCE_ROUTES (comma-list or '*')"
key-files:
  created:
    - "src/lib/api/with-schema.ts"
    - "src/lib/api/__tests__/with-schema.test.ts"
  modified: []
decisions:
  - "z.object({}) rejects undefined (no body) — schema decides; wrapper never crashes, observe just logs"
  - "Assert on issue code/path, not zod v4 message strings (they read 'Invalid input: expected ...')"
metrics:
  duration: "~12 min"
  completed: "2026-06-01"
  tasks: 2
  files: 2
  tests: "19 unit tests, all green"
---

# Phase 47 Plan 01: withSchema Validation Wrapper Summary

Generic, dependency-light input-validation HOF (`withSchema` / `withQuerySchema` / `isEnforced`) that clones-and-forwards the request so it can validate a body/query against a Zod schema with ZERO route-behavior change in observe mode, and a pure env-var flip to enforce — the fork-gate for VALID-01.

## What Was Built

- **`src/lib/api/with-schema.ts`** (108 lines) — exports:
  - `withSchema(routeId, schema, handler)` — `await request.clone().json()` (original stream intact) → `schema.safeParseAsync(raw)`. Observe (default): on failure `Sentry.captureMessage('zod:would-reject', { level:'warning', tags:{route,invariant:'zod_would_reject'}, extra:{issues} })` then runs the handler with the original request. Enforce (routeId in `ZOD_ENFORCE_ROUTES` or `'*'`): returns `NextResponse.json({ error:'Validation failed', issues: result.error.flatten() }, { status:400 })` and does NOT call the handler.
  - `withQuerySchema(...)` — same semantics over `Object.fromEntries(new URL(request.url).searchParams)`.
  - `isEnforced(routeId)` — reads `process.env.ZOD_ENFORCE_ROUTES` per-call (split/trim/filter → Set), returns `set.has('*') || set.has(routeId)`.
  - Generic over `...rest: TArgs extends unknown[]` so `ctx`/`params` forwards verbatim for both sync `{params:{id}}` and Promise `{params:Promise<{id}>}` route signatures (never awaited/destructured in the wrapper).
- **`src/lib/api/__tests__/with-schema.test.ts`** (258 lines) — 19 tests: observe (log + intact body), enforce (400 + handler skipped), passthrough on valid input, params forwarding for both signatures (same-reference assertion), empty/no body, withQuerySchema observe/enforce/forwarding, isEnforced env toggle (`'*'`, comma-list, whitespace trim, per-call read, empty string). Sentry mocked via verified convention; assertions on issue `code`/`path`/`fieldErrors`, not v4 message strings.

## TDD Flow

1. **RED** (`1bd3e6e4`) — test file committed; failed to resolve `../with-schema` (module absent).
2. **GREEN** (`bb8f66cb`) — implemented wrapper; 19/19 unit green.

## Verification (all gates passed)

- `npx vitest run src/lib/api/__tests__/with-schema.test.ts` → 19 passed.
- `npx tsc --noEmit` → clean (exit 0).
- `npx eslint src/lib/api/with-schema.ts src/lib/api/__tests__/with-schema.test.ts` → clean (exit 0).
- `npx vitest run` (full) → 1733 passed, **1 failed = known timezone flake** at `src/__tests__/goals/plan-period-banner.test.tsx` (`'2026-03-31'` vs `'2026-04-01'`), pre-existing and unrelated.

## Deviations from Plan

**1. [Rule 1 — Test correctness] Reframed the empty-body permissive-schema test.**
- **Found during:** Task 2 (GREEN).
- **Issue:** The plan's Task 1 sketch implied `z.object({})` would "pass" with no body. In zod v4 `z.object({})` rejects `undefined` (it expects an object), so a truly bodyless request logs in observe rather than passing silently.
- **Fix:** Split into two precise tests — (a) empty JSON body `{}` + `z.object({})` → no warning, handler runs; (b) no body at all → `clone().json()` throws, `raw=undefined`, schema rejects → observe logs, never crashes, handler still runs. Both assert the wrapper's invariant (never throws) holds. No implementation change required.
- **Files modified:** `src/lib/api/__tests__/with-schema.test.ts`
- **Commit:** `bb8f66cb`

## Known Stubs

None. The wrapper is fully implemented and unit-tested; it is intentionally not yet wired to any real route (that is VALID-02..05).

## Self-Check: PASSED
- FOUND: src/lib/api/with-schema.ts
- FOUND: src/lib/api/__tests__/with-schema.test.ts
- FOUND commit: 1bd3e6e4 (RED)
- FOUND commit: bb8f66cb (GREEN)
