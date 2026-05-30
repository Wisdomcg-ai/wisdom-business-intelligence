---
phase: 71-month-end-reporting-code-fixes-production-bugs-calxa-parity-scope-gaps-snapshot-serializer-remap
plan: 08
subsystem: ui
tags: [monthly-report, balance-sheet, accounting-equation, observability, ui, accessibility]

requires:
  - phase: 71-month-end-reporting-code-fixes-production-bugs-calxa-parity-scope-gaps-snapshot-serializer-remap
    provides: 71-CONTEXT.md D-S5 decision (residual + mailto CTA pattern)
  - upstream: src/app/finances/monthly-report/types.ts (BalanceSheetData / BalanceSheetRow shape — already shipped)
provides:
  - Render-time `assets - (liabilities + equity)` residual check on the BS tab
  - Red role=alert banner with $-amount when |residual| > $1 (strict)
  - `mailto:cfo@wisdombi.ai` CTA with prefilled BS-imbalance subject for instant coach escalation
  - 7 vitest UI regression tests pinning balanced / tolerance / imbalanced (3 amounts) / negative / mailto / missing-subtotal cases
affects: [coach month-end report review workflow, downstream IICT-HK & Envisage variance reporting trust]

tech-stack:
  added: []
  patterns:
    - Render-time accounting-equation invariant check derived from existing API response (no new prop, no API change)
    - Label-matched subtotal-row lookup with case-insensitive `startsWith` + `includes` fallback per Calxa row-shape contract
    - Graceful degradation: missing-subtotal fixtures skip the loud banner; legacy amber `balances` flag covers as backstop
    - `role="alert"` + `bg-red-50 / border-red-300 / text-red-800` Tailwind scheme for high-severity finance UI signals

key-files:
  created:
    - src/__tests__/components/BalanceSheetTab.test.tsx
  modified:
    - src/app/finances/monthly-report/components/BalanceSheetTab.tsx

key-decisions:
  - Tolerance fixed at strict `Math.abs(residual) > 1` — $0.99 is balanced; $1.01 fires the banner. Matches CONTEXT D-S5 lock.
  - Banner is render-time, independent of server-emitted `balanceSheet.balances` flag — coaches see the exact $-amount of the imbalance, not just a binary boolean.
  - Keep the existing amber `balances` badge below the new red banner (NOT replaced) — acts as a server-flag backstop for the legitimate case where subtotal-label matching fails but the API still emitted `balances=false`.
  - mailto target hardcoded to `cfo@wisdombi.ai` per memory `project_resend_sender` (single SaaS sender) — subject line prefilled with residual amount for instant operator context.
  - Subtotal derivation uses label-match + case-insensitive (primary `startsWith('total asset')` + fallback `includes('asset')`) rather than positional indexing — robust against future row-shape reorderings or label localization.
  - Missing-subtotal path returns NO banner (cannot compute residual safely) — refuses to display a false-positive banner when the row shape is unexpected.
  - Test path at `src/__tests__/components/BalanceSheetTab.test.tsx` per repo convention (NOT co-located `components/__tests__/`) — matches existing `data-integrity-banner.test.tsx` placement.

patterns-established:
  - Render-time accounting-equation checks on finance UI tabs should derive totals from existing API response rows (no new server prop) and degrade gracefully when row shape is unexpected.
  - High-severity finance banners must include a concrete numeric amount + actionable escalation CTA, not just a binary error message.

requirements-completed:
  - S5

duration: 3min
completed: 2026-05-31
---

# Phase 71 Plan 08: Balance Sheet equation check (S5) Summary

**Render-time BS equation residual check + red `role=alert` banner with mailto:cfo@wisdombi.ai escalation CTA; fires when `|assets - (liabilities + equity)| > $1`; 7/7 vitest regression tests pin balanced / tolerance / imbalanced / negative / mailto / missing-subtotal paths; existing amber `balances` flag backstop preserved.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-30T23:45:22Z
- **Completed:** 2026-05-30T23:47:27Z (followed by SUMMARY)
- **Tasks:** 2 (TDD RED + GREEN)
- **Files created:** 1 (test file)
- **Files modified:** 1 (BalanceSheetTab.tsx)

## Accomplishments

- Added a render-time accounting-equation residual check inside `BalanceSheetTab` that computes `totalAssets - (totalLiabilities + totalEquity)` from the existing `balanceSheet.rows` subtotal rows — no new prop on `BalanceSheetTabProps`, no API change required.
- Rendered a red `role="alert"` banner at the top of the BS tab when `Math.abs(residual) > 1` (strict tolerance — $0.99 is balanced). Banner shows the absolute residual in `$X,XXX` form plus direction (Assets `exceed` vs `are short of` Liabilities + Equity).
- Added a `mailto:cfo@wisdombi.ai` CTA with prefilled subject `BS imbalance — residual <amount>` so a coach can escalate in one click without leaving the report.
- Kept the existing amber `balanceSheet.balances` badge below the new red banner — acts as a backstop for the rare path where subtotal-label matching fails but the server still emitted `balances=false`.
- Authored 7 vitest UI regression tests at `src/__tests__/components/BalanceSheetTab.test.tsx`:
  1. Balanced (residual=0) → no banner
  2. Within $1 tolerance (residual=$0.50) → no banner (strict `>` boundary)
  3. Imbalanced by $2 → banner with `$2`
  4. Imbalanced by $20,000 → banner with `$20,000`
  5. Negative residual ($-30,000) → banner with absolute value `$30,000` (no minus sign)
  6. mailto CTA present with `href^="mailto:cfo@wisdombi.ai"`
  7. Missing subtotal rows → no banner (cannot compute → silent)

