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

### Phase 14: Goals Wizard — First-Time Extended Period [COMPLETE]
**Goal:** New clients within 3 months of year end get 13-15 month first plan
**Plans:** 3/3 plans shipped

Plans:
- [x] 14-01-PLAN.md — Foundation: DB migration, fiscal year proximity helpers, type + service updates
- [x] 14-02-PLAN.md — Data wiring: API extensions, hook detection logic, Step 1 Year labels
- [x] 14-03-PLAN.md — UI: Step 4 Current Year Remainder bucket, Step 5 sprint year-boundary bridging

- [ ] Detect proximity to year end (within 3 months)
- [ ] Extended Year 1: remainder of current year + full next year (13-15 months)
- [ ] Year 2 + Year 3: standard 12 months each (always 3 years out)
- [ ] Initiative distribution: "Remaining current year" bucket + Q1-Q4 next year
- [ ] Sprint planning starts "next 90 days" (may bridge year boundary)
- [ ] Forecast wizard reads extended period targets

### Phase 15: Q4 Annual Review — Abridged Goals Wizard [COMPLETE]
**Goal:** Returning clients set next year goals inside the Q4 annual review
**Plans:** 3/3 plans shipped

Plans:
- [x] 15-01-PLAN.md — Type foundation: extend InitiativeStatus, source types, StepType
- [x] 15-02-PLAN.md — Sync service: syncAnnualReview method + completeWorkshop wiring
- [x] 15-03-PLAN.md — Goals Wizard detection banner + carry-forward fiscal_year filter (verified at src/app/goals/page.tsx:948)

- [ ] Roll 3-year targets forward: Year 2->Year 1, Year 3->Year 2, set new Year 3
- [ ] Carry forward incomplete initiatives (show completion status, coach decides carry/drop)
- [ ] New ideas from refreshed SWOT (already done in Q4 review step 3.2)
- [ ] Prioritise combined list (carried + new) -> distribute across Q1-Q4
- [ ] Q1 sprint rocks for the new year
- [ ] On completion: auto-sync to business_financial_goals + strategic_initiatives for next FY
- [ ] Add status field to strategic_initiatives (planned/in_progress/complete/deferred)
- [ ] Goals Wizard detects existing next-year data: "Already planned in Q4 review"

### Phase 16: Forecast Rollover & Rolling Periods [COMPLETE]
**Goal:** Coaches can build next year's forecast during planning season
**Plans:** 3/3 plans shipped

Plans:
- [x] 16-01-PLAN.md — Foundation: FY filter fix on getOrCreateForecast, planning-season getForecastFiscalYear, lock enforcement in selector + wizard
- [x] 16-02-PLAN.md — FY selector tabs + planning season banner on forecast page
- [x] 16-03-PLAN.md — Prior year from forecast actuals API + wizard wiring + lock button

- [ ] Planning season detection (within 3 months of year end, based on business year type)
- [ ] FY selector: show both current year + next year tabs
- [ ] "Plan next year" creates forecast pre-populated from Q4 review targets
- [ ] Prior year = completed forecast actuals (not just Xero P&L)
- [ ] 13-15 month rolling view: remaining current FY + full next FY
- [ ] Flexible month ranges (forecastStartMonth/endMonth instead of duration 1/2/3)
- [ ] Lock completed fiscal year as read-only

### Phase 17: Quarterly Review <-> Forecast Integration
**Goal:** Quarterly reviews reference forecast data for variance analysis
**Plans:** 2/3 plans shipped — 17-02 variance panel needs restoration (was shipped in e23a888, removed during Phase 22-02 refactor in e97019f; adjust-forward API endpoint still live)

Plans:
- [x] 17-01-PLAN.md — Quarter aggregation helpers + quarterly-summary API endpoint
- [ ] 17-02-PLAN.md — Variance panel in ConfidenceRealignmentStep + adjust-forward write-back API (RESTORATION PENDING — cherry-pick from commit e23a888)
- [x] 17-03-PLAN.md — One Page Plan next-year financial view with year toggle

- [ ] Q review shows: "Q3 forecast: $2.8M | Actual: $2.6M | Variance: -7%"
- [ ] Confidence adjustment can optionally update remaining forecast months
- [ ] Forecast wizard reads quarterly-adjusted targets
- [ ] One Page Plan shows current AND next year views

---

## Milestone 4: Platform Features

### Phase 18: Cashflow Integration [COMPLETE — delivered in Phase 12]
**Goal:** Planned spending data feeds the cashflow tool
- [x] Cashflow engine reads PlannedSpend items (outright/finance/lease)
- [x] Outright: GST-inclusive cash out in purchase month
- [x] Finance: monthly repayment as liability line over term
- [x] Lease: monthly payment as liability line over term

### Phase 19: Monthly Reporting [COMPLETE]
**Goal:** Close commentary persistence and FY hardcoding gaps in monthly P&L reports
**Depends on:** Phase 5 (Y2/Y3 monthly storage — COMPLETE), Phase 13 (fiscal-year-utils — COMPLETE)
**Plans:** 1/1 plans shipped

Plans:
- [x] 19-01-PLAN.md — Commentary persistence + FY hardcoding fix in generate/full-year routes

- [x] Monthly P&L reads forecast monthly data (from wizard Year 1 monthly storage) — already working
- [x] Actual vs Forecast variance by line item — already working
- [x] Coach commentary per month — persistence fixed (commit a41e00f)
- [x] Branded monthly report output — already working (jsPDF with layout editor)
- [x] FY start month parameterized in generate/full-year routes (commit 94c24e2)

### Phase 20: Coaching Sessions [COMPLETE]
**Goal:** Fix coaching_sessions 400 error, reconcile session schema, add rock linkage
**Plans:** 2/2 plans shipped

Plans:
- [x] 20-01-PLAN.md — Schema migration + fix all 4 broken /api/sessions/ routes
- [x] 20-02-PLAN.md — Rock linkage UI on session action items

- [x] Fix coaching_sessions endpoint (schema migration + column reconciliation) — commit 31f6f8b
- [x] Fix session_actions API routes (wrong column names, invalid enum values, missing NOT NULL fields) — commit 5beb176
- [x] Fix analyze-transcript route (wrong FK column, missing required fields) — commit 5beb176
- [x] Link session actions to quarterly rocks (strategic_initiative_id on session_actions) — commit 3d015f2

### Phase 21: KPI Dashboards [COMPLETE]
**Goal:** Business KPIs from Xero data with visual dashboards
**Plans:** 3/3 plans shipped

Plans:
- [x] 21-01-PLAN.md — Financial chart API + Recharts panels on business dashboard
- [x] 21-02-PLAN.md — Coach KPI view at /coach/clients/[id]/kpi
- [x] 21-03-PLAN.md — Weekly review bridge + Xero sync button

