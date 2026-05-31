---
phase: 47-input-validation-rollout
plan: 05b
subsystem: api-input-validation
tags: [zod, observe-mode, validation, reports, planning-data]
requires:
  - "src/lib/api/with-schema.ts (withSchema / withQuerySchema — 47-01)"
provides:
  - "Observe-mode Zod coverage across the reports/planning-data API subtree (VALID-05 slice b)"
affects:
  - "src/app/api/{actions,analytics,annual-plan,business-profile,cfo/flag-client,forecast-wizard-v4,goals,kpis,plan-snapshots,strategic-initiatives,subscription-budgets,wizard}/**/route.ts"
tech-stack:
  added: []
  patterns:
    - "Option B clone-and-forward: handler body byte-identical, only the export line changes"
    - "Verb-level dedup: pre-wrapped exports (cfo/summaries, cfo/report-status) left untouched"
    - "withQuerySchema for query/input-less GETs; withSchema for body-bearing verbs"
key-files:
  modified:
    - src/app/api/actions/route.ts
    - src/app/api/analytics/client/[id]/route.ts
    - src/app/api/analytics/coach/route.ts
    - src/app/api/annual-plan/route.ts
    - src/app/api/business-profile/route.ts
    - src/app/api/cfo/flag-client/route.ts
    - src/app/api/forecast-wizard-v4/generate/route.ts
    - src/app/api/goals/route.ts
    - src/app/api/goals/resolve-business/route.ts
    - src/app/api/goals/save/route.ts
    - src/app/api/kpis/route.ts
    - src/app/api/plan-snapshots/route.ts
    - src/app/api/strategic-initiatives/route.ts
    - src/app/api/subscription-budgets/route.ts
    - src/app/api/wizard/chat/route.ts
  created:
    - .planning/phases/47-input-validation-rollout/47-05b-ROUTE-LIST.md
decisions:
  - "subscription-budgets GET/DELETE keep NextRequest (use request.nextUrl) and bridge the wrapper's wider Request param via `as unknown as` cast — body byte-identical, observe-mode runtime unchanged"
  - "Deeply-nested payloads (goals/save data, kpis arrays, forecast assumptions/summary, wizard processData) modeled as named fields with z.unknown()/z.array(z.unknown())/.passthrough() — substantive named shape, NOT a blanket body passthrough"
metrics:
  tasks: 3
  files_modified: 15
  files_created: 1
---

# Phase 47 Plan 05b: Reports / Planning-Data Observe Sweep Summary

Attached Zod schemas in **observe mode** (Option B clone-and-forward) to every previously-unwrapped mutating verb and query GET across the reports/planning-data API subtree — 21 verbs over 15 route files — completing slice b of the three parallel VALID-05 slices. Zero behavior change: `ZOD_ENFORCE_ROUTES` untouched, every handler body byte-identical, only export lines rewritten to call `withSchema`/`withQuerySchema`.

## Routes wrapped (verb → modeled field count)

| Route file | routeId | Verb | Wrapper | Fields |
|---|---|---|---|---|
| actions/route.ts | `actions` | GET | withQuerySchema | 2 — business_id, status |
| actions/route.ts | `actions` | PUT | withSchema | 2 — action_id, status |
| analytics/client/[id]/route.ts | `analytics/client/[id]` | GET | withQuerySchema | 0 — input-less `z.object({})` (exempt; id via dynamic param) |
| analytics/coach/route.ts | `analytics/coach` | GET | withQuerySchema | 0 — input-less `z.object({})` (exempt) |
| annual-plan/route.ts | `annual-plan` | GET | withQuerySchema | 1 — user_id |
| business-profile/route.ts | `business-profile` | GET | withQuerySchema | 1 — business_id |
| cfo/flag-client/route.ts | `cfo/flag-client` | POST | withSchema | 2 — business_id, is_cfo_client |
| forecast-wizard-v4/generate/route.ts | `forecast-wizard-v4/generate` | POST | withSchema | 9 — businessId, fiscalYear, forecastDuration, forecastId, forecastName, createNew, isDraft, assumptions, summary |
| goals/route.ts | `goals` | GET | withQuerySchema | 1 — business_id |
| goals/resolve-business/route.ts | `goals/resolve-business` | GET | withQuerySchema | 1 — business_id |
| goals/save/route.ts | `goals/save` | POST | withSchema | 3 — businessId, profileId, data{financial,kpis,initiatives,sprintKeyActions,operationalActivities} |
| kpis/route.ts | `kpis` | GET | withQuerySchema | 1 — businessId |
| kpis/route.ts | `kpis` | POST | withSchema | 2 — businessId, kpis |
| kpis/route.ts | `kpis` | DELETE | withQuerySchema | 2 — kpiId, businessId |
| kpis/route.ts | `kpis` | PATCH | withSchema | 4 — businessId, kpiId, currentValue, notes |
| plan-snapshots/route.ts | `plan-snapshots` | POST | withSchema | 3 — business_id, label, step4_plan_data |
| strategic-initiatives/route.ts | `strategic-initiatives` | GET | withQuerySchema | 2 — business_id, annual_plan_only |
| subscription-budgets/route.ts | `subscription-budgets` | GET | withQuerySchema | 3 — business_id, forecast_id, active_only |
| subscription-budgets/route.ts | `subscription-budgets` | POST | withSchema | 3 — business_id, forecast_id, budgets |
| subscription-budgets/route.ts | `subscription-budgets` | DELETE | withQuerySchema | 3 — business_id, vendor_key, id |
| wizard/chat/route.ts | `wizard/chat` | POST | withSchema | 4 — userMessage, processData, conversationHistory, stage |

