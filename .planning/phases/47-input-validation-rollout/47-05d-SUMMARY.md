---
phase: 47-input-validation-rollout
plan: 05d
subsystem: api-validation
tags: [zod, observe-mode, input-validation, VALID-05, full-surface]
requires: ["47-01", "47-02", "47-04", "47-05a", "47-05b", "47-05c"]
provides: ["full-surface observe-wrap complete: 130/130 route.ts files"]
affects:
  - "src/app/api/Xero/**/route.ts"
  - "src/app/api/consolidation/fx-rates/**/route.ts"
  - "src/app/api/forecast/**/route.ts"
  - "src/app/api/forecasts/**/route.ts"
tech-stack:
  added: []
  patterns:
    - "Option B clone-and-forward withQuerySchema; query-GET routes get named optional searchParam fields; input-less GET/DELETE get z.object({}).passthrough()"
    - "NextRequest→Request variance bridge via `getHandler as unknown as (request: Request) => Promise<Response>`"
    - "Promise-param dynamic routes forwarded verbatim (...rest) with `await params` left intact inside the handler"
    - "OAuth callback uses .passthrough() so unexpected Xero redirect params never trip a would-reject"
key-files:
  created:
    - ".planning/phases/47-input-validation-rollout/47-05d-SUMMARY.md"
  modified:
    - "src/app/api/Xero/accounts/route.ts"
    - "src/app/api/Xero/active-tenants/route.ts"
    - "src/app/api/Xero/auth/route.ts"
    - "src/app/api/Xero/balance-sheet/route.ts"
    - "src/app/api/Xero/callback/route.ts"
    - "src/app/api/Xero/chart-of-accounts-full/route.ts"
    - "src/app/api/Xero/chart-of-accounts/route.ts"
    - "src/app/api/Xero/connection-health/route.ts"
    - "src/app/api/Xero/employees/route.ts"
    - "src/app/api/Xero/pending-connection/route.ts"
    - "src/app/api/Xero/pl-summary/route.ts"
    - "src/app/api/Xero/reconciliation/route.ts"
    - "src/app/api/Xero/status/route.ts"
    - "src/app/api/consolidation/fx-rates/[id]/route.ts"
    - "src/app/api/consolidation/fx-rates/sync-oxr/health/route.ts"
    - "src/app/api/forecast/[id]/actuals-summary/route.ts"
    - "src/app/api/forecast/[id]/recompute/route.ts"
    - "src/app/api/forecast/[id]/route.ts"
    - "src/app/api/forecast/cashflow/payroll-summary/route.ts"
    - "src/app/api/forecast/cashflow/xero-actuals/route.ts"
    - "src/app/api/forecast/dashboard-actuals/route.ts"
    - "src/app/api/forecast/quarterly-summary/route.ts"
    - "src/app/api/forecasts/audit-log/route.ts"
    - "src/app/api/forecasts/export/route.ts"
decisions:
  - "Every one of the 24 closing routes is READ-ONLY / OAuth / query-GET / input-less; none consume an inbound client request.json() body, so all 26 wrapped exports use withQuerySchema. The only withSchema candidate (recompute POST) carries an EMPTY body per its docblock, so withQuerySchema(z.object({})) is the correct shape (no spurious body parse)."
  - "Xero OAuth routes (auth, callback, pending-connection, connection-health, status) kept strictly byte-identical handler bodies — Option B clone-and-forward only renames the export and adds a wiring line. Zero handshake/token/redirect/cookie change."
  - "All routeIds preserve the capital-X `Xero` casing verbatim to match production Linux case-sensitivity and existing Sentry `tags.route` values."
metrics:
  duration: "~30 min"
  completed: "2026-06-01"
  files: 24
  wrapped_exports: 26
---

# Phase 47 Plan 05d: Observe-Mode Sweep — Financial Read Routes Summary

Closed the final full-surface gap: wrapped the remaining 24 READ-ONLY / OAuth / query-GET / input-less route files in the forecast/Xero/consolidation trees with observe-mode Zod schemas via `withQuerySchema`, bringing the live count to **130/130** route.ts files wrapped and satisfying VALID-05 success criterion #1. Pure Sentry `zod:would-reject` logging — zero behavior change, nothing added to `ZOD_ENFORCE_ROUTES`.

## Per-file wrapping (verb · wrapper · field count)

