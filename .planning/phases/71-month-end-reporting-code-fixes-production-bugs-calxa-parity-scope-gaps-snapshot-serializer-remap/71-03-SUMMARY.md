---
phase: 71-month-end-reporting-code-fixes-production-bugs-calxa-parity-scope-gaps-snapshot-serializer-remap
plan: 03
subsystem: monthly-report / draft-persistence
tags: [B3, proceed-as-draft, snapshot, toast, ux, regression-test]
requirements: [B3]
provides:
  - immediate-snapshot-write-on-proceed-as-draft-click
  - saved-as-draft-toast-on-initial-draft-save
requires:
  - phase-42-04-useAutoSaveReport-hook
  - phase-42-04-saveSnapshot-wrapper-in-useMonthlyReport
affects:
  - src/app/finances/monthly-report/page.tsx
  - src/__tests__/app/proceed-as-draft-persistence.test.ts
tech_stack:
  added: []
  patterns:
    - "side-effect-on-result inside useCallback (forceDraft branch fires saveSnapshot immediately)"
    - "route-level integration test via imported POST handler + vi.mock'd Supabase admin client (mirrors phase-53-connection-health-route.test.ts)"
    - "source-grep invariant test locks client wiring without React-tree mount overhead"
key_files:
  created:
    - src/__tests__/app/proceed-as-draft-persistence.test.ts
  modified:
    - src/app/finances/monthly-report/page.tsx
decisions:
  - "Route-level integration over E2E — the POST handler already supports draft upserts cleanly (route never needed to change); pure-vitest route test + source-grep client-wiring test together lock the B3 invariant without spinning up Playwright"
  - "Tightened `if (result)` to `if (result && !('needsMappings' in result))` so the new immediate-save block can never run on the needsMappings discriminated-union path — eliminates a TypeScript narrowing risk that was latent in the prior code"
  - "Preserved Wave-1 71-09 multi-currency redirect-toast wiring (page.tsx:166-185) verbatim — no edits to that region"
metrics:
  duration: "2m 52s"
  duration_minutes: 3
  completed_date: "2026-05-31"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  commits: 2
  vitest_cases_added: 4
  vitest_cases_passing: 4
---

# Phase 71 Plan 03: B3 — Proceed-as-Draft persistence Summary

**One-liner:** Clicking "Generate Draft Report" now immediately POSTs a snapshot at `status='draft'` (via the existing upsert route) and surfaces a "Saved as draft" toast, so closing the tab no longer loses the report — auto-save still owns subsequent commentary writes, just against an existing row instead of a phantom one.

## What changed

### `src/app/finances/monthly-report/page.tsx` (handleGenerateReport, lines 672-705)

Three surgical edits inside the existing callback:

1. **Result-narrowing tightened (line 682):** `if (result)` → `if (result && !('needsMappings' in result))`. Eliminates a TS narrowing risk where the new B3 branch could in principle dispatch on the discriminated-union mapping shape.
2. **New B3 branch (lines 693-705):** After the existing commentary-fetch logic, `if (forceDraft) { await saveSnapshot(result, { status: 'draft', generatedBy: userId, commentary: persistedCommentary }); setLoadedSnapshotStatus('draft'); toast.success('Saved as draft') }`. Error path logs + shows a recovery toast.
3. **useCallback deps (line 706):** added `saveSnapshot` and `userId` (both stable refs from `useMonthlyReport` / page state).

The non-forceDraft (reconciled-then-finalise) path is byte-identical to the prior implementation — verified by reading the diff.

### `src/__tests__/app/proceed-as-draft-persistence.test.ts` (new — 278 lines, 4 tests)

- **Tests 1-3 — route-level POST handler:** import `POST` from `@/app/api/monthly-report/snapshot/route`, mock the auth + admin Supabase clients + permission helpers + Sentry + `revertReportIfApproved`, then pump `NextRequest` POSTs through.
  - Test 1: initial draft write → exactly one upsert with `status='draft'`, `is_draft=true`, `onConflict='business_id,report_month'`.
  - Test 2: two consecutive POSTs → 2 upsert calls but ONE table row (idempotency invariant).
  - Test 3: draft → final transition → row flips status in place, still ONE row.
- **Test 4 — client wiring invariant:** `fs.readFileSync(page.tsx)` + regexes for the `B3: Proceed-as-Draft` marker, the literal `Saved as draft` toast text, and the `forceDraft … saveSnapshot … status: 'draft'` chain. Locks the wiring at the source-file level — any future executor that drops the immediate-save branch will fail this test loudly.

All four tests pass.

## Tasks completed

