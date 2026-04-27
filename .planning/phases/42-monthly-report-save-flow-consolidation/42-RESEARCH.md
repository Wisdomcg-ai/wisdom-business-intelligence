# Phase 42: Monthly Report Save Flow Consolidation - Research

**Researched:** 2026-04-23
**Domain:** React auto-save UX, controlled-input debounce + onBlur orchestration, optimistic-UI save indicators, retry/backoff
**Confidence:** HIGH (all findings sourced from in-repo code; no external library introductions required)

## Summary

Phase 42 collapses three save buttons (per-note green ✓, page-level Save Draft, Finalise) into a single auto-save-on-blur-or-debounce path on `src/app/finances/monthly-report/page.tsx`. All required machinery already exists in the codebase: `saveSnapshot()` in `useMonthlyReport.ts`, `useReportStatus.refresh()` from Phase 35-07, an in-tree `useDebouncedCallback` pattern in `ForecastWizardV4.tsx`, and a settled save-indicator location (the Phase 35 `ReportStatusBar` row).

The `/api/monthly-report/snapshot` POST handler is **full-snapshot only** — it requires `report_data`, `summary`, `fiscal_year` and uses upsert with `onConflict: 'business_id,report_month'`. There is no partial-update support. Therefore D-03's per-field path is NOT available without an API change; full-snapshot replay on every save is the only v1-feasible option, and it's cheap enough (~one upsert every 500ms during active typing, debounced + queued).

**Primary recommendation:** Build a new `useAutoSaveReport` hook co-located in `src/app/finances/monthly-report/hooks/`. It owns: (a) a 500ms `useDebouncedCallback` (lift the existing private helper to a shared utility); (b) a single in-flight save mutex so debounce-fires-then-blur-fires doesn't double-POST; (c) status state for the new `<SaveIndicator>` sub-component sitting alongside the pill in `ReportStatusBar`'s row; (d) a 3-attempt exponential-backoff retry (1s/2s/4s) using `setTimeout` chains; (e) calls `useReportStatus.refresh()` after every successful save (D-15) and exposes a `flush()` for `beforeunload` (D-12 retry-exhausted state). `CommentaryLine` becomes always-editable inline (no edit/cancel modes), firing `onNoteChange` on every keystroke and on blur.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Auto-save trigger**
- **D-01:** Both debounce (500ms after last keystroke) AND onBlur. Debounce catches active typing; onBlur catches focus-loss without a final keystroke.
- **D-02:** Debounce window: 500ms after last keystroke.
- **D-03:** Save scope: per-field on blur preferred IF the snapshot endpoint supports partial updates; full-snapshot save acceptable for v1 (research to confirm).

**Buttons removed**
- **D-04:** Per-note green ✓ button **removed entirely** from `BudgetVsActualTable.tsx`.
- **D-05:** Page-level "Save Draft" button **removed**.
- **D-06:** "Finalise" button **KEPT**. With auto-save, Finalise becomes a "lock the report from auto-save edits" action. Planner clarifies semantics (recommended: finalised reports become read-only until reverted).
- **D-07:** "Approve & Send" button **KEPT** (Phase 35).

**Save indicator UX**
- **D-08:** Small text near the status pill in the same top-bar info zone:
  - Idle / saved: `All changes saved`
  - Saving in flight: `Saving...` (with subtle spinner)
  - Save failed: `Unsaved — retrying...` then `Unsaved — click to retry` after retry budget exhausted
- **D-09:** Indicator does NOT obscure the pill. Both visible side-by-side or stacked.
- **D-10:** No toasts on successful save. Toasts only on terminal failure after retries.

**Failure handling**
- **D-11:** On POST failure, indicator → `Unsaved — retrying...`, automatic retry with exponential backoff. **Retry budget: 3 attempts** (1s, 2s, 4s).
- **D-12:** After 3 failed retries: indicator → `Unsaved — click to retry`, manual "Save Now" button surfaces, single error toast (non-dismissable until retry succeeds or user navigates away with confirm).
- **D-13:** During in-flight save, edits to other fields are queued; queued state is sent in next debounce window after current save completes.
- **D-14:** Optimistic UI: field shows new value immediately; indicator reflects async save status separately. No reverting the field on failure.

**Pill reactivity**
- **D-15:** When auto-save POST returns 2xx, immediately call `useReportStatus.refresh()` to refetch the pill state. Don't wait for the 10s poll.
- **D-16:** The `useReportStatus.refresh` exposed in 35-07 is the integration point. No new endpoint needed.

**Settings save path (Phase 35 follow-up)**
- **D-17:** Settings panel save path (template change, section toggles, PDF layout) should also fire `useReportStatus.refresh()` after success.

### Claude's Discretion

- Exact debounce vs blur library / hook implementation
- Retry backoff timer implementation (vanilla JS `setTimeout` vs library)
- Save indicator typography and exact wording
- Whether per-field saves are partial-snapshot updates (require API change) or full-snapshot replays (no API change)
- Whether finalised reports lock auto-save (recommended: yes; planner confirms)

