# Phase 14: Goals Wizard — First-Time Extended Period - Research

**Researched:** 2026-04-07
**Domain:** Goals Wizard state management, fiscal year proximity detection, quarterly initiative distribution, sprint planning
**Confidence:** HIGH

## Summary

Phase 14 extends the Goals Wizard (Steps 1-5) so that a client who is within 3 months of their fiscal year-end gets a 13-15 month "Year 1" rather than a standard 12-month year. The idea is that starting a strategic plan in Q4 is disjointed; it's better to plan through the rest of the current year AND the full next year as one block, then set Years 2 and 3 as the standard 12-month periods. This gives the business coach a natural "3 years from now" horizon regardless of when a new client onboards.

The Goals Wizard at `src/app/goals/` is a 5-step React wizard driven by `useStrategicPlanning.ts`. All persistent data goes through four services: `FinancialService` (financial targets), `KPIService` (KPIs), `StrategicPlanningService` (initiatives per step), and `OperationalActivitiesService`. The `business_financial_goals` table is the authoritative store for 3-year financial targets and is the primary data source for the Forecast Wizard's Step 1.

The fiscal year infrastructure from Phase 13 (`src/lib/utils/fiscal-year-utils.ts`) provides all the date-boundary logic needed, but the `fiscal_year_start` column added to `business_profiles` is not yet read in the Goals Wizard or the goals resolve-business API. That column must be wired up in this phase before proximity detection is possible.

**Primary recommendation:** Wire `fiscal_year_start` from `business_profiles` into the Goals Wizard hook, implement a `getMonthsUntilYearEnd()` helper using the existing `getFiscalYearEndDate()`, then extend the Goals Wizard's period model to support a variable-length Year 1 (13-15 months) with a separate "current year remainder" bucket in Step 4.

---

## Standard Stack

No new libraries required. Phase 14 is pure logic + UI built on the existing stack.

| Layer | Tool | Notes |
|-------|------|-------|
| Date logic | `src/lib/utils/fiscal-year-utils.ts` (Phase 13) | All fiscal year boundary helpers |
| State | `useStrategicPlanning.ts` (React hook) | Core wizard state |
| Persistence | `FinancialService`, `StrategicPlanningService` | Supabase upsert pattern |
| DB | Supabase `business_financial_goals`, `strategic_initiatives` | Existing tables |
| UI | Next.js 14 App Router, React 18, Tailwind CSS | Existing stack |

---

## Architecture Patterns

### Existing Goals Wizard Flow

```
src/app/goals/
├── page.tsx                          # Wizard shell, step navigation, SWOT loading
├── hooks/
│   └── useStrategicPlanning.ts       # All state + save/load logic
├── components/
│   ├── Step1GoalsAndKPIs.tsx         # Financial targets (3-year) + KPIs
│   ├── step1/
│   │   ├── FinancialGoalsSection.tsx
│   │   ├── CoreMetricsSection.tsx
│   │   └── KPISection.tsx
│   ├── Step2StrategicIdeas.tsx       # Brainstorm ideas
│   ├── Step3PrioritizeInitiatives.tsx # Select top initiatives
│   ├── Step4AnnualPlan.tsx           # Distribute across Q1-Q4
│   └── Step5SprintPlanning.tsx       # 90-day sprint (next quarter)
├── services/
│   ├── financial-service.ts          # business_financial_goals upsert/select
│   ├── strategic-planning-service.ts # strategic_initiatives CRUD per step_type
│   ├── kpi-service.ts
│   └── operational-activities-service.ts
└── utils/
    └── quarters.ts                   # calculateQuarters(), determinePlanYear()
```

### Pattern 1: First-Time Detection

**What:** Check `business_financial_goals` for the business. If null, it's first-time. Combine with proximity check.

**Current code path:**
```typescript
// financial-service.ts — loadFinancialGoals() already returns null for first-time:
if (!data) {
  return { financialData: null, coreMetrics: null, yearType: 'FY', quarterlyTargets: {} }
}
```

**Extended detection:** After resolving `bizId` in `useStrategicPlanning.ts`, also read `business_profiles.fiscal_year_start` to compute months until year end.

