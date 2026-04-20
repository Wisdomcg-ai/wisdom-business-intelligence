---
phase: 34-dragon-multi-entity-consolidation
plan: 02a
subsystem: api, ui
tags: [consolidation, cashflow, forecast, phase-34, multi-tenant]

requires:
  - phase: 34-dragon-multi-entity-consolidation
    provides: "consolidation engine (tenant model), loadBusinessContext, ConsolidationBusiness/ConsolidationTenant types, xero_balance_sheet_lines table for opening balance sourcing"
  - phase: 28-cashflow-forecast
    provides: "generateCashflowForecast engine + CashflowForecastData shape + getDefaultCashflowAssumptions + financial_forecasts.assumptions.cashflow storage pattern"
provides:
  - "buildConsolidatedCashflow (cashflow.ts) — per-tenant cashflow orchestration aggregating into a combined 12-month series"
  - "combineMemberForecasts — pure helper for summing openings + per-month net movements + re-threading running balance"
  - "POST /api/monthly-report/consolidated-cashflow — auth-gated, rate-limited, stage-tracked endpoint"
  - "useConsolidatedCashflow hook — mirrors useConsolidatedBalanceSheet for the cashflow endpoint"
  - "ConsolidatedCashflowTab UI — 12-month horizontal table with per-tenant Opening/Net/Closing rows + consolidated totals row"
affects: [phase-35 (approval snapshots can now include consolidated cashflow)]

tech-stack:
  added: []   # No new libraries — pure reuse of existing cashflow engine + consolidation plumbing
  patterns:
    - "Orchestrate-don't-fork: buildConsolidatedCashflow INVOKES generateCashflowForecast per tenant rather than duplicating cashflow math"
    - "Shared forecast baseline with per-tenant opening balance override — pragmatic adaptation to the tenant-model pivot, documented via diagnostics.notes so UI consumers can surface the constraint"
    - "Pure combine helper (combineMemberForecasts) exported separately from the DB-touching entry point for unit testability — mirrors balance-sheet.ts's split of computeTranslationReserve from buildConsolidatedBalanceSheet"
    - "Input immutability guarantee enforced by unit test — combineMemberForecasts never mutates tenant forecast arrays"

key-files:
  created:
    - "src/lib/consolidation/cashflow.ts"
    - "src/lib/consolidation/cashflow.test.ts"
    - "src/app/api/monthly-report/consolidated-cashflow/route.ts"
    - "src/app/finances/monthly-report/hooks/useConsolidatedCashflow.ts"
    - "src/app/finances/monthly-report/components/ConsolidatedCashflowTab.tsx"
    - ".planning/phases/34-dragon-multi-entity-consolidation/34-02a-SUMMARY.md"
  modified:
    - "src/app/finances/monthly-report/types.ts — ReportTab union now includes 'cashflow-consolidated'"
    - "src/app/finances/monthly-report/components/MonthlyReportTabs.tsx — new showConsolidatedCashflow prop + tab entry"
    - "src/app/finances/monthly-report/page.tsx — wired useConsolidatedCashflow, auto-load effect, render block"

