# Phase 58 — Forecast page overhaul (client-centric dashboard)

## Goal
Replace `/finances/forecast` landing page with Fathom/Pry/Mercury-grade client dashboard.
Prototype: `src/app/preview/forecast-v2/page.tsx` (PR #148, branch `preview/forecast-page-medium`).

## Locked decisions
1. **Replace** existing landing view (Overview becomes default tab); keep P&L/Assumptions/Versions accessible
2. **Heuristic** insights for MVP (no AI)
3. **Pull cash from Xero** balance sheet
4. **Reuse FYSelectorTabs** for FY switching
5. **No-forecast empty state**: CTA to wizard + Xero YTD numbers if available

## Research findings (key)
- `forecast_pl_lines` already merges Xero actuals + forecast — no new aggregation needed
- `/api/forecast/dashboard-actuals` returns Revenue/GP/NP monthly arrays — reuse for trajectory chart
- `/api/Xero/balance-sheet` exists — extend with `?cash_only=true` filter (~30 LoC)
- Tabs strategy: 4 tabs (`overview | pl | assumptions | versions`), default to overview
- 8 heuristic insight rules specified

## 6 sections (from prototype)
1. KPI strip (Revenue/GP/NP/Cash)
2. Trajectory chart (metric toggle)
3. Monthly trend P&L table
4. KPI scorecard
5. Smart insights (heuristic)
6. Footer drill-down

## Phasing
- 58.1 (1-2d): Foundation — replace landing, wire KPI strip + trajectory + monthly table to forecast_pl_lines
- 58.2 (1d): Polish — scorecard, heuristic insights, variance coloring
- 58.3 (1d): Cash from Xero balance sheet, no-forecast empty state
- 58.4 (1d): JDS QA + cutover

## Acceptance
1. JDS forecast loads with new dashboard, numbers reconcile to current page
2. KPI strip shows current-month + YTD + forecast + plan
3. Trajectory chart toggles Revenue/GP/NP
4. Monthly trend table: 12 cols, forecast cols visually distinct, variance coloring
5. Cash from Xero or "—" fallback
6. Empty state CTA opens wizard
7. P&L/Assumptions/Versions tabs remain accessible
8. Insights fire on >5% variance
9. Mobile responsive
10. No regression on Phase 57 wizard
