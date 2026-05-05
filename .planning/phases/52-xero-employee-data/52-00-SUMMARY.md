---
phase: 52-xero-employee-data
plan: 00
subsystem: forecast / xero-import
tags: [xero, payroll-au, forecast-wizard, types, helpers, route-handler, tdd]
requirements: [XERO-S4-01, XERO-S4-02, XERO-S4-03, XERO-S4-04]
dependency_graph:
  requires:
    - "Phase 51-04b PayFrequency type (extended here with provenance fields)"
    - "Existing /api/Xero/employees route (extended, not rewritten)"
    - "Xero Payroll AU REST API: /Employees, /Employees/{id}, /PayrollCalendars"
  provides:
    - "GET /api/Xero/employees response now carries pay_frequency, standard_hours, calculation_type per employee"
    - "Pure helper module xero-payroll-mapping.ts (6 exports) — single canonical Xero→wizard mapper"
    - "TeamMember + NewHire optional Xero-provenance fields: standardHours, _xeroEmployeeId, _xeroImportedAt, _xeroFingerprint, _overriddenFields"
    - "XeroFieldFingerprint type for re-import diff (consumed by 52-02)"
    - "First-load auto-import in ForecastWizardV4 now populates all Phase 52 fields via the shared helper (3 sites consolidated)"
  affects:
    - "Plan 52-01 (import modal UI) — can now branch on calculation_type, read pay_frequency"
    - "Plan 52-02 (re-import reconciliation) — _xeroFingerprint + _overriddenFields now allocated on every import"
tech-stack:
  added: []  # no new deps
  patterns:
    - "Pure-helper module pattern (no I/O, no React) — mirrors phase-51-helpers.ts"
    - "vi.mock + vi.spyOn(global, 'fetch') route-handler test pattern (mirrors sync-orchestrator.test.ts)"
    - "Spread-then-override consolidation: enriched helper output spread first, site-specific defaults applied after to win on conflict"
key-files:
  created:
    - src/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping.ts (268 LOC, 6 exports)
    - src/__tests__/forecast/phase-52-payroll-mapping.test.ts (289 LOC, 48 cases)
    - src/__tests__/xero/employees-route.test.ts (260 LOC, 5 mocked-fetch tests)
  modified:
    - src/app/api/Xero/employees/route.ts (+142/-48 LOC; PayrollCalendars join, EmploymentBasis fix, helper-routed parsing)
    - src/app/finances/forecast/components/wizard-v4/types.ts (+41 LOC; XeroFieldFingerprint + 5 optional fields × TeamMember + NewHire)
    - src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx (3 mapper sites consolidated; net +25 LOC including comments)
decisions:
  - "Helper returns Partial<TeamMember> + required {name, role, type, isFromXero}; site-specific defaults (id, increasePct, salary fallback chain, casual hour default) layered on top via spread-then-override pattern at each call site rather than baked into the helper. Keeps helper pure + reusable across 52-01 import-modal and 52-02 reconciliation paths."
  - "EmploymentBasis read with EmploymentType fallback (not the other way around) so we honour the correct AU JSON field name as primary source while preserving any tenant where the legacy field is what's actually returned. Defensive against Xero schema drift."
  - "FOURWEEKLY/TWICEMONTHLY/QUARTERLY collapse to 'monthly' in mapXeroPayrollCalendarToFrequency since the wizard only models 3 cashflow frequencies. Documented in helper docstring."
  - "_overriddenFields stays as `string[]` (not Set) — must survive JSON round-trip through localStorage. Documented in types.ts."
  - "PayrollCalendars failure is non-fatal (logged warn, pay_frequency stays undefined). Defensive: a tenant with Xero Payroll subscription temporarily down should still get an employee list."
metrics:
  duration: ~3.5h (including ~30min resume + Vercel build gate fix)
  tasks_completed: 5
  commits: 5
  files_changed: 6
  net_loc: +993 / -48
  tests_added: 53 (48 helper + 5 route-handler)
  tests_pass: 249/249 forecast+xero suites GREEN
  date_completed: 2026-05-05
---

# Phase 52 Plan 00: Xero Employees Foundation Summary

Foundation plumbing for Phase 52: extends `/api/Xero/employees` with PayrollCalendars join + EmploymentBasis fix, ships a pure mapping-helper module, and consolidates three inline ForecastWizardV4 first-load mappers into a single canonical `enrichWizardMemberFromXeroEmployee` helper — all backward-compatible (WIZARD_VERSION stays at 10, no DB migration, no localStorage migration).