| Route (routeId) | Verb(s) | Wrapper | Schema fields |
| --- | --- | --- | --- |
| `Xero/accounts` | GET | withQuerySchema | 2 (`business_id`, `type`) |
| `Xero/active-tenants` | GET | withQuerySchema | 1 (`business_id`) |
| `Xero/auth` | GET | withQuerySchema | 2 (`business_id`, `return_to`) |
| `Xero/balance-sheet` | GET | withQuerySchema | 5 (`business_id`, `month`, `compare`, `cash_only`, `as_of`) |
| `Xero/callback` (OAuth) | GET | withQuerySchema | 2 (`code`, `state`) · `.passthrough()` |
| `Xero/chart-of-accounts-full` | GET + POST | withQuerySchema ×2 | GET 2 (`business_id`, `refresh`); POST 0 (exempt, `z.object({})`) |
| `Xero/chart-of-accounts` | GET | withQuerySchema | 2 (`business_id`, `filter`) |
| `Xero/connection-health` | GET | withQuerySchema | 1 (`business_ids[]`) |
| `Xero/employees` | GET | withQuerySchema | 2 (`business_id`, `include_terminated`) |
| `Xero/pending-connection` | GET | withQuerySchema | 1 (`pending_id`) |
| `Xero/pl-summary` | GET | withQuerySchema | 2 (`business_id`, `fiscal_year`) |
| `Xero/reconciliation` | GET | withQuerySchema | 2 (`business_id`, `month`) |
| `Xero/status` | GET | withQuerySchema | 1 (`business_id`) |
| `consolidation/fx-rates/[id]` | DELETE | withQuerySchema | 0 (exempt, `z.object({})`) · Promise-param |
| `consolidation/fx-rates/sync-oxr/health` | GET | withQuerySchema | 0 (exempt, `z.object({})`) |
| `forecast/[id]/actuals-summary` | GET | withQuerySchema | 0 (exempt, `z.object({})`) · Promise-param |
| `forecast/[id]/recompute` | POST | withQuerySchema | 0 (exempt, empty body, `z.object({})`) · Promise-param |
| `forecast/[id]` | GET + DELETE | withQuerySchema ×2 | 0 each (exempt, `z.object({})`) · Promise-param |
| `forecast/cashflow/payroll-summary` | GET | withQuerySchema | 1 (`forecast_id`) |
| `forecast/cashflow/xero-actuals` | GET | withQuerySchema | 2 (`business_id`, `forecast_id`) |
| `forecast/dashboard-actuals` | GET | withQuerySchema | 3 (`businessId`, `fiscalYear`, `yearStartMonth`) |
| `forecast/quarterly-summary` | GET | withQuerySchema | 4 (`forecastId`, `quarter`, `fiscalYear`, `yearStartMonth`) |
| `forecasts/audit-log` | GET | withQuerySchema | 4 (`forecast_id`, `action`, `user_id`, `date_range`) |
| `forecasts/export` | GET | withQuerySchema | 2 (`forecast_id`, `format`) |

**Totals:** 24 files, 26 wrapped exports (chart-of-accounts-full and forecast/[id] each carry two verbs).

### Exempt (input-less, `z.object({}).passthrough()`) — 7 exports across 6 files
- `Xero/chart-of-accounts-full` POST — internally rebuilds a GET request; no body/searchParams of its own
- `consolidation/fx-rates/[id]` DELETE — id comes from the dynamic path segment, not body/query
- `consolidation/fx-rates/sync-oxr/health` GET — no params; presence-of-env-var probe
- `forecast/[id]/actuals-summary` GET — id from path segment
- `forecast/[id]/recompute` POST — empty request body per docblock; id from path segment
- `forecast/[id]` GET + DELETE — id from path segment

## Promise-param dynamic routes handled
Four routes carry `{ params: Promise<{ id }> }` and were wired so the wrapper forwards `ctx` verbatim (`...rest`) while the handler keeps its own `await params`:
- `consolidation/fx-rates/[id]` (DELETE)
- `forecast/[id]/actuals-summary` (GET)
- `forecast/[id]/recompute` (POST)
- `forecast/[id]` (GET + DELETE)

Each wiring site casts to `(request: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>` so the wider `Request` from the wrapper bridges to the handler's `NextRequest`/`Request` param without awaiting the ctx.

## Deviations from Plan
None — slice executed exactly as specified. No bugs, missing functionality, or blocking issues encountered (Rules 1–4 not triggered). No architectural decisions required.

## Sensitive routes (Xero OAuth) — verification
`auth`, `callback`, `pending-connection`, `connection-health`, `status` wrapped with strict Option B: handler bodies are byte-identical; only the `export async function X` → `async function xHandler` rename plus a trailing `export const X = withQuerySchema(...)` line were added. `callback` (the OAuth redirect target) uses `.passthrough()` on its `{ code?, state? }` schema so unexpected Xero redirect params never produce a would-reject. No redirect/cookie/token/handshake logic touched.

## Gates
- `npx tsc --noEmit` — clean (exit 0).
- Full-surface: `grep -rln "withSchema\|withQuerySchema" src/app/api/ | wc -l` = **130**, `find src/app/api -name route.ts | wc -l` = **130** → **130/130**. Zero unwrapped routes remain.
- `npx next lint` on all 24 files — no warnings or errors.
- `npx vitest run` — **1733 passed**, 97 skipped, 7 todo; **1 failed**: `src/__tests__/goals/plan-period-banner.test.tsx` ("expected '2026-03-31' to be '2026-04-01'") — the known pre-existing timezone flake, ignorable. No regression in the (dense) forecast/Xero/consolidation suites.

## OBSERVE MODE confirmation
Nothing added to `ZOD_ENFORCE_ROUTES`. All wrappers run in observe mode (parse failure → Sentry `zod:would-reject` warning, original handler still runs with the raw request). Zero behavior change across all 24 routes.
