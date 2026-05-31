---
gsd_summary_version: 1.0
phase: 71-month-end-reporting-code-fixes-production-bugs-calxa-parity-scope-gaps-snapshot-serializer-remap
plan: 02
subsystem: monthly-report-api
tags: [wages, employee-matching, fuzzy-match, sentry, telemetry, levenshtein]
requirements: [B1]
dependency_graph:
  requires:
    - "@sentry/nextjs (already in deps)"
    - "Existing wages-detail route + forecast_employees + Xero PayRuns shape"
  provides:
    - "Layered employee name matcher (exact → token_sort → fuzzy)"
    - "Sentry invariant xero_payroll_name_fuzzy_match for fuzzy-match telemetry"
  affects:
    - "src/app/api/monthly-report/wages-detail/route.ts (3 former call sites)"
tech_stack:
  added: []
  patterns:
    - "Pure helpers in colocated _helpers.ts for unit-testability"
    - "Layered matcher with explicit preference order"
    - "Sentry capture wrapped in try/catch so observability never breaks the route (53-05 pattern)"
key_files:
  created:
    - "src/app/api/monthly-report/wages-detail/_helpers.ts"
    - "src/__tests__/api/wages-detail-employee-matching.test.ts"
  modified:
    - "src/app/api/monthly-report/wages-detail/route.ts"
decisions:
  - "Apostrophes stripped in place (O'Brien → obrien); other punctuation → space token separator"
  - "Inline Levenshtein DP (no library dep added per CONTEXT D-B1)"
  - "Fuzzy threshold: distance / max(needle.length, candidate.length) <= 0.15"
  - "Pick MIN-distance fuzzy candidate, not first-match — protects against ambiguity"
  - "Sentry tenant_id re-fetched separately (cheap, scope-isolated) rather than threading state across the existing try-block"
metrics:
  duration_minutes: 3
  tasks_completed: 2
  files_created: 2
  files_modified: 1
  commits: 2
  tests_added: 13
  tests_passing: 13
completed: 2026-05-30T23:47:52Z
---

# Phase 71 Plan 02: B1 Wages Employee Name Matching Summary

**One-liner:** Replaced trim/lowercase `normEmployeeName` with a layered
exact → token-sort → Levenshtein-fuzzy matcher, eliminating duplicate
wages rows when Xero spells "John Smith" and the forecast holds
"Smith, John". Fuzzy hits emit a Sentry warning tagged
`invariant=xero_payroll_name_fuzzy_match` for real-world divergence
observability.

## What shipped

### New file: `src/app/api/monthly-report/wages-detail/_helpers.ts`

Three pure exports, all unit-testable in isolation:

1. **`tokenSortKey(name)`** — lowercases, strips apostrophes in place,
   replaces remaining punctuation with spaces, splits, filters empties,
   sorts tokens alphabetically, joins. Key invariants:
   - `tokenSortKey('John Smith') === tokenSortKey('Smith, John') === 'john smith'`
   - `tokenSortKey("Mary-Anne O'Brien") === 'anne mary obrien'`
   - `tokenSortKey('')` / `null` / `undefined` → `''` (defensive)

2. **`levenshtein(a, b)`** — classic iterative DP, two rolling rows, O(n*m)
   time, O(n) space. Inline (no library dep added). Returns the minimum
   single-char insert/delete/substitute count to transform `a → b`.

3. **`matchEmployeeName(needle, haystack)`** — layered matcher returning
   `{ matched: string | null, via: 'exact' | 'token_sort' | 'fuzzy' | 'no_match', distance? }`.
   Preference order is locked by Test 7 (token-sort wins over fuzzy when both
   candidates exist) and Test 8 (exact wins over both).

### New file: `src/__tests__/api/wages-detail-employee-matching.test.ts`

13 tests (3 for `tokenSortKey`, 4 for `levenshtein`, 6 for `matchEmployeeName`).
All would have caught the original B1 bug. Covers each acceptance criterion in
71-02-PLAN:

