# WisdomBI — Roadmap

## Milestone 1: Stabilise & Fix [COMPLETE]

### Phase 1: Fix OpEx double-counting [COMPLETE]
**Goal:** Correct the forecast P&L calculations so budget tracker shows accurate numbers
- [x] OpEx team cost toggle (user-controlled override + auto-detection fallback)
- [x] Fixed P&L calculations in useForecastWizard + BudgetTracker
- [x] Security fix: business access validation on 5 Xero API routes

### Phase 2: Coach shell stability
**Goal:** Coach never loses context during any workflow
**Status:** Planned
- Audit hardcoded URLs
- Org selection navigation
- End-to-end coach workflow test

### Phase 3: Xero connection reliability
**Goal:** All Xero features work for any business regardless of ID format
**Status:** Planned
- Multi-format ID lookup on remaining routes
- Clean up diagnostic code

---

## Milestone 2: Forecast Wizard Improvements [IN PROGRESS]

### Phase 4: Step 1 — Industry-Aware Defaults [COMPLETE]
- [x] 15 AU SME industry benchmarks (GP% and NP% ranges)
- [x] Subtle hint below % inputs ("Typical for Hospitality: 60-70%")
- [x] Industry-aware placeholder values

### Phase 5: Step 3 — Revenue & COGS Simplification [COMPLETE]
- [x] Revenue mix % as primary input (Prior Year | % of Total | Forecast | vs Prior)
- [x] COGS mix % matching revenue layout (% of COGS column)
- [x] Unified P&L table — Revenue + COGS in one aligned table
- [x] Single [Summary | Monthly Detail] toggle affecting both sections
- [x] GP% target comparison (green if met, amber if below)
- [x] Monthly detail with editable cells for both Revenue AND COGS
- [x] % Split column visible in both Summary and Monthly views
- [x] Y2/Y3 stored as monthly data (not quarterly) for monthly report integration
- [x] Seasonal distribution explanation note
- [x] Month key remapping (prior year → forecast year)

### Phase 6: Step 5 — OpEx Team Cost Toggle [COMPLETE]
- [x] isTeamCostOverride field on OpExLine
- [x] Toggle button per row (auto-detect + user override)
- [x] Simplified filtering with single pre-filtered array

### Phase 7: Step 7 — Planned Spending with Loan/Lease Calculator [COMPLETE]
- [x] Unified PlannedSpend model (replaces CapExItem + Investment)
- [x] Spend types: Asset (with depreciation) | One-off | Monthly
- [x] Payment methods: Outright | Finance | Lease
- [x] Inline finance calculator (term, rate → monthly payment, total interest)
- [x] Inline lease calculator (term, monthly → total cost)
- [x] Strategic initiative suggestion chips from annual plan
- [x] Compact budget bar (Cash | P&L Impact | Monthly)
- [x] Backward compat: auto-converts legacy CapEx + Investments

### Phase 8: Step 8 — Growth Plan UX [COMPLETE]
- [x] GP% and NP% on separate sub-rows (clean alignment)
- [x] Growth % to the right of its year (reads naturally: "FY27: $12M, +19% vs FY26")
- [x] Key assumptions summary at top

### Phase 9: Step 9 — Review Enhancements [COMPLETE]
- [x] Goals vs Forecast callout (GP% and NP% target vs actual)
- [x] 2 new what-if scenarios (Cut OpEx 10%, Increase Prices 5%)
- [x] Combined impact display when multiple scenarios active
- [x] Excel export (6 tabs: Assumptions, FY26/27/28 monthly P&L, Team, Subscriptions)

### Phase 10: Step 6 — Subscriptions [COMPLETE]
- [x] Restore saved budgets when Step 6 loads (was only loading on error fallback)

### Phase 11: Forecast Page Flow [COMPLETE]
- [x] Skip welcome screen — go straight to forecast selector

### Phase 12: Remaining Wizard Items [COMPLETE]
- [x] COGS Y2/Y3 trend selector per line (Same / Improves / Increases)
- [x] Cashflow tool integration — PlannedSpend feeds cashflow engine (outright/finance/lease monthly commitments)
- [x] Change tracking — "Modified since last review" badge + "Mark as reviewed" button
- [x] Step 4 Team — Collapsible detail columns (show/hide rate, hours, bonus, commission)

### Phase 12b: AI Enhancements [COMPLETE]
**Goal:** Better use of existing AI infrastructure (endpoints already working)
- [x] G1: Step 2 — Real AI insights replacing placeholder generator (Claude Haiku via /api/ai/forecast-insights)
- [x] G2: Step 9 — AI narrative summary at top of Review (replaces templated verdict, falls back gracefully)
- [x] G3: What-If — AI-suggested scenario based on forecast data (purple "AI" badge, data-driven)

---

## Decisions Made

| Decision | Outcome | Rationale |
|----------|---------|-----------|
| PDF export | No — Excel only | Coaches customise output; Excel is universal |
| Payroll tax / workers comp | Not included | Accounting detail, not strategic numbers |
| Revenue model templates | Not included | Adds complexity; growth % + mix % is sufficient |
| Client forecast access | Both can edit | Collaborative tool; coach reviews changes at next session |
| Multi-scenario save/compare | Future | One forecast at a time for now |

---

## Milestone 3: Annual Planning Cycle & Forecast Rollover