## Task Commits

1. **Task 1: Write failing tests (RED)** — `904ea7de` (test)
2. **Task 2: Implement residual check + red banner UI (GREEN)** — `e3e85f51` (feat)

**Plan metadata commit follows — includes SUMMARY.md + STATE.md + ROADMAP.md.**

## Files Created/Modified

- `src/__tests__/components/BalanceSheetTab.test.tsx` (CREATED, 128 lines) — 7 vitest UI tests with a `makeBS(assets, liabilities, equity)` fixture builder mirroring the live BS API row-shape contract (section_header → line_item → subtotal triplets for Assets / Liabilities / Equity + a Net Assets row).
- `src/app/finances/monthly-report/components/BalanceSheetTab.tsx` (MODIFIED, +46 lines) — added `findSubtotal()` helper, three label-matched lookups (`total assets` / `total liabilit*` / `total equity` with `includes` fallback), `canComputeResidual` + `residual` + `isImbalanced` derivations, `fmtAbsCurrency` formatter, and the new red banner block inside the existing top-level `<div className="space-y-4">` (above the controls bar and above the existing amber `balances` badge).

## Verification

- `npx vitest run src/__tests__/components/BalanceSheetTab.test.tsx --reporter=verbose` — **7/7 PASS** (703ms).
- `npx tsc --noEmit` — `BalanceSheetTab.tsx` is clean (no errors in modified file).
  - **Out-of-scope pre-existing errors:** 4 TS errors in `src/app/api/monthly-report/wages-detail/route.ts` referencing undefined `normEmployeeName` — this is parallel plan **71-02 (B1 wages employee name matching)** mid-flight on a separate workstream and is NOT caused by 71-08. Per scope boundary in `execute-plan.md`, these are deliberately not touched here.
- Grep verifications (done criteria):
  - `grep -c "residual" BalanceSheetTab.tsx` = **7** (≥ 3 required)
  - `grep -c "mailto:cfo@wisdombi.ai" BalanceSheetTab.tsx` = **1**
  - `grep -c "// S5: Balance Sheet equation residual check" BalanceSheetTab.tsx` = **1**

## Deviations from Plan

**None — plan executed exactly as written.**

The plan's INTERFACES block was specific enough that the implementation matched line-for-line (label predicates, tolerance value, banner classes, mailto target, role=alert, missing-subtotal fall-through, fixture shape). No Rule 1-4 deviations applied. No auth gates. No checkpoints.

One trivial JSX-shape correction during implementation: a transient extra `<div className="space-y-4">` wrapper was added then immediately removed in the same edit session before any commit was made — the banner now lives directly inside the existing outer flex container.

## Known Stubs

**None.** The banner displays live computed data from the existing `balanceSheet.rows` API response. No placeholder text, no hardcoded empties, no TODO/FIXME markers introduced.

## Downstream Impact

- **Coach workflow:** When a client's month-end BS doesn't balance, the coach sees the exact $-amount and a one-click escalation path instead of only an amber "doesn't balance" badge. This directly addresses CONTEXT.md S5 lock ("Coaches need a LOUDER, residual-amount-explicit red banner with a mailto CTA so they can investigate or report immediately").
- **Phase 71 progress:** 1 of 10 plans complete (B2, B1, B3, S1, S2, S3, S4, S6, D4 remain).
- **No downstream blockers** — plan was independent (Wave 1) and the BS tab change does not affect other monthly-report tabs (Wages, Subscriptions, Commentary, PDF) or the snapshot serializer (D4).

## Cross-References

- CONTEXT D-S5 (locked decision): `.planning/phases/71-.../71-CONTEXT.md` lines 129-138
- Memory `project_resend_sender`: cfo@wisdombi.ai is the single SaaS sender
- Memory `feedback_executor_scoped_tests`: scoped vitest only (not full suite) — followed
- Existing amber backstop: `BalanceSheetTab.tsx` line ~213 (kept intact)

## Self-Check: PASSED

- [x] `src/__tests__/components/BalanceSheetTab.test.tsx` exists (verified with Read tool during implementation)
- [x] `src/app/finances/monthly-report/components/BalanceSheetTab.tsx` modified (residual=7, mailto=1, S5 comment=1)
- [x] Commit `904ea7de` exists in git log (RED test commit)
- [x] Commit `e3e85f51` exists in git log (GREEN implementation commit)
- [x] 7/7 vitest pass on scoped test file
- [x] Typecheck clean on modified file (parallel-plan errors in unrelated file noted but out of scope)