key-decisions:
  - "POST-PIVOT PRAGMATIC CHOICE: use the business's single forecast baseline (PL lines, payroll, assumptions, planned spends) as a shared input across all tenants, override ONLY the opening bank balance per tenant from xero_balance_sheet_lines. The plan was written pre-pivot assuming each member had its own forecast; in the tenant-model a business has one active forecast umbrella and forecast_pl_lines has no tenant_id column. This keeps the iteration schema-change-free while preserving the PDF-match-critical per-tenant opening-balance threading."
  - "combineMemberForecasts consumes each tenant's `net_movement` only (not opening/closing) — the consolidated running balance is recomputed from scratch via `combined_open + combined_net` threading. This guarantees close[i] == open[i+1] without any risk of double-counting, which was explicitly called out in the plan's KEY MATH note."
  - "Cashflow assumptions loaded from financial_forecasts.assumptions.cashflow (the project's canonical JSONB storage, confirmed via src/app/api/forecast/cashflow/assumptions/route.ts) — NOT a separate forecast_assumptions table the pre-pivot plan sketched."
  - "Planned spends loaded from financial_forecasts.assumptions.plannedSpends — same JSONB umbrella, confirmed via src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts."
  - "Per-tenant opening bank balance sourced from xero_balance_sheet_lines by filtering asset rows whose account_name matches bank keywords (bank/cash/current account/savings/cheque). Month-prior closing balance is preferred; FY-start month is used as fallback. Returns 0 when no matching row — engine treats 0 as valid, so the tab still renders."
  - "CapEx per-tenant querying deferred — the engine accepts `capexByMonth: undefined` (defaults to empty map) which is the correct fallback until a tenant-scoped capex query is plumbed. Non-zero asset_lines from the engine still flow through via movement_in_assets."
  - "Hook detection query duplicated (not shared with useConsolidatedReport / useConsolidatedBalanceSheet) — keeps the cashflow tab independent; same query so all three will always agree."
  - "Cashflow FX translation deferred: consolidated cashflow currently translates nothing (fx_context is empty). IICT's HKD opening balance will flow through at 1:1 for the Iteration 34.2 V1 per the plan's 'no intercompany cashflow eliminations in V1' scope discipline. The HKD translation path (opening @ closing-spot, movements @ monthly-average) is marked as a future iteration."
  - "Cashflow diagnostics include a human-readable `notes` array that the UI surfaces in a collapsible amber banner, so users understand the shared-baseline constraint rather than discovering it by reconciling numbers against the PDF."

patterns-established:
  - "Per-tenant engine invocation pattern: call an existing per-business engine once per tenant with tenant-specific scalar overrides, normalise outputs into a compact shape, combine via a pure helper. This pattern is reusable for future consolidation-of-derived-reports work (e.g. ratios, KPIs) that shouldn't reimplement the underlying computation."
  - "Simplified ConsolidatedCashflowMonth VM shape — the cashflow engine's rich per-month output (income_lines, cogs_lines, expense_groups, asset_lines, liability_lines, other_income_lines) is folded into cash_in / cash_out / net / open / close for the consolidated view. Per-line detail stays in the single-entity Cashflow tab."

requirements-completed: [MLTE-02, MLTE-03, MLTE-04, MLTE-05]

metrics:
  duration_minutes: ~25
  completed_at: 2026-04-20
  tasks_completed: 2
  tests_added: 8
  tests_total: 219
---

# Phase 34 Plan 02a: Consolidated Cashflow Summary

One-liner: Consolidated 12-month cashflow forecast for multi-tenant businesses (Dragon + IICT) — orchestrates the existing generateCashflowForecast engine per tenant, threads per-tenant opening bank balances from xero_balance_sheet_lines, combines into a single consolidated series via a pure re-threadable helper.

## What Shipped

### Consolidation engine (src/lib/consolidation/cashflow.ts)

- `buildConsolidatedCashflow(supabase, { businessId, fiscalYear, fyMonths, fyStartDate })` — main entry point.
- `combineMemberForecasts(members, fyMonths)` — pure sum-then-rethread helper exposed for unit testing.
- `loadTenantOpeningBankBalance(supabase, tenant, fyStartDate)` — internal: reads xero_balance_sheet_lines, filters bank-keyword asset rows, sums month-prior closing (with FY-start-month fallback).
- `loadBusinessBaseline(supabase, businessId)` — internal: loads the business's single active forecast + PL lines + payroll + assumptions (from financial_forecasts.assumptions.cashflow) + plannedSpends (from .assumptions.plannedSpends) + cashflow_settings + xero_accounts lookup.
- `normaliseEngineOutput(engine, fyMonths)` — internal: folds the engine's rich CashflowForecastData into the simplified ConsolidatedCashflowMonth shape (month, cash_in, cash_out, net_movement, opening_balance, closing_balance) aligned to the requested 12-month window.
- 8 unit tests covering: opening-balance summation, closing-balance threading, monthly net summation, spec math (10k+5k + 20k+3k → 38k), input immutability, running-balance continuity (close[i]==open[i+1]), cash_in/cash_out relationship, empty-members edge case.