```typescript
// src/lib/utils/fiscal-year-utils.ts — helper to add
export function getMonthsUntilYearEnd(
  today: Date,
  yearStartMonth: number = DEFAULT_YEAR_START_MONTH
): number {
  const currentFY = getFiscalYear(today, yearStartMonth)
  const fyEnd = getFiscalYearEndDate(currentFY, yearStartMonth)
  const diffMs = fyEnd.getTime() - today.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30.44)) // approx months
}

export function isNearYearEnd(
  today: Date,
  yearStartMonth: number = DEFAULT_YEAR_START_MONTH,
  thresholdMonths: number = 3
): boolean {
  return getMonthsUntilYearEnd(today, yearStartMonth) <= thresholdMonths
}
```

**Conditions for extended period:**
- `loadedFinancialData === null` (first-time client)
- `isNearYearEnd(new Date(), yearStartMonth)` is true

### Pattern 2: Extended Period State

The current financial data model uses `year1 / year2 / year3` keys. For Phase 14, Year 1 becomes a variable-length period. Two approaches exist:

**Option A — Add an `extendedPeriod` flag + metadata:**
Add to the hook state:
```typescript
const [isExtendedPeriod, setIsExtendedPeriod] = useState(false)
const [extendedPeriodMonths, setExtendedPeriodMonths] = useState(12) // 13-15
const [currentYearRemainingMonths, setCurrentYearRemainingMonths] = useState(0)
```
Store `is_extended_period`, `year1_months` in `business_financial_goals` as new columns (DB migration required).

**Option B — Persist as JSONB in `quarterly_targets` or a new `plan_metadata` JSONB column:**
No new dedicated columns; store `{ isExtended: true, year1Months: 14, currentYearRemainder: 2 }` in a metadata field.

**Recommendation:** Option A — explicit typed columns. More readable, easier to query for Phase 17 forecast integration.

### Pattern 3: Initiative Distribution — Extended Q Structure

Step 4 (`Step4AnnualPlan.tsx`) uses `calculateQuarters(yearType, planYear)` to produce 4 quarters. For the extended period:

```
Normal plan:      Q1 Q2 Q3 Q4    (12 months — next full FY)
Extended plan:    CY_REM + Q1 Q2 Q3 Q4  (2 + 12 = 14 months)
```

`annualPlanByQuarter` currently uses keys `{ q1, q2, q3, q4 }`. For extended, add `current_remainder`:

```typescript
const [annualPlanByQuarter, setAnnualPlanByQuarter] = useState<Record<string, StrategicInitiative[]>>({
  current_remainder: [],  // NEW for extended period
  q1: [],
  q2: [],
  q3: [],
  q4: []
})
```

`StrategicPlanningService.saveInitiatives()` already accepts any `stepType` string — the service stores initiatives with `step_type = 'current_remainder'`. No service changes needed beyond adding the new key to the save payload in the hook.

**Critical:** The `strategic_initiatives` table has a `fiscal_year` column (added in Phase 13). For extended period initiatives:
- `current_remainder` bucket: `fiscal_year = currentFY`
- Q1-Q4 bucket: `fiscal_year = currentFY + 1`

### Pattern 4: Sprint Planning — Year Boundary Bridging

Step 5 (`Step5SprintPlanning.tsx`) calculates the next quarter using `calculateQuarters()`. When the extended period is active:

- Today is in Q4 (within 3 months of year end)
- "Next 90 days" spans from today into Q1 of the next FY
- The sprint should bridge from current remainder into next FY Q1

The sprint focus comes from `annualPlanByQuarter[selectedQuarterId]`. For the extended period case, the sprint should pull from BOTH `current_remainder` and `q1`.

The `SprintMetadata` type has `quarter: QuarterType` — this may need a new value `'CR'` (current remainder) or the sprint can be labelled `'Q4-Q1 Bridge'`.

### Pattern 5: Forecast Wizard Reading Extended Goals

