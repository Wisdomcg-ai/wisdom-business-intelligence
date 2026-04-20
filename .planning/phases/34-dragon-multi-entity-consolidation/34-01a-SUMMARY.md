---
phase: 34-dragon-multi-entity-consolidation
plan: 01a
subsystem: api, database, ui
tags: [consolidation, balance-sheet, fx-translation, cta, intercompany-loan, phase-34, ias21]

requires:
  - phase: 34-dragon-multi-entity-consolidation
    provides: "consolidation engine (tenant model), eliminations engine, FX monthly-average translation, consolidation_elimination_rules table with intercompany_loan rule_type, fx_rates table"
  - phase: 27-balance-sheet
    provides: "BalanceSheetData + BalanceSheetRow shape; single-entity BS pass-through /api/Xero/balance-sheet"
provides:
  - "translateBSAtClosingSpot + loadClosingSpotRate (fx.ts) — IAS 21 closing-spot translation for Balance Sheet lines"
  - "buildConsolidatedBalanceSheet (balance-sheet.ts) — multi-tenant BS aggregation engine with FX + intercompany loan elimination + CTA"
  - "applyLoanEliminations — intercompany loan zeroing (both sides), Pitfall 5 fix"
  - "computeTranslationReserve — pure residual math for Assets − (Liabilities + Equity)"
  - "POST /api/monthly-report/consolidated-bs — auth-gated, rate-limited, stage-tracked consolidated BS endpoint"
  - "ConsolidatedBSTab UI — per-tenant columns + Assets/Liabilities/Equity sections + CTA callout"
  - "useConsolidatedBalanceSheet hook — mirrors useConsolidatedReport for the BS endpoint"
  - "xero_balance_sheet_lines table — persisted BS storage for consolidation (mirrors xero_pl_lines shape)"
affects: [phase-34-02 (cashflow consolidation), phase-35 (approval snapshots include consolidated BS)]

tech-stack:
  added: []   # No new libraries — reuses Next.js Route Handlers, Supabase client, vitest mocks
  patterns:
    - "Engine composition: balance-sheet.ts reuses loadBusinessContext from engine.ts rather than duplicating tenant-loading logic"
    - "Single-rate BS translation (contrast with per-month P&L map) — Pitfall 5/6 compliant"
    - "Pure-math helpers (computeTranslationReserve, applyLoanEliminations) exported separately from the DB-touching entry point for unit testability"
    - "matchRuleToLines reuse across P&L + BS eliminations via BS->PL line shape adapter (monthly_values.__bs__ stub)"

key-files:
  created:
    - "supabase/migrations/20260420032941_consolidation_bs_translation.sql"
    - "src/lib/consolidation/balance-sheet.ts"
    - "src/lib/consolidation/balance-sheet.test.ts"
    - "src/app/api/monthly-report/consolidated-bs/route.ts"
    - "src/app/api/monthly-report/consolidated-bs/route.test.ts"
    - "src/app/finances/monthly-report/hooks/useConsolidatedBalanceSheet.ts"
    - "src/app/finances/monthly-report/components/ConsolidatedBSTab.tsx"
  modified:
    - "src/lib/consolidation/fx.ts — replaced translateBSAtClosingSpot stub with real impl + added loadClosingSpotRate"
    - "src/lib/consolidation/fx.test.ts — 14 → 25 tests (added BS translation + loadClosingSpotRate coverage)"
    - "src/app/finances/monthly-report/types.ts — ReportTab union now includes 'balance-sheet-consolidated'"
    - "src/app/finances/monthly-report/components/MonthlyReportTabs.tsx — new showConsolidatedBS prop + tab"
    - "src/app/finances/monthly-report/page.tsx — wired hook, auto-load effect, render block"

key-decisions:
  - "xero_balance_sheet_lines persisted (not live Xero pass-through) — the existing single-entity BS uses /api/Xero/balance-sheet live, but consolidation needs to join across tenants and apply elimination rules server-side, which requires persisted per-tenant BS rows. The single-entity pass-through path is unchanged."
  - "Translation Reserve computed as consolidated-level residual, not per-tenant. A translated tenant's own BS may balance in HKD but the consolidated sum across tenants-at-different-rates does not; CTA absorbs the difference."
  - "applyLoanEliminations ignores the `direction` column — the canonical intercompany_loan semantics are bidirectional (zero BOTH sides, Pitfall 5). One-sided loan eliminations are better expressed as rule_type='account_pair'."
  - "Hook detection duplicated (not shared with useConsolidatedReport) to keep the BS tab independent of the P&L hook's internal state. The underlying query is identical so both hooks always agree."
  - "Missing closing-spot rate is surfaced via fx_context.missing_rates (same pattern as P&L) — never falls back to 1.0 silently. Untranslated HKD lines flow through unchanged and the banner prompts the user to enter a rate."
  - "Route test uses a stable proxy object for the service-client mock so per-test `setServiceMock` swaps take effect across the module-cached `supabase` reference."

