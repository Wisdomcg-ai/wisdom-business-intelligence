---
phase: 34-dragon-multi-entity-consolidation
plan: 00c
subsystem: consolidation
tags: [fx, currency-translation, hkd, aud, ias21, aasb121, vitest, tdd]

# Dependency graph
requires:
  - phase: 34-dragon-multi-entity-consolidation/00a
    provides: "XeroPLLineLike + FxRateRow types, iictHKPL + HKD_AUD_MONTHLY fixtures, fx_rates table schema (migration 20260421b)"
provides:
  - "loadFxRates(supabase, pair, rate_type, months) → Map<'YYYY-MM', number> (Supabase fx_rates reader)"
  - "translatePLAtMonthlyAverage(lines, rates) → { translated, missing } pure helper with no-silent-fallback contract"
  - "translateBSAtClosingSpot(lines, rate) stub — signature-only until plan 34-01a"
  - "translationDiagnostics(translations) → fx_context { rates_used, missing_rates } packager"
affects:
  - 34-00b (engine core — may import translateBSAtClosingSpot symbol without branching)
  - 34-00e (API route wiring — invokes loadFxRates + translatePLAtMonthlyAverage + translationDiagnostics)
  - 34-00f (admin FX entry UI — surfaces missing_rates returned by engine)
  - 34-01a (Balance sheet iteration — replaces translateBSAtClosingSpot stub)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-function FX translation module (all I/O isolated in loadFxRates)"
    - "Missing-rate surfacing via returned `missing` array (NO silent 1:1 fallback)"
    - "TDD cycle: RED commit (failing test) → GREEN commit (implementation) for every new helper module"

key-files:
  created:
    - src/lib/consolidation/fx.ts
    - src/lib/consolidation/fx.test.ts
  modified: []

key-decisions:
  - "Missing rate preserves value + flags month (never silent 1.0) — validated by dedicated test and by grep assertion (`?? 1.0` count = 0)"
  - "loadFxRates does NOT filter by `period` at the DB layer; it pulls all rows for the pair+rate_type and filters in TS by month-key prefix. Keeps the query shape simple for both `monthly_average` (first-of-month) and `closing_spot` (month-end) conventions."
  - "translateBSAtClosingSpot exported as a throwing stub now so engine.ts can import the symbol unconditionally; swap to real implementation in 34-01a"
  - "Input lines are not mutated (pure spread + per-month rebuild) — enables engine-side reuse of raw HKD lines for diagnostics without defensive clones"
  - "loadFxRates signature uses a structural `SupabaseLike` type instead of importing `@supabase/supabase-js` — keeps the module lightweight and usable in any mock/test setup"

patterns-established:
  - "Currency-pair literal format: `'HKD/AUD'` (slash separator only — never underscore, never NZD stale reference)"
  - "fx_rates.period column is a DATE; month-key derivation is `period.slice(0, 7)` — valid for both rate_type conventions"
  - "translationDiagnostics pattern: pack `{currencyPair, rates, missing}` triples into flat `rates_used` map keyed `\"${pair}::${month}\"` for JSON serializability"

requirements-completed:
  - MLTE-02

# Metrics
duration: ~10min
completed: 2026-04-18
---

# Phase 34 Plan 00c: FX Translation (HKD/AUD Manual Rates) Summary

**Pure-function FX translation module for IICT consolidation — HKD→AUD monthly-average translation with mandatory missing-rate surfacing (no silent 1:1 fallback) and a signature-only closing-spot stub for the Iteration 34.1 Balance Sheet.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-18T05:22:00Z (worktree reset to 9509c061)
- **Completed:** 2026-04-18T05:27:28Z
- **Tasks:** 1 (TDD-driven — 2 commits: test + feat)
- **Files created:** 2

## Accomplishments