`ForecastWizardV4.tsx` fetches `/api/goals?business_id=xxx` and maps:
```javascript
revenue: goalsData.goals.revenue_year1 || 0,
grossProfitPct: goalsData.goals.gross_margin_year1 || 50,
netProfitPct: goalsData.goals.net_margin_year1 || 15,
```

The forecast wizard's Step 1 has hard-coded `year1 | year2 | year3` cards with labels `FY{fiscalYear + yearNum - 1}`. If Year 1 is now 13-15 months, the forecast wizard needs to:
1. Read `is_extended_period` and `year1_months` from the goals response
2. Relabel Year 1 card (e.g., "Apr-Jun 2026 + FY2027" instead of "FY2027")

This is a larger change that impacts the forecast wizard. For Phase 14 scope, the minimal viable approach is to ensure the goals data is saved correctly so Phase 16 (Forecast Rollover) can consume it. The planner should decide whether to update the forecast wizard label in Phase 14 or defer to Phase 16.

### Anti-Patterns to Avoid

- **Don't use `quarters.ts` determinePlanYear() for proximity detection** — it hardcodes `currentMonth >= 7` for FY, ignoring the configurable `fiscal_year_start`. Use `fiscal-year-utils.ts` instead.
- **Don't change the `year1/year2/year3` column names in `business_financial_goals`** — the forecast wizard reads them directly; renaming breaks that dependency.
- **Don't auto-save during first-load detection** — the auto-save guard (`isLoadComplete`) must fire AFTER extended period detection, not before. Setting extended period state during load can trigger a premature save.
- **Don't hardcode 3 months threshold** — put it in a constant (`YEAR_END_PROXIMITY_MONTHS = 3`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fiscal year end date | Custom date math | `getFiscalYearEndDate(fy, yearStartMonth)` from `fiscal-year-utils.ts` | Already handles CY/FY, leap years, edge cases |
| Month difference | Manual date subtraction | Use `getFiscalYearEndDate` + diff in months | Less error-prone, consistent with rest of codebase |
| Quarter labels | New quarter util | `getQuarterDefs(yearStartMonth)` from `fiscal-year-utils.ts` | Already parameterized for CY/FY |
| Business ID resolution | Inline lookup | `/api/goals/resolve-business` already resolves profileId + yearType; extend it to also return `fiscal_year_start` | Avoids duplicating resolution logic |

---

## Database Schema: Current State

### `business_financial_goals` (effective schema, post all migrations)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `business_id` | TEXT UNIQUE | Was `business_profile_id`; now accepts both formats |
| `user_id` | UUID | auth.users reference |
| `business_profile_id` | UUID | Legacy column (kept for compatibility) |
| `revenue_current` | NUMERIC | Set from Xero or manual entry |
| `revenue_year1` | NUMERIC | Goals wizard Year 1 target |
| `revenue_year2` | NUMERIC | |
| `revenue_year3` | NUMERIC | |
| `gross_profit_year1/2/3` | NUMERIC | |
| `gross_margin_year1/2/3` | NUMERIC | % |
| `net_profit_year1/2/3` | NUMERIC | |
| `net_margin_year1/2/3` | NUMERIC | % |
| `customers_year1/2/3` | NUMERIC | |
| `employees_year1/2/3` | NUMERIC | |
| `leads_per_month_year1/2/3` | NUMERIC | |
| `conversion_rate_year1/2/3` | NUMERIC | |
| `avg_transaction_value_year1/2/3` | NUMERIC | |
| `team_headcount_year1/2/3` | NUMERIC | |
| `owner_hours_per_week_year1/2/3` | NUMERIC | |
| `quarterly_targets` | JSONB | `{ revenue: { q1, q2, q3, q4 }, ... }` |
| `year_type` | TEXT | 'FY' or 'CY' |
| `fiscal_year` | INTEGER | Legacy (from old schema) |
| `quarter` | INTEGER | Legacy |
| `notes` | TEXT | |

**Missing columns for Phase 14 (require migration):**
- `is_extended_period` BOOLEAN DEFAULT false
- `year1_months` INTEGER DEFAULT 12 — number of months in Year 1 (12-15)
- `current_year_remaining_months` INTEGER DEFAULT 0 — how many months are in the "current FY remainder" bucket

