---
phase: 34-dragon-multi-entity-consolidation
plan: 00b-engine-core
subsystem: api
tags: [consolidation, multi-entity, vitest, typescript, xero]

# Dependency graph
requires:
  - phase: 34-00a
    provides: "ConsolidationGroup/Member/XeroPLLineLike/EntityColumn/ConsolidatedReport types + Dragon/IICT Mar 2026 fixtures + resolveBusinessIds util (pre-existing)"
provides:
  - "accountAlignmentKey / buildAlignedAccountUniverse / buildEntityColumn / deduplicateMemberLines (src/lib/consolidation/account-alignment.ts)"
  - "loadGroup / loadMemberSnapshots / combineEntities / buildConsolidation (src/lib/consolidation/engine.ts)"
  - "FX plug-in point (identity pass-through at engine.ts:171) ready for plan 00c"
  - "Eliminations plug-in point (empty array at engine.ts:178) ready for plan 00d"
affects: [34-00c, 34-00d, 34-00e, 34-00f, 34-01a, 34-02a]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-ID resolution per member (resolveBusinessIds) before every xero_pl_lines query"
    - "Pure engine module — all Supabase I/O isolated in loadGroup + loadMemberSnapshots; combine/align are deterministic"
    - "Account alignment key = lowercase(account_type) + '::' + lowercase.trim(account_name) (Pitfall 4)"
    - "Staging-by-multiplier pattern (`* 0`) to preserve sign-convention plumbing while deferring behaviour to a future plan"

key-files:
  created:
    - "src/lib/consolidation/account-alignment.ts"
    - "src/lib/consolidation/account-alignment.test.ts"
    - "src/lib/consolidation/engine.ts"
    - "src/lib/consolidation/engine.test.ts"
  modified: []

key-decisions:
  - "Alignment sort order hard-coded in engine: revenue (0) → cogs (1) → opex (2) → other_income (3) → other_expense (4). Unknown types sort last (99). Matches xero_pl_lines.account_type enum vocabulary."
  - "deduplicateMemberLines prefers populated account_code/section from a duplicate over null — rescues partially-populated sync rows."
  - "combineEntities keeps the `* 0` staging multiplier per plan instruction (autonomous_mode note). Plan 00d will remove it AND add the reportMonth parameter so eliminations apply to reportMonth only."
  - "buildConsolidation treats opts.fyMonths as authoritative for month columns (caller-supplied) — engine does not hardcode FY ranges, keeping it fiscal-year-agnostic."
  - "Empty monthly_values for a universe row in a member → filler entry with all FY months set to 0 (ensures column × universe parity in UI)."

patterns-established:
  - "Pure consolidation engine template: load (I/O) → dedup → FX hook → align → combine (all pure after load)"
  - "Plug-in-point comments mark exactly where future plans wire in behaviour (grep for 'PLUG-IN POINT' in engine.ts)"
  - "Fixture-driven engine tests: deterministic Dragon Mar 2026 values (11652, 0, 818) asserted to the dollar"

requirements-completed: [MLTE-02, MLTE-03]

# Metrics
duration: 6min
completed: 2026-04-18
---

# Phase 34 Plan 00b: Engine Core Summary

**Pure consolidation engine — parallel per-member xero_pl_lines fetch via resolveBusinessIds, account alignment keyed by type::name-normalized, entity-column $0-filler, and sum-with-eliminations-slot combine — all deterministic and fixture-tested.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-18T05:21:00Z
- **Completed:** 2026-04-18T05:27:00Z
- **Tasks:** 2 / 2
- **Files created:** 4
- **Tests:** 16 passed (9 alignment + 7 engine)

## Accomplishments

