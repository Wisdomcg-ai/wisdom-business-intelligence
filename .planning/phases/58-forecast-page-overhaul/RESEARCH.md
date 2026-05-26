# Phase 58 — Forecast Page Overhaul: Research

**Researched:** 2026-05-07
**Domain:** Forecast landing page rewire (data wiring, not new infra)
**Confidence:** HIGH

## Summary

The new dashboard does **not** need new aggregation infrastructure. `forecast_pl_lines` already holds both actuals and forecast values per month per line, and there's already a `/api/forecast/dashboard-actuals` endpoint that aggregates Revenue/GP/NP per month. The Xero balance-sheet endpoint also exists. Phase 58 is mostly a presentation rewire + one new aggregation endpoint for the KPI strip and a new heuristic insights function.

**Primary recommendation:** Reuse `forecast_pl_lines` (single source of truth — actuals already merged in via Xero sync), reuse `/api/forecast/dashboard-actuals` for the trajectory chart, reuse `/api/Xero/balance-sheet` for Cash Position. Build one new lightweight aggregator (`/api/forecast/[id]/overview-kpis` or compute client-side from already-loaded `plLines`) for the KPI strip's plan-vs-actual deltas.

---

## Question 1 — Data flow (current production page)

**Single shared loader:** `loadInitialData()` in `src/app/finances/forecast/page.tsx:194-289` loads everything once and passes via props. The three components share state — they don't fetch independently.

| Component | Source | Shape | Notes |
|---|---|---|---|
| `ForecastKPISummary` (`components/ForecastKPISummary.tsx:24-78`) | Pure derivation from `forecast` row + `assumptions` JSON. **No actuals.** | Reads `assumptions.goals.year1.revenue`, `assumptions.revenue.lines[].priorYearTotal`, `forecast.revenue_goal/gross_profit_goal/net_profit_goal`, `assumptions.team.*` | Today's KPI cards show **planned** numbers only — no YTD-vs-plan comparison. New dashboard needs YTD actuals → must combine with `plLines.actual_months`. |
| `ForecastMultiYearSummary` (`components/ForecastMultiYearSummary.tsx:33-154`) | Pure derivation from `assumptions.goals.year1/year2/year3` + `assumptions.revenue.lines[].year2Quarterly/year3Quarterly` | All from `assumptions` JSON | No DB reads, no actuals. |
| `PLForecastTable` (`components/PLForecastTable.tsx:28+`) | `plLines: PLLine[]` (passed in), where each line carries `actual_months: {[YYYY-MM]: number}` and `forecast_months: {[YYYY-MM]: number}` | `PLLine` per `types.ts:71-91` | Single source covers both actuals (Xero-sourced) and forecast. |

**The data store under it all:**
- `financial_forecasts` — one row per forecast version. Holds `assumptions` JSONB (wizard output), `revenue_goal`, `gross_profit_goal`, `net_profit_goal`, `fiscal_year`, period bounds.
- `forecast_pl_lines` — server-materialized P&L rows. `actual_months` is populated via `/api/Xero/sync-forecast` (and refreshed via `/api/Xero/refresh-pl`). `forecast_months` is materialized via the `save_assumptions_and_materialize` RPC. Both live on the same row → no join needed.
- `loadPLLines(forecastId)` is the single loader (`services/forecast-service.ts:180`).

**Critical:** `forecast_pl_lines` already contains actuals — we do **NOT** call Xero P&L from the page. Actuals are pre-synced into rows. Wiring "YTD vs plan" means iterating `plLines`, summing `actual_months[m]` for completed months and `forecast_months[m]` for future months, bucketed by category.

**Existing helper endpoints already available:**
- `/api/forecast/dashboard-actuals` (`src/app/api/forecast/dashboard-actuals/route.ts`) — returns Revenue/GP/NP monthly arrays. **Use this for the trajectory chart, not a fresh implementation.** Knows about Revenue/COGS category buckets (lines 21-34).
- `/api/forecast/[id]/actuals-summary` — totals per category.
- `/api/forecast/quarterly-summary` — quarterly rollup.

