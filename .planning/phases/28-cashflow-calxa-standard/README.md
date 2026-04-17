# Phase 28: Cashflow Engine — Calxa Standard Rebuild

**Status:** PLANNING
**Started:** 2026-04-17

Restructured from the original "Phase 28: Direct Method Cashflow Engine" into four
sequential sub-phases that together bring the WisdomBI cashflow engine up to
Calxa-equivalent accounting standards.

## Why this phase

The current cashflow engine has known algorithmic bugs (OpEx DPO mis-application,
DSO/DPO math overlap) and structural gaps (no depreciation, no company tax, no
CapEx, keyword-based account classification). A Calxa comparison brief confirmed
our engine diverges from AU accounting best practice in several material ways.

Goal: bring the engine to a state where coaches can trust it to reconcile to
Xero bank accounts and meet AU small-business accounting expectations, without
breaking existing clients who rely on the current engine.

## Sub-phase structure

| Sub-phase | Title | Hours | Scope |
|-----------|-------|-------|-------|
| **28.0** | Quick Wins + Test Suite | 2h | Fix active bugs (OpEx DPO, DSO/DPO math overlap) + lock current behaviour with tests |
| **28.1** | Settings Foundation | 4-5h | 3 new tables; account-picker UI; Xero COA sync |
| **28.2** | Algorithm Completeness | 4-5h | Depreciation add-back, Company Tax, CapEx, indirect-method output |
| **28.3** | Schedule + Distribution Model | 3-4h | BasePeriods[12], distribution[12], per-account Type 1-5 profiles |
| **28.4** | Cashflow Statement (Actuals) | 3-4h | Four-list classification + AASB 107 statement view |

## Safety rails

1. **Additive schema** — new tables only; existing `financial_forecasts.assumptions.cashflow` untouched
2. **Engine co-exists** — new code paths activate only when settings configured; falls back to current behaviour otherwise
3. **Feature flags per sub-phase** — each new behaviour gated so it can be toggled off per-forecast
4. **Atomic commits** — one conceptual change per commit; `git revert` always safe
5. **Test suite first** — 28.0 writes tests before any refactoring begins
6. **Coach-only during build** — `/finances/forecast` layout guard keeps clients out while in flux

## Requirements mapping

New requirement group: **CASH-C-XX** (Cashflow Calxa-standard)

- CASH-C-01 through CASH-C-05: Phase 28.0 scope
- CASH-C-10 through CASH-C-20: Phase 28.1 scope
- CASH-C-25 through CASH-C-35: Phase 28.2 scope
- CASH-C-40 through CASH-C-50: Phase 28.3 scope
- CASH-C-55 through CASH-C-65: Phase 28.4 scope

## Success criteria

- Cashflow reconciles to Xero bank balance for every actual month (continues existing behaviour)
- OpEx paid in the month it's accrued (immediate), not DPO-delayed
- Depreciation correctly added back as non-cash
- Company tax modelled as quarterly/annual cash outflow on configurable schedule
- CapEx appears as balance-sheet outflow in purchase month
- Coach can explicitly map every Xero account (bank, AR, AP, GST, PAYG, super, depreciation, tax) via UI dropdowns — no more keyword guessing
- Per-account payment timing (Type 1-5 profiles) overrides global DSO/DPO where configured
- Four-list statement classification enables AASB 107-compliant Cashflow Statement view
- Engine has >70% test coverage on core algorithm paths
- Zero existing clients broken during rollout

## References

- Calxa brief: user-supplied PDF (April 2026) — in chat history
- Current engine: `src/lib/cashflow/engine.ts`
- Research outputs: three parallel Explore agent reports (internal)