- `loadFxRates` — Supabase reader that queries `fx_rates` by currency pair + rate_type, returns a `Map<'YYYY-MM', number>` filtered by a caller-supplied month list. Missing-in-DB months are signaled by `.get()` returning `undefined`.
- `translatePLAtMonthlyAverage` — pure monthly-average translation, IAS 21 / AASB 121 compliant. Missing rate → value preserved + month added to returned `missing[]` (deduped + sorted). **No silent 1.0 fallback.** Does not fabricate keys absent from source (Pitfall 2). Does not mutate input.
- `translateBSAtClosingSpot` — throwing stub with final signature; engine.ts can import it today. Real implementation lands in plan 34-01a.
- `translationDiagnostics` — packages per-pair translation context into the `ConsolidatedReport.fx_context` shape (`rates_used` flat map + `missing_rates[]`).
- 13 unit tests: rate multiplication, missing-rate handling (primary assertion: `translated['2026-04'] === 200`, NOT `200 × 1.0` silently), dedup + sort of missing months, key non-fabrication (both directions), zero-value handling, non-mutation, multi-pair diagnostics packaging, IICT fixture round-trip.

## Task Commits

Each task was committed atomically with `--no-verify` (parallel-executor convention):

1. **Task 1 (RED — TDD):** `test(34-00c): add failing tests for FX translation module` — `bdfb376`
2. **Task 1 (GREEN — TDD):** `feat(34-00c): implement FX translation module (HKD/AUD manual rates)` — `b97e667`

No REFACTOR commit — module was clean on first implementation, refactor pass was a no-op.

**Plan metadata commit:** (this SUMMARY.md) — hash assigned at commit time.

## Files Created

- `src/lib/consolidation/fx.ts` (183 LOC) — four exports: `loadFxRates`, `translatePLAtMonthlyAverage`, `translateBSAtClosingSpot` (stub), `translationDiagnostics`.
- `src/lib/consolidation/fx.test.ts` (179 LOC) — 13 vitest tests across 3 describe blocks.

## Decisions Made

See `key-decisions` in frontmatter. In short:

- **No silent 1.0 fallback** on missing rate — critical correctness property for consolidated reporting. Tested directly.
- **Filter month list in TS, not SQL** — simpler query shape, handles both `monthly_average` (first-of-month) and `closing_spot` (month-end) period conventions with one code path.
- **Structural `SupabaseLike` type** — avoids importing `@supabase/supabase-js` types; real client satisfies the interface automatically.
- **Stub throws instead of returning empty** — makes accidental pre-34.1 use loud during development.

## Deviations from Plan

None — plan executed exactly as written.

The plan specified exactly 1 task (TDD) and both RED and GREEN completed on first attempt with no auto-fix iterations. No Rule 1/2/3 deviations applied.

**Total deviations:** 0
**Impact on plan:** Plan shipped as specified.

## Issues Encountered