### `strategic_initiatives` (effective schema, post Phase 13)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `business_id` | TEXT | business_profiles.id |
| `user_id` | UUID | |
| `title` | TEXT | |
| `step_type` | TEXT | 'strategic_ideas', 'roadmap', 'twelve_month', 'q1'-'q4', 'sprint' |
| `fiscal_year` | INTEGER | Added in Phase 13 — which FY this belongs to |
| `quarter_assigned` | TEXT | 'Q1'-'Q4' (on initiative record itself) |
| `year_assigned` | INTEGER | Which year (1/2/3) |
| `order_index` | INTEGER | |
| ... (all other fields) | | |

**For Phase 14:** The new `step_type = 'current_remainder'` bucket needs to be added to the union type in `StrategicPlanningService.saveInitiatives()`. The TypeScript union currently is:
```typescript
stepType: 'strategic_ideas' | 'roadmap' | 'twelve_month' | 'q1' | 'q2' | 'q3' | 'q4' | 'sprint'
```
Add `'current_remainder'` to this union.

### `business_profiles` (relevant to Phase 14)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID | |
| `business_id` | UUID | → businesses.id |
| `industry` | TEXT | |
| `fiscal_year_start` | INTEGER DEFAULT 7 | **Added in Phase 13. NOT YET READ in any goals code.** |

---

## First-Time vs Returning Detection

**Current mechanism:** The financial service's `loadFinancialGoals()` returns `{ financialData: null }` when no row exists. In `useStrategicPlanning.ts`, the load hook checks `if (loadedFinancialData)` — so `null` means first-time.

**No dedicated `is_first_time` flag exists** in any table. Detection is purely by absence of data.

**Phase 14 approach:** `isFirstTime = (loadedFinancialData === null)`. Combine with `isNearYearEnd()`. Both conditions must be true to trigger the extended period.

