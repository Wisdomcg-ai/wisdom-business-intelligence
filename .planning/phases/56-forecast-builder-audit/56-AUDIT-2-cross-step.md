# Audit 2 — Cross-step consistency

## P0 — Ship blockers

### BUG-001: Step 8 what-if scenarios skip depreciation adjustment
- **File:** Step8Review.tsx:495-533
- **Bug:** What-if toggles modify revenue/cogs/team/opex but NOT depreciation. Net-profit impact shown is incomplete.
- **Risk:** User makes scenario decisions on partial math.

### BUG-002: What-if toggles only apply to Y1, silent for Y2/Y3
- **File:** Step8Review.tsx:496
- **Bug:** No Y2/Y3 application; falls back to unadjusted yearData. Users assume toggles are global.
- **Risk:** Multi-year scenario analysis silently wrong.

### BUG-003: Commissions don't scale per-year with revenue trajectory
- **File:** useForecastWizard.ts:1164-1169
- **Bug:** Fixed percentage regardless of revenue trajectory. Multi-year with declining revenue still pays full commission %.

### BUG-004: COGS y2y3Trend silently ignored when manual monthly entered
- **File:** useForecastWizard.ts:1058-1076
- **Bug:** Two code paths — formula path applies trend; manual-monthly path doesn't. User toggles "improves 2%" thinking it's active; numbers don't change.
- **Risk:** Margin assumption silently violated.

### BUG-005: New hire salary increase hard-coded to 3%
- **File:** useForecastWizard.ts:1149
- **Bug:** Same as Audit 1 NewHire-001. Existing team uses `member.increasePct`; new hires locked to 3%.
- **Cross-corroborates:** Audit 1.

### BUG-006: OpEx team-exclusion logic split between rollup & assumptions export
- **File:** useForecastWizard.ts:1178 vs 1386
- **Bug:** Same conditional filter not applied consistently. Assumptions export may include lines excluded from P&L rollup.
- **Risk:** Forecast restored from saved assumptions shows different P&L totals than original.

### BUG-007: Revenue line ID drift across sessions
- **File:** useForecastWizard.ts:778+, 1191
- **Bug:** Lines use `generateId()` (random timestamps). Variable OpEx lines reference revenue by ID. If IDs drift across sessions/saves, OpEx-revenue link breaks.

## P1 — Confusing

### BUG-008: Step 8 yearGoals nullable check incomplete
- Y2/Y3 display attempts to format undefined goals on 1-year forecasts.

### BUG-009: Step 2 seasonal pattern globally applied
- No per-line seasonal override granularity (only business-level).

### BUG-010: Step 6 CapEx depreciation display ≠ Step 8 waterfall calc
- Two amounts may differ for prorated purchases.

### BUG-011: Step 3 Y2/Y3 goal distribution ignores YTD actuals
- Per-line revenue share from prior year, not current YTD.

### BUG-012: Step 4 team departure month not validated
- User can set departure before hire start (no guard).

### BUG-013: Step 8 AI narrative reloads on ANY state change
- useEffect fires on every summary change. Wasted API calls.

## P2 — Polish

- BUG-014: Step 1 goal revenue changes don't propagate to Step 3 (no two-way binding)
- BUG-015: Bonus total has no deduplication
- BUG-016: Step 3 COGS empty monthly fallback hazard (zero Y2 line + empty year2Monthly)
- BUG-017: Step 5 seasonal OpEx without prior-month data
- BUG-018: Step 1 duration-lock state sync gap (activeYear may point past forecastDuration)
- BUG-019: Xero other_income / other_expense flat across all years (no per-year adjustment)
- BUG-020: Step 6 CapEx month field fiscal-year offset

## Summary
- **7 P0 ship blockers**
- **6 P1 issues**
- **7 P2 polish**

Most dangerous:
- **BUG-004** (COGS trend silently ignored — operator's "improvement" assumption discarded)
- **BUG-001** (what-if math incomplete — scenario decisions on partial picture)
- **BUG-006** (rollup vs assumptions export divergence — save/load shows different P&L)
