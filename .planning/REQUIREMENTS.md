# WisdomBI — Requirements

## Milestone 1: Stabilise & Fix (Immediate)

### R1.1 Fix OpEx double-counting of team costs [CRITICAL]
- When Xero P&L includes "Wages and Salaries" in OpEx, these are double-counted (once in Team Costs, once in OpEx)
- OpEx lines flagged by `isTeamCost()` classifier must be excluded from OpEx sum in forecast calculations
- Budget tracker, Step 5, Step 7, and Step 8 Review must all reflect correct numbers
- **Success:** CapEx shows reasonable % (not 461%), Net Profit matches manual calculation

### R1.2 Fix coach shell context preservation
- Navigating within coach view must stay inside `/coach/clients/[id]/view/` layout
- All Xero OAuth redirects must return to coach view URL
- Org selection page must link back to coach view
- **Success:** Coach never loses orange banner/sidebar during any workflow

### R1.3 Stabilise Xero connection for all businesses
- All Xero API routes must handle dual business ID system
- Connection must be findable regardless of which ID format is stored
- **Success:** Xero connect, sync, employees, subscriptions all work for any business

## Milestone 2: Forecast Builder Enhancements

### R2.1 Step 2 tabbed P&L view (Prior Year + Current Year)
- Already partially built — needs testing and polish
- Prior Year tab: full P&L by month
- Current Year tab: YTD actuals + run rate
- **Success:** Coach sees complete financial picture before forecasting

### R2.2 Step 4 team data accuracy
- Employment type mapping from Xero (full-time, part-time, casual, contractor)
- Hours per week from Xero OrdinaryHoursPerWeek
- Correct salary annualisation for casuals
- **Success:** Step 4 shows accurate team with correct costs

### R2.3 Multi-year forecast support
- FY26 remaining months + FY27 full year + FY28/29
- Current year actuals inform forecast targets
- **Success:** Coach can build 3-year forecast from current position

## Milestone 3: Platform Features

### R3.1 Coaching session management
- Fix coaching_sessions 400 error on dashboard
- Session notes, action items, follow-ups

### R3.2 Monthly reporting
- Xero data flows into monthly P&L reports
- Variance analysis vs forecast
- Coach commentary

### R3.3 KPI tracking and dashboards
- Business KPIs from Xero data
- Visual dashboards for coach and client views
- Weekly review integration

### R3.4 Quarterly review workflow
- Workshop facilitation tools
- Progress tracking against annual plan
- Strategic initiative updates

## Milestone 5: Financial Report Pack (Calxa Replacement)

### TMPL — Report Template System
- **TMPL-01**: User can save current report settings as a named template
- **TMPL-02**: User can apply a saved template to any client's monthly report in one action
- **TMPL-03**: User can set a default template per business
- **TMPL-04**: User can create, rename, and delete templates

### CMNT — AI Commentary + Trend Tables
- **CMNT-01**: AI generates narrative bullet points for each expense account that is over budget
- **CMNT-02**: User can edit AI-generated commentary text before finalising
- **CMNT-03**: Commentary section includes 6-month rolling metric trend tables (metric $ and % of revenue)

### CNTR — Contractors Payment Summary
- **CNTR-01**: Report shows individual contractor payments with 4-month rolling history
- **CNTR-02**: Contractors are grouped by department/category with subtotals
- **CNTR-03**: Each row shows Budget | Month-3 | Month-2 | Month-1 | Current | Variance
- **CNTR-04**: Contractors section is enabled/disabled per template

### PRYR — Prior Year Chart Series
- **PRYR-01**: Income, COGS, and Expense bar charts show 3 series: Actuals, Budget, Prior Year Actuals
- **PRYR-02**: Prior year data sourced from xero_pl_lines for the previous fiscal year

### BLSH — Balance Sheet
- **BLSH-01**: Balance sheet tab shows Assets, Liabilities, Equity with Current Month / Prior Year / Var$ / Var%
- **BLSH-02**: Balance sheet data fetched from Xero /Reports/BalanceSheet API with prior year compare
- **BLSH-03**: Balance sheet is enabled/disabled per template

