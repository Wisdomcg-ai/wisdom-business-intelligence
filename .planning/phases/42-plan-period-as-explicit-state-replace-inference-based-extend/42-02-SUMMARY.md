---
phase: 42-plan-period-as-explicit-state-replace-inference-based-extend
plan: "02"
subsystem: goals-wizard
tags: [hook-refactor, plan-period, ui, banner, modal, phase-14-bug-fix, role-guard-removal]
dependency_graph:
  requires:
    - 42-01-SUMMARY.md (helpers + service + API + columns)
  provides:
    - src/app/goals/components/PlanPeriodBanner.tsx (PlanPeriodBanner component)
    - src/app/goals/components/PlanPeriodAdjustModal.tsx (PlanPeriodAdjustModal component)
    - src/app/goals/components/step1/types.ts (PlanPeriodForLabel type, refactored getYearLabel)
    - src/app/goals/hooks/useStrategicPlanning.ts (date-driven plan period resolution; planStartDate/planEndDate/year1EndDate state)
  affects:
    - Plan 42-03 (test surface for refactored hook + UI)
key_decisions:
  - Role guard `ownerUser === user.id` removed entirely from useStrategicPlanning.ts (REQ-42-06 sentinel)
  - Three new useState hooks (planStartDate, planEndDate, year1EndDate) added alongside legacy ExtendedPeriodInfo state — both populated from a single derivePeriodInfo() call so coach view and owner view see identical state
  - Three resolution branches: persisted (load from DB), new plan (suggestPlanPeriod), legacy (fallback to suggestPlanPeriod) — all branches are role-agnostic
  - getYearLabel signature changed from `(idx, yearType, currentYear, extendedPeriodInfo)` to `(idx, yearType, planPeriod?)` — currentYear and extendedPeriodInfo arguments removed
  - PlanPeriodForLabel includes fiscalYearStart so getFiscalYear() can derive FY labels correctly without needing global FY config
  - getYearLabel uses defensive `Year ${idx}` fallback when planPeriod is undefined (initial render before hook load)
  - PlanPeriodBanner uses amber palette (bg-amber-50/border-amber-200/text-amber-700) for high visibility but consistent with brand-orange CTA accent
  - PlanPeriodAdjustModal v1 clamps Year 1 length to [12, 15] months per 42-RESEARCH.md Open Question 1
  - Reset-to-suggestion in modal calls suggestPlanPeriod(new Date(), fiscalYearStart) and writes returned dates to local component state — user can still edit before pressing Save
  - Pitfall 5 warning rendered inline in modal (amber Note box) about hidden current_remainder when switching to standard
  - extendedPeriodInfo prop preserved on Step1GoalsAndKPIs for one release of dual-prop-write — old downstream consumers unchanged
  - Coach goals page Step 1 render block now passes BOTH extendedPeriodInfo (Phase 14 bug fix per Pitfall 2) AND planPeriod/rationale/onPlanPeriodChange (Phase 42)
  - CoreMetricsSection and KPISection (which also import getYearLabel) updated to accept and propagate planPeriod prop — visual parity with FinancialGoalsSection preserved
metrics:
  duration: ~12 minutes
  completed: "2026-04-27T05:42:00Z"
  tasks_completed: 7
  tasks_total: 7
  files_created: 2
  files_modified: 7
---

# Phase 42 Plan 02: Plan Period UI + Hook Refactor Summary

**One-liner:** Replaced inference-based extended-period detection in useStrategicPlanning with date-driven resolution from persisted Phase 42 columns; added PlanPeriodBanner + PlanPeriodAdjustModal Step 1 UI; refactored getYearLabel to read planPeriod dates instead of new Date(); fixed Phase 14 coach-page bug where extendedPeriodInfo prop wasn't being passed.

## What Was Built

### Task 1 — Hook refactor (c55e20e)
- Replaced lines 744-771 detection block with new "Plan Period Resolution (Phase 42)" block (52 LOC)
- Removed role guard `ownerUser === user.id` — coach view and owner view now follow identical resolution path (REQ-42-06)
- Added 3 useState hooks: `planStartDate`, `planEndDate`, `year1EndDate` — populated from persisted columns OR suggestPlanPeriod() OR legacy fallback
- Used derivePeriodInfo() to compute legacy ExtendedPeriodInfo state (zero breaking changes downstream)
- Wired planPeriod into saveViaApi body and FinancialService.saveFinancialGoals 8th positional arg
- Exposed planStartDate/planEndDate/year1EndDate (and setters) plus markDirty in hook return
- Removed unused imports (`isNearYearEnd`, `getMonthsUntilYearEnd`, `ExtendedPeriodInfo`)

