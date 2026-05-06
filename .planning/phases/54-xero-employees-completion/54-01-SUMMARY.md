---
phase: 54-xero-employees-completion
plan: 01
subsystem: xero-employees-import
tags: [xero, payroll, derivation, ENTEREARNINGSRATE, auto-fill]
requires:
  - phase: 52
    artifacts:
      - "xero-payroll-mapping.ts (mapXeroPayrollCalendarToFrequency, normaliseXeroEmployment, extractCompensationFromPayTemplate, XeroEmployeeApiShape)"
      - "/api/Xero/employees route — existing PayrollCalendars aggregator + per-employee detail loop"
provides:
  helpers:
    - "deriveHoursAndSalaryFromPayRun (pure, no I/O)"
    - "WEEKS_PER_PERIOD_BY_CALENDAR_TYPE constant"
    - "PERIODS_PER_YEAR_BY_CALENDAR_TYPE constant"
  api-additions:
    - "GET /api/Xero/employees response: optional `derived_from` field on each employee ('paytemplate' | 'payrun_history' | 'mixed' | undefined)"
  data-flow:
    - "PayRuns list (1 call) → up to 4 detail calls (sequential, POSTED only) → per-employee aggregate Map → derivation applied via ??= precedence (PayTemplate wins)"
affects:
  - "Step 4 (Team) wizard import path — now receives populated hours_per_week + annual_salary for ENTEREARNINGSRATE employees (e.g. all 5 sampled JDS staff)"
  - "Phase 54-02 — depends on 54-01 landing first so soft auto-fill on empty Step 4 surfaces complete data"
tech-stack:
  added: []
  patterns:
    - "Sequential extra-fetch aggregator with per-call try/catch isolation, mirroring the existing PayrollCalendars block in the same route"
    - "Pure helper module + route adapter (helper has no I/O, route does the I/O and calls helper)"
    - "Provenance hint field via optional discriminated string union ('paytemplate' | 'payrun_history' | 'mixed')"
key-files:
  created:
    - "src/__tests__/xero/xero-payroll-mapping.test.ts (15 helper tests)"
  modified:
    - "src/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping.ts (+helper, +2 constants, +derived_from on XeroEmployeeApiShape)"
    - "src/app/api/Xero/employees/route.ts (+PayRuns aggregator block, +per-employee derivation block, +derived_from field on XeroEmployee + response shape)"
    - "src/__tests__/xero/employees-route.test.ts (+empty PayRuns mock injected into 5 existing tests, +5 new tests F-J)"
    - ".planning/REQUIREMENTS.md (+Phase 54 section, +XERO-S4-PAYRUN-01, +traceability row)"
decisions:
  - "Provenance ('derived_from') is computed against the THREE derivable fields only — annualSalary, standardHours, hoursPerWeek. hourlyRate from PayTemplate alongside derived hours/salary is still 'payrun_history', because the operator-visible derived totals are the meaningful signal. The plan spec snippet implied counting hourlyRate too, but the test expectations (F and J expecting 'payrun_history' when hourly_rate is from PayTemplate) are authoritative."
  - "Calendar-change-mid-window edge case (F1): aggregate stores the FIRST non-undefined calendar per employee. If an employee switches calendars within the 4-period window (rare in normal operation), derivation uses the earlier calendar's factors. Acceptable for MVP; operator can correct in Step 4."
  - "Test file location: helper tests at src/__tests__/xero/xero-payroll-mapping.test.ts (per plan frontmatter), not bloating the existing src/__tests__/forecast/phase-52-payroll-mapping.test.ts. Keeps phase-scoped test files independently runnable."
  - "Reused the existing PayrollCalendars try/catch shape for the new PayRuns aggregator — same headers, same Bearer/tenant-id pattern, same fail-soft policy. No new infrastructure, no caching."
metrics:
  duration: "~50min (Task 1: ~15min, Task 2: ~30min, summary + traceability: ~5min)"
  completed: "2026-05-06"
  tasks_completed: 2
  tests_added: 25  # 15 helper + 5 existing route updated + 5 new route
  files_changed: 4
  commits: 4
---

# Phase 54 Plan 01: PayRun-derived hours + salary fallback — Summary

**One-liner:** AU Xero employees on `CalculationType=ENTEREARNINGSRATE` (timesheet-driven payroll, the JDS default) now return populated `hours_per_week` and `annual_salary` derived from the last 4 POSTED PayRuns, with PayTemplate values winning via `??=` precedence and a new optional `derived_from` provenance field on the response.

## What Shipped vs Plan

