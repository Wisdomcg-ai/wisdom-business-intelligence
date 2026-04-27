---
phase: 42-monthly-report-save-flow-consolidation
plan: 02
subsystem: monthly-report-ui
tags: [react, presentational-component, vitest, rtl, tdd, lucide-react, tailwind]

# Dependency graph
requires:
  - phase: 42-monthly-report-save-flow-consolidation
    provides: SaveStatus discriminated union exported from useAutoSaveReport.ts (Plan 42-01) — type-only import keeps the indicator in lockstep with the hook
  - phase: 42-monthly-report-save-flow-consolidation
    provides: SaveIndicator.test.tsx scaffold with 6 it.todo placeholders (Plan 42-00) — converted to passing it() blocks here
provides:
  - <SaveIndicator/> presentational component at src/app/finances/monthly-report/components/SaveIndicator.tsx — default export
  - Visual contract for the auto-save zone (D-08, D-09, D-12) — wording, colour, spinner, retry button
  - data-testid="save-indicator" for downstream sibling-of-pill assertion in Plan 42-04
affects: [42-04-page-wiring, 42-05-button-removal, future autosave UI consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-presentational component: no useState, no useEffect, no fetch — all state lives upstream in useAutoSaveReport"
    - "Switch-on-discriminated-union with `default: const _: never = status` exhaustiveness guard so future SaveStatus variants force a compile error"
    - "Type-only import (`import type { SaveStatus }`) — zero runtime cost, no circular dep risk if a future plan re-uses the indicator from elsewhere"
    - "TDD red→green→refactor with 3 atomic commits per phase-42 executor protocol (--no-verify because pre-commit hooks not authored yet)"

key-files:
  created:
    - src/app/finances/monthly-report/components/SaveIndicator.tsx
  modified:
    - src/app/finances/monthly-report/components/__tests__/SaveIndicator.test.tsx

key-decisions:
  - "Defined SaveStatus locally in the GREEN commit (parallel-safe), then refactored to import from 42-01's useAutoSaveReport.ts after that hook landed at 245ec3a — keeps the verifier's key_links.pattern regex green and ensures a single source of truth for the type"
  - "Used Tailwind colour scale gray-500 (idle/saved) → gray-600 (saving) → amber-600 (retrying) → rose-700 (failed) — escalating visual weight that matches Notion/Linear's UX precedent (D-08)"
  - "Failed-state Save Now button uses bg-rose-600 + hover:bg-rose-700 (not the orange brand colour) — visually communicates 'this is the recovery action, not the primary action' so the user's eye is drawn here only when something is wrong"
  - "Loader2 sized w-3.5 h-3.5 (14px) so it sits inline with text-sm without bumping the row height — matches the existing ReportStatusBar pill's metric"
  - "inline-flex with gap-1.5 (or gap-2 for the failed state) so the indicator slots into a flex row alongside the existing ReportStatusBar pill in plan 42-04 without bespoke layout work"
  - "Did NOT add an attempt-counter to the retrying label (e.g. 'retrying (2/3)...') — D-08 wording is 'Unsaved — retrying...' verbatim; surfacing the attempt number would leak hook internals into the UX"

patterns-established:
  - "Visual style template for any future indicator-zone component: inline-flex + gap-1.5 + text-sm + colour-by-state Tailwind classes"
  - "TDD commit triplet — test(...): RED, feat(...): GREEN, refactor(...): REFACTOR — with each commit standalone-runnable so a bisect can pinpoint regressions to a single phase of the cycle"

requirements-completed: []

# Metrics
duration: ~3min
completed: 2026-04-27
---

# Phase 42 Plan 02: SaveIndicator Component Summary

**Built `<SaveIndicator/>` — the visible UX surface for the auto-save lifecycle. Pure presentational component, type-driven render via `SaveStatus` discriminated union, 5 status kinds (idle / saved / saving / retrying / failed), 7 RTL tests passing, tsc clean.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-27T01:45:27Z
- **Completed:** 2026-04-27T01:48:40Z
- **Tasks:** 1 (TDD: 3 commits — RED, GREEN, REFACTOR)
- **Files created:** 1
- **Files modified:** 1

## Accomplishments

- Created `src/app/finances/monthly-report/components/SaveIndicator.tsx` (78 lines, default export `SaveIndicator`, named export `SaveIndicatorProps`, type-only import of `SaveStatus` from the hook).
- Filled in `src/app/finances/monthly-report/components/__tests__/SaveIndicator.test.tsx` — 6 `it.todo` placeholders converted to 7 passing `it()` blocks (one decision spec was split into two: idle and saved both render "All changes saved", but each gets its own test for clarity per D-08 acceptance text).
- Component renders the exact wording mandated by D-08 / D-12:
  - `idle` and `saved` → `All changes saved` (gray)
  - `saving` → `Saving...` + Loader2 spinner (gray, slightly darker)
  - `retrying` → `Unsaved — retrying...` + Loader2 spinner (amber)
  - `failed` → `Unsaved — click to retry` + `Save Now` button that fires the `onRetry` callback (rose)
- Exposes `data-testid="save-indicator"` on the top-level wrapper element (D-09) so downstream sibling-of-pill assertions in Plan 42-04 can locate it without depending on Tailwind class names.
- TypeScript exhaustiveness guard: a `default: const _exhaustive: never = status` branch in the switch will produce a compile error if a new `SaveStatus` variant is ever added without a corresponding case.
- Component is purely presentational — `grep -cE "useState|useEffect" SaveIndicator.tsx` returns `0`.
- Full vitest suite GREEN: `345 passed | 9 todo (354)` — todos are 42-01's remaining D-NN coverage (the 9 todos burn down as plans 42-03 / 42-04 land). `npx tsc --noEmit` exits 0.

## Final Wording (D-08 / D-12 — exact strings shipped)

| Status kind | Text                              | Colour class    | Spinner | Action button |
| ----------- | --------------------------------- | --------------- | ------- | ------------- |
| `idle`      | `All changes saved`               | `text-gray-500` | no      | no            |
| `saved`     | `All changes saved`               | `text-gray-500` | no      | no            |
| `saving`    | `Saving...`                       | `text-gray-600` | yes     | no            |
| `retrying`  | `Unsaved — retrying...`           | `text-amber-600`| yes     | no            |
| `failed`    | `Unsaved — click to retry`        | `text-rose-700` | no      | `Save Now` (rose-600 / rose-700 hover) |

`Save Now` button class string (full): `px-2 py-0.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded`. Plan 42-04 wrapper code can use this verbatim if it needs to mirror the failure CTA elsewhere.

## Test Coverage (7 tests)

| # | Test name | Decision tag | What it verifies |
| - | --------- | ------------ | ---------------- |
| 1 | renders "All changes saved" for idle | D-08 | Idle state renders the resting copy |
| 2 | renders "All changes saved" for saved | D-08 | Saved state shares the resting copy (visual continuity) |
| 3 | renders "Saving..." with Loader2 spinner | D-08 | In-flight state has the spinner with `.animate-spin` |
| 4 | renders "Unsaved — retrying..." | D-08 | Retrying state surfaces the amber retrying copy |
| 5 | renders "Unsaved — click to retry" + Save Now button | D-12 | Terminal failure surfaces the manual recovery affordance |
| 6 | clicking Save Now calls onRetry | D-12 | Manual retry button is functional, not decorative |
| 7 | indicator has data-testid="save-indicator" | D-09 | Stable test selector for downstream wiring (42-04) |

## Task Commits

Each commit was standalone and atomic; --no-verify per executor protocol.

1. **RED — failing tests** — `c1980b5` (test)
   - Files: `src/app/finances/monthly-report/components/__tests__/SaveIndicator.test.tsx`
   - 6 `it.todo` → 7 executing `it()` blocks. Vitest fails at import resolution (component doesn't exist yet).
2. **GREEN — minimal implementation** — `ad1aa4b` (feat)
   - Files: `src/app/finances/monthly-report/components/SaveIndicator.tsx` (new, 91 lines)
   - Defined `SaveStatus` locally to avoid coupling with parallel-running 42-01. 7 tests pass; tsc clean.
3. **REFACTOR — single source of truth for SaveStatus** — `9aaa6aa` (refactor)
   - Files: `src/app/finances/monthly-report/components/SaveIndicator.tsx`
   - 42-01 landed at `245ec3a` while this plan was running; switched to `import type { SaveStatus } from '../hooks/useAutoSaveReport'` so the verifier's `key_links.pattern` regex matches and the type has one canonical home. Component shrunk from 91 → 78 lines.

**Plan metadata commit:** appended after this SUMMARY is written (covers SUMMARY.md, STATE.md, ROADMAP.md).

## Files Created/Modified

### Created

- `src/app/finances/monthly-report/components/SaveIndicator.tsx` — default export `SaveIndicator`, named export `SaveIndicatorProps`. Type-only `import type { SaveStatus } from '../hooks/useAutoSaveReport'`. Switch-on-discriminated-union with exhaustiveness guard. 78 lines.

### Modified

- `src/app/finances/monthly-report/components/__tests__/SaveIndicator.test.tsx` — replaced 6 `it.todo` placeholders with 7 executing tests (idle and saved each got their own block per D-08 wording). Imports the component, mocks sonner (template lock-in from Plan 42-00), uses `screen.getByText`, `screen.getByRole`, `screen.getByTestId`, `container.querySelector('.animate-spin')`, and `fireEvent.click`.

## Decisions Made

- **Type-only import of `SaveStatus`** — chose `import type { SaveStatus } from '../hooks/useAutoSaveReport'` rather than redefining the union locally. Single source of truth, zero runtime cost (TS strips type-only imports), no circular dep risk.
- **Exhaustiveness guard via `never`** — added `default: const _exhaustive: never = status; void _exhaustive; return null` so adding a future `SaveStatus` variant without updating this switch is a compile-time error rather than a silent runtime hole. The `void` keeps eslint happy without a `// eslint-disable` line.
- **Did NOT surface `attempt` count in retrying label** — D-08 wording is `Unsaved — retrying...` verbatim. Showing `(2/3)` would leak hook internals into UX and contradict the spec's deliberate softness ("we're handling it; don't panic").
- **Rose-600 button on rose-700 text** — kept the failed-state palette inside the rose family (button slightly darker than the surrounding text for contrast against the white surface). Avoids the orange brand colour because the brand colour means "primary action you should take" and a recovery button shouldn't compete with regular CTAs visually.
- **Symbol used: em-dash (`—`, U+2014)** — matches D-08 / D-12 wording verbatim. Source file is UTF-8; vitest, tsx, and grep all handle it correctly. (Confirmed: `grep -c "Unsaved — retrying" SaveIndicator.tsx` returns 2.)

## Deviations from Plan

**One deviation (Rule 3 — blocking dependency):** Plan 42-01 was scheduled to run in parallel with this plan (Wave 1). At the GREEN-commit moment, `useAutoSaveReport.ts` did not yet exist on disk, so I defined `SaveStatus` locally inside `SaveIndicator.tsx` to avoid blocking on the parallel work. Mid-execution, 42-01 landed at commit `245ec3a` with a structurally identical `SaveStatus` export. I then refactored (commit `9aaa6aa`) to switch to `import type { SaveStatus } from '../hooks/useAutoSaveReport'`. Net effect: the final shipped state matches the plan's `key_links.pattern: "import type.*SaveStatus.*from.*useAutoSaveReport"` exactly. No verifier impact; no behaviour change.

Otherwise: **plan executed exactly as written.** Acceptance criteria check:

| Acceptance check | Expected | Actual |
| ---------------- | -------- | ------ |
| `grep -c "export default function SaveIndicator\|export default SaveIndicator" SaveIndicator.tsx` | ≥1 | 1 |
| `grep -c "export interface SaveIndicatorProps" SaveIndicator.tsx` | 1 | 1 |
| `grep -c "data-testid=\"save-indicator\"" SaveIndicator.tsx` | ≥1 | 4 |
| `grep -c "All changes saved" SaveIndicator.tsx` | ≥1 | 2 |
| `grep -c "Saving\\.\\.\\." SaveIndicator.tsx` | ≥1 | 2 |
| `grep -c "Unsaved — retrying" SaveIndicator.tsx` | ≥1 | 2 |
| `grep -c "Unsaved — click to retry" SaveIndicator.tsx` | ≥1 | 2 |
| `grep -c "Save Now" SaveIndicator.tsx` | ≥1 | 2 |
| `grep -c "Loader2" SaveIndicator.tsx` | ≥1 | 5 |
| `it.todo` count in test file | 0 | 0 |
| Component file line count | ≥60 | 78 |
| `useState` / `useEffect` in component | 0 | 0 (purely presentational) |
| Vitest result for SaveIndicator.test.tsx | ≥6 pass | 7 pass, 0 fail |
| `npx tsc --noEmit` exit code | 0 | 0 |
| Full suite (`npm run test`) | green | 345 pass, 9 todo, 0 fail |

## Issues Encountered

None.

## User Setup Required

None — pure presentational component, no env vars, no DB, no external services.

## Known Stubs

None. The component renders its full UI for every `SaveStatus` variant — no placeholder text, no hardcoded empty data, no "coming soon" labels. The component cannot fire its own saves (no fetch); that's by design — Plan 42-01's `useAutoSaveReport` owns all I/O. Plan 42-04 will mount this indicator in `page.tsx` and wire it to the hook.

## Next Phase Readiness

- **Plan 42-04 (page.tsx wiring) unblocked.** The page can:
  ```typescript
  import SaveIndicator from './components/SaveIndicator'
  import { useAutoSaveReport } from './hooks/useAutoSaveReport'

  const { status, retry } = useAutoSaveReport({ ... })
  // ...
  <ReportStatusBar ... />
  <SaveIndicator status={status} onRetry={retry} />
  ```
- **Sibling-of-pill assertion path:** `screen.getByTestId('save-indicator')` finds the indicator regardless of layout class names; Plan 42-04 / 42-06 e2e specs can use this without coupling to Tailwind.
- **Type drift protection:** if Plan 42-01 ever extends `SaveStatus` (e.g., adds a `paused` variant), `tsc --noEmit` here will fail at the `never` exhaustiveness guard, forcing the indicator to stay in sync.
- **Visual polish (deferred to Plan 42-04 wrapper):** if the indicator-and-pill row needs additional wrapper styling (vertical alignment, divider, pill-first ordering), that's a 42-04 concern. This component ships as a self-contained inline-flex unit that drops into any flex parent.

## Self-Check: PASSED

Verified against the file system and git log:

- [x] `src/app/finances/monthly-report/components/SaveIndicator.tsx` — FOUND
- [x] `src/app/finances/monthly-report/components/__tests__/SaveIndicator.test.tsx` — FOUND
- [x] `.planning/phases/42-monthly-report-save-flow-consolidation/42-02-SUMMARY.md` — FOUND
- [x] Commit `c1980b5` (RED) — FOUND in `git log`
- [x] Commit `ad1aa4b` (GREEN) — FOUND in `git log`
- [x] Commit `9aaa6aa` (REFACTOR) — FOUND in `git log`

---
*Phase: 42-monthly-report-save-flow-consolidation*
*Completed: 2026-04-27*