- [x] KPI tracking from Xero actuals
- [x] Visual dashboards for coach and client views
- [x] Weekly review integration

### Phase 22: Quarterly Review Completion [COMPLETE]
**Goal:** Workshop facilitation tools fully working
**Depends on:** Phase 15 (initiative status field)
**Plans:** 2/2 plans shipped

Plans:
- [x] 22-01-PLAN.md — Bug fixes: status mapping (deferred/planned), decision count display, dual-ID query (commits e18de49, 92c2e88, fc02492)
- [x] 22-02-PLAN.md — Initiative progress panel in step 4.1 (commit 18ac385)

- [x] Progress tracking against annual plan
- [x] Strategic initiative status updates
- [x] Completion tracking linked to initiative status field (from Phase 15)

**Known side-effect:** Phase 22-02 refactor (commit e97019f) removed the Phase 17-02 variance panel. Restoration tracked under Phase 17-02.

---

## Milestone 5: Financial Report Pack

### Phase 23: Report Template System ✅
**Goal:** Coaches can save, apply, and manage named report templates so each client's monthly pack is reproducible in one action without re-configuring settings each time.
**Depends on:** Phase 19 (monthly reporting foundation — in progress)
**Requirements:** TMPL-01, TMPL-02, TMPL-03, TMPL-04
**UI hint:** yes
**Status:** Complete

**Delivered:**
- `supabase/migrations/20260416_report_templates.sql` — `report_templates` table with RLS
- `src/app/api/monthly-report/templates/route.ts` — GET / POST / PUT / DELETE
- `src/app/finances/monthly-report/types.ts` — `ReportTemplate`, `TemplateColumnSettings` types
- `src/app/finances/monthly-report/hooks/useReportTemplates.ts` — full CRUD hook
- `src/app/finances/monthly-report/components/TemplatePicker.tsx` — dropdown with star/delete actions
- `src/app/finances/monthly-report/components/TemplateSaveModal.tsx` — name + default checkbox modal
- `ReportSettingsPanel.tsx` — templates section at top; "Save as template" link
- `page.tsx` — wired hook, auto-applies default on load, applies on picker select

**Success Criteria:**
- Coach saves current report settings as a named template and it appears in the template picker on next load
- Applying a template to a different client's report updates all section toggles and column settings in one click
- Setting a default template means it loads automatically when the monthly report page opens for that business
- Coach renames a template and the new name is reflected everywhere it is referenced
- Deleting a template does not affect any business that had it set as default (falls back to no template)

---

### Phase 24: AI Commentary + Trend Tables
**Goal:** Coaches receive AI-drafted narrative commentary for over-budget accounts and 6-month rolling metric trend tables, reducing time-to-report from hours to minutes.
**Depends on:** Phase 19 (monthly reporting foundation — in progress), Phase 23 (templates)
**Requirements:** CMNT-01, CMNT-02, CMNT-03
**UI hint:** yes
**Plans:** TBD

**Success Criteria:**
- Clicking "Generate AI Commentary" for an over-budget account produces bullet-point narrative within 10 seconds
- Coach edits the AI text inline and the edited version is saved on report finalise
- Commentary section renders a 6-month rolling table showing each tracked metric as $ and as % of revenue
- AI commentary respects Australian business context (AUD, AU fiscal year, GST-inclusive framing)
- Report with no over-budget accounts shows no generate button rather than an empty commentary block

---

### Phase 25: Contractors Payment Summary
**Goal:** Coaches and clients can see individual contractor payments with rolling history and budget variance so contractor spend is as visible as payroll.
**Depends on:** Phase 19 (monthly reporting foundation — in progress), Phase 23 (templates)
**Requirements:** CNTR-01, CNTR-02, CNTR-03, CNTR-04
**UI hint:** yes
**Plans:** TBD

**Success Criteria:**
- Contractors tab lists each contractor with their Budget | Month-3 | Month-2 | Month-1 | Current | Variance columns populated from Xero bill payment data
- Contractors are grouped by department/category with a subtotal row per group
- A contractor with no activity in the current month shows $0 in the Current column, not a blank row
- Disabling the Contractors section in the template removes the tab entirely from the report view
- Variance column highlights red when actual spend exceeds budget by more than 10%

---

### Phase 26: Prior Year Chart Series
**Goal:** Income, COGS, and Expense trend charts show prior year actuals as a third bar series so coaches can discuss year-on-year performance without leaving the report.
**Depends on:** Phase 19 (monthly reporting foundation — in progress)
**Requirements:** PRYR-01, PRYR-02
**UI hint:** yes
**Plans:** TBD

**Success Criteria:**
- Income bar chart shows three bars per month: Actuals (current year), Budget, and Prior Year Actuals
- COGS and Expense charts show the same three-series layout
- Prior year bars are visually distinct (different colour/pattern) from current year actuals
- A month with no prior year data in xero_pl_lines renders the prior year bar as absent (not zero)
- Legend clearly labels all three series

---

### Phase 27: Balance Sheet [COMPLETE]
**Goal:** Coaches can view a full balance sheet tab inside the monthly report showing current month, prior year, and variance — matching the Calxa balance sheet format.
**Depends on:** Phase 19 (monthly reporting foundation — in progress), Phase 23 (templates)
**Requirements:** BLSH-01, BLSH-02, BLSH-03
**UI hint:** yes
**Plans:** Shipped — BalanceSheetTab component + /api/monthly-report/consolidated-bs route + useBalanceSheet hook + template gating all live. See src/app/finances/monthly-report/components/BalanceSheetTab.tsx.

**Success Criteria:**
- Balance sheet tab renders Assets, Liabilities, and Equity sections with Current Month / Prior Year / Var$ / Var% columns
- Data loads from Xero /Reports/BalanceSheet API with prior year comparison parameter
- Assets + Liabilities + Equity totals balance (i.e. Assets = Liabilities + Equity) for every loaded period
- Disabling the balance sheet in the template hides the tab with no errors thrown
- Balance sheet correctly reflects the business's fiscal year end when requesting the Xero report

---

### Phase 28: Cashflow Engine — Calxa Standard Rebuild
**Goal:** Bring the WisdomBI cashflow engine up to Calxa-equivalent accounting standards. Fix known bugs (OpEx DPO, math overlap, missing depreciation/tax/CapEx), replace keyword-based account matching with explicit Xero account IDs, and add AASB 107 compliant Cashflow Statement. Done as 5 sequential sub-phases with feature flags and fallbacks so existing clients never break.
**Depends on:** Phase 19 (monthly reporting), Phase 23 (templates), Phase 27 (balance sheet)
**Requirements:** CASH-C-01 through CASH-C-65
**UI hint:** yes
**Plans:** `.planning/phases/28-cashflow-calxa-standard/`

