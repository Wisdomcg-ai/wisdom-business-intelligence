---
phase: 42-monthly-report-save-flow-consolidation
plan: 00
subsystem: testing
tags: [react-hooks, debounce, vitest, fake-timers, autosave]

# Dependency graph
requires:
  - phase: 16-forecast-wizard-v4
    provides: in-tree useDebouncedCallback (3000ms autosave wizard) — pattern lifted to shared lib
  - phase: 35-report-approval-delivery-workflow
    provides: ReportStatusBar.test.tsx (vitest+RTL pattern mirrored by new scaffolds), useReportStatus.refresh integration point referenced by D-15 todos
provides:
  - Shared useDebouncedCallback hook with unmount cleanup at @/lib/hooks/use-debounced-callback (Pitfall 1 paid down)
  - 4 it.todo test scaffolds enumerating D-01..D-15, D-17 contracts for downstream Phase 42 plans
  - Wave 0 Nyquist gate satisfied — every Phase 42 surface has a test file on disk
affects: [42-01-auto-save-hook, 42-02-save-indicator, 42-03-commentary-line-refactor, 42-04-settings-d17-wiring, future autosave consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared React-hook utilities under src/lib/hooks/ (first occupant: use-debounced-callback)"
    - "Wave 0 it.todo scaffolds — describe blocks reserve test file on disk and explicitly enumerate D-NN contracts before any production code is written"
    - "Debounce hook unmount-cleanup: useEffect returning a teardown that clearTimeout's the in-flight timer"

key-files:
  created:
    - src/lib/hooks/use-debounced-callback.ts
    - src/lib/hooks/__tests__/use-debounced-callback.test.tsx
    - src/app/finances/monthly-report/hooks/__tests__/useAutoSaveReport.test.tsx
    - src/app/finances/monthly-report/components/__tests__/SaveIndicator.test.tsx
    - src/app/finances/monthly-report/components/__tests__/CommentaryLine.test.tsx
    - src/app/finances/monthly-report/hooks/__tests__/usePDFLayout.test.tsx
  modified:
    - src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx

key-decisions:
  - "Lifted useDebouncedCallback verbatim from ForecastWizardV4.tsx:23-42 (no behaviour change at the existing 3000ms call site; same signature, same useCallback identity rules)"
  - "Added unmount-cleanup useEffect with empty deps inside the shared hook so every consumer (forecast wizard now, monthly-report auto-save next) inherits the Pitfall 1 fix automatically"
  - "Test scaffolds use it.todo (not it.skip or describe.skip) so vitest reports them as pending, not skipped, making the pending-count a visible Wave 0 progress indicator"
  - "All 4 scaffold files declare the sonner mock in the header even though no real toast assertions exist yet — locks in the import contract so downstream plans don't have to re-derive it"
  - "Used a Harness component with a mutable fnRef (not @testing-library/react-hooks renderHook) for the debounce tests so the unmount path goes through the real RTL render lifecycle"

patterns-established:
  - "Shared hook location: src/lib/hooks/{kebab-case-name}.ts with co-located __tests__/ subdirectory"
  - "JSDoc on shared hooks references the originating phase + pitfall ID so future readers can trace the rationale"
  - "Wave 0 test scaffolds: header comment links to CONTEXT.md decisions, every it.todo is prefixed with the D-NN tag it covers"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-04-27
---

# Phase 42 Plan 00: Wave 0 Foundation Summary

**Shared `useDebouncedCallback` hook (with unmount cleanup) extracted to `@/lib/hooks/use-debounced-callback`, plus 4 `it.todo` test scaffolds enumerating every D-01..D-15 + D-17 contract for downstream Phase 42 plans.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-27T01:38:00Z
- **Completed:** 2026-04-27T01:41:08Z
- **Tasks:** 2
- **Files created:** 6
- **Files modified:** 1

## Accomplishments

- Lifted `useDebouncedCallback` from `ForecastWizardV4.tsx:23-42` to `src/lib/hooks/use-debounced-callback.ts` as a named export — the function body is preserved verbatim, the `useCallback` deps remain `[delay]`, the call site at line 1183 (`useDebouncedCallback(performAutoSave, 3000)`) continues to work without modification.
- Paid down Pitfall 1 once, in the shared hook: a `useEffect` with empty deps now returns a teardown that calls `clearTimeout(timeoutRef.current)`, so any pending debounced fire is cancelled when the host unmounts. Every future consumer (the upcoming `useAutoSaveReport` in 42-01 included) inherits the fix automatically.
- 5-test vitest fake-timer suite covers the 5 behaviours the plan demanded — all pass.
- 4 `it.todo` scaffolds (28 todos total) enumerate the full Phase 42 contract surface:
  - `useAutoSaveReport.test.tsx` (13 todos: D-01 ×2, D-02 ×2, D-03, D-06, D-10, D-11, D-12, D-13, D-14, D-15, Pitfall 6)
  - `SaveIndicator.test.tsx` (6 todos: D-08 ×3, D-09, D-12 ×2)
  - `CommentaryLine.test.tsx` (6 todos: D-04 ×3, D-14, D-01, UX continuity)
  - `usePDFLayout.test.tsx` (3 todos: D-17 ×3)
- Suite stays GREEN: vitest reports `28 passed | 4 skipped (32) | Tests 323 passed | 28 todo (351)` — todos are pending, not failures.
- TypeScript clean: `npx tsc --noEmit` exits 0.

## Task Commits

Each task was committed atomically (commits use `--no-verify` per executor protocol):

1. **Task 0.1: Lift useDebouncedCallback to shared lib + add unmount cleanup** — `ba90c46` (refactor)
   - Files: `src/lib/hooks/use-debounced-callback.ts` (new), `src/lib/hooks/__tests__/use-debounced-callback.test.tsx` (new), `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` (deleted local helper, added shared import)
2. **Task 0.2: Create skipped test scaffolds for the 4 Phase 42 surfaces** — `b4f34ea` (test)
   - Files: `useAutoSaveReport.test.tsx`, `SaveIndicator.test.tsx`, `CommentaryLine.test.tsx`, `usePDFLayout.test.tsx`

**Plan metadata commit:** appended after this SUMMARY is written (covers SUMMARY.md, STATE.md, ROADMAP.md).

## Files Created/Modified

### Created

- `src/lib/hooks/use-debounced-callback.ts` — shared debounce hook (named export `useDebouncedCallback`); JSDoc references Phase 42 + Pitfall 1; includes unmount-cleanup `useEffect`.
- `src/lib/hooks/__tests__/use-debounced-callback.test.tsx` — 5-test vitest fake-timer suite (pre-delay no-op, post-delay invocation, latest-wins, unmount cleanup, multi-window separation).
- `src/app/finances/monthly-report/hooks/__tests__/useAutoSaveReport.test.tsx` — 13 `it.todo` placeholders for Plan 42-01.
- `src/app/finances/monthly-report/components/__tests__/SaveIndicator.test.tsx` — 6 `it.todo` placeholders for Plan 42-02.
- `src/app/finances/monthly-report/components/__tests__/CommentaryLine.test.tsx` — 6 `it.todo` placeholders for Plan 42-03.
- `src/app/finances/monthly-report/hooks/__tests__/usePDFLayout.test.tsx` — 3 `it.todo` placeholders for Plan 42-04.

### Modified

- `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` — removed lines 22-42 (local `useDebouncedCallback` definition), added `import { useDebouncedCallback } from '@/lib/hooks/use-debounced-callback'` near top. Net delta: -22 lines, +1 line. The existing `useCallback` and `useRef` imports remain (still used by other code in the file).

## Decisions Made

- **Used `it.todo` instead of `it.skip`** — todos render as "pending" in vitest's reporter, giving a visible progress indicator (28 todos at Wave 0 → 0 todos at Phase 42 close). `it.skip` would render as "skipped" and read as a regression risk.
- **Sonner mock pre-declared in every scaffold** — locks in the import contract so downstream plans don't have to re-derive it from `ReportStatusBar.test.tsx`. Cost is negligible (4 lines per file), benefit is zero-friction TDD onboarding for plans 42-01..42-04.
- **Harness component for debounce tests, not `renderHook`** — chose `render(<Harness/>) + unmount()` so the Pitfall 1 regression test exercises the real RTL component lifecycle, including the `useEffect` cleanup. `renderHook`'s unmount path is technically equivalent but adds an indirection that obscures the assertion.
- **Did NOT extract `useCallback`/`useRef` imports from ForecastWizardV4** — both are still used elsewhere in the 1300-line component, so leaving the imports untouched avoided unnecessary churn.

## Deviations from Plan

**One micro-deviation (Rule 3 — blocking, no-op fix):** the prompt's `<files_to_read>` block referenced `src/app/finances/forecast/ForecastWizardV4.tsx` (without `components/wizard-v4/`), which does not exist. The PLAN itself correctly references `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` (the actual location). I used the correct path from the PLAN. No code changes; just a path-reconciliation call-out.

Otherwise: **None — plan executed exactly as written.** Both tasks' acceptance criteria met:

| Acceptance check | Expected | Actual |
| --- | --- | --- |
| `grep -c "function useDebouncedCallback" ForecastWizardV4.tsx` | 0 | 0 |
| `grep -c "from '@/lib/hooks/use-debounced-callback'" ForecastWizardV4.tsx` | 1 | 1 |
| `grep -c "export function useDebouncedCallback" use-debounced-callback.ts` | 1 | 1 |
| `grep -c "clearTimeout" use-debounced-callback.ts` | ≥2 | 3 |
| `it.todo` count: useAutoSaveReport / SaveIndicator / CommentaryLine / usePDFLayout | ≥13 / ≥6 / ≥6 / ≥3 | 13 / 6 / 6 / 3 |
| `npm run test` exit code | 0 | 0 (323 pass, 28 todo, 0 fail) |
| `npx tsc --noEmit` exit code | 0 | 0 |

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Wave 0 invariants confirmed:** shared debounce hook is the only debounce hook in the repo (`grep -r "function useDebouncedCallback" src/` returns 0 hits outside the shared lib); 4 test files exist on disk for the surfaces 42-01..42-04 will modify; the existing forecast wizard's 3000ms autosave path is regression-safe via type identity (same signature, same useCallback identity rules).
- **Plans 42-01..42-04 unblocked.** They can now:
  - Import `useDebouncedCallback` from `@/lib/hooks/use-debounced-callback` (D-02 — 500ms debounce window).
  - Fill in the existing `it.todo` scaffolds rather than create new test files.
  - Trust that unmount cleanup is already handled — no need for per-call-site `mountedRef` guards on the debounce timer itself (other unmount races, e.g. async fetch resolves, still need their own guards).
- **Open questions deferred from Research (not in scope for 42-00):** Finalise lock semantics (Q1), `e2e/coach-flow.spec.ts` un-skip (Q3), `/api/monthly-report/commentary` audit (Q4) — picked up by 42-01..42-04 planners.

## Self-Check: PASSED

Verified against the file system and git log:

- [x] `src/lib/hooks/use-debounced-callback.ts` — FOUND
- [x] `src/lib/hooks/__tests__/use-debounced-callback.test.tsx` — FOUND
- [x] `src/app/finances/monthly-report/hooks/__tests__/useAutoSaveReport.test.tsx` — FOUND
- [x] `src/app/finances/monthly-report/components/__tests__/SaveIndicator.test.tsx` — FOUND
- [x] `src/app/finances/monthly-report/components/__tests__/CommentaryLine.test.tsx` — FOUND
- [x] `src/app/finances/monthly-report/hooks/__tests__/usePDFLayout.test.tsx` — FOUND
- [x] Commit `ba90c46` (Task 0.1) — FOUND in `git log`
- [x] Commit `b4f34ea` (Task 0.2) — FOUND in `git log`

---
*Phase: 42-monthly-report-save-flow-consolidation*
*Completed: 2026-04-27*
