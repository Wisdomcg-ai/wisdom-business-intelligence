---
phase: 47-input-validation-rollout
plan: 04
subsystem: input-validation
tags: [zod, observe-mode, financial-writes, VALID-04]
requires: ["47-01"]
provides: ["observe-baseline-financial-write-tree"]
affects: ["src/app/api/forecast/**", "src/app/api/forecasts/**", "src/app/api/Xero/**", "src/app/api/consolidation/**", "src/app/api/cfo/report-status"]
key-files:
  created:
    - .planning/phases/47-input-validation-rollout/47-04-ROUTE-LIST.md
  modified:
    - 26 financial-write route.ts files (see per-route table)
decisions:
  - "Wrapped only the 26 inbound request.json() boundaries; the ~35 upstream-response .json() parses (xeroResp/arResp/apData) were left untouched"
  - "Bodyless mutating routes (Xero/chart-of-accounts-full POST, consolidation/fx-rates/[id] DELETE) carry NO body schema — they have no inbound body to model"
  - "Handler param annotations changed NextRequest -> Request (type-only, behavior-neutral) to satisfy the wrapper's generic Request signature; runtime arg is unchanged"
  - "Multi-verb routes (forecasts/scenarios POST+PATCH) get one schema per verb, each wrapping its own export"
metrics:
  routes-wrapped: 26
  completed: 2026-05-31
---

# Phase 47 Plan 04: Financial-Write Observe-Mode Schemas (VALID-04) Summary

