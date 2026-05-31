---
phase: 71-month-end-reporting-code-fixes-production-bugs-calxa-parity-scope-gaps-snapshot-serializer-remap
plan: 10
subsystem: monthly-report / snapshot-persistence
tags: [D4, snapshot-serializer, named-keys, jsonb-remap, backfill-migration, idempotent]
requirements: [D4]
provides:
  - snapshot-sections-named-key-serializer
  - snapshot-sections-backward-compat-deserializer
  - snapshot-sections-numeric-to-named-backfill-script
  - new-snapshots-persist-as-named-key-jsonb-map
requires:
  - phase-70-04-snapshot-table-baseline
  - phase-70-05-snapshot-row-existence
affects:
  - src/app/finances/monthly-report/hooks/useMonthlyReport.ts
  - src/app/finances/monthly-report/utils/snapshot-serializer.ts
  - src/__tests__/api/snapshot-serializer-named-keys.test.ts
  - scripts/71-D4-snapshot-sections-remap.mjs
  - monthly_report_snapshots (4 rows: 3 Envisage + 1 JDS)
tech_stack:
  added: []
  patterns:
    - "serialize-at-POST-boundary: array→named-map only at the snapshot save wire boundary, in-memory ReportSection[] type preserved"
    - "deserialize-at-load-boundary: named-map | numeric-keyed | array → array, so consumers (pdf-service, BudgetVsActualTable) stay shape-agnostic"
    - "two-mode (dry-run / --apply) idempotent backfill per Phase 70 methodology"
    - "shape classifier (array / numeric / named / mixed / none / invalid) gates only the safe-to-remap rows"
key_files:
  created:
    - src/app/finances/monthly-report/utils/snapshot-serializer.ts
    - src/__tests__/api/snapshot-serializer-named-keys.test.ts
    - scripts/71-D4-snapshot-sections-remap.mjs
    - .planning/phases/71-.../71-10-D4-dry-run.txt
    - .planning/phases/71-.../71-10-D4-apply.txt
    - .planning/phases/71-.../71-10-D4-post-apply-idempotency.txt
  modified:
    - src/app/finances/monthly-report/hooks/useMonthlyReport.ts
decisions:
  - "Persisted-form-only change: in-memory GeneratedReport.sections remains ReportSection[] (typed) — only the JSONB wire/persisted form switches to a named map. Protects all existing consumers (BudgetVsActualTable, pdf-service:198 `.find(sec => sec.category === 'Revenue')`, debug inspection scripts) which keep getting an array."
  - "deserializeReportSections handles all 3 shapes (array passthrough / numeric-keyed legacy / named map) so loadSnapshot is robust to any historical row even before the backfill runs — backfill is a cleanup, not a load-time prerequisite."
  - "CATEGORY_KEY_MAP duplicated between TS serializer and the .mjs migration script (intentional — small map, avoids esm-from-node-script import gymnastics). Comment in both files calls out the manual sync requirement."
  - "Shape classifier (numeric / mixed / etc.) added beyond the plan-spec's array-only test so the script surfaces unexpected shapes (e.g. partially-remapped rows from a prior failed attempt) as 'mixed' warnings rather than silently corrupting them."
  - "Backfill keys via the section's own .category field (single source of truth from the original ReportSection), not by array index position — so even if a legacy row had sections in non-CATEGORY_ORDER order, the remap still lands on the correct named key."
metrics:
  duration_minutes: 8
  duration_human: "~8 min (across Task 1+2 build; Task 4 apply session ~2 min)"
  tasks_completed: 4
  files_created: 6
  files_modified: 1
  commits: 4
  tests_added: 10
  tests_passing: 10
  rows_backfilled: 4
  completed_at: "2026-05-31T00:32:00Z"
---

# Phase 71 Plan 10: D4 — Snapshot serializer + numeric-to-named remap migration — Summary

**One-liner:** Monthly-report snapshots now persist `report_data.sections` as a named-key JSONB map (`{ revenue, cost_of_sales, operating_expenses, other_income, ... }`) instead of a numeric-indexed object (`{ "0": {...}, "1": {...} }`), with all 4 existing snapshot rows migrated in place via an idempotent backfill — fixing the long-standing inability of ad-hoc SQL / debug tools / future consumers to resolve sections by name.

## What changed

### Code — Task 1 (serializer fix)

**`src/app/finances/monthly-report/utils/snapshot-serializer.ts` (new, 146 LOC)** exposes:

- `CATEGORY_KEY_MAP: Record<string, string>` — the 5-entry lock table (Revenue→revenue, Cost of Sales→cost_of_sales, Operating Expenses→operating_expenses, Other Income→other_income, Other Expenses→other_expenses).
- `categoryToKey(category)` — uses the map with a snake_case fallback for unknown categories (passthrough, never silently dropped).
- `serializeReportSections(input: ReportSection[] | NamedSectionMap) → NamedSectionMap` — array→map at the POST boundary; idempotent if already a map.
- `deserializeReportSections(input: NamedSectionMap | ReportSection[] | NumericKeyedSections) → ReportSection[]` — load-time hydrator that handles all 3 shapes (array passthrough, numeric-keyed legacy, named map) and returns the canonical CATEGORY_ORDER-sorted array. Appends unknown-key sections at the tail (passthrough).

