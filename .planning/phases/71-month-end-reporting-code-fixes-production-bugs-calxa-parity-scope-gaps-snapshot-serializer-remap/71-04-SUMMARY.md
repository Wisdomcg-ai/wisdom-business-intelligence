---
phase: 71-month-end-reporting-code-fixes-production-bugs-calxa-parity-scope-gaps-snapshot-serializer-remap
plan: 04
subsystem: monthly-report / commentary-triggers
tags: [S1, commentary, trigger-reason, revenue-shortfall, favourable-expense, bs-movement, regression-test]
requirements: [S1]
provides:
  - four-trigger-collector-pure-helper
  - commentary-row-trigger-reason-field
  - commentary-route-expanded-payload-shape
requires:
  - phase-71-03-B3-proceed-as-draft-persistence
  - phase-71-01-B2-vendor-normalization-consolidation
affects:
  - src/app/finances/monthly-report/page.tsx
  - src/app/finances/monthly-report/utils/commentary-triggers.ts
  - src/app/finances/monthly-report/types.ts
  - src/app/api/monthly-report/commentary/route.ts
  - src/__tests__/api/commentary-trigger-expansion.test.ts
tech_stack:
  added: []
  patterns:
    - "pure collector under utils/ — unit-testable without React or Supabase deps"
    - "mutually exclusive trigger buckets via early continue (expense over-budget vs favourable on same row)"
    - "explicit trigger_reasons map keyed by account_name so route can differentiate dollar vs percent on the same row"
    - "backward-compat default — pre-71-04 {expense_lines}-only payloads still emit expense_over_budget_dollar"
    - "route-level integration test via imported POST handler + vi.mock'd Supabase/Xero (mirrors 71-03)"
key_files:
  created:
    - src/app/finances/monthly-report/utils/commentary-triggers.ts
    - src/__tests__/api/commentary-trigger-expansion.test.ts
  modified:
    - src/app/finances/monthly-report/page.tsx
    - src/app/finances/monthly-report/types.ts
    - src/app/api/monthly-report/commentary/route.ts
decisions:
  - "Trigger priority on duplicate account_name: expense_over > revenue > favourable > bs — first wins. Within each bucket, an explicit entry in the trigger_reasons map (sent by the page) wins over the bucket default so revenue_under_budget_dollar vs revenue_under_budget_percent can be distinguished for the same row."
  - "Strip trigger_reason from the line objects in the POST payload — the route reads reasons from a separate trigger_reasons map keyed by account_name. Avoids redundant payload + keeps line shape backward-compatible with pre-71-04 callers."
  - "Defined CommentaryTriggerReason as a string-union both in types.ts (used by VarianceCommentaryEntry) AND in commentary-triggers.ts (TriggerReason export) AND in the route file (TriggerReason local type). Three identical unions, zero runtime dependencies between them — chosen over importing across layers to keep route + types.ts decoupled from the UI utils tree."
  - "BS movement trigger uses |MoM change| against |opening|. Skips section_header / subtotal / net_assets rows via BS_LEAF_TYPES allowlist so a swing in 'Total Assets' never fires (would always be double-counted by its constituent line items)."
metrics:
  duration: "5m 41s"
  duration_minutes: 6
  completed_date: "2026-05-31"
  tasks_completed: 2
  files_created: 2
  files_modified: 3
  commits: 2
  vitest_cases_added: 10
  vitest_cases_passing: 10
---

# Phase 71 Plan 04: S1 — Commentary trigger expansion Summary

**One-liner:** Variance commentary now fires on four trigger types instead of one — expense over-budget (existing, unchanged), revenue under-budget (≥$500 OR ≥10%), large favourable expense swings (≥$500 AND ≥20%), and balance-sheet movements (≥$5k OR ≥10% of opening) — with every commentary row carrying a `trigger_reason` field naming WHY it appeared.

## What changed

### `src/app/finances/monthly-report/utils/commentary-triggers.ts` (new, 153 lines)

Pure helper `collectCommentaryTriggers(report, balanceSheet?) → TriggerPayload` returning four arrays of `TriggerLine { account_name, xero_account_name, trigger_reason }`. Thresholds locked per Phase 71 CONTEXT D-S1:

| Bucket                 | Rule                                        | Reason emitted                                                  |
| ---------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| expense_lines          | variance_amount ≤ -$500                     | `expense_over_budget_dollar`                                    |
| revenue_lines          | shortfall ≥ $500 (else ≥ 10% of budget)     | `revenue_under_budget_dollar` / `revenue_under_budget_percent`  |
| favourable_expense_lines | variance ≥ $500 AND ≥ 20% of budget       | `expense_favourable_significant`                                |
| bs_lines               | \|MoM change\| ≥ $5k (else ≥ 10% of opening) | `bs_movement_dollar` / `bs_movement_percent`                  |