### Deferred Ideas (OUT OF SCOPE)

- Real-time concurrent-edit conflict resolution (single-coach v1 assumption holds)
- Offline edit queueing / IndexedDB
- Per-field partial-snapshot updates (API change) — endpoint research below confirms full replay is the only v1 path
- Save history / version timeline
- Approve & Send sub-state re-evaluation
- Finalise → automatic Approve & Send

## Phase Requirements

This phase derives requirements from CONTEXT.md decisions D-01..D-17. There is no `REQUIREMENTS.md` row for Phase 42 — the CONTEXT decisions are the contract. The planner should map every decision to at least one task and at least one validation point (see Validation Architecture below).

## Project Constraints (from MEMORY.md / project context)

No `CLAUDE.md` at repo root. From `~/.claude` MEMORY:
- **Go deep before deploying fixes** — trace root cause, plan before coding, don't ship incremental patches.
- **Only push to wisdom-business-intelligence repo** — verify remote before pushing.
- **Design philosophy: simplicity over features** — target user is "not a numbers person", simplicity > completeness. The save indicator wording must reflect this (no jargon; "All changes saved" beats "Persisted to remote at HH:MM:SS").

## Standard Stack

### Core (already in package.json — no additions)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | ^18.2.0 | Component model, useEffect, useRef, useCallback | Codebase baseline |
| sonner | ^2.0.7 | Error toast on retry-exhausted (D-12) | Already used in `ReportStatusBar`, `usePDFLayout`, `useMonthlyReport` |
| (in-tree) `useDebouncedCallback` | — | 500ms debounce timer (D-02) | Existing pattern at `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx:23-42` — copy or extract to shared util |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^4.1.4 | Unit-test the new hook with fake timers | Test file co-located: `__tests__/useAutoSaveReport.test.tsx` |
| @testing-library/react | ^16.3.2 | Render `CommentaryLine` to assert blur fires onNoteChange | Already used in `ReportStatusBar.test.tsx` |
| @playwright/test | ^1.59.1 | Optional E2E for the type→pause→pill-flips path | Phase 40 infra — extend `e2e/coach-flow.spec.ts` (currently `test.skip`) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-tree `useDebouncedCallback` | `use-debounce` (npm) | Adds dep + bundle weight; hook is 20 LOC and proven in-repo. **Verdict: keep in-tree.** |
| Vanilla setTimeout retry chain | `p-retry`, `async-retry`, `axios-retry` | Adds dep for 3 retries with fixed backoff; trivially expressible as `setTimeout`. **Verdict: vanilla.** |
| Custom `useAutoSaveReport` hook | Extend `useMonthlyReport` | Keeps churn isolated, mirrors `useReportStatus` separation pattern (35-06). **Verdict: new sibling hook.** |
| Full-snapshot replay every save | Partial-update PATCH endpoint | Endpoint requires `report_data`, `summary`, `fiscal_year` (line 84). API change is out-of-scope per Deferred. **Verdict: full replay; payload size analysis below.** |

**Installation:** None. All deps present in `package.json`.

**Version verification:** No new packages introduced. The existing `useDebouncedCallback` pattern was code-reviewed in this research (see Code Examples).

## Architecture Patterns

### Recommended Project Structure

```
src/app/finances/monthly-report/
├── hooks/
│   ├── useAutoSaveReport.ts          # NEW — debounce+blur+retry+queue
│   ├── useMonthlyReport.ts           # (existing — saveSnapshot reused)
│   ├── useReportStatus.ts            # (existing — .refresh() called by new hook)
│   ├── usePDFLayout.ts               # MODIFIED — call onSaveSuccess for D-17
│   └── __tests__/
│       └── useAutoSaveReport.test.tsx  # NEW — vitest fake-timer suite
├── components/
│   ├── ReportStatusBar.tsx           # MODIFIED — render <SaveIndicator/> sibling
│   ├── SaveIndicator.tsx             # NEW — text + spinner + retry button
│   ├── BudgetVsActualTable.tsx       # MODIFIED — CommentaryLine refactor
│   └── ReportSettingsPanel.tsx       # MODIFIED — call onSaveSuccess for D-17
├── page.tsx                          # MODIFIED — wire useAutoSaveReport, remove buttons
└── lib/
    └── (no shared utils needed unless useDebouncedCallback is hoisted)
```

### Pattern 1: New `useAutoSaveReport` hook (sibling to `useMonthlyReport`)

**What:** Single source of truth for the auto-save lifecycle. Wraps `saveSnapshot()` with debounce, blur-trigger, queue-during-flight, retry, and pill-refresh.

**When to use:** Mounted once on the monthly-report page. Receives report data + commentary + settings; exposes `triggerSave(reason: 'debounce'|'blur'|'manual')`, `flush()`, `state: { status, lastSavedAt, retryCount }`.