**Sub-phases:**
- **28.0 — Quick Wins + Test Suite** (2h) — Fix OpEx DPO + DSO/DPO math bugs + lock behaviour with tests
- **28.1 — Settings Foundation** (4-5h) — 3 new tables; Xero account-picker UI; COA sync
- **28.2 — Algorithm Completeness** (4-5h) — Depreciation, Company Tax, CapEx; indirect-method output layout
- **28.3 — Schedule + Distribution Model** (3-4h) — BasePeriods[12], distribution[12], per-account Type 1-5 profiles
- **28.4 — Cashflow Statement (Actuals)** (3-4h) — Four-list classification + AASB 107 statement view

**Safety rails:**
- Additive schema only — new tables, no changes to existing
- Feature flag per sub-phase (`use_explicit_accounts`, etc.) — keyword fallback preserved
- Test suite written in 28.0 locks current behaviour before refactor
- Atomic commits, short smoke test between sub-phases

**Success Criteria:**
- Cashflow reconciles to Xero bank balance for every actual month (continues existing behaviour)
- OpEx paid in the month it's accrued (no DPO delay) — matches Calxa Rule 7
- Depreciation correctly added back as non-cash (indirect method)
- Company tax modelled as scheduled cash outflow (quarterly PAYG instalments or annual lump sum)
- CapEx appears as cash outflow in purchase month (from balance sheet movement)
- Coach can explicitly map every Xero account (bank, AR, AP, GST, PAYG, super, depreciation, tax) via UI dropdowns
- Per-account Type 1-5 profiles override global DSO/DPO where configured
- Engine has >70% test coverage on core algorithm paths
- Zero existing clients broken during rollout

**Scope note (2026-04-17):** AASB 107 Cashflow Statement view and Phase 29
"Where Did Our Money Go?" were both removed as redundant — Xero already
produces the statement natively, and the forecast cashflow table already
breaks down monthly movements. Coaches narrate cash movements to clients
directly as part of their monthly review.

---

### Phase 30: MYOB Integration
**Goal:** Businesses using MYOB AccountRight can connect their company file and have P&L and balance sheet data flow into the report pack exactly as Xero businesses do.
**Depends on:** Phase 19 (monthly reporting foundation — in progress), Phase 27 (Balance Sheet)
**Requirements:** MYOB-01, MYOB-02, MYOB-03, MYOB-04
**UI hint:** yes
**Plans:** TBD

**Success Criteria:**
- Coach connects a MYOB AccountRight company file via OAuth 2.0 from the Settings page and connection status is confirmed in the UI
- P&L actuals from MYOB sync into xero_pl_lines with source: 'myob' and appear in the monthly report without any manual CSV import
- Balance sheet tab loads MYOB balance sheet data for an MYOB-connected business
- All report features (Commentary, Contractors, Cashflow, Excel export) function identically for MYOB-connected businesses as for Xero-connected businesses
- Disconnecting MYOB clears the token and reverts the report source banner to "No accounting source connected"

---

### Phase 31: HubStaff Integration
**Goal:** Businesses using HubStaff for contractor tracking can see HubStaff payment data merged into the Contractors tab alongside Xero data, giving a single complete view of contractor spend.
**Depends on:** Phase 25 (Contractors Payment Summary — extends it with a secondary data source)
**Requirements:** HBSF-01, HBSF-02, HBSF-03
**UI hint:** yes
**Plans:** TBD

**Success Criteria:**
- Coach connects a HubStaff organisation via OAuth 2.0 from the Settings page and connection status is confirmed
- Contractors tab shows HubStaff payment data in addition to Xero data when HubStaff is connected
- HubStaff contractors are matched to Xero contacts by name (case-insensitive) and merged into the same row; unmatched HubStaff contractors appear as additional rows
- Disconnecting HubStaff removes HubStaff-sourced rows from the Contractors tab without affecting Xero-sourced rows
- A "Source" indicator on each contractor row shows whether data came from Xero, HubStaff, or both

---

### Phase 32: Excel Report Pack Export
**Goal:** Coaches can export the complete monthly report pack as a single multi-sheet Excel file on demand, with only the sections enabled in the active template included, matching the Calxa-format layout coaches already know.
**Depends on:** Phase 23 (templates), Phase 24 (AI commentary), Phase 25 (contractors), Phase 26 (prior year charts), Phase 27 (balance sheet), Phase 28 (direct cashflow), Phase 29 (cash movement), Phase 30 (MYOB), Phase 31 (HubStaff)
**Requirements:** EXCL-01, EXCL-02, EXCL-03, EXCL-04, EXCL-05, EXCL-06
**UI hint:** yes
**Plans:** TBD

**Success Criteria:**
- "Export Excel" button on the monthly report page downloads a .xlsx file within 15 seconds for a typical report
- Only sheets corresponding to sections enabled in the active template are present in the exported file
- Summary P&L sheet uses the 9-column Calxa format with colour-coded section headers (Revenue, COGS, Gross Profit, Expenses, Net Profit)
- Income Detail, COGS Detail, and Expenses Detail sheets each contain line-item rows with Budget / Actual / Var$ / Var% / YTD columns
- Subscriptions, Wages/Payroll, and Contractors sheets are included only when those sections are enabled in the template
- Full Year Budget, Balance Sheet, Cashflow (direct method), and Cash Movement sheets are each included only when their respective template toggle is on

---

### Phase 33: CFO Multi-Client Dashboard [COMPLETE]
**Goal:** Matt can see all 5 CFO clients on a single screen at `/cfo`, with at-a-glance financial health, reconciliation status, and report delivery state — eliminating the need to open each client's report individually.
**Depends on:** Phase 23 (templates — defines report status vocabulary)
**Requirements:** CFOD-01, CFOD-02, CFOD-03, CFOD-04, CFOD-05, CFOD-06, CFOD-07
**UI hint:** yes
**Plans:** Iteration 1 shipped in commit `e33c0f5` (2026-04-17). See `.planning/phases/33-cfo-dashboard/33-SUMMARY.md`.
**Deferred to future iteration:** manual status override UI, flag-client UI toggle on business profile, month-over-month trend arrows, `next_due` computation (waits on Phase 35).