### CASH-C — Cashflow Engine Calxa Standard Rebuild (Phase 28)

**Sub-phase 28.0: Quick Wins + Tests**
- **CASH-C-01**: OpEx paid in month accrued (remove DPO delay on non-employment, non-bank-fee accounts) — Calxa Rule 7
- **CASH-C-02**: `getTimingSplit` returns splits summing to exactly 100% (fix overlap bug at day ranges >30)
- **CASH-C-03**: Depreciation and amortisation accounts excluded from cash outflows (keyword-match as interim)
- **CASH-C-04**: Engine test suite covers ≥15 core scenarios (opening balances, DSO/DPO, GST, super, PAYG, loans, stock, actuals override, depreciation exclusion)
- **CASH-C-05**: All tests pass; zero TypeScript errors

**Sub-phase 28.1: Settings Foundation**
- **CASH-C-10**: New table `cashflow_settings` stores explicit Xero account IDs per forecast
- **CASH-C-11**: New table `cashflow_account_profiles` for per-account Type 1-5 overrides
- **CASH-C-12**: New table `cashflow_statement_classification` for AASB 107 four-list classification
- **CASH-C-13**: New table `xero_accounts` caches full Chart of Accounts with type/class/status
- **CASH-C-14**: `/api/Xero/chart-of-accounts-full` endpoint fetches and caches COA
- **CASH-C-15**: `/api/forecast/cashflow/settings` GET/POST endpoint for settings
- **CASH-C-16**: `useXeroAccounts` hook provides grouped account lists (bank, fixed assets, etc.)
- **CASH-C-17**: `CashflowAccountsPanel` UI with dropdowns for all important account categories
- **CASH-C-18**: Auto-populate sensible defaults based on `xero_type` (BANK → bank list, etc.)
- **CASH-C-19**: Feature flag `use_explicit_accounts` gates new behaviour (defaults false)
- **CASH-C-20**: Engine falls back to keyword matching when `use_explicit_accounts=false`

**Sub-phase 28.2: Algorithm Completeness**
- **CASH-C-25**: Depreciation identification uses account ID when settings configured, keyword otherwise
- **CASH-C-26**: Depreciation shown as non-cash add-back above Net Movement in indirect view
- **CASH-C-27**: Company Tax module computes annual tax = net profit × rate
- **CASH-C-28**: Company Tax distributed across schedule months (quarterly PAYG instalments or annual)
- **CASH-C-29**: CapEx module pulls Fixed Asset movements from Xero balance sheet for actual months
- **CASH-C-30**: CapEx module uses `forecast_investments` for forecast months
- **CASH-C-31**: `CashflowForecastMonth` type extended with indirect-method fields (net_profit, depreciation_addback, debtor_adjustment, etc.)
- **CASH-C-32**: `CashflowForecastTable` has Direct/Indirect toggle
- **CASH-C-33**: Both methods reconcile to same Net Cash Movement
- **CASH-C-34**: Engine test suite extended with depreciation/tax/capex scenarios
- **CASH-C-35**: Direct method behaviour preserved for backwards compat

**Sub-phase 28.3: Schedule + Distribution Model**
- **CASH-C-40**: New table `cashflow_schedules` stores BasePeriods[12] arrays
- **CASH-C-41**: 6 AU-standard schedules seeded (Monthly, Feb Apr Jul Oct BAS, etc.)
- **CASH-C-42**: `daysToDistribution(days)` helper produces distribution[12] summing to 100
- **CASH-C-43**: `resolveSchedule(name)` returns BasePeriods for named schedule
- **CASH-C-44**: Settings use schedule name (not frequency string) for GST/PAYG/Super/Tax
- **CASH-C-45**: `/api/forecast/cashflow/profiles` CRUD endpoint for per-account profiles
- **CASH-C-46**: `AccountProfileEditor` UI allows coach to set Type 1-5 per account
- **CASH-C-47**: Type 1 Immediate = pays in accrual month (100% bucket 0)
- **CASH-C-48**: Type 3 CreditorDays / Type 4 DebtorDays accept float precision
- **CASH-C-49**: Type 5 Schedule uses named BasePeriods lookup
- **CASH-C-50**: Engine prefers per-account profile over global DSO/DPO when configured