Attached Zod schemas in OBSERVE mode to the 26 highest-value inbound-body
financial-write routes (forecast/forecasts, Xero/*, consolidation/*, plus
cfo/report-status), establishing a would-reject baseline Phase 48 can trust —
with zero production behavior change.

## Wrapped routes — per-verb modeled field count

| Route file | routeId | verb | typed fields |
|------------|---------|------|--------------|
| forecast/seed-from-prior | forecast/seed-from-prior | POST | 2 (businessId:str, targetFiscalYear:num) |
| forecast/cashflow/settings | forecast/cashflow/settings | POST | 1 (forecast_id:str) + passthrough settings |
| forecast/cashflow/sync-balances | forecast/cashflow/sync-balances | POST | 4 (business_id:str, forecast_id:str?, balance_date:str, save:bool?) |
| forecast/cashflow/capex | forecast/cashflow/capex | POST | 3 (business_id:str, from_month:str, to_month:str) |
| forecast/cashflow/assumptions | forecast/cashflow/assumptions | POST | 2 (forecast_id:str, business_id:str?) + passthrough |
| forecast/cashflow/profiles | forecast/cashflow/profiles | POST | 9 (forecast_id, xero_account_id, account_code, account_name, cashflow_type, days:num, distribution, schedule_base_periods, delete:bool) |
| forecast/cashflow/bank-balances | forecast/cashflow/bank-balances | POST | 3 (business_id:str, from_month:str, to_month:str) |
| forecast/[id]/adjust-forward | forecast/[id]/adjust-forward | PATCH (Promise params) | 3 (adjustmentPct:num, yearStartMonth:num, fiscalYear:num) |
| forecasts/versions | forecasts/versions | POST | 4 (forecastId:str, versionName:str, parameters?, versionType:enum?) |
| forecasts/apply-scenario | forecasts/apply-scenario | POST | 2 (forecastId:str, parameters) |
| forecasts/import-csv | forecasts/import-csv | POST | 2 (forecastId:str, lines:array) |
| forecasts/scenarios | forecasts/scenarios | POST | 7 (forecast_id, name, description?, revenue_multiplier:num?, cogs_multiplier:num?, opex_multiplier:num?, scenario_type?) |
| forecasts/scenarios | forecasts/scenarios | PATCH | 1 (scenario_id:str) + passthrough updates |
| Xero/subscription-transactions | Xero/subscription-transactions | POST | 2 (business_id:str, account_codes:array<str>) |
| Xero/sync-all | Xero/sync-all | POST | 2 (businessId:str?, all:bool?) |
| Xero/reactivate | Xero/reactivate | POST | 1 (business_id:str) |
| Xero/sync | Xero/sync | POST | 1 (business_id:str) |
| Xero/sync-forecast | Xero/sync-forecast | POST | 2 (business_id:str?, businessId:str?) |
| Xero/complete-connection | Xero/complete-connection | POST | 3 (pending_id:str, tenant_id:str?, tenant_ids:array<str>?) |
| Xero/disconnect | Xero/disconnect | POST | 1 (business_id:str) |
| Xero/refresh-pl | Xero/refresh-pl | POST | 2 (business_id:str?, businessId:str?) |
| consolidation/businesses/[id] | consolidation/businesses/[id] | PATCH (Promise params) | 1 (consolidation_budget_mode:str?) + passthrough |
| consolidation/tenants/[connectionId] | consolidation/tenants/[connectionId] | PATCH (Promise params) | 5 (display_name:str?, display_order:num?, functional_currency:str?, include_in_consolidation:bool?, is_active:bool?) |
| consolidation/fx-rates | consolidation/fx-rates | POST | 4 (currency_pair:str, rate_type:str, period:str, rate:num) |
| consolidation/fx-rates/sync-oxr | consolidation/fx-rates/sync-oxr | POST | 3 (currency_pair:str, year:num, month:num) |
| consolidation/forecasts/[forecastId] | consolidation/forecasts/[forecastId] | PATCH (Promise params) | 1 (tenant_id:str\|null) |
| cfo/report-status | cfo/report-status | POST | 3 (action:str, business_id:str, period_month:str) + passthrough |

**26 route files, 27 wrapped verbs (forecasts/scenarios carries POST + PATCH).**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Handler param annotation NextRequest -> Request**
- **Found during:** Task 2 (tsc gate)
- **Issue:** The wrapper's generic signature fixes the first param as `Request`; a
  handler annotated `(request: NextRequest)` is contravariantly NOT assignable
  (NextRequest is the subtype), so tsc rejected every wrapped POST/PATCH that used
  the NextRequest annotation. Prior waves (2a/2b) only ever wrapped plain-`Request`
  handlers, so this is the first NextRequest-typed batch.
- **Fix:** Changed the handler parameter annotation from `NextRequest` to `Request`
  on the wrapped handlers only. Type-only change — the runtime argument Next.js
  passes is unchanged, and no wrapped handler reads a NextRequest-only member
  (`request.nextUrl` appears only in the un-wrapped Xero/sync GET).
- **Files modified:** all wrapped routes whose handler used `NextRequest`
- **Commit:** feaed512

## Scope Notes (intentional non-wraps)

- **Upstream-response parses NOT wrapped:** `await xeroResp.json()` / `arResp.json()` /
  `apData.json()` in sync-balances, capex, bank-balances are upstream Xero responses,
  not inbound request bodies. Correctly excluded.
- **Bodyless mutating routes:** `Xero/chart-of-accounts-full` POST (delegates to its
  own GET via a searchParam) and `consolidation/fx-rates/[id]` DELETE (param-only)
  read no inbound body and carry no body schema. They count toward the RESEARCH
  Xero=9 / consolidation=6 mutating tallies.
- **GET query routes:** out of scope for this write-tier plan; no withQuerySchema
  added.

## Gate Results

- ROUTE-LIST.md exists; all 26 routes contain a `withSchema` call (loop verify passed).
- `npx tsc --noEmit` clean.
- `npx eslint` clean on all 26 touched route files.
- Substance spot-check: every schema has 1-8 typed money/id/bool fields (no empty
  passthrough-only schemas).
- Full `npx vitest run`: **1733 passed, 1 failed** — the single failure is the known
  timezone flake at `src/__tests__/goals/plan-period-banner.test.tsx`
  (`2026-03-31` vs `2026-04-01` date-input off-by-one). Forecast / Xero /
  consolidation suites all green.
- No financial route added to `ZOD_ENFORCE_ROUTES` (observe mode only).

## Commit

- `feaed512` — feat(47-04): attach observe-mode schemas to forecast/Xero/consolidation write routes (VALID-04)

## Self-Check: PASSED
- ROUTE-LIST.md present; 26/26 routes wrapped (verified by loop).
- tsc clean, eslint clean, substance spot-check passed.
- Full suite green except the known timezone flake.
- Commit feaed512 exists.