### Task 2 — PlanPeriodBanner component (2acb2a7)
- New file `src/app/goals/components/PlanPeriodBanner.tsx` (61 LOC)
- Pure presentational: amber banner with Calendar icon, date range (`Apr 2026 → Jun 2029 · Year 1 is 14 months`), rationale text, and orange-bordered Adjust button
- Both named export `PlanPeriodBanner` and default export
- Renders the "→" character literally (REQ-42-03 sentinel)

### Task 3 — PlanPeriodAdjustModal component (a312324)
- New file `src/app/goals/components/PlanPeriodAdjustModal.tsx` (144 LOC)
- Three `<input type="date">` inputs (planStart, year1End, planEnd) with controlled-state local copies
- v1 clamp: `year1Months < 12 || year1Months > 15` disables Save and shows red validation message
- "Reset to suggestion" button calls `suggestPlanPeriod(new Date(), fiscalYearStart)` and writes returned dates to local state
- Pitfall 5 warning Note (amber box) about hidden current_remainder column when switching to standard

### Task 4 — getYearLabel refactor (5f52d01)
- `step1/types.ts` rewritten: new `PlanPeriodForLabel` type, refactored `getYearLabel(idx, yearType, planPeriod?)` — no `new Date()` calls anywhere
- All FY/CY boundaries derive from `planStartDate` / `year1EndDate` / `planEndDate`
- Removed `currentYear` parameter and `extendedPeriodInfo` branch
- Removed unused legacy `YearLabelProps` interface (which contained the only stale `currentYear: number` reference)
- Updated FinancialGoalsSection / CoreMetricsSection / KPISection to accept `planPeriod` prop and propagate to all `getYearLabel` call sites
- Updated MobileMetricCard helper inside CoreMetricsSection — `currentYear` prop replaced with `planPeriod`
- Updated KPITable helper inside KPISection — same swap

### Task 5 — Step1 wiring (dc0581b)
- Added `useState` import, `PlanPeriodBanner`, `PlanPeriodAdjustModal`, `PlanPeriodForLabel` imports
- Extended `Step1Props` with `planPeriod?: PlanPeriodForLabel`, `rationale?: string`, `onPlanPeriodChange?` callback
- Added `showAdjustModal` local state (toggled on banner Adjust click, closed on modal Cancel/Save)
- Inserted Banner + Modal JSX between the year-type selector and the "Required Section Header" — exact spec position
- Passed `planPeriod` prop down to FinancialGoalsSection / CoreMetricsSection / KPISection
- `extendedPeriodInfo` prop preserved on Step 1 for dual-write

### Task 6 — Owner goals page wiring (7950f58)
- Destructured plan period state + setters + markDirty from `useStrategicPlanning(activeBusiness?.id)`
- Assembled `planPeriod` object (gated on all three dates being non-null)
- Computed simple `planPeriodRationale` based on `isExtendedPeriod` / `year1Months`
- Passed `planPeriod` / `rationale` / `onPlanPeriodChange` to Step1GoalsAndKPIs
- onPlanPeriodChange writes back to hook state via setPlanStartDate/setPlanEndDate/setYear1EndDate and triggers markDirty for auto-save
- Existing `extendedPeriodInfo` prop preserved (dual-write)

### Task 7 — Coach goals page wiring + Phase 14 bug fix (9e77000)
- Same destructure/assembly pattern as Task 6
- **Phase 14 bug fix (Pitfall 2):** added `extendedPeriodInfo={{...}}` to the Step1GoalsAndKPIs render — this prop was completely missing before. Sentinel went from 0 to exactly 1.
- Phase 42: passed `planPeriod` / `rationale` / `onPlanPeriodChange` to Step1GoalsAndKPIs
- Step 2/3/4/5 render blocks left untouched

## Sentinels (REQ-42 acceptance)