- `src/lib/consolidation/account-alignment.ts` — 4 pure exports (`accountAlignmentKey`, `deduplicateMemberLines`, `buildAlignedAccountUniverse`, `buildEntityColumn`) covering Pitfall 4 (type+name key), xero-race dedup, universe sorting, and $0-filler per member.
- `src/lib/consolidation/engine.ts` — `buildConsolidation(supabase, opts)` orchestrates load → parallel per-member fetch → dedup → FX-hook → align → combine and returns `ConsolidatedReport` with empty `fx_context.missing_rates` + empty `eliminations` (slots for plans 00c and 00d).
- Dragon fixture arithmetic validated to the dollar: Sales-Deposit (11,652) passes through from Easy Hail only; Advertising & Marketing nets to $0 pre-elimination (−9,015 + 9,015); Referral Fee − Easy Hail = 818 (Dragon side); Sales − Referral Fee = 818 (Easy Hail side).
- `combineEntities` staging multiplier (`* 0` on eliminations contribution) kept per plan directive — plan 00d will remove it and add the `reportMonth` parameter.
- Parallel fetch enforced: `Promise.all` over `members.map`, `resolveBusinessIds` per member, `.in('business_id', ids.all)` on every query.

## Module Line Counts

| File | Lines |
|---|---|
| account-alignment.ts | 135 |
| account-alignment.test.ts | 140 |
| engine.ts | 204 |
| engine.test.ts | 113 |
| **Total** | **592** |

## Task Commits

1. **Task 1: Account alignment module** — `a4099fc` (feat)
2. **Task 2: Engine orchestration** — `b222fd7` (feat)

_Both tasks produced deterministic, fixture-asserted behaviour — TDD was executed as a single test-and-source pair per task (test file and source file co-written and co-committed rather than red/green split), which matches the plan's `<action>` structure that supplies complete source + test bodies verbatim. Plan-level type remains `execute`, not `tdd`, so no gate commits are expected._

## Files Created/Modified

- `src/lib/consolidation/account-alignment.ts` — pure alignment primitives (key, dedup, universe, column filler).
- `src/lib/consolidation/account-alignment.test.ts` — 9 tests covering key normalization, Pitfall 4 (same name different type), dedup sum + partial-row merge, Dragon fixture universe coverage, shared-account dedup, sort order (revenue < opex), Dragon column parity, filler zero-fill.
- `src/lib/consolidation/engine.ts` — orchestration module with clearly-marked FX (plan 00c) and elimination (plan 00d) plug-in points.
- `src/lib/consolidation/engine.test.ts` — 7 tests: Sales-Deposit = 11,652, Advertising = 0, row parity, Referral Fee − Easy Hail = 818, Sales − Referral Fee = 818, pure-sum for unpopulated months, staging-elim no-op.

## Decisions Made

See `key-decisions` above. Most notable: the plan-directed `* 0` staging multiplier in `combineEntities` is intentional and documented in-code with a seven-line comment block (search `INTENTIONAL NO-OP` in engine.ts). A dedicated test (`combineEntities — staging no-op elimination behaviour`) locks the behaviour so an accidental removal in a future plan that isn't 00d would fail CI.

## Deviations from Plan

None — plan executed exactly as written. The `<action>` blocks supplied complete source + test bodies and these were transcribed faithfully. One additive improvement: extended `deduplicateMemberLines` tests to cover the partial-row code/section merge path (existing code already handled it — test added for safety). Two additional assertions (Sales − Referral Fee = 818; staging-elim no-op) were added to engine tests because they materially tighten the correctness contract Plan 00d will rely on.

## Dragon Fixture TODO_MATT_CONFIRM Rows Encountered

The Dragon/Easy Hail fixture (`src/lib/consolidation/__fixtures__/dragon-mar-2026.ts`, staged in plan 00a) contains the following `TODO_MATT_CONFIRM` markers that this engine plan did NOT need to resolve because every engine test asserts only against the four locked anchor values (11,652; ±9,015; 818). They remain open for plan 00e human-verification:

1. `dragonRoofingPL → Sales - Roofing` — Mar 2026 value currently set to 0.
2. `dragonRoofingPL → top-3 OpEx rows` (Wages, Insurance, Rent/Occupancy) — not yet transcribed.
3. `dragonRoofingPL → top-3 Revenue rows` — not yet transcribed.
4. `easyHailPL → top-3 OpEx rows` + non-intercompany revenue rows — not yet transcribed.
5. `dragonExpectedConsolidated['2026-03']` — contains only the four anchor keys; remaining totals TODO once rows 1–4 are filled in.

**Flag for plan 00e:** before the visual-match checkpoint, re-read the Dragon PDF and populate the TODO rows so the full consolidated P&L renders realistic numbers (not just the four anchors plus zeros).

## Hooks Exposed for Downstream Plans

### Plan 00c (FX translation)
- **Plug-in point:** `engine.ts` line 171 (`const translated = deduped`).
- **Expected replacement:** wrap each member snapshot in `translatePLAtMonthlyAverage` when `member.functional_currency !== group.presentation_currency`.
- **Output surface:** `ConsolidatedReport.fx_context.rates_used` and `ConsolidatedReport.fx_context.missing_rates` must be populated by the FX layer (currently both empty).
- **Contract guarantee:** the engine passes `deduped` through untouched today — 00c can diff this single line plus the `fx_context` population in the return object.

### Plan 00d (eliminations)
- **Plug-in point A:** `engine.ts` line 178 (`const eliminations: EliminationEntry[] = []`). Replace with a call to the elimination matcher against active rules for the group.
- **Plug-in point B:** `engine.ts` lines 129–136 — remove the `* 0` multiplier in `combineEntities` AND add a `reportMonth` parameter so eliminations apply to reportMonth only (non-reportMonth months remain pure sums).
- **Test to relax:** `combineEntities — staging no-op elimination behaviour` in `engine.test.ts` (will flip from asserting no-op to asserting actual elimination).
- **Diagnostics:** `diagnostics.eliminations_applied_count` and `diagnostics.eliminations_total_amount` currently return 0/0 — 00d should populate.

### Plan 00e (API route + UI)
- Consume `buildConsolidation(supabaseAdmin, { groupId, reportMonth, fiscalYear, fyMonths })` directly. The engine is Supabase-client-agnostic (accepts `any` for `supabase` to avoid locking to a single client type).
- `ConsolidatedReport.byEntity` is already in display_order order (loadGroup orders members by `display_order ASC`).

## Verification

- `npx vitest run src/lib/consolidation --reporter=dot` → 16/16 passed (2 test files).
- `npx tsc --noEmit` → exit 0, no errors.
- `grep` acceptance criteria all satisfied:
  - 4 exports in account-alignment.ts ✓
  - 4 exports in engine.ts ✓
  - `toLowerCase().trim()` in account-alignment.ts ✓
  - `resolveBusinessIds` used in engine.ts ✓
  - `Promise.all` in engine.ts ✓
  - `from '@/lib/utils/resolve-business-ids'` in engine.ts ✓

## Issues Encountered

None.

## Next Phase Readiness

- **Plan 00c** (FX, parallel wave 2 sibling) — can plug into the FX hook without touching engine orchestration.
- **Plan 00d** (eliminations) — has a clear two-point landing spot and a test ready to flip from no-op to real assertion.
- **Plan 00e** (API route + UI) — can call `buildConsolidation` as-is; Dragon path is fully green. IICT path needs 00c (FX) green before integration.

## Self-Check

Verified files + commits exist:

- `src/lib/consolidation/account-alignment.ts` FOUND
- `src/lib/consolidation/account-alignment.test.ts` FOUND
- `src/lib/consolidation/engine.ts` FOUND
- `src/lib/consolidation/engine.test.ts` FOUND
- Commit `a4099fc` FOUND (Task 1)
- Commit `b222fd7` FOUND (Task 2)

## Self-Check: PASSED

---
*Phase: 34-dragon-multi-entity-consolidation*
*Plan: 00b-engine-core*
*Completed: 2026-04-18*