**Example interface:**
```typescript
// Source: synthesizes existing useMonthlyReport (saveSnapshot signature)
//         + useReportStatus (.refresh() pattern)
//         + ForecastWizardV4 useDebouncedCallback pattern
export interface UseAutoSaveReportArgs {
  report: GeneratedReport | null
  commentary: VarianceCommentary | undefined
  userId: string | null
  isLocked: boolean              // true when monthly_report_snapshots.status === 'final'
  onSaveSuccess?: () => void     // page calls reportStatus.refresh() here (D-15)
}

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'retrying'; attempt: 1 | 2 | 3 }
  | { kind: 'failed' }           // 3 retries exhausted; show "click to retry"

export interface UseAutoSaveReportReturn {
  status: SaveStatus
  schedule: () => void           // call from handleCommentaryChange (debounce path)
  flushImmediately: () => void   // call from textarea onBlur (D-01)
  retryNow: () => void           // user clicks the failed-state button (D-12)
}
```

**Key integration points (referencing existing code):**
- POST shape: line `useMonthlyReport.ts:362-377` — `business_id`, `report_month`, `fiscal_year`, `status: 'draft'`, `is_draft`, `unreconciled_count`, `report_data`, `summary`, `coach_notes`, `commentary`, `generated_by`. Auto-save always sends `status: 'draft'` (Finalise still routes through the existing `handleSaveSnapshot('final')` path until the planner decides whether to keep that as a separate explicit action).
- After 2xx: call `onSaveSuccess()` (page provides `() => reportStatus.refresh()`) — satisfies D-15.

### Pattern 2: Single-flight + queue (D-13)

**What:** A boolean `inFlightRef` + a `pendingRef` that holds the latest payload. When a save resolves, if `pendingRef` is non-null, immediately schedule another debounce-window save with the latest data.

**When to use:** Every `triggerSave` invocation. This avoids racing two POSTs and avoids losing the most recent edit if debounce fires while a previous save is still pending.

**Example:**
```typescript
// Pseudocode — refine in plan
const inFlightRef = useRef(false)
const pendingRef = useRef<Snapshot | null>(null)

async function triggerSave(payload: Snapshot) {
  if (inFlightRef.current) {
    pendingRef.current = payload
    return
  }
  inFlightRef.current = true
  try {
    await saveSnapshot(payload)
    setStatus({ kind: 'saved', at: new Date() })
    onSaveSuccess?.()
  } catch (err) {
    await retryWithBackoff(payload)  // 1s, 2s, 4s
  } finally {
    inFlightRef.current = false
    if (pendingRef.current) {
      const next = pendingRef.current
      pendingRef.current = null
      triggerSave(next)
    }
  }
}
```

### Pattern 3: Always-editable `CommentaryLine` (replaces edit/cancel modes)

**What:** Drop the `editing` state, `editText` state, `handleSave`, and `handleCancel`. The textarea is always rendered with `value={coachNote}` and `onChange={(e) => onNoteChange?.(accountName, e.target.value)}`. Add `onBlur={() => onCommitBlur?.(accountName)}`.

**When to use:** Replaces lines 259-345 of `BudgetVsActualTable.tsx`. The `coachNote` is the single source of truth from upstream commentary state; `onChange` propagates every keystroke to the parent (which schedules debounce); `onBlur` propagates a flush signal.

**Tradeoffs:**
- ✅ One state machine (parent commentary), no local edit copy
- ✅ Simpler component; fewer bug surfaces (cancel-state staleness eliminated)
- ⚠️ No "Cancel" affordance. **Mitigation:** the value is debounced, so the user has 500ms to keep editing before the network fires; once saved, ctrl-Z (browser undo) still works on the textarea content. If the user explicitly wants to revert a saved note, they delete the text — same as Notion / Linear. Document this in the plan.
- ⚠️ The "Add coaching note" button (line 337-343) currently appears when `coachNote` is empty. Refactor: show an empty textarea with placeholder instead, OR keep the button as a "click to focus" that just `autoFocus`es the textarea. Planner picks; recommend the latter for visual continuity.

### Pattern 4: `<SaveIndicator/>` sub-component, sibling of pill in `ReportStatusBar` row

