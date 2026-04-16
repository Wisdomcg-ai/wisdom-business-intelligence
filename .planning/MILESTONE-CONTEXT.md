# Milestone Context — Financial Report Pack (Calxa Replacement)

## Milestone Name
Milestone 5: Financial Report Pack

## Goal
Replace Calxa (a third-party financial reporting tool) with a native monthly finance report pack generator built into the platform. Each client gets a customised report built from selectable template sections. Deliver Excel export on demand.

## Background
The platform currently uses Calxa to generate monthly financial reports for clients. Calxa is a separate tool with separate login, licensing costs, and no white-labelling. The goal is to replicate all Calxa report functionality natively so clients never need Calxa again.

A sample Calxa report (Urban Road Pty Ltd, January 2026) was reviewed. It is a 24-page monthly finance pack.

## Key Decisions Already Made

| Decision | Outcome | Rationale |
|----------|---------|-----------|
| Budget source | From forecast module (forecast_pl_lines) | Already built; avoids dual-entry |
| Export format | Excel only (on-demand) | Coaches customise; Excel is universal |
| Commentary | AI draft (Claude) + manual edit | Best of both: speed + personalisation |
| Templates | Per-client named template presets | Calxa-style — pick sections per client |
| Cashflow method | Direct method | Requested; parallel to existing indirect engine |
| Accounting sources | Xero (primary) + MYOB (new API backend) | MYOB is currently UI-only fallback |
| Contractor data | Xero + HubStaff (new integration) | Some clients use HubStaff for contractor tracking |
| Multi-business | Yes — each with own account mappings | Platform is multi-tenant |

## What Already Exists (Validated — No Work Needed)

- `account_mappings` table — persisted to DB, full CRUD API
- `BudgetVsActualTable.tsx` — full 9-column Calxa format (Budget / Actual / Var$ / Var% / YTD Budget / YTD Actual / YTD Var$ / YTD Var% / Unspent Budget / Next Month / Annual Total / Prior Year)
- `SubscriptionAnalysisTab.tsx` — Last Month | Budget | Actual | Variance (matches Calxa IT Costs format)
- `WagesAnalysisTab.tsx` — employee × pay-date weekly grid (matches Calxa payroll format)
- `FullYearProjectionTable.tsx` — 12 months + Projected + Budget + Var (matches Calxa full-year budget view)
- Commentary system — vendor drill-down, transaction data from Xero, manual coach notes
- Cashflow tab — DSO/DPO indirect engine wired with table + chart
- PDF layout editor — drag-and-drop widget system
- Report settings + column toggles
- All section flags already defined in ReportSections type (balance_sheet, cashflow, payroll, subscriptions)

## What Needs Building (11 Items)

### 1. Report Template System (Phase 23)
Named, saveable report templates per client. Currently settings are per-business but can't be saved as a named template and applied across clients.
- New DB table: `report_templates` (id, business_id, name, is_default, sections jsonb, column_settings jsonb, budget_forecast_id)
- New API: `/api/monthly-report/templates/` CRUD
- New UI: TemplatePicker, TemplateSaveModal
- Modify: ReportSettingsPanel, types.ts

### 2. AI Commentary Draft + Trend Tables (Phase 24)
Commentary route already fetches vendor transaction data but leaves coach_note empty (no AI generation). Calxa also shows 6-month rolling metric tables (e.g. Freight as % of Revenue, Bank Merchant Fees as % of Revenue).
- New API: `/api/monthly-report/commentary/generate-ai/` — sends vendor summaries to Claude, returns narrative bullet points
- New UI: TrendTable (6-month rolling table), CommentaryAIDraftButton
- Modify: BudgetVsActualTable (add generate button), page.tsx

### 3. Contractors Payment Summary (Phase 25)
No equivalent exists. Individual contractor/freelancer payments with 4-month rolling history.
- New API: `/api/monthly-report/contractors/` — pulls from Xero contacts with bill payments grouped by contractor name and department
- New UI: ContractorsTab — Name | Category | Budget | Month-3 | Month-2 | Month-1 | Current | Variance
- Modify: types.ts, MonthlyReportTabs, ReportSettingsPanel, page.tsx