| Plan item | Shipped | Notes |
|---|---|---|
| `deriveHoursAndSalaryFromPayRun` helper | yes | Pure, no I/O. Exported from `xero-payroll-mapping.ts`. Handles all 7 documented edge cases (missing rate, zero rate, missing/unknown calendar, negative wages, case-insensitivity, rounding contract, JDS happy-path numbers). |
| `WEEKS_PER_PERIOD_BY_CALENDAR_TYPE` + `PERIODS_PER_YEAR_BY_CALENDAR_TYPE` constants | yes | Both exported. WEEKLY/FORTNIGHTLY/FOURWEEKLY/TWICEMONTHLY/MONTHLY/QUARTERLY all defined. |
| 15 helper unit tests | yes | All GREEN. Located at `src/__tests__/xero/xero-payroll-mapping.test.ts` per plan frontmatter (NOT in the existing Phase 52 file — kept phase-scoped). |
| PayRuns aggregator in route.ts | yes | Sits between PayrollCalendars block and Employees-list fetch. 1 list + up to 4 detail calls, sequential, POSTED-only. Per-PayRun calendar lookup (not tenant-wide). |
| Per-employee derivation block | yes | Sits inside existing loop, after `extractCompensationFromPayTemplate`. Explicit `if (X == null && derived.X != null)` guards (the explicit form of `??=`). |
| `derived_from` field on response | yes | `'paytemplate' \| 'payrun_history' \| 'mixed' \| undefined`. Optional, additive — Step4Team consumer ignores unknown fields, ForecastWizardV4 destructures only known fields. |
| 10 route integration tests (5 existing + 5 new) | yes | All GREEN. Test A URL-order assertion renumbered (urls[1]=PayRuns now). Tests B-E got an empty PayRuns mock injected; their URL assertions don't index, so no other renumbers. New tests F-J cover happy-path + DRAFT-filter + PayTemplate precedence + mixed + 403 tolerance + multi-calendar. |
| `npx tsc --noEmit` clean | yes | No errors anywhere. |
| ESLint clean on modified files | yes | Zero warnings on the 4 changed files. |
| Full xero suite green | yes | 174/174 tests passing across 18 test files. |

**Nothing deferred or skipped.** All success criteria met.

## Plan-Check Flags Status

| # | Issue | Status |
|---|---|---|
| F1 | Calendar-change-mid-window edge case | **Documented** — see Known Limitations below + inline code comment in route.ts. Acceptable for MVP. |
| F2 | `XERO-S4-PAYRUN-01` requirement registration | **Done** — added Phase 54 section to `.planning/REQUIREMENTS.md` with the requirement entry + traceability row. |
| F3 | Inspect existing tests A-E individually before renumbering | **Done** — Tests A-E read individually. Only Test A asserts URL-by-index (`urls[0]` ... `urls[2]`); Tests B-E don't index URLs. So Test A got the renumber (urls[0]=PayrollCalendars, urls[1]=PayRuns, urls[2]=Employees, urls[3]=Employees/{id}); B-E only got the mock injection. |

## New Helper Signature

```typescript
export function deriveHoursAndSalaryFromPayRun(
  avgWagesPerPeriod: number,
  hourlyRate: number | undefined,
  calendarType: string | undefined | null,
): { hoursPerWeek?: number; annualSalary?: number };
```

Returns `{}` when `calendarType` is missing/unknown OR `avgWagesPerPeriod < 0` (defensive). Returns partial `{ annualSalary }` (no hoursPerWeek) when `hourlyRate` is missing or zero (annual derivation doesn't need rate; hours derivation can't divide by zero).

## New Wire Field: `derived_from`

```typescript
// On each employee object in the GET /api/Xero/employees response:
derived_from?: 'paytemplate' | 'payrun_history' | 'mixed';
//   'paytemplate'    — all populated values came from PayTemplate / OrdinaryHoursPerWeek
//   'payrun_history' — at least one of {annual_salary, standard_hours, hours_per_week} came from PayRun derivation,
//                      AND none of those three came from PayTemplate
//   'mixed'          — at least one of those three came from PayTemplate AND derivation also contributed
//   undefined        — nothing populated at all (no PayTemplate AND no PayRun history)
```

`hourly_rate` and `calculation_type` provenance does NOT affect the classification — those fields are never derived, so their PayTemplate origin doesn't move an employee from `payrun_history` to `mixed`. The mixed-vs-payrun-history distinction reflects which of the operator-visible derivation outputs (annual_salary / standard_hours / hours_per_week) are estimates vs explicit Xero values.

## Known Limitations (Documented)

