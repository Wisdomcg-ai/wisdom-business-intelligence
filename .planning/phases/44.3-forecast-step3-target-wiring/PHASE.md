# Phase 44.3: Forecast Step 3 — Year-1 Target Wiring

**Milestone:** v1.1 — Codebase Hardening (forecast pipeline correctness sub-track)
**Status:** Not started
**Source:** Operator-reported bug (2026-05-03) — "step 3 is not calculating the revenue and cogs from the step 1 year 1 target — it is taking it from the prior year"

## Goal

Step 3 of the forecast wizard (`wizard-v4`) must initialize per-line monthly revenue using the **Year 1 target** entered in Step 1 — scaled by prior-year line ratios and seasonality, with completed-month YTD actuals locked. Today it ignores the target and copies prior-year monthly values verbatim, which is wrong any time the target diverges from prior year (i.e. every growth or contraction case).

After 44.3 ships, a coach who enters Year 1 target = $2M in Step 1 and lands on Step 3 sees revenue lines that sum to $2M (with YTD frozen for completed months). COGS auto-corrects via the existing `revenue × percentOfRevenue` path because the COGS percent is derived from the (now correct) revenue.

## Why now

- Active clients use Step 3 numbers in coaching conversations. "Coach says target $2M but the model shows $1.6M" is a credibility problem.
- The bug surfaces every time target ≠ prior-year revenue (the common case for any business setting growth or recovery targets).
- The fix lands cleanly in `useForecastWizard.ts:initializeFromXero` — a single function with a known signature, behind clear test boundaries.

## Dependencies

- **Phase 44 (Test Gate & CI Hardening).** CI gates (lint + typecheck + vitest + build) must be enforcing on `main` so the implementation is verified by the gate, not just review.
- **Phase 44.2 (CFO-grade Xero reconciliation).** The COGS percent-of-revenue field on `cogs_lines` was hot-fixed during 44.2 (PR #48); 44.3 relies on that field being populated correctly. Without it, COGS would still show $0 even with revenue corrected.
- The `historical-pl-summary.ts` API already returns per-line per-month YTD via `current_ytd.revenue_lines[].by_month` — no read-service changes required.

## Blast Radius

**Low — single-file logic change behind a CI gate.** Touches `initializeFromXero` only. No API routes, no read service, no schema, no other wizard steps. CI (lint + typecheck + vitest + build) catches regressions before merge. Existing forecasts already saved in DB are unaffected — only the wizard's initialization path changes.

Worst-case rollback: revert one PR; existing forecasts in DB stay valid; the bug returns to its current state.

## Requirements (1:1 from REQUIREMENTS.md)

- **FCST-01** — `initializeFromXero` consumes the Year 1 revenue target (`data.goals.year1.revenue`) when constructing `revenueLines[].year1Monthly`, instead of copying prior-year monthly values verbatim.
- **FCST-02** — YTD actuals (per-line per-month from `currentYTD.revenue_lines[].by_month`) are locked: completed months in `year1Monthly` equal the YTD actual to the cent.
- **FCST-03** — Future months (months without YTD actuals) for each line distribute `(lineYearTarget − lineYtdTotal)` using that line's prior-year monthly seasonality. `lineYearTarget = targetRevenue × lineShareOfPriorYear`.
- **FCST-04** — Lines that exist in current YTD but not in prior year (e.g. a product launched mid-FY) are added as fresh revenue lines, populated with YTD actuals for completed months and 0 for remaining months.
- **FCST-05** — When `targetRevenue` is 0 / undefined / Year 1 goals not entered, the wizard falls back to the current behavior (prior-year remap as-is) so flows that skip Step 1 don't break.
- **FCST-06** — Wizard state types (`currentYTD` field on `WizardState` and on the `initializeFromXero` arg) extended to surface the per-line YTD breakdown the API already returns.

## Success Criteria (observable)

1. **Goal-backward smoke test**: open the wizard for a business with Year 1 target = X and prior-year revenue = Y (X ≠ Y), step through to Step 3, and observe each revenue line's annual total sums to (lineShare × X), not (lineShare × Y). Validates FCST-01.
2. **YTD lock test**: for a business mid-FY (e.g. JDS in May with YTD through April), the per-month values in Step 3 for completed months exactly match the values shown in Step 2's YTD section. Validates FCST-02.
3. **Per-line scaling test**: in a unit test, given prior year (Hardware $400k, Service $600k, total $1M) and target $1.2M with no YTD, assert Hardware year1Monthly sums to $480k and Service to $720k, with each month's value = `lineShare × target × prior_year_seasonality_for_that_month`. Validates FCST-03.
4. **New-line test**: in a unit test, given a YTD line ("Subscriptions" $50k) not present in prior year, assert it appears as a new revenueLine with YTD months populated and remaining months = 0. Validates FCST-04.
5. **Fallback test**: in a unit test, given target = 0 and prior-year line items, assert revenue lines are populated identical to current behavior (prior-year remap). Validates FCST-05.
6. **CI green**: PR merging into main with all 4 required checks passing (lint + typecheck + vitest + build) — proves the type extension + logic change don't regress anything else. Validates FCST-06 by construction.

## Out of scope for this phase

- Per-line YTD attribution refinements when account names diverge between prior-year and current-FY (e.g. the user renames an account mid-year). For now, match by `account_name` first, fall back to no-match (line gets target-scaled with no YTD lock). If this surfaces as a real client problem, follow-up phase.
- COGS-side per-month overrides. Today COGS in Step 3 derives from `revenue × percentOfRevenue`. If the user explicitly sets COGS per-month, that override stays. No change.
- Other wizard step changes (Step 4 Team, Step 5 OpEx, Step 6 CapEx, etc.) — pure scope discipline.
- UI changes to surface "what the math did" (e.g. a "Distributed remaining $X across N months" hint). Could land as a follow-up; not required to fix the bug.

## Plans

TBD — to be drafted by `gsd-planner` after `gsd-phase-researcher` produces RESEARCH.md.
