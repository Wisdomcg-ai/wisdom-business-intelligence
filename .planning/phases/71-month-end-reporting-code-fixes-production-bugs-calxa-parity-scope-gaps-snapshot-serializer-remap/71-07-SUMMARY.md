---
phase: 71-month-end-reporting-code-fixes-production-bugs-calxa-parity-scope-gaps-snapshot-serializer-remap
plan: 07
subsystem: reporting
tags: [pdf, jspdf, jspdf-autotable, monthly-report, variance, tinting, polarity, tdd, vitest]

requires:
  - phase: 71
    provides: "Phase 70 month-end audit gap S4 — fragile string-parsing tint detection in monthly-report PDF"
provides:
  - "decideTintColor(polarity, displayText) pure helper exported from monthly-report-pdf-service.ts"
  - "VariancePolarity type ('positive' | 'negative' | 'neutral') exported from same module"
  - "applyVarianceTint now reads data.cell.raw._polarity (structured metadata) with string-parsing as backward-compat fallback"
  - "buildLineRow emits {content, _polarity} cells for variance_amount, variance_percent, ytd_variance_amount, ytd_variance_percent"
  - "Regression suite at src/__tests__/services/monthly-report-pdf-variance-tint.test.ts (8 tests pinning both polarity-driven path and legacy fallback)"
affects: ["monthly-report", "pdf-generation", "phase-71-calxa-migration", "future-locale-or-formatting-changes"]

tech-stack:
  added: []
  patterns:
    - "Polarity-as-metadata pattern: track structured polarity on raw data; tint reads metadata, not formatted display text. Eliminates locale/formatting-shape coupling."
    - "Single-module helper export (no sibling-file proliferation) — pure helpers co-located with the class that uses them, exported by name for direct test import."
    - "Backward-compat string fallback retained inside the helper so legacy callers (e.g. didParseCell at L1054) keep working during incremental rollout."

key-files:
  created:
    - src/__tests__/services/monthly-report-pdf-variance-tint.test.ts
  modified:
    - src/app/finances/monthly-report/services/monthly-report-pdf-service.ts

key-decisions:
  - "decideTintColor lives in monthly-report-pdf-service.ts (module top-level) — NOT a sibling helper file. Per plan lock (post-checker M3): single source of truth, zero circular-import risk, single named-export import in test."
  - "Backward-compat string parsing kept inside decideTintColor so the change is non-breaking. didParseCell red-text at L1054 was intentionally NOT touched — the polarity-attachment in buildLineRow is a global improvement that does not force all call sites to migrate at once."
  - "Polarity computed from the raw numeric value (line.variance_amount < 0 → 'negative', > 0 → 'positive', === 0 → 'neutral') via private polarityOf() helper — single canonical conversion."

patterns-established:
  - "Pattern: emit jsPDF autoTable cells as {content, _polarity} objects when downstream styling needs to discriminate sign without re-parsing display text. _polarity is exposed via data.cell.raw._polarity in didParseCell."
  - "Pattern: extract pure decision helpers from class methods so vitest can target them by name without instantiating the service or mocking jsPDF."

requirements-completed: [S4]

duration: 4min
completed: 2026-05-31
---

# Phase 71 Plan 07: PDF Variance Polarity Refactor Summary

**Polarity-driven variance tinting in the monthly-report PDF: `decideTintColor` reads structured `_polarity` metadata attached to autoTable cells by `buildLineRow`, eliminating the brittle `cell.text.startsWith('(')` / `startsWith('-')` string parsing that would silently break tint if the formatter ever switched from parens to minus signs.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-30T23:45:26Z
- **Completed:** 2026-05-31T (immediately after Task 2 GREEN)
- **Tasks:** 2 (TDD: RED → GREEN; no REFACTOR step needed)
- **Files modified:** 1 service + 1 new test file

## Accomplishments

- Exported `VariancePolarity` type and `decideTintColor` pure helper from `monthly-report-pdf-service.ts` (module top-level, not class member) — usable by future renderers and trivially testable.
- Refactored `applyVarianceTint` to source colour from `data.cell.raw._polarity` first, falling back to legacy string parsing only when polarity metadata is absent.
- Updated `buildLineRow` to wrap all 4 variance cells (period $ variance, period % variance, YTD $ variance, YTD % variance) in `{ content, _polarity }` objects with polarity computed from the raw numeric value via a new private `polarityOf()` helper.
- 8/8 regression tests pass (scoped vitest), pinning both the polarity path and the backward-compat string fallback. Test 2 (`decideTintColor('negative', '-$500') === 'red'`) is the specific behaviour that would have failed under the old string-only impl when display formatting changes.

## Task Commits