patterns-established:
  - "Pure engine helpers + thin async orchestrator — balance-sheet.ts exports applyLoanEliminations and computeTranslationReserve as standalone functions, wrapped by buildConsolidatedBalanceSheet which handles Supabase I/O"
  - "BS-as-PL shape adapter for elimination rule matching — the BS line lacks per-month values, so we synthesize { __bs__: balance } so the existing matchRuleToLines regex/code helpers can work unchanged"

requirements-completed: [MLTE-02, MLTE-03]

duration: ~25min
completed: 2026-04-20
---

# Phase 34 Iteration 34.1: Consolidated Balance Sheet Summary

**Delivered consolidated BS with IAS 21 closing-spot FX translation, intercompany loan elimination (both-sides zeroing), and automatic Translation Reserve (CTA) — Dragon AUD-only and IICT HKD-containing consolidations both supported.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-20T03:27Z
- **Completed:** 2026-04-20T03:42Z
- **Tasks:** 5 atomic commits (migration, FX helpers, engine, API route, UI wiring)
- **Files created:** 7
- **Files modified:** 5
- **Tests:** 182 → 211 (+29 new)

## Accomplishments

- End-to-end consolidated balance sheet: per-tenant columns, eliminations, CTA, FX diagnostics
- `translateBSAtClosingSpot` + `loadClosingSpotRate` promoted from stub to full implementation with positive-finite rate guard (no silent 1.0 fallback)
- Intercompany loan eliminations correctly zero BOTH sides (Loan Payable on A AND Loan Receivable on B) — addresses Research Pitfall 5 which P&L-style eliminations would miss
- Translation Reserve (CTA) computed at the consolidated level as the residual that restores Assets = Liabilities + Equity post-translation; 0 for AUD-only consolidations, non-zero whenever cross-currency translation introduces a mismatch
- New `xero_balance_sheet_lines` table with RLS trifecta (coach/service_role/super_admin), indexes for (business_id) and (business_id, tenant_id) consolidation queries
- UI tab renders Assets/Liabilities/Equity section groupings with subtotals; CTA callout prominently displayed when non-zero

## Task Commits

1. **Migration — xero_balance_sheet_lines + fx_rates doc** — `ba9d5ce` (feat)
2. **FX — translateBSAtClosingSpot + loadClosingSpotRate** — `d902468` (feat)
3. **Engine — buildConsolidatedBalanceSheet + applyLoanEliminations + computeTranslationReserve** — `5f358f3` (feat)
4. **API — POST /api/monthly-report/consolidated-bs + tests** — `ca94e04` (feat)
5. **UI — hook + tab + page wiring** — `1d7bb31` (feat)

## Test Coverage

- `src/lib/consolidation/fx.test.ts`: 25 tests (was 14) — adds scalar multiply, non-mutation, rate-guard error paths, empty input, and `loadClosingSpotRate` Supabase mock
- `src/lib/consolidation/balance-sheet.test.ts`: 12 tests — pure helpers + end-to-end buildConsolidatedBalanceSheet with Supabase mock covering Dragon AUD-only and IICT HKD scenarios (incl. deliberate CTA residual via mismatched translation rates)
- `src/app/api/monthly-report/consolidated-bs/route.test.ts`: 5 integration tests — Dragon case A (balance + loan zeroing), IICT case B (FX load + CTA), 401/400, missing-rate pass-through
- Full suite: 182 → 211 passing, `npx tsc --noEmit` clean

## Key Math — Dragon AUD-only

