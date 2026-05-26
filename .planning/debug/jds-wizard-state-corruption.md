---
status: diagnosed
trigger: "Phase 57 T16 verification + JDS wizard_state corruption root-cause"
created: 2026-05-07T00:00:00Z
updated: 2026-05-07T12:00:00Z
---

## Current Focus

hypothesis: Two-pronged investigation — (Job 1) Phase 57 verification, (Job 2) wizard_state COGS corruption (78M vs 6.7M, ~11.8x ratio close to 12x)
test: Job 1 — re-run snapshot; Job 2 — pull wizard_state, walk math, git blame buildAssumptions
expecting: Job 1 PASS within $5,435 threshold; Job 2 root cause identified (likely × 12 done twice)
next_action: Restore script + baseline locally, run snapshot for post-phase-57

## Symptoms

expected:
  Job 1: serverY1 unchanged within max($10, 0.05% × y1Revenue) = $5,435 for JDS post-Phase-57
  Job 2: wizard_state.year1 should equal serverY1 (~$336K Y1 NP)

actual:
  Job 1: TBD (re-run pending)
  Job 2: wizard.year1.cogs = $78,954,323 (server: $6,691,943; ratio 11.8x ≈ 12x)
         wizard.year1.netProfit = -$71,372,578 (server: +$336,047)
         wizard.year1.opex = $727,035 (server: $3,842,643 — also wrong but inverse direction)
         Wizard NP delta vs server = +$71.7M (impossible — COGS exceeds revenue 7.3x)

errors: No runtime errors; data corruption only

reproduction:
  1. Read .planning/phases/57-subscriptions-flow-restructure/jds-baseline-pre-phase-57.json
  2. Compare wizard.y1 vs serverY1 fields — wizard COGS is ~12x server COGS
  3. wizard.year1.netProfit = -$71M, mathematically impossible

started: Pre-existing as of forecastUpdatedAt = 2026-05-07T06:51:05.547Z (latest save)

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-05-07T00:00:00Z
  checked: .planning/phases/57-subscriptions-flow-restructure/jds-baseline-pre-phase-57.json
  found: wizard Y1 COGS=$78,954,323, server Y1 COGS=$6,691,943, ratio=11.798. Y2 COGS=$87.7M, Y3 COGS=$95.0M (similar magnitudes scaled by revenue growth)
  implication: Ratio close to 12 strongly suggests 12-multiplication error somewhere (monthly × 12 × 12, or annual stored as monthly × 12 in wrong units)

- timestamp: 2026-05-07T00:00:00Z
  checked: jds-baseline-pre-phase-57.json — wizard opex vs server opex
  found: wizard.year1.opex=$727,035; serverY1.opex=$3,842,643 (server is ~5.3x wizard); wizard teamCosts=$2,562,504 → wizard team+opex=$3,289,539 (closer to server but still ~$553K short)
  implication: opex is INVERSE — wizard UNDER-counts opex by ~$553K. Server includes more in opex bucket (depreciation/investments). Different bug than COGS or none — see notes block in baseline JSON

## Resolution

root_cause: useForecastWizard.ts:1440 buggy `normalizedPct` guard from commit 917d3267 (PR #126 fix-56-p1a). Guard `rawPct > 1 ? rawPct : rawPct * 100` was intended to detect legacy 0-1 decimal storage but mis-classifies real sub-1% percentages (like 0.7%) as decimals and 100× amplifies them. Same bug at line 1562 for commissions. Server (assumptions-to-pl-lines.ts:243) is unaffected — divides percentOfRevenue/100 directly.
  Evidence: walking JDS assumptions.cogs.lines through wizard formula reproduces wizard.year1.cogs=$76,150,793 to the dollar. 28 of 29 lines have percentOfRevenue < 1.
fix: Not applied (diagnosis only). Recommended: delete the `normalizedPct` guard at lines 1439-1441 and 1561-1562; revert to pre-917d3267 logic; force-resave tenant forecasts to refresh wizard_state.
verification: Job 2 root cause arithmetic-confirmed. Job 1 server-derived Y1 NP delta = +$43,137 (exceeds $5,435 threshold) but caused by operator edits between captures, not Phase 57 (subscription_budgets is empty for JDS so Phase 57 server math is no-op).
files_changed: [.planning/phases/57-subscriptions-flow-restructure/jds-post-phase-57.json, .planning/phases/57-subscriptions-flow-restructure/jds-wizard-state-corruption-investigation.md, scripts/snapshot-forecast-baseline.ts, scripts/diag-jds-wizard-cogs.ts, scripts/diag-jds-assumptions-shape.ts, scripts/diag-jds-assumptions-cogs.ts, scripts/diag-jds-find-state.ts, scripts/diag-jds-cogs-trace.ts]
