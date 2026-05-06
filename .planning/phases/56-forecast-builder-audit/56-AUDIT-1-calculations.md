# Audit 1 — Calculations

## P0 — Ship blockers

### COGS-001: Variable COGS percentOfRevenue unit-mismatch risk
- **File:** useForecastWizard.ts:1074-1075
- **Bug:** `const adjustedPct = (line.percentOfRevenue || 0) + trendAdj; return sum + (revenue * adjustedPct) / 100;`
- **Issue:** Code assumes `percentOfRevenue` always 0-100. If ever stored as 0-1 decimal (e.g., from a different code path), `0.30 + trendAdj` then `/100` produces 0.0023 instead of 0.30. Massively understated.
- **Reproducer:** COGS line with `percentOfRevenue=0.30` (decimal) → Y1 cost = `revenue × 0.0023` instead of `× 0.30`.
- **Risk:** HIGH if any input path stores decimals.

### NewHire-001: Hard-coded 3% salary increase, can't configure
- **File:** useForecastWizard.ts:1149
- **Bug:** `const hireIncreasePct = 3 / 100; // Standard 3% annual salary increase`
- **Issue:** All new hires use exactly 3% Y2/Y3 growth. Existing team members use `member.increasePct` (configurable). NewHire has no `increasePct` field — entirely ignored.
- **Reproducer:** Existing employee with 5% raise; new hire (same role/salary, 5% intended). Y2: existing = 1.05× ✓, new hire = 1.03× ✗.
- **Impact:** EVERY forecast with new hires systematically mis-forecasts team cost growth.

### OpEx-Y2Y3-Override-001: y2Override / y3Override silently ignored
- **File:** useForecastWizard.ts:1173-1213 (OpEx rollup block)
- **Bug:** `OpExLine` type defines `y2Override` and `y3Override` (types.ts:307-311), but the summary rollup never reads them — always uses formula.
- **Reproducer:** Fixed OpEx "Rent" $5K/mo. Set `y2Override=$5,500/mo` (lease escalation). Summary still shows $61.8K (formula: 60K × 1.03), not $66K (override).
- **Impact:** User's manual Y2/Y3 adjustments ARE silently ignored. Inputs accepted but discarded.

### Bonus-001: Bonuses applied full amount even when employee departed
- **File:** useForecastWizard.ts:1160-1161
- **Bug:** `const bonusTotal = state.bonuses.reduce((sum, b) => sum + b.amount, 0); teamCosts += bonusTotal;`
- **Issue:** Bonuses applied identically Y1/Y2/Y3 regardless of employee departure. No pro-rata, no termination check.
- **Reproducer:** Member gets $10K June bonus. Member departs March. Y1 should be $0 (departed before June), code applies full $10K.
- **Impact:** Forecasts with departures overstate team cost.

## P1 — Confusing

### Team-Commission-001: Commission percentage unit ambiguous
- **File:** useForecastWizard.ts:1168
- **Risk:** `teamCosts += lineRevenue * (commission.percentOfRevenue / 100);`
- **Issue:** If commission.percentOfRevenue=5 → 5/100=0.05 ✓. If 0.05 (decimal) → 0.0005 ✗ (50× lower). Same unit risk as COGS-001.

### Seasonal-OpEx-Y1-Override-001: seasonalTargetAmount only Y1
- **File:** useForecastWizard.ts:1200-1204
- **Bug:** `if (line.seasonalTargetAmount && yearNum === 1) { lineAmount = line.seasonalTargetAmount; }`
- **Risk:** No `y2SeasonalTargetAmount` / `y3SeasonalTargetAmount`. If user wants different seasonal targets per year, Y2/Y3 silently revert to formula.

### Lease-Interest-001: Multi-year loan interest not amortized
- **File:** types.ts:462-470
- **Bug:** `totalInterest` calculated for full `termMonths` then spread annually. Each year recalculates using original `item.amount` — ignores principal paydown.
- **Reproducer:** $100K loan, 5%, 5yr. Y1 ≈$4.7K interest. Y2 should be ≈$3.8K (less principal remaining), code shows $4.7K.

### Revenue-Residual-001: Manual Y2/Y3 goal edits miss residue absorption
- **File:** useForecastWizard.ts:846-851 vs 957-973
- **Bug:** `initializeFromXero` absorbs rounding residue. `distributeGoalRevenueMonthly` (manual Y2/Y3 path) does not.
- **Reproducer:** Set Y2 goal $2,000,001. Y2 monthly total may show $1,999,999.

### Division-By-Zero-001: Loan termMonths=0 → Infinity
- **File:** types.ts:394-399
- **Bug:** `if (annualRate <= 0 || termMonths <= 0) return Math.round(principal / termMonths);`
- **Issue:** termMonths=0 returns Infinity, not safe default.

## P2 — Polish

### Commission-Orphan-001: Commission orphaned if revenue line deleted
- **File:** useForecastWizard.ts:1164-1169
- **Risk:** Deleting a revenue line leaves commissions referencing it; never applied. No cascade cleanup.

### Negative-Revenue-001: Negative goals not rejected
- **File:** Step1Goals.tsx
- **Risk:** No `min="0"`. Negative revenue flows through.

### Seasonal-Pattern-Sum-001: Seasonality pattern not re-validated
- **File:** line-distribution.ts:34-45
- **Risk:** If `line.seasonalityPattern` doesn't sum to ~100 (set programmatically), distribution wrong.

## Summary
- **4 P0 ship blockers** — all in useForecastWizard.ts rollup
- **5 P1 issues** — unit risks + missing override paths
- **3 P2 polish**

Most concerning: **OpEx-Y2Y3-Override-001** (silent data loss on user input) and **Bonus-001** (departed-employee bonuses still counted).