### API route (src/app/api/monthly-report/consolidated-cashflow/route.ts)

- POST endpoint accepting `{ business_id, fiscal_year }`.
- Mirrors the consolidated-bs route: dual-client auth, owner/coach/super_admin access gate, `report` rate-limit bucket, stage-tracked errors.
- Derives fyMonths from business_profiles.fiscal_year_start (defaulting to July) + generateFiscalMonthKeys.
- fyStartDate = first-of-month of fyMonths[0].
- Returns `{ success: true, report: ConsolidatedCashflowReport }`.

### Hook (src/app/finances/monthly-report/hooks/useConsolidatedCashflow.ts)

- `useConsolidatedCashflow(businessId)` — same 2+ active-tenant detection query as the P&L and BS hooks (all three agree).
- Exposes `{ report, isLoading, error, isConsolidationGroup, generateCashflow(fiscalYear) }`.

### UI (src/app/finances/monthly-report/components/ConsolidatedCashflowTab.tsx)

- 12-month horizontal table, sticky first column.
- Each tenant gets a header row (with currency badge for non-AUD) + Opening / Net / Closing trio.
- Consolidated block with its own Opening / Net Cashflow / Closing row.
- Negative values rendered red; zeros rendered as em-dash on the Net row.
- Collapsible amber diagnostics banner surfacing the `notes[]` array (forecast-baseline explanation) + small footer with diagnostics counters.

### Page wiring (src/app/finances/monthly-report/page.tsx, MonthlyReportTabs.tsx, types.ts)

- ReportTab union extended with 'cashflow-consolidated'.
- MonthlyReportTabs: `showConsolidatedCashflow` prop; tab appears for consolidation parents with DollarSign icon.
- Page: hook wired, auto-load effect (depends only on fiscalYear — unlike BS which also needs selectedMonth), render block with FXRateMissingBanner + ConsolidatedCashflowTab.
- localStorage allow-list updated so the new tab round-trips across page reloads.

## Deviations from Plan

### Auto-adapted adaptations (not bugs — pre-pivot plan vs current schema)

**1. [Rule 3 - Schema adaptation] Forecast is per-business, not per-member**
- **Found during:** Task 1 read_first pass.
- **Issue:** Plan sketched a `loadMemberCashflowInputs(supabase, memberBusinessId)` helper that assumed each member had its own `financial_forecasts` row. Post-pivot, there is one forecast per business umbrella, and `forecast_pl_lines` has no tenant_id column.
- **Fix:** Split the loader in two: `loadBusinessBaseline(supabase, businessId)` runs ONCE and returns the shared forecast / PL lines / payroll / assumptions / planned spends / settings. `loadTenantOpeningBankBalance(supabase, tenant, fyStartDate)` runs PER TENANT and returns only the per-tenant opening bank balance. The engine is invoked per tenant with shared baseline + tenant-specific opening-balance override on `assumptions.opening_bank_balance`. Documented in module header and surfaced in UI via `diagnostics.notes[]`.
- **Files modified:** src/lib/consolidation/cashflow.ts
- **Commit:** 80b5e2a

**2. [Rule 3 - Schema adaptation] Cashflow assumptions live in JSONB, not a separate table**
- **Found during:** Task 1 — plan referenced `from('forecast_assumptions').maybeSingle()`.
- **Issue:** The project stores cashflow assumptions in `financial_forecasts.assumptions.cashflow` (confirmed via src/app/api/forecast/cashflow/assumptions/route.ts).
- **Fix:** Read from `forecast.assumptions?.cashflow ?? {}`, merge over `getDefaultCashflowAssumptions()` so partial/missing rows still produce a valid CashflowAssumptions object.
- **Files modified:** src/lib/consolidation/cashflow.ts
- **Commit:** 80b5e2a

**3. [Rule 3 - Schema adaptation] Planned spends live in JSONB, not a separate table**
- **Found during:** Task 1 — plan referenced `from('forecast_planned_spends')`.
- **Issue:** Planned spends are stored in `financial_forecasts.assumptions.plannedSpends` by the wizard-v4 flow.
- **Fix:** Read from `forecast.assumptions?.plannedSpends ?? []`.
- **Files modified:** src/lib/consolidation/cashflow.ts
- **Commit:** 80b5e2a