**Scope:**
- New DB column: `businesses.is_cfo_client boolean DEFAULT false` — flags which businesses appear on the CFO dashboard
- New DB table: `cfo_report_status (id, business_id → businesses, period_month date, status text CHECK IN ('draft','ready_for_review','approved','sent'), commentary_approved bool, approved_by, approved_at, sent_at, created_at)` with unique constraint on (business_id, period_month)
- New API: `GET /api/cfo/summaries?month=YYYY-MM` — reads from `xero_pl_lines` + `forecast_pl_lines` + `financial_metrics` + `cfo_report_status`; no live Xero API calls; returns per-client headline metrics + computed status badge
- New layout: `src/app/cfo/layout.tsx` — reuses `CoachLayoutNew` (same chrome as coach portal)
- New page: `src/app/cfo/page.tsx` — coach/super_admin only; month selector defaults to previous month
- Middleware: add `/cfo` to `onboardingExemptRoutes`
- CoachLayoutNew: add "CFO Dashboard" nav link pointing to `/cfo`

**Layout:**
```
Top bar (4 stat cards)
  ├── Clients on track    (count — green)
  ├── Pending approval    (count — amber)
  ├── Recon alerts        (count — red)
  └── Next report due     (date or "All clear")

Client grid (5 cards, 3-col desktop → 2-col tablet → 1-col mobile)
  Each card:
    ├── Client name + industry
    ├── Status badge: On Track | Watch | Alert
    ├── Revenue vs Budget %
    ├── Gross Profit %
    ├── Net Profit $ (month)
    ├── Cash balance
    ├── Reconciliation: ✓ Clean | ⚠ N unreconciled
    ├── Report status: draft | ready_for_review | approved | sent
    └── "Review Report" button → /finances/monthly-report?business_id=X
```

**Status badge logic:**
- **On Track**: net profit within 10% of budget AND unreconciled_count = 0
- **Watch**: net profit 10–25% below budget OR unreconciled_count > 0 (minor)
- **Alert**: net profit >25% below budget OR unreconciled_count > 10 OR report overdue

**Data sources (all DB — no live Xero calls):**
- P&L actuals: `xero_pl_lines.monthly_values[monthKey]` grouped by `account_type`
- P&L budget: `forecast_pl_lines.forecast_months[monthKey]` via active `financial_forecasts`
- Cash + recon: `financial_metrics.total_cash`, `financial_metrics.unreconciled_count`
- Report status: `cfo_report_status` for (business_id, period_month)

**Auth:** Coach or super_admin role (via `system_roles` table). Clients cannot access `/cfo`.

**Success Criteria:**
- Page loads and shows all 5 CFO clients with correct status badges within 3 seconds
- Stat cards accurately count on-track / pending-approval / recon-alert clients
- Status badge matches the defined logic (10%/25% thresholds against budget)
- "Review Report" button navigates to the correct client's monthly report for the selected period
- Month selector changes all client cards to reflect that period's data
- Page is inaccessible to non-coach users (redirects to login)
- Layout is responsive: 3 columns on desktop, 2 on tablet, 1 on mobile

---

### Phase 34: Dragon Multi-Entity Consolidation [COMPLETE]
**Goal:** Dragon and IICT consolidations can be reported as combined multi-entity P&L, Balance Sheet, and Cashflow — with per-entity columns, FX translation (HKD/AUD monthly_average + closing_spot, manual-entry), intercompany elimination engine, and seeded Dragon rules — replacing Matt's manual Calxa PDF process for both real-world groups.
**Depends on:** Phase 23 (templates), Phase 27 (Balance Sheet), Phase 33 (CFO dashboard — cfo_report_status snapshot target for Phase 35)
**Requirements:** MLTE-01, MLTE-02, MLTE-03, MLTE-04, MLTE-05
**UI hint:** yes
**Plans:** 8/8 plans executed [COMPLETE]

