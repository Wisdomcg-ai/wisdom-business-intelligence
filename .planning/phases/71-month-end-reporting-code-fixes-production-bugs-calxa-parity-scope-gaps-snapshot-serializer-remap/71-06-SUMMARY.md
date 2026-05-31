---
gsd_summary_version: 1.0
phase: 71-month-end-reporting-code-fixes-production-bugs-calxa-parity-scope-gaps-snapshot-serializer-remap
plan: 06
subsystem: monthly-report-ui
tags: [wages, expand-ui, chevron, table, react, ui-regression-test]
requirements: [S3]
dependency_graph:
  requires:
    - "@/app/finances/monthly-report/types (WagesDetailData/WagesEmployeeLine/WagesPayRunEntry)"
    - "lucide-react ChevronRight icon (already in deps)"
    - "@testing-library/react + vitest (already in deps)"
  provides:
    - "Per-employee expandable detail rows surfacing pay date + gross per pay-run"
    - "Keyboard + screen-reader-friendly chevron toggle (aria-label + aria-expanded)"
  affects:
    - "src/app/finances/monthly-report/components/WagesAnalysisTab.tsx"
tech_stack:
  added: []
  patterns:
    - "Single-state-pivot (string | null) for one-at-a-time-expanded UX"
    - "Keyed React.Fragment to colocate main row + conditional detail row inside .map()"
    - "Pattern alignment with src/__tests__/components/BalanceSheetTab.test.tsx for component-level vitest"
key_files:
  created:
    - "src/__tests__/components/WagesAnalysisTab.test.tsx"
  modified:
    - "src/app/finances/monthly-report/components/WagesAnalysisTab.tsx"
decisions:
  - "Single-employee expansion (only one row open at a time) — keeps the dense pay-run grid readable on mobile and matches the typical coach drill-down flow (one outlier at a time)"
  - "aria-label dynamically swaps Expand ↔ Collapse rather than always 'Expand' — better screen-reader UX, also makes the test selector unambiguous when both employees rendered"
  - "Detail row uses colSpan=N (computed as 1 + payRunDates.length + 3) so the panel spans full table width on every screen — no need for a separate sm: breakpoint bottom-sheet component"
  - "Used emp.name (canonical type field) not the plan-spec snippet's emp.employee_name — the type WagesEmployeeLine declares .name; plan snippet was wrong"
  - "Wrapped main row + detail row in a Fragment with key={`${emp.name}-${idx}`} so React reconciler treats them as siblings instead of crashing on duplicate-tr-without-parent-key"
metrics:
  duration_minutes: 4
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  commits: 2
  tests_added: 5
  tests_passing: 5
completed: 2026-05-31T00:18:05Z
---

# Phase 71 Plan 06: S3 Wages Per-PayRun Expand UI Summary

**One-liner:** WagesAnalysisTab now exposes a chevron toggle on each
employee row that reveals an in-table detail panel listing every pay-run
date + gross amount, surfacing data the API already returned but the UI
silently consumed. Coaches can drill into outliers without leaving the
month-end report.

## What shipped

### New file: `src/__tests__/components/WagesAnalysisTab.test.tsx`

5 component tests covering the full expand/collapse contract. Each
maps 1:1 onto the plan's behavior spec:

| Test | What it locks |
|---|---|
| Test 1 | Chevron button present on mount; per-payrun detail NOT rendered (collapsed-by-default invariant) |
| Test 2 | Click expands; "Pay runs for Alice" header + both dates (`2026-03-14`, `2026-03-28`) + both grosses (`$4,500`, `$4,600`) all render inside the expanded `<tr>` |
| Test 3 | Click again collapses; detail header disappears |
| Test 4 | Two employees rendered → expanding Alice does NOT expand Bob (single-pivot UX) |
| Test 5 | Regression guard — Alice's total `$9,100` still renders in the summary column even when collapsed |

Fixture helpers (`makePayRun`, `makeEmployee`, `makeData`) build the
minimal `WagesDetailData` shape — only the fields the component reads
are populated. The lone `as unknown as` cast on the accounts fixture
is intentional and isolated (the test does not exercise the accounts
panel).

Test 2 scopes its `within(panel)` query to the detail `<tr>` so it
cannot accidentally match the per-column header cells in the summary
row above — i.e., the test would still fail if the implementation
"leaked" detail rendering into the main row.

### Modified: `src/app/finances/monthly-report/components/WagesAnalysisTab.tsx`

1. **State:** added
   `const [expandedEmployeeName, setExpandedEmployeeName] = useState<string | null>(null)`.
   Null = all collapsed; any string = that employee row expanded.