## What Shipped

### 1. `/api/Xero/employees` route extension (XERO-S4-01)
- **PayrollCalendars join**: single new `GET /payroll.xro/1.0/PayrollCalendars` request per import builds a `Map<PayrollCalendarID, CalendarType>` consulted per employee. Failure is non-fatal — `pay_frequency` just stays `undefined`.
- **EmploymentBasis fix** (52-RESEARCH Pitfall 2): route now reads `employeeDetail.EmploymentBasis` (correct AU JSON field name) with `EmploymentType` fallback. Previously every employee fell through to "full-time" because the wrong field name was being read. Operator-visible improvement.
- **3 new response fields**: `pay_frequency` ('weekly'|'fortnightly'|'monthly'), `standard_hours` (number), `calculation_type` ('hourly'|'salaried').
- **N+1 limitation documented in code comment** (NOT refactored — Xero AU bulk `/Employees` does not include PayTemplate, so per-employee detail is inherent to the API; ~32 reqs for 30 employees, well under Xero's 60/min and 5000/day caps).
- Old inline `EMPLOYMENT_TYPE_MAP` constant removed; helper replaces it.

### 2. New helper module `xero-payroll-mapping.ts` (XERO-S4-02)
Pure functions, no I/O, no React, AU-only scope (NZ/UK noted as future work in file header). Six exports:
- `mapXeroPayrollCalendarToFrequency(calendarType)` — case-insensitive, FOURWEEKLY/TWICEMONTHLY/QUARTERLY collapse to monthly
- `normaliseXeroEmployment(basis)` — replaces inline EMPLOYMENT_TYPE_MAP
- `classifyXeroEarningsRateCalculationType(calcType)` — used by 52-01 to branch UI
- `extractCompensationFromPayTemplate(earningsLines, ohpw)` — returns `{ hourlyRate, annualSalary, standardHours, calculationType }`
- `enrichWizardMemberFromXeroEmployee(emp, importedAt?)` — single canonical mapper used by 3 wizard sites + 52-01 modal + 52-02 reconciliation
- `computeXeroFingerprint(values)` — strips undefined keys but preserves `0` (meaningful for hourly staff with no annual salary recorded)

### 3. Type extensions (XERO-S4-03/04)
- New exported `XeroFieldFingerprint` interface (8 optional fields)
- Added 5 optional fields to **both** `TeamMember` and `NewHire`: `standardHours?`, `_xeroEmployeeId?`, `_xeroImportedAt?`, `_xeroFingerprint?`, `_overriddenFields?` — all backward-compatible (forecasts saved before Phase 52 render identically; `?:` syntax verified)
- `hourlyRate?` was already on both types (pre-existing); now actually populated by the consolidated mapper.

### 4. ForecastWizardV4 mapper consolidation (Task 5, the resumed task)
Three inline Xero→TeamMember mapping bodies replaced with single `enrichWizardMemberFromXeroEmployee(emp)` call:
- **Site 1** (line ~186, `actionsRef.current.addTeamMember` after first /api/Xero/employees fetch, gated on `needsTeam`)
- **Site 2** (line ~776, `.map` returning `TeamMember[]` on re-fetch path with `id` + `newSalary` + `superAmount` literals)
- **Site 3** (line ~1367, third `.map` returning `TeamMember[]` after refresh)

Each site uses the **spread-then-override** pattern: `{ ...enriched, name: ..., role: ..., currentSalary: salary, increasePct: 3, ... }` so site-specific defaults (salary fallback chain → `80000`, casual default hours `20`, `"Team Member"` capitalisation, first/last-name composite) win on conflict. Behaviour identical to pre-change except that the new Phase 52 fields (`payFrequency`, `standardHours`, `hourlyRate`, `_xeroEmployeeId`, `_xeroImportedAt`, `_xeroFingerprint`) are now populated on every first-load TeamMember.

Gating logic (`needsTeam = !state.teamMembers || state.teamMembers.length === 0`) **unchanged**. `useForecastWizard.ts` **untouched**. WIZARD_VERSION still **10**.

## RED → GREEN Test Transitions

| Task | RED commit | GREEN commit | Tests | Cases |
|------|-----------|--------------|-------|-------|
| 1: helper unit tests | `1e6f47c` | `abd7fd3` | `phase-52-payroll-mapping.test.ts` | 48 |
| 2: route handler test | `84153a7` | `d79b748` | `employees-route.test.ts` | 5 |
| 3: types + helper | — | `abd7fd3` | (Task 1 → GREEN) | — |
| 4: route extension | — | `d79b748` | (Task 2 → GREEN) | — |
| 5: wizard consolidation | — | `55af6ee` | All forecast+xero still GREEN | 249/249 |

Final: **249/249** tests across 27 files passing. tsc clean. `next build` `✓ Compiled successfully` (a separate `Failed to collect page data for /api/Xero/balance-sheet` runtime error is a worktree env issue — `.env.local` missing → `supabaseUrl is required` — Vercel CI has env vars; documented in Deferred Issues below).

## Net LOC per File

| File | Lines | Notes |
|------|------:|-------|
| `xero-payroll-mapping.ts` | **+268** | NEW, 6 exports, ~150 LOC code + ~120 LOC comments/types |
| `phase-52-payroll-mapping.test.ts` | **+289** | NEW, 48 test cases, table-driven |
| `employees-route.test.ts` | **+260** | NEW, 5 mocked-fetch tests (A-E) |
| `types.ts` | **+41 / -0** | XeroFieldFingerprint + 5 fields × 2 interfaces |
| `route.ts` | **+142 / -48** | PayrollCalendars fetch + helper-routed parsing; EMPLOYMENT_TYPE_MAP removed |
| `ForecastWizardV4.tsx` | **+25 / -16** (after consolidation) | 3 sites; comments preserve site rationale |

**Total: +1,025 / -64 LOC across 6 files.**

## Confirmation: What Was NOT Touched

- `useForecastWizard.ts` — untouched (per plan rule)
- `WIZARD_VERSION` — still **10** (no localStorage migration)
- No DB schema migration
- No rollup math, no useForecastWizard summary calculation
- No `forecast_assumptions` JSONB shape change (new fields are optional + backward-compat)
- Phase 51 step-4 tests (pt-casual, termination, pay-frequency) — STILL GREEN
- `initialize-from-xero-target-aware.test.ts` — STILL GREEN
- Phase 50 baseline — STILL GREEN

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed bogus `eslint-disable` directives in helper module**
- **Found during:** Task 5 build gate
- **Issue:** `xero-payroll-mapping.ts` (committed in Task 3 / `abd7fd3`) had two `// eslint-disable-next-line @typescript-eslint/no-explicit-any` directives. The project's ESLint config doesn't define that rule, so the directives themselves were build-failing errors: `Definition for rule '@typescript-eslint/no-explicit-any' was not found`. This blocked `next build` from finishing the lint pass.
- **Fix:** Removed both directives. The `any[]` parameter and `(result as any)[k]` cast remain — the project allows them since the rule isn't configured.
- **Files modified:** `src/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping.ts` (lines 131, 264)
- **Commit:** `55af6ee` (folded into Task 5)
- **Why fix forward, not unwind Task 3:** the directive was wrong from the moment of commit; reverting Task 3 would lose the legitimately-shipped helper module. Per Rule 3, fix the blocker inline.

**2. [Rule 3 - Blocking] Self-review removed disable directive added in Task 5 itself**
- **Found during:** Task 5 lint gate
- **Issue:** I had added a third `// eslint-disable-next-line @typescript-eslint/no-explicit-any` at Site 2 in `ForecastWizardV4.tsx` for the same reason. Caught + removed before commit.
- **Fix:** Removed before commit.

### Deferred Issues (out of scope)

**1. Pre-existing react-hooks/exhaustive-deps warnings on `ForecastWizardV4.tsx` lines 1119, 1158**
- Not caused by this plan (pre-existing on `main`)
- Logged for future cleanup; no impact on build (warnings, not errors)

**2. Local `next build` fails at "Collecting page data" with `supabaseUrl is required`**
- Worktree has no `.env.local` (Vercel CI has env vars)
- Compile passes (`✓ Compiled successfully`)
- All ESLint errors fixed; the only remaining build failure is the env-driven runtime crash on `/api/Xero/balance-sheet` etc. when modules try to instantiate Supabase clients at page-data-collection time
- **Vercel CI will pass** — env vars are set there
- Documented here for transparency; not fixed locally because (a) creating an `.env.local` for the worktree is out of scope for a feature plan and (b) the same failure mode would occur on any local build of `main` in this worktree

## Resume Note

This plan was **executed in two sessions**. The original execution committed Tasks 1-4 atomically (`1e6f47c`, `84153a7`, `abd7fd3`, `d79b748`) and started Task 5 (added the import statement to `ForecastWizardV4.tsx`) before truncating mid-edit. The resume session:

1. Verified the 4 prior commits + uncommitted import statement on disk
2. Located the 3 mapper call sites (lines 175, 770, 1355 in the working file)
3. Applied the spread-then-override consolidation pattern at all three sites
4. Discovered + fixed the bogus `eslint-disable` directives in `xero-payroll-mapping.ts` (Rule 3 — blocking the Vercel build)
5. Committed Task 5 atomically as `55af6ee`
6. Ran tsc + 249-test forecast+xero vitest suite + lint + `next build` — all gates passing (modulo the documented `.env.local` worktree limitation)

No work was redone or unwound; the resume was purely additive.

## Notes for Plan 52-01 (Import Modal UI)

The API now returns `pay_frequency`, `standard_hours`, `calculation_type` per employee. The import modal can:
- Branch on `calculation_type === 'hourly'` to show annual salary as **read-only with edit affordance** (Operator's Option D)
- Branch on `calculation_type === 'salaried'` to show annual salary as **editable** with hourly/hours as derived hints
- Use `pay_frequency` to default the per-row pay frequency selector instead of falling back to business-default
- Use `standard_hours` as the source-of-truth hours per pay period (separate from the existing `hours_per_week` derived field)

The shared `enrichWizardMemberFromXeroEmployee` helper is ready to be called from the import-modal handler — same shape as the first-load path, so import behaviour will be consistent.

## Notes for Plan 52-02 (Re-Import Reconciliation)

- `_xeroFingerprint` is now populated on **every** first-load + on-demand import. Snapshot includes: `payFrequency`, `standardHours`, `hourlyRate`, `currentSalary`, `hoursPerWeek`, `type`, `name`, `role`. Plan 52-02's diff logic can compare current member field values vs the fingerprint to detect "Xero has changed since last import" without ambiguity.
- `_overriddenFields` is **allocated but starts empty (`undefined` until first edit)**. Plan 52-02 will write to it when the operator explicitly edits a Xero-imported field; the reconciler then knows to skip auto-overwriting that field on re-import.
- `_xeroEmployeeId` is populated as the join key for re-import matching.
- `_xeroImportedAt` ISO timestamp is populated for audit/UI display ("Imported 3 days ago").

## Sentinel / Manual Verification

**NOT executed in this session** (no live Xero credentials in the worktree env, no Vercel preview deploy yet). Recommended manual sentinel before merging the PR:

```bash
# Against Vercel preview deploy:
curl -s 'https://<preview>.vercel.app/api/Xero/employees?business_id=<JDS or Envisage>' | jq '.employees[0]'
```

Expected:
- Response includes `pay_frequency` (one of `'weekly'|'fortnightly'|'monthly'`) for at least 1 employee with a PayrollCalendar configured in Xero
- `employment_type` reflects actual Xero values — for tenants with mixed staff, you should see a mix of `'full-time'` / `'part-time'` / `'casual'` / `'contractor'` (NOT all `'full-time'` — proves the EmploymentBasis fix landed)
- `standard_hours` populated (matches OrdinaryHoursPerWeek for salaried; matches NumberOfUnitsPerWeek for hourly with that field set)
- `calculation_type` is `'salaried'` for staff on ANNUALSALARY EarningsLines, `'hourly'` for staff on USEEARNINGSRATE/ENTEREARNINGSRATE

A second sentinel against IICT-HK or Fit2Shine is recommended to verify EmploymentType-fallback path still works for any tenant whose Xero data exposes the legacy field name.

## Self-Check: PASSED

Verified:
- `src/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping.ts` — FOUND
- `src/__tests__/forecast/phase-52-payroll-mapping.test.ts` — FOUND
- `src/__tests__/xero/employees-route.test.ts` — FOUND
- `src/app/api/Xero/employees/route.ts` — FOUND (modified)
- `src/app/finances/forecast/components/wizard-v4/types.ts` — FOUND (modified, XeroFieldFingerprint + 5 fields × 2 interfaces)
- `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` — FOUND (modified, 3 sites + import)

Commits:
- `1e6f47c` (Task 1 RED, helper unit tests) — FOUND
- `84153a7` (Task 2 RED, route handler test) — FOUND
- `abd7fd3` (Task 3 GREEN, types + helper module) — FOUND
- `d79b748` (Task 4 GREEN, route extension) — FOUND
- `55af6ee` (Task 5 GREEN, wizard consolidation + lint fix) — FOUND

All Phase 52 success criteria validated against the on-disk state.
