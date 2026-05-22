---
phase: 67
slug: multi-currency-consolidation-fix
status: P1 in progress
created: 2026-05-23
---

# Phase 67 — Multi-Currency Consolidation Fix

## Problem

Consolidated businesses with one or more non-AUD Xero tenants (e.g. **IICT Group** with the HK subsidiary "IICT Group Limited") show **raw, unconverted** foreign-currency amounts in:
- Forecast wizard Step 2 (prior-year card)
- Forecast wizard Step 3 (current-FY actuals, YTD)
- Forecast page-load views
- AI CFO summaries
- Non-consolidated monthly-report views

Root cause is two-fold:

1. **Data**: `xero_connections.functional_currency` is mis-tagged. All three IICT tenants are tagged `AUD`, including the HK entity ("IICT Group Limited"). The OAuth/sync paths don't capture the actual Xero `/Organisation.BaseCurrency` on connect.
2. **Code**: the forecast wizard's read paths (`historical-pl-summary.ts`, `forecast-read-service.ts`) bypass the existing `src/lib/consolidation/` FX engine entirely. They sum `xero_pl_lines` rows across tenants as if all values were in the same currency.

## Existing infrastructure (already correct, not used by wizard)

- `src/lib/consolidation/engine.ts` — FX-aware consolidation engine with eliminations + account alignment
- `src/lib/consolidation/fx.ts` — FX-rate loader from `fx_rates`
- `fx_rates` table populated with monthly HKD/AUD rates back through 2025-12
- `/api/monthly-report/consolidated{,-bs,-cashflow}` routes that already use the engine

## Scope

Four shippable phases, each a separate PR.

| Plan | Title | Effort | Dep |
|---|---|---|---|
| [67-01](67-01-PLAN.md) | Data fix: capture & backfill functional_currency | ~3h | none |
| [67-02](67-02-PLAN.md) | Route wizard reads through the consolidation engine | 1–2d | 67-01 |
| [67-03](67-03-PLAN.md) | Sibling reads (CFO, monthly-report non-consolidated, sync-forecast) | ~1d | 67-02 |
| [67-04](67-04-PLAN.md) | UI signaling — translation context & missing-rate warnings | ~0.5d | 67-02/03 |

Total ~3–4 days of focused work.

## Out of scope (deferred)

- **P5 candidate**: parameterize `presentation_currency` per business (currently hardcoded `'AUD'` at `engine.ts:136`)
- A one-time migration of any saved `forecast_pl_lines` for IICT that may already encode mixed-currency totals (audit + decide in 67-02 implementation)

## Open policy questions (must settle before 67-03)

1. `/api/Xero/sync-forecast` push-back to a foreign-currency tenant: push translated AUD, or translate AUD back to HKD per tenant before push? (Recommendation: translate-back; AUD is presentation, not source-of-truth.)
2. Non-consolidated monthly-report views for multi-currency businesses: hide, redirect to consolidated, or banner-and-allow?

## Success criteria

- IICT forecast wizard Step 2 + Step 3 show AUD totals matching the consolidated monthly-report view (within rounding).
- Single-tenant clients (Envisage, JDS, Sydney Pressed Metal, Efficient Living) show **bit-identical** wizard data before and after Phase 67.
- HK tenant's `functional_currency` is `'HKD'` in DB; future OAuth connects capture BaseCurrency at creation.
- Operator can see the FX rate used and any missing-rate warnings.
