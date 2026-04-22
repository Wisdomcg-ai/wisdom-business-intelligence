---
phase: 39-branded-types-rollout
plan: 01
status: complete
completed: 2026-04-23
---

# Plan 39-01 — Summary

## What was branded

| Point | Before | After |
|---|---|---|
| `resolveBusinessId` return type | `{ businessId: string \| null }` | `{ businessId: BusinessId \| null }` |
| `resolveBusinessId` params | `userId: string`, `activeBusinessId: string` | `userId: UserId \| string`, `activeBusinessId: BusinessId \| string` (permissive inputs, strict output) |
| `CurrentUser.id` in BusinessContext | `string` | `UserId` |
| `ActiveBusiness.id` | `string` | `BusinessId` |
| `ActiveBusiness.ownerId` | `string` | `UserId` |
| `BusinessContextType.businessProfileId` | `string \| null` | `BusinessProfileId \| null` |

## Consumer impact

**Zero consumer files changed.** Branded types are subtypes of string
(`BusinessId extends string`), so every existing function signature that
accepts `string` continues to accept branded IDs. The brand only
enforces direction: strings can't impersonate brands, but brands can
freely be used as strings.

Full typecheck (`npx tsc --noEmit`) passed with no consumer changes.
Full production build succeeded with no regressions.

## Compile-time regression test

New file: `src/lib/types/__tests__/ids.test-d.ts`

Uses `@ts-expect-error` directives to assert that incorrect usages DO
fail the compiler. If someone accidentally removes a brand, the
directive becomes "unused" and tsc fails the build — making this a
structural regression test, not just a convention.

Covers:
- Raw string rejected for `BusinessId` / `UserId`
- `UserId` rejected for `BusinessId` (the original "saves to my business" bug class)
- Brands mutually exclusive (BusinessId ≠ UserId ≠ BusinessProfileId)
- Brand IS assignable to `string` (preserves compat for unbranded consumers)

## Future adoption path (not required for Phase 39 closure)

Downstream functions and service methods still accept `string`. To
opt-in to branded safety at any boundary:

```ts
// Before
function loadFinancialGoals(businessId: string) { ... }

// After — forces callers to have a BusinessProfileId at that call site
function loadFinancialGoals(businessId: BusinessProfileId) { ... }
```

Recommended for new code immediately. Retrofit as files get touched.
Suggested priority if a future phase takes it up:
1. `FinancialService.*`, `KPIService.*`, `StrategicPlanningService.*`
2. Hooks that take `overrideBusinessId` as arg (`useBusinessDashboard`, `useStrategicPlanning`)
3. API route `business_id` params

## Git

Single commit. Branch: `feat/phase-39-branded-types`.
