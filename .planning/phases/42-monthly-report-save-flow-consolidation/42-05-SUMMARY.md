---
phase: 42-monthly-report-save-flow-consolidation
plan: 05
subsystem: monthly-report
tags: [finalise-lock, auto-save, status-pill, d-06, d-17]
requires:
  - usePDFLayout (Phase 35-07: reportMonth threading)
  - useAutoSaveReport (Phase 42-01: isLocked arg + onSaveSuccess)
  - useReportStatus (Phase 35-07: .refresh())
  - ReportSettingsPanel (Phase 35-07: reportMonth prop)
  - loadedSnapshotStatus state (Phase 42-04)
provides:
  - Finalise/Unfinalise toggle UX (D-06)
  - Lock-aware readOnly textareas (D-06)
  - Settings save → pill refresh (D-17)
  - PDF layout save → pill refresh (D-17)
  - handleSaveSnapshot('final') auto-refresh + lock
affects:
  - src/app/finances/monthly-report/page.tsx
  - src/app/finances/monthly-report/components/ReportSettingsPanel.tsx
  - src/app/finances/monthly-report/components/BudgetVsActualDashboard.tsx
  - src/app/finances/monthly-report/components/BudgetVsActualTable.tsx
  - src/app/finances/monthly-report/hooks/usePDFLayout.ts
  - src/app/finances/monthly-report/hooks/__tests__/usePDFLayout.test.tsx
tech-stack:
  added: []
  patterns:
    - "Optional onSaveSuccess?: () => void prop pattern — every save path that mutates server state accepts an optional callback the page wires to reportStatus.refresh()"
    - "readOnly textarea (not disabled, not hidden) — coaches retain read access to commentary while locked"
    - "Conditional button render based on derived isLocked flag — Finalise (green) ↔ Unfinalise (amber)"
key-files:
  created: []
  modified:
    - src/app/finances/monthly-report/hooks/usePDFLayout.ts
    - src/app/finances/monthly-report/hooks/__tests__/usePDFLayout.test.tsx
    - src/app/finances/monthly-report/components/ReportSettingsPanel.tsx
    - src/app/finances/monthly-report/components/BudgetVsActualDashboard.tsx
    - src/app/finances/monthly-report/components/BudgetVsActualTable.tsx
    - src/app/finances/monthly-report/page.tsx
decisions:
  - "Lock UX uses readOnly textareas (not undefined onNoteChange / not hidden) — coaches must retain read access to their notes when a report is finalised. Pair with the Unfinalise button to resume editing. (Deviates from plan-as-written, which proposed undefined-handler hide; objective explicitly overrode based on checker observation #5.)"
  - "Both usePDFLayout (5th positional arg) and ReportSettingsPanel (named prop) accept onSaveSuccess. Page passes a single arrow `() => reportStatus.refresh()` to each so every server-mutating save path now closes the revert chain."
  - "handleSaveSnapshot('final') is the sole entry to lock — it sets local lock state AND refreshes the pill. handleUnfinalise mirrors it for the reverse direction."
metrics:
  duration: ~25min
  completed: 2026-04-27
---

# Phase 42 Plan 05: Finalise lock UX + settings save refresh Summary

**One-liner:** D-06 Finalise/Unfinalise toggle locks auto-save and flips textareas to readOnly while preserving read access; D-17 wiring routes every settings/layout save through `reportStatus.refresh()` so the status pill stays in lockstep with server state.

## What Shipped

### Task 5.1 — `usePDFLayout` D-17 callback (commit `be2bdf2`)
- Added optional 5th positional arg `onSaveSuccess?: () => void` to `usePDFLayout`
- `persistLayout` invokes `onSaveSuccess?.()` after a 2xx response with `data.success` (covers both `saveLayout` and `clearLayout`)
- Tests in `usePDFLayout.test.tsx` cover: 2xx fires callback, non-2xx skips, clearLayout 2xx fires callback

### Task 5.2 — Finalise lock UX + page wiring (commit `ee6a97e`)

**ReportSettingsPanel:**
- Added `onSaveSuccess?: () => void` to `ReportSettingsPanelProps`
- Destructured in component signature
- Fires after the settings POST returns 2xx (line in `handleSave` after `onSettingsChange(data.settings)`)

**page.tsx wiring:**
- `usePDFLayout(businessId, settings, setSettings, selectedMonth, () => reportStatus.refresh())` — 5th arg passed
- `<ReportSettingsPanel ... onSaveSuccess={() => reportStatus.refresh()} />` — prop passed
- `useAutoSaveReport({ ..., isLocked, onSaveSuccess: () => reportStatus.refresh() })` — already wired in 42-04 via `isLocked = loadedSnapshotStatus === 'final'`

