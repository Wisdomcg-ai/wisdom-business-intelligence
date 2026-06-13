---
phase: 73-annual-plan-reset
plan: "06"
subsystem: goals / testing
tags: [annual-reset, integration-test, reversibility, zero-impact, full-suite-gate]
dependency_graph:
  requires: [73-01, 73-02, 73-03, 73-04, 73-05]
  provides: [integration-regression-net, full-suite-green]
  affects:
    - src/__tests__/goals/annual-reset-integration.test.ts
key_files:
  created:
    - src/__tests__/goals/annual-reset-integration.test.ts
  modified: []
decisions:
  - "Built a single shared in-memory Supabase mock (hoisted) backing business_financial_goals, business_kpis, strategic_initiatives, plan_snapshots — so the REAL snapshot service + REAL reset service round-trip on one store. The snapshot service is NOT stubbed (that's the integration point); only @/lib/supabase/client is mocked."
  - "Builder is thenable (then) so chains awaited without maybeSingle/single (kpis read, update .eq, initiative .in.eq) resolve to {data,error}; select/maybeSingle/single return JSON-cloned copies so a captured snapshot can't alias the row the reset later mutates."
  - "Test uses the ACTUAL service signature { businessId, userId, yearStartMonth } — the plan's interface block still listed a stale businessesId param (removed by the dual-ID fix); wrote against the real code."
  - "Snapshot-insert failure injected via cfg.failSnapshotInsert to prove the snapshot-before-overwrite gate yields ZERO writes."
metrics:
  completed: "2026-06-13"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 73 Plan 06: Cross-unit integration test + full-suite gate

## Task 1 — integration test (`annual-reset-integration.test.ts`, 10 tests, all pass)
Wires the three real units (detectAnnualResetState + annualResetSnapshotService + annualResetService) against one shared in-memory Supabase:
- **Round-trip (FY26):** executeAnnualReset captures an `annual_reset_FY2026` snapshot of the ORIGINAL ladder *before* any overwrite; rolls the D3 ladder + dates (2026-07-01 / 2027-06-30 / 2029-06-30) + clears quarterly_targets; carries only incomplete initiatives (selected=false, fiscal_year=2027); then `restoreAnnualResetSnapshot` returns the goals row to its exact pre-reset state.
- **Snapshot gate:** a forced snapshot-insert failure ⇒ `success:false`, goals row byte-for-byte unchanged, zero snapshot rows, initiative untouched.
- **Detection matrix:** FY26 → 'needs-reset'; Armstrong/Fit2Shine (2027-06-29) → 'normal-review'; null dates → 'initial-setup'; plus an already-planned no-op proving the hook gate never rolls a 'normal-review' client.
- **CY boundary:** rolls to 2027-01-01 / 2027-12-31 / 2029-12-31.

## Task 2 — full-suite gate
- `npx vitest run` → **1848 passed**, 1 failed.
- The single failure is `src/__tests__/goals/plan-period-banner.test.tsx > renders three date inputs` — a **pre-existing, local-only timezone-shaped** failure. The file is **byte-identical to main** (Phase 73 never touched it) and it passes in CI (UTC). Per MEMORY guidance, local-only TZ failures are ignored; confirmed pre-existing.
- `npx tsc --noEmit` clean. `npm run build` (next build, stricter ESLint) compiles + lints + generates all 117 pages.

## Self-Check: PASSED
- [x] Integration test exercises executeAnnualReset + restoreAnnualResetSnapshot + detectAnnualResetState
- [x] Proves snapshot-failure ⇒ goals unchanged
- [x] Proves Armstrong/Fit2Shine (2027-06-29) ⇒ 'normal-review' ⇒ no roll
- [x] Proves FY (2026-06-30→2027-06-30→2029-06-30) AND CY (2026-12-31→2027-12-31→2029-12-31)
- [x] Full suite green modulo the documented pre-existing local-only TZ failure; tsc + next build clean