| Acceptance | Test |
|---|---|
| 'John Smith' matches 'Smith, John' | `matchEmployeeName > matches 'John Smith' to 'Smith, John'` |
| 'smith john' matches 'John Smith' | `matchEmployeeName > matches 'smith john'` |
| Typo matches via Levenshtein | `matchEmployeeName > matches typo 'John Smitn' to 'John Smith' via fuzzy fallback` |
| 'John Smith' does NOT match 'Jane Doe' | `matchEmployeeName > does NOT match 'John Smith' to ['Jane Doe', 'Bob Brown']` |

### Modified: `src/app/api/monthly-report/wages-detail/route.ts`

- Deleted inline `normEmployeeName` (was line 20).
- Imported `matchEmployeeName` + `tokenSortKey` from `./_helpers`.
- Replaced all three call sites:
  - **Xero→forecast match** (formerly line 481, `.find` over forecastEmployees
    with `===` equality): now calls `matchEmployeeName(xeData.name, forecastNameList)`
    once per Xero employee. `forecastNameList` is built once outside the loop.
  - **Matched key set** (formerly line 488, `matchedForecastNames.add`): renamed
    to `matchedForecastKeys` and now stores `tokenSortKey(name)` so the
    forecast-only skip check at the bottom uses the same canonical form.
  - **Forecast-only skip check** (formerly line 532, `matchedForecastNames.has`):
    now checks `matchedForecastKeys.has(tokenSortKey(fe.employee_name))`.

### Sentry instrumentation

On `matchResult.via === 'fuzzy'` (the layered matcher had to fall back to
Levenshtein), captures a warning:

```
Sentry.captureMessage('Xero payroll name fuzzy match', {
  level: 'warning',
  tags: {
    invariant: 'xero_payroll_name_fuzzy_match',
    business_id,
    tenant_id,
  },
  extra: {
    xero_name, forecast_name, distance, report_month, fiscal_year,
  },
})
```

Wrapped in `try/catch` per the 53-05 pattern — Sentry failure must never abort
the route. `tenant_id` is re-fetched cheaply at the top of the employee-build
section rather than threading the existing connection object through the
try-block boundary (cleaner local scope, one extra Supabase round-trip is
acceptable in this report-generation context).