Plans:
- [x] 34-00a-foundation-PLAN.md — shared.ts extraction, Dragon/IICT PDF fixtures, 3 migrations (consolidation_groups + fx_rates + snapshot columns)
- [x] 34-00b-engine-core-PLAN.md — account alignment + engine orchestration (parallel member fetch + combine)
- [x] 34-00c-fx-translation-PLAN.md — HKD/AUD monthly_average translation + missing-rate surfacing (no silent 1.0 fallback)
- [x] 34-00d-eliminations-seed-push-PLAN.md — elimination engine + Dragon/IICT seed migration + [BLOCKING] schema push
- [x] 34-00e-api-ui-PLAN.md — /api/monthly-report/consolidated route + ConsolidatedPLTab + FXRateMissingBanner + page wiring
- [x] 34-00f-admin-fx-entry-PLAN.md — /admin/consolidation page + FX rate CRUD API + tenant PATCH (post-pivot: tenant model, not groups/members)
- [x] 34-01a-consolidated-balance-sheet-PLAN.md — translateBSAtClosingSpot + BS engine with Translation Reserve + intercompany_loan eliminations + BS tab (shipped via PR #2, a80ed62; plan doc describes pre-pivot group/member model but impl uses post-pivot tenant model)
- [x] 34-02a-consolidated-cashflow-PLAN.md — aggregates per-tenant generateCashflowForecast outputs + consolidated cashflow tab (shipped via PR #4, aa27bf2; later patched by PR #8 #9)

**Context:**
Dragon Consolidation is one of the 5 CFO clients. It is not a single Xero org — it is two orgs that must be merged at report time:
- Dragon Roofing — Xero tenant ID starts `7e0a3887` — 269 accounts
- Easy Hail — Xero tenant ID starts `64bcb836` — 92 accounts

**Scope:**
- New DB table: `consolidation_groups (id, name, business_id → businesses, created_at)` — one row per consolidated entity (e.g. "Dragon Consolidation")
- New DB table: `consolidation_group_members (id, group_id → consolidation_groups, source_business_id → businesses, display_name, display_order)` — one row per Xero org in the group
- New API: `GET /api/monthly-report/consolidated?group_id=&report_month=&fiscal_year=` — fetches `xero_pl_lines` for each member business independently, aligns account categories, returns three-column P&L structure: Entity A amounts | Entity B amounts | Combined amounts
- New UI: `ConsolidatedPLTab` — three-column table matching the 9-column Calxa single-entity format but with Entity A / Entity B / Combined column groups per metric
- Monthly report page: detects `group_id` query param and renders consolidated view instead of single-entity view
- Template system applies to consolidated groups identically to single businesses

**Three-column layout (per P&L row):**
```
Account Name | Entity A Actual | Entity A Budget | Entity B Actual | Entity B Budget | Combined Actual | Combined Budget | Combined Variance
```

**Account alignment:**
- Accounts are matched across entities by `account_type` (revenue / cogs / opex / other_income / other_expense) — not by account name
- An account present in one entity but not the other shows $0 for the absent entity
- Intercompany eliminations are out of scope for V1

**Success Criteria:**
- Consolidated P&L tab shows Dragon Roofing and Easy Hail side-by-side with a Combined column for every P&L row
- Revenue, COGS, Gross Profit, Expenses, and Net Profit combined totals equal the arithmetic sum of the two entities
- An account that exists only in one entity shows $0 (not blank) for the other entity
- Selecting the Dragon Consolidation business from the report selector loads the consolidated view automatically
- Template saved for Dragon Consolidation applies to the consolidated report (section toggles work identically to single-entity)

---

### Phase 35: Report Approval + Delivery Workflow
**Goal:** Matt can mark a monthly report as approved inside WisdomBI, triggering an automated email to the client via Resend — replacing the current manual process of exporting from Calxa and sending separately.
**Depends on:** Phase 33 (CFO Dashboard — defines `cfo_report_status` table and status vocabulary)
**Requirements:** APPR-01, APPR-02, APPR-03, APPR-04, APPR-05
**UI hint:** yes
**Plans:** 7/7 plans executed

Plans:
- [x] 35-01-PLAN.md — cfo_email_log migration (audit table + RLS)
- [x] 35-02-PLAN.md — HMAC token helpers + buildReportUrl + .env.example
- [x] 35-03-PLAN.md — sendMonthlyReport Resend wrapper with 15s deadline
- [x] 35-04-PLAN.md — POST /api/cfo/report-status + revertReportIfApproved helper
- [x] 35-05-PLAN.md — /reports/view/[token] public snapshot page + middleware
- [x] 35-06-PLAN.md — ReportStatusBar UI + useReportStatus hook + approve-and-send orchestrator
- [x] 35-07-PLAN.md — Edit-revert wiring + ROADMAP.md update + final UAT

**Scope override (during planning):** The original ROADMAP entry called for a Make.com webhook integration. Pivoted during /gsd:discuss-phase to direct email via Resend — owning deliverability is a cleaner CFO-product story, eliminates per-business webhook URL setup, and keeps audit data in-platform. See `.planning/phases/35-report-approval-delivery-workflow/35-CONTEXT.md` for full decision log (D-01..D-23).

**Scope amendment (during execution):** D-09 (per-coach From email) was further amended during Plan 35-06 UAT to a **single SaaS sender** pattern via `REPORT_FROM_EMAIL` / `REPORT_FROM_NAME` env vars. Per-coach Resend domain verification proved operationally painful; one verified domain (`wisdombi.ai` → `cfo@wisdombi.ai`) is simpler and scales to N coaches without per-coach DNS work. Reply-To still routes to the coach's own email so client replies reach them.

**Context:**
The `cfo_report_status` table (created in Phase 33) already models the full status lifecycle:
`draft → ready_for_review → approved → sent`

Phase 35 adds the UI controls + automation trigger + public client view + edit-revert wiring that move a report through this lifecycle.

**Scope (as built):**
- New DB table: `cfo_email_log` — append-only audit of every Resend send attempt (D-14)
- New API: `POST /api/cfo/report-status` — upserts `cfo_report_status` for (business_id, period_month); on `approved` transition: captures snapshot to `snapshot_data` (D-15), sends email via Resend (D-05/D-08/D-10), writes `cfo_email_log` row (success or failure), sets `status='sent'` only on Resend 2xx (D-11)
- New helper: `revertReportIfApproved()` (lib/reports/revert-report.ts) — silently flips approved/sent → draft on commentary/snapshot/settings edits, preserves `snapshot_data` (D-16/D-17/D-18)
- New helpers: `signReportToken` / `verifyReportToken` via existing HMAC utils (D-20), `buildReportUrl` with Phase 36 `portal_slug` forward-compat (D-22)
- New public route: `/reports/view/[token]` — anonymous read-only snapshot view, no token expiry (D-19/D-21), middleware exempt from `publicRoutes` AND `onboardingExemptRoutes`
- Modified UI: monthly report page top bar gains a status pill + contextual action buttons (Mark Ready / Approve & Send / Resend / Revert) — coach-only buttons, clients see read-only pill (D-04)
- Email format: subject `{Business} — {Month Year} financial report` (D-08), body = greeting + "View Report" button + PDF attachment, no headline numbers (D-06), recipient = `businesses.owner_email` only (D-10)
- Edit-revert: hooked into `/api/monthly-report/{commentary,snapshot,settings}` save routes; Xero ingestion paths explicitly NOT touched (D-17)
- CFO dashboard (Phase 33) reads `cfo_report_status` — status changes on the report page are immediately reflected on the dashboard

**Required env vars (must be set in dev `.env.local` AND Vercel production env):**
- `RESEND_API_KEY` — Resend account API key
- `REPORT_LINK_SECRET` — HMAC signing secret for token URLs
- `REPORT_FROM_EMAIL` — single verified Resend sender (e.g., `cfo@wisdombi.ai`)
- `REPORT_FROM_NAME` — display name for the From header

**Required Resend setup:** verify the `REPORT_FROM_EMAIL` domain in Resend dashboard before first production send.

**Success Criteria:**
- Clicking "Approve & Send" on a draft or ready_for_review report sends a real email via Resend, captures a snapshot, and transitions status to `sent`
- Email contains subject, "View Report" link, PDF attachment; clicking the link opens the public snapshot view
- The CFO dashboard "Pending Approval" count decrements immediately after a report is sent
- If Resend returns an error, status stays at `approved` (not `sent`), error toast surfaces, "Resend" button appears, every attempt logged in `cfo_email_log`
- `approved_by` recorded as authenticated user; `approved_at` / `sent_at` / `snapshot_taken_at` timestamps written
- Editing commentary, snapshot, or settings on an already-approved report silently reverts status to `draft`; previously-sent email link continues to render the frozen snapshot

### Phase 37: Resolver adoption — route all pages through resolveBusinessId [COMPLETE]

**Goal:** Eliminate the ~20 duplicated `businessId` resolution blocks in the codebase by routing them through `src/lib/business/resolveBusinessId.ts` (helper created in commit ed9dfa7). Makes the "coach saves to my business" bug class structurally impossible to reintroduce — there becomes one and only one place where a page decides which business it operates on.

**Non-goals:** DB schema changes; RLS changes; new product features; refactoring business logic beyond the resolution code path.

**Depends on:** ed9dfa7 (coach-context fix, shipped) and 9d33a74 (phase A hardening, shipped).

**Scope — pages/hooks to route through the resolver:**
- `src/app/finances/monthly-report/page.tsx`
- `src/app/finances/cashflow/page.tsx`
- `src/app/finances/forecast/page.tsx`
- `src/app/one-page-plan/page.tsx`
- `src/app/goals/page.tsx` + `src/app/goals/hooks/useStrategicPlanning.ts` + `src/app/goals/components/OperationalPlanTab.tsx`
- `src/app/business-dashboard/hooks/useBusinessDashboard.ts`
- `src/app/reviews/weekly/page.tsx`
- `src/app/sessions/page.tsx`
- `src/app/messages/page.tsx`
- `src/app/integrations/page.tsx`
- `src/app/settings/notifications/page.tsx`
- `src/app/settings/team/page.tsx`
- `src/app/quarterly-review/page.tsx` + `src/app/quarterly-review/history/page.tsx` + `src/app/quarterly-review/hooks/useQuarterlyReview.ts`
- `src/app/dashboard/hooks/useDashboardData.ts`
- `src/app/dashboard/components/SessionActionsCard.tsx`
- `src/hooks/useUnreadMessages.ts`

**Acceptance criteria:**
1. `grep -rE "\.eq\('owner_id', user\.id\)" src/app src/hooks` returns 0 matches outside the resolver itself.
2. Every page in scope imports from `@/lib/business/resolveBusinessId` and uses the helper (no re-implemented logic).
3. `npm run build` passes.
4. Vercel preview deploy exercises the full coach→client flow, monthly-report, sessions, messages without regression.
5. `resolveBusinessId` runtime invariant never fires during preview smoke test.

**Risk:** high blast radius — touches every page a client uses daily. Must ship via **feature branch `feat/resolver-adoption` → Vercel preview → manual smoke test → merge to main**. Do NOT push straight to main.

**Requirements:** N/A (internal refactor — no new requirements)

**Plans:** 6 plans

Plans:
- [ ] 37-01-PLAN.md — Low-risk hooks/components (useUnreadMessages, SessionActionsCard, useDashboardData)
- [ ] 37-02-PLAN.md — Finances pages (monthly-report, cashflow, forecast)
- [ ] 37-03-PLAN.md — Client workflows (sessions, messages, integrations, settings/notifications, settings/team, reviews/weekly)
- [ ] 37-04-PLAN.md — Strategic planning surface (one-page-plan page + assembler, goals page + hook + OperationalPlanTab, useBusinessDashboard)
- [ ] 37-05-PLAN.md — Quarterly review (page, history, useQuarterlyReview hook)
- [ ] 37-06-PLAN.md — Build + push + Vercel preview + manual smoke test + merge gate

### Phase 38: Finish resolver sweep — /client routes + legacy OAuth cleanup [COMPLETE]

**Goal:** Finish what Phase 37 started — delete dead `/client/*` routes, remove orphaned dashboard/integrations + xero-connect routes, and fix the final `.eq('owner_id', user.id)` fallthrough bug in `/api/actions/route.ts`. Keep `xero-connect/select-org` (live OAuth multi-tenant redirect).
**Requirements**: N/A (internal cleanup)
**Depends on:** Phase 37
**Plans:** 1/1 plan shipped (PR #11, merge commit bc41569)

Plans:
- [x] 38-01-PLAN.md — Delete orphaned routes + fix api/actions owner_id fallthrough

### Phase 39: Branded types rollout — BusinessId/UserId compile-time safety [COMPLETE]

**Goal:** Introduce `BusinessId`, `UserId`, and `BusinessProfileId` branded string types at the producer points (`resolveBusinessId`, `BusinessContext`) so the compiler catches ID-kind mistakes (e.g., passing a UserId where a BusinessId is expected). Backward-compatible — consumers accepting plain `string` keep working.
**Requirements**: N/A (internal type-safety)
**Depends on:** Phase 38
**Plans:** 1/1 plan shipped (PR #12, merge commit 80db071)

Plans:
- [x] 39-01-PLAN.md — Brand IDs at resolver + context, add compile-time regression test (ids.test-d.ts)

### Phase 40: Playwright E2E — coach-flow test + CI integration [COMPLETE — infra shipped, CI integration deferred]

**Goal:** Install Playwright, add smoke tests that run against any URL (local or Vercel preview), and scaffold an auth-based coach-flow test. Deferred to future work: CI integration in GitHub Actions and un-skipping coach-flow tests (blocked on test Supabase project).
**Requirements**: N/A (testing infrastructure)
**Depends on:** Phase 39
**Plans:** 1/1 plan shipped (PR #13, merge commit 6079a86)

Plans:
- [x] 40-01-PLAN.md — Install Playwright + 3 passing smoke tests + coach-flow scaffold (4 skipped tests with un-skip instructions)

**Follow-up (not in Phase 40 scope):** Wire Playwright into GitHub Actions, provision test Supabase project to un-skip coach-flow specs.

### Phase 41: Eliminate phantom business orphan rows via active-business routing

**Goal:** Team members, coaches, and admins stop generating phantom "My Business" orphans when they visit `/business-profile`. Switch the page from owner_id lookup to active-business context. Owner → editor; admin → editor with owner-only fields disabled; member → read-only; no business → clean empty state with "contact your coach" CTA. Sweep existing phantoms with user approval before delete.

**Depends on:** Phase 40

**Requirements:** TBD (no REQ-IDs — hot-fix triggered by Jessica @ Oh Nine incident 2026-04-23)

**Trigger:** `jessica@ohnine.com.au` is admin on Oh Nine via `business_users`, but visiting `/business-profile` lazy-created a blank `businesses` row for her (owner_id=Jessica, business_name=NULL). Prior patch (d317442) fixed the NULL name but the root cause — lazy-create firing for non-owners — remains.

**Scope:**
- `src/app/business-profile/services/business-profile-service.ts` — remove lazy-create on both `businesses` and `business_profiles`. Read path returns null when no business exists for owner; no side-effects on read.
- `src/app/business-profile/page.tsx` — switch from owner_id lookup to activeBusiness (BusinessContext). Compute user role per active business (owner | admin | member | none) and render appropriate UI: editor / read-only / empty state.
- DB sweep: identify phantom businesses (name='My Business' OR business_name IS NULL OR business_name='My Business'; zero xero_connections; zero financial_forecasts; zero non-owner business_users; owner is a team-member of a DIFFERENT business). Surface list to user; delete only after explicit confirmation. Same sweep for orphan business_profiles with NULL business_id belonging to users who are team members elsewhere.
- Verification: tsc clean, vitest green on touched tests, manual smoke test for owner + team-member + no-business flows on /business-profile.

**Out of scope:**
- Schema NOT NULL migrations on `businesses.business_name` or `business_profiles.business_id` (deliberately deferred — was "Level 3" in user discussion).
- Changes to signup wizard, /api/admin/clients, /api/coach/clients, demo-client routes — those create businesses at explicit intent and correctly set both `name` and `business_name`.

**Success criteria:**
- Visiting `/business-profile` as a team-member user produces ZERO new rows in `businesses` or `business_profiles`.
- `/business-profile` renders correctly for all four role states (owner / admin / member / none).
- Phantom-row sweep produces a reviewed, approved, deleted list (with user confirmation before any DELETE).
- tsc clean; vitest green on modified tests.

**Plans:** 2/3 plans executed

Plans:
- [x] 41-01-PLAN.md — Remove lazy-create from business-profile-service (owner_id read path becomes read-only)
- [x] 41-02-PLAN.md — Refactor /business-profile page to use BusinessContext with role-aware rendering (owner / admin / member / none)
- [ ] 41-03-PLAN.md — Sweep + delete existing phantom rows with explicit user confirmation gate

### Phase 42: Monthly Report Save Flow Consolidation [COMPLETE]
**Goal:** Collapse the multiple save buttons + intermediate local-state saves on the monthly report page into a single auto-save-on-blur path. Eliminate the per-note green ✓ button (saves only to local React state) + the page-level "Save Draft" button (POSTs to /api/monthly-report/snapshot). End state: coach types → focus leaves the field → server save fires → cfo_report_status reflects new state immediately.
**Depends on:** Phase 35 (revert wiring depends on snapshot save firing on every coach edit; current UX requires manual "Save Draft" click which broke Phase 35 UAT visibly)
**Requirements:** N/A (UX consolidation — no new functional requirement; existing requirements already cover the persistence contract)

**Plans:** 7/7 plans complete
- [x] 42-00-PLAN.md — Wave 0 scaffolding: lift useDebouncedCallback to shared lib + create test scaffolds for 4 surfaces
- [x] 42-01-PLAN.md — useAutoSaveReport hook (debounce + blur + retry + queue + lock + onSaveSuccess)
- [x] 42-02-PLAN.md — SaveIndicator component (5 status states with retry button)
- [x] 42-03-PLAN.md — Refactor CommentaryLine to always-editable inline (remove green ✓ + Cancel)
- [x] 42-04-PLAN.md — Wire page.tsx: mount hook, render indicator, remove Save Draft button, thread onCommitBlur
- [x] 42-05-PLAN.md — Finalise lock + Unfinalise button + D-17 settings/layout save → pill refresh wiring
- [x] 42-06-PLAN.md — beforeunload guard + un-skip Playwright E2E + manual UAT sign-off

**Final scope (as built):**
- Single source of truth for "saved" state via auto-save → `/api/monthly-report/snapshot` (no separate state machines).
- Coach typing → debounce 500ms after last keystroke OR onBlur → fires snapshot POST → server triggers Phase 35's `revertReportIfApproved()` chain.
- Per-note green ✓ Save button removed entirely.
- "Save Draft" button removed.
- Finalise button KEPT (D-06): now locks auto-save when status='final' and surfaces an "Unfinalise to edit" button to resume editing. Locked-state textareas render read-only (visible) so coaches retain access to past notes.
- "Saved/unsaved" indicator (`<SaveIndicator />`) sibling of the status pill: idle / saving / saved / retrying / failed states.
- 3-attempt exponential backoff (1s/2s/4s) on save failure; manual "Save Now" button on terminal failure; durable error toast.
- `beforeunload` guard fires while in retry-exhausted state to prevent silent loss of unsaved edits.
- Pill state remains the single visible source of truth for lifecycle (`Draft | Ready for Review | Approved | Sent`).

**Success Criteria (verified):**
- Typing a coach note → blur → DB row updates within ~500ms; no manual save button required ✓
- After save lands, status pill auto-flips Draft (if previously Approved/Sent) within ~1s — Phase 35 revert chain visible end-to-end without user intervention ✓
- Top toolbar lifecycle buttons: Approve & Send / Mark Ready / Resend / Revert to Draft / Finalise (or Unfinalise) — Save Draft removed, per-note ✓ removed ✓
- Coach onboarding test: a first-time user types a note + closes the page; reopening shows the note persisted ✓

---

### Phase 43: Plan period as explicit state — replace inference-based extended period detection [COMPLETE]

**Goal:** Make plan period an explicit, persisted property of the plan record. Eliminate runtime inference in the goals wizard. Coach view and owner view render identical plans regardless of who is logged in.

**Why now:** Phase 14's runtime detection at [src/app/goals/hooks/useStrategicPlanning.ts:752-770](src/app/goals/hooks/useStrategicPlanning.ts#L752-L770) had a `ownerUser === user.id` guard at line 759 that explicitly excluded coach view. Every coach-led planning session in Q4 fell through to standard 12-month Year 1 = mostly-past quarters. Surfaced 2026-04-24 in the Fit2Shine planning session (Shari Bremner, businesses.id `389167dc-acb9-4a56-a594-aa77eae15745`) — Shari was being asked to set targets into FY26 with only ~2 months left.

**Design principle:** Inference-based plan periods are a code smell. Anaplan / Adaptive / Planful all make plan period explicit, declarative state. Detection runs once at plan creation as a *suggestion*, the user confirms, and that becomes the immutable plan record. Coach view, owner view, returning client, first-time client all collapse to one read path.

**Depends on:** Phase 14 (extended period feature this replaces) — see [.planning/phases/14-goals-wizard-first-time-extended-period/](.planning/phases/14-goals-wizard-first-time-extended-period/)

**Note on numbering:** This phase was originally drafted locally as Phase 42 (commits use `feat(42-XX)` / `test(42-XX)` / `docs(42-XX)` prefixes) before discovering that origin's Phase 42 was already merged for the Monthly Report Save Flow work above. Renumbered forward-only on 2026-04-27 — historical commit messages remain at 42-XX, current artifacts at 43-XX. Phase directory: `.planning/phases/43-plan-period-as-explicit-state-replace-inference-based-extend/`.

**Requirements:**
- New columns on `business_financial_goals`: `plan_start_date`, `plan_end_date`, `year1_end_date`. Migration includes a one-time backfill from current `is_extended_period` + `year1_months` semantics.
- Single `suggestPlanPeriod()` helper computes recommended dates using existing `isNearYearEnd` / `getMonthsUntilYearEnd`. Runs ONLY at plan creation (or "Reset Plan Period" user action). Never consulted at render time.
- Step 1 surfaces the suggestion visibly: e.g. "Your plan: Apr 2026 → Jun 2029 · Year 1 is 14 months · [Adjust]". User confirms or adjusts before save. No silent behavior changes.
- Year 1/2/3 labels everywhere derive from persisted period columns, not `new Date()`.
- `isExtendedPeriod` becomes a derived getter (`year1_end_date - plan_start_date > 365 days`); not a stored flag the future can disagree with.
- The `ownerUser === user.id` guard at [useStrategicPlanning.ts:759](src/app/goals/hooks/useStrategicPlanning.ts#L759) is removed; coach view sees the same plan period as owner view.
- Existing Phase 14 tests pass; new tests cover: plan period persists across reloads, coach view and owner view render identical periods, suggestion is shown visibly at creation, "Adjust" lets user override.

**Out of scope:**
- Forecast period logic (`calculateForecastPeriods` in [src/lib/utils/fiscal-year-utils.ts:194-271](src/lib/utils/fiscal-year-utils.ts#L194-L271)) — separate flow that already works correctly
- Multi-year plan templates beyond 3-year horizon
- Removing legacy `is_extended_period` / `year1_months` / `current_year_remaining_months` columns (deferred to a cleanup phase after one release of dual-write)

**Risk / mitigation:**
- Existing client plans must not silently change shape. Migration backfill must produce dates equivalent to what current detection would compute. Verification query post-migration.
- Coach-view-equality is a behavior change for coaches viewing clients with empty `business_financial_goals` rows — they'll start seeing the suggested extended period instead of standard. Acceptable; matches design intent of Phase 14 that the role-guard accidentally undid.

**Plans:** 3 plans

Plans:
- [x] 43-01-PLAN.md (`feat(42-01)` commits) — Foundation: migration + plan-period helpers + service/API persistence (fixes Phase 14 silent-drop bug) — COMPLETE (df0c007, b6e3272, f9d8f09, 417848f, 92eb5a7, bdcded1, f500116). Migration applied to prod via Management API; 3 columns + 11 rows backfilled; 0 rows missing.
- [x] 43-02-PLAN.md (`feat(42-02)` commits) — Hook refactor + Step 1 banner/modal + getYearLabel rewrite + coach goals page bug fix — COMPLETE (c55e20e, 2acb2a7, a312324, 5f52d01, dc0581b, 7950f58, 9e77000). 7 atomic tasks; all 5 sentinels green; tsc baseline preserved at 16 pre-existing errors.
- [x] 43-03-PLAN.md (`test(42-03)` / `docs(42-03)` commits) — Tests (helpers, components, coach/owner equivalence, persistence) + Vercel preview Fit2Shine smoke test — COMPLETE (b2011de, 2767b8f, a8ad838, 9f95bc3, bab8a4d, 99b6cb7, dc2f194). 38/38 goals tests pass; full suite 299/299; smoke test approved on Fit2Shine 2026-04-27.

### Phase 44: Forecast Pipeline End-to-End Fix

**Goal:** Make the forecast pipeline (Xero sync → xero_pl_lines → forecast wizard → forecast_pl_lines → monthly report → cashflow forecast) 100% reflective of Xero, deterministic, and resilient. Eliminate the cascading sync bugs (Xero rolling-totals trap, sync-race duplicates, sparse-tenant edge cases, broken reconciliation) and deliver a wizard UX that's correct the first time without coach intervention. World-class best practice across the whole pipeline — sync, data shape, wizard, save flow, and downstream consumers.
**Requirements**: D-05 through D-18 (per .planning/phases/44-forecast-pipeline-fix/44-CONTEXT.md; ROADMAP-level "Requirements: TBD" left as-is until verification phase confirms outcomes)
**Depends on:** Phase 43
**Plans:** 4/11 plans executed

Plans:
- [x] 44-01-PLAN.md — [Sub-phase A] Wave 0: fixture recording (Envisage + JDS) + test scaffolding + duplicate audit script
- [x] 44-02-PLAN.md — [Sub-phase A] Foundation migrations: xero_pl_lines long-format + sync_jobs audit table + advisory-lock RPC
- [x] 44-03-PLAN.md — [Sub-phase A] Pure libraries: pl-by-month-parser + pl-reconciler (fail-loud)
- [x] 44-04-PLAN.md — [Sub-phase A] Sync orchestrator: advisory lock + 2 FY windows + multi-tenant + reconciler + ON CONFLICT upsert + sync_jobs audit
- [ ] 44-05-PLAN.md — [Sub-phase A] Vercel cron + sync-all/refresh-pl thin shims + integration smoke on Envisage + JDS
- [ ] 44-06-PLAN.md — [Sub-phase B] computed_at column + atomic save_assumptions_and_materialize RPC
- [ ] 44-07-PLAN.md — [Sub-phase B] Wizard generate route → atomic RPC + recompute endpoint + retire e337a42 non-fatal paths
- [ ] 44-08-PLAN.md — [Sub-phase C] ForecastReadService + D-18 runtime invariants
- [ ] 44-09-PLAN.md — [Sub-phase C] Migrate pl-summary, cashflow xero-actuals, monthly-report generate + full-year to ForecastReadService
- [ ] 44-10-PLAN.md — [Sub-phase D] XeroCoverageBanner component + Step 3 mount
- [ ] 44-11-PLAN.md — [Sub-phase D] Cell render branch (em-dash for missing, $0 for real-zero) + safe-default subtext + Phase 44 closeout

---

### Phase 36: Client Portal
**Goal:** Each CFO client can log in to a read-only portal and view their approved monthly reports without needing a coach login — giving clients self-serve access to their financials between sessions.
**Depends on:** Phase 35 (Approval workflow — only approved/sent reports are visible in the portal)
**Requirements:** CPRT-01, CPRT-02, CPRT-03, CPRT-04, CPRT-05
**UI hint:** yes
**Plans:** TBD

**Scope:**
- New route: `/portal` — client-facing login page (separate from `/coach/login` and `/auth/login`)
- New route: `/portal/[businessSlug]` — read-only report view for an authenticated portal client
- Auth model: portal clients authenticate via Supabase Auth (email + password or magic link); their `system_roles.role = 'client'` already exists; RLS policies limit them to their own business data
- New DB column: `businesses.portal_slug text UNIQUE` — URL-safe identifier used in portal links (e.g. `urban-road`)
- Portal shows: list of approved/sent reports for the business (from `cfo_report_status WHERE status IN ('approved','sent')`); clicking a report opens the read-only monthly report view
- Read-only enforcement: all edit controls (settings panel, approve button, template picker, commentary edit) hidden in portal context via `isPortalView` prop passed down from portal layout
- Portal layout: client branding (business name + logo), no coach sidebar, no admin controls
- Deep-link: the `report_url` in the Make.com webhook payload (Phase 35) links directly to `/portal/[slug]?month=YYYY-MM`

**Success Criteria:**
- A client can log in at `/portal` with their email and see only their own business's reports
- Only reports with status `approved` or `sent` are visible — draft and ready_for_review reports are hidden
- All edit controls are hidden in portal view; no data can be modified by a portal client
- The URL `/portal/urban-road?month=2026-03` deep-links directly to Urban Road's March 2026 report
- Portal client cannot access any coach route (`/coach/*`, `/cfo`, `/finances/*`) — middleware redirects to portal login
- Disconnecting or revoking portal access (deleting the system_roles row) immediately prevents login
