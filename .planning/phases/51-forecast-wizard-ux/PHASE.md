# Phase 51: Forecast Wizard UX Improvements

**Milestone:** post-v1.1 — emergent phase
**Status:** Not started
**Source:** Operator (Matt) review of forecast wizard 2026-05-04 + scope refinement 2026-05-08
**Predecessor phases:** 50 (4 bugs shipped); fix/forecast-step3-percent-input PR #82 (% column input)

## Goal

Make the forecast wizard's Step 3 (Revenue/COGS), Step 4 (People), Step 5 (OpEx), and Step 6 (Subscriptions) more flexible and easier to use for operators who are "not numbers people". Every change is additive — no existing forecasts are broken; new fields default to current behavior so saved forecasts continue working.

After this phase ships, the wizard supports:
- **Step 3:** direct $ entry per line (auto-syncs with %), Y-on-Y growth % column, per-line seasonality override
- **Step 4:** an obvious "end someone" termination flow, PT/casual flexibility (hours-per-week OR % FTE), pay frequency selector (weekly / fortnightly / monthly)
- **Step 5:** $ vs % toggle per OpEx line with explainer, simpler layout
- **Step 6:** persistent sidebar showing selected Xero accounts + totals, "change selected accounts" link from vendor screen, manual subscription entry (vendor / $ / monthly-or-annual / start month / category)

## Why now

- Operator surfaced these in a single review session 2026-05-04. Triaging deferred the UX items to "Phase 51 — needs design conversations". Design conversations completed 2026-05-08; scope locked.
- Phase 50 fixed the 4 actual bugs but didn't address the underlying "this wizard is hard to use" feedback. Operators have been working around the limitations; one more pass closes the loop.
- The 11 items here are the LAST UX backlog from the 2026-05-04 review. Closing this phase clears the wizard backlog (Phase 52 then handles Xero employee-data auto-fill).

## Dependencies

- **Phase 44 (Test Gate & CI Hardening)** — CI gates catch regressions on these changes
- **Phase 50 (Forecast Wizard Bug Sweep)** — bug fixes shipped 2026-05-04 inform the harness pattern + lease taxonomy
- **PR #82 (Step 3 % column input fix)** — proves the local-pending-state pattern; Step 3's new $ / Growth% inputs likely use the same approach

## Blast Radius

**Low to medium — single feature area, behind CI gate, additive-only schema changes.**

- All changes touch only `wizard-v4` step components (`Step3RevenueCOGS.tsx`, `Step4People.tsx`, `Step5OpEx.tsx`, `Step6Subscriptions.tsx`) + the shared `useForecastWizard.ts` / `types.ts`
- New optional fields on existing types (`isPercent` on OpEx, `payFrequency` / `endDate` / `hoursMode` on Person, `seasonalityPattern` per RevenueLine, etc.) — older saved forecasts have these as `undefined` and fall through to current behavior
- No API contract changes
- No DB schema migrations (all UI/state changes; persisted state lands in existing JSON columns on `financial_forecasts`)
- Worst-case rollback per plan: revert the PR; UX returns to its current (less-flexible) state

The biggest risk is the **Step 3 per-line seasonality override** — the seasonality calculation is shared across the rollup; per-line override means the rollup needs to use line-level seasonality when set, business-level otherwise. The shared rollup pattern from Phase 50 Bug 4 (`getPlannedSpendPLBreakdown`) is the right model: extract a per-line helper that returns the correct seasonality given line + business context, ensuring rollup and display always agree.

## Requirements (1:1 from operator review)

### Step 3 (Revenue & COGS)

- **UX-S3-01** — Direct $ entry per line: a "$ for the year" column next to "% Split" — type a dollar amount and the % auto-recalculates (and vice versa). Both inputs always agree.
- **UX-S3-02** — Y-on-Y Growth % column: in Y2/Y3 views, a "Growth %" column where the operator sets growth from the prior-year line total (e.g. "20% growth on this product line"). Mutually-exclusive UX with the $ / % Split inputs (or auto-recalculates).
- **UX-S3-03** — Per-line seasonality override: each revenue line and each COGS line can have its own seasonality curve, overriding the company-wide one. Default: inherit business seasonality (current behavior). Override UI: small "edit seasonality" affordance per line that opens a 12-month editor.

### Step 4 (People)

- **UX-S4-01** — "End someone" termination flow: a clear, visible UI to terminate an employee mid-FY. Options: "remove from FY entirely" (zero out from start) OR "ends on month X" (pro-rate remaining months). Currently no obvious path to do this — operator works around by deleting the line which loses YTD actuals.
- **UX-S4-02** — PT/casual hours flexibility: when transitioning fulltime → part-time or casual, the form supports both modes — set hours-per-week directly OR set % FTE (which derives hours from a fulltime baseline of 38 or 40 hours/week, configurable). Toggle in the row.
- **UX-S4-03** — Pay frequency selector: per-employee or per-business default — weekly / fortnightly / monthly. Affects cash-flow timing in downstream views and Phase 52 Xero auto-fill.

### Step 5 (OpEx)

