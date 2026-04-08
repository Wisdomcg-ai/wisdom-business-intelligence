# Phase 17: Quarterly Review <-> Forecast Integration — Research

**Researched:** 2026-04-07
**Domain:** Quarterly Review Workshop / Forecast Wizard V4 / One Page Plan
**Confidence:** HIGH (all findings from direct source-code inspection)

---

## Summary

Phase 17 connects two systems that currently have zero integration: the quarterly review workshop (src/app/quarterly-review/) and the forecast wizard (src/app/finances/forecast/). The quarterly review stores its own manually-entered financial data in JSONB columns on the `quarterly_reviews` table. The forecast wizard stores monthly budget data in `forecast_pl_lines.forecast_months` and full wizard assumptions in `financial_forecasts.assumptions`.

The core work is: (1) a new API that derives quarterly forecast totals from monthly `forecast_months` data by summing the three YYYY-MM keys that belong to a given quarter using `getQuarterDefs()` / `generateFiscalMonthKeys()` from `fiscal-year-utils.ts`; (2) a new financial review step (or an extension of step 4.1 "Annual Plan & Confidence") that displays the Q forecast vs actual variance panel; (3) a mechanism to optionally write a confidence adjustment back to the remaining `forecast_months` rows; (4) the forecast wizard reading `quarterly_reviews.quarterly_targets` as an additional target reference; and (5) extending the One Page Plan to show a next-year column alongside the current year.

**Primary recommendation:** Build a thin `/api/forecast/quarterly-summary` endpoint that accepts `forecastId + quarter + fiscalYear` and returns summed forecast and actuals for that quarter. Mount the variance panel inside step 4.1 (ConfidenceRealignmentStep) as a new data card — do not create a new step, since step 4.1 already loads annual targets and is the natural home for this conversation.

---

## Standard Stack

### Core (already in project — no new installs needed)
| Library | Purpose | Notes |
|---------|---------|-------|
| `@supabase/supabase-js` | DB queries for forecast_pl_lines | All existing patterns use this |
| `fiscal-year-utils.ts` | Quarter-to-month mapping | `getQuarterDefs()`, `generateFiscalMonthKeys()` — fully parameterised by `yearStartMonth` |
| `forecast-service.ts` | `getOrCreateForecast()` — resolves forecast for a business+FY | Handles dual-ID system; already in use |

### No new packages required
All integration work is plumbing between existing Supabase tables, existing TypeScript utilities, and existing React components.

---

## Architecture Patterns

### Recommended Project Structure additions
```
src/app/api/forecast/
└── quarterly-summary/       # NEW: GET ?forecastId=&quarter=&fiscalYear=
    └── route.ts

src/app/quarterly-review/
└── components/steps/
    └── ConfidenceRealignmentStep.tsx   # EXTEND: add variance panel + confidence→forecast write-back
```

### Pattern 1: Quarter-to-Month Key Resolution

**What:** To sum forecast/actual data for Q2, you need the three YYYY-MM keys that fall in Q2 for the given fiscal year.

**How:**
```typescript
// fiscal-year-utils.ts already has everything needed
import { getQuarterDefs, generateFiscalMonthKeys } from '@/lib/utils/fiscal-year-utils'

function getMonthKeysForQuarter(quarter: 1 | 2 | 3 | 4, fiscalYear: number, yearStartMonth: number): string[] {
  const allKeys = generateFiscalMonthKeys(fiscalYear, yearStartMonth)  // 12 YYYY-MM keys in FY order
  const qIndex = quarter - 1  // 0-based
  return allKeys.slice(qIndex * 3, qIndex * 3 + 3)  // 3 months per quarter
}
```

**Example for FY2026 (yearStartMonth=7), Q3:**
- `generateFiscalMonthKeys(2026, 7)` → `['2025-07','2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06']`
- Q3 slice (index 2×3=6 to 9) → `['2026-01','2026-02','2026-03']`

### Pattern 2: Quarterly Forecast Summary API