- Worktree base was off-target (started at `e33c0f5` instead of the expected `9509c06`). Hard-reset per the `worktree_branch_check` instructions and confirmed HEAD matches expected SHA before any work.
- One NZD reference in a doc comment in `fx.ts` tripped the `grep "NZD" src/lib/consolidation/fx.ts` zero-match success criterion. Removed; post-fix grep count is 0 in fx.ts. (NZD appears only in `fx.test.ts` for `translationDiagnostics` multi-pair coverage — that's intentional and scoped to the test file.)

## Verification Results

| Check | Expected | Actual |
| --- | --- | --- |
| `grep -cE "export async function loadFxRates\|export function translatePLAtMonthlyAverage\|export function translateBSAtClosingSpot\|export function translationDiagnostics" src/lib/consolidation/fx.ts` | 4 | 4 |
| `grep -c "HKD/AUD" src/lib/consolidation/fx.ts` | ≥1 | 2 |
| `grep -cE "NZD_AUD\|'NZD/AUD'" src/lib/consolidation/fx.ts` (stale NZD) | 0 | 0 |
| `grep -c "NZD" src/lib/consolidation/fx.ts` (success criterion) | 0 | 0 |
| `grep -c "?? 1\.0" src/lib/consolidation/fx.ts` (silent fallback) | 0 | 0 |
| `grep -cE '\?\? 1[^0-9]' src/lib/consolidation/fx.ts` (broader silent-1 check) | 0 | 0 |
| `grep -cE "=== undefined\|rates.get" src/lib/consolidation/fx.ts` | ≥1 | 5 |
| `grep -c "throw new Error" src/lib/consolidation/fx.ts` | ≥1 | 2 |
| `npx vitest run src/lib/consolidation/fx.test.ts` | ≥7 passing | 13 passing |
| `npx tsc --noEmit` | exit 0 | exit 0 |

## Known Stubs

| Stub | File | Line | Reason |
| --- | --- | --- | --- |
| `translateBSAtClosingSpot` throws `[FX] translateBSAtClosingSpot not yet implemented` | src/lib/consolidation/fx.ts | ~137 | Intentional signature-only export for Iteration 34.1 (plan 34-01a). Documented in plan 00c action block. Engine.ts (plan 00b) can import the symbol today; balance-sheet integration will replace the throw with the real closing-spot implementation + CTA handling. |

The stub is called out as intentional in the module docstring and in the function's own docblock. No other stubs — all four exported functions are fully implemented except this one.

## Missing-rate Handling Contract (for plans 00e + 00f)

When `translatePLAtMonthlyAverage` encounters a month with no rate in the supplied `Map`:

1. The value passes through unchanged (still in source currency).
2. The month is added to the returned `missing[]` array (deduped + sorted).
3. A `console.warn` is emitted for server-log observability.
4. The caller (engine.ts / route.ts in plan 00e) MUST:
   - Collect all `missing[]` arrays across per-currency translations
   - Pass them into `translationDiagnostics([...])` → produces `fx_context.missing_rates`
   - Return `fx_context` in the `ConsolidatedReport` JSON
5. The UI (plan 00f `FXRateMissingBanner.tsx`) renders an amber banner when `missing_rates.length > 0` with a link to the admin rate entry page.

There is no "degraded mode" where the report silently uses 1:1 — that would mis-state consolidated HKD lines by a factor of ~5. Missing rate is always visible.

## Confirmation: No NZD / No Cron Artifacts

Per POST-RESEARCH CORRECTIONS in 34-RESEARCH.md:

- `grep -c "NZD" src/lib/consolidation/fx.ts` = 0 (stale NZD references removed during execution).
- `grep -rn "cron\|fx-sync\|RBA\|rba" src/lib/consolidation/` returns no matches in fx.ts.
- No `/api/cron/fx-sync` route created.
- No RBA F11.1 scraper imported.
- `fx_rates.source = 'manual'` is the only expected source for the Iteration 34.0 admin UI.

All manual-only. All HKD/AUD scoped. Any future additional currency pair can reuse the same module without code changes (the API is currency-pair-agnostic at the type level).

## Self-Check: PASSED

- File `src/lib/consolidation/fx.ts` exists (183 LOC, 4 exports verified).
- File `src/lib/consolidation/fx.test.ts` exists (179 LOC, 13 tests passing).
- Commit `bdfb376` exists in `git log` (RED commit).
- Commit `b97e667` exists in `git log` (GREEN commit).
- All 13 vitest tests green; tsc --noEmit clean.
- All 10 acceptance-criteria grep checks pass with expected counts.

## Next Phase Readiness

- Plan 00b (engine core, running in parallel) can import `translateBSAtClosingSpot` symbol unconditionally — no runtime call today, just type-level integration.
- Plan 00e (API route + engine wiring) has the full FX surface ready: `loadFxRates` for DB reads, `translatePLAtMonthlyAverage` for the per-member translation pass, `translationDiagnostics` for the response packaging.
- Plan 00f (admin FX entry UI) has the contract it needs: write to `fx_rates` with `source='manual'`, use slash-format `currency_pair`, period = first-of-month for `monthly_average`. The UI reads the same shape back via `loadFxRates`.
- Plan 34-01a replaces `translateBSAtClosingSpot` stub — signature already committed so the change is localized.

No blockers. No concerns.

---

*Phase: 34-dragon-multi-entity-consolidation — Plan 00c*
*Completed: 2026-04-18*