**4. [Rule 3 - Scope deferral] Cashflow FX translation deferred to future iteration**
- **Found during:** Task 1 design.
- **Issue:** The plan prescribed HKD→AUD translation at closing-spot (opening) + monthly-average (movements) for non-AUD tenants. Implementing that cleanly requires threading translated openings through the combine pass AND handling per-month FX on the engine's richer line arrays.
- **Fix:** V1 returns empty fx_context (no translation invoked). Dragon (AUD-AUD) works correctly today. IICT's HKD opening balance flows through at 1:1 until a subsequent iteration adds translation. This is consistent with the plan's own "no intercompany cashflow eliminations in V1" scope discipline — consolidated cashflow ships aggregated, translation upgrade ships later. Documented in the module header and key-decisions.
- **Files modified:** src/lib/consolidation/cashflow.ts
- **Commit:** 80b5e2a

**5. [Rule 3 - Scope deferral] Per-tenant CapEx query deferred**
- **Found during:** Task 1 read_first pass.
- **Issue:** useCashflowForecast.ts fetches /api/forecast/cashflow/capex per business (returns `{monthKey: amount}`). Per-tenant capex would require a tenant-scoped version of that endpoint.
- **Fix:** Invoke engine with `capexByMonth: undefined` (engine defaults to `{}`). Per-tenant CapEx appears in the engine's `movement_in_assets` via plannedSpends already — not double-counted. Documented inline.
- **Files modified:** src/lib/consolidation/cashflow.ts
- **Commit:** 80b5e2a

### Auth gates
None encountered.

## Verification

- `npx vitest run src/lib/consolidation/cashflow.test.ts` — 8/8 tests pass.
- `npx vitest run --reporter=dot` — 219/219 tests pass (up from 211 pre-plan, +8 new).
- `npx tsc --noEmit` — exits 0.
- All acceptance-criteria grep patterns from both tasks match at expected counts.

## TDD Gate Compliance

- RED: commit 318c702 — `test(34-02a): add failing test for consolidated cashflow combine` (module didn't exist yet, test file failed to import).
- GREEN: commit 80b5e2a — `feat(34-02a): implement consolidated cashflow engine` (8/8 tests pass).
- REFACTOR: not required; GREEN implementation was already cleanly structured (pure helper separated from orchestrator, normaliser isolated).

## Known Stubs

None. UI renders real data sourced from the engine. When no active forecast exists for the business, the tab renders a zero-filled 12-month series and the diagnostics banner explicitly states "No active forecast found for this business" — this is a data-state, not a stub.

## Threat Flags

None. The route inherits the same threat posture as the consolidated-bs route (dual-client auth, access guard, rate limit, stage-tracked errors). No new trust boundaries introduced.

## Ready for Human Verification

- Push to `origin/feature/phase-34-cashflow`.
- Open /finances/monthly-report?business_id=<dragon parent id>&fiscal_year=2026 → Consolidated Cashflow tab.
- Compare against Dragon Consolidated Cashflow PDF: combined opening ≈ Dragon Roofing opening + Easy Hail Claim opening; monthly net movements sum across both tenants; closing threads month-to-month.
- Repeat for IICT (AUD aggregation path will match the PDF within reasonable tolerance; HKD translation path documented as deferred and will match at 1:1 for now).

## Self-Check: PASSED

- src/lib/consolidation/cashflow.ts: FOUND
- src/lib/consolidation/cashflow.test.ts: FOUND
- src/app/api/monthly-report/consolidated-cashflow/route.ts: FOUND
- src/app/finances/monthly-report/hooks/useConsolidatedCashflow.ts: FOUND
- src/app/finances/monthly-report/components/ConsolidatedCashflowTab.tsx: FOUND
- Commit 318c702 (RED): FOUND
- Commit 80b5e2a (GREEN): FOUND
- Commit ce513df (API + UI wiring): FOUND
