# Phase 72: Forecast wizard Step 3 extended-period bug — Context

**Gathered:** 2026-05-31
**Status:** Ready for planning
**Source:** PRD Express Path — Matt callout 2026-05-30 + draft analysis at `docs/forecast-wizard-extended-period-bug.md`

<domain>
## Phase Boundary

Original symptom (Matt, 2026-05-30 mid-Phase-68 execution):

> "when i try and do a forecast for armstrong - step 3 only allows for the revenue and cogs forecast for 3 months? can you investigate why this is and prepare a fix that can run after the current fixes are done"

Armstrong is an **extended-period plan** (Phase 14 concept — plans where Y1 is 13-15 months starting mid-FY rather than the standard 12 months). When a user is in Step 3 of the forecast wizard for an extended-period plan, the revenue/COGS table only renders 3 months (the FY26 remainder before plan_start_date — June 2026 only? or Q4 FY26 = Apr-Jun?) instead of the full Y1 duration.

Expected behavior: Step 3 should render every month from `plan_start_date` through `plan_start_date + Y1 duration - 1 month`. For Armstrong specifically: if plan_start_date = 2026-06-01 and Y1 = 13 months, Step 3 should render Jun 2026 through Jun 2027 (13 monthly inputs).

This phase covers:
1. Investigate Step 3 month-range computation logic
2. Identify where it's hardcoding 12 months / using FY26 boundaries instead of plan_start + Y1
3. Fix to honor `is_extended_period` + `plan_start_date` + Y1 duration
4. Regression test that simulates Armstrong's extended-period config and verifies all 13 months render
5. Smoke test against Armstrong's actual production wizard

This phase does NOT cover:
- Step 4/5/6/7 extended-period verification (could be the same bug; documented for follow-up if found)
- Code fixes from Phase 71 (separate phase)

</domain>

<decisions>
## Implementation Decisions

### Related prior work (locked context)
- **Phase 14** established the extended-period concept: plans where `is_extended_period=true` and `plan_start_date` is mid-FY. Y1 can be 13-15 months (e.g. Jun 2026 - Jun 2027 = 13 months for Armstrong).
- **Phase 68 B15** fixed `deriveCurrentRemainderColumn` (in `src/app/goals/utils/quarters.ts`) to trim the "Now" remainder column at plan_start_date - 1 day when isExtendedPeriod=true. That fix was for the goals wizard, not the forecast wizard.
- **Phase 68 B16** fixed `autoSplitEvenly` to include current_remainder when Y1 is extended (in goals Step4AnnualPlan).
- Phase 72 is the **forecast wizard equivalent**: same B15/B16-family bug but in the forecast wizard Step 3.

### Investigation approach (locked)
- Read the forecast wizard Step 3 source (in `src/app/finances/forecast/components/wizard-v4/steps/Step3*.tsx` likely)
- Find where the month range is computed — look for `forecast_start_month`, `forecast_end_month`, `monthsToRender`, etc.
- Check whether the computation reads `business_profile.is_extended_period` and `plan_start_date`
- If hardcoded to 12 months OR derives from fiscal_year only (ignoring plan_start_date) → that's the bug

### Fix decisions (locked principles)
- **Honor plan_start_date when `is_extended_period=true`:** the Y1 range should be `[plan_start_date, plan_start_date + Y1 duration - 1 month]`
- **Y1 duration source:** likely `business_profile.year_1_duration_months` or computed from `forecast_end_month - forecast_start_month`
- **For non-extended (standard) plans:** behavior should remain unchanged (12 months from fiscal year start)
- **Reuse `deriveCurrentRemainderColumn` logic if applicable:** the goals wizard already solved an adjacent problem in `src/app/goals/utils/quarters.ts`. If the math overlaps, extract a shared util into `src/lib/forecast/extended-period.ts` (or similar) and reuse in both wizards.

### Regression test scope (locked)
- Test that Armstrong's config (`plan_start_date=2026-06-01`, `is_extended_period=true`, Y1=13 months) renders 13 months in Step 3
- Test that a standard non-extended client (FY26 = Jul 2025 - Jun 2026) still renders 12 months
- Test edge case: extended period starting at FY boundary (no remainder)
- Test edge case: extended period >12 months but ≤15 months (Phase 14 max)

### Acceptance for "fixed"
- Matt opens Armstrong's forecast wizard Step 3 → sees 13 monthly inputs (Jun 2026 - Jun 2027)
- Standard client (e.g. Fit2Shine, Just Digital) Step 3 still shows 12 months unchanged
- Regression tests pass
- No regression to Step 1/2/4/5/6/7 (verified via existing test suite)

### Claude's Discretion
- Whether to extract shared util or inline fix in the wizard component
- Exact file path for the test (probably `src/__tests__/forecast/step3-extended-period.test.ts`)
- Whether to also probe Step 4/5/6/7 for the same family of bug while we're in the wizard (recommend: YES, surface as `## Related Bugs Found` in the SUMMARY but don't fix in this phase unless trivial)

</decisions>

<canonical_refs>
## Canonical References

### Draft analysis (the existing pre-investigation doc)
- `docs/forecast-wizard-extended-period-bug.md` — renamed from `phase-69-...` to clear numbering collision

### Related fixes for reference
- `src/app/goals/utils/quarters.ts` `deriveCurrentRemainderColumn` (Phase 68 B15) — adjacent extended-period logic in the goals wizard
- `src/app/goals/components/Step4AnnualPlan.tsx` `autoSplitEvenly` (Phase 68 B16) — extended-period 5-period split

### Schema fields to consult
- `business_profiles.is_extended_period`
- `business_profiles.plan_start_date`
- `business_profiles.year_1_duration_months` (or equivalent)
- `business_profiles.fiscal_year_start`

### Forecast wizard files (to be confirmed by grep during planning)
- `src/app/finances/forecast/components/wizard-v4/steps/Step3*.tsx`
- `src/app/finances/forecast/components/wizard-v4/utils/` for any month-range computation utilities
- `src/app/finances/forecast/types.ts` for forecast type definitions

### Memory constraints
- Memory `feedback_testing`: trace root cause fully before patching
- Memory `feedback_executor_scoped_tests`: scoped vitest

</canonical_refs>

<specifics>
## Specific Ideas

### Suggested plan breakdown (2-3 plans)
- **72-01 — Investigation + diagnosis** (read Step 3 source, find month-range computation, document where the bug lives, name the fix scope). Output: `72-DIAGNOSIS.md` with named root cause.
- **72-02 — Fix + regression tests** (apply the fix per diagnosis, write 4 regression tests, run scoped vitest).
- **72-03 (optional) — Probe Step 4/5/6/7 for same family bug** (if 72-01 surfaces evidence of broader impact).

Wave: 1 (investigation) → 2 (fix + tests) → optional 3 (broader probe).

### Acceptance signals
- Matt can open Armstrong wizard Step 3 and see all 13 months (manual smoke test post-deploy)
- 4 regression tests pass
- No regression to standard 12-month plans
- Code path documented for future extended-period work

</specifics>

<deferred>
## Deferred Ideas

- **Bulk fix for other wizard steps if same bug found** — would expand scope; if found, surface as a follow-up phase
- **Configurable Y1 duration up to N months** — current schema supports Phase 14's 13-15 month range; longer durations would need schema work
- **Mid-Y1 plan-start-date change** — edge case where plan_start_date is updated after forecast is created; out of scope

</deferred>

---

*Phase: 72-forecast-wizard-step-3-extended-period-bug-...*
*Context gathered: 2026-05-31 — PRD Express Path from Matt callout + draft doc + adjacent Phase 68 work*
