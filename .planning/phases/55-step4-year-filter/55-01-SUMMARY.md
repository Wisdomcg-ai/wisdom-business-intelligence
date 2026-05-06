---
phase: 55
plan: 01
subsystem: forecast-wizard-v4
tags: [step4-team, year-filter, ux, ux-s4-04]
requires:
  - state.teamMembers, newHires, departures, bonuses (existing wizard state)
  - getFiscalYear, getFiscalYearDateRange, DEFAULT_YEAR_START_MONTH (lib/utils/fiscal-year-utils)
provides:
  - Year-card filter for Step 4 team table
  - Per-business localStorage hint dismissal: wizard-v4:step4-yearfilter-hint:{businessId}
affects:
  - src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx
tech-stack:
  patterns:
    - Local component view-state (selectedYear), explicitly NOT persisted to wizard state
    - Filter predicate mirrors TeamPlanningOverview.calculateActualHeadcount
key-files:
  modified:
    - src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx
  created:
    - src/__tests__/forecast/phase-55-step4-year-filter.test.tsx
    - .planning/phases/55-step4-year-filter/55-01-SUMMARY.md
decisions:
  - selectedYear is local component state; default null on every mount; not persisted (viewer concern)
  - Card counts ALWAYS show full-year derived totals regardless of selectedYear (cards are a plan summary, not a filtered subset)
  - Filter predicate reuses the same active-in-FY rules already in TeamPlanningOverview to avoid two sources of truth
  - Out-of-duration card slots render as greyed placeholders (no click) for layout stability
metrics:
  branch: feat/55-01-step4-year-filter
  pr: https://github.com/Wisdomcg-ai/wisdom-business-intelligence/pull/117
  commits: 2
  files_changed: 2
  tests_added: 8
  tests_total_step4: 58
---

# Phase 55 Plan 01: Step 4 Year-Card Filter Summary

Wired the three FY summary cards above the Step 4 team table so clicking
a card filters both the Team Members and Contractors tables to people on
payroll during that fiscal year. Cards previously *looked* clickable but
did nothing — operators kept clicking them expecting a filter.

## What shipped

- New `YearFilterCards` component (inline in `Step4Team.tsx`) renders
  three cards: Y1 (current FY) keeps the existing blue gradient as the
  emphasis, Y2/Y3 use a clean white/border style. Selected card gains
  `ring-2 ring-blue-400 ring-offset-2`. All cards are real `<button>`
  elements with `role=button`, `aria-pressed`, and an `aria-label`
  describing the target FY.
- `Step4Team` holds a local `selectedYear: 1 | 2 | 3 | null` state.
  Default `null` on every mount (verified by test: `default mount: no card
  selected, no filter pill, all rows visible`). NOT persisted to wizard
  state — this is a viewer concern, never part of the saved plan.
- Filter pill ("Showing FY{N} (Jul YYYY – Jun YYYY) … Show all years")
  appears above the team tables when a year is selected. The date range
  comes from `getFiscalYearDateRange` so it stays consistent with
  everywhere else in the app that renders FY spans.
- Per-business dismissible hint: `text-xs text-gray-500 italic` copy
  ("Build your team plan once — it covers all 3 years…") with an X
  dismiss button. State persists in `localStorage` under
  `wizard-v4:step4-yearfilter-hint:{businessId}`. Dismiss is one-click,
  no confirmation.
- Row-level Starts/Leaves badges only render when a year is selected:
  - **Starts** (green): new hire whose `startMonth` FY equals the selected FY
  - **Leaves** (red): teamMember whose departure `endMonth` FY equals the selected FY
- Section header counts switch to "X of Y" while filtering so it's
  obvious how many were hidden.
- Card counts (headcount / FTE / total cost) remain full-year derived
  totals, regardless of `selectedYear`. The cards are a stable plan
  summary; only the row tables react to the filter.

## What did NOT change

- No edits to wizard reducer, actions, state shape, or `WIZARD_VERSION`.
- No new fields on `TeamMember` / `NewHire` / `Departure`.
- No re-design of card visuals beyond the selection-outline addition.
- No auto-select on mount.
- No new year selector elsewhere in the wizard.
- All 50 prior Phase 51 + 52 Step 4 tests still pass.

## Filter predicate

Mirrors `TeamPlanningOverview.calculateActualHeadcount` to keep one
source of truth for "is this row in FY{N}":

```
targetFY = fiscalYear + selectedYear - 1

teamMember row: included unless `departure.endMonth`'s FY < targetFY
new-hire row:  included when `startMonth`'s FY <= targetFY
```

`fiscalYear + selectedYear - 1` follows the existing convention used
across Step4Team (e.g. lines 727, 1129, 1224, 1393).

## Tests

`src/__tests__/forecast/phase-55-step4-year-filter.test.tsx` — 8 cases:

1. Default mount: no selection, no pill, no badges, all rows visible
2. Click card → `aria-pressed=true`, pill renders FY date range
3. Click same card twice → toggles back to null, pill removed
4. Select Y2 → Y3 hire filtered out, Y2 hire shows green Starts badge
5. Departure mid-FY → red Leaves badge on row, member still visible that year
6. Member who departed before selected FY → filtered out
7. Hint banner dismiss persists across remount under same businessId
8. "Show all years" link in pill clears selection

All 58 Step 4 tests (50 prior + 8 new) pass.

## Manual verification notes

- Branch: `feat/55-01-step4-year-filter`
- PR: https://github.com/Wisdomcg-ai/wisdom-business-intelligence/pull/117 (draft)
- Push cadence: pushed after each atomic commit (feature, then tests),
  per direct executor instructions to avoid the 54-02 stall pattern.
- `npx tsc --noEmit -p tsconfig.json` clean (no new errors)
- `npx eslint src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx` —
  3 pre-existing warnings unchanged, 0 new
- Full vitest suite: 1 unrelated pre-existing failure
  (`src/__tests__/goals/plan-period-banner.test.tsx` — timezone
  drift on a date input expectation, unrelated to Step 4). Verified
  failing on origin/main HEAD before my changes were applied.

## Operator deviation note

The Edit/Write tool calls in this session unintentionally wrote to the
absolute paths under `/Users/mattmalouf/Desktop/business-coaching-platform/src/...`
(the parent repo's working tree on `main`) instead of the worktree path
under `.claude/worktrees/agent-a9ceca3b/src/...`. The content was
mirrored to the correct worktree via `cp` before the first commit, so
the branch contains all intended changes. The parent repo working tree
will show the same edits as uncommitted local changes against `main` —
restore with `git checkout HEAD -- src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx`
and `rm src/__tests__/forecast/phase-55-step4-year-filter.test.tsx` when
convenient. No data loss; this is purely a working-tree-cleanup item.

## Self-Check: PASSED

- File exists: `src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx` (modified)
- File exists: `src/__tests__/forecast/phase-55-step4-year-filter.test.tsx` (created)
- File exists: `.planning/phases/55-step4-year-filter/55-01-SUMMARY.md` (this file)
- Commit `0e86cea` (feature) — present in `git log`
- Commit `7e6bdaf` (tests) — present in `git log`
- Branch `feat/55-01-step4-year-filter` pushed to origin
- PR #117 open and draft