**page.tsx Finalise lock UX (D-06):**
- `handleSaveSnapshot('final')` now runs `setLoadedSnapshotStatus('final')` + `await reportStatus.refresh()` after success, then toasts "Report finalised — auto-save locked"
- New `handleUnfinalise` saves snapshot back to `status: 'draft'`, runs `setLoadedSnapshotStatus('draft')` + `await reportStatus.refresh()`, then toasts "Report unlocked for editing"
- Finalise button toggles based on `isLocked`:
  - `!isLocked` → green Finalise button (existing styling)
  - `isLocked` → amber Unfinalise button labeled "Unfinalise to edit"
- `<BudgetVsActualDashboard readOnly={isLocked} />` — passes through to `<BudgetVsActualTable>` → `<CommentaryLine>` → `<textarea readOnly={readOnly}>`

**BudgetVsActualDashboard / Table / CommentaryLine:**
- Each accepts an optional `readOnly?: boolean` prop and forwards it down
- `<CommentaryLine>` textarea applies `readOnly` directly + visual treatment: `bg-gray-50 text-gray-700 cursor-not-allowed` when locked
- Important: textarea remains rendered (so coaches can read notes); editing is what's blocked

## Final API

### `usePDFLayout` signature (5 params)
```typescript
usePDFLayout(
  businessId: string,
  settings: MonthlyReportSettings | null,
  onSettingsChange: (settings: MonthlyReportSettings) => void,
  reportMonth?: string,
  onSaveSuccess?: () => void,    // NEW — D-17
)
```

### `ReportSettingsPanel` new prop
```typescript
onSaveSuccess?: () => void   // D-17 — fires after 2xx settings POST
```

### Unfinalise button styling
- `bg-amber-600 hover:bg-amber-700` (vs green `bg-green-600` for Finalise)
- Label: "Unfinalise to edit"
- Same `Save` icon, same flex layout, no `disabled` prop (always enabled when shown)

### `handleSaveSnapshot('final')` behaviour
On success:
1. `setLoadedSnapshotStatus('final')` — local lock engages immediately (auto-save short-circuits via `useAutoSaveReport`'s `isLocked` ref)
2. `await reportStatus.refresh()` — pill reflects server-side state (mirrors auto-save's `onSaveSuccess` wiring)
3. Toast: "Report finalised — auto-save locked"

## Verification

### Acceptance grep checks (all pass)
- `grep -c "onSaveSuccess" ReportSettingsPanel.tsx` → 3 (interface + destructure + invocation)
- `grep -c "onSaveSuccess" page.tsx` → 3 (usePDFLayout + ReportSettingsPanel + autoSave)
- `grep -c "handleUnfinalise" page.tsx` → 3 (declaration + onClick + comment)
- `grep -c "Unfinalise" page.tsx` → 7
- `grep -c "isLocked" page.tsx` → 8
- `grep -c "setLoadedSnapshotStatus('final')" page.tsx` → 1
- `grep -c "setLoadedSnapshotStatus('draft')" page.tsx` → 1

### Test + tsc results
- `npx tsc --noEmit` → exit 0
- `npm run test -- --run` → 32 files / 355 tests pass

## Deviations from Plan

### [Spec override] Lock UX: readOnly textarea instead of `undefined onNoteChange`
- **Found during:** Pre-execution review (objective specified the override based on checker observation #5)
- **Plan-as-written:** Proposed `onNoteChange={isLocked ? undefined : handleCommentaryChange}` so the textarea wouldn't render at all when locked
- **Implemented:** `readOnly={isLocked}` threaded through Dashboard → Table → CommentaryLine → `<textarea readOnly={...}>` so the textarea stays visible but uneditable, with a visual treatment (`bg-gray-50`, `cursor-not-allowed`) to signal the lock
- **Why:** Coaches need to read their commentary notes on finalised reports — hiding the textarea broke that
- **Files:** BudgetVsActualDashboard, BudgetVsActualTable, CommentaryLine
- **Commit:** `ee6a97e`

### [Rule 3 - Blocker — non-issue] Forward reference of reportStatus in usePDFLayout
- **Concern:** `usePDFLayout(... () => reportStatus.refresh())` is invoked at line 209, but `reportStatus` is declared at line 358 via `useReportStatus(...)`
- **Resolution:** Closure body executes lazily (only when fired after a 2xx settings save), by which time `reportStatus` is in scope. TypeScript correctly infers this — `npx tsc --noEmit` exits 0 without warnings. No reordering required.

## Known Stubs

None. Every save path now wires through to `reportStatus.refresh()`.

## Self-Check: PASSED

- File `src/app/finances/monthly-report/components/ReportSettingsPanel.tsx` — FOUND
- File `src/app/finances/monthly-report/components/BudgetVsActualDashboard.tsx` — FOUND
- File `src/app/finances/monthly-report/components/BudgetVsActualTable.tsx` — FOUND
- File `src/app/finances/monthly-report/page.tsx` — FOUND
- Commit `be2bdf2` (Task 5.1) — FOUND
- Commit `ee6a97e` (Task 5.2) — FOUND