**What:** Small inline-flex element rendered next to the pill (the page renders it via composition, NOT inside ReportStatusBar.tsx itself, to keep Phase 35's component pure).

**Where:** `page.tsx` line 938 — the `<div className="mb-4 bg-white rounded-lg shadow-sm px-4 py-3">` wrapper currently contains `<ReportStatusBar/>`. Wrap it as a flex row:
```tsx
<div className="mb-4 bg-white rounded-lg shadow-sm px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
  <ReportStatusBar ... />
  <SaveIndicator status={autoSave.status} onRetry={autoSave.retryNow} />
</div>
```

**When to use:** Always rendered when `report` is present (matches the existing `{report && (...)}` guard).

**Visual style:** Match the codebase typography. `text-sm text-gray-500` for idle/saved; `text-amber-600` while retrying; `text-rose-700` for failed. Use `Loader2` from `lucide-react` (already imported by `page.tsx`) for the spinner.

### Anti-Patterns to Avoid

- **Calling `setState` in setTimeout callbacks without an unmount guard.** New hook MUST clean up its timeout in a `useEffect` cleanup, or use a `mountedRef` pattern. The existing `useDebouncedCallback` clears its timer on every new call, but does NOT clean up on unmount — fix this when extracting.
- **Don't fire auto-save on the initial `setReport()` after `loadSnapshot`.** The hook must skip the first N state changes during initialization (mirror `ForecastWizardV4`'s `stateVersionRef.current < 3` pattern at line 1193-1196). Otherwise the page mount triggers a save with stale-from-disk data.
- **Don't auto-save when `report.is_consolidation === true`.** The `saveSnapshot` function explicitly throws for consolidation reports (line 355-358). The hook must check this flag and short-circuit to `status: 'idle'`.
- **Don't auto-save when `monthly_report_snapshots.status === 'final'`** (the Finalise lock — see "Finalise semantics" below). The hook receives `isLocked: boolean` and short-circuits.
- **Don't fire `onSaveSuccess()` on retries that succeed mid-backoff.** Wait — actually, DO call it on any 2xx, regardless of whether it's the first attempt or the third retry. Otherwise the pill stays stale after a transient failure.
- **Don't `await` inside React event handlers without try/catch.** The textarea's `onChange` should call `schedule()` (sync, returns void); the network call lives inside the hook's `useEffect`/timer.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 500ms debounce | New hand-rolled `setTimeout` | Lift `useDebouncedCallback` from `ForecastWizardV4.tsx:23-42` | Already battle-tested in 3000ms-autosave wizard; same pattern, different delay |
| Pill auto-refresh | New endpoint or new polling | `useReportStatus.refresh()` from Phase 35-07 | Already wired; D-15/D-16 mandate this |
| Toast on terminal failure | Custom modal | `sonner` `toast.error()` | Pattern in `ReportStatusBar.tsx`, `usePDFLayout.ts` |
| Spinner | New SVG | `Loader2` from `lucide-react` | Already imported in `page.tsx`, used in `ForecastWizardV4` |
| Saving full snapshot payload | Diff/patch encoding | Existing `saveSnapshot()` full replay | Endpoint demands full payload; payload is ~5-50 KB JSON, fast over LAN |
| `beforeunload` warning | Custom navigation interceptor | `window.addEventListener('beforeunload', handler)` in a useEffect when status === 'failed' | Browser-native, no library needed |

**Key insight:** Every primitive needed already exists in this repo. The phase is composition + UX cleanup, not new infrastructure.

## Code Examples

### Existing debounce hook (lift to shared util OR copy into new hook)

```typescript
// Source: src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx:23-42
function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    }) as T,
    [delay]
  );
}
```

**Recommendation:** Extract to `src/lib/hooks/use-debounced-callback.ts` so both Phase 42 and the existing wizard import from one place. ALSO add unmount cleanup:
```typescript
useEffect(() => {
  return () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }
}, [])
```

### Existing autosave-trigger pattern (model for the new hook)

```typescript
// Source: src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx:1133-1219
const performAutoSave = useCallback(async () => {
  if (isLoading || isSaving || isAutoSaving || isReadOnly) return;
  setIsAutoSaving(true);
  setSaveError(false);
  try {
    const savedId = await actions.saveDraft(forecastId, forecastName);
    if (savedId) { setForecastId(savedId); setLastSaved(new Date()); }
  } catch (err) {
    setSaveError(true);
  } finally {
    setIsAutoSaving(false);
  }
}, [/* deps */]);

const debouncedAutoSave = useDebouncedCallback(performAutoSave, 3000);

useEffect(() => {
  if (isLoading) return;
  stateVersionRef.current += 1;
  if (stateVersionRef.current < 3) return;  // skip init churn
  debouncedAutoSave();
}, [/* watched state */, debouncedAutoSave]);
```

**Differences for Phase 42:**
- Window: 500ms (D-02), not 3000ms
- Add onBlur as a second trigger (D-01) — when blur fires, cancel the debounce timer and invoke `performAutoSave()` immediately
- Add 3-attempt retry on failure (D-11)
- Add `useReportStatus.refresh()` call after success (D-15)
- Watch ONLY `report` + `commentary` + `settings` (not unrelated state)

### Existing snapshot save (the call wrapped by the new hook)

```typescript
// Source: src/app/finances/monthly-report/hooks/useMonthlyReport.ts:342-388
const saveSnapshot = useCallback(
  async (reportData, options) => {
    if (reportData.is_consolidation) throw new Error('Consolidated snapshot is scheduled for Phase 35 — not yet available in 34.0')
    const res = await fetch('/api/monthly-report/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: reportData.business_id,
        report_month: reportData.report_month,
        fiscal_year: reportData.fiscal_year,
        status: options?.status || (reportData.is_draft ? 'draft' : 'final'),
        is_draft: options?.status === 'final' ? false : reportData.is_draft,
        unreconciled_count: reportData.unreconciled_count,
        report_data: reportData,
        summary: reportData.summary,
        coach_notes: options?.coachNotes,
        generated_by: options?.generatedBy,
        commentary: options?.commentary || null,
      }),
    })
    if (!res.ok) throw new Error((await res.json()).error)
    return (await res.json()).snapshot
  }, [],
)
```

