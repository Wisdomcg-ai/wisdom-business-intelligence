# Phase 42: Monthly Report Save Flow Consolidation - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the fragmented multi-button save UX on the monthly report page with a single auto-save-on-blur path. End state: coach types a commentary note → focus leaves the field → server-side save fires → `cfo_report_status` reflects the new state immediately → Phase 35's revert chain fires naturally without manual button clicks.

**In scope:** auto-save trigger, save indicator UX, removing two of the three legacy save buttons, retry/backoff on save failure, propagation of `selectedMonth` to the settings save path so revert fires there too.

**Out of scope:** changing the `cfo_report_status` lifecycle (Phase 35 is locked), changing the `monthly_report_snapshots` table schema, real-time concurrent-edit conflict resolution (single-coach-at-a-time assumption holds for v1), offline edit queueing.

**Why this phase exists:** Surfaced during Phase 35 Plan 35-07 UAT. Phase 35's `revertReportIfApproved()` is wired correctly into `/api/monthly-report/snapshot`, but only fires when the page-level "Save Draft" button is clicked. The per-note green ✓ button only updates local React state. Result: coach edits a note → ✓ click → believes saved → no DB write → no revert → pill stays "Sent". Phase 35 made the pre-existing UX problem visible.

</domain>

<decisions>
## Implementation Decisions

### Auto-save trigger

- **D-01:** Both debounce (500ms after last keystroke) AND onBlur. Most robust — nothing slips through. Debounce catches active typing; onBlur catches focus-loss without a final keystroke. *(User selected "You decide" — Claude pick: industry standard pattern, used by Notion/Linear.)*
- **D-02:** Debounce window: 500ms after last keystroke. Tight enough to feel responsive; loose enough to avoid double-saves on quick succession of changes.
- **D-03:** Save scope: per-field on blur (saves only the field that changed) is preferred IF the existing snapshot endpoint supports partial updates; if not, full-snapshot save on every change is acceptable for v1 (research to confirm during planning).

### Buttons removed

- **D-04:** **Per-note green ✓ button removed entirely** from `BudgetVsActualTable.tsx`. Auto-save makes it redundant and the current behavior (saves only to local state) is actively misleading.
- **D-05:** **Page-level "Save Draft" button removed.** Auto-save replaces it. The save indicator near the pill (D-08) provides reassurance.
- **D-06:** **"Finalise" button KEPT** (user chose to retain). Note: Finalise toggles `monthly_report_snapshots.status: 'draft' → 'final'`, which is a distinct state machine from `cfo_report_status` (Phase 35 lifecycle). With auto-save in place, Finalise becomes purely a "lock the report from auto-save edits" action — data is already persisted by auto-save. Planner should clarify exact semantics: does Finalise also stop auto-save from firing on this report afterwards? (Recommended: yes, finalised reports become read-only until reverted.)
- **D-07:** **"Approve & Send" button KEPT** (Phase 35). No change to its behavior.

### Save indicator UX

- **D-08:** Small text near the status pill, in the same top-bar info zone:
  - Idle / saved: `All changes saved`
  - Saving in flight: `Saving...` (with subtle spinner)
  - Save failed: `Unsaved — retrying...` (then `Unsaved — click to retry` after retry budget exhausted)
- **D-09:** Indicator does NOT obscure the pill. Both visible side-by-side or stacked.
- **D-10:** No toasts on successful save (avoid noise). Toasts only on terminal failure after retries.

### Failure handling