**Recommendation for Phase 58.1 wiring:**
1. KPI strip: derive from `plLines` already loaded by the page (no new endpoint). Extract `Revenue/GP/NP` totals for `current_month`, `YTD` (sum of completed `actual_months`), `year-end forecast` (YTD actual + remaining `forecast_months`), `plan` (`assumptions.goals.year1.revenue`, etc.). Sparkline = last 6 months from `actual_months`.
2. Trajectory chart: call `/api/forecast/dashboard-actuals?businessId=&fiscalYear=` — already returns the exact shape needed.
3. Monthly trend table: derive from `plLines` (same shape `PLForecastTable` uses today, just different presentation).

This means **zero new aggregation code** for sections 1-3. Pure derivation from already-loaded state.

---

## Question 2 — Xero cash position

**Endpoint exists:** `src/app/api/Xero/balance-sheet/route.ts` (260 lines, fully implemented).

- **Path:** `GET /api/Xero/balance-sheet?business_id={id}&month=YYYY-MM&compare=yoy|mom`
- **Auth:** Standard auth + `verifyBusinessAccess`. Resolves dual-ID via try-3-IDs pattern (lines 100-117).
- **Response:** `BalanceSheetData` with `rows: BalanceSheetRow[]` flat list. Cash lives under section `"Asset"` (mapped from Xero's "Assets") as `line_item` rows. Each row: `{ type, label, current, prior, variance, variance_pct }`.
- **Currently used by:** `src/app/finances/monthly-report` (per type import on line 6).

**For the KPI strip "Cash Position":**
- Call `/api/Xero/balance-sheet?business_id=X&month={current_month}` once.
- Filter `data.rows` for line items under the `"Asset"` section_header where `label` matches bank/cash patterns. Xero standard labels: `"Business Bank Account"`, `"Cash on Hand"`, `"Petty Cash"`, etc. Safer: take all line items between the `"Asset"` section header and the next `subtotal` row whose label starts with "Bank" or matches a configured cash-account list — but the simplest, robust approach is to look at `account_type='BANK'` accounts. **Caveat:** this endpoint flattens to labels and drops Xero's `AccountType`. To get just bank accounts, either:
  - **Option A (recommended, fast):** Add an optional `?cash_only=true` mode to `/api/Xero/balance-sheet` that filters Xero rows by AccountType=BANK before flattening, returning `{ cash_total, accounts: [{ name, balance }] }`.
  - **Option B:** Build a new `/api/Xero/cash-position?business_id=&date=` endpoint that calls `/Reports/BalanceSheet` directly and sums Xero account_type='BANK'. ~50 lines.

**Recommendation:** Option A — extend existing endpoint. Reuses token resolution, dual-ID lookup, all error paths. New code is ~30 lines on top of an already-tested route.

**Fallback:** If Xero connection is missing/expired, KPI card shows "—" (per acceptance criterion 5).

---

## Question 3 — Tabs strategy

**CONTEXT.md decision #1 already locks this:** "keep P&L / Assumptions / Versions as accessible tabs."

The remaining question is *how* — explicit tab UI, or footer drill-down? Let me inspect what's lightest:

`ForecastTabs.tsx:5-43` — already a clean 3-tab nav (`pl | assumptions | versions`). Currently above table content. Switching by `localStorage.getItem('forecast-active-tab')` (page.tsx:55-64).

**Recommended option: A+B hybrid (Overview-default tabs).**

Promote tabs to 4: `overview | pl | assumptions | versions`. Default to `overview`. Add `'overview'` to the union in `ForecastTabs.tsx:5`, add a `BarChart3` icon entry, default `useState<ForecastTab>('overview')`. The 3 footer drill-down links in the prototype ("Edit Plan · Full P&L · Versions · Export") become tab-jump buttons (e.g., "Full P&L →" sets `activeTab='pl'`).

**Why this beats Option B (footer-only) or Option C (separate route):**
- Zero blast radius on routing — same `/finances/forecast` URL.
- `localStorage` persistence already exists, just extend the allowed values.
- Keeps Phase 57 wizard state intact (wizard reuses tab state for "Edit Step X" callbacks at page.tsx:688-694 — those still work, they just close back to whichever tab user came from).
- Power users (Matt as coach) can still pin Assumptions/P&L if they prefer those views.

**Migration note:** The `localStorage` reader at `page.tsx:59` whitelists `['pl', 'assumptions', 'versions']`. Add `'overview'` to that array AND consider migrating users who have `pl` saved → reset to `overview` on first load post-deploy (one-shot localStorage migration: `if (saved === 'pl' && !localStorage.getItem('forecast-tab-migrated-58')) { saved = 'overview'; localStorage.setItem('forecast-tab-migrated-58', '1') }`). This ensures existing users see the new dashboard, not the old P&L table.

---

## Question 4 — Insight heuristic rules

Inputs available per business: `plLines[].actual_months/forecast_months` (revenue, COGS, opex, subscriptions, team buckets), `assumptions.goals.year1.{revenue, grossProfitPct, netProfitPct}`, FY period bounds, current month.

Compute helpers: `ytd_actual(category)`, `ytd_plan(category) = plan_annual * (months_elapsed / 12)`, `year_end_projected(category) = ytd_actual + sum(forecast_months[remaining])`, `prior_6mo_avg(category)`.

**8 rules** (planner converts each to a `generateInsights()` branch):

| # | Condition | Output template | Severity |
|---|---|---|---|
| 1 | `ytd_revenue >= ytd_plan_revenue * 1.05` | `"Revenue is {fmt(delta)} above plan YTD — strongest month: {strongest_month_name} ({fmt(strongest_month_revenue)})."` | positive |
| 2 | `ytd_revenue <= ytd_plan_revenue * 0.95` | `"Revenue is {fmt(abs(delta))} below plan YTD. Forecast year-end is {fmt(year_end_projected)} vs target {fmt(plan_annual)}."` | warning |
| 3 | `ytd_opex >= ytd_plan_opex * 1.05` | `"Operating costs are {pct}% over budget YTD — biggest variance: {top_overrun_category} (+{fmt(category_overrun)})."` | warning |
| 4 | `current_gp_margin_pct < target_gp_pct - 2` | `"Gross margin is {delta}pt below target ({current_pct}% vs {target_pct}%). COGS running {pct}% of revenue."` | warning |
| 5 | `last_3mo_avg_margin > prior_3mo_avg_margin + 1` | `"Margin is improving — up {delta}pt over the last 3 months."` | positive |
| 6 | `subscriptions_ytd >= subscriptions_plan_ytd * 1.10` | `"Subscriptions are {pct}% over budget. Top overruns: {top_3_subscription_lines}."` | warning |
| 7 | `abs(year_end_projected_np - plan_np) >= 0.10 * plan_np` | `"Net profit projected at {fmt(year_end_np)} vs plan {fmt(plan_np)} — {fmt(delta)} {above|below} target."` | positive if above, warning if below |
| 8 | `month_index >= 9 && year_end_revenue < plan_annual * 0.95` | `"Only {months_left} months left in FY — {fmt(gap)} short of plan. Need {fmt(monthly_needed)}/month to close gap."` | warning |

Display rules (planner spec):
- Render at most 3 insights, ranked: rules 8 > 2 > 7 > 3 > 6 > 4 > 5 > 1 (urgency-first).
- If no rule fires, show a neutral baseline: `"Tracking close to plan — {pct}% of YTD target."`
- Insights are pure functions of already-loaded state — no extra API calls.

---

## Risks / unknowns

1. **Sparkline source for Cash KPI card.** Xero balance-sheet endpoint returns one date snapshot. For a 6-month sparkline, would need 6 separate API calls (slow) OR a stored `cash_history` table. **Mitigation:** Phase 58.3 ships current cash only (single value). Sparkline deferred or pulled from a future cash-snapshot table.
2. **Category labels are not standardized across tenants.** `dashboard-actuals/route.ts:21-23` hardcodes Revenue/COGS category strings. JDS may use different labels. **Mitigation:** Already a shipped concern — current dashboard works for JDS, new page inherits same robustness/limitations.
3. **`forecast_pl_lines.actual_months` freshness.** If user hasn't synced Xero recently, KPI strip's "current month YTD" may be stale. **Mitigation:** Show `forecast.updated_at` or a "last synced X ago" badge on the page; reuses `XeroConnectionPanel` already present.
4. **No-forecast empty state with Xero YTD numbers** (CONTEXT decision #5). When `plLines.length === 0`, we still want to show actuals. Need to fall back to calling Xero `pl-summary` directly (already exists, see `/api/Xero/pl-summary`) and skip plan/forecast columns. ~Half a day of work.
5. **Multi-year FY switching with the new dashboard.** `FYSelectorTabs` triggers a `loadInitialData()` re-fetch. New dashboard inherits this — but if the user is FY27 (future, no actuals), KPI strip should hide YTD-vs-plan and only show plan + sparkline of FY26 actuals. Worth a UX decision in 58.2.

---

## Effort estimate

CONTEXT phasing (4-5 days total) feels right; my read:

| Phase | CONTEXT estimate | My read | Notes |
|---|---|---|---|
| 58.1 (foundation: replace landing, KPI strip + trajectory + monthly trend) | 1-2 days | **1.5 days** | Mostly presentation. Trajectory chart reuses `/api/forecast/dashboard-actuals`. KPI strip is client-side derivation. Monthly trend table is a re-skinned `PLForecastTable` slice. Tab integration is 30 min. |
| 58.2 (KPI scorecard + insights + variance coloring + mobile) | 1 day | **1 day** | Insights = 8 pure functions over already-loaded data. Scorecard is 4 more derived metrics. Mobile sticky-first-column on the table is the only risk — ~2 hr. |
| 58.3 (cash + empty state) | 1 day | **0.75 day** | Extend balance-sheet endpoint (~30 LoC) + add fallback Xero-only empty state (~80 LoC). |
| 58.4 (JDS QA + cutover) | 1 day | **0.5-1 day** | Reconciliation against current page values. JDS has well-known data — straightforward verification with `verify-production-migration.ts` precedent. |

**Total: 3.75-4 days realistic.** CONTEXT's 4-5 days has good buffer.

**Biggest risk to schedule:** category label normalization (Risk #2) — if JDS reveals new variant strings beyond the hardcoded sets in `dashboard-actuals/route.ts`, KPI/trajectory numbers won't reconcile to current page and Phase 58.4 stretches.

---

## Sources

- `src/app/finances/forecast/page.tsx:194-289` (loadInitialData)
- `src/app/finances/forecast/components/ForecastKPISummary.tsx:24-78`
- `src/app/finances/forecast/components/ForecastMultiYearSummary.tsx:33-154`
- `src/app/finances/forecast/components/PLForecastTable.tsx:28-80`
- `src/app/finances/forecast/components/ForecastTabs.tsx:5-43`
- `src/app/finances/forecast/services/forecast-service.ts:180-260` (loadPLLines, plLines lifecycle)
- `src/app/finances/forecast/types.ts:71-91` (PLLine shape)
- `src/app/api/Xero/balance-sheet/route.ts:78-260`
- `src/app/api/forecast/dashboard-actuals/route.ts:21-60`
- `src/app/api/forecast/[id]/recompute/route.ts` (materialization path)
- `src/app/api/Xero/pl-summary/route.ts:1-60` (no-forecast fallback option)
- Prototype: `.claude/worktrees/agent-a3748e9f/src/app/preview/forecast-v2/page.tsx`
