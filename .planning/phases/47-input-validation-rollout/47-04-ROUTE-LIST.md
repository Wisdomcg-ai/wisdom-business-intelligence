# 47-04 ROUTE-LIST — financial-write tree (VALID-04)

Authoritative checklist for Task 2. Built from
`grep -rln "request.json()" src/app/api/forecast src/app/api/forecasts src/app/api/Xero src/app/api/consolidation src/app/api/cfo/report-status`,
filtered to INBOUND `request.json()` boundaries only. Upstream-response parses
(`await xeroResp.json()`, `await arResp.json()`, `await apData.json()`, etc.) are
EXCLUDED — they appear in sync-balances / capex / bank-balances but are NOT wrapped.

routeId = path under `src/app/api`, no leading slash, `/route.ts` stripped.
Capital-`X` `Xero` segment preserved EXACTLY (production Linux is case-sensitive).

All wrapped in OBSERVE mode. Nothing added to `ZOD_ENFORCE_ROUTES`.

## forecast / forecasts (14 mutating verbs across 12 files)

| # | File | routeId | Verb | Mode |
|---|------|---------|------|------|
| 1 | src/app/api/forecast/seed-from-prior/route.ts | forecast/seed-from-prior | POST | body |
| 2 | src/app/api/forecast/cashflow/settings/route.ts | forecast/cashflow/settings | POST | body |
| 3 | src/app/api/forecast/cashflow/sync-balances/route.ts | forecast/cashflow/sync-balances | POST | body |
| 4 | src/app/api/forecast/cashflow/capex/route.ts | forecast/cashflow/capex | POST | body |
| 5 | src/app/api/forecast/cashflow/assumptions/route.ts | forecast/cashflow/assumptions | POST | body |
| 6 | src/app/api/forecast/cashflow/profiles/route.ts | forecast/cashflow/profiles | POST | body |
| 7 | src/app/api/forecast/cashflow/bank-balances/route.ts | forecast/cashflow/bank-balances | POST | body |
| 8 | src/app/api/forecast/[id]/adjust-forward/route.ts | forecast/[id]/adjust-forward | PATCH (Promise params) | body |
| 9 | src/app/api/forecasts/versions/route.ts | forecasts/versions | POST | body |
| 10 | src/app/api/forecasts/apply-scenario/route.ts | forecasts/apply-scenario | POST | body |
| 11 | src/app/api/forecasts/import-csv/route.ts | forecasts/import-csv | POST | body |
| 12 | src/app/api/forecasts/scenarios/route.ts | forecasts/scenarios | POST + PATCH | body |

## Xero (8 inbound-body verbs; capital-X preserved)

| # | File | routeId | Verb | Mode |
|---|------|---------|------|------|
| 13 | src/app/api/Xero/subscription-transactions/route.ts | Xero/subscription-transactions | POST | body |
| 14 | src/app/api/Xero/sync-all/route.ts | Xero/sync-all | POST | body |
| 15 | src/app/api/Xero/reactivate/route.ts | Xero/reactivate | POST | body |
| 16 | src/app/api/Xero/sync/route.ts | Xero/sync | POST | body |
| 17 | src/app/api/Xero/sync-forecast/route.ts | Xero/sync-forecast | POST | body |
| 18 | src/app/api/Xero/complete-connection/route.ts | Xero/complete-connection | POST | body |
| 19 | src/app/api/Xero/disconnect/route.ts | Xero/disconnect | POST | body |
| 20 | src/app/api/Xero/refresh-pl/route.ts | Xero/refresh-pl | POST | body |

> Note: `Xero/chart-of-accounts-full` POST reads NO inbound body (it sets a
> searchParam and delegates to its own GET) — not body-wrapped. Counts toward the
> RESEARCH "Xero=9 mutating" tally but carries no body schema.

## consolidation (5 inbound-body verbs)

| # | File | routeId | Verb | Mode |
|---|------|---------|------|------|
| 21 | src/app/api/consolidation/businesses/[id]/route.ts | consolidation/businesses/[id] | PATCH (Promise params) | body |
| 22 | src/app/api/consolidation/tenants/[connectionId]/route.ts | consolidation/tenants/[connectionId] | PATCH (Promise params) | body |
| 23 | src/app/api/consolidation/fx-rates/route.ts | consolidation/fx-rates | POST | body |
| 24 | src/app/api/consolidation/fx-rates/sync-oxr/route.ts | consolidation/fx-rates/sync-oxr | POST | body |
| 25 | src/app/api/consolidation/forecasts/[forecastId]/route.ts | consolidation/forecasts/[forecastId] | PATCH (Promise params) | body |

> Note: `consolidation/fx-rates/[id]` DELETE is param-only (no request body) —
> counts toward RESEARCH "consolidation=6 mutating" but carries no body schema.

## cfo

| # | File | routeId | Verb | Mode |
|---|------|---------|------|------|
| 26 | src/app/api/cfo/report-status/route.ts | cfo/report-status | POST | body |

## Tally

- forecast/forecasts inbound-body verbs: 14 (12 files; scenarios carries POST+PATCH)
- Xero inbound-body verbs: 8 (chart-of-accounts-full bodyless → RESEARCH "9" tally)
- consolidation inbound-body verbs: 5 (fx-rates/[id] DELETE bodyless → RESEARCH "6" tally)
- cfo/report-status: 1
- **26 route files wrapped with `withSchema` in observe mode.**

GET query-schema wrapping is OUT OF SCOPE for this write-tier plan (VALID-04 targets
the financial-write tree; GET reads flip in earlier query waves). No `withQuerySchema`
calls added here.
