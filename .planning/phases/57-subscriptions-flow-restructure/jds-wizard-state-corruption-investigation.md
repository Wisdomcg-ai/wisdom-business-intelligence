# JDS wizard_state COGS corruption — root cause investigation

**Date:** 2026-05-07
**Investigator:** gsd-debugger (autonomous)
**Tenant:** Just Digital Signage (business_profile.id `900aa935-ae8c-4913-baf7-169260fa19ef`)
**Scope:** Diagnose only. No fix applied. A fix is a separate phase.

---

## TL;DR

The buggy guard introduced in commit `917d3267` (PR #126, "fix(56-p1a): calculation safety fixes") turns small percentage-of-revenue values (any `< 1`) into 100× amplified values inside the wizard's client-side `summary` memo. The server-side P&L materialization is unaffected — only `wizard_state.year{N}.cogs` is corrupted, and only the operator's Step 9 review screen sees it.

- **Affected file/lines:** `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts:1439-1442` (COGS) and `:1561-1563` (commissions)
- **Impact for JDS:** wizard Y1 COGS shows $76,150,793 vs reality ~$6,652,799 (12× overstated)
- **Severity:** **HIGH operator-visible, MEDIUM data risk.** Step 9 Review and `wizard_state.year{N}` are corrupted. `forecast_pl_lines` (the source of truth for client P&L deliverables) is **NOT** corrupted.
- **Blocking client ship:** No — server-derived numbers are correct, Phase 57 didn't introduce or worsen this.
- **Pre-existing:** Yes. Predates Phase 57 by ~hours; introduced same-day in PR #126 commit `917d3267`.

---

## Hypothesis tree

| # | Hypothesis | Outcome |
|---|---|---|
| 1 | Stale `wizard_state` from past save never refreshed | **DISPROVED** — file `updated_at` is current (re-saving every minute via autosave) |
| 2 | `buildAssumptions` snapshots COGS with bad data | **DISPROVED** — `assumptions.cogs.lines` has correct `percentOfRevenue` values (sum 61.6%, matches server-derived COGS of $6.7M) |
| 3 | Type coercion / cents-vs-dollars unit error | **DISPROVED** — values in `assumptions` are in dollars (priorYearTotal sum = $6.1M, matches Xero) |
| 4 | Schema mismatch between writer and reader | **DISPROVED** — server reader (`assumptions-to-pl-lines.ts:243`) divides percentOfRevenue by 100 directly; wizard reader (`useForecastWizard.ts:1440`) applies a buggy normalization. Different code paths, same data. |
| **5** | **`normalizedPct` guard at `useForecastWizard.ts:1440` mis-classifies real sub-1% percentages as legacy decimals and 100× amplifies them** | **CONFIRMED with arithmetic identity** |

---

## Evidence

### 1. The buggy guard (the bug itself)

`src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts:1439-1442`:

```js
const rawPct = line.percentOfRevenue || 0;
const normalizedPct = rawPct > 1 ? rawPct : rawPct * 100;   // ← BUG
const adjustedPct = normalizedPct + trendAdj;
return sum + (revenue * adjustedPct) / 100;
```

**Intent (per the inline comment lines 1434-1438 and the commit message of `917d3267`):** Detect "legacy import paths" that stored `percentOfRevenue` as a `0–1` decimal (e.g., `0.30` meaning 30%). When detected, multiply by 100 to convert to canonical 0-100 percent.

**Actual behavior:** Treats any `rawPct < 1` as legacy decimal and multiplies by 100. But a percentage of `0.7` legitimately means **0.7%** (point-seven percent of revenue), not "70% expressed as a decimal." The guard cannot distinguish "small real percentage" from "legacy decimal", because the two are syntactically identical.

JDS COGS lines hit this guard 28 of 29 times (every line except `Purchases - Hardware` at 37.34%, the only line whose value is ≥ 1).

### 2. Arithmetic confirmation

`scripts/diag-jds-cogs-trace.ts` (created during this investigation) walks the wizard's exact COGS formula against the live `assumptions.cogs.lines` for JDS:

```
wizard_state.year1.revenue: $10,799,999
wizard_state.year1.cogs:    $76,150,793

assumptions.cogs.lines: 29 rows
Σ percentOfRevenue (raw values): 61.60%
Σ priorYearTotal (Xero history): $6,097,303

Expected COGS = revenue × Σpct/100 = $10,799,999 × 61.60% = $6,652,799
Re-computing with wizard's normalizePct logic:
  Total: $76,150,793  ← matches wizard_state.year1.cogs to the dollar
```

The match is exact. The bug formula reproduces the corrupt number from the assumptions data with zero residual. There is no other variable in play.

### 3. The amplified lines (worst offenders for JDS)

```
Contractors - NT                                   raw=0.9000 → normalized=90.00% → $9,719,999
Logistics Costs                                    raw=0.8000 → normalized=80.00% → $8,639,999
Software Development - PK Costs                    raw=0.8000 → normalized=80.00% → $8,639,999
ES - Freight                                       raw=0.7000 → normalized=70.00% → $7,559,999
Purchases - Data Plan                              raw=0.5000 → normalized=50.00% → $5,400,000
ES - DA Fees Engineering etc                       raw=0.5000 → normalized=50.00% → $5,400,000
Purchases - Installations Travelling Costs         raw=0.5000 → normalized=50.00% → $5,400,000
Logistics Costs - ES                               raw=0.4000 → normalized=40.00% → $4,320,000
... (21 more)
```

`Contractors - NT` legitimately costs ~$87,684/yr (priorYearTotal) — about 0.9% of revenue. The wizard claims it costs $9.7M. That single line accounts for ~$9.6M of the $69M overstatement.

### 4. Git blame

```bash
$ git log origin/main --oneline -L "1438,1442:src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts"
917d3267 fix(56-p1a): calculation safety fixes (5) (#126)
```

Commit `917d3267` (May 7 2026, 14:02 AEST), authored intentionally:

> Mirrors the COGS-001 dual-unit hazard: percentOfRevenue is canonically 0-100 but legacy/import paths can store it as a 0-1 decimal. Without this guard a value of 0.05 silently becomes 0.05/100 = 0.0005, making commissions and variable COGS 50-100x understated.

The fix was applied to two sites:
- `useForecastWizard.ts:1440` (COGS variable rollup) — corrupts wizard_state
- `useForecastWizard.ts:1562` (Commission rollup) — would corrupt teamCosts but only fires if a commission exists with rawCommissionPct < 1

JDS has no commission lines in the active forecast, which is why teamCosts is approximately correct ($2.55M).

### 5. Why the server is unaffected

The server-side P&L materializer at `src/app/finances/forecast/services/assumptions-to-pl-lines.ts:243`:

```js
} else if (cogsLine.costBehavior === 'variable' && cogsLine.percentOfRevenue) {
  const pct = cogsLine.percentOfRevenue / 100
  for (const mk of forecastMonthKeys) {
    const rev = revenueByMonth[mk] || 0
    newForecastMonths[mk] = round2(rev * pct)
  }
}
```

No normalization guard. `percentOfRevenue` of `0.7` becomes `0.007`, and `revenue × 0.007` correctly produces `$76K` per year for `ES - Freight`. Server `forecast_pl_lines` Y1 COGS = **$6,669,677**, which is within $17K of the formula's expected $6,652,799 (rounding plus minor revenue-month vs annual-percent edge cases).

### 6. Why the corruption persists across saves

`buildAssumptions` (`useForecastWizard.ts:1832-1840`) snapshots `cogsLines` to the database WITHOUT writing `year1Monthly`:

```js
const cogsLines: COGSLineAssumption[] = state.cogsLines.map(line => ({
  accountId: line.accountId || line.id,
  accountName: line.name,
  priorYearTotal: line.priorYearTotal || 0,
  costBehavior: line.costBehavior,
  percentOfRevenue: line.costBehavior === 'variable' ? line.percentOfRevenue : undefined,
  monthlyAmount: line.costBehavior === 'fixed' ? line.monthlyAmount : undefined,
  notes: line.notes,
}));
```

So the database stores the **raw** `percentOfRevenue` (e.g., `0.7` for 0.7%), the server reads it correctly and produces correct `forecast_pl_lines`, but every time the wizard's `summary` memo runs against `state.cogsLines` (which holds the same raw values from localStorage and from the load-from-assumptions hydration path), the buggy guard amplifies them.

### 7. Why `wizard_state.year1.cogs` was drifting during the investigation

JDS forecast was auto-saved 4 times during this investigation (06:51, 11:25, 11:52, 11:56). Each save runs the `summary` memo. The drift (78.95M → 76.15M → 71.94M) reflects small operator edits in the wizard between saves — adjusting individual `percentOfRevenue` values by tiny amounts, each amplified 100×, makes large visible jumps. This is consistent with an active editing session rather than further corruption.

---

## Severity

| Dimension | Rating | Why |
|---|---|---|
| **Operator-visible** | HIGH | Step 9 Review screen, AICFOPanel narrative, and any UI bound to `summary.year1.cogs` show -660% net profit margin. Operator/coach will see "this forecast is broken" immediately. |
| **Client-deliverable risk** | LOW | `forecast_pl_lines` is the source of truth for budget reports, dashboards, and Xero comparisons. That table is correct. The corrupt number lives only on the wizard review screen and in `wizard_state.year{N}` (a metadata column not consumed by client-facing reports). |
| **Data-loss risk** | NONE | No data is lost. The raw `percentOfRevenue` values in `assumptions.cogs.lines` are correct; the bug is in a derivation, not the storage. Removing the bad guard would immediately produce correct numbers from the existing data. |
| **Blast radius** | MEDIUM | Same buggy guard exists at the commission rollup (`:1562`) — any tenant with a commission whose `percentOfRevenue` is < 1 will see the same 100× amplification on team costs. JDS has no commissions so it doesn't manifest there for this tenant. |
| **Phase 57 ship blocker** | NO | Phase 57 didn't introduce this and Phase 57's verification path (server-derived NP) is unaffected by it. |

---

## Recommended fix path

**Remove the guard entirely** at both sites. There is no observed legacy import that stores `percentOfRevenue` as a 0–1 decimal — the assumed hazard the guard was designed to catch was hypothetical, while the bug it introduced is real and reproducible. If the legacy hazard is later confirmed in some import path, a real fix would normalize at the IMPORT boundary (where the unit is unambiguous), not in the rollup math.

A separate phase should:
1. Delete lines `useForecastWizard.ts:1439-1441` (COGS) — replace with the pre-`917d3267` line `const adjustedPct = (line.percentOfRevenue || 0) + trendAdj;`
2. Delete lines `useForecastWizard.ts:1561-1562` (commissions) — replace with `const pct = (commission.percentOfRevenue || 0) / 100;`
3. Add a regression test that walks the JDS-shaped fixture (29 COGS lines, percentages from 0.001 to 37.3) and asserts wizard `summary.year1.cogs` matches `serverY1.cogs` within $100.
4. Force-resave each tenant's active forecast once after the fix to repopulate `wizard_state.year{N}` with correct numbers (server `forecast_pl_lines` was always correct, no remediation needed there).
5. Audit other tenants for commission lines with `percentOfRevenue < 1` — those would have inflated team costs that the operator may have noticed already.

---

## Files written by this investigation

- `.planning/phases/57-subscriptions-flow-restructure/jds-post-phase-57.json` — post-Phase-57 baseline snapshot (Job 1 deliverable)
- `.planning/phases/57-subscriptions-flow-restructure/jds-wizard-state-corruption-investigation.md` — this file
- `scripts/snapshot-forecast-baseline.ts` — restored from origin/main (was missing on this branch)
- `scripts/diag-jds-wizard-cogs.ts` — diagnostic to walk wizard COGS path
- `scripts/diag-jds-assumptions-shape.ts` — diagnostic to map JSON shape
- `scripts/diag-jds-assumptions-cogs.ts` — diagnostic to dump assumptions detail
- `scripts/diag-jds-find-state.ts` — diagnostic to locate full wizard state
- `scripts/diag-jds-cogs-trace.ts` — diagnostic that **proved the bug**

`scripts/diag-jds-cogs-trace.ts` is the keeper — it both demonstrates the root cause and would serve as the regression check until a proper unit test exists.
