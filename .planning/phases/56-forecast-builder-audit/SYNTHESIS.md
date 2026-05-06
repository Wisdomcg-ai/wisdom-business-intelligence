# Phase 56 — Forecast Builder Audit: Master Synthesis

**Date:** 2026-05-07
**Audits run:** 4 in parallel (calculations, cross-step, save/load, edge-cases)
**Total issues found:** 22 P0 + 31 P1 + 32 P2 = 85 (with overlap)
**Deduped P0s:** ~18 unique ship blockers

## Executive read

The forecast builder is **NOT client-ready**. Recurring patterns:
1. **Silent ignored inputs** — operator types numbers (Y2 OpEx override, COGS trend toggle, what-if depreciation), system discards. No warning. No visible failure.
2. **Save/load divergence** — multiple paths where saved data ≠ displayed data after reload (planned spends lost, summary recomputation race, assumptions-vs-rollup classification split).
3. **Multi-year math drift** — Y2/Y3 derivation has at least 4 places where formulas behave differently than UI implies.
4. **Pro-rata gaps** — bonuses, what-if scenarios, salary increases lack proper time-shape handling.

These bugs combine to make any moderately complex forecast (multi-year, with departures, bonuses, what-if scenarios) produce numbers the operator can't trust.

## P0 SHIP BLOCKERS (deduped, prioritized by risk × effort)

### Tier A — Silent data loss / divergence (FIX FIRST)

| # | Bug | Files | Effort |
|---|---|---|---|
| **P0-1** | **OpEx Y2/Y3 overrides silently ignored** — types defines `y2Override`/`y3Override`, rollup never reads them | useForecastWizard.ts:1173-1213 | S |
| **P0-2** | **Planned spends NOT restored on load** — saved but never read back; Step 6 disappears every reload | ForecastWizardV4.tsx (no restore code) | S |
| **P0-3** | **Save-load summary race** — saved during init produces wrong summary; reload shows different numbers | ForecastWizardV4.tsx:893-1001 | M |
| **P0-4** | **OpEx team-exclusion classification split between rollup + assumptions export** — saved-then-loaded forecast shows different P&L | useForecastWizard.ts:1178 vs 1386 | M |
| **P0-5** | **COGS y2y3Trend silently ignored when manual monthly entered** — operator toggles "improves 2%", math doesn't change | useForecastWizard.ts:1058-1076 | S |

### Tier B — Wrong math (FIX SECOND)

| # | Bug | Files | Effort |
|---|---|---|---|
| **P0-6** | **Bonuses applied to departed employees** — no termination check, no pro-rata | useForecastWizard.ts:1160-1161 | S |
| **P0-7** | **New hire salary 3% hard-coded** — ignores any per-hire `increasePct` | useForecastWizard.ts:1149 | S |
| **P0-8** | **Multi-year salary inflation chain ambiguous** — compounds 3% × 3% (6.09%) without operator clarity | Step4Team.tsx / types.ts | S |
| **P0-9** | **Variable OpEx returns 0 for new businesses** — no priorYear means percent = 0; silent underforecast | opex-classifier.ts:614-633 | S |
| **P0-10** | **Other Income inflates revenue baseline** — Xero `other_income` (dividends, grants) leaks into operating revenue | pl-summary / historical-pl-summary | M |
| **P0-11** | **What-if scenarios skip depreciation** — net profit math incomplete in scenario mode | Step8Review.tsx:495-533 | S |
| **P0-12** | **What-if toggles only apply Y1** — Y2/Y3 silently use unadjusted data | Step8Review.tsx:496 | M |
| **P0-13** | **Commission % doesn't scale per-year** — flat % across all years regardless of trajectory | useForecastWizard.ts:1164-1169 | S |
| **P0-14** | **Manual Y2/Y3 goal residue not absorbed** — totals can be off by $1-3 from goal | useForecastWizard.ts:957-973 | S |

### Tier C — Multi-tab / structural risks

| # | Bug | Files | Effort |
|---|---|---|---|
| **P0-15** | **Concurrent save race** — two tabs both end with `is_active=true` | api/forecast-wizard-v4/generate/route.ts:135-145 | M |
| **P0-16** | **activeYear > forecastDuration not validated on restore** — crashes on stale state | useForecastWizard.ts | S |
| **P0-17** | **Team member deletion orphans saved references** | useForecastWizard.ts:502-510 | S |
| **P0-18** | **Fiscal year switch mid-flow corrupts month keys** | useForecastWizard.ts:56-78 | M |

## Effort estimate

- **15 small (S) fixes:** ~30-45 min each = ~1 day
- **5 medium (M) fixes:** ~1-2 hours each = ~1 day

**Total: ~2 days of focused execution to clear all P0s.**

## Recommended ship order

### Day 1 — Tier A (silent failures)
1. P0-1 (OpEx Y2/Y3 overrides) — **start here**, single file, single PR
2. P0-2 (Planned spends restore) — single file
3. P0-5 (COGS y2y3Trend) — single file
4. P0-3 (Save-load summary race) — needs careful testing
5. P0-4 (Team exclusion split) — refactor to single source

### Day 2 — Tier B + C (wrong math + structure)
6. P0-6 + P0-7 + P0-8 (bonus pro-rata + new hire % + inflation chain) — bundle as "team math fixes"
7. P0-9 (Variable OpEx new-business default)
8. P0-11 + P0-12 + P0-13 (what-if + commission scaling)
9. P0-10 (Other Income classification) — needs Xero category review
10. P0-14 (Y2/Y3 residue absorption)
11. P0-15 + P0-16 + P0-17 + P0-18 (structural)

### Day 3 — JDS verification
End-to-end manual walkthrough on JDS data. Fill wizard, save, reopen, verify.

## P1 + P2 follow-ups

31 P1 + 32 P2 issues documented across the four audit files. None are ship blockers but several are confusing UX. Schedule for Phase 57 after client ship.

## Files

- `56-AUDIT-1-calculations.md` — calculations
- `56-AUDIT-2-cross-step.md` — cross-step consistency
- `56-AUDIT-3-save-load.md` — save/load + state integrity
- `56-AUDIT-4-edge-cases.md` — multi-year + Xero variability + edge cases
- `SYNTHESIS.md` — this file

## Status: ready for execution

Each of the 18 P0s is small enough to ship as a standalone PR. The dependency graph is mostly flat — fixes don't conflict heavily. Two days of focused parallel execution will clear the list.

**Strong recommendation: do not ship to clients until all P0s are addressed.**