- **D-11:** On `/api/monthly-report/snapshot` POST failure: indicator flips to `Unsaved — retrying...`, automatic retry with exponential backoff. **Retry budget: 3 attempts** (1s, 2s, 4s).
- **D-12:** After 3 failed retries: indicator flips to `Unsaved — click to retry`, exposes a manual "Save Now" button in the indicator zone, fires a single error toast (non-dismissable until retry succeeds or user navigates away with confirm).
- **D-13:** During in-flight save, edits to other fields are queued; when current save completes, queued state is sent in next debounce window.
- **D-14:** Optimistic UI: the field shows the new value immediately; the indicator reflects async save status separately. No reverting the field on failure (user keeps their text on screen even if server didn't accept it).

### Pill reactivity

- **D-15:** When auto-save POST returns 2xx, immediately call `useReportStatus.refresh()` to refetch the pill state. Don't wait for the 10s poll. This makes the revert visible within ~500ms of the user's edit.
- **D-16:** The `useReportStatus.refresh` exposed in 35-07 is the integration point. No new endpoint needed.

### Settings save path (Phase 35 follow-up)

- **D-17:** Settings panel save path (template change, section toggles, PDF layout) should also fire `useReportStatus.refresh()` after success — same as commentary save. The Phase 35 wiring already supports `report_month` propagation (35-07 task 1); planner just needs to call the refresh.

### Claude's Discretion

- Exact debounce vs blur library / hook implementation
- Retry backoff timer implementation (vanilla JS `setTimeout` vs library)
- Save indicator typography and exact wording
- Whether per-field saves are partial-snapshot updates (require API change) or full-snapshot replays (no API change)
- Whether finalised reports lock auto-save (recommended: yes; planner confirms)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 35 dependencies (LOCKED — do not modify)
- `.planning/phases/35-report-approval-delivery-workflow/35-CONTEXT.md` — Phase 35 decisions D-01..D-23
- `.planning/phases/35-report-approval-delivery-workflow/35-04-SUMMARY.md` — `revertReportIfApproved` helper signature
- `.planning/phases/35-report-approval-delivery-workflow/35-06-SUMMARY.md` — D-09 amendment (single SaaS sender via env vars)
- `.planning/phases/35-report-approval-delivery-workflow/35-07-SUMMARY.md` — known UX gap that this phase fixes; revert wiring details

### Pre-existing save flow (codebase pattern)
- `src/app/finances/monthly-report/page.tsx` lines 595-617 — `handleCommentaryChange` (local-state only) + `handleSaveSnapshot` (DB persistence)
- `src/app/finances/monthly-report/page.tsx` lines 905-920 — Save Draft + Finalise buttons (to be removed in D-04, D-05)
- `src/app/finances/monthly-report/components/BudgetVsActualTable.tsx` lines 242-270 — `CommentaryLine` component with green ✓ button + `handleSave` (to be removed in D-04)
- `src/app/finances/monthly-report/hooks/useMonthlyReport.ts` lines 350-388 — `saveSnapshot` function (POST `/api/monthly-report/snapshot`)
- `src/app/finances/monthly-report/hooks/useReportStatus.ts` — pill auto-refresh from 35-07 (call `.refresh()` from new auto-save hook)

### Settings save (already Phase 35 wired)
- `src/app/finances/monthly-report/components/ReportSettingsPanel.tsx` — accepts `reportMonth` prop, threads to settings POST
- `src/app/finances/monthly-report/hooks/usePDFLayout.ts` — accepts `reportMonth` arg, threads to settings POST

### State machines (orthogonal)
- `cfo_report_status.status`: draft / ready_for_review / approved / sent (Phase 35 lifecycle)
- `monthly_report_snapshots.status`: draft / final (this phase: Finalise button toggles)

### Project context
- `.planning/STATE.md` — recent activity
- `.planning/PROJECT.md` — platform overview, Australian market context
- `CLAUDE.md` at repo root if present

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`useReportStatus.refresh()`** — exposed by Phase 35-07. New auto-save hook calls this after successful save to refresh the pill immediately (D-15).
- **`saveSnapshot()` in `useMonthlyReport.ts`** — already POSTs to the snapshot endpoint with full report payload. Auto-save can wrap this with debounce/blur trigger.
- **`/api/monthly-report/snapshot` route** — already wired with revert helper from Phase 35-07. No backend changes needed for v1.
- **`CommentaryLine` component** in `BudgetVsActualTable.tsx` — has its own edit/save/cancel state. Refactor to remove green ✓ button and replace `handleSave` with `onNoteChange(...)` propagating up to a debounced auto-save hook.
- **Sonner toasts** — already used across the codebase for error feedback (D-12).

### Established Patterns

- **Hook-based state mgmt** — useMonthlyReport, useReportStatus, useReportTemplates are all sibling hooks on the page. New hook (e.g., `useAutoSave` or extension to `useMonthlyReport`) follows the same pattern.
- **POST `/api/monthly-report/snapshot`** — entire report payload posted on save; not partial. Existing pattern; auto-save uses the same.
- **Save indicator zone** — Phase 35 added the status pill in the top toolbar. Save indicator can sit next to or below the pill in the same zone.

### Integration Points

- **`page.tsx` → handleCommentaryChange** — currently updates local state only. New code: also triggers debounced auto-save via the new hook.
- **`BudgetVsActualTable.tsx` → CommentaryLine onSave** — currently fires `onNoteChange` (which goes to local state only). New behavior: blur on textarea triggers `onNoteChange` directly; remove the green ✓ button.
- **`ReportSettingsPanel.tsx` → settings save** — already triggers `/api/monthly-report/settings` POST (Phase 35-07 wired); add `useReportStatus.refresh()` call after success.

</code_context>

<specifics>
## Specific Ideas

- "Coach types → DB persists → no thinking required" — the desired outcome
- Save indicator wording: lift directly from Notion / Linear (`All changes saved` / `Saving...` / `Unsaved`)
- "All changes saved" is the resting state — coach knows their work is safe
- Optimistic UI: the field on screen always shows what the user typed; the indicator handles async save state separately
- Finalise stays — but the planner should clarify whether finalised reports lock further auto-saves (recommended yes; confirm with user during execution if unclear)

</specifics>

<deferred>
## Deferred Ideas

- **Real-time concurrent-edit conflict resolution** — multiple coaches editing the same report simultaneously. Out of scope; v1 assumes single-coach-at-a-time. Add when it becomes an actual problem.
- **Offline edit queueing** — local IndexedDB queue, replay on reconnect. Out of scope for v1; rely on browser cache + retry.
- **Per-field partial-snapshot updates** — saving only the field that changed instead of the full snapshot. Considered as a possible D-03 path; decision deferred to planner based on what the existing endpoint accepts.
- **Save history / version timeline** — show coach last 5 versions of the report with timestamps. Future feature; out of scope.
- **Approve & Send sub-states** — re-evaluating "Mark Ready for Review" semantics with auto-save in place. Phase 35 is locked; revisit in a future cleanup pass if needed.
- **Finalise → automatic Approve & Send** — automation that finalising a report also queues delivery. Out of scope; coach explicitly chooses each action.

</deferred>

---

*Phase: 42-monthly-report-save-flow-consolidation*
*Context gathered: 2026-04-27*