**Endpoint:** `GET /api/forecast/quarterly-summary?forecastId={id}&quarter={1-4}&fiscalYear={year}`

**What it sums across `forecast_pl_lines`:**
- `forecast_months[key]` for each of the 3 quarter month keys → quarterly forecast
- `actual_months[key]` for the same 3 keys → quarterly actuals (0 if month hasn't completed yet)

**Response shape:**
```typescript
{
  quarter: number,
  fiscalYear: number,
  forecastId: string,
  // Per P&L category
  revenue: { forecast: number; actual: number; variance: number; variancePct: number },
  grossProfit: { forecast: number; actual: number; variance: number; variancePct: number },
  netProfit: { forecast: number; actual: number; variance: number; variancePct: number },
  hasActuals: boolean  // false if quarter is entirely in the future
}
```

### Pattern 3: Confidence Adjustment → Forecast Write-Back

**What:** When a coach adjusts confidence (e.g., "revenue will be 10% lower"), optionally scale remaining `forecast_months` values on `forecast_pl_lines`.

**Mechanism:**
1. User sets a % adjustment on ConfidenceRealignmentStep (e.g., -10% revenue).
2. On save, call `PATCH /api/forecast/{forecastId}/adjust-forward`.
3. The patch identifies all month keys from today forward (within the fiscal year), multiplies `forecast_months[key]` by the factor for revenue-category lines.
4. Triggers a re-save to Supabase. The forecast wizard will reflect the change on next load.

**Critical constraint:** Only adjust months that are still forecast (i.e., key >= current month). Never modify `actual_months`.

### Pattern 4: Forecast ID Resolution from Quarterly Review Context

**Problem:** `quarterly_reviews` has no `forecast_id` column today.

**Solution options (in priority order):**
1. **Lookup by match** (preferred, no schema change): When rendering the variance panel, call `ForecastService.getOrCreateForecast(businessId, userId, fiscalYear)` — this already resolves the correct FY forecast. The quarterly review's `year` field gives the fiscal year.
2. **Add `forecast_id` FK** (if ambiguity exists): Add nullable `forecast_id UUID REFERENCES financial_forecasts(id)` to `quarterly_reviews`. Populate at review creation time. Adds explicit linkage but requires a migration.

For Phase 17, option 1 is sufficient because `getOrCreateForecast` now filters by `fiscal_year` (Phase 16 fix).

### Pattern 5: Forecast Wizard Reads Quarterly-Adjusted Targets

**What:** The forecast wizard (Step 1 goals) can optionally pre-populate from the most recent completed quarterly review's `quarterly_targets` JSONB.

**Where to wire:** `useForecastWizard.ts` → `loadInitialData()`. After loading goals from `business_financial_goals`, check for the most recently completed `quarterly_reviews` row for the same FY and populate `state.goals.year1` from `quarterly_targets`.

**Conflict resolution:** Only use quarterly review targets if no manual goal has been set yet, OR surface as a "suggestion" chip the coach can accept.

### Pattern 6: One Page Plan — Next Year Column

**Current state:** `OnePagePlanData` has `financialGoals.year1` (current year targets) and `financialGoals.year3` (3-year vision). No "next year" slot.

**Extension needed:**
- Add `year2` to `OnePagePlanData.financialGoals` reading from `business_financial_goals.revenue_year2`, `gross_profit_year2`, `net_profit_year2`.
- Add a year toggle (Current Year / Next Year) on the One Page Plan page — same FY selector pattern as Phase 16's `FYSelectorTabs`.
- No DB migration needed; the data already exists in `business_financial_goals`.

### Anti-Patterns to Avoid
- **Duplicating quarterly total calculation logic**: All quarter→month mapping must use `getQuarterDefs()` / `generateFiscalMonthKeys()` from `fiscal-year-utils.ts`. Never hardcode month offsets.
- **Writing to actual_months**: The confidence write-back must only touch `forecast_months`. `actual_months` comes from Xero and must not be overwritten.
- **Reading wizard state from React**: The quarterly review runs in a separate page context. All forecast data must come from the DB (`forecast_pl_lines`, `financial_forecasts.assumptions`), not from the wizard's in-memory state.
- **Assuming assumptions JSONB always exists**: `financial_forecasts.assumptions` is nullable (added in migration `20260303_wizard_v4_columns.sql`). Always null-check before reading.

---

## Data Model Inventory

### quarterly_reviews table (current schema)
Key columns relevant to Phase 17:
- `business_id UUID` — references `businesses.id`
- `quarter INTEGER` (1-4)
- `year INTEGER` — fiscal year label (e.g., 2026 for FY2026)
- `quarterly_targets JSONB` — `{ revenue, grossProfit, netProfit, kpis[] }` — set in step 4.2
- `annual_plan_snapshot JSONB` — `AnnualPlanSnapshot` — targets from `business_financial_goals`
- `realignment_decision JSONB` — `RealignmentData` — adjusted targets if coach lowered confidence
- `annual_target_confidence INTEGER` (1-10) — set in step 4.1
- `confidence_notes TEXT`
- `targets_adjusted BOOLEAN`
- `ytd_revenue_annual`, `ytd_gross_profit_annual`, `ytd_net_profit_annual NUMERIC` — manually entered YTD values

**Missing:** No `forecast_id` FK. No columns for "forecast variance" data. These must be fetched at read time or added via migration.

### financial_forecasts table (current schema)
Key columns:
- `id UUID`
- `business_id UUID` — references `business_profiles.id` (note: dual-ID pattern)
- `fiscal_year INTEGER`
- `assumptions JSONB` — full wizard state including `revenueLines[].year1Monthly`
- `is_completed BOOLEAN` and `is_locked BOOLEAN`
- `forecast_start_month TEXT` / `forecast_end_month TEXT`

### forecast_pl_lines table (current schema)
Key columns:
- `forecast_id UUID`
- `category TEXT` — "Revenue", "Cost of Sales", etc.
- `account_type TEXT`
- `forecast_months JSONB` — `{ "2025-07": 50000, "2025-08": 48000, ... }` — wizard-generated budget
- `actual_months JSONB` — `{ "2025-07": 52000, ... }` — Xero actuals

**Quarter total derivation:** Sum `forecast_months[key]` for the 3 month keys of the target quarter. Same for `actual_months`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Quarter → month key mapping | Custom month arrays | `generateFiscalMonthKeys()` + slice by quarter | Already parameterised by `yearStartMonth`; CY and FY both handled |
| Forecast lookup | Direct SQL query from review step | `ForecastService.getOrCreateForecast()` | Already handles dual-ID system, fiscal_year filter (Phase 16), creates if missing |
| Actuals aggregation | New aggregation logic | Pattern from `/api/forecast/[id]/actuals-summary/route.ts` | Category classification (`isRevenue()`, `isCOGS()`) already handles edge cases |
| YTD actuals in review | New Xero fetch | `ytd_revenue_annual` / `ytd_gross_profit_annual` on `quarterly_reviews` (manual entry) | Already editable in step 4.1; keep manual entry as primary, Xero fetch as optional enhancement |

**Key insight:** The month-level data is already in `forecast_pl_lines.forecast_months` — the planner just needs summing logic for 3 specific keys. There is no need to re-derive from `assumptions` JSONB.

---

## Common Pitfalls

### Pitfall 1: CY vs FY Quarter Numbering
**What goes wrong:** Q3 in FY (Jul start) = Jan-Mar. Q3 in CY (Jan start) = Jul-Sep. Hardcoded month lookups will be wrong for one or the other.
**Why it happens:** quarterly_reviews and forecast wizard both support both year types.
**How to avoid:** Always read `yearStartMonth` from `business_financial_goals.year_type` or `business_profiles.fiscal_year_start`. Pass to `generateFiscalMonthKeys()`.
**Warning signs:** Variance numbers are exactly 2 quarters off for FY businesses.

### Pitfall 2: forecast_pl_lines.business_id vs quarterly_reviews.business_id
**What goes wrong:** `financial_forecasts.business_id` is `business_profiles.id`. `quarterly_reviews.business_id` is `businesses.id`. A direct join fails.
**Why it happens:** Dual-ID system (documented in MEMORY.md). `business_profiles.id !== businesses.id`.
**How to avoid:** Use `ForecastService.getOrCreateForecast(businessId, userId, fy)` — it already resolves both IDs.
**Warning signs:** `getOrCreateForecast` returns null for clients that definitely have a forecast.

### Pitfall 3: Locked Forecast Write-Back
**What goes wrong:** Confidence adjustment tries to write to a locked forecast, silently fails or errors.
**Why it happens:** Phase 16 added `is_locked` enforcement. Locked forecasts are read-only.
**How to avoid:** Check `forecast.is_locked` before attempting write-back. If locked, show "forecast is locked — adjustment noted but not applied to forecast".
**Warning signs:** Write-back silently does nothing for locked FY forecasts.

### Pitfall 4: assumptions JSONB Missing Monthly Data
**What goes wrong:** Reading `assumptions.revenueLines[].year1Monthly` returns undefined or empty — forecast was built before Phase 5 monthly storage was added.
**Why it happens:** `year1Monthly` was added in Phase 5 (ROADMAP). Old forecasts may only have legacy quarterly data.
**How to avoid:** Use `forecast_pl_lines.forecast_months` as the primary data source (always populated by `convertAssumptionsToPLLines`). Fall back to `assumptions` only if `forecast_months` is empty.
**Warning signs:** All quarterly forecast totals are $0 for older businesses.

### Pitfall 5: quarterly_reviews.year vs fiscal_year
**What goes wrong:** `quarterly_reviews.year` stores the fiscal year number (e.g., 2026 for FY2026). `financial_forecasts.fiscal_year` uses the same convention. But `getCurrentQuarter()` in the review types module returns a different `year` value for some edge cases.
**Why it happens:** `getCurrentQuarter()` returns `_getFY(ysm)` which is correct for Au FY. However if year_type is CY, the year returned is the calendar year. These should match `financial_forecasts.fiscal_year`.
**How to avoid:** Use `review.year` directly as the fiscal year when calling `getOrCreateForecast`. Verify it matches `financial_forecasts.fiscal_year` in test data.

---

## Step-by-Step Integration Map

### Where variance panel lives
**Step 4.1 — ConfidenceRealignmentStep** is the right home. It already:
- Fetches `business_financial_goals` for annual targets
- Displays Revenue / Gross Profit / Net Profit vs YTD actuals
- Has the confidence slider and "adjust targets" toggle
- Is loaded at the "Annual Plan & Confidence" stage — exactly where "Q3 forecast: $2.8M | Actual: $2.6M" conversation belongs

**No new step needed.** Add a "Forecast vs Actuals" card above the existing confidence slider.

### Where confidence → forecast write-back happens
In `ConfidenceRealignmentStep`'s `handleConfidenceUpdate()` / the `adjusted` checkbox path. When coach checks "adjust targets" AND a forecast exists, offer an optional "Apply to forecast" button that calls the new adjust-forward API.

### Where forecast reads quarterly-adjusted targets
In `useForecastWizard.ts` → `loadInitialData()`. After loading from `business_financial_goals`, optionally suggest most-recent completed quarterly review's `quarterly_targets` as year1 goals.

### Where One Page Plan gets next-year view
In `plan-data-assembler.ts` → `assemblePlanData()`: already reads `business_financial_goals.revenue_year2` etc. Just add `year2` to `OnePagePlanData.financialGoals` and add a year selector toggle to `one-page-plan/page.tsx`.

---

## Code Examples

### Quarter month keys (use this pattern everywhere)
```typescript
// Source: src/lib/utils/fiscal-year-utils.ts
import { generateFiscalMonthKeys } from '@/lib/utils/fiscal-year-utils'

function getMonthKeysForQuarter(
  quarter: 1 | 2 | 3 | 4,
  fiscalYear: number,
  yearStartMonth: number
): string[] {
  const allKeys = generateFiscalMonthKeys(fiscalYear, yearStartMonth)
  const startIdx = (quarter - 1) * 3
  return allKeys.slice(startIdx, startIdx + 3)
}
// FY2026 (ysm=7), Q3: ['2026-01', '2026-02', '2026-03']
// CY2026 (ysm=1), Q3: ['2026-07', '2026-08', '2026-09']
```

### Summing forecast_months for a quarter
```typescript
// Pattern from actuals-summary/route.ts — apply same to forecast_months
function sumMonthsForKeys(monthsData: Record<string, number>, keys: string[]): number {
  return keys.reduce((sum, key) => sum + (monthsData[key] || 0), 0)
}

// Usage in quarterly-summary API:
const qKeys = getMonthKeysForQuarter(quarter, fiscalYear, yearStartMonth)
const forecastRevenue = revenueLines.reduce((sum, line) => {
  return sum + sumMonthsForKeys(line.forecast_months || {}, qKeys)
}, 0)
const actualRevenue = revenueLines.reduce((sum, line) => {
  return sum + sumMonthsForKeys(line.actual_months || {}, qKeys)
}, 0)
```

### ForecastService.getOrCreateForecast (existing — use as-is)
```typescript
// Source: src/app/finances/forecast/services/forecast-service.ts
const { forecast } = await ForecastService.getOrCreateForecast(
  businessId,   // businesses.id (NOT business_profiles.id)
  userId,
  fiscalYear    // e.g., 2026
)
// Returns null if no forecast exists and createNew would be premature
```

### Quarterly review's fiscal year derivation
```typescript
// quarterly_reviews.year stores the fiscal year label (same as financial_forecasts.fiscal_year)
// Use directly — no conversion needed
const fiscalYear = review.year  // e.g., 2026
const yearStartMonth = startMonthFromYearType(yearType)  // 7 for FY, 1 for CY
```

---

## State of the Art

| Old Approach | Current Approach | Phase |
|---|---|---|
| Quarterly review had no forecast data | Zero integration today | Baseline |
| `ytd_revenue_annual` is manual entry only | Manual entry remains primary; forecast actuals are supplementary display | Phase 17 target |
| forecast_months was quarterly data | Monthly data per line (Phase 5) | Complete |
| fiscal year utils were hardcoded | Central `fiscal-year-utils.ts` with parameterised yearStartMonth | Phase 13 |
| FY selector absent | `FYSelectorTabs` + `getOrCreateForecast` filters by fiscal_year | Phase 16 |

---

## Open Questions

1. **Schema change for forecast_id on quarterly_reviews?**
   - What we know: Forecast can be looked up by `ForecastService.getOrCreateForecast(businessId, userId, review.year)` at render time.
   - What's unclear: If a business has multiple forecasts for the same FY (e.g., a draft and a locked version), which should the review reference?
   - Recommendation: Add nullable `forecast_id` FK to `quarterly_reviews` in Phase 17 migration. Populate it at review creation time. If null (old reviews), fall back to `getOrCreateForecast` lookup.

2. **Confidence adjustment granularity**
   - What we know: Coach can adjust annual targets in step 4.1 today. The roadmap says "optionally update remaining forecast months."
   - What's unclear: Should adjustment be per-line (Revenue only), per-category, or a blunt total adjustment? 
   - Recommendation: Start simple — a single "revenue adjustment %" that scales all revenue `forecast_months` going forward. Defer per-line adjustments to a later phase.

3. **Actuals source for variance display**
   - What we know: `forecast_pl_lines.actual_months` is populated from Xero syncs. `quarterly_reviews.ytd_revenue_annual` is manual entry.
   - What's unclear: If Xero hasn't been synced, `actual_months` is empty. Which source wins?
   - Recommendation: Show `actual_months` sum from forecast_pl_lines as the preferred source (labelled "From Xero"). Fall back to manually-entered `ytd_revenue_annual` if Xero data is absent. Surface which source is being used.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 17 is code/config-only changes. No external CLI tools, databases, or services beyond the already-running Supabase instance are required.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no jest.config.*, vitest.config.*, or pytest.ini found |
| Config file | None — see Wave 0 |
| Quick run command | `npx tsc --noEmit` (TypeScript check as proxy for correctness) |
| Full suite command | `npx tsc --noEmit` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-17-01 | Quarterly review shows Q forecast vs actual variance | manual smoke | Open step 4.1 in workshop, verify variance card appears | N/A |
| REQ-17-02 | Variance calculation is correct (sum forecast_months, sum actual_months for Q3 month keys) | unit | `npx tsc --noEmit` | Wave 0 gap |
| REQ-17-03 | CY business gets correct quarter month keys | unit | `npx tsc --noEmit` | Wave 0 gap |
| REQ-17-04 | FY business gets correct quarter month keys | unit | `npx tsc --noEmit` | Wave 0 gap |
| REQ-17-05 | Confidence adjustment does not modify actual_months | manual | Inspect DB after adjustment | N/A |
| REQ-17-06 | Locked forecast blocks write-back gracefully | manual | Smoke test with locked FY2025 forecast | N/A |
| REQ-17-07 | One Page Plan next-year view shows year2 targets | manual smoke | Toggle year on One Page Plan | N/A |
| REQ-17-08 | Forecast wizard Step 1 suggests quarterly-reviewed targets | manual smoke | Open wizard after completing Q review | N/A |

### Wave 0 Gaps
- No test framework exists in this project. TypeScript compilation (`npx tsc --noEmit`) is the only automated check.
- The `getMonthKeysForQuarter` helper function should be added to `fiscal-year-utils.ts` and verified with inline comments showing expected outputs for FY and CY.

---

## Sources

### Primary (HIGH confidence)
All findings from direct source inspection — no external research required for this integration phase.

- `src/app/quarterly-review/components/steps/ConfidenceRealignmentStep.tsx` — current step 4.1 implementation
- `src/app/quarterly-review/components/steps/QuarterlyPlanStep.tsx` — current step 4.2 with existing targets loading
- `src/app/quarterly-review/types/index.ts` — `QuarterlyReview` interface, `WorkshopStep` enum, all JSONB shapes
- `src/app/api/forecast/[id]/actuals-summary/route.ts` — aggregation pattern for `actual_months` (template for `forecast_months` summing)
- `src/lib/utils/fiscal-year-utils.ts` — `getQuarterDefs()`, `generateFiscalMonthKeys()`, `getQuarterForMonth()`
- `src/app/finances/forecast/components/wizard-v4/types.ts` — `RevenueLine`, `MonthlyData`, `monthlyToQuarterly()`
- `src/app/finances/forecast/services/forecast-service.ts` — `getOrCreateForecast()` with dual-ID resolution
- `src/app/one-page-plan/types.ts` — `OnePagePlanData` interface
- `src/app/one-page-plan/services/plan-data-assembler.ts` — how financial goals feed the plan
- `supabase/migrations/20251126_create_quarterly_reviews.sql` — quarterly_reviews schema
- `supabase/migrations/20241120_financial_forecast_simple.sql` — financial_forecasts + forecast_pl_lines schema
- `supabase/migrations/20260303_wizard_v4_columns.sql` — assumptions JSONB column

---

## Metadata

**Confidence breakdown:**
- Data model: HIGH — schemas read directly from migrations
- Integration zero-state: HIGH — grep confirmed no forecast refs in quarterly-review/
- Quarter-to-month math: HIGH — fiscal-year-utils.ts is comprehensive and tested in production
- Write-back mechanism: MEDIUM — pattern is clear but locking edge cases need care
- One Page Plan extension: HIGH — year2 data already exists in business_financial_goals

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable codebase; changes only via planned phases)