1. **Task 1: Write failing tests for decideTintColor (RED)** — `7e7f3ffc` (test)
2. **Task 2: Export helper + refactor applyVarianceTint + tag polarity in buildLineRow (GREEN)** — `1d486005` (feat)

Tests transitioned cleanly 8/8 FAIL → 8/8 PASS between the two commits — no REFACTOR commit required (helper is already minimal and idiomatic).

## Files Created/Modified

- **`src/app/finances/monthly-report/services/monthly-report-pdf-service.ts`** — Added `VariancePolarity` type + `decideTintColor` exported function at module top-level (just below the `TINT_GREEN` / `TINT_RED` constants). Refactored `applyVarianceTint` to call the helper. Added private `polarityOf(value: number): VariancePolarity` method on the class. Wrapped 4 variance cells in `buildLineRow` as `{ content, _polarity }` objects.
- **`src/__tests__/services/monthly-report-pdf-variance-tint.test.ts`** — New 8-case regression suite for `decideTintColor`. Tests 1-5 lock the polarity-driven path; Tests 6-8 lock the backward-compat string fallback (zero-detection, paren-negative, plain-dollar).

## Decisions Made

- **No sibling helper module.** Plan locks `decideTintColor` into the same file as the PDF service. Co-location avoids file proliferation and any circular-import risk; the helper is a small enough pure function that splitting it out would be premature abstraction.
- **Polarity is the primary signal; string parsing is fallback only.** When `polarity === 'negative' | 'positive' | 'neutral'`, the helper short-circuits before any string inspection. The string path is reached only when polarity is `undefined`. This means legacy code paths that still emit plain strings continue to render correctly while new code paths get deterministic, formatting-independent tints.
- **didParseCell at L1054 left as-is.** The plan explicitly notes the red-text-for-negatives in detail rows should keep its existing string parsing — the polarity attachment in `buildLineRow` improves the system globally without forcing all call sites to change in one shot. This is now covered by Test 7 (`undefined polarity + '($500)' → red`).
- **Zero is always neutral, no matter what.** The legacy zero-detection short-circuit (`text === '$0' || '($0)' || '+0.0%' || '—'`) was preserved verbatim and runs BEFORE any polarity check, so a stray `polarity: 'negative'` on a `$0` cell will still render untinted.

## Deviations from Plan

None — plan executed exactly as written. The plan's `<action>` block included a fallback note ("alternatively stash via styles") in case `data.cell.raw._polarity` wasn't exposed; the direct `data.cell.raw._polarity` access works under jsPDF autoTable's documented contract (custom keys on the raw cell object flow through to `didParseCell`), so the fallback was not needed.

## Issues Encountered

None.

## Verification

- **Scoped vitest** (per memory `feedback_executor_scoped_tests`): `npx vitest run src/__tests__/services/monthly-report-pdf-variance-tint.test.ts` → **8 passed (8)**, 637ms.
- **Done criteria from plan:**
  - `grep -c "export function decideTintColor" src/.../monthly-report-pdf-service.ts` → **1** ✓
  - `grep -c "_polarity" src/.../monthly-report-pdf-service.ts` → **7** (≥ 2) ✓
  - `ls src/.../monthly-report-pdf-tint-helpers.ts` → **No such file or directory** ✓ (no sibling created)
- **Typecheck on modified files:** `npx tsc --noEmit | grep "pdf-service\|pdf-variance-tint"` → empty (no errors in our files). Repo-wide tsc surfaces pre-existing errors in `BalanceSheetTab.tsx` (owned by parallel plan 71-08 / S5) — out of scope per executor scope-boundary rules.

## Next Phase Readiness

- Calxa migration (downstream) can now rely on the PDF generator's tint colours being stable across any future formatting changes.
- Future plans that add new variance-style cells should reuse the `{ content, _polarity }` pattern + the `polarityOf()` helper so they automatically inherit correct tinting.
- If at any point the polarity-attachment pattern proves stable across all callers, the legacy string-parsing fallback in `decideTintColor` can be removed as a cleanup — at which point the L1054 `didParseCell` block must be migrated as well. Not urgent; the dual-path design is safe.

## Self-Check

- `src/__tests__/services/monthly-report-pdf-variance-tint.test.ts` — **FOUND**
- `src/app/finances/monthly-report/services/monthly-report-pdf-service.ts` (modified) — **FOUND**
- Commit `7e7f3ffc` (RED) — **FOUND**
- Commit `1d486005` (GREEN) — **FOUND**

## Self-Check: PASSED

---
*Phase: 71-month-end-reporting-code-fixes-production-bugs-calxa-parity-scope-gaps-snapshot-serializer-remap*
*Completed: 2026-05-31*