### Settings save success → refresh (D-17)

```typescript
// Modification to: src/app/finances/monthly-report/hooks/usePDFLayout.ts (around line 67)
// CURRENT:
if (data.success && data.settings) {
  onSettingsChange(data.settings)
  return true
}
// PROPOSED:
if (data.success && data.settings) {
  onSettingsChange(data.settings)
  onSaveSuccess?.()  // page passes () => reportStatus.refresh()
  return true
}
```
Same pattern in `ReportSettingsPanel.tsx`'s settings POST callback (planner audits the panel's own save flow — there's a separate save button in the panel that POSTs to `/api/monthly-report/settings` directly).

### `beforeunload` guard for retry-exhausted state (D-12)

```typescript
// Inside useAutoSaveReport.ts
useEffect(() => {
  if (status.kind !== 'failed') return
  const handler = (e: BeforeUnloadEvent) => {
    e.preventDefault()
    e.returnValue = ''  // legacy browsers
  }
  window.addEventListener('beforeunload', handler)
  return () => window.removeEventListener('beforeunload', handler)
}, [status.kind])
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-note green ✓ button (local state) | Auto-save on debounce + blur | This phase | D-04: button removed |
| Page-level Save Draft button | Auto-save handles all draft saves | This phase | D-05: button removed |
| Status pill polled every 10s only | Pill explicitly refreshed after every save | This phase | D-15: ~500ms latency on revert visibility |
| Edit/Save/Cancel mode in `CommentaryLine` | Always-editable inline textarea | This phase | Simpler component, no orphan state |

**Deprecated/outdated:**
- `handleCommentaryChange` updating local state only — needs to also schedule auto-save.
- `handleSaveSnapshot('draft')` invocation from a top-bar button — that button is removed; only `handleSaveSnapshot('final')` (Finalise) remains as an explicit action. The auto-save hook calls the same underlying `saveSnapshot()` for drafts.
- `CommentaryLine` `editing` / `editText` state machine — gone.

## Open Questions

1. **Does Finalise lock further auto-saves?** (D-06 asks; CONTEXT recommends "yes")
   - What we know: `monthly_report_snapshots.status` toggles between `'draft'` and `'final'`. The endpoint blindly upserts whatever `status` is sent. Auto-save sends `status: 'draft'` always.
   - What's unclear: Should auto-save short-circuit when the most recent loaded snapshot has `status: 'final'`?
   - **Recommendation:** YES, lock. Implementation: the hook receives `isLocked = (loadedSnapshot?.status === 'final')`. While locked, `schedule()` is a no-op and `<SaveIndicator/>` shows nothing (or a `Finalised` badge). The Finalise button stays visible; coach can revert by manually editing (which would un-finalise — but auto-save being locked prevents that). **Therefore** the Finalise button must be paired with an "Unfinalise" / "Edit" button that flips status back to `'draft'` before edits can save again. Planner addresses this UX.
   - Alternative: keep auto-save firing always; Finalise only sets `status: 'final'` on the next save and reverts to `'draft'` on subsequent edits (no lock). Simpler but makes Finalise feel meaningless. **Not recommended.**

2. **Does removing CommentaryLine's "Cancel" affordance hurt the user?**
   - What we know: With auto-save, cancel-during-edit is impossible — the value is committed to local state on every keystroke.
   - What's unclear: Will coaches expect to "discard" a partially-typed note?
   - **Recommendation:** Trust the Notion/Linear convention. Browser-native ctrl-Z still works on the textarea. If a coach wants to revert a saved note, they clear the field. No special UI needed.

3. **Should auto-save fire when `selectedMonth` changes?**
   - What we know: `handleMonthChange` (page.tsx:583-593) calls `setCommentary(undefined)` then `loadSnapshot(month)`. This will trigger the watched-state effect.
   - **Recommendation:** Use the `stateVersionRef.current < 3` skip-init guard plus a dependency check that explicitly resets when `selectedMonth` changes. The hook should treat a month change as "remount", not "edit".

4. **What about the existing `/api/monthly-report/commentary` route?**
   - What we know: The Phase 35-07 SUMMARY mentions it (line 32: `src/app/api/monthly-report/commentary/route.ts — calls revertReportIfApproved after save`). The current page.tsx flow doesn't appear to POST to it; it goes through `/api/monthly-report/snapshot` instead. There may be two parallel persistence paths.
   - What's unclear: Is `/commentary` the older path being phased out, or still actively used?
   - **Recommendation:** Planner audits both routes. If `/commentary` is dead code from a prior iteration, leave it untouched (out of scope). If it's still in use somewhere, the auto-save flow goes through `/snapshot` (full payload) and `/commentary` is unaffected. **Confirmed in Phase 35-07 wiring docs:** revert is hooked into all three (commentary, snapshot, settings). Auto-save uses snapshot.

## Environment Availability

This phase has no new external dependencies. All required tools, libraries, and APIs are already in the repo (vitest, react-testing-library, sonner, lucide-react, fetch, setTimeout, useReportStatus.refresh, saveSnapshot). **Step 2.6 effectively SKIPPED — no probe needed.**

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 + @testing-library/react 16.3.2 (jsdom env) |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run src/app/finances/monthly-report/hooks/__tests__/useAutoSaveReport.test.tsx` |
| Full suite command | `npm test` (alias for `vitest run`) |
| TypeScript gate | `npx tsc --noEmit` |
| E2E (optional) | `npm run test:e2e -- e2e/coach-flow.spec.ts` (currently `test.skip` — un-skip and add a flow when phase ready) |