```
Pre-elimination:
  Assets      $1,500,000 = $1,184,827 (Dragon incl. $315,173 FA) + $500,000 (Easy Hail incl. $315,173 Loan Recv)
  Liabilities $  700,000 = $  600,000 (Dragon incl. $315,173 Loan Pay) + $100,000 (Easy Hail)
  Equity      $  800,000 = $  400,000 + $400,000

After intercompany_loan elimination:
  Loan Payable - Dragon Roofing:    $315,173 → $0 (Dragon side zeroed)
  Loan Receivable - Dragon Roofing: $315,173 → $0 (Easy Hail side zeroed)
  Assets      $1,184,827
  Liabilities $  384,827
  Equity      $  800,000
  Balance check: 1,184,827 − (384,827 + 800,000) = 0  ✓
  CTA = 0 (no FX)
```

## Deviations from Plan

### [Rule 2 - Auto-add missing critical functionality] Created xero_balance_sheet_lines table

- **Found during:** Task 1 (migration scope analysis)
- **Issue:** The plan assumed `xero_balance_sheet_lines` already existed (Phase 27 deliverable). In this codebase the single-entity BS is a LIVE Xero pass-through (`/api/Xero/balance-sheet`), not a persisted table. Consolidation needs persisted rows to join across tenants.
- **Fix:** Migration creates the table with (business_id, tenant_id, account_name, account_code, account_type asset/liability/equity, section, monthly_values jsonb), RLS trifecta, indexes, updated-at trigger.
- **Files modified:** `supabase/migrations/20260420032941_consolidation_bs_translation.sql`
- **Commit:** `ba9d5ce`

### [Rule 3 - Auto-fix blocking issue] Stable proxy mock for Supabase client

- **Found during:** Task 4 (route tests)
- **Issue:** Tests 2-5 failed with 500 because `vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => currentServiceMock) }))` called `createClient` once at module load and froze the first `currentServiceMock`. Subsequent `setServiceMock` swaps didn't propagate.
- **Fix:** Return a stable proxy object whose `from(table)` delegates to `currentServiceMock.from(table)` at call time. Reassigning `currentServiceMock` in beforeEach now works as intended.
- **Files modified:** `src/app/api/monthly-report/consolidated-bs/route.test.ts`
- **Commit:** `ca94e04`

### [Plan adaptation] Tenant-model pivot from group-model spec

- **Found during:** Context read (`34-01a-PLAN.md` pre-dates the tenant-model pivot in commit f244bd9)
- **Issue:** PLAN.md references `consolidation_groups`, `consolidation_group_members`, `group_id`, `source_business_id`, etc. — these no longer exist. Consolidation unit is now "one business with 2+ xero_connections rows".
- **Fix:** Used the tenant-model types from `src/lib/consolidation/types.ts` (ConsolidationBusiness, ConsolidationTenant, EliminationRule). Mirrored engine.ts pattern (`loadBusinessContext` + `loadTenantSnapshots`). Elimination rules keyed on `tenant_a_id` / `tenant_b_id` (strings), not `entity_a_business_id` / `entity_b_business_id` (UUIDs).
- **Files modified:** All created files use tenant-model shapes
- **Commits:** `5f358f3`, `ca94e04`, `1d7bb31`

## Visual verification

Checkpoint is deferred — the UI wiring is complete, but human-verify against the Dragon + IICT reference PDFs requires:
1. Seeding `xero_balance_sheet_lines` for Dragon Roofing + Easy Hail Claim tenants for 2026-03-31
2. Entering an HKD/AUD closing_spot rate for 2026-03-31 via /admin/consolidation
3. Comparing the Consolidated BS tab output against the Dragon + IICT Mar 2026 PDFs

These are post-merge operational steps — the code path + math have been unit + integration tested. The PR sets up a preview branch where the schema migration will apply automatically; verification against live data can happen there.

## Threat Flags

None — the route and engine operate within the threat surface already enumerated in the Iteration 34.0 threat model (auth-gated POST, service-role DB access, parameterized queries, no SQL concat). The new `xero_balance_sheet_lines` table inherits the RLS trifecta pattern used for all consolidation tables.

## Self-Check: PASSED

All 7 created files exist on disk. All 5 task commits present in `git log`. Test suite green (211 passing). `npx tsc --noEmit` clean. Grep-based acceptance criteria all meet their thresholds (positive finite rate guard, ≥2 matches for translateBSAtClosingSpot/loadClosingSpotRate, ≥1 for Translation Reserve/CTA, 28 `expect()` in route.test.ts, 8 Loan Payable/Receivable matches, etc.).