## Acceptance verification

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/api/wages-detail-employee-matching.test.ts` | 13/13 pass |
| `grep -c "normEmployeeName" src/app/api/monthly-report/wages-detail/route.ts` | 0 |
| `grep -c "matchEmployeeName" src/app/api/monthly-report/wages-detail/route.ts` | 2 |
| `grep -c "xero_payroll_name_fuzzy_match" src/app/api/monthly-report/wages-detail/route.ts` | 1 |
| `npx tsc --noEmit` on touched files | clean (no errors in wages-detail or _helpers) |
| Sentry capture wrapped in try/catch | yes (lines guard the `Sentry.captureMessage` call) |
| business_id + tenant_id tags present | yes (both in `tags` object) |

## Commits

| # | Hash | Subject |
|---|---|---|
| 1 | `745d3cb6` | test(71-02): add failing tests for tokenSortKey + levenshtein + matchEmployeeName (RED) |
| 2 | `e368bea9` | feat(71-02): token-sort + Levenshtein fuzzy match for wages employee names (GREEN) |

Both committed with `--no-verify` per the Phase 71 parallel execution directive.

## Decisions made during execution

1. **Apostrophes stripped in place, not converted to space.**
   The plan-spec snippet (`replace(/[^\w\s]/g, ' ')`) would have turned
   `O'Brien` into two tokens (`o brien`), making `Mary-Anne O'Brien` produce
   `['mary', 'anne', 'o', 'brien']` and never equating to `OBrien Mary Anne`
   (which gives `['mary', 'anne', 'obrien']`). The plan's own Test 2
   asserted `'anne mary obrien'` as the expected key. Resolved by adding a
   pre-pass `.replace(/['’‘]/g, '')` (apostrophes including curly variants)
   BEFORE the general punctuation→space pass. Documented inline in the
   helper.

2. **Levenshtein "transposition" test asserts distance = 2, not 1.**
   The plan spec listed `levenshtein('john smith', 'jonh smith') === 1`,
   but classical Levenshtein scores a transposition as 2 ops (1 delete +
   1 insert). Only Damerau-Levenshtein scores it as 1. Switched the test
   to assert the correct classical value (2) and added an inline comment
   noting that 2/10 = 0.2 > 0.15 threshold (so this exact typo would NOT
   trigger a fuzzy match — by design, classical Levenshtein is more
   conservative). The fuzzy-fallback acceptance test uses a tighter
   single-char substitution case (`'John Smitn'` vs `'John Smith'`, distance
   1, ratio 0.1) which DOES land inside the threshold.

3. **Pick MIN-distance fuzzy candidate, not first-match.** Defensive against
   ambiguity: if a Xero name is fuzzy-close to two forecast names, return
   the closer one rather than the first one seen. Adds determinism even
   if the underlying Supabase ordering changes.

4. **`forecastNameList` built once per request, not once per employee.**
   `matchEmployeeName` is called once per Xero payroll employee; building
   the haystack inside the loop would have been O(n*m). Now O(n) prep +
   O(m) per match call.

## Deviations from Plan

### Auto-fixed during execution

**1. [Rule 1 — Bug in plan spec] Punctuation regex would have failed Test 2.**

- **Found during:** Task 2 (GREEN), after first test run produced
  `'anne brien mary o'` instead of expected `'anne mary obrien'`.
- **Root cause:** plan-spec snippet `.replace(/[^\w\s]/g, ' ')` treats `'`
  as a token separator, but real-world surnames like O'Brien are
  conventionally single tokens (matching how Xero exports them).
- **Fix:** added pre-pass `.replace(/['’‘]/g, '')` so apostrophes
  are removed in place before the general punctuation→space pass.
- **Verified:** Test 2 passes; all 13 tests green.
- **Files modified:** `src/app/api/monthly-report/wages-detail/_helpers.ts`
- **Commit:** `e368bea9` (folded into the GREEN commit since the test
  failure was caught and fixed before commit)

**2. [Rule 1 — Bug in plan test spec] Transposition distance wrong.**

- **Found during:** Task 1 (writing tests), confirmed in Task 2.
- **Root cause:** plan expected `levenshtein('john smith', 'jonh smith') === 1`,
  but classical Levenshtein (which we use — no library dep added) scores
  transpositions as 2.
- **Fix:** assert `=== 2` in the transposition test; added a separate
  single-substitution test (`'jon' vs 'jen'`) to lock the actual `=== 1`
  case; added inline comment noting that this typo therefore does NOT
  trigger a fuzzy match (ratio 0.2 > 0.15) and explaining why the
  fuzzy-acceptance test uses a tighter case.
- **Verified:** all 4 levenshtein tests green.
- **Files modified:** `src/__tests__/api/wages-detail-employee-matching.test.ts`
- **Commit:** `745d3cb6`

### Pre-existing scope boundaries respected

- Did NOT touch any other monthly-report API surface (B2 / S1-S6 are other
  plans in this phase).
- Did NOT modify `forecast_employees` table or any data — code-only change
  per Phase 71 methodology (no data writes outside D4).
- The `estimatePayRunsInMonth` function at the bottom of `route.ts` is
  dead code (never imported) but is out of scope for B1 — logged as future
  cleanup, not auto-fixed.

## Known stubs

None. The matcher is fully wired; the Sentry invariant is live; the test
file provides full coverage of all acceptance criteria.

## Authentication gates

None encountered. Pure code change inside an existing authenticated route;
no new external service integration.

## Post-deploy verification (recommended)

- Once deployed, monitor Sentry for events tagged
  `invariant=xero_payroll_name_fuzzy_match`. Each event tells us a
  Xero/forecast name pair that diverges in real production data —
  candidates for either:
  - Coach-side fix (update `forecast_employees.employee_name` to match
    Xero), or
  - Auto-merge-on-import (next-phase enhancement)
- Expected baseline: a small handful per month at most; if it spikes,
  investigate whether the threshold (0.15) is too generous or whether a
  client just onboarded employees with bad spelling normalization.

## Self-Check: PASSED

- src/app/api/monthly-report/wages-detail/_helpers.ts → FOUND
- src/__tests__/api/wages-detail-employee-matching.test.ts → FOUND
- src/app/api/monthly-report/wages-detail/route.ts → MODIFIED (verified)
- Commit 745d3cb6 → FOUND
- Commit e368bea9 → FOUND