### Phase Decisions → Test Map

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|--------------|
| D-01 (debounce + blur) | After 500ms idle, save fires; on blur, save fires immediately even if <500ms | unit (fake timers) | `vitest run useAutoSaveReport.test` | ❌ Wave 0 |
| D-02 (500ms window) | Two changes within 400ms = 1 save; two changes 600ms apart = 2 saves | unit (fake timers) | same | ❌ Wave 0 |
| D-03 (full snapshot replay) | POST body matches `saveSnapshot` full shape | unit | same (assert fetch mock body) | ❌ Wave 0 |
| D-04 (green ✓ removed) | `BudgetVsActualTable` renders no Check button in commentary | component | `vitest run BudgetVsActualTable.test` | ❌ Wave 0 |
| D-05 (Save Draft removed) | `page.tsx` snapshot does not contain Save Draft text | manual UAT or visual snapshot | grep + manual | ❌ Wave 0 (manual) |
| D-06 (Finalise kept, locks auto-save) | When status='final', `schedule()` is a no-op | unit | useAutoSaveReport.test | ❌ Wave 0 |
| D-07 (Approve & Send kept) | `ReportStatusBar.test.tsx` still passes unchanged | regression | existing suite | ✅ |
| D-08 (indicator wording) | `<SaveIndicator/>` renders correct text per status | component | `vitest run SaveIndicator.test` | ❌ Wave 0 |
| D-09 (indicator + pill both visible) | DOM contains both `data-testid="status-pill"` and `data-testid="save-indicator"` | component | `vitest run page.tsx wrapper test` OR manual UAT | ❌ Wave 0 (manual ok) |
| D-10 (no toast on success) | Mock sonner; assert `toast.success` not called on 2xx auto-save | unit | useAutoSaveReport.test | ❌ Wave 0 |
| D-11 (3-retry exponential backoff) | Failure → retries at 1s, 2s, 4s; 4th attempt does not fire | unit (fake timers) | useAutoSaveReport.test | ❌ Wave 0 |
| D-12 (manual retry button + toast after failure) | After 3 fails, status='failed'; retryNow() clears it; toast.error fired once | unit + component | useAutoSaveReport.test, SaveIndicator.test | ❌ Wave 0 |
| D-13 (queue during in-flight) | Save A in-flight → change fires schedule → A resolves → B fires automatically | unit (fake timers + mock fetch promise) | useAutoSaveReport.test | ❌ Wave 0 |
| D-14 (optimistic UI) | Field value matches user input immediately even if save fails | component | useAutoSaveReport.test (render textarea, blur, mock 500, assert value still present) | ❌ Wave 0 |
| D-15 (refresh after 2xx) | onSaveSuccess called exactly once per successful save (incl. retries) | unit | useAutoSaveReport.test | ❌ Wave 0 |
| D-16 (use existing refresh) | No new endpoint; `useReportStatus.refresh` is the only refresh path | review | grep | manual |
| D-17 (settings save → refresh) | `usePDFLayout.saveLayout` calls `onSaveSuccess` on 2xx; ReportSettingsPanel save also | unit | new tests for usePDFLayout.test | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run src/app/finances/monthly-report/` (scoped) — < 10s
- **Per wave merge:** `npm test && npx tsc --noEmit` — full vitest + types
- **Phase gate:** Full suite green + manual UAT (type a note, observe pill flips Sent → Draft within 1s, observe `All changes saved` after 500ms idle, simulate offline → observe retry indicator → terminal `Unsaved — click to retry` → click → resolves)

### Wave 0 Gaps

- [ ] `src/app/finances/monthly-report/hooks/__tests__/useAutoSaveReport.test.tsx` — covers D-01, D-02, D-03, D-06, D-10, D-11, D-13, D-14, D-15
- [ ] `src/app/finances/monthly-report/components/__tests__/SaveIndicator.test.tsx` — covers D-08, D-09, D-12
- [ ] `src/app/finances/monthly-report/components/__tests__/BudgetVsActualTable.test.tsx` (NEW or extend) — covers D-04 (green ✓ removed)
- [ ] `src/app/finances/monthly-report/hooks/__tests__/usePDFLayout.test.tsx` (NEW) — covers D-17
- [ ] Optional: extend `e2e/coach-flow.spec.ts` (currently `test.skip`) with type→pause→pill-flips→reload→still-saved E2E
- [ ] If `useDebouncedCallback` is hoisted: `src/lib/hooks/__tests__/use-debounced-callback.test.ts`

Framework install: NONE — vitest, RTL, @testing-library/jest-dom, jsdom all present (`devDependencies` lines 61-77 of package.json).

## Common Pitfalls

### Pitfall 1: Debounce timer not cleared on unmount
**What goes wrong:** User edits, navigates away within 500ms; setState fires after unmount → React warning + potential save with stale data.
**Why it happens:** `useDebouncedCallback` as written in `ForecastWizardV4.tsx` clears its timer on each call but not on unmount.
**How to avoid:** Add a `useEffect(() => () => clearTimeout(timeoutRef.current), [])` cleanup when extracting the hook. Also check `mountedRef.current` before `setState` inside async paths.
**Warning signs:** Console warns "Can't perform a React state update on an unmounted component."

### Pitfall 2: Saving the wrong report after month change
**What goes wrong:** Coach types in March report, switches to February while debounce timer is pending → 500ms later the timer fires and POSTs March's `report_data` against `report_month: '2026-02'` (because state has shifted).
**Why it happens:** Debounce captures stale closure data unless the hook's payload is re-read from current refs at execution time.
**How to avoid:** The hook holds refs to `report` + `commentary`. The debounce callback reads from `reportRef.current` at fire-time, NOT a captured prop. ALSO: cancel pending debounce when `selectedMonth` (or `report.report_month`) changes — flush or clear, planner picks. Recommend **clear** to avoid saving partially-typed half-month-ago state.

### Pitfall 3: Finalise lock not enforced consistently
**What goes wrong:** Coach Finalises a report → auto-save still fires on next keystroke → status flips back to `'draft'` silently → Finalise button visible to be clicked again. Confusing.
**Why it happens:** `useAutoSaveReport` doesn't know about `monthly_report_snapshots.status === 'final'` unless the page passes it.
**How to avoid:** Page reads `loadedSnapshot.status` (returned by `loadSnapshot`) and passes `isLocked` prop to the hook. When locked, `schedule()` no-ops and the indicator hides. The Finalise button becomes "Unfinalise to edit" (or similar) when locked. Document this contract in the plan.

### Pitfall 4: `useReportStatus.refresh()` race with optimistic auto-save
**What goes wrong:** Auto-save POST returns 2xx → call `refresh()` → refresh fetches `cfo_report_status` → but the snapshot route's `revertReportIfApproved` runs AFTER the response is sent (no — re-read: it runs synchronously in the route handler, before the response). OK, no race. Confirm via reading `route.ts:127`: the await is BEFORE `NextResponse.json({success, snapshot})`.
**Why it might still be tricky:** If `revertReportIfApproved` ever becomes fire-and-forget, the refresh could fetch stale state.
**How to avoid:** Read `src/app/api/monthly-report/snapshot/route.ts:122-131` — `await revertReportIfApproved(...)` is in scope before the response. Safe today. Add a regression test: after auto-save success on a sent report, fetch `cfo_report_status` → expect `status === 'draft'`.

### Pitfall 5: Optimistic UI confusing after a failed save
**What goes wrong:** User sees their text on screen + "Unsaved — click to retry" → reloads page → text disappears (it was never persisted) → user is confused.
**Why it happens:** D-14 says don't revert the field on failure; but when the user navigates, the un-saved text dies with the local state.
**How to avoid:** D-12 says toast + "Save Now" + non-dismissable. Add `beforeunload` listener while in `failed` state (code shown above). Browsers will show "Are you sure you want to leave?" — coach gets a chance to retry before losing data.

### Pitfall 6: Auto-save fires on Xero data refresh
**What goes wrong:** Xero sync completes → `report.report_data` shifts → useEffect dependency triggers → auto-save fires → revertReportIfApproved demotes a sent report to draft because of a number that wiggled.
**Why it happens:** Phase 35 D-17 explicitly says Xero refresh must NOT revert.
**How to avoid:** The auto-save hook should ONLY watch `commentary` (and possibly `coach_notes` if those exist), NOT `report.report_data`. If the planner needs full-snapshot replays, the trigger must be `commentary` — but the POST body still includes the latest `report_data` (read from ref at fire-time). This means: a Xero refresh changes `report_data` but doesn't trigger a save; the next commentary edit picks up the fresh `report_data` for free. **Critical:** verify the dependency array of the auto-save useEffect.

### Pitfall 7: Saving an empty / not-yet-generated report
**What goes wrong:** Page mounts → no report yet → first commentary keystroke (somehow) fires schedule → POST 400 (`report_data` required).
**Why it happens:** Race between report generation and user interaction.
**How to avoid:** `schedule()` short-circuits if `reportRef.current === null`. The textarea is presumably not even rendered until report exists, but defense in depth.

## Sources

### Primary (HIGH confidence)
- `src/app/finances/monthly-report/page.tsx` (lines 580-620, 905-950) — current save flow + button placement
- `src/app/finances/monthly-report/components/BudgetVsActualTable.tsx` (lines 242-348) — `CommentaryLine` to refactor
- `src/app/finances/monthly-report/hooks/useMonthlyReport.ts` (lines 342-388) — `saveSnapshot` reused as-is
- `src/app/finances/monthly-report/hooks/useReportStatus.ts` (full file) — `.refresh()` integration point
- `src/app/finances/monthly-report/components/ReportStatusBar.tsx` (full file) — sibling for SaveIndicator
- `src/app/api/monthly-report/snapshot/route.ts` (full file) — endpoint shape, revert wiring
- `src/app/api/monthly-report/settings/route.ts` (full file) — settings revert path (Phase 35-07)
- `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` (lines 23-42, 1133-1219) — proven `useDebouncedCallback` + autosave pattern in this codebase
- `src/app/finances/monthly-report/components/__tests__/ReportStatusBar.test.tsx` — vitest+RTL test pattern to mirror
- `vitest.config.ts` — test infrastructure already configured
- `package.json` — confirms zero new deps required
- `.planning/phases/35-report-approval-delivery-workflow/35-CONTEXT.md` — locked Phase 35 contract
- `.planning/phases/35-report-approval-delivery-workflow/35-07-SUMMARY.md` — gap that this phase closes
- `.planning/phases/35-report-approval-delivery-workflow/35-04-SUMMARY.md` — `revertReportIfApproved` helper signature

### Secondary (MEDIUM confidence)
- Notion / Linear save indicator UX convention (broadly known industry pattern; confirms D-08 wording)

### Tertiary (LOW confidence)
- None — this phase is entirely composition of in-repo primitives.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dep is verified in `package.json` and used elsewhere in the codebase
- Architecture: HIGH — pattern mirrors `useReportStatus` (sibling hook) + `ForecastWizardV4` (debounced autosave); both production-tested
- Pitfalls: HIGH — derived from reading actual code paths, not hypothetical scenarios. Pitfall 4 specifically traced through `revertReportIfApproved` invocation site (line 127 of snapshot/route.ts).
- API endpoint shape: HIGH — read source; confirmed full-payload-only, no PATCH support.

**Research date:** 2026-04-23
**Valid until:** 2026-05-23 (30 days; codebase is the only source so churn risk is the only invalidator)

## RESEARCH COMPLETE

**Phase:** 42 - Monthly Report Save Flow Consolidation
**Confidence:** HIGH

### Key Findings

1. **Zero new dependencies needed.** Every primitive (debounce hook, sonner toasts, Loader2, useReportStatus.refresh, saveSnapshot, vitest+RTL infrastructure) already exists in repo.
2. **`/api/monthly-report/snapshot` is full-payload only.** D-03's per-field path is not v1-feasible without an API change (Deferred). Full-snapshot replay on every save is the only path; payload is small enough that it's fine at 500ms debounce + queue.
3. **`useDebouncedCallback` already exists** at `ForecastWizardV4.tsx:23-42` — proven 3000ms autosave wizard pattern. Lift to `src/lib/hooks/use-debounced-callback.ts` (with unmount cleanup added) and reuse at 500ms.
4. **`<SaveIndicator/>` should be a sibling to `ReportStatusBar`, not nested inside it.** Keeps Phase 35 component pure; composition lives in `page.tsx` line 938 wrapper.
5. **Finalise lock requires planner-confirmed semantics.** Recommend: finalised reports short-circuit auto-save, and the Finalise button gains an "Unfinalise to edit" sibling. Open question 1.
6. **Auto-save hook MUST only watch `commentary`, not `report.report_data`.** Otherwise Xero refresh triggers reverts (violates Phase 35 D-17).
7. **`beforeunload` guard is required** while in retry-exhausted state to satisfy D-12's "non-dismissable" until-resolved spirit.

### File Created

`/Users/mattmalouf/Desktop/business-coaching-platform/.planning/phases/42-monthly-report-save-flow-consolidation/42-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All deps verified in package.json |
| Architecture | HIGH | Mirrors proven in-repo patterns (useReportStatus sibling, ForecastWizardV4 autosave) |
| Pitfalls | HIGH | Traced through actual code paths including revertReportIfApproved invocation site |
| Endpoint shape | HIGH | Read POST handler directly; confirmed full-payload-only |
| Test plan | HIGH | Vitest + RTL infrastructure already in use; test conventions visible in ReportStatusBar.test.tsx |

### Open Questions

1. Finalise lock semantics — recommend "yes, lock + add Unfinalise button"; planner confirms with user
2. Whether to extract `useDebouncedCallback` to shared util OR copy into the new hook (recommend extract; small refactor)
3. Whether to un-skip and extend `e2e/coach-flow.spec.ts` Playwright test for the type→pause→pill flow (recommend yes, low cost)
4. Whether `/api/monthly-report/commentary` is dead code (Phase 35-07 wired revert into it; current page.tsx uses `/snapshot`) — auditing not required for Phase 42 but planner should note it

### Ready for Planning

Research complete. Planner can now create PLAN.md files for the auto-save hook, SaveIndicator component, BudgetVsActualTable refactor, settings hooks D-17 wiring, and Wave 0 test scaffolding.