### Phase 13: Year Type Foundation [COMPLETE]
**Goal:** Support both FY (Jul-Jun) and CY (Jan-Dec) businesses
- [x] Central utility module (src/lib/utils/fiscal-year-utils.ts) — all date-boundary logic parameterized by yearStartMonth
- [x] DB migration: fiscal_year_start on business_profiles, fiscal_year on strategic_initiatives
- [x] Refactored generateMonthKeys(), getForecastFiscalYear(), calculateForecastPeriods() to use central utility
- [x] Updated 15+ wizard components (Step2, Step4, Step5, Step8, BudgetTracker, useForecastWizard, parsePLFile, opex-classifier)
- [x] Updated non-forecast files (dashboard, quarterly review, monthly report, live forecast hooks)
- [x] Quarter logic via getQuarterDefs() / getQuarterForMonth() — fully configurable

### Phase 14: Goals Wizard — First-Time Extended Period
**Goal:** New clients within 3 months of year end get 13-15 month first plan
**Plans:** 1/3 plans executed

Plans:
- [x] 14-01-PLAN.md — Foundation: DB migration, fiscal year proximity helpers, type + service updates
- [ ] 14-02-PLAN.md — Data wiring: API extensions, hook detection logic, Step 1 Year labels
- [ ] 14-03-PLAN.md — UI: Step 4 Current Year Remainder bucket, Step 5 sprint year-boundary bridging

- [ ] Detect proximity to year end (within 3 months)
- [ ] Extended Year 1: remainder of current year + full next year (13-15 months)
- [ ] Year 2 + Year 3: standard 12 months each (always 3 years out)
- [ ] Initiative distribution: "Remaining current year" bucket + Q1-Q4 next year
- [ ] Sprint planning starts "next 90 days" (may bridge year boundary)
- [ ] Forecast wizard reads extended period targets

### Phase 15: Q4 Annual Review — Abridged Goals Wizard
**Goal:** Returning clients set next year goals inside the Q4 annual review
- [ ] Roll 3-year targets forward: Year 2→Year 1, Year 3→Year 2, set new Year 3
- [ ] Carry forward incomplete initiatives (show completion status, coach decides carry/drop)
- [ ] New ideas from refreshed SWOT (already done in Q4 review step 3.2)
- [ ] Prioritise combined list (carried + new) → distribute across Q1-Q4
- [ ] Q1 sprint rocks for the new year
- [ ] On completion: auto-sync to business_financial_goals + strategic_initiatives for next FY
- [ ] Add status field to strategic_initiatives (planned/in_progress/complete/deferred)
- [ ] Goals Wizard detects existing next-year data: "Already planned in Q4 review"

### Phase 16: Forecast Rollover & Rolling Periods
**Goal:** Coaches can build next year's forecast during planning season
- [ ] Planning season detection (within 3 months of year end, based on business year type)
- [ ] FY selector: show both current year + next year tabs
- [ ] "Plan next year" creates forecast pre-populated from Q4 review targets
- [ ] Prior year = completed forecast actuals (not just Xero P&L)
- [ ] 13-15 month rolling view: remaining current FY + full next FY
- [ ] Flexible month ranges (forecastStartMonth/endMonth instead of duration 1/2/3)
- [ ] Lock completed fiscal year as read-only

### Phase 17: Quarterly Review ↔ Forecast Integration
**Goal:** Quarterly reviews reference forecast data for variance analysis
- [ ] Q review shows: "Q3 forecast: $2.8M | Actual: $2.6M | Variance: -7%"
- [ ] Confidence adjustment can optionally update remaining forecast months
- [ ] Forecast wizard reads quarterly-adjusted targets
- [ ] One Page Plan shows current AND next year views

---

## Milestone 4: Platform Features

### Phase 18: Cashflow Integration
**Goal:** Planned spending data feeds the cashflow tool
**Depends on:** Phase 7 (PlannedSpend model — COMPLETE)
- [ ] Cashflow engine reads PlannedSpend items from forecast assumptions
- [ ] Outright purchases: cash out in purchase month
- [ ] Financed items: monthly repayment × term starting from purchase month
- [ ] Leased items: monthly payment × term starting from purchase month
- [ ] Display committed monthly outflows alongside operational cash flow

### Phase 19: Monthly Reporting
**Goal:** Xero data flows into monthly P&L reports with forecast comparison
**Depends on:** Phase 5 (Y2/Y3 monthly storage — COMPLETE)
- [ ] Monthly P&L reads forecast monthly data (from wizard Year 1 monthly storage)
- [ ] Actual vs Forecast variance by line item
- [ ] Coach commentary per month
- [ ] Branded monthly report output

### Phase 20: Coaching Sessions
**Goal:** Fix coaching_sessions 400 error, build session management
- [ ] Fix coaching_sessions endpoint
- [ ] Session notes, action items, follow-ups
- [ ] Link sessions to quarterly rocks

### Phase 21: KPI Dashboards
**Goal:** Business KPIs from Xero data with visual dashboards
- [ ] KPI tracking from Xero actuals
- [ ] Visual dashboards for coach and client views
- [ ] Weekly review integration

### Phase 22: Quarterly Review Completion
**Goal:** Workshop facilitation tools fully working
**Depends on:** Phase 15 (initiative status field)
- [ ] Progress tracking against annual plan
- [ ] Strategic initiative status updates
- [ ] Completion tracking linked to initiative status field (from Phase 15)