### 4. Prior Year Bar Chart Series (Phase 26)
TrendCharts has Actual + Budget but no Prior Year. Calxa shows 3 bars per month.
- Modify: `/api/monthly-report/full-year/` — add prior year data from xero_pl_lines for previous fiscal year
- Modify: types.ts (add prior_year_actual to TrendDataPoint), TrendCharts.tsx (add 3rd bar series)

### 5. Balance Sheet (Phase 27)
balance_sheet boolean toggle exists in settings but no implementation at all.
- New API: `/api/Xero/balance-sheet/` — Xero /Reports/BalanceSheet with prior year compare
- New UI: BalanceSheetTab — Assets | Liabilities | Equity with Current / Prior Year / Variance$ / Variance%
- New hook: useBalanceSheet
- Modify: MonthlyReportTabs, page.tsx

### 6. Direct Method Cashflow Engine (Phase 28)
Engine uses DSO/DPO indirect. Need parallel direct engine (existing engine preserved).
- New: `src/lib/cashflow/direct-engine.ts` — income cash = revenue ÷ 1.1, expense cash = expense ÷ 1.1, GST/PAYG/Super as separate liability rows, CapEx as asset row, rolling bank balance
- New UI: CashflowDirectTab
- Modify: CashflowTab (method toggle), page.tsx

### 7. "Where Did Our Money Go?" (Phase 29)
No equivalent exists. Requires Phase 5 (Balance Sheet).
- New API: `/api/monthly-report/cash-movement/` — compares prior vs current month balance sheet, classifies as sources/uses
- New UI: CashMovementTab — P&L Summary | Sources | Uses | Bank Effect
- Modify: MonthlyReportTabs, types.ts, page.tsx

### 8. MYOB OAuth + API Backend (Phase 30)
MYOB currently shows a CSV export instruction in a dropdown. No OAuth, no token management, no sync.
- New DB table: `myob_connections`
- New API: `/api/myob/` — auth, callback, status, sync, pl-summary, balance-sheet
- New lib: `src/lib/myob/token-manager.ts`
- New UI: `/app/settings/myob/` connection page
- Modify: generate route (detect source), XeroConnectionBanner

### 9. HubStaff OAuth + API (Phase 31)
No HubStaff integration exists. Used by some clients for contractor time/payments.
- New DB table: `hubstaff_connections`
- New API: `/api/hubstaff/` — auth, callback, status, contractors
- New lib: `src/lib/hubstaff/token-manager.ts`
- New UI: `/app/settings/hubstaff/` connection page
- Modify: contractors route (Phase 25) — add HubStaff as secondary source

### 10. Excel Report Pack (Phase 32)
Monthly report has no Excel export. Forecast module has ExcelJS but not monthly report.
- New API: `/api/monthly-report/export-excel/`
- New lib: `src/lib/exports/monthly-report-pack.ts` — ExcelJS multi-sheet builder
- Sheets (conditional on template): Summary P&L, Income Detail, COGS Detail, Expenses Detail, IT/Subscriptions, Wages/Payroll, Contractors, Full Year Budget, Commentary, Balance Sheet, Cashflow, Cash Movement
- Modify: page.tsx (add Export Excel button)

## Tech Stack Notes
- Framework: Next.js 14 (App Router)
- DB: Supabase (PostgreSQL)
- Accounting: Xero (xero-node) + MYOB AccountRight Live API (new)
- Contractor tracking: HubStaff API v2 (new)
- Excel export: ExcelJS 4.4.0 (already installed)
- AI: Anthropic SDK / Claude (already installed)
- Charts: Recharts 3.5.0 (already installed)

## Accounting Integration Details
- MYOB AccountRight Live API — OAuth 2.0, REST, company files
- HubStaff API v2 — OAuth 2.0, organizations/members/pay-rates/time-activities
- Both sync into same `xero_pl_lines` table (flagged by source column)

## Australian Compliance Context
- GST: 10% on most income/expenses, exempt on wages/super/bank interest/insurance
- BAS: Quarterly (Feb, Apr, Jul, Oct payment months for AU quarters)
- Super: Quarterly payments (Jan, Apr, Jul, Oct)
- PAYG: Monthly withholding
- FY: Jul–Jun (configurable via fiscal_year_start on business_profiles)
