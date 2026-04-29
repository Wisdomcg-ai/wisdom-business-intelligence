# Phase 48: Decimal Money Arithmetic

**Milestone:** v1.1 — Codebase Hardening
**Status:** Not started
**Source:** `CODEBASE-AUDIT.md` Top-10 #4, Section C (Type Safety & Correctness), written 2026-04-28

## Goal

Replace JavaScript `number` summation in financial paths with `decimal.js`. Use **shadow-compute + reconciliation log + per-tenant flag rollout** to ship safely. **The most delicate phase in v1.1 — must not change client-visible numbers without notice.**

## Why now

- DB stores money as `numeric(15,2)` (correct), but TS reads it as JS `number` and sums in IEEE 754. Multi-currency consolidation (Dragon AUD + IICT NZ + HKG HKD via FX rates) compounds the drift. The audit estimates a $1M annual revenue can drift $5–50; multi-tenant elimination entries can drift more.
- Series-A scrutiny will flag "money in floats" inside the first 5 minutes — worth fixing now, while the consolidation surface is still small (3 active tenants).
- Done after Phase 47 because the validation baseline must be in place before money changes ship — a malformed forecast input that previously coerced to NaN should be rejected by Zod, not silently propagated through `Decimal`.

## Dependencies

- **Phase 47 (Input Validation Rollout)** — every consolidation/forecast write route in VALID-04 must be in observe mode at minimum. We need to know the input shape is what we expect before swapping the arithmetic layer.

## Blast Radius

**Medium — financial number changes ≤ $1 per cell, behind per-tenant flag, with 48-hour client communication before each tenant flip.** Per-tenant rollout order: Fit2Shine first (coaching, lowest stakes, AUD only), then Dragon (AUD-only, 2-entity consolidation), then IICT (multi-currency, highest stakes). Shadow-compute runs against all 3 tenants for 2-4 weeks before *any* tenant flips to precise mode. Rollback = flip the per-tenant flag back to false; no code change needed.

## Requirements (1:1 from REQUIREMENTS.md)

- **MONEY-01** — Add `decimal.js` to dependencies. No refactor yet.
- **MONEY-02** — Build a parallel `consolidatePrecise()` function alongside `src/lib/consolidation/engine.ts:consolidate()` — same inputs, same output shape, internal arithmetic via `Decimal`.
- **MONEY-03** — Create `consolidation_precision_log` table (additive migration). Schema: `id, business_id, period, cell_key, legacy_value numeric, precise_value numeric, delta numeric, computed_at`.
- **MONEY-04** — Wire `/api/monthly-report/consolidated` to call both `consolidate()` (used) and `consolidatePrecise()` (logged). Insert per-cell deltas where `|delta| > 0.001`.
- **MONEY-05** — Build a one-page admin dashboard at `/admin/precision-log` showing delta volume per tenant per period.
- **MONEY-06** — After 2-4 weeks of shadow-compute across all 3 production tenants, review the precision log with a finance hat. Resolve any deltas > $1.
- **MONEY-07** — Per-tenant flag rollout — `consolidation_precise_mode_enabled` boolean on `businesses` table. Enable for Fit2Shine first (coaching, lowest stakes), then Dragon (AUD-only), then IICT (multi-currency, highest stakes). 48-hour client communication before each flip.
- **MONEY-08** — After all 3 tenants on precise mode for 2 months and stable, delete legacy `consolidate()` and unwind `consolidation_precision_log` insertion.

## Success Criteria (observable)

> **Note:** success criteria are written around the **shadow-compute reconciliation log**, not around "the engine works correctly" — the engine is already validated by 11 unit-test files and is the strongest part of the codebase. The risk this phase is managing is the *transition*, not the destination.

1. **`consolidation_precision_log` populates with rows on every monthly-report load** for all 3 production tenants — i.e. shadow-compute is wired and running, not silently no-op'd. Verified by a SQL query against the table 24 hours after MONEY-04 ships.
2. **The `/admin/precision-log` dashboard shows deltas grouped by tenant + period** — surfaces which cells differ and by how much. Used as the human-review surface for MONEY-06.
3. **`consolidation_precision_log` shows zero deltas > $1 for 14 consecutive days across all tenants** before any tenant is flipped to precise mode — proven by a saved query. Any single delta > $1 stops the rollout pending a finance review.
4. **Fit2Shine flipped to precise mode (MONEY-07 step 1) without a client report change > $1** — verified by comparing Fit2Shine's most recent monthly report pre- and post-flip and by Shari's sign-off. Same gate applies to Dragon and IICT before each flip.
5. **All 3 tenants on precise mode for 60 consecutive days with zero finance-team-flagged discrepancies**, after which legacy `consolidate()` is deleted and the precision-log insertion is removed (MONEY-08).

## Evidence in audit

- `src/lib/consolidation/types.ts:25` — `monthly_values: Record<string, number>` (audit Top-10 #4).
- `src/lib/consolidation/engine.ts:200+` — summation loops on JS `number` (audit Top-10 #4).
- DB schema stores money as `numeric(15,2)` correctly; the precision loss is on the TS side.
- 11 existing unit-test files in `src/lib/consolidation/__tests__/` — strong baseline that `consolidatePrecise()` must match output-equivalent (within $0.001) before any tenant flips.

## Out of scope for this phase

- Forecast-side Decimal refactor (the audit Top-10 #4 estimate of "2 weeks across forecast paths" is deferred to v1.2 — consolidation is the higher-leverage half).
- Branded `TranslatedAmount<'AUD'>` type for FX-translation safety (deferred to v1.2 — needs the Decimal foundation first).
- FX rate precision changes (out of scope; FX engine in `src/lib/consolidation/fx.ts` already uses appropriate precision).
- Any new feature or report — this is purely the arithmetic layer swap.

## Plans

TBD — to be drafted at `/gsd-plan-phase 48`.