- **UX-S5-01** — $ vs % toggle per OpEx line: per-line dropdown or radio to pick "$ per month" or "% of revenue". When `%`, the line's monthly value derives from monthly revenue × the %. Includes an explainer tooltip clarifying when each is appropriate (e.g. "use % for variable costs that scale with revenue, $ for fixed").
- **UX-S5-02** — Simpler OpEx layout: a broader UX cleanup to make the OpEx table less confusing. Specific: clear column headers, consistent input widths, group similar lines (e.g. all "Marketing" lines collapsible under a header), explicit "Year total" and "Monthly avg" columns.

### Step 6 (Subscriptions)

- **UX-S6-01** — Sidebar with selected accounts: a persistent left sidebar (or collapsible side panel) showing the Xero accounts that have been selected, with the total per account. Always visible while the operator is in the vendor view, so they know which accounts contributed.
- **UX-S6-02** — "Change selected accounts" link: a button on the vendor screen that takes the operator back to the account-selection view without losing their existing vendor toggles.
- **UX-S6-03** — Manual subscription entry: a "+ Add subscription" button on the vendor view that opens a small form: vendor name (text), monthly amount ($), frequency (monthly OR annual), start month (dropdown), category (matching existing categories). Manual entries appear in the vendor list alongside auto-detected ones.

## Success Criteria (observable)

1. **Step 3 $ ↔ % parity** — type "$50,000" in the $ column for a revenue line; the % column auto-updates to that line's share. Type "20%" in the % column; the $ column auto-updates to 20% of the year target. Both round-trip cleanly. Vitest assertion locks the bidirectional sync. (Validates UX-S3-01.)
2. **Step 3 Growth % column populates Y2/Y3** — in Y2 view, set "20%" Growth on a line; the line's Y2 total = Y1 total × 1.20; monthly distribution uses business seasonality. Vitest assertion locks the math. (Validates UX-S3-02.)
3. **Step 3 per-line seasonality** — open the seasonality editor on a revenue line; change Q1 share; line's Y1 monthly distribution shifts; rollup totals are unchanged. Vitest assertion confirms rollup uses line seasonality when set. (Validates UX-S3-03.)
4. **Step 4 termination flow** — open Step 4; click "End employee" on a row; pick "Ends 2026-12"; the employee's costs zero from 2027-01 onwards in Y1; salary remains for 2026-07 to 2026-12. Vitest snapshot. (Validates UX-S4-01.)
5. **Step 4 PT/casual hours OR % FTE** — toggle a row from "Fulltime" to "Part-time"; pick hours mode; set "20 hours/week"; salary auto-recalculates as 50% of fulltime equivalent. Toggle to % mode; set "60% FTE"; salary recalculates accordingly. (Validates UX-S4-02.)
6. **Step 4 pay frequency selector** — set business-level default = "Fortnightly"; new employees inherit; per-employee override available. Persisted to forecast state. (Validates UX-S4-03.)
7. **Step 5 OpEx behavior labels + tooltip** — the existing 4-way `costBehavior` dropdown is relabeled with operator-friendly text (`fixed → "$ per month"`, `variable → "% of revenue"`, `inflation → "$ with annual increase"`, `manual → "Custom per-month"`); an info-icon tooltip explains when to use each; existing `% of revenue` math is unchanged (5% on a line still derives 5% of monthly revenue). (Validates UX-S5-01 — operator decision: keep dropdown, no new toggle.)
8. **Step 5 simpler layout** — visual snapshot in deployed preview matches the agreed wireframe (link in plan). Operator approval is the gate (no automated test). (Validates UX-S5-02.)
9. **Step 6 sidebar selected accounts** — open Step 6, select 3 accounts; move to vendor view; sidebar shows 3 account names + their totals; vendor view still works. (Validates UX-S6-01.)
10. **Step 6 change selected accounts** — from vendor view, click "Change selected accounts"; returns to account selection; vendor toggles preserved on re-entry. (Validates UX-S6-02.)
11. **Step 6 manual subscription entry** — click "+ Add subscription"; fill form (vendor, $50/mo, monthly, start 2026-08, "Software"); subscription appears in vendor list with correct total. (Validates UX-S6-03.)
12. **CI green** — every plan PR merges into main with `lint`, `typecheck`, `vitest`, `build` passing.

## Out of scope for this phase (deferred to Phase 52)

**Xero employee data auto-fill** (Phase 52, queued):
- Auto-populate pay frequency from Xero `EmployeeGroup` / `PayrollCalendar`
- Auto-populate standard hours from Xero `Employee.OrdinaryEarningsRate`
- Auto-populate hourly rate from Xero `EarningsRate`

The Step 4 fields built in Phase 51 are designed to receive Phase 52's auto-fill cleanly. Manual entry in Phase 51 is the fallback / override path.

## Plans

TBD — drafted by `gsd-planner` after `gsd-phase-researcher` produces RESEARCH.md. Likely 5-6 atomic plans batched by step:

- **51-01** — Step 3 $/% parity (UX-S3-01)
- **51-02** — Step 3 Growth % column (UX-S3-02)
- **51-03** — Step 3 per-line seasonality (UX-S3-03)
- **51-04** — Step 4 termination + PT/casual + pay frequency (UX-S4-01, 02, 03 bundled)
- **51-05** — Step 5 $ vs % toggle + simpler layout (UX-S5-01, 02 bundled)
- **51-06** — Step 6 sidebar + change-accounts + manual entry (UX-S6-01, 02, 03 bundled)

Final plan list confirmed by planner after research. Execution order = number order; each plan is a separate atomic PR so the operator can review/merge progressively.