**Totals:** 21 verbs wrapped (8 withSchema body, 13 withQuerySchema incl. 2 input-less exempt).

## Routes skipped — already wrapped (verb-level dedup)

| Route | Verb | Wrapped by |
|---|---|---|
| cfo/summaries/route.ts | GET | 47-02 (withQuerySchema) — left untouched |
| cfo/report-status/route.ts | POST | 47-04 (withSchema) — left untouched |

No export was double-wrapped. The `cfo` subdir commit only touches `cfo/flag-client`.

## Deviations from Plan

### Auto-fixed Issues
None — plan executed as written.

### Implementation notes (within plan latitude)
- **subscription-budgets GET/DELETE retained `NextRequest`.** Both handlers read `request.nextUrl.searchParams`; per the plan, `NextRequest` is kept where the handler uses `request.nextUrl`. The wrapper generic types its first param as the wider `Request`, so the handlers are bridged at the wiring site with `as unknown as (request: Request) => Promise<Response>`. Direct `as (request: Request) => ...` was rejected by tsc (TS2352, insufficient overlap); the `unknown` step is the sanctioned TS bridge. Handler bodies are byte-identical and runtime behaviour is unchanged (observe mode passes the real NextRequest through). All other widened handlers (annual-plan, cfo/flag-client, kpis ×4, plan-snapshots, all `new URL(request.url)` readers) use `Request` directly.
- **Nested payloads modeled as named fields, not blanket passthrough.** `goals/save` `data`, `kpis` arrays, `forecast-wizard-v4/generate` `assumptions`/`summary`, `plan-snapshots` `step4_plan_data`, and `wizard/chat` `processData`/`conversationHistory` are deeply structured and shaped server-side; each is modeled as a named key (`z.unknown()`, `z.array(z.unknown())`, or `z.object({...}).passthrough()`) alongside its required string/number/boolean siblings. No verb uses a top-level `z.object({}).passthrough()` as its whole body schema.

## Known Stubs
None. All wrapped verbs forward to their original, fully-wired handlers — no placeholder data sources introduced.

## Gates
- **tsc:** `npx tsc --noEmit` — clean (exit 0).
- **File-level wrap loop:** every route.ts in the subtree carries a `withSchema`/`withQuerySchema` call — `SUBTREE_B_WRAPPED`.
- **No double-wrap:** verb-export audit confirms 21 new wrapper exports + 2 pre-existing (cfo), zero raw verb exports remain.
- **Schema-substance spot-check:** 7 sampled routes (actions, cfo/flag-client, forecast-wizard-v4/generate, kpis, subscription-budgets, wizard/chat, strategic-initiatives) all assert a non-empty typed field schema — PASS.
- **vitest:** `npx vitest run` — 1733 passed, 97 skipped, 7 todo; **1 failed = the known pre-existing timezone flake** `src/__tests__/goals/plan-period-banner.test.tsx` (`expected '2026-03-31' to be '2026-04-01'`). No other failures — zero regressions from this slice.

## Self-Check: PASSED

- ROUTE-LIST.md and SUMMARY.md both present on disk.
- All 12 per-subdir commits verified present in git log:
  - actions `001909bf`, analytics `a9d9e49b`, annual-plan `591d8f33`, business-profile `28ca7721`, cfo `e2cebaf3`, forecast-wizard-v4 `89a440b6`, goals `2d5c4c1c`, kpis `f279b7fd`, plan-snapshots `c944eaec`, strategic-initiatives `1fda380a`, subscription-budgets `8a907a7f`, wizard `cce5ba4c`.
- tsc clean; full vitest run green except the documented timezone flake.