| Sentinel | Expected | Actual | Status |
|----------|----------|--------|--------|
| `grep -c "ownerUser === user.id" src/app/goals/hooks/useStrategicPlanning.ts` | 0 | 0 | green |
| `grep -c "new Date()" src/app/goals/components/step1/types.ts` | 0 | 0 | green |
| `grep -c "extendedPeriodInfo=" "src/app/coach/clients/[id]/goals/page.tsx"` | 1 | 1 | green |
| `grep -c "<PlanPeriodBanner" src/app/goals/components/Step1GoalsAndKPIs.tsx` | 1 | 1 | green |
| `grep -c "<PlanPeriodAdjustModal" src/app/goals/components/Step1GoalsAndKPIs.tsx` | ≥1 | 1 | green |

## Phase 14 Coach-Page Bug Fix Confirmation

Plan asks for confirmation that the coach goals page (`src/app/coach/clients/[id]/goals/page.tsx`) now passes BOTH `extendedPeriodInfo` and `planPeriod`.

The Step1GoalsAndKPIs render block at the new line 738 (was 732) now reads:

```tsx
<Step1GoalsAndKPIs
  ... existing props ...
  extendedPeriodInfo={{           // <-- Phase 14 bug fix (was completely missing)
    isExtendedPeriod,
    year1Months,
    currentYearRemainingMonths
  }}
  planPeriod={planPeriod}         // <-- Phase 42
  rationale={planPeriodRationale} // <-- Phase 42
  onPlanPeriodChange={(p) => { ... }} // <-- Phase 42 (writes back + markDirty)
/>
```

The coach view (`/coach/clients/[clientId]/goals`) and the owner view (`/goals`) now hit the same resolution branch in useStrategicPlanning and receive identical plan-period state for the same DB row.

## Banner Copy (As Rendered)

For an extended Fit2Shine-style plan starting Apr 2026 with 14-month Year 1:

```
Your Plan Period
Apr 2026 → Jun 2029 · Year 1 is 14 months
Year 1 spans 14 months — the rest of the current year plus the full next year.
                                                                  [Adjust]
```

For a standard 12-month plan:

```
Your Plan Period
Jul 2025 → Jun 2028 · Year 1 is 12 months
Year 1 is the current fiscal year (12 months). Years 2 and 3 follow.
                                                                  [Adjust]
```

## Deviations from Plan

### Auto-fixed (Rule 1/2 scope)

**1. [Rule 3 - Cascading refactor] CoreMetricsSection and KPISection accept planPeriod prop**
- **Found during:** Task 4
- **Issue:** The plan said "If any OTHER section component (CoreMetricsSection, KPISection) imports getYearLabel from `./types`, update those call sites too" — both do. Their existing call signature `getYearLabel(idx, yearType, currentYear)` would have caused TS errors after the signature change in Task 4 (a `number` arg passed where `PlanPeriodForLabel | undefined` is expected).
- **Fix:** Both components now accept an optional `planPeriod?: PlanPeriodForLabel` prop, propagate it to all internal `getYearLabel` calls (including helper sub-components MobileMetricCard and KPITable), and discard the now-unused `currentYear` local variable.
- **Files modified:** `src/app/goals/components/step1/CoreMetricsSection.tsx`, `src/app/goals/components/step1/KPISection.tsx`
- **Commit:** `5f52d01` (bundled with Task 4)

**2. [Rule 1 - Cleanup] Removed unused legacy YearLabelProps interface from step1/types.ts**
- **Found during:** Task 4
- **Issue:** Legacy `YearLabelProps` interface contained `currentYear: number` field — caused the sentinel `grep -c "currentYear: number"` to return 1 instead of the required 0. The interface was unused (zero references project-wide).
- **Fix:** Removed the interface entirely. Also softened the Phase 42 docstring to say "No runtime date calls" instead of `No new Date() calls` — the sentinel grep was matching the literal text inside the comment.
- **Files modified:** `src/app/goals/components/step1/types.ts`
- **Commit:** `5f52d01` (bundled with Task 4)

**3. [Rule 1 - Cleanup] Removed unused imports from useStrategicPlanning.ts**
- **Found during:** Task 1
- **Issue:** After the inference block was replaced, `isNearYearEnd`, `getMonthsUntilYearEnd`, and `ExtendedPeriodInfo` imports were unused.
- **Fix:** Removed from import lines. tsc / ESLint clean.
- **Files modified:** `src/app/goals/hooks/useStrategicPlanning.ts`
- **Commit:** `c55e20e` (bundled with Task 1)

