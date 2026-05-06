# Audit 4 — Edge cases + multi-year + Xero variability

## P0 — Ship blockers

### BUG-001: Variable OpEx seeding fails for new businesses (no priorYear)
- **File:** opex-classifier.ts:614-633
- **Bug:** When `priorYearRevenue` is undefined (new business, no prior year data), `getSuggestedValue()` returns `{ value: 0, unit: '% rev' }` for variable expenses.
- **Impact:** Operator forced to manually enter every percentage; if they don't notice, OpEx underforecasts by 30-50%. Silent.

### BUG-002: Fiscal year switch mid-flow corrupts month keys
- **File:** useForecastWizard.ts:56-78
- **Bug:** `remapMonthKeysToForecastYear()` maps by positional index only. Switching `fiscalYearStart` from Jul (AU FY) to Jan (CY) shifts calendar without re-anchoring data → seasonal patterns inverted.
- **Reproducer:** Load FY27 forecast (Jul start), switch fiscal year start to Jan. Jul 2026 revenue lands in Jan 2027.

### BUG-003: Multi-year salary inflation chain ambiguous
- **File:** Step4Team.tsx / types.ts
- **Bug:** Default 3% per-year compounding (Y1→Y2 = 3%, Y2→Y3 = 3% on Y2) yields ~6.09% over 2 years. No documentation clarifies intent. Operators expecting linear "3% per year" get compounded result. Silent error ~$19k for 18 employees at $60k.

## P1 — Confusing

### BUG-004: NewHire startMonth before FY start not rejected
- Same person costed twice if already a TeamMember.

### BUG-005: Departed employees with end month before FY start shown but not filtered
- UI clutter, operator confusion.

### BUG-006: generateMonthKeys + generateFiscalMonthKeys duplication
- Latent maintenance bug.

### BUG-007: OpEx pattern not per-year; Y2 inherits Y1 behavior
- No per-year override UI for behavior changes (e.g., fixed → variable in Y2).

### BUG-008: COGS y2y3Trend dead code
- Field defined but never read/displayed. False affordance.

### BUG-009: FY label hardcoded
- Non-standard calendars mislabeled (e.g. some industries run different fiscals).

### BUG-010: Xero payroll mapper assumes ENTEREARNINGSRATE
- Hourly-only employees missing or zeroed.

### BUG-011: "Other Income" included in revenue rollup baseline
- **File:** P&L baseline / pl-summary
- **Bug:** Dividends, grants, interest income classified as 'other_income' in Xero may flow into the operating revenue baseline. Inflates baseline 30%+ → cascades to inflated Y2/Y3 forecast.
- **Impact:** Forecast revenue artificially high.

### BUG-012: Y2/Y3 goals vs line-item sums not validated
- Rollup ambiguous which is used; can drift.

### BUG-013-015: Various per-year override / per-line affordance gaps

## P2 — Polish

- BUG-013: Manual pattern mode loses monthly edits on pattern switch (PR #104 may have only partial coverage)
- BUG-014: Negative net profit % silently accepted
- BUG-015: Pay frequency "fortnightly" hardcoded to 26 periods (non-standard years 25-27)
- BUG-016: COGS `linkedRevenueLineId` stored but not enforced
- BUG-017: CSV export uses calendar months not fiscal
- BUG-018: No warning if Y2/Y3 lines empty
- BUG-019: 3% salary increase applied to casual/hourly too
- BUG-020: Month keys not validated for gaps/duplicates
- BUG-021: Empty priorYear handling inconsistent across steps
- BUG-022: Xero tenant without payroll → empty employees, silent
- BUG-023: Bonus/commission Y2/Y3 scaling unclear
- BUG-024: Contractor onshore/offshore not differentiated (FX risk)
- BUG-025: CapEx depreciation may not carry to Y2/Y3
- BUG-026: defaultOpExIncreasePct not bounded (typo "1000" → 10×)

## Summary
- **3 P0 ship blockers**
- **9 P1 issues**
- **14 P2 polish**

Most dangerous: **BUG-001** (silent underforecast for new businesses), **BUG-002** (FY switch corrupts data), **BUG-011** (Other Income inflates revenue baseline — this is a known JDS-type tenant issue).
