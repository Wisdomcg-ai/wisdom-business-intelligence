# Phase 59 — Forecast Seed from Prior FY

## Goal

When a coach lands on a new FY (e.g. FY27) during planning season, give them a one-click option to **seed** the new forecast from their existing prior-FY forecast — revenue lines, COGS, OpEx, team, subscriptions — instead of rebuilding from scratch. Excludes CapEx and Goals (both should be reset for the new year). Default growth % = 0 (operator adjusts per-line in the wizard).

## Why now

Direct follow-up to PR #163 (planning-season default shift, merged 2026-05-11). That PR fixed the "Y1 should be FY27, not FY26" problem by changing the default landing year, but it left the operator with a **blank** FY27 wizard. For coaches with ~15 existing JDS-style portfolio businesses, rebuilding revenue/COGS/OpEx/team line items from scratch each May is hours of repetitive data entry — and a CFO-grade tool should not require it. The natural workflow is "copy last year's plan forward, then adjust" (90% of budgeting reality).

Identified during Chunk 1 implementation 2026-05-11: an initial 150-LoC estimate ballooned to ~440 LoC once the wizard's localStorage-first persistence model + multi-table data layout (`financial_forecasts.assumptions` JSONB + `forecast_pl_lines` rows + `subscription_budgets` rows) was traced. Warranted its own phase rather than a rushed PR.

## Scope (5 plans)

### 59-01 — Seed service (`forecast-seed-service.ts`)

Pure backend transformation:
- Read prior FY forecast (assumptions JSONB + `forecast_pl_lines` + `subscription_budgets`).
- Strip `goals` and `capex` (and `plannedSpends`) sections from assumptions JSON before write.
- Shift every `forecast_months` key forward 12 months (e.g. `2025-07` → `2026-07`).
- Apply growth multiplier (default 1.00) to monthly values.
- Idempotency: refuse to seed if target forecast already has data; safe to retry against an empty target.
- Returns the payload that 59-02 will persist + 59-04 will hydrate.

### 59-02 — API endpoint (`POST /api/forecast/seed-from-prior`)

`{ businessId, targetFiscalYear }` → service call → DB writes:
- `UPDATE financial_forecasts SET assumptions = <stripped+shifted>` on the target row
- `INSERT INTO forecast_pl_lines` with shifted month keys
- `INSERT INTO subscription_budgets` rows for target FY (copy vendor list)

Auth: same access pattern as existing forecast routes. Sentry capture on failure (post-Phase 46 norm).

### 59-03 — Empty-state UI (`ForecastEmptyState.tsx` extensions)

When `priorFiscalYearWithForecast` is set, replace the single CTA with two side-by-side buttons:
- `Start FY{target} Forecast` (blank — current behavior, secondary style)
- `Seed from FY{prior} forecast` (primary, recommended)

Click → calls 59-02 endpoint → on success, opens the wizard with the seeded forecast loaded.

### 59-04 — Wizard hydration handshake

Verify the seeded DB state flows into wizard state correctly:
- `useForecastWizard.ts` mount logic prefers localStorage today (`useForecastWizard.ts:367-369`). After a seed, localStorage for this `(businessId, fiscalYearStart)` key may hold stale data from a previous session.
- Decision: when wizard opens with `startFresh=true` from the seed flow, clear localStorage **before** mount so the DB-seeded `forecast.assumptions` is the source of truth.
- Verify the hydration path actually loads `forecast.assumptions` from DB and doesn't silently re-default to empty state.

### 59-05 — Tests + verification

- Unit: month-key shift on a 12-month object preserves all values, year-shifted keys
- Unit: assumptions stripping removes goals/capex/plannedSpends but preserves revenue/cogs/opex/team/subscriptions
- Unit: growth multiplier applied uniformly across forecast_months values
- Integration: seed against a fixture FY26 forecast → assert target FY27 row state + pl_lines + subscriptions all populated correctly
- Smoke (manual): JDS preview deploy — seed FY27 from FY26, open wizard, verify state pre-populated

## Out of scope

- **Non-zero default growth %** — operator confirmed default 0; per-line growth adjustment is the existing wizard flow's responsibility, not the seed step's.
- **CapEx + Goals seeding** — explicitly excluded per discussion; both should be reset for new FY.
- **Cross-business templates** — seeding from another business's forecast (e.g. "use this consulting firm's structure as a template"). Different feature.
- **Mid-year reseed** — only triggered from the empty-state CTA; if a target forecast already has data the seed is refused.
- **Roadmap drift** — the broader issue that phases 13-58 mostly aren't in `.planning/ROADMAP.md` is real but separate hygiene work.

## Dependencies

- Phase 58 forecast page architecture (`ForecastEmptyState`, wizard mount path) is stable.
- Phase 57 (subscription_budgets data model) is in production.
- Phase 46 Sentry capture pattern is the post-merge norm for new routes (per SEC-07 policy).
- PR #163 (planning-season default shift) is on main as `367dc268` — this phase depends on the FY27-default-during-planning-season behavior it introduced.

## Success criteria

After this phase ships:
- Coach opens `/finances/forecast` on JDS in planning season → empty state shows two CTAs ("Start blank" + "Seed from FY26").
- Clicking "Seed from FY26" creates a FY27 forecast pre-populated with FY26's revenue lines, COGS, OpEx, team, subscriptions. CapEx + Goals empty.
- Wizard opens on FY27 with all pre-populated values visible in Step 3 (Revenue/COGS), Step 4 (Team), Step 5 (OpEx), Step 6 (Subscriptions).
- Edit-and-save in the wizard works normally; localStorage / DB sync is not broken by the seed.
- Re-running seed against a forecast that already has data is refused with a clear error (not a silent overwrite).
- `console.error` count in `src/app/api/forecast/` does not regress from Phase 46 baseline (5).
- Vercel build + typecheck + vitest + lint all green.

## Risk + rollback

**Risk:** the wizard's localStorage-first persistence could silently drop the seeded data if 59-04 isn't correct. Mitigation: 59-04 is its own plan with explicit verification, and 59-05 includes a manual smoke test.

**Risk:** existing JDS FY27 record (auto-created by `getOrCreateForecast` after Chunk 1 shipped) may have empty pl_lines but a non-empty assumptions row from a prior visit. Mitigation: 59-01 service treats "empty pl_lines + default assumptions" as seedable; only refuses on detected non-default data.

**Rollback:** purely additive feature. If the seed endpoint is buggy, revert the PR — the "Start blank" CTA path (which is just today's behavior after Chunk 1) remains.
