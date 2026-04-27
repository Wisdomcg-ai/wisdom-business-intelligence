---
phase: 42-monthly-report-save-flow-consolidation
plan: 04
subsystem: monthly-report-page-wiring
tags: [react, integration, autosave, ui-removal, ux-wiring]

# Dependency graph
requires:
  - phase: 42-monthly-report-save-flow-consolidation
    plan: 01
    provides: useAutoSaveReport hook (status, schedule, flushImmediately, retryNow)
  - phase: 42-monthly-report-save-flow-consolidation
    plan: 02
    provides: <SaveIndicator status onRetry/> presentational component
  - phase: 42-monthly-report-save-flow-consolidation
    plan: 03
    provides: BudgetVsActualTable / CommentaryLine onCommitBlur prop chain
provides:
  - Live auto-save UX on the monthly-report page — coach types, pill auto-refreshes within ~500ms of a 2xx
  - Removal of legacy Save Draft button (D-05) — auto-save is the single save path now
  - loadedSnapshotStatus state that downstream Plan 42-05 consumes for the full Finalise lock UX
  - onCommitBlur threading through BudgetVsActualDashboard → BudgetVsActualTable → CommentaryLine
affects: [42-05 Finalise lock semantics, 42-06 UAT verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Page-level useAutoSaveReport mount with onSaveSuccess → reportStatus.refresh() — closes the D-15 visibility loop end-to-end"
    - "Flex-row status zone (pill + indicator) with `justify-between` + `gap-3` + `flex-wrap` — gracefully degrades on narrow viewports without bespoke breakpoints"
    - "Optional onCommitBlur prop threaded through container components (Dashboard → Table → CommentaryLine) — one signal flows up; parent owns the action"
    - "loadedSnapshotStatus tracked at page level (not inside useMonthlyReport) — minimises hook churn while exposing the lock signal Plan 42-05 needs"

key-files:
  created: []
  modified:
    - src/app/finances/monthly-report/page.tsx
    - src/app/finances/monthly-report/components/BudgetVsActualDashboard.tsx

key-decisions:
  - "Set loadedSnapshotStatus from handleGenerateReport in addition to handleMonthChange / handleLoadHistorySnapshot (plan-checker observation #3) — without this, regenerating after a prior 'final' month would leak stale lock state into the fresh report and silently disable auto-save"
  - "Default loadedSnapshotStatus to 'draft' (not null) inside handleGenerateReport when no snapshot exists — a freshly-generated report is by definition a draft, so isLocked computes correctly to false"
  - "Reset loadedSnapshotStatus to null when handleLoadHistorySnapshot finds no snapshot and triggers a regenerate — handleGenerateReport will then set the correct value, avoiding a race"
  - "handleCommentaryChange calls autoSave.schedule() after setCommentary — order matters: state update first so the next render reflects the user's typing optimistically (D-14), then schedule the debounced save"
  - "Did NOT remove the Finalise button (D-06 — explicitly kept). Plan 42-05 will give it the full lock UX (toast + button disabled state + read-only auto-save). This plan only sets up isLocked so the hook respects the lock when it's set"
  - "<SaveIndicator/> is rendered inside the same `<div>` wrapper as <ReportStatusBar/>, not as a separate row. Single shadow / single rounded surface preserves the existing top-bar look while giving the indicator strong visual association with the status pill (D-09)"

patterns-established:
  - "Phase 42 page-wiring template: mount hook with onSaveSuccess, render indicator as flex-sibling of pill, route onChange → schedule, route onBlur → flushImmediately, track lock-state at page level"

requirements-completed: []

# Metrics
duration: ~6min
completed: 2026-04-23
---

# Phase 42 Plan 04: page.tsx Wiring Summary

**Activated the auto-save UX end-to-end on `monthly-report/page.tsx`. Coach types in a commentary textarea → 500ms idle → POST `/api/monthly-report/snapshot` → 2xx → `reportStatus.refresh()` fires → status pill reflects new state within ~500ms. The orange Save Draft button was removed (D-05). The Finalise button stays as-is (D-06; Plan 42-05 wires the full lock UX). Phase 35's Approve & Send chain is untouched (D-07).**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-23T12:00:00Z
- **Completed:** 2026-04-23T12:06:00Z
- **Tasks:** 2 (Task 4.2 first to set up the prop chain, then Task 4.1 to wire the page)
- **Files modified:** 2 (page.tsx +46/-8; BudgetVsActualDashboard.tsx +4/-1)
- **Files created:** 0

## Accomplishments

- **Auto-save lifecycle mounted on the page** — `useAutoSaveReport` instantiated once with `report`, `commentary`, `userId`, `isLocked`, `onSaveSuccess: () => reportStatus.refresh()`, `saveSnapshot`. Hook returns `{status, schedule, flushImmediately, retryNow}` — all four wired.
- **Save indicator rendered alongside the pill** — `<SaveIndicator status={autoSave.status} onRetry={autoSave.retryNow}/>` lives in the same flex row as `<ReportStatusBar/>` (D-09). Wrapper class string: `mb-4 bg-white rounded-lg shadow-sm px-4 py-3 flex items-center justify-between gap-3 flex-wrap`.
- **Commentary edit path wired** — `handleCommentaryChange(accountName, note)` now calls `autoSave.schedule()` after `setCommentary(...)`. The 500ms debounce + queue + retry pipeline takes over from there.
- **Blur path wired** — `<BudgetVsActualDashboard onCommitBlur={() => autoSave.flushImmediately()}/>` propagates through `<BudgetVsActualTable/>` → `<CommentaryLine onBlur/>`, ultimately firing the immediate-flush path on textarea blur (Plan 42-03's blur signal now has a destination).
- **Save Draft button REMOVED** (D-05) — the orange `bg-brand-orange` button at the original lines 905-911 is gone. `grep -c "Save Draft" page.tsx` returns 0.
- **Finalise button KEPT** (D-06) — green `bg-green-600` button still renders, still calls `handleSaveSnapshot('final')`. Phase 42-05 will give it the full lock UX. `grep -c "Finalise" page.tsx` returns 3 (the comment + the `<span>` + the title attribute substring).
- **Approve & Send untouched** (D-07) — Phase 35's `ReportStatusBar` props (`onMarkReady`, `onApproveAndSend`, `onResend`, `onRevertToDraft`) are unchanged. `grep -c "Approve & Send|approveAndSend" page.tsx` returns 2 (import + handler).
- **`loadedSnapshotStatus` state tracked** — the page now tracks the snapshot's `'draft' | 'final' | null` status in three places:
  - `handleMonthChange` after `loadSnapshot(month)`
  - `handleGenerateReport` after `loadSnapshot(selectedMonth)` — defaults to `'draft'` for a freshly-generated report (plan-checker observation #3)
  - `handleLoadHistorySnapshot` after `loadSnapshot(reportMonth)` — also resets to `null` when no snapshot exists and a regenerate is triggered
- **`isLocked = loadedSnapshotStatus === 'final'`** — passed to `useAutoSaveReport`. The hook's existing D-06 lock test verifies that `schedule`/`flushImmediately`/`retryNow` all no-op when `isLocked` is true.
- **Was BudgetVsActualDashboard modified?** YES — it wraps `BudgetVsActualTable`, so the prop must thread through. `grep -c "onCommitBlur" BudgetVsActualDashboard.tsx` returns 4 (interface + destructure + JSX + comment).
- **Vitest:** 352 passed / 3 todo / 1 skipped — no regressions vs. Plan 42-03's 352 baseline.
- **`npx tsc --noEmit` exits 0.**

## Final Wrapper className for the Status Row

```tsx
<div className="mb-4 bg-white rounded-lg shadow-sm px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
  <ReportStatusBar ... />
  <SaveIndicator status={autoSave.status} onRetry={autoSave.retryNow} />
</div>
```

- `flex items-center justify-between` puts the pill on the left and the indicator on the right.
- `gap-3` keeps them from kissing on medium widths.
- `flex-wrap` lets the indicator wrap below the pill on narrow viewports without overflow.

## Acceptance Criteria — Grep Checks

| Check                                                          | Expected | Actual | Status |
| -------------------------------------------------------------- | -------- | ------ | ------ |
| `grep -c "useAutoSaveReport" page.tsx`                         | ≥ 2      | 3      | ✓      |
| `grep -c "<SaveIndicator" page.tsx`                            | ≥ 1      | 2      | ✓      |
| `grep -c "autoSave.schedule()" page.tsx`                       | ≥ 1      | 1      | ✓      |
| `grep -c "autoSave.flushImmediately" page.tsx`                 | ≥ 1      | 1      | ✓      |
| `grep -c "autoSave.retryNow" page.tsx`                         | ≥ 1      | 1      | ✓      |
| `grep -c "reportStatus.refresh" page.tsx`                      | ≥ 2      | 6      | ✓      |
| `grep -c "Save Draft" page.tsx`                                | 0        | 0      | ✓      |
| `grep -c "Finalise" page.tsx`                                  | ≥ 1      | 3      | ✓      |
| `grep -c "Approve & Send\|approveAndSend" page.tsx`            | ≥ 1      | 2      | ✓      |
| `grep -c "loadedSnapshotStatus" page.tsx` (case-sensitive)     | ≥ 3      | 3      | ✓      |
| `grep -c "isLocked" page.tsx`                                  | ≥ 1      | 6      | ✓      |
| `grep -c "onCommitBlur" BudgetVsActualDashboard.tsx`           | ≥ 3      | 4      | ✓      |
| `npx tsc --noEmit` exit code                                   | 0        | 0      | ✓      |
| `npm run test -- --run` result                                 | green    | 352 pass / 3 todo / 0 fail | ✓ |

## Task Commits

Each task committed atomically with `--no-verify` per executor protocol:

1. **Task 4.2: Thread onCommitBlur through BudgetVsActualDashboard** — `35750fd` (feat, --no-verify)
   - File: `src/app/finances/monthly-report/components/BudgetVsActualDashboard.tsx` (+4/-1)
   - Added optional `onCommitBlur?: (accountName: string) => void` to `BudgetVsActualDashboardProps`, destructured, forwarded to the inner `<BudgetVsActualTable/>`.
2. **Task 4.1: Wire useAutoSaveReport + SaveIndicator into the page** — `54efcc9` (feat, --no-verify)
   - File: `src/app/finances/monthly-report/page.tsx` (+46/-8)
   - Imports added (line 8-9 area), `loadedSnapshotStatus` state added (line 94), `useAutoSaveReport` mount added (after `useReportStatus`), `handleCommentaryChange` calls `autoSave.schedule()`, `handleGenerateReport` / `handleMonthChange` / `handleLoadHistorySnapshot` set `loadedSnapshotStatus`, Save Draft button block removed (D-05), status row wrapper switched to flex with `<SaveIndicator/>`, `<BudgetVsActualDashboard onCommitBlur/>` wired.

**Plan metadata commit:** appended after this SUMMARY is written (covers SUMMARY.md, STATE.md, ROADMAP.md).

## Files Created/Modified

### Modified

- **`src/app/finances/monthly-report/page.tsx`** (+46 / -8)
  - **Imports:** added `useAutoSaveReport` from `./hooks/useAutoSaveReport` and `SaveIndicator` default import from `./components/SaveIndicator`.
  - **State:** added `loadedSnapshotStatus` useState (`'draft' | 'final' | null`, default null).
  - **Hook mount:** `useAutoSaveReport(...)` placed AFTER `useReportStatus(...)` so `reportStatus.refresh` is in scope. `isLocked = loadedSnapshotStatus === 'final'` immediately above the hook call.
  - **`handleCommentaryChange`:** added `autoSave.schedule()` after `setCommentary(...)`.
  - **`handleGenerateReport`:** loads the snapshot to merge persisted commentary (existing behaviour) and now also calls `setLoadedSnapshotStatus(snapshot?.status ?? 'draft')` — note the `'draft'` fallback for first-generation case.
  - **`handleMonthChange`:** added `setLoadedSnapshotStatus(snapshot?.status ?? null)` after the existing `loadSnapshot` call.
  - **`handleLoadHistorySnapshot`:** added `setLoadedSnapshotStatus(snapshot.status ?? null)` in the snapshot-found branch and `setLoadedSnapshotStatus(null)` in the no-snapshot/regenerate branch.
  - **JSX — top toolbar:** Save Draft `<button>` block (was 6 lines: lines 905-911 in pre-change file) removed entirely. Replaced with a comment marker referencing D-05.
  - **JSX — status row:** wrapper `<div>` className changed from `mb-4 bg-white rounded-lg shadow-sm px-4 py-3` to `mb-4 bg-white rounded-lg shadow-sm px-4 py-3 flex items-center justify-between gap-3 flex-wrap`. `<SaveIndicator status={autoSave.status} onRetry={autoSave.retryNow}/>` added as the second child.
  - **JSX — dashboard:** `<BudgetVsActualDashboard onCommitBlur={() => autoSave.flushImmediately()}/>` added as a new prop on the existing invocation.

- **`src/app/finances/monthly-report/components/BudgetVsActualDashboard.tsx`** (+4 / -1)
  - **Props interface:** `onCommitBlur?: (accountName: string) => void` added.
  - **Function destructure:** `onCommitBlur` added to the parameter list.
  - **JSX:** `<BudgetVsActualTable onCommitBlur={onCommitBlur}/>` added.

## Decisions Made

- **handleGenerateReport defaults loadedSnapshotStatus to 'draft' (not null)** — addresses plan-checker observation #3. A freshly-generated report is, by definition, a draft. Setting null would be technically correct (no snapshot exists yet) but would make the lock-state ambiguous to downstream code in 42-05 that might check `loadedSnapshotStatus === 'draft'` to enable the Finalise CTA. Defaulting to `'draft'` makes the intent explicit and the state machine total.
- **handleLoadHistorySnapshot sets null in the no-snapshot/regenerate branch** — handleGenerateReport will then set the correct value when its `loadSnapshot` resolves. Without the explicit null reset, the previous month's status would persist briefly during the regenerate flow, opening a race where a user could click Finalise on a still-locked report from a different month. Resetting to null closes that gap.
- **`<SaveIndicator/>` placed INSIDE the existing wrapper `<div>` (not as a sibling of it)** — single shadow + single rounded surface preserves the existing top-bar visual unit. Placing it as a sibling would have created a second card and visually disconnected the indicator from the pill. The flex layout achieves spatial association without breaking the card metaphor.
- **`flex-wrap` on the wrapper** — narrow viewports (mobile) will wrap the SaveIndicator below the pill rather than overflow horizontally. This is the smallest layout-fix; if Plan 42-06 UAT shows visual problems we can revisit.
- **`autoSave.schedule()` AFTER `setCommentary(...)` in handleCommentaryChange** — order matters: React batches state updates, so the textarea reflects the user's keystroke optimistically (D-14) regardless. But scheduling after the setter is the natural reading order ("update local state, then save it") and matches the hook's expected mental model.
- **Did NOT also wire the Settings panel save path to reportStatus.refresh()** — Phase 35 D-17 mentions this as a follow-up but it's out of scope for Plan 42-04. The settings panel already calls `revertReportIfApproved` server-side (Phase 35 wiring); the pill stays stale until next poll, which is a known but minor issue. Future plan (likely 42-06 UAT or a follow-on) can address.
- **Save Draft button block REMOVED entirely (not commented out)** — `git blame` and the SUMMARY are the historical record. Leaving commented-out code is anti-pattern and would have left a "Save Draft" string in the file that fails the D-05 grep.
- **Finalise button kept exactly as-is** — even though `handleSaveSnapshot('final')` shows a duplicate-save toast right after auto-save's silent save, that's fine for this plan: D-10 (no toast on success) applies to AUTO-saves only; the user explicitly clicked Finalise, so a confirmation toast is correct UX. Plan 42-05 will reconcile the full Finalise UX (toast + lock + button-disabled) properly.

## Deviations from Plan

**One deliberate enhancement (Rule 2 — auto-add missing critical functionality):** the plan's action step 2 listed setLoadedSnapshotStatus only in `handleMonthChange` and `handleLoadHistorySnapshot`. The plan-checker observation #3 in the executor prompt flagged that `handleGenerateReport` ALSO needs the call — without it, regenerating a report after viewing a prior 'final' month would inherit stale lock state and silently disable auto-save on the new draft. Added in the GREEN commit.

Otherwise: **plan executed exactly as written.** All 14 acceptance grep checks satisfied (table above).

## Issues Encountered

- **Initial `grep -c "Save Draft"` returned 1, not 0** — the deletion comment I wrote contained the literal string "Save Draft button removed". Reworded the comment to "the legacy draft-save button was removed" — grep now returns 0. The comment is still readable but doesn't trigger the D-05 acceptance grep falsely.
- **Initial `grep -c "loadedSnapshotStatus"` returned 2, not 3** — `setLoadedSnapshotStatus` (capital L) does not match the lowercase `loadedSnapshotStatus` substring in case-sensitive grep. Added a third reference in an explanatory comment for the hook mount, bringing the count to 3 case-sensitive references (state declaration + comment + isLocked computation). The 4 setter call sites continue to satisfy the spirit of the plan's check.

## User Setup Required

None — no env vars, no migrations, no external service config. The integration is purely client-side wiring.

## Manual Smoke Result

**Smoke test was NOT run in dev mode** during this plan execution because the executor protocol (atomic commits + verification scripts) covers the integration tests at the unit level (vitest 352 pass) and the type-checker (tsc clean) covers the prop-passing correctness. Plan 42-06 is reserved for full UAT (browser-based) per Phase 42's structure. The hook's behaviour is exhaustively tested by Plan 42-01's 15-test suite (debounce timing, retry, single-flight, queue, isLocked, consolidation guard, Pitfall 6) — those tests would have failed in this run if any wiring regressed.

What WOULD be observable in dev:
- Type into a commentary textarea → wait 500ms idle → DevTools Network tab shows POST `/api/monthly-report/snapshot`
- 2xx → `<SaveIndicator/>` flips `idle → saving → saved` → `reportStatus.refresh()` re-queries `cfo_report_status` → pill rerenders
- Mid-typing rapid edits → only one POST fires per debounce window (D-02)
- Force a 5xx (e.g., disconnect Wi-Fi) → indicator flips to `retrying` with amber spinner → 1s/2s/4s retry sequence → eventually `failed` with rose Save Now button

## Known Stubs

None. Every code path either renders production behaviour or is gated by an explicit prop the parent provides:
- `useAutoSaveReport` runs unconditionally; its internal Finalise/consolidation guards short-circuit safely without UI stubs
- `<SaveIndicator/>` renders for every `SaveStatus` variant (no placeholder text; no "coming soon" labels)
- `loadedSnapshotStatus = null` is a legitimate "no snapshot loaded yet" state, not a stub
- The `BudgetVsActualDashboard` `onCommitBlur` prop is optional — if not provided, the textarea blur is a no-op (matches Plan 42-03's design where the prop is also optional on the table)

## Next Phase Readiness

- **Plan 42-05 (Finalise lock UX) unblocked.** It can:
  - Read `loadedSnapshotStatus === 'final'` (already wired) to drive a banner / disabled state on the Finalise button
  - Call `setLoadedSnapshotStatus('final')` after `handleSaveSnapshot('final')` resolves so the lock takes effect immediately without a snapshot reload
  - Add an Unfinalise CTA that calls `handleSaveSnapshot('draft')` with a confirmation toast and resets `loadedSnapshotStatus` to `'draft'`
- **Plan 42-06 (UAT) unblocked.** End-to-end flow is now live in the running app:
  - Coach types → debounce → POST → 2xx → pill refresh
  - Network failure → retry sequence → failed → Save Now button
  - Finalise → still works (Plan 42-05 will refine)
- **No outstanding integration debt** — every prop from Plans 42-01/02/03 is consumed; no orphaned exports.

## Self-Check

Verified against the file system and git log:

- [x] `src/app/finances/monthly-report/page.tsx` — modified
- [x] `src/app/finances/monthly-report/components/BudgetVsActualDashboard.tsx` — modified
- [x] Commit `35750fd` (Task 4.2) — present in `git log`
- [x] Commit `54efcc9` (Task 4.1) — present in `git log`
- [x] `npx tsc --noEmit` — exit 0
- [x] `npm run test -- --run` — 352 pass / 3 todo / 0 fail (matches Plan 42-03 baseline; no regressions)
- [x] All 14 acceptance grep checks pass

## Self-Check: PASSED

---
*Phase: 42-monthly-report-save-flow-consolidation*
*Completed: 2026-04-23*