1. **Calendar-change mid-window (F1).** If an employee switches pay calendars within the 4-period sample window (e.g. weekly → fortnightly mid-month), the aggregate stores the FIRST non-undefined calendar it sees. Derivation uses that calendar's factors for the whole window, which may produce inflated/deflated hours. Rare in normal operation; operator corrects manually in Step 4.
2. **Multiple earnings lines per employee.** Some employees have multiple OrdinaryEarnings lines (e.g. trade rate + admin rate). The PayRun's `Wages` field aggregates BOTH, but we use the primary line's `RatePerUnit` for the hours derivation. Result: hours may be slightly inflated. Operator corrects manually. Future enhancement: weight by line count.
3. **Bonuses / overtime / leave loading.** These inflate `Wages` for the affected periods. Mitigated by the 4-period averaging but not eliminated. Acceptable for MVP per research §10.
4. **New hires with no recent PayRuns.** Employees who started after the last 4 POSTED runs will have no aggregate. Derivation produces nothing; the wizard import path falls back to its existing manual-entry behaviour (empty hours/salary fields).

## Post-Deploy Verification Checklist

- [ ] **PENDING — manual verification after PR merge + Vercel deploy:** Re-run the JDS diag (or curl `/api/Xero/employees?business_id=fea253dd-3dfa-447b-8f9b-8dff68aeac0a` with the JDS production token).
  - [ ] Confirm Alex Howard returns `hours_per_week ≈ 37.5` (within ±0.05) and `annual_salary === 164814`.
  - [ ] Confirm Alon Nir, Andrew Anderson, Bernadette Unatan, Caleb Parker match research §3 table.
  - [ ] Confirm any salaried JDS employee (if any) still returns the PayTemplate `AnnualSalary` value untouched (`derived_from === 'paytemplate'`).
  - [ ] Confirm `derived_from` field appears in response JSON (smoke check).
- [ ] **CI green** (vitest + tsc + eslint + build) on the PR before merge.

## Forward-Looking Note

Phase 54-02 will consume the now-populated `hours_per_week` and `annual_salary` for soft auto-fill on empty Step 4 (when `state.teamMembers.length === 0` AND business has an active Xero connection). The `derived_from` field can drive a tooltip differentiating PayTemplate-explicit values from PayRun-derived estimates (operator hint that derived values are 4-period averages and may include bonus/leave noise — directing them to verify the auto-filled rows before committing).

No dependency on prior Phase 54 plans (this is the first plan in the phase). Builds directly on Phase 52's `xero-payroll-mapping` helper module + the existing PayrollCalendars join in `route.ts`.

## Commits

| Hash    | Type | Scope | Description |
|---------|------|-------|-------------|
| d992fa4 | test | 54-01 | RED: 15 failing helper tests for derive + period factors |
| ad7746f | feat | 54-01 | GREEN: helper + constants + `derived_from` on `XeroEmployeeApiShape` |
| a060fa6 | test | 54-01 | RED: 5 existing route tests updated, 5 new tests F-J added |
| 6b0cf4c | feat | 54-01 | GREEN: PayRuns aggregator + per-employee derivation + `derived_from` field on route response |

(SUMMARY.md + REQUIREMENTS.md + STATE.md updates committed separately as the metadata commit.)

## PR

[#114 — feat(54-01): derive Xero employee hours + salary from PayRun history](https://github.com/Wisdomcg-ai/wisdom-business-intelligence/pull/114) — opened 2026-05-06 against `main`. Branch: `feat/54-01-payrun-derived-hours-salary`. Awaiting CI.

## Self-Check: PASSED

Verified post-completion:
- `src/__tests__/xero/xero-payroll-mapping.test.ts` — FOUND
- `src/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping.ts` — FOUND (modified)
- `src/app/api/Xero/employees/route.ts` — FOUND (modified)
- `src/__tests__/xero/employees-route.test.ts` — FOUND (modified)
- `.planning/phases/54-xero-employees-completion/54-01-SUMMARY.md` — FOUND
- `.planning/REQUIREMENTS.md` — FOUND (modified, +XERO-S4-PAYRUN-01 + traceability row)

Commits verified in `git log`:
- d992fa4 — test RED helper
- ad7746f — feat GREEN helper
- a060fa6 — test RED route
- 6b0cf4c — feat GREEN route

Test runs:
- `npx vitest run src/__tests__/xero/xero-payroll-mapping.test.ts` — 15/15 passing
- `npx vitest run src/__tests__/xero/employees-route.test.ts` — 10/10 passing
- `npx vitest run src/__tests__/xero/` — 174/174 passing across 18 files
- `npx vitest run src/__tests__/forecast/phase-52-payroll-mapping.test.ts` — 100/100 passing (no regression in Phase 52 helper coverage)
- `npx tsc --noEmit -p tsconfig.json` — clean
- `npx eslint` on 4 changed files — clean