2. **Chevron button** injected into the Employee cell as a leading
   visual:
   ```tsx
   <button
     onClick={() => setExpandedEmployeeName(prev =>
       prev === emp.name ? null : emp.name
     )}
     aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${emp.name}`}
     aria-expanded={isExpanded}
   >
     <ChevronRight className={`... ${isExpanded ? 'rotate-90' : ''}`} />
   </button>
   ```
   `lucide-react`'s `ChevronRight` rotates to a down-chevron via
   Tailwind's `rotate-90`. The 4px padding + `hover:bg-gray-200`
   gives a touch-friendly hit target.

3. **Detail row** rendered conditionally directly under the main
   row, inside a keyed `Fragment`:
   ```tsx
   {isExpanded && (
     <tr className="bg-gray-50 border-b border-gray-100">
       <td colSpan={1 + payRunDates.length + 3}>
         <div className="px-4 py-3 sm:px-6">
           <div className="text-xs font-semibold mb-2">
             Pay runs for {emp.name}
           </div>
           <ul className="space-y-1">
             {emp.pay_runs.map((pr, i) => (
               <li className="flex justify-between text-sm">
                 <span>{pr.date}</span>
                 <span>{fmt(pr.gross_earnings)}</span>
               </li>
             ))}
           </ul>
         </div>
       </td>
     </tr>
   )}
   ```
   `colSpan` is computed precisely (Employee + N pay-run cols + Total
   + Budget + Var) so the panel spans the full table on every screen
   — no separate mobile sheet component required.

4. **Empty-payrun guard:** `pay_runs.length === 0` shows italic
   "No pay runs recorded this period." rather than an empty `<ul>`.

5. **Imports:** added `Fragment, useState` from `react` and
   `ChevronRight` from `lucide-react` (all already in deps).

## Acceptance verification

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/components/WagesAnalysisTab.test.tsx --reporter=verbose` | 5/5 pass |
| `grep -o 'expandedEmployeeName\|setExpandedEmployeeName' WagesAnalysisTab.tsx | wc -l` | 4 (state decl ×2, condition usage, setter usage) — satisfies plan's `≥3` threshold |
| `npx tsc --noEmit` filtered to touched files | clean |
| Existing employee-total cell renders when collapsed | Test 5 locks this — `$9,100` total still in DOM with no row expanded |
| Existing per-column-date cells still render | unchanged — same `payByDate` map drives them as before; only the leading cell + an optional detail row are new |
| Mobile-friendly | `colSpan` detail row inherits the table's existing `overflow-x-auto` container; `px-4 py-3 sm:px-6` padding adapts on small screens |

## Commits

| # | Hash | Subject |
|---|---|---|
| 1 | `d8e39b43` | test(71-06): add failing tests for wages per-payrun expand UI (RED) |
| 2 | `8a96bf69` | feat(71-06): wages per-payrun expand UI with chevron toggle (GREEN) |

Both committed with `--no-verify` per the Phase 71 parallel-execution
directive (Wave 3 of 4 — 71-04 and 71-05 ran concurrently).

## Deviations from Plan

### Auto-fixed during execution

**1. [Rule 1 — Bug in plan spec] `emp.employee_name` does not exist on `WagesEmployeeLine`.**

- **Found during:** Task 2 (GREEN), at the moment of writing the
  state-toggle handler.
- **Root cause:** the plan spec snippet uses
  `setExpandedEmployeeName(prev => prev === emp.employee_name ? null : emp.employee_name)`
  but `src/app/finances/monthly-report/types.ts:395` declares the
  property as `name: string` (no `employee_name`). The existing
  render at `WagesAnalysisTab.tsx:152` already reads `emp.name`.
- **Fix:** all chevron/aria-label/state checks use `emp.name`. The
  state variable name `expandedEmployeeName` is kept (semantically
  it is "the name of the expanded employee" — accurate even though
  the column on the object is `.name`).
- **Files modified:** `src/app/finances/monthly-report/components/WagesAnalysisTab.tsx`
- **Commit:** folded into the GREEN commit `8a96bf69`.

**2. [Rule 3 — Blocking] Keyed `Fragment` required for row + detail pair.**

- **Found during:** Task 2 (GREEN), initial render warned about
  duplicate `<tr>` siblings inside `.map()` without a containing
  keyed element.
- **Root cause:** returning bare `<>...</>` from the `.map()`
  callback drops the key onto the inner `<tr>`s, but React still
  reports a "Each child in a list should have a unique key" warning
  because the Fragment itself has no key — and worse, swapping which
  row is expanded would reuse the wrong tr instance.
- **Fix:** wrapped both rows in `<Fragment key={`${emp.name}-${idx}`}>`
  (imported `Fragment` from `react`) so the reconciler treats the
  row + detail as a single keyed unit.
- **Verified:** no console warnings during test run; Test 4 (Alice vs
  Bob isolation) passes.
- **Files modified:** same — folded into commit `8a96bf69`.

### Pre-existing scope boundaries respected

- Did NOT touch the API surface that produces `WagesDetailData` —
  the data was already correct (per `WagesAnalysisTab.tsx:144-169`
  comment in plan).
- Did NOT modify other monthly-report tabs (S5 / S6 / etc are sibling
  plans in this phase).
- Did NOT introduce a new bottom-sheet component — plan explicitly
  permitted the inline `colSpan` detail row as the mobile-equivalent
  visual.

## Known stubs

None. The detail panel reads directly from the live `emp.pay_runs`
array the API already populates. No mock data, no TODOs.

## Authentication gates

None encountered. Pure UI change to a client component that already
receives its data via the parent monthly-report page.

## Post-deploy verification (recommended)

Matt opens any active month-end report → Wages tab → clicks the
chevron next to an employee with multiple pay-runs in the month
(e.g., a fortnightly admin staffer). Expected: detail row appears
below with each pay-run date + gross. Clicking again collapses.

If a coach reports the detail panel is hard to read on phone:
revisit the `colSpan` width and consider true bottom-sheet pattern
(out of scope here).

## Self-Check: PASSED

- src/__tests__/components/WagesAnalysisTab.test.tsx → FOUND
- src/app/finances/monthly-report/components/WagesAnalysisTab.tsx → MODIFIED (verified)
- Commit d8e39b43 → FOUND
- Commit 8a96bf69 → FOUND
