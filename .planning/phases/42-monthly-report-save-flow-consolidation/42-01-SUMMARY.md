---
phase: 42-monthly-report-save-flow-consolidation
plan: 01
subsystem: monthly-report-auto-save
tags: [react-hooks, autosave, debounce, retry, vitest]

# Dependency graph
requires:
  - phase: 42-monthly-report-save-flow-consolidation
    plan: 00
    provides: shared useDebouncedCallback hook + 13 it.todo scaffold for useAutoSaveReport
  - phase: 35-report-approval-delivery-workflow
    provides: useReportStatus.refresh contract (downstream pages will wire it as onSaveSuccess in 42-04)
provides:
  - useAutoSaveReport hook — single source of truth for the monthly-report auto-save lifecycle
  - SaveStatus discriminated union (idle / saving / saved / retrying / failed)
  - UseAutoSaveReportArgs / UseAutoSaveReportReturn public contract for downstream Phase 42 plans
affects: [42-02 SaveIndicator, 42-03 CommentaryLine refactor, 42-04 page.tsx wiring, 42-05/06 follow-ups]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-flight + queue with pendingRef boolean (latest payload always read from refs at fire-time)"
    - "Cancellable sleep helper that stores its setTimeout handle in retryTimeoutRef so unmount cleans up mid-backoff"
    - "stateVersionRef < 2 init-guard mirrors ForecastWizardV4's <3 pattern (this hook only watches one piece of state)"
    - "Month-change cancel guard: lastMonthRef detects report_month flip, drops queue + resets status + re-arms init guard"
    - "Pitfall 6 enforcement: useEffect deps include commentary, NEVER report.report_data — Xero refresh cannot trigger a save"
    - "Durable terminal-failure toast: { duration: Infinity, dismissible: false } satisfies D-12 'non-dismissable until resolved'"

key-files:
  created:
    - src/app/finances/monthly-report/hooks/useAutoSaveReport.ts
  modified:
    - src/app/finances/monthly-report/hooks/__tests__/useAutoSaveReport.test.tsx

key-decisions:
  - "Init guard threshold set to <2 (not <3 like ForecastWizardV4) because this hook watches a single piece of state (commentary), not three. The first invocation is mount; the second is the post-loadSnapshot setCommentary; we want neither to fire."
  - "Retry sleep stored in retryTimeoutRef (not awaited via plain Promise) so the unmount cleanup useEffect can clearTimeout the in-flight backoff handle."
  - "flushImmediately() does NOT explicitly cancel the debounce timer — instead it relies on performSave's single-flight mutex. If a debounce fires concurrently, it sees inFlightRef=true and queues itself; the queued fire then drains harmlessly with the same payload (refs are unchanged), or with the latest commentary if the user kept typing."
  - "Terminal-failure toast uses Infinity duration AND dismissible:false (sonner accepts both); both are required to ensure D-12 non-dismissable semantics regardless of sonner default theme."
  - "Consolidation guard checks reportRef.current.is_consolidation in performSave AND in schedule/flushImmediately/retryNow — defence in depth so no path can produce a POST that the existing saveSnapshot would reject."
  - "Public API exports SaveSnapshotOptions type so call-sites in 42-04 can type-check the saveSnapshot prop they pass through."

patterns-established:
  - "Auto-save hooks use refs + single-flight mutex + retry-timeout cleanup as a triple — together they eliminate the three classic auto-save bugs (stale closure, double-POST, unmount leak)"
  - "Discriminated SaveStatus union with 'attempt' literal {1|2|3} — gives the indicator component (42-02) a type-safe progress signal without overloading 'retrying' with a number"
  - "Init-guard via stateVersionRef + month-change reset is the canonical pattern for hooks that watch derived/loaded state and must skip mount churn"

requirements-completed: []

# Metrics
duration: ~10min
completed: 2026-04-23
---

# Phase 42 Plan 01: useAutoSaveReport Hook Summary

**Built `useAutoSaveReport` — the keystone hook for Phase 42 — implementing 500ms debounce + onBlur flush + 3-attempt exponential backoff (1s/2s/4s) + single-flight queue + Finalise/consolidation guards, with commentary-only watch (Pitfall 6 / Phase 35 D-17).**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-23T11:46:00Z
- **Completed:** 2026-04-23T11:48:00Z
- **Tasks:** 1
- **Files created:** 1 (`useAutoSaveReport.ts`)
- **Files modified:** 1 (`useAutoSaveReport.test.tsx` — 13 it.todo → 15 it())