**Edge case:** A coach manually starting fresh for an existing client (zero'd data) could trigger the extended period incorrectly. Consider adding a `plan_type` field or checking `created_at` timestamp gap, but for Phase 14 the simple two-condition check is sufficient.

---

## Fiscal Year Utilities Available (Phase 13)

From `src/lib/utils/fiscal-year-utils.ts` (verified by reading file):

| Function | Use For |
|----------|---------|
| `getFiscalYear(date, yearStartMonth)` | Get FY number for any date |
| `getCurrentFiscalYear(yearStartMonth)` | Current FY number |
| `getFiscalYearEndDate(fy, yearStartMonth)` | End date of a FY — use for proximity |
| `getFiscalYearStartDate(fy, yearStartMonth)` | Start date of a FY |
| `generateFiscalMonthKeys(fy, yearStartMonth)` | All 12 YYYY-MM keys for a FY |
| `getQuarterDefs(yearStartMonth)` | Q1-Q4 definitions with months |
| `getQuarterForMonth(calMonth, yearStartMonth)` | Which quarter a month is in |
| `getFiscalMonthIndex(calMonth, yearStartMonth)` | 0-based fiscal month index |

**Not yet in the util file (must add):**
- `getMonthsUntilYearEnd(today, yearStartMonth)` — integer count of months until FY end
- `isNearYearEnd(today, yearStartMonth, threshold)` — boolean proximity check

These are simple derivations from `getFiscalYearEndDate()`.

**Critical gap:** `fiscal_year_start` from `business_profiles` is NOT yet wired into the Goals Wizard. The `resolve-business` API route (`/api/goals/resolve-business`) currently returns `{ profileId, businessesId, ownerUserId, industry, businessName, yearType }` — it does NOT return `fiscal_year_start`. This route must be extended, or the hook must do an additional query.

---

## Common Pitfalls

### Pitfall 1: `quarters.ts` Is Duplicate Logic (Now Stale for CY)
**What goes wrong:** `determinePlanYear()` in `src/app/goals/utils/quarters.ts` hardcodes `currentMonth >= 7` for FY and has no `yearStartMonth` parameter. It will produce wrong results for CY businesses when detecting proximity to year end.
**Why it happens:** `quarters.ts` was written before Phase 13's central utility.
**How to avoid:** For all proximity/period detection in Phase 14, use `fiscal-year-utils.ts` functions, NOT `quarters.ts`. Step 4 and Step 5 still use `quarters.ts` for rendering — that's fine for now, but the extended period detection logic must not depend on it.

### Pitfall 2: Auto-Save Fires Before Extended Period Is Determined
**What goes wrong:** The hook's `isLoadComplete` flag is set after financial data loads. If extended period detection is async (requires fetching `fiscal_year_start`), the auto-save guard may fire before the extended flag is set.
**How to avoid:** Set `isExtendedPeriod` state before calling `setIsLoadComplete(true)`. Or add `isExtendedPeriod` to the load sequence, resolving it in the same `loadData()` async block.

### Pitfall 3: `business_financial_goals` Upsert on Conflict `business_id` — Missing New Columns
**What goes wrong:** If you add `is_extended_period` and `year1_months` columns to the table but forget to include them in `FinancialService.saveFinancialGoals()`, they'll be null in every upsert.
**How to avoid:** The `dataToSave` object in `saveFinancialGoals()` must explicitly include new columns. Supabase ignores columns not in the upsert object — they won't be reset, but they also won't be populated.

### Pitfall 4: Forecast Wizard Year Labels Break
**What goes wrong:** `Step1Goals.tsx` renders `FY{fiscalYear + yearNum - 1}` where `fiscalYear` comes from the outer `ForecastWizardV4` prop. For an extended Year 1 that spans April-June 2026 + FY2027, this label would show "FY2026" (wrong — Year 1 is 14 months crossing a year boundary).
**How to avoid:** Either (a) defer forecast wizard label changes to Phase 16, or (b) add conditional label logic in `Step1Goals.tsx` when `goalsData.goals.is_extended_period === true`.

### Pitfall 5: Sprint Date Range Crosses Year Boundary
**What goes wrong:** Step 5 `calculateQuarters()` from `quarters.ts` will show Q4 as the current quarter. "Next quarter" (the sprint target) becomes Q1 of the next FY. The sprint start/end dates will cross July 1.
**How to avoid:** The `SprintMetadata.startDate` and `endDate` can already hold arbitrary dates — they're stored as strings. The sprint for the extended period should span from today to 90 days out, even if that crosses the FY boundary. The quarter label can read "Current Year Remainder + Q1" or similar.

### Pitfall 6: `step_type = 'current_remainder'` Not in TypeScript Union
**What goes wrong:** TypeScript compile error when passing `'current_remainder'` to `saveInitiatives()`.
**How to avoid:** Update the union type in `StrategicPlanningService` before using it.

---

## Code Examples

### Detecting Extended Period in `useStrategicPlanning.ts`

```typescript
// Source: fiscal-year-utils.ts (Phase 13) + new helper
import {
  getFiscalYearEndDate,
  getCurrentFiscalYear,
  getFiscalMonthIndex,
  DEFAULT_YEAR_START_MONTH
} from '@/lib/utils/fiscal-year-utils'

function getMonthsUntilYearEnd(today: Date, yearStartMonth: number): number {
  const currentFY = getCurrentFiscalYear(yearStartMonth)
  const fyEnd = getFiscalYearEndDate(currentFY, yearStartMonth)
  // Number of complete months between today and FY end
  const months =
    (fyEnd.getFullYear() - today.getFullYear()) * 12 +
    (fyEnd.getMonth() - today.getMonth())
  return Math.max(0, months)
}

// In loadData() after getting fiscal_year_start from business_profiles:
const yearStartMonth = profileData?.fiscal_year_start ?? DEFAULT_YEAR_START_MONTH
const monthsLeft = getMonthsUntilYearEnd(new Date(), yearStartMonth)
const isFirstTime = (loadedFinancialData === null)
const isNearEnd = monthsLeft <= 3
const useExtendedPeriod = isFirstTime && isNearEnd

if (useExtendedPeriod) {
  setIsExtendedPeriod(true)
  setCurrentYearRemainingMonths(monthsLeft)
  setYear1Months(monthsLeft + 12) // remaining + full next year
}
```

### Extending `resolve-business` API to Return `fiscal_year_start`

```typescript
// /api/goals/resolve-business/route.ts — add to SELECT and response
const { data: profile } = await admin
  .from('business_profiles')
  .select('id, user_id, industry, business_id, fiscal_year_start')  // add fiscal_year_start
  .eq('business_id', businessId)
  .maybeSingle()

return NextResponse.json({
  profileId,
  businessesId: businessId,
  ownerUserId,
  industry: profileIndustry,
  businessName: business.name,
  yearType,
  fiscalYearStart: profile?.fiscal_year_start ?? 7  // add this
})
```

### Adding `current_remainder` to the Step Type Union

```typescript
// services/strategic-planning-service.ts
static async saveInitiatives(
  businessId: string,
  userId: string,
  initiatives: StrategicInitiative[],
  stepType: 'strategic_ideas' | 'roadmap' | 'twelve_month' | 'q1' | 'q2' | 'q3' | 'q4' | 'sprint' | 'current_remainder'
)
```

### DB Migration for Extended Period Columns

```sql
-- Phase 14: Extended period support on business_financial_goals
ALTER TABLE business_financial_goals
  ADD COLUMN IF NOT EXISTS is_extended_period BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS year1_months INTEGER DEFAULT 12,
  ADD COLUMN IF NOT EXISTS current_year_remaining_months INTEGER DEFAULT 0;

COMMENT ON COLUMN business_financial_goals.is_extended_period IS
  'True when Year 1 covers remaining current FY + full next FY (13-15 months).';
COMMENT ON COLUMN business_financial_goals.year1_months IS
  'Total months in Year 1 plan (12 standard, 13-15 for extended period).';
COMMENT ON COLUMN business_financial_goals.current_year_remaining_months IS
  'How many months of the current FY remain at wizard start time.';
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact for Phase 14 |
|--------------|------------------|--------------|---------------------|
| Hardcoded FY (July) | Configurable `yearStartMonth` via `fiscal-year-utils.ts` | Phase 13 | Extended period detection must use fiscal-year-utils, not quarters.ts |
| No `fiscal_year_start` in DB | `business_profiles.fiscal_year_start INTEGER DEFAULT 7` | Phase 13 (migration) | Now in DB, not yet read in goals code |
| 3 standard 12-month years | Phase 14 introduces 13-15 month Year 1 | Phase 14 | New state fields + DB columns needed |

---

## Open Questions

1. **Should the extended period be detectable post-hoc?**
   - What we know: Once the wizard is saved, `is_extended_period = true` in the DB.
   - What's unclear: If a coach opens the wizard 3 months later (when they're no longer near year end), should the wizard still show the extended layout?
   - Recommendation: Yes — load `is_extended_period` from saved data if it exists, ignoring current date. Only auto-detect on first-time load when the flag is not yet set.

2. **Does the Forecast Wizard need changes in Phase 14?**
   - What we know: `ForecastWizardV4` reads `revenue_year1/2/3` from goals. An extended Year 1 still maps to `revenue_year1`, so the dollar value remains correct.
   - What's unclear: Whether to update the Year 1 label (e.g., "Apr-Jun 2026 + FY2027 — 14 months") now or defer to Phase 16.
   - Recommendation: Defer label change to Phase 16, but add `is_extended_period` to the `/api/goals` response so Phase 16 has the data it needs.

3. **What's the UX for the `current_remainder` bucket in Step 4?**
   - What we know: Step 4 currently shows Q1-Q4 columns. A "Current Year Remainder" bucket is new.
   - What's unclear: Should it appear as a pre-Q1 column, or as a special callout at the top?
   - Recommendation: Show it as a distinct banner/column before Q1 with a label like "Now — Jun 2026 (2 months remaining)". Keep Q1-Q4 as the full next FY.

4. **Does `fiscal_year_start = 7` mean the goals wizard currently ONLY supports July start despite the Phase 13 migration?**
   - What we know: The `resolve-business` API reads `year_type` from `business_financial_goals` but NOT `fiscal_year_start` from `business_profiles`. The goals hook reads `year_type` but never uses `fiscal_year_start`.
   - What's unclear: Whether there are CY businesses in production using the goals wizard.
   - Recommendation: Phase 14 must wire up `fiscal_year_start` for all CY business support — this is a prerequisite, not an enhancement.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 14 has no external tool dependencies. All changes are code and DB migrations on the existing Supabase stack.

---

## Validation Architecture

No test framework is installed (confirmed by `package.json` — no jest, vitest, or similar in devDependencies). The project uses `npm run smoke-test` (`./scripts/smoke-test.sh`) and `npm run build` for verification.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None installed |
| Config file | None — Wave 0 must install vitest or jest |
| Quick run command | `npm run build && npm run lint` |
| Full suite command | `npm run build && npm run lint && npm run smoke-test` |

### Phase Requirements — Test Map
| Behavior | Test Type | Automated Command | Notes |
|----------|-----------|-------------------|-------|
| Year-end proximity detection returns correct months remaining | Unit | None — Wave 0 gap | Pure function, ideal for unit test |
| Extended period flag set when first-time + near year end | Unit | None — Wave 0 gap | Hook logic |
| `current_remainder` step_type saves/loads correctly | Integration | Manual — Supabase required | DB round-trip |
| Forecast wizard reads `is_extended_period` from goals API | Manual/E2E | Manual | Requires running app |
| Sprint dates bridge year boundary correctly | Unit | None — Wave 0 gap | Date math |

### Sampling Rate
- **Per task commit:** `npm run build && npm run lint`
- **Per wave merge:** `npm run build && npm run lint && npm run smoke-test`
- **Phase gate:** All above pass before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Install vitest + `@vitest/ui` for unit tests — `npm install -D vitest @vitest/ui`
- [ ] `tests/fiscal-year-utils.test.ts` — covers `getMonthsUntilYearEnd`, `isNearYearEnd`
- [ ] `tests/extended-period-detection.test.ts` — mocked `loadFinancialGoals` returning null + date mock

*(If no unit test framework is desired, the build + lint gate is the minimum viable gate.)*

---

## Sources

### Primary (HIGH confidence)
- Direct read of `src/lib/utils/fiscal-year-utils.ts` — all available utility functions
- Direct read of `src/app/goals/hooks/useStrategicPlanning.ts` — state management, load sequence, save logic
- Direct read of `src/app/goals/services/financial-service.ts` — DB column names and upsert pattern
- Direct read of `src/app/goals/services/strategic-planning-service.ts` — `step_type` union, initiative CRUD
- Direct read of `src/app/goals/utils/quarters.ts` — current quarter calculation, `determinePlanYear` limitation
- Direct read of `src/app/goals/types.ts` — all TypeScript interfaces
- Direct read of `supabase/migrations/20260407_year_type_foundation.sql` — Phase 13 DB changes
- Direct read of `supabase/migrations/20260313000004_fix_goals_wizard_save.sql` — effective schema
- Direct read of `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` — goals read path
- Direct read of `src/app/api/goals/resolve-business/route.ts` — what fields it returns today

### Secondary (MEDIUM confidence)
- Inferred from `Step1Goals.tsx` rendering code that forecast wizard labels are hardcoded `FY{year}` strings — verified by reading the file
- Inferred from `goals/ARCHITECTURE.md` that the ID system constraints apply throughout

### Tertiary (LOW confidence)
- Assessment that `quarters.ts` will not be updated to use `fiscal-year-utils.ts` in Phase 14 (based on scope) — not verified by roadmap

---

## Metadata

**Confidence breakdown:**
- Goals Wizard structure: HIGH — read all key files directly
- business_financial_goals schema: HIGH — traced through all migrations
- fiscal-year-utils availability: HIGH — read file directly
- fiscal_year_start wiring gap: HIGH — confirmed by grep returning zero matches
- Forecast wizard read path: HIGH — traced through ForecastWizardV4.tsx + /api/goals/route.ts
- Extended period DB design: MEDIUM — columns don't exist yet; design is a recommendation
- UX for current_remainder bucket: LOW — no prior art in codebase

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable codebase, 30-day window)