**`src/app/finances/monthly-report/hooks/useMonthlyReport.ts`** — two minimal wire-up edits:

1. `saveSnapshot` (~line 360): wraps `reportData.sections` through `serializeReportSections` before POST. The in-memory `reportData` object passed to setReport elsewhere is unchanged.
2. `loadSnapshot` (~line 397): wraps `data.snapshot.report_data.sections` through `deserializeReportSections` before `setReport`, so downstream consumers see the canonical ReportSection[] shape regardless of how the row was persisted.

### Test — Task 1 (regression)

**`src/__tests__/api/snapshot-serializer-named-keys.test.ts` (new, 319 LOC)** — **10 tests, all passing**:

- `serializeReportSections` — array→named-map (Test 1), idempotency on named-map input (Test 2), passthrough for non-standard category (Test 5).
- `deserializeReportSections` — named-map→array in CATEGORY_ORDER (Test 3), array passthrough, numeric-keyed legacy hydrate, unknown-key tail-append.
- Round-trip — `deserialize(serialize(arr)) ≈ arr` (deep-equal, insertion-order-independent).
- Snapshot POST integration (Test 4) — mocked Supabase `.upsert(...)` call, asserts the payload's `report_data.sections` is `{ revenue: {...}, operating_expenses: {...} }` and NOT an array.

### Migration — Task 2 (script + dry-run capture)

**`scripts/71-D4-snapshot-sections-remap.mjs` (new)** — two-mode backfill:

- Default mode: dry-run, prints per-row remap plan + 6-line summary block (total / need remap / already named / no sections / mixed (skipped) / invalid (skipped)).
- `--apply` mode: same plan + actually issues `update({ report_data: newReportData }).eq('id', row.id)` per row, tracks applied vs failed.
- Shape classifier wraps every row through `isArray / isNumericKeyed / isNamedKeyed / isMixed / isInvalid` — only array + numeric-keyed are remapped; mixed shapes warn but don't touch.
- Local `CATEGORY_KEY_MAP` mirrors the TS serializer's map with an explicit "keep in sync" comment.

Dry-run output captured to `.planning/phases/71-.../71-10-D4-dry-run.txt`:
```
Loaded 4 snapshot rows
  - id=248dcb7c... month=2026-01: REMAP array[3] → revenue, operating_expenses, other_income
  - id=56840db4... month=2026-03: REMAP array[3] → revenue, operating_expenses, other_income
  - id=8aad86f3... month=2026-04: REMAP array[4] → revenue, cost_of_sales, operating_expenses, other_income
  - id=d985a091... month=2026-04: REMAP array[3] → revenue, operating_expenses, other_income
Summary: total: 4 | need remap: 4 | already named: 0 | no sections: 0 | mixed: 0 | invalid: 0
```

3 Envisage rows (`biz=8c8c63b2-bdc4...`) + 1 JDS row (`biz=fea253dd-3dfa...`), matching Phase 70-01 baseline expectation of 4 total snapshot rows.

### Migration — Task 4 (apply + idempotency)

**Apply run** (`.planning/phases/71-.../71-10-D4-apply.txt`):
```
[71-D4] Mode: APPLY
[71-D4] Loaded 4 snapshot rows
  - id=248dcb7c... → revenue, operating_expenses, other_income
  - id=56840db4... → revenue, operating_expenses, other_income
  - id=8aad86f3... → revenue, cost_of_sales, operating_expenses, other_income
  - id=d985a091... → revenue, operating_expenses, other_income
Summary: total: 4 | need remap: 4 | already named: 0 | applied: 4 | failed: 0
[71-D4] APPLY complete.
```

**Idempotency re-run** (`.planning/phases/71-.../71-10-D4-post-apply-idempotency.txt`):
```
[71-D4] Mode: DRY-RUN
[71-D4] Loaded 4 snapshot rows
  - id=248dcb7c... OK (already named: revenue, other_income, operating_expenses)
  - id=56840db4... OK (already named: revenue, other_income, operating_expenses)
  - id=8aad86f3... OK (already named: revenue, other_income, cost_of_sales, operating_expenses)
  - id=d985a091... OK (already named: revenue, other_income, operating_expenses)
Summary: total: 4 | need remap: 0 | already named: 4 | no sections: 0 | mixed: 0 | invalid: 0
```

Idempotency confirmed: re-running the script on already-remapped rows produces `need remap: 0` and changes nothing.

## Tasks completed