**Sub-phase 28.4: Cashflow Statement (AASB 107)**
- **CASH-C-55**: Classification UI (`StatementClassificationEditor`) for four-list assignment
- **CASH-C-56**: Auto-classify heuristic based on `xero_type` (BANK→Unassigned, CURRENT/CURRLIAB→Operating, FIXED→Investing, etc.)
- **CASH-C-57**: `/api/forecast/cashflow/statement` endpoint returns AASB 107 structured statement
- **CASH-C-58**: Statement reconciles: Net change in cash = Closing cash - Opening cash (within $0.01)
- **CASH-C-59**: Operating section: Net Profit + Depreciation add-back + BS movements
- **CASH-C-60**: Investing section: Movements in Fixed Asset / Investment accounts with correct sign
- **CASH-C-61**: Financing section: Loan drawdowns (inflow), repayments (outflow), dividends (outflow)
- **CASH-C-62**: Non-Cash section: Depreciation and amortisation shown as add-backs only
- **CASH-C-63**: `CashflowStatementTab` renders AASB 107 layout on main cashflow page
- **CASH-C-64**: Warning shown if any Asset/Liability account remains `Unassigned`
- **CASH-C-65**: Engine test suite extended with statement reconciliation tests

### WDMG — "Where Did Our Money Go?"
- **WDMG-01**: Report shows P&L summary (Income / COGS / Expenses / Other Income / Surplus) for the month
- **WDMG-02**: Report classifies each balance sheet movement as a source of cash or use of cash
- **WDMG-03**: Report shows net effect on bank balance (opening + closing)

### MYOB — MYOB AccountRight Integration
- **MYOB-01**: User can connect MYOB AccountRight company file via OAuth 2.0
- **MYOB-02**: MYOB P&L actuals sync into xero_pl_lines table (source: 'myob' flag)
- **MYOB-03**: MYOB balance sheet data available for balance sheet report
- **MYOB-04**: Monthly report generation works identically for MYOB-connected businesses as Xero

### HBSF — HubStaff Integration
- **HBSF-01**: User can connect HubStaff organisation via OAuth 2.0
- **HBSF-02**: HubStaff contractor payment data enriches Contractors tab when connected
- **HBSF-03**: HubStaff data merges with Xero contractor data by name match

### CFOD — CFO Multi-Client Dashboard
- **CFOD-01**: Page at `/cfo` shows all CFO-flagged client businesses in a card grid (coach/super_admin only)
- **CFOD-02**: Each client card shows revenue vs budget %, gross profit %, net profit $, cash balance, reconciliation status, and report status
- **CFOD-03**: Status badge (On Track / Watch / Alert) computed from net profit vs budget variance and unreconciled transaction count
- **CFOD-04**: Top bar shows 4 summary stat cards: clients on track, reports pending approval, recon alerts, next report due
- **CFOD-05**: Month selector defaults to previous month; changing it reloads all cards for the selected period
- **CFOD-06**: "Review Report" button on each card navigates to that client's monthly report for the selected period
- **CFOD-07**: Dashboard data loads from DB only (xero_pl_lines + financial_metrics + cfo_report_status) — no live Xero API calls

### MLTE — Dragon Multi-Entity Consolidation
- **MLTE-01**: Consolidation groups can be defined (name + list of member Xero businesses) and stored in DB
- **MLTE-02**: Consolidated P&L shows three column groups: Entity A | Entity B | Combined for every P&L row
- **MLTE-03**: Account alignment is by account_type (revenue / cogs / opex) — not by account name; absent accounts show $0
- **MLTE-04**: Selecting a consolidation group from the monthly report business selector loads the consolidated view automatically
- **MLTE-05**: Template system (section toggles, column settings) applies identically to consolidated groups as to single-entity businesses