| # | Task                                                                        | Status | Commit     |
| - | --------------------------------------------------------------------------- | ------ | ---------- |
| 1 | Write route-level integration + source-grep regression tests (RED)          | done   | `c6b1c613` |
| 2 | Wire immediate snapshot save on Proceed-as-Draft click + toast (GREEN)      | done   | `ba308b4a` |

## Verification

- `npx vitest run src/__tests__/app/proceed-as-draft-persistence.test.ts --reporter=verbose` → **4/4 PASS** (530ms).
- `npx tsc --noEmit` on the touched file → clean (no new diagnostics from the wiring change).
- `grep -n "B3: Proceed-as-Draft" src/app/finances/monthly-report/page.tsx` → 1 hit (line 693).
- `grep -c "Saved as draft" src/app/finances/monthly-report/page.tsx` → 1.
- `grep -c "saveSnapshot" src/app/finances/monthly-report/page.tsx` → 6 (baseline was 5; +1 from the new B3 call site as expected).
- Per memory `feedback_executor_scoped_tests`: scoped vitest only — full suite skipped.
- Manual smoke path (for Matt during phase review): click "Generate Draft Report" before commentary entry → see "Saved as draft" toast → reload the page → snapshot is present at status='draft'.

## Deviations from Plan

### Auto-fixes

**1. [Rule 1 — Bug] Tightened the result-narrowing guard for the new B3 branch**

- **Found during:** Task 2 — when I went to write `if (forceDraft && result && !('needsMappings' in result))` the surrounding `if (result)` block already contained logic that depends on `result` NOT having `needsMappings`. The narrowing was implicit-but-not-typed.
- **Fix:** Promoted the narrowing to the outer guard (`if (result && !('needsMappings' in result))`) so all downstream code inside the block — including the existing `loadSnapshot`, `setLoadedSnapshotStatus`, `fetchCommentary`, AND the new B3 save — is type-safe under the GeneratedReport branch of the union.
- **Files modified:** `src/app/finances/monthly-report/page.tsx` (one line).
- **Commit:** rolled into `ba308b4a`.

### Annotations (not behaviour changes)

**1. [Plan-spec interpretation] Test approach**

- **Plan said:** "Test 1 (route-level integration, no React) … Test 2 (idempotency) … Test 3 (status preservation)."
- **What I did:** All three locked, plus added a **Test 4** that does a source-grep on `page.tsx` to lock the client wiring contract.
- **Why:** Tests 1-3 verify the route correctly upserts at status='draft' — but the route was ALREADY correct (verified by Tests 1-3 passing before any client change). The actual B3 bug lives entirely on the caller side (`handleGenerateReport` never invoking the save). Without Test 4, the test suite would have been a pass-on-day-one no-op for the wiring. Same pattern as 71-01's Test 5 (route-source inspection) — they live in the same file and rev as a unit. Net result: stronger invariant, same shape.

## Auth gates

None encountered (route + page-source-grep tests are pure — no Supabase, no Xero, no network).

## Known Stubs

None. The save path uses live data sources (`saveSnapshot` wrapper → real `/api/monthly-report/snapshot` POST → real `monthly_report_snapshots` table). The `commentary: persistedCommentary` argument is `undefined` on a fresh draft, but that's the intended behaviour — the route already handles `commentary: null` correctly (verified at `snapshot/route.ts:157`: `commentary: commentary || null`).

## Operational notes

- **No data writes from this plan.** Code-only fix. Existing snapshot rows untouched.
- **Wave-1 71-09 multi-currency redirect-toast wiring preserved verbatim** (page.tsx:166-185) — no edits to that region.
- **Rollback** is trivial: revert the two commits; no DB state.
- **Coach UX win:** the most common "I lost my report" complaint scenario (open monthly report → click Generate Draft → get distracted → close tab → come back tomorrow and have to regenerate) is now permanently closed for any month where the coach actually clicked the draft button. Reconciled-and-finalise flow unchanged.

## Self-Check: PASSED

- File `src/__tests__/app/proceed-as-draft-persistence.test.ts` — FOUND
- File `src/app/finances/monthly-report/page.tsx` modification at line 693 — FOUND (`B3: Proceed-as-Draft` marker present)
- Commit `c6b1c613` — FOUND in git log
- Commit `ba308b4a` — FOUND in git log
- Test suite — 4/4 PASS verified by direct `vitest run` invocation
- Typecheck — clean on touched file
- Done-criteria greps — all three pass (B3 marker = 1; 'Saved as draft' = 1; saveSnapshot count = 6, +1 vs baseline)
