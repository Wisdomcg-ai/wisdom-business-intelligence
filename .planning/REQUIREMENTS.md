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

### DRCF — Direct Method Cashflow Engine
- **DRCF-01**: Direct method engine converts P&L to cash (income ÷ 1.1 GST, expense ÷ 1.1 where applicable)
- **DRCF-02**: GST (BAS quarterly), PAYG (monthly), Super (quarterly) shown as separate liability rows
- **DRCF-03**: CapEx from forecast_investments shown as asset movement row
- **DRCF-04**: 12-month rolling bank balance shown (Bank at Beginning → movements → Bank at End)
- **DRCF-05**: User can toggle between direct method and existing indirect (DSO/DPO) method

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
| DRCF-01 | Direct method engine converts P&L to cash (income ÷ 1.1 GST, expense ÷ 1.1 where applicable) | Phase 28 |
| DRCF-02 | GST (BAS quarterly), PAYG (monthly), Super (quarterly) shown as separate liability rows | Phase 28 |
| DRCF-03 | CapEx from forecast_investments shown as asset movement row | Phase 28 |
| DRCF-04 | 12-month rolling bank balance shown (Bank at Beginning → movements → Bank at End) | Phase 28 |
| DRCF-05 | User can toggle between direct method and existing indirect (DSO/DPO) method | Phase 28 |
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