### APPR — Report Approval + Delivery Workflow
- **APPR-01**: Monthly report page shows a status pill reflecting current cfo_report_status (draft / ready_for_review / approved / sent)
- **APPR-02**: "Approve & Send" button transitions status to approved and fires a Make.com webhook with report metadata
- **APPR-03**: Successful webhook delivery sets sent_at timestamp and transitions status to sent
- **APPR-04**: Webhook failure leaves status at approved with an error toast — not silently dropped
- **APPR-05**: Make.com webhook URL is configurable per business in settings — not hardcoded

### CPRT — Client Portal
- **CPRT-01**: Clients can log in at /portal with their own credentials (separate from coach login)
- **CPRT-02**: Portal shows only reports with status approved or sent — draft and ready_for_review are hidden
- **CPRT-03**: All edit controls are hidden in portal view; no data can be modified by a portal client
- **CPRT-04**: Deep-link URL /portal/[businessSlug]?month=YYYY-MM opens that business's report for the specified period
- **CPRT-05**: Portal clients cannot access coach routes (/coach/*, /cfo, /finances/*) — middleware redirects to portal login

### EXCL — Excel Report Pack Export
- **EXCL-01**: User can export full report pack as a single multi-sheet Excel file on demand
- **EXCL-02**: Only sheets enabled in the active template are included in the export
- **EXCL-03**: Summary P&L sheet uses 9-column Calxa format with colour-coded section headers
- **EXCL-04**: Income Detail, COGS Detail, Expenses Detail each have their own sheet
- **EXCL-05**: Subscriptions, Wages/Payroll, Contractors sheets included when template enables them
- **EXCL-06**: Full Year Budget, Balance Sheet, Cashflow, Cash Movement sheets conditional on template

---

## Milestone 5: Traceability Matrix

| REQ-ID | Description | Phase |
|--------|-------------|-------|
| TMPL-01 | Save current report settings as a named template | Phase 23 |
| TMPL-02 | Apply a saved template to any client's monthly report in one action | Phase 23 |
| TMPL-03 | Set a default template per business | Phase 23 |
| TMPL-04 | Create, rename, and delete templates | Phase 23 |
| CMNT-01 | AI generates narrative bullet points for each over-budget expense account | Phase 24 |
| CMNT-02 | User can edit AI-generated commentary text before finalising | Phase 24 |
| CMNT-03 | Commentary section includes 6-month rolling metric trend tables ($ and % of revenue) | Phase 24 |
| CNTR-01 | Report shows individual contractor payments with 4-month rolling history | Phase 25 |
| CNTR-02 | Contractors grouped by department/category with subtotals | Phase 25 |
| CNTR-03 | Each row shows Budget | Month-3 | Month-2 | Month-1 | Current | Variance | Phase 25 |
| CNTR-04 | Contractors section enabled/disabled per template | Phase 25 |
| PRYR-01 | Income, COGS, and Expense bar charts show 3 series: Actuals, Budget, Prior Year Actuals | Phase 26 |
| PRYR-02 | Prior year data sourced from xero_pl_lines for the previous fiscal year | Phase 26 |
| BLSH-01 | Balance sheet tab shows Assets, Liabilities, Equity with Current Month / Prior Year / Var$ / Var% | Phase 27 |
| BLSH-02 | Balance sheet data fetched from Xero /Reports/BalanceSheet API with prior year compare | Phase 27 |
| BLSH-03 | Balance sheet enabled/disabled per template | Phase 27 |
| CASH-C-01 | OpEx paid in month accrued (Calxa Rule 7) | Phase 28.0 |
| CASH-C-02 | `getTimingSplit` returns splits summing to exactly 100% | Phase 28.0 |
| CASH-C-03 | Depreciation excluded from cash outflows (keyword-match interim) | Phase 28.0 |
| CASH-C-04 | Engine test suite covers ≥15 core scenarios | Phase 28.0 |
| CASH-C-05 | All tests pass; zero TypeScript errors | Phase 28.0 |
| CASH-C-10 | `cashflow_settings` table stores explicit Xero account IDs | Phase 28.1 |
| CASH-C-11 | `cashflow_account_profiles` table for per-account Type 1-5 overrides | Phase 28.1 |
| CASH-C-12 | `cashflow_statement_classification` table for AASB 107 classification | Phase 28.1 |
| CASH-C-13 | `xero_accounts` caches full Chart of Accounts | Phase 28.1 |
| CASH-C-14 | `/api/Xero/chart-of-accounts-full` endpoint fetches and caches COA | Phase 28.1 |
| CASH-C-15 | `/api/forecast/cashflow/settings` GET/POST endpoint | Phase 28.1 |
| CASH-C-16 | `useXeroAccounts` hook provides grouped account lists | Phase 28.1 |
| CASH-C-17 | `CashflowAccountsPanel` UI with dropdowns for each category | Phase 28.1 |
| CASH-C-18 | Auto-populate defaults based on `xero_type` | Phase 28.1 |
| CASH-C-19 | Feature flag `use_explicit_accounts` gates new behaviour | Phase 28.1 |
| CASH-C-20 | Engine falls back to keyword matching when flag off | Phase 28.1 |
| CASH-C-25 | Depreciation uses account ID when configured, keyword otherwise | Phase 28.2 |
| CASH-C-26 | Depreciation shown as non-cash add-back in indirect view | Phase 28.2 |
| CASH-C-27 | Company Tax module: annual tax = net profit × rate | Phase 28.2 |
| CASH-C-28 | Company Tax distributed across schedule months | Phase 28.2 |
| CASH-C-29 | CapEx pulls Fixed Asset movements from Xero balance sheet | Phase 28.2 |
| CASH-C-30 | CapEx uses `forecast_investments` for forecast months | Phase 28.2 |
| CASH-C-31 | Type extended with indirect-method fields | Phase 28.2 |
| CASH-C-32 | Direct/Indirect toggle on CashflowForecastTable | Phase 28.2 |
| CASH-C-33 | Both methods reconcile to same Net Cash Movement | Phase 28.2 |
| CASH-C-34 | Engine tests cover depreciation/tax/capex | Phase 28.2 |
| CASH-C-35 | Direct method behaviour preserved (backwards compat) | Phase 28.2 |
| CASH-C-40 | `cashflow_schedules` table with BasePeriods[12] | Phase 28.3 |
| CASH-C-41 | 6 AU-standard schedules seeded | Phase 28.3 |
| CASH-C-42 | `daysToDistribution(days)` produces dist[12] summing to 100 | Phase 28.3 |
| CASH-C-43 | `resolveSchedule(name)` returns BasePeriods | Phase 28.3 |
| CASH-C-44 | Settings use schedule name (not frequency string) | Phase 28.3 |
| CASH-C-45 | `/api/forecast/cashflow/profiles` CRUD endpoint | Phase 28.3 |
| CASH-C-46 | `AccountProfileEditor` Type 1-5 UI | Phase 28.3 |
| CASH-C-47 | Type 1 Immediate pays in accrual month | Phase 28.3 |
| CASH-C-48 | Type 3/4 accept float-precision days | Phase 28.3 |
| CASH-C-49 | Type 5 uses named BasePeriods lookup | Phase 28.3 |
| CASH-C-50 | Engine prefers profile over global DSO/DPO | Phase 28.3 |
| CASH-C-55 | `StatementClassificationEditor` for four-list UI | Phase 28.4 |
| CASH-C-56 | Auto-classify heuristic based on `xero_type` | Phase 28.4 |
| CASH-C-57 | `/api/forecast/cashflow/statement` endpoint | Phase 28.4 |
| CASH-C-58 | Statement reconciles to bank balance change | Phase 28.4 |
| CASH-C-59 | Operating section: Net Profit + add-backs + BS movements | Phase 28.4 |
| CASH-C-60 | Investing section: Fixed Asset movements with correct sign | Phase 28.4 |
| CASH-C-61 | Financing section: Loans and equity movements | Phase 28.4 |
| CASH-C-62 | Non-Cash section: Depreciation/amortisation add-backs | Phase 28.4 |
| CASH-C-63 | `CashflowStatementTab` renders AASB 107 layout | Phase 28.4 |
| CASH-C-64 | Warning if any account is Unassigned | Phase 28.4 |
| CASH-C-65 | Statement reconciliation tests pass | Phase 28.4 |
| WDMG-01 | Report shows P&L summary (Income / COGS / Expenses / Other Income / Surplus) for the month | Phase 29 |
| WDMG-02 | Report classifies each balance sheet movement as a source or use of cash | Phase 29 |
| WDMG-03 | Report shows net effect on bank balance (opening + closing) | Phase 29 |
| MYOB-01 | User can connect MYOB AccountRight company file via OAuth 2.0 | Phase 30 |
| MYOB-02 | MYOB P&L actuals sync into xero_pl_lines table (source: 'myob' flag) | Phase 30 |
| MYOB-03 | MYOB balance sheet data available for balance sheet report | Phase 30 |
| MYOB-04 | Monthly report generation works identically for MYOB-connected businesses as Xero | Phase 30 |
| HBSF-01 | User can connect HubStaff organisation via OAuth 2.0 | Phase 31 |
| HBSF-02 | HubStaff contractor payment data enriches Contractors tab when connected | Phase 31 |
| HBSF-03 | HubStaff data merges with Xero contractor data by name match | Phase 31 |
| EXCL-01 | User can export full report pack as a single multi-sheet Excel file on demand | Phase 32 |
| EXCL-02 | Only sheets enabled in the active template are included in the export | Phase 32 |
| EXCL-03 | Summary P&L sheet uses 9-column Calxa format with colour-coded section headers | Phase 32 |
| EXCL-04 | Income Detail, COGS Detail, Expenses Detail each have their own sheet | Phase 32 |
| EXCL-05 | Subscriptions, Wages/Payroll, Contractors sheets included when template enables them | Phase 32 |
| EXCL-06 | Full Year Budget, Balance Sheet, Cashflow, Cash Movement sheets conditional on template | Phase 32 |
| CFOD-01 | Page at /cfo shows all CFO-flagged clients in a card grid (coach/super_admin only) | Phase 33 |
| CFOD-02 | Each card shows revenue vs budget %, GP%, net profit $, cash balance, recon status, report status | Phase 33 |
| CFOD-03 | Status badge (On Track / Watch / Alert) computed from NP vs budget variance and recon count | Phase 33 |
| CFOD-04 | Top bar: 4 stat cards — on track, pending approval, recon alerts, next report due | Phase 33 |
| CFOD-05 | Month selector defaults to previous month; changes reload all client cards | Phase 33 |
| CFOD-06 | "Review Report" button navigates to that client's monthly report for the selected period | Phase 33 |
| CFOD-07 | Dashboard reads from DB only — no live Xero API calls | Phase 33 |
| MLTE-01 | Consolidation groups defined (name + member businesses) stored in DB | Phase 34 |
| MLTE-02 | Consolidated P&L shows Entity A / Entity B / Combined column groups | Phase 34 |
| MLTE-03 | Account alignment by account_type; absent accounts show $0 | Phase 34 |
| MLTE-04 | Selecting a consolidation group loads consolidated view automatically | Phase 34 |
| MLTE-05 | Template system applies identically to consolidated groups as to single businesses | Phase 34 |
| APPR-01 | Monthly report page shows status pill (draft / ready_for_review / approved / sent) | Phase 35 |
| APPR-02 | "Approve & Send" fires Make.com webhook with report metadata | Phase 35 |
| APPR-03 | Successful webhook sets sent_at and transitions status to sent | Phase 35 |
| APPR-04 | Webhook failure leaves status at approved with error toast | Phase 35 |
| APPR-05 | Make.com webhook URL configurable per business in settings | Phase 35 |
| CPRT-01 | Clients log in at /portal with own credentials, separate from coach login | Phase 36 |
| CPRT-02 | Portal shows only approved/sent reports — draft and ready_for_review hidden | Phase 36 |
| CPRT-03 | All edit controls hidden in portal view; no data modifications possible | Phase 36 |
| CPRT-04 | Deep-link /portal/[slug]?month=YYYY-MM opens that business's report | Phase 36 |
| CPRT-05 | Portal clients cannot access coach routes — middleware redirects to portal login | Phase 36 |
