# Phase 54 — Research

Research for this phase was done via direct diagnostic against JDS production data 2026-05-06. This document captures findings the planners need.

## Findings

### Finding 1: PayTemplate.NumberOfUnitsPerWeek is empty for ENTEREARNINGSRATE employees

Confirmed via `scripts/diag-jds-xero-employees.ts`-style diagnostic for 3 sampled JDS employees (Alex Howard, Alon Nir, Andrew Anderson). All show:

```
Detail.OrdinaryHoursPerWeek: undefined
Detail.EmploymentBasis: undefined
PayTemplate.EarningsLines[0]: { CalculationType: "ENTEREARNINGSRATE", RatePerUnit: <rate> }
  // No NumberOfUnitsPerWeek field
  // No NumberOfUnits field
  // No AnnualSalary field
```

**Implication**: existing `extractCompensationFromPayTemplate` helper has nothing to extract from these templates — it correctly returns hours=undefined, salary=undefined. The data simply isn't stored at the template level for this calculation type.

### Finding 2: PayRun payslips have Wages, derivation is reliable

Confirmed via direct diagnostic against `/payroll.xro/1.0/PayRuns/{id}` for the most recent 4 POSTED runs. Per-payslip data shape:

```json
{
  "EmployeeID": "9bd33590-...",
  "PayslipID": "a577e256-...",
  "FirstName": "Alex",
  "LastName": "Howard ",
  "EmployeeGroup": "*Support Projects Dept",
  "Wages": 6339,
  "Deductions": 0,
  "Tax": 1756,
  "Super": 760.68,
  "Reimbursements": 0,
  "NetPay": 4583,
  "UpdatedDateUTC": "/Date(1777850890000+0000)/"
}
```

`Wages` is the gross earnings for the period. NOT NetPay (post-tax). NOT Tax+Wages.

### Finding 3: Derivation math validated for 5 employees

| Employee | Cal | Rate | Avg Wages/period (4 periods) | Calculated hrs/wk | Calculated annual |
|---|---|---|---|---|---|
| Alex Howard | FORTNIGHTLY | 84.52 | $6,339 | 37.5 | $164,814 |
| Alon Nir | FORTNIGHTLY | 56.00 | $4,200 | 37.5 | $109,200 |
| Andrew Anderson | FORTNIGHTLY | 79.24 | $5,943 | 37.5 | $154,518 |
| Bernadette Unatan | FORTNIGHTLY | 33.34 | $2,501 | 37.5 | $65,013 |
| Caleb Parker | FORTNIGHTLY | 43.40 | $3,280 | 37.8 | $85,267 |

Math:
- `weeksPerPeriod = { WEEKLY: 1, FORTNIGHTLY: 2, MONTHLY: 4.33 }[CalendarType]`
- `periodsPerYear = { WEEKLY: 52, FORTNIGHTLY: 26, MONTHLY: 12 }[CalendarType]`
- `hoursPerWeek = (avgWagesPerPeriod / rate) / weeksPerPeriod`
- `annualSalary = avgWagesPerPeriod * periodsPerYear`

The 37.5 hrs/wk is exactly what JDS expects for full-time (FT week = 38h with 0.5h paid lunch break, common AU convention).

### Finding 4: /Payslip/{id} endpoint requires extra scope

Direct GET on `/payroll.xro/1.0/Payslip/{id}` returns 401 `AuthorizationUnsuccessful` for our current scope set. We do NOT need this endpoint — the Wages field on the PayRun payslip summary is sufficient. Don't request additional payslip scope.

### Finding 5: PayRuns endpoint shape

```
GET /payroll.xro/1.0/PayRuns?order=PayRunPeriodEndDate%20DESC
→ { "PayRuns": [ { "PayRunID": "...", "PayRunPeriodStartDate": "/Date(.../)/", "PayRunPeriodEndDate": "/Date(.../)/", "PayRunStatus": "POSTED" }, ... ] }
```

Filter by `PayRunStatus === 'POSTED'` — DRAFT runs aren't real data. The list endpoint returns ~10 most recent by default.

```
GET /payroll.xro/1.0/PayRuns/{PayRunID}
→ { "PayRuns": [ { ...same fields..., "Payslips": [ {EmployeeID, PayslipID, FirstName, LastName, Wages, Tax, Super, NetPay, ...}, ... ] } ] }
```

One detail call returns ALL payslips for that pay run. So for 18 employees, 1 detail call = 18 payslips.

### Finding 6: Cost accounting

Per import, current state: 1 (list /Employees) + 1 (PayrollCalendars) + 18 (per-employee detail) = **20 calls** for an 18-employee tenant.

After 54-01: +1 (list /PayRuns) + 4 (detail per recent PayRun) = **+5 calls** = **25 total**.

Xero rate limits: 60 calls/min, 5000/day. Comfortable margin.

### Finding 7: Sequential, not parallel

The existing /employees route already does sequential per-employee fetches. The new PayRuns fetches should be done before the per-employee loop, sequentially (4 PayRun calls), to avoid rate-limit pressure spikes. The aggregator builds a `Map<EmployeeID, PerEmployeeAggregate>` once, then the per-employee loop reads from it.

## Auto-fill UX research (for 54-02)

### Finding 8: Step4Team.tsx already has the import logic isolated

The existing `openXeroImport` function (Step4Team.tsx:1434) and `importSelectedXeroEmployees` (line 1515) are reusable. The auto-fill in 54-02 should call the same fetch endpoint and the same enrichment helper (`enrichWizardMemberFromXeroEmployee`) — don't duplicate the import path.

### Finding 9: _xeroEmployeeId provenance already exists

Per Phase 52-01 SUMMARY: imported employees carry `_xeroEmployeeId`, `_xeroImportedAt`, `_xeroFingerprint` provenance fields. 54-02's diff logic to identify "new since last import" can compare Xero's full employee list against `state.teamMembers.filter(m => m._xeroEmployeeId)` and surface employees whose `EmployeeID` isn't in the local set.

### Finding 10: Empty-state detection is reactive, not on mount

Looking at Step4Team.tsx:1424: `hasXeroConnection` starts `true`, downgrades to `false` only on 404. So 54-02's auto-fill check should NOT call /employees on mount unconditionally — it should be gated behind `state.teamMembers.length === 0` AND `hasXeroConnection !== false`. The first /employees call also serves as the connection probe.

## Unknowns / deferrals

- For employees with NO recent pay runs (new hires in their first pay period), derivation will produce undefined. UX should show empty hours field with the existing manual-entry path. No special handling beyond "derivation returns undefined → wizard import path falls back to existing behavior."
- For employees with multiple earnings lines (Andrew Anderson had 2 in the diag — primary at $79.24, secondary with no rate). The `Wages` field aggregates both. Using the primary line's rate gives a slightly elevated hours number. For 54-01 this is acceptable (the user can correct in Step 4 manually) but worth a comment in code. Future enhancement: weight by line count.
- Bonuses, overtime, leave loading inflate `Wages` for affected periods. Mitigated by 4-period average. Acceptable for MVP.
