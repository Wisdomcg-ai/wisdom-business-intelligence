# Phase 54 — Xero Employee Import Completion

## Goal

Step 4 (Team) Xero import returns **complete employee data** — name, rate, **hours/week**, **annual salary**, pay frequency, employment type — for all common AU payroll setups. And it surfaces **automatically** when a Xero connection has employees the wizard hasn't seen, instead of requiring the user to know to click "Import from Xero."

After this phase, opening Step 4 on a Xero-connected business with an empty wizard fills the team table from Xero on first render. On subsequent opens with existing wizard data, a non-blocking banner surfaces any new employees Xero has gained since the last import.

## Why now

JDS testing 2026-05-06 surfaced two gaps:
1. **Hours don't pull through.** Diagnostic confirmed Xero genuinely doesn't store hours per-employee for tenants using `CalculationType=ENTEREARNINGSRATE` (timesheet-driven payroll) — the helper isn't broken, the data isn't there.
2. **Annual salary is empty.** Same root cause — `PayTemplate.AnnualSalary` is undefined for hourly employees; only `RatePerUnit` is set.

But the data IS derivable from `/PayRuns` history. Diag confirmed:
- Wages from recent payslips ÷ rate ÷ weeks-per-period = hours/week (37.5 for all 5 sampled JDS employees, matching expected full-time)
- Wages × periods-per-year = annual salary (~$164k for Alex Howard at $84.52/hr)

User also requested auto-import. Best-practice answer: not full auto-import (overwrites user customization, surprising), but **soft auto-fill on empty Step 4** + **new-employees banner** on subsequent loads. The discoverable-but-safe pattern.

## Scope (2 plans)

### 54-01 — Pay-run-derived hours + salary fallback
- Extend `/api/Xero/employees` route to fetch the last 4 POSTED PayRuns once per import.
- Aggregate per-employee `Wages` totals across those runs.
- After existing PayTemplate + OrdinaryHoursPerWeek extraction, **fall back** to deriving:
  - `hoursPerWeek = avgWages / rate / weeksPerPeriod` (only when `CalculationType` is hourly and rate > 0)
  - `annualSalary = avgWages × periodsPerYear` (only when PayTemplate didn't already supply it)
- Cost: +5 HTTP calls per import (1 list + 4 detail). Well within Xero's 60/min.
- Edge cases: bonuses/leave dilute via multi-period average; new hires with no recent payruns → leave blank.

### 54-02 — Soft auto-fill on empty Step 4 + new-employees banner
- On Step 4 mount, if `state.teamMembers.length === 0` AND business has an active Xero connection, **silently auto-fetch from /employees** and populate. No modal, no surprise — the wizard was empty.
- On subsequent mounts where `state.teamMembers.length > 0`, **fetch /employees in background**, diff against existing wizard members (use the existing `_xeroEmployeeId` provenance), and if there are unimported employees, show a non-blocking banner: *"3 new employees in Xero — review."* Click → opens the existing import modal pre-checked to only the new ones.
- The "Import from Xero" button stays for explicit re-imports.

## Out of scope

- Pay-run timesheet integration (deeper integration with Xero timesheets — separate phase).
- Re-import reconciliation for existing employees (Phase 52-02 already shipped this; 54-02 only handles "new since last import").
- Automatic salary/hours updates on subsequent imports if rates change — out of scope; user must explicitly re-import to refresh.

## Success criteria

After this phase:
- Open Step 4 on JDS (empty wizard, Xero connected) → table populates with all 18 employees, each with **hours/week populated** (e.g. 37.5) and **annual salary populated** (e.g. ~$164k for Alex).
- Add a new employee in Xero → reload Step 4 → banner appears: "1 new employee in Xero — review." Click → modal opens with that one employee pre-checked.
- Manually customize a wizard team member (override salary, mark for termination) → reload Step 4 → customization preserved, no auto-overwrite.

## Dependencies / sequencing

- 54-01 ships first (auto-fill in 54-02 is more useful when imported data is complete).
- Neither blocks Phase 53 followups.

## Effort estimate

- 54-01: ~2h code + ~1h tests
- 54-02: ~3h code + ~1h tests
- Total: ~half day

## Verification

- 54-01: re-run the JDS diag against the deployed route, confirm `hours_per_week` and `annual_salary` populated for the 5 ENTEREARNINGSRATE employees.
- 54-02: open Step 4 on a fresh JDS forecast (clear localStorage) → confirm auto-populate. Add a new employee in Xero (or simulate) → reload → confirm banner.
