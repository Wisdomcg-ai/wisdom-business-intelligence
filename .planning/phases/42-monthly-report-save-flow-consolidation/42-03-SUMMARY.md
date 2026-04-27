---
phase: 42-monthly-report-save-flow-consolidation
plan: 03
subsystem: monthly-report-commentary
tags: [react-component, rtl-tests, tdd, ux-simplification, controlled-input]

# Dependency graph
requires:
  - phase: 42-monthly-report-save-flow-consolidation
    plan: 00
    provides: CommentaryLine.test.tsx scaffold (6 it.todo) + shared useDebouncedCallback (consumed indirectly via 42-01)
  - phase: 42-monthly-report-save-flow-consolidation
    plan: 01
    provides: useAutoSaveReport.flushImmediately (the consumer of onCommitBlur) + onNoteChange contract (the consumer of debounced typing)
provides:
  - CommentaryLine refactored to always-editable inline textarea (no edit/view mode toggle)
  - BudgetVsActualTableProps.onCommitBlur — new optional prop forwarded to CommentaryLine
  - CommentaryLine named export from BudgetVsActualTable.tsx for direct RTL rendering
affects: [42-04 page.tsx wiring (will pass schedule + flushImmediately as the two callbacks)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Always-editable inline textarea pattern (Pattern 3 from 42-RESEARCH): no edit/view mode, parent owns the value, every keystroke fires onChange, onBlur fires a flush signal"
    - "Test-only named export at the bottom of a default-export file — explicit comment marks the rationale (`// Test-only export — RTL tests render this directly.`)"
    - "data-testid suffix-by-accountName pattern: `commentary-textarea-${accountName}` — supports both unit tests and future E2E"

key-files:
  created: []
  modified:
    - src/app/finances/monthly-report/components/BudgetVsActualTable.tsx
    - src/app/finances/monthly-report/components/__tests__/CommentaryLine.test.tsx

key-decisions:
  - "Replaced 88-line edit/view-mode CommentaryLine body with a 55-line always-editable variant. Net delta in the file: +27 / -60 = 33 lines removed."
  - "Added named export `export { CommentaryLine }` at the bottom of the function (test-only). The component is also still rendered by the default-export `BudgetVsActualTable` — both consumers share the same definition."
  - "rows={2} with resize-none for visual consistency in the empty state. Long notes still overflow internally (browser-native), but the box itself stays compact."
  - "Pruned 5 unused lucide-react imports (Pencil, Check, X, Plus, MessageSquarePlus). Kept ChevronDown, ChevronRight, FileText, Landmark — all still used by TransactionDrillDown."
  - "Did NOT keep an Add Note button — the textarea + placeholder fully replaces it. The plan explicitly listed this as a tradeoff (Pattern 3) and the Add Note button was a remnant of the edit/view mode era. The textarea is auto-focused by browser native click; no extra affordance needed."

patterns-established:
  - "Phase 42 controlled-input pattern for autosave UI: parent owns state, child fires onChange (every keystroke) + onBlur (flush). No internal state in the leaf component."

requirements-completed: []

# Metrics
duration: ~5min
completed: 2026-04-23
---

# Phase 42 Plan 03: CommentaryLine Always-Editable Refactor Summary

**Replaced the misleading edit/view-mode `CommentaryLine` (with its green ✓ button that only saved to local state — D-04) with a Notion/Linear-style always-editable inline textarea: every keystroke fires `onNoteChange` (D-14 optimistic UI), every blur fires `onCommitBlur` (D-01 flush signal). The textarea is now a pure presentational controlled input — all save behaviour lives in the parent's `useAutoSaveReport` hook (built in 42-01).**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-23T11:53:00Z
- **Completed:** 2026-04-23T11:55:48Z
- **Tasks:** 1 (TDD: RED + GREEN, no REFACTOR step needed)
- **Files modified:** 2
- **Files created:** 0
- **Net line delta in BudgetVsActualTable.tsx:** +27 / -60 (33 lines removed)
- **Internal state removed from CommentaryLine:** 2 useState (`editing`, `editText`) + 2 handlers (`handleSave`, `handleCancel`)
- **Lucide-react icons pruned:** 5 (Pencil, Check, X, Plus, MessageSquarePlus)

## Accomplishments

- **D-04 fully satisfied:** zero hits for `title="Save note"`, `title="Cancel"`, `title="Edit note"` in the file. Zero hits for `handleSave|handleCancel`. The misleading per-note save UX is gone.
- **Pattern 3 (always-editable):** the textarea is the only display surface. Empty state shows the placeholder (`"Add your coaching note — what caused this variance? What should the client do about it?"`); pre-filled state shows the note value. No mode toggle.
- **D-14 (optimistic UI) wired:** `value={coachNote}` (controlled by parent) + `onChange={(e) => onNoteChange(accountName, e.target.value)}` — every keystroke flows up. The local re-render reflects the user's typing immediately because the parent will set `commentary[accountName]` on each call.
- **D-01 (blur flush) wired:** `onBlur={() => onCommitBlur?.(accountName)}` — parent's `useAutoSaveReport.flushImmediately()` will be wired here in 42-04.
- **`BudgetVsActualTableProps` gains `onCommitBlur?: (accountName: string) => void`** — destructured in the default export and forwarded to the single `<CommentaryLine />` invocation in the rendered JSX.
- **Test-only named export** (`export { CommentaryLine }`) added — the existing default export of `BudgetVsActualTable` is unchanged, so no consumer of the table needs to update an import.
- **7/7 RTL tests pass:** all 6 it.todo scaffolds converted to it() blocks, plus 1 extra test ("textarea is controlled by coachNote prop (no internal state)") asserting that a parent-driven `coachNote` rerender flows into the textarea (proves no shadow internal state).
- **Full vitest suite:** 352 pass / 0 fail / 3 todo across 32 files — up from 345 pass on plan 42-02 entry. Net new tests: 7. Net regressions: 0.
- **`npx tsc --noEmit` exits 0.**

## Test → Decision Map

| Test | Decision | Verifies |
| ---- | -------- | -------- |
| D-04: no element with title="Save note" exists | D-04 | green Check icon button removed |
| D-04: no element with title="Cancel" exists | D-04 corollary | X cancel button removed |
| D-04: textarea is always rendered (no edit/view mode toggle) | Pattern 3 | empty + filled both render the textarea; no Pencil edit affordance |
| D-14: typing fires onNoteChange on every keystroke | D-14 (optimistic UI) | 3 keystrokes → 3 calls with cumulative values |
| D-01: blur fires onCommitBlur with accountName | D-01 (blur flush) | single fireEvent.blur → 1 call with accountName |
| placeholder text appears when coachNote is empty | Pattern 3 | textarea.placeholder contains "Add your coaching note" |
| textarea is controlled by coachNote prop (no internal state) | D-14 (no shadow state) | parent rerender with new coachNote → textarea.value updates |

## Task Commits

Each task was committed atomically (`--no-verify` per executor protocol):

1. **Task 3.1 RED: add failing tests for always-editable CommentaryLine** — `1e243f3` (test, --no-verify)
   - Files: `src/app/finances/monthly-report/components/__tests__/CommentaryLine.test.tsx` (6 it.todo → 7 it() blocks; all 7 fail because CommentaryLine isn't exported yet — `Element type is invalid`)
2. **Task 3.1 GREEN: refactor CommentaryLine to always-editable inline textarea** — `082ba8f` (feat, --no-verify)
   - Files: `src/app/finances/monthly-report/components/BudgetVsActualTable.tsx` (interface + body + JSX forward + lucide import prune + test-only named export)
   - All 7 tests pass; full suite green

**Plan metadata commit:** appended after this SUMMARY is written (covers SUMMARY.md, STATE.md, ROADMAP.md).

## Files Modified

### `src/app/finances/monthly-report/components/BudgetVsActualTable.tsx`
- **Line 4:** lucide-react import pruned to `{ ChevronDown, ChevronRight, FileText, Landmark }` (was 9 icons; -5).
- **Line 12:** `BudgetVsActualTableProps` gains `onCommitBlur?: (accountName: string) => void`.
- **Lines 242–315 (was 242–348):** `CommentaryLine` body replaced. Key changes:
  - New prop `onCommitBlur?: (accountName: string) => void` in destructure + types.
  - Removed `useState` calls for `editing` + `editText`.
  - Removed `handleSave` + `handleCancel` functions.
  - Removed three-branch ternary (editing/coachNote-display/Add-button).
  - Added single conditional textarea rendered iff `onNoteChange` is provided, with `value={coachNote}`, `onChange`, `onBlur`, `data-testid={\`commentary-textarea-${accountName}\`}`, `rows={2}`, `resize-none`.
- **End of `CommentaryLine`:** added `export { CommentaryLine }` (test-only).
- **Default export `BudgetVsActualTable` (line 318):** destructure now includes `onCommitBlur`.
- **`<CommentaryLine ... />` invocation (~line 514):** added `onCommitBlur={onCommitBlur}` prop.

### `src/app/finances/monthly-report/components/__tests__/CommentaryLine.test.tsx`
- 6 `it.todo` → 7 `it(...)` (added 1 extra "controlled by coachNote prop" test).
- Added `import { CommentaryLine } from '../BudgetVsActualTable'`.
- Added `renderLine()` helper that returns `{ ...utils, props }` so each test can assert directly against the spy props.
- Used `data-testid={\`commentary-textarea-${accountName}\`}` query (more robust than role/placeholder against future class changes).

## Final Prop Signatures

```typescript
// Component prop signature
function CommentaryLine({
  accountName,        // string — unique key, also goes to onNoteChange/onCommitBlur callbacks
  variance,           // number — for the "$X over budget" pill
  vendors,            // VendorSummary[] — pass-through to TransactionDrillDown
  coachNote,          // string — fully controlled by parent; the textarea's value
  detailTabRef,       // 'subscriptions' | 'wages' | null — optional drill-down link
  onNoteChange,       // (accountName, note) => void — fires on every keystroke (D-14)
  onCommitBlur,       // (accountName) => void — fires on textarea blur (D-01)
  onTabChange,        // (tab) => void — drill-down navigation
})

// Wrapper prop signature (BudgetVsActualTableProps)
{
  report: GeneratedReport
  commentary?: VarianceCommentary
  commentaryLoading?: boolean
  onCommentaryChange?: (accountName: string, text: string) => void
  onCommitBlur?: (accountName: string) => void   // NEW — Phase 42 D-01
  onTabChange?: (tab: ReportTab) => void
}
```

## Decisions Made

- **Test-only named export, not a separate file extraction.** Plan listed extracting `CommentaryLine` to its own file as an option. I kept it inline in `BudgetVsActualTable.tsx` because: (a) the component is small (~55 lines after refactor), (b) the existing `<CommentaryLine />` invocation is in the same file, (c) extracting it would require updating the relative import in 1 place for no real win. Adding a single named export at the bottom satisfies the test requirement with zero churn elsewhere.
- **Did NOT remove the `if (onNoteChange)` guard around the textarea.** This preserves the existing semantic: if the parent is read-only (doesn't supply onNoteChange), the textarea is suppressed entirely — same as the previous default-export rendering when onNoteChange is undefined. Tests cover the standard case (onNoteChange provided).
- **Used `data-testid` rather than ARIA role / placeholder for the test query.** Three reasons: (1) the textarea has no label (ARIA accessibility issue out of scope here), (2) `getByRole('textbox')` would match other unrelated textareas if a parent ever rendered them; (3) `data-testid` with accountName suffix scales to E2E tests where multiple commentary lines coexist.
- **Did NOT delete the `useState` import.** Still used by `TransactionDrillDown` (line 170: `const [expanded, setExpanded] = useState(false)`). Plan acceptance criterion was "delta of -2 useState in CommentaryLine block" — confirmed: 4 → 2.

## Deviations from Plan

**One micro-deviation (Rule 1 — bug-style fix; tightened scope):** the plan's action step 6 said "ADD an export for `CommentaryLine` from `BudgetVsActualTable.tsx`" but didn't specify location. I placed `export { CommentaryLine }` directly after the function definition (before the default-export `BudgetVsActualTable`), with an explanatory comment marking it as test-only. Acceptance grep `grep -c "export { CommentaryLine }"` returns 1 as required.

Otherwise: **None — plan executed exactly as written.** All 9 acceptance grep checks passed:

| Check | Expected | Actual |
| ----- | -------- | ------ |
| `title="Save note"` count | 0 | 0 |
| `title="Cancel"` count | 0 | 0 |
| `title="Edit note"` count | 0 | 0 |
| `useState` count (delta from 4) | 2 (Δ -2) | 2 |
| `onCommitBlur` count | ≥3 | 7 (interface + destructure + JSX prop forward + CommentaryLine type + CommentaryLine destructure + JSX onBlur + tests don't count, file-only count) |
| `commentary-textarea-` data-testid count | ≥1 | 1 |
| `onBlur` count | ≥1 | 1 |
| `export { CommentaryLine }` count | 1 | 1 |
| `handleSave|handleCancel` count | 0 | 0 |
| `it.todo` remaining in test | 0 | 0 |
| `it(` count in test | ≥6 | 7 |
| Vitest pass count for the test file | ≥6 | 7/7 |
| Vitest pass count, full components/__tests__ dir | no regression | 23/23 |
| Full vitest suite | no regression | 352 pass / 0 fail (was 345 → +7) |
| `npx tsc --noEmit` | exit 0 | exit 0 |

## Issues Encountered

None — TDD RED produced the expected 7/7 failures (`Element type is invalid` because the named export didn't exist yet); GREEN refactor produced 7/7 passing on first run.

## User Setup Required

None — no env vars, no migrations, no external service config.

## Next Phase Readiness

- **Plan 42-04 (page.tsx wiring) unblocked.** It can now:
  - Pass `useAutoSaveReport.flushImmediately` directly as `onCommitBlur` to `<BudgetVsActualTable />`.
  - The existing `handleCommentaryChange` (which already calls `onCommentaryChange` from `BudgetVsActualTableProps`) becomes the wire-up point for `useAutoSaveReport.schedule()` — debounced.
  - The two callbacks together implement D-01 (debounce + blur) end-to-end.
- **Plan 42-04 prerequisites confirmed:**
  - The textarea is always rendered when `onNoteChange` is provided.
  - `coachNote` flows fully through the parent's controlled state.
  - No CommentaryLine-internal state means the only optimistic-UI surface lives in the parent (where it belongs per D-14).

## Self-Check: PASSED

Verified against the file system and git log:

- [x] `src/app/finances/monthly-report/components/BudgetVsActualTable.tsx` — modified (CommentaryLine refactored, onCommitBlur threaded, lucide imports pruned, named export added)
- [x] `src/app/finances/monthly-report/components/__tests__/CommentaryLine.test.tsx` — modified (6 it.todo → 7 it())
- [x] Commit `1e243f3` (Task 3.1 RED) — FOUND in `git log`
- [x] Commit `082ba8f` (Task 3.1 GREEN) — FOUND in `git log`
- [x] `npx vitest run src/app/finances/monthly-report/components/__tests__/CommentaryLine.test.tsx` — 7/7 pass
- [x] `npx vitest run src/app/finances/monthly-report/components/__tests__/` — 23/23 pass
- [x] `npx vitest run` (full suite) — 352 pass / 0 fail (no regressions)
- [x] `npx tsc --noEmit` — exit 0
- [x] All 9 acceptance grep checks pass

## Known Stubs

None — every code path either renders production behaviour or is gated by an explicit prop that the parent will wire in 42-04. The textarea renders unconditionally when `onNoteChange` is provided; the placeholder + empty value is the legitimate empty state.

---
*Phase: 42-monthly-report-save-flow-consolidation*
*Completed: 2026-04-23*
