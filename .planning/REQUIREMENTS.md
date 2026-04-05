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