### No architectural deviations
None — the plan was followed step-by-step. The three auto-fixes above are scope-bound housekeeping discovered during execution and align with Rule 1/3.

## Files Created (2)

| Path | Purpose |
|------|---------|
| `src/app/goals/components/PlanPeriodBanner.tsx` | Step 1 banner UI |
| `src/app/goals/components/PlanPeriodAdjustModal.tsx` | Modal for editing plan period |

## Files Modified (7)

| Path | Changes |
|------|---------|
| `src/app/goals/hooks/useStrategicPlanning.ts` | Replaced inference block with date-driven resolution; removed role guard; added planPeriod state |
| `src/app/goals/components/step1/types.ts` | Refactored getYearLabel; new PlanPeriodForLabel type; removed YearLabelProps |
| `src/app/goals/components/step1/FinancialGoalsSection.tsx` | Accept planPeriod prop; pass to getYearLabel |
| `src/app/goals/components/step1/CoreMetricsSection.tsx` | Accept planPeriod prop; propagate to MobileMetricCard helper |
| `src/app/goals/components/step1/KPISection.tsx` | Accept planPeriod prop; propagate to KPITable helper |
| `src/app/goals/components/Step1GoalsAndKPIs.tsx` | Render PlanPeriodBanner + PlanPeriodAdjustModal; accept planPeriod/rationale/onPlanPeriodChange props |
| `src/app/goals/page.tsx` | Wire planPeriod state through to Step 1 |
| `src/app/coach/clients/[id]/goals/page.tsx` | Wire planPeriod state + Phase 14 bug fix (extendedPeriodInfo) |

(Note: 8 files in modification table; one is the coach page which is also a Phase 14 bug fix.)

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `c55e20e` | refactor(42-02): replace inference detection block with date-driven plan period resolution |
| 2 | `2acb2a7` | feat(42-02): add PlanPeriodBanner component |
| 3 | `a312324` | feat(42-02): add PlanPeriodAdjustModal component |
| 4 | `5f52d01` | refactor(42-02): make getYearLabel read planPeriod dates instead of new Date() |
| 5 | `dc0581b` | feat(42-02): wire PlanPeriodBanner and PlanPeriodAdjustModal into Step 1 |
| 6 | `7950f58` | feat(42-02): wire planPeriod through owner goals page to Step 1 |
| 7 | `9e77000` | feat(42-02): wire planPeriod through coach goals page + Phase 14 bug fix |

## TypeScript Build Verification

Pre-existing baseline: 16 tsc errors, all in `.next/types/app/...` for deleted client/* and dashboard/integrations/* routes plus xero-connect — out-of-scope per Plan 42-01 Rule 4 boundary.

After Plan 42-02: total tsc error count = 16 (unchanged). Zero new errors introduced. All edited files (`useStrategicPlanning.ts`, `step1/types.ts`, `step1/FinancialGoalsSection.tsx`, `step1/CoreMetricsSection.tsx`, `step1/KPISection.tsx`, `Step1GoalsAndKPIs.tsx`, `PlanPeriodBanner.tsx`, `PlanPeriodAdjustModal.tsx`, `goals/page.tsx`, `coach/clients/[id]/goals/page.tsx`) are tsc-clean.

## Known Stubs

None. All 7 tasks are functionally complete. The banner is mounted, the modal is wired, the hook has full read/write coverage, and both owner + coach pages propagate state. Plan 42-03 (test coverage) is now unblocked.

## Self-Check: PASSED

- [x] All 7 tasks committed atomically with conventional commit format
- [x] All 5 regression sentinels green
- [x] tsc total error count unchanged from baseline (16 → 16)
- [x] Phase 14 silent-bug coach-page fix confirmed (extendedPeriodInfo= count 0 → 1)
- [x] Role guard removed from hook (`ownerUser === user.id` count 0)
- [x] new Date() removed from step1/types.ts (count 0)
- [x] Banner and modal mounted in Step1GoalsAndKPIs
- [x] Coach view and owner view now share the same resolution path
- [x] Plan 42-03 unblocked

---

*Phase: 42-plan-period-as-explicit-state-replace-inference-based-extend*
*Plan 02 completed: 2026-04-27*