| # | Task                                                                           | Status | Commit     |
| - | ------------------------------------------------------------------------------ | ------ | ---------- |
| 1 | Serializer fix — write named-key sections on snapshot save (RED → GREEN)       | done   | `73fe6976` |
| 2 | Build snapshot-sections remap migration script (dry-run mode default)          | done   | `8fa4b77d` |
| 3 | Matt reviews D4 dry-run output before --apply                                  | done   | (approval) |
| 4 | Run --apply + post-apply verification (idempotency)                            | done   | `dca68fe8` |

## Verification

- **Serializer tests:** `npx vitest run src/__tests__/api/snapshot-serializer-named-keys.test.ts` → **10/10 PASS** (Task 1).
- **Apply success:** `grep "applied" 71-10-D4-apply.txt` → `applied: 4`. `grep "failed" 71-10-D4-apply.txt` → `failed: 0`.
- **Idempotency:** `grep "need remap" 71-10-D4-post-apply-idempotency.txt` → `need remap: 0`, `already named: 4`.
- **Typecheck:** clean on Task 1's touched files (per scoped-test memory).
- **Backward-compat:** deserializeReportSections covers all 3 shapes (array / numeric-keyed legacy / named map) so the load path was never broken at any point in the rollout, even before the backfill ran.

## Deviations from Plan

**1. [Rule 2 — Robustness] Extended shape classifier beyond plan's array-only check**

- **Plan spec said:** `isNumericKeyedSections(sections)` returns true for arrays OR objects with all-numeric keys; remap both.
- **What I built:** A 6-way classifier (`array / numeric / named / mixed / none / invalid`) where only `array` + `numeric` get remapped. `mixed` (some named, some numeric — would indicate a partially-failed prior run) warns and skips. `invalid` (non-object / null / no `.category` on members) errors with a per-row reason and skips.
- **Why:** A 1-line classifier would silently corrupt a row if some prior process had half-remapped it. The expanded classifier guarantees no destructive write on any unexpected shape. With 4 rows in production, the cost of being paranoid is essentially zero.
- **Impact:** None on the actual run — all 4 rows were pure-array shape — but the script is now safe to re-run in the future against post-incident data.

**2. [Rule 1 — Bug] Test count grew from spec's 5 to actual 10**

- **Plan spec said:** "Run tests: 5/5 pass."
- **Actual:** 10 tests written. The plan's 5-test outline was correct at the conceptual level; I split each conceptual test into smaller assertions (e.g. Test 3 round-trip became 3 separate round-trip cases across array-input, named-input, and numeric-input shapes; Test 5 passthrough became unknown-category passthrough + tail-append-preserves-order).
- **Why:** Smaller, more focused assertions are easier to debug if a regression lands later.
- **Impact:** Higher coverage at no cost; plan's intent fully met.

## Auth gates

None — Supabase service-role credentials were already in `.env.local` from Phase 70 backfills. The script runs from the Matt-local CLI with the same env (no production credential rotation needed).

## Out-of-scope / deferred

- No PDF-service changes: `pdf-service.ts:198` already reads via `.find(sec => sec.category === 'Revenue')` against the in-memory `ReportSection[]`, which the new `deserializeReportSections` continues to produce. PDF generation untouched.
- No layout-key changes: `pdf-service.ts:2242` `case 'subscription_detail'` / `case 'wages_detail'` are LAYOUT KEYS for a different feature (which subsection of the PDF to render where), not section data keys — unrelated to this plan, untouched.
- `subscription_budgets` schema column-name divergence noted in 71-05 is in a different table and is also unrelated to this plan.

## Known Stubs

None. Both the serializer (Task 1) and the migration (Task 4) are fully wired against production data with passing tests + apply success.

## Self-Check: PASSED

- File `src/app/finances/monthly-report/utils/snapshot-serializer.ts` — FOUND (created in 73fe6976).
- File `src/__tests__/api/snapshot-serializer-named-keys.test.ts` — FOUND (created in 73fe6976).
- File `scripts/71-D4-snapshot-sections-remap.mjs` — FOUND (created in 8fa4b77d).
- File `src/app/finances/monthly-report/hooks/useMonthlyReport.ts` — MODIFIED (saveSnapshot wraps via serializeReportSections, loadSnapshot wraps via deserializeReportSections) per 73fe6976.
- File `.planning/phases/71-.../71-10-D4-dry-run.txt` — FOUND (captured pre-apply).
- File `.planning/phases/71-.../71-10-D4-apply.txt` — FOUND (apply output, applied: 4, failed: 0).
- File `.planning/phases/71-.../71-10-D4-post-apply-idempotency.txt` — FOUND (need remap: 0, already named: 4).
- Commit `73fe6976` (feat serializer) — FOUND in `git log`.
- Commit `8fa4b77d` (chore script + dry-run) — FOUND in `git log`.
- Commit `dca68fe8` (chore apply) — FOUND in `git log`.
- Production backfill — 4/4 rows migrated, idempotency verified, zero failures.