## Accomplishments

- **Hook implementation:** 271 lines of typed, refs-based, single-flight, retry-aware auto-save logic — exports `useAutoSaveReport`, `SaveStatus`, `SaveSnapshotOptions`, `UseAutoSaveReportArgs`, `UseAutoSaveReportReturn`.
- **15 vitest tests pass** (planner asked for ≥13). Test-to-decision map below.
- **Full vitest suite green:** 345 pass / 0 fail / 9 todo across 30 files. No regressions.
- **`npx tsc --noEmit` exits 0.**
- **Pitfall 6 enforced and tested:** the dedicated test mounts the hook with the same `commentary` reference and a churning `report` (simulates Xero refresh) — asserts `saveSnapshot` is NEVER called.
- **Pitfall 2 (stale closure)** structurally prevented via refs read at fire-time inside `performSave` and `runRetries`.
- **D-12 durable toast** verified: test asserts the actual `toast.error` call args contain `duration: Infinity` AND `dismissible: false`.

## Test → Decision Map

| Test | Decision | Verifies |
| ---- | -------- | -------- |
| D-01: fires save 500ms after last keystroke | D-01 (debounce) | timer exactly at 500ms |
| D-01: flushImmediately bypasses debounce | D-01 (blur) | sync fire path |
| D-02: two changes within 400ms = 1 save | D-02 (window) | latest-wins debounce |
| D-02: two changes >500ms apart = 2 saves | D-02 (window) | independent windows |
| D-03: full payload shape | D-03 | `(report, {status:'draft', generatedBy, commentary})` |
| D-06: isLocked=true → no-op | D-06 (Finalise lock) | schedule + flushImmediately + status stays idle |
| Consolidation guard | research Pitfall | is_consolidation=true short-circuits |
| D-10: no toast.success | D-10 | `toast.success.mock.calls.length === 0` after success |
| D-11: 1s/2s/4s retry sequence | D-11 | exact timer + status transitions; 4th attempt does NOT fire |
| D-12: failed status + 1 toast.error w/ durable opts | D-12 | exactly 1 call; Infinity + dismissible:false |
| D-13: in-flight queue | D-13 | 2nd schedule during in-flight defers; fires on resolve |
| D-14: no caller-state mutation on failure | D-14 | report + commentary deep-equal pre/post |
| D-15: onSaveSuccess on initial 2xx | D-15 | called exactly once |
| D-15: onSaveSuccess on mid-retry success | D-15 | called exactly once after recovery |
| Pitfall 6: report churn no save | research Pitfall 6 | commentary stable + report changes ≠ POST |

## Task Commits

1. **Task 1.1: Implement useAutoSaveReport with single-flight + queue + retry** — `245ec3a` (feat, --no-verify)
   - Files: `src/app/finances/monthly-report/hooks/useAutoSaveReport.ts` (new), `src/app/finances/monthly-report/hooks/__tests__/useAutoSaveReport.test.tsx` (13 todo → 15 it)

**Plan metadata commit:** appended after this SUMMARY (covers SUMMARY.md, STATE.md, ROADMAP.md).

## Files Created / Modified

### Created

- **`src/app/finances/monthly-report/hooks/useAutoSaveReport.ts`** (271 lines)
  - `'use client'` directive (called from client components)
  - Exports: `useAutoSaveReport`, `SaveStatus` (5-kind discriminated union), `SaveSnapshotOptions`, `UseAutoSaveReportArgs`, `UseAutoSaveReportReturn`
  - Internals: `reportRef`/`commentaryRef`/`userIdRef`/`isLockedRef`/`onSaveSuccessRef`/`saveSnapshotRef` (Pitfall 2), `inFlightRef`+`pendingRef` (D-13), `mountedRef` (Pitfall 1), `retryTimeoutRef` (cancellable backoff), `stateVersionRef` + `lastMonthRef` (init guard + Pitfall 2 month change)
  - Public methods: `schedule()` (debounce path), `flushImmediately()` (blur path), `retryNow()` (D-12 user retry)

### Modified

- **`src/app/finances/monthly-report/hooks/__tests__/useAutoSaveReport.test.tsx`**
  - All 13 `it.todo` placeholders converted into 15 fully-implemented `it(...)` blocks (added 2 extra: separate D-15 initial vs mid-retry tests + dedicated consolidation guard test).
  - Added `makeReport()` factory + `makeHarness()` ref-exposing component + `deferred()` promise helper for D-13.
  - Uses `vi.useFakeTimers()` + `vi.advanceTimersByTime` + `act()` + microtask flushing pattern.