Conventions: `variance_amount = budget - actual` (matches existing `ReportLine` shape — positive is favourable for expenses, unfavourable for revenue). `is_budget_only` rows skipped. BS scope limited to `line_item` rows via `BS_LEAF_TYPES` allowlist (excludes section_header / subtotal / net_assets so totals don't double-fire).

### `src/app/finances/monthly-report/types.ts` (modified)

- Added `export type CommentaryTriggerReason` (6-member string union, same values as the util's `TriggerReason`).
- `VarianceCommentaryEntry` gains optional `trigger_reason?: CommentaryTriggerReason` (optional for backward-compat with pre-71-04 snapshots).

Note: this file was also touched in the same wave by 71-05 (added `transaction_count` to `SubscriptionVendorLine`). Both edit-sets co-exist cleanly because they touch disjoint type declarations.

### `src/app/finances/monthly-report/page.tsx` (modified — fetchCommentary block ~L613-690)

- Added `import { collectCommentaryTriggers, type TriggerLine } from './utils/commentary-triggers'`.
- `fetchCommentary` replaces the inline expense-only trigger loop with `const triggers = collectCommentaryTriggers(reportData, balanceSheet)`.
- `balanceSheet` is the existing `useBalanceSheet(businessId)` hook return (already destructured at L304 — no new fetches required).
- Empty-state check now covers all 4 buckets: `triggers.expense_lines.length === 0 && triggers.revenue_lines.length === 0 && triggers.favourable_expense_lines.length === 0 && triggers.bs_lines.length === 0`.
- POST body extended to send all 4 line arrays plus a `trigger_reasons` map keyed by `account_name` (first-occurrence wins on duplicate, matching route-side priority).
- `useCallback` deps: added `balanceSheet`.
- **71-03's B3 marker comment `// B3: Proceed-as-Draft persistence` is preserved verbatim** (verified via `grep -c "B3: Proceed-as-Draft" → 1`).

### `src/app/api/monthly-report/commentary/route.ts` (modified — POST handler)

- Body parsing extended: accepts `{ business_id, report_month, expense_lines, revenue_lines?, favourable_expense_lines?, bs_lines?, trigger_reasons? }`. All four new fields default to empty arrays / empty object so pre-71-04 callers still work.
- Built a `reasonByAccount: Map<string, TriggerReason>` resolver up-front: priority is `expense_over > revenue > favourable > bs`; explicit entries in `trigger_reasons` win over bucket defaults.
- Built a deduped `allLines` set (union of all four buckets, keyed by `account_name`). Empty-state check uses `allLines.length === 0` (replacing the legacy `expense_lines.length === 0` check).
- Commentary loop now iterates `allLines` instead of `expense_lines`. Each commentary row carries `trigger_reason: reasonByAccount.get(line.account_name)`.

### `src/__tests__/api/commentary-trigger-expansion.test.ts` (new — 452 lines, 10 tests)

- **Tests 1-8 — pure helper:** import `collectCommentaryTriggers` directly. Cover all 4 trigger types + edge cases (existing expense ≥$500 preserved, revenue dollar vs percent reasons distinguished, favourable-but-small% excluded, BS dollar vs percent reasons distinguished).
- **Tests 9 + 9b — route-level integration:** mock Supabase + Xero (same vi.fn / vi.mock pattern as 71-03's `proceed-as-draft-persistence.test.ts`). Test 9 sends the expanded payload (expense + revenue + favourable + trigger_reasons map) and asserts each commentary row has the correct `trigger_reason`. Test 9b sends the pre-71-04 `{expense_lines}`-only payload and asserts backward-compat (commentary row still emits with default `expense_over_budget_dollar`).

## Tasks completed

| # | Task                                                                | Status | Commit     |
| - | ------------------------------------------------------------------- | ------ | ---------- |
| 1 | Write failing regression tests for 4 trigger types + route (RED)    | done   | `6cc3d34c` |
| 2 | Implement helper + types.ts + page.tsx + route.ts (GREEN)           | done   | `18adf8d6` |

## Verification

- `npx vitest run src/__tests__/api/commentary-trigger-expansion.test.ts --reporter=verbose` → **10/10 PASS** (547ms).
- `npx tsc --noEmit` → **clean** (zero errors across the entire codebase, not just touched files).
- `grep -c "B3: Proceed-as-Draft" src/app/finances/monthly-report/page.tsx` → **1** (71-03 work preserved).
- `grep -c "collectCommentaryTriggers" src/app/finances/monthly-report/page.tsx` → **2** (import + call site).
- `grep -c "trigger_reason" src/app/api/monthly-report/commentary/route.ts` → **12** (type union × 3 + Map ops + commentary writes).
- `grep -c "trigger_reason\|CommentaryTriggerReason" src/app/finances/monthly-report/types.ts` → **2** (the new type + the optional field on VarianceCommentaryEntry).
- Per memory `feedback_executor_scoped_tests`: scoped vitest only — full suite skipped (parallel waves running concurrently, full-suite timing would race other plans).
- Used `--no-verify` per Wave-3 parallel execution directive.

## Deviations from Plan

### Auto-fixes

None. Every behaviour change ships with a passing test that locks it.

### Annotations (not behaviour changes)

**1. [Plan-spec interpretation] Trigger_reason transport channel**

- **Plan said:** "For each commentary row produced, add `trigger_reason` field from `allLines[accountName]`."
- **What I did:** Sent the trigger_reasons as a **separate map** (`trigger_reasons: Record<accountName, TriggerReason>`) alongside the line arrays, rather than inlining `trigger_reason` into each line object.
- **Why:** (1) keeps the line-array shape (`{account_name, xero_account_name}`) byte-identical to the pre-71-04 contract, so pre-71-04 callers don't break and post-71-04 callers don't carry redundant data; (2) lets the page distinguish revenue_dollar vs revenue_percent on the SAME row — collectCommentaryTriggers categorises by which threshold fired, not by bucket-default; (3) the route was already going to need a per-account resolver anyway (the plan literally specifies `allLines[accountName]`), so the wire format just makes the map explicit.
- **Net result:** same invariant locked (every commentary row has a `trigger_reason`), tighter wire format, zero behaviour regression.

**2. [Plan-spec interpretation] Type union duplication**

- **Plan said:** "Update VarianceCommentary type to include optional `trigger_reason?: TriggerReason`" (implicit single source).
- **What I did:** Defined `CommentaryTriggerReason` in `types.ts` (used by `VarianceCommentaryEntry`) AND `TriggerReason` in `utils/commentary-triggers.ts` AND `TriggerReason` in `commentary/route.ts` — three identical 6-member unions, no cross-imports.
- **Why:** `types.ts` is consumed by ~30 monthly-report files and must stay a leaf module (no UI utils deps). The route is in `src/app/api/` and shouldn't import from `src/app/finances/monthly-report/utils/`. The helper is in `utils/` and can be lifted independently. A shared `src/lib/commentary/trigger-reasons.ts` is the long-term home — deferred as out-of-scope micro-refactor.
- **Net result:** three unions, all 6 members identical, hand-syncable. TypeScript catches mismatches at the consumer boundary.

## Auth gates

None encountered (helper is pure; route + helper tests are mocked).

## Known Stubs

None. Every emitted commentary row carries a `trigger_reason`, every threshold matches the locked CONTEXT D-S1 spec, every test path returns real data (mocked Supabase/Xero responses are realistic shapes, not empty placeholders).

## Operational notes

- **No data writes.** Pure code change.
- **No backfill needed.** Existing snapshots persist with `trigger_reason: undefined` on commentary rows — the field is optional. Next regeneration of any month's commentary will populate it.
- **Parallel-wave compatibility verified:** the types.ts changes co-exist cleanly with 71-05's `SubscriptionVendorLine.transaction_count` addition (disjoint type declarations, single file rev landed on the shared branch).
- **Rollback:** revert commits `6cc3d34c` + `18adf8d6`; no DB state; pre-71-04 callers and the original expense-only trigger still work.
- **Coach UX win:** monthly reports now surface commentary prompts on three previously-invisible variance categories (revenue shortfalls, big spend drops, BS swings), and the coach can see at a glance WHY each commentary row appeared (via the trigger_reason field — UI surfacing of this badge is a UI-layer follow-up; the data is now in place).

## Self-Check: PASSED

- File `src/__tests__/api/commentary-trigger-expansion.test.ts` — FOUND
- File `src/app/finances/monthly-report/utils/commentary-triggers.ts` — FOUND
- Commit `6cc3d34c` — FOUND in git log
- Commit `18adf8d6` — FOUND in git log
- Test suite — 10/10 PASS verified by direct `vitest run` invocation
- Typecheck — clean across entire codebase
- B3 marker preserved (71-03 work intact)
- Backward-compat path locked by Test 9b