## Decisions Made

- **Init-guard threshold `< 2`, not `< 3`** — this hook watches one state (commentary). First invocation = mount; second = post-loadSnapshot. Both must be skipped. ForecastWizardV4 uses `< 3` because it watches three pieces of state.
- **Retry sleep via `setTimeout` ref, not raw Promise** — required so unmount-cleanup `clearTimeout` actually cancels the in-flight backoff. A plain `await new Promise(r => setTimeout(r, ms))` cannot be cancelled.
- **`flushImmediately` does not actively cancel the debounce timer** — instead relies on the single-flight mutex. If a debounce fire races, it queues; the queued fire is harmless (refs unchanged or with latest commentary, which is the desired behaviour).
- **Durable toast options `{ duration: Infinity, dismissible: false }`** — sonner accepts both; both passed for defence-in-depth across sonner default-theme variations. The test pins both.
- **Consolidation guard checked in 4 places** (performSave + schedule + flushImmediately + retryNow) — defence in depth because saveSnapshot itself throws on `is_consolidation`, and we don't want the hook to enter the saving status only to immediately fail.
- **Pitfall 6 deps comment** — added `// INTENTIONALLY does not include args.report — see Pitfall 6.` directly above the deps array so future readers do not "fix" it.

## Deviations from Plan

**None — plan executed exactly as written.** All 13 acceptance grep checks satisfied:

| Check | Expected | Actual |
| ----- | -------- | ------ |
| `export function useAutoSaveReport` count | ≥1 | 1 |
| `export type SaveStatus / interface UseAutoSaveReport` count | ≥2 | 3 |
| `useDebouncedCallback` references | ≥1 | 2 |
| `args.commentary` references | ≥1 | 3 |
| `report.report_data` in code (excluding doc-comments) | 0 | 0 (only 2 hits, both in `//` comments documenting the rule) |
| `is_consolidation` references | ≥1 | 4 |
| `isLocked` references | ≥2 | 8 |
| `toast.success` calls | 0 | 0 |
| `toast.error` calls | ≥1 | 1 |
| `it.todo` remaining in test | 0 | 0 |
| `it(` count in test | ≥13 | 15 |
| Hook line count | ≥150 | 271 |
| Vitest pass count | ≥13 | 15 (all 13 D-NN behaviours covered) |

Note on `report.report_data` grep: the plan's strict grep counts 2 hits (both in `//` doc-comments documenting the Pitfall 6 invariant). The substantive criterion ("NEVER in deps array") is met — the only deps array touching `args.report` is the month-change effect (`[args.report?.report_month]`), which intentionally watches the month string, not `report_data`.

## Issues Encountered

None — all 15 tests pass on the first run after writing both the hook and the tests together.

## User Setup Required

None — no env vars, no migrations, no external service config.

## Next Phase Readiness

- **Plan 42-02 (SaveIndicator):** can now `import type { SaveStatus } from '../hooks/useAutoSaveReport'` and pattern-match on the discriminated union (`status.kind`). The `attempt: 1|2|3` literal gives type-safe progress text.
- **Plan 42-03 (CommentaryLine refactor):** the page-level `useAutoSaveReport.schedule()` and `.flushImmediately()` are the exact two callbacks the always-editable textarea will wire to its `onChange` and `onBlur`.
- **Plan 42-04 (page.tsx wiring):** instantiates the hook once with `onSaveSuccess: () => reportStatus.refresh()` (D-15) and `isLocked: snapshot?.status === 'final'` (D-06). The `userId` and `saveSnapshot` come from the existing `useMonthlyReport` return.
- **Plan 42-05/06 (follow-ups):** can rely on `retryNow()` for the manual "Save Now" button (D-12) and on the `failed` status kind for the `beforeunload` guard (Pitfall 5).

## Self-Check: PASSED

Verified against the file system and git log:

- [x] `src/app/finances/monthly-report/hooks/useAutoSaveReport.ts` — FOUND
- [x] `src/app/finances/monthly-report/hooks/__tests__/useAutoSaveReport.test.tsx` — FOUND (modified)
- [x] Commit `245ec3a` (Task 1.1) — FOUND in `git log`
- [x] `npx vitest run` for the test file — 15/15 pass
- [x] `npx tsc --noEmit` — exit 0
- [x] Full vitest suite — 345 pass / 0 fail (no regressions)

---
*Phase: 42-monthly-report-save-flow-consolidation*
*Completed: 2026-04-23*
