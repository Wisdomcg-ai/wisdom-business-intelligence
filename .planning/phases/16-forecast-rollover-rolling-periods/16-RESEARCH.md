# Phase 16: Forecast Rollover & Rolling Periods - Research

**Researched:** 2026-04-07
**Domain:** Financial forecast multi-year management, fiscal-year-aware UI, wizard initialization
**Confidence:** HIGH (all findings from direct codebase inspection)

---

## Summary

Phase 16 adds multi-year forecast management: coaches can build next year's forecast during planning season (within 3 months of year end), the forecast page shows a FY selector with tabs for current and next year, and completed fiscal years become read-only. The wizard is pre-populated from Q4 review targets already written to `business_financial_goals` by Phase 15's `syncAnnualReview`. The rolling view extends the existing `forecast_start_month`/`forecast_end_month` date-range model — no new data structure is needed for rolling periods.

The core challenge is that the forecast page currently only ever loads **one** forecast per business (the most-recently-updated one with assumptions), identified by a single `fiscalYear` integer passed to `getOrCreateForecast`. Phase 16 makes that call accept a user-selected `fiscalYear`, adds a planning-season detection banner that offers to jump to next year, and enforces `is_locked = true` on rows whose `fiscal_year < currentFY` (already a column in `FinancialForecast`).

The `forecastDuration: 1 | 2 | 3` concept in `useForecastWizard` is used for Y2/Y3 wizard steps — it is **not** what controls the P&L table month range. The month range is controlled entirely by `forecast_start_month`/`forecast_end_month` on `financial_forecasts`. Replacing duration with flexible `forecastStartMonth`/`forecastEndMonth` means adding those two columns to the table and plumbing them through `calculateForecastPeriods`.

**Primary recommendation:** Keep the `financial_forecasts` schema as-is for most fields; add two optional columns (`forecast_window_start`, `forecast_window_end`) for the explicit rolling-view override, update `getOrCreateForecast` to accept a `fiscalYear` parameter from a new FY selector tab, and extend `getForecastFiscalYear` with planning-season awareness.

---

## Standard Stack

No new libraries are required. All capabilities needed exist in the current stack.

### Core (already in project)
| Module | Purpose | Phase 16 Use |
|--------|---------|-------------|
| `src/lib/utils/fiscal-year-utils.ts` | All FY boundary math | `isNearYearEnd()`, `getMonthsUntilYearEnd()`, `generateFiscalMonthKeys()` |
| `ForecastService.getOrCreateForecast()` | Upsert forecast row | Must accept `fiscalYear` as caller-supplied, not computed internally |
| `ForecastSelector` component | Per-FY forecast list | Extend to show two tabs: Current FY / Next FY |
| `financial_forecasts` table | Forecast storage | Add `is_locked`, `forecast_window_start`, `forecast_window_end` (if not already present) |
| `business_financial_goals` table | Pre-populated targets | Already has `revenue_year1/2/3` written by Phase 15 `syncAnnualReview` |

**Installation:** None needed.

---

## Architecture Patterns

### How `fiscalYear` is currently determined (CRITICAL)

```
page.tsx
  → getForecastFiscalYear()           // src/app/finances/forecast/utils/fiscal-year.ts
      → getCurrentFiscalYear(7)       // returns 2026 in Apr 2026
  → ForecastService.getOrCreateForecast(bizId, uid, fiscalYear=2026)
      → loads most-recently-updated forecast, ignores fiscal_year filter
      → updates that row's dates to match calculated periods
```

Key insight: `getOrCreateForecast` currently finds ANY forecast for the business — it picks the one with assumptions, not necessarily the one matching `fiscalYear`. The `fiscal_year` passed in is used to name/update the found row, not to filter.

### How "Plan next year" pre-population works

`ForecastWizardV4` loads goals via `GET /api/goals?business_id=X`. That endpoint reads `business_financial_goals`. After Phase 15 `syncAnnualReview`, `revenue_year1` on that row holds the **next-year** revenue target (Phase 15 rolls `Year 2 → Year 1`). The wizard reads it into `goals.year1.revenue`. So if the coach opens the wizard with `fiscalYear = currentFY + 1`, goals are already correct — no extra pre-population logic is needed beyond pointing the wizard at the right fiscal year.

### How multiple forecasts per business work

`financial_forecasts` has NO unique constraint on `(business_id, fiscal_year)`. Multiple rows for the same business+FY can exist (used for versioning — `is_active` flags the canonical one). For Phase 16, a next-year forecast row simply gets `fiscal_year = currentFY + 1`. The query in `getOrCreateForecast` fetches up to 10 rows ordered by `updated_at desc` — it will find the right one once the caller passes the correct FY and the query is updated to filter by it.

### Planning-season detection

`isNearYearEnd(today, yearStartMonth, 3)` already exists in `fiscal-year-utils.ts`. The forecast page needs to call this with the business's `fiscal_year_start` (from `business_profiles`), which is already fetched for other wizard steps. If true, show a banner: "FY{N+1} planning season — build next year's forecast" with a tab/button.

### Rolling view (13-15 month)

The rolling view is a UI concern in `PLForecastTable` / `generateMonthColumns`. Currently `generateMonthColumns` takes four date-range strings and builds columns. For a 13-15 month rolling view:

- `actual_start_month` = current FY start (e.g., 2025-07)
- `actual_end_month` = last complete month (e.g., 2026-03, i.e., today)
- `forecast_start_month` = next month (2026-04)
- `forecast_end_month` = next FY end (2027-06)

This spans two fiscal years but fits naturally into the existing month-range model — `generateMonthColumns` is date-range-agnostic, it just renders whatever range is given. No schema change needed; it's a matter of computing the right `forecast_end_month` for a next-year forecast.

### FY read-only (lock mechanism)

`FinancialForecast` already has `is_locked?: boolean` (TypeScript type, line 151 of types.ts) and `locked_at`, `locked_by` fields. The DB migration for `last_reviewed_at` shows how additive column migrations are done. A `is_locked` DB column almost certainly exists given it's in the TypeScript type (added in the versioning section). The P&L table just needs to check `forecast.is_locked` and disable all edit controls. The wizard should refuse to open a locked forecast.

### `forecastDuration` vs flexible month ranges

`forecastDuration: 1 | 2 | 3` in `useForecastWizard` is the **wizard's** concept of how many years of P&L projections to generate (Y1 only, Y1+Y2, Y1+Y2+Y3). It controls the `YearTabs` in the wizard and whether Step 8 (Growth Plan) shows Y2/Y3 rows. It does NOT directly control what month range appears in the P&L view table.

The P&L table month range is fully controlled by `forecast_start_month` / `forecast_end_month` in the DB row. Phase 16's "flexible month ranges" goal means: when creating a next-year forecast during planning season, set `forecast_end_month` to the end of next FY (e.g., 2027-06) rather than the end of current FY. The wizard/service computes this from `fiscalYear + 1` and `yearStartMonth`.

To expose "forecastStartMonth/endMonth" as user-adjustable wizard inputs (rather than auto-computed), it requires adding two fields to `ForecastWizardState` in `types.ts` and a new Step 1 UI element. This is optional complexity — the simpler path is auto-computing from `fiscalYear`.

### Recommended Project Structure (changes only)

```
src/app/finances/forecast/
├── page.tsx                         # Add FY selector tabs + planning-season banner
├── utils/
│   └── fiscal-year.ts               # Extend getForecastFiscalYear() with planning-season awareness
├── services/
│   └── forecast-service.ts          # Update getOrCreateForecast() to filter by fiscal_year
└── components/
    ├── FYSelectorTabs.tsx            # New: Current FY | Next FY tab bar
    └── PlanningSeasionBanner.tsx     # New: "Planning season" detection banner
supabase/migrations/
└── YYYYMMDD_forecast_rollover.sql   # Add is_locked, forecast_window_start/end (if missing)
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Year-end proximity | Custom date diff | `isNearYearEnd()` from fiscal-year-utils.ts | Already handles all year types |
| Month key generation for next FY | Custom loop | `generateFiscalMonthKeys(fiscalYear+1, yearStartMonth)` | Handles CY and FY correctly |
| Multi-year month ranges | Custom column generator | `ForecastService.generateMonthColumns()` | Already date-range-agnostic |
| Prior year data source | Xero fetch | `forecast_pl_lines.actual_months` of the locked prior year row | Phase 16 goal: use forecast actuals, not Xero P&L |

---

## Data Model Deep-Dive

### `financial_forecasts` table (current schema)

Key columns relevant to Phase 16:

| Column | Type | Phase 16 Role |
|--------|------|---------------|
| `fiscal_year` | INTEGER | FY selector — currently used only for naming |
| `actual_start_month` | TEXT | Start of YTD actuals window |
| `actual_end_month` | TEXT | End of YTD actuals window |
| `forecast_start_month` | TEXT | Start of forecast window |
| `forecast_end_month` | TEXT | End of forecast window |
| `is_completed` | BOOLEAN | Currently tracked; not the same as read-only lock |
| `is_locked` | BOOLEAN (in TS type) | Lock mechanism — need to verify DB column exists |
| `is_active` | BOOLEAN (in TS type) | One active forecast per business per FY |
| `assumptions` | JSONB | `ForecastAssumptions` blob from wizard |

The `is_locked` column is defined in the TypeScript `FinancialForecast` interface but its DB migration is NOT in the migration files inspected. It may exist from the original `20241120_financial_forecast.sql` (not fully read), or may need adding.

### `business_financial_goals` columns written by Phase 15

After `syncAnnualReview()` runs (Phase 15 Plan 02):
- `revenue_year1` = next-year revenue target (A4.3)
- `gross_profit_year1` = next-year GP target
- `net_profit_year1` = next-year NP target
- `revenue_year2`, `gross_profit_year2`, `net_profit_year2` = retained from current row

The wizard `ForecastWizardV4` reads these via `GET /api/goals` and maps them to `goals.year1.*`. So when `fiscalYear = currentFY + 1` is passed to the wizard, `goals.year1` already holds the correct next-year targets with no additional logic.

### `forecast_pl_lines` — "prior year = completed forecast actuals"

`forecast_pl_lines.actual_months` is a JSONB dict of `{ "YYYY-MM": number }`. For the current FY forecast, this stores Xero actuals synced in. When the current FY ends and the forecast row is locked, those `actual_months` values ARE the completed forecast actuals. To use them as "prior year" data in the next year's wizard:
- Load the prior FY's locked forecast row
- Read `actual_months` from each `forecast_pl_lines` row for that forecast
- Map them into the Step 2 "Prior Year" data structure in the wizard

The wizard's `PriorYearData` type (`priorYear: PeriodSummary | null` in state) is already populated from `GET /api/forecast/{id}` or Xero P&L. A new endpoint `GET /api/forecast/{id}/actuals-summary` could aggregate `actual_months` across all pl_lines of the locked prior forecast — or this can be done client-side in the wizard's data loading.

---

## Common Pitfalls

### Pitfall 1: `getOrCreateForecast` ignores fiscal_year in filter
**What goes wrong:** The current query fetches top 10 forecasts ordered by `updated_at` and picks the one with assumptions. If a business has both a FY2026 and FY2027 row, the wrong one may be loaded.
**Root cause:** The fetch query uses `.in('business_id', idsToTry)` without `.eq('fiscal_year', fiscalYear)`.
**How to avoid:** Add `.eq('fiscal_year', fiscalYear)` to the query. This is a one-line fix but must be done before creating next-year forecasts or the selectors will behave incorrectly.
**Warning signs:** After creating a next-year forecast, the page keeps loading the current-year one.

### Pitfall 2: Locking a forecast breaks the wizard re-open flow
**What goes wrong:** `ForecastSelector` shows locked forecasts with "Edit" button. Clicking it opens `ForecastWizardV4` which allows edits.
**Root cause:** No `is_locked` check in `ForecastSelector` or `ForecastWizardV4` entry point.
**How to avoid:** In `ForecastSelector`, show "View" (read-only) instead of "Edit" for `is_locked = true` rows. In `ForecastWizardV4`, check `is_locked` on the loaded forecast and disable save actions.

### Pitfall 3: Planning season banner shown for CY businesses at wrong time
**What goes wrong:** `isNearYearEnd` is called with default `yearStartMonth=7`. A CY business (January year end) would get the banner in October, not October-December.
**Root cause:** `getForecastFiscalYear()` and the page's `isNearYearEnd` call must use the business's `fiscal_year_start` from `business_profiles`.
**How to avoid:** Load `business_profiles.fiscal_year_start` before calling `isNearYearEnd`. This is already done in the wizard (the `loadData()` call fetches `GET /api/business-profile`), but the page outer shell does not currently do it.

### Pitfall 4: "Prior year = forecast actuals" creates a circular dependency
**What goes wrong:** Step 2 of the wizard shows "Prior Year P&L" populated from Xero. If Phase 16 changes this to use locked forecast actuals, businesses without a locked prior-year forecast get blank Step 2 data.
**Root cause:** Forecast actuals only exist if the prior year's forecast was built with the wizard.
**How to avoid:** Use Xero P&L data as fallback (current behavior) when no locked prior forecast exists. This is graceful degradation, not a regression.

### Pitfall 5: `forecastDuration` state in `useForecastWizard` becomes stale
**What goes wrong:** `forecastDuration` is saved to `localStorage` with `wizardVersion=8`. If Phase 16 changes the meaning of "1 year forecast" for planning season, old cached state may load with duration=1 when it should be a 13-15 month rolling plan.
**Root cause:** `localStorage` wizard cache.
**How to avoid:** Bump `WIZARD_VERSION` (currently 8) to 9 when Phase 16 changes wizard state shape. This forces a fresh load.

### Pitfall 6: Rolling 13-15 month view month count
**What goes wrong:** A rolling view from Apr 2026 (current month) to Jun 2027 (next FY end) = 15 months. The `generateMonthColumns` function handles arbitrary ranges, but the wizard's `generateMonthKeys(fiscalYearStart)` only generates 12 keys. Any component that assumes 12 keys will break.
**Root cause:** `generateMonthKeys(fiscalYearStart)` in `types.ts` always returns exactly 12 keys.
**How to avoid:** The rolling view should live in the P&L table layer (which uses `generateMonthColumns` with explicit start/end dates, not `generateMonthKeys`). The wizard still operates in 12-month FY units — only the display view spans 13-15 months.

---

## Code Examples

### Planning season detection (from existing utilities)
```typescript
// Source: src/lib/utils/fiscal-year-utils.ts
import { isNearYearEnd, getMonthsUntilYearEnd } from '@/lib/utils/fiscal-year-utils'

// In forecast page.tsx, after loading business profile:
const fiscalYearStart = businessProfile?.fiscal_year_start ?? 7
const planningSeasonActive = isNearYearEnd(new Date(), fiscalYearStart, 3)
const monthsRemaining = getMonthsUntilYearEnd(new Date(), fiscalYearStart)

// nextFiscalYear = current + 1 during planning season
const currentFY = getForecastFiscalYear(fiscalYearStart)
const nextFY = planningSeasonActive ? currentFY + 1 : null
```

### Generating next-FY month keys
```typescript
// Source: src/lib/utils/fiscal-year-utils.ts
import { generateFiscalMonthKeys } from '@/lib/utils/fiscal-year-utils'

// FY2027 for AU business: ['2026-07', ..., '2027-06']
const nextFYKeys = generateFiscalMonthKeys(currentFY + 1, fiscalYearStart)
const nextFYStart = nextFYKeys[0]                    // '2026-07'
const nextFYEnd = nextFYKeys[nextFYKeys.length - 1]  // '2027-06'
```

### Rolling view date range (13-15 months)
```typescript
// Remaining current FY + full next FY
const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
const currentFYKeys = generateFiscalMonthKeys(currentFY, fiscalYearStart)
const nextFYKeys = generateFiscalMonthKeys(currentFY + 1, fiscalYearStart)

// Actual months = YTD of current FY
// Forecast months = remaining current FY + entire next FY
ForecastService.generateMonthColumns(
  currentFYKeys[0],        // actual_start
  lastCompleteMonth,       // actual_end
  currentMonth,            // forecast_start
  nextFYKeys[nextFYKeys.length - 1]  // forecast_end (next FY end)
)
```

### Filtering getOrCreateForecast by fiscal year (fix needed)
```typescript
// In forecast-service.ts, line ~53 — add fiscal_year filter:
const { data: existing } = await this.supabase
  .from('financial_forecasts')
  .select('*')
  .in('business_id', idsToTry)
  .eq('fiscal_year', fiscalYear)   // ADD THIS LINE
  .order('updated_at', { ascending: false })
  .limit(10)
```

### Locking a forecast
```typescript
// Lock the current FY forecast at year end
await supabase
  .from('financial_forecasts')
  .update({
    is_locked: true,
    is_completed: true,
    locked_at: new Date().toISOString(),
    locked_by: userId,
  })
  .eq('id', forecastId)
```

### Goals pre-population path (no changes needed)
```typescript
// ForecastWizardV4.tsx lines ~150-165 — already reads goals correctly
// When wizard opens with fiscalYear = currentFY + 1:
// - GET /api/goals returns business_financial_goals row
// - revenue_year1 already = next-year target (written by Phase 15 syncAnnualReview)
// - No code change needed in wizard goals loading
```

---

## FY Selector — Current State vs. Target

| Aspect | Current State | Phase 16 Target |
|--------|---------------|-----------------|
| FY shown | Always `getForecastFiscalYear()` → current FY | Two tabs: `FY{N}` (current) + `FY{N+1}` (planning season only) |
| Forecast loaded | Most-recently-updated row regardless of FY | Row matching selected `fiscal_year` |
| Planning season | Not detected | `isNearYearEnd()` check shows next-FY tab when ≤3 months to year end |
| Prior year data | Always Xero P&L | Locked prior-forecast `actual_months` with Xero fallback |
| Read-only lock | `is_locked` field exists but not enforced in UI | P&L table and wizard check `is_locked`; show "View" instead of "Edit" |
| Month range | 12 months of selected FY | Rolling 13-15 month view when in planning season (next-FY forecast) |
| Wizard init | `fiscalYear - 1` passed as `fiscalYearStart` to useForecastWizard | Same, but `fiscalYear` = user-selected FY |

---

## State of the Art

| Old Approach | Current Approach | Phase 16 Change |
|--------------|------------------|-----------------|
| Hard-coded Jul-Jun FY | Configurable `yearStartMonth` via Phase 13 | Use business's `fiscal_year_start` for planning detection |
| Single always-current forecast | Multiple versioned forecasts per business+FY | Explicit FY selector; filter getOrCreateForecast by FY |
| No lock mechanism | `is_locked` exists in TypeScript type | Enforce `is_locked` in UI (readonly P&L, no wizard save) |
| Xero P&L as only prior-year source | Still Xero-only | Use locked forecast actuals as richer prior-year source |

---

## Open Questions

1. **Does `is_locked` column exist in the DB?**
   - What we know: It's in the `FinancialForecast` TypeScript interface (types.ts line 151), alongside `is_active` and `parent_forecast_id`.
   - What's unclear: The migration files inspected show the base table created without these versioning columns. They may have been added in `20241120_financial_forecast.sql` (not fully read) or may be missing.
   - Recommendation: Add migration `ALTER TABLE financial_forecasts ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false` regardless. `ADD COLUMN IF NOT EXISTS` is idempotent.

2. **Where is `GET /api/goals` implemented?**
   - What we know: `ForecastWizardV4` calls `fetch('/api/goals?business_id=X')` and reads `goalsData.goals.revenue_year1`.
   - What's unclear: Whether this endpoint filters by `fiscal_year` or always returns the latest row.
   - Recommendation: Verify endpoint filters. If it returns latest row only, the pre-population will work correctly once Phase 15 has rolled the targets forward.

3. **Should planning-season detection respect a manual override?**
   - What we know: No override mechanism exists currently.
   - Recommendation: Auto-detect only. A coach can always navigate manually to the next-year tab without the banner — the banner is just a prompt, not a gate.

4. **How to surface "prior year = completed forecast actuals" in the wizard?**
   - What we know: The wizard's `PriorYearData` structure is populated from Xero via `/api/Xero/pl-summary`. No path from `forecast_pl_lines.actual_months` to the wizard's Step 2 exists yet.
   - Recommendation: Add a new API endpoint `GET /api/forecast/[id]/actuals-summary` that aggregates `actual_months` into a `PeriodSummary` structure. Call it in `ForecastWizardV4` loadData when a locked prior forecast exists. Xero remains the fallback. This is a separate, deferrable task from the FY selector work.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 16 is purely code/config changes with no new external dependencies. All tooling (Next.js, Supabase, TypeScript) is already operational.

---

## Validation Architecture

`workflow.nyquist_validation` is not set in `.planning/config.json` — treating as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no test config files found in project |
| Config file | None |
| Quick run command | `npx tsc --noEmit` (TypeScript type-check, all phases use this) |
| Full suite command | `npx tsc --noEmit` |

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Command | Notes |
|-----|----------|-----------|---------|-------|
| Planning detection | `isNearYearEnd()` returns true when ≤3 months to FY end | unit | Manual verify with mock date | No test infra |
| FY selector tabs | Next-FY tab only shown in planning season | manual | Visual inspect | UI component |
| Pre-populate from Q4 | Wizard Step 1 goals load next-year targets | manual | Open wizard after syncAnnualReview | Depends on Phase 15 |
| Lock read-only | Locked forecast shows read-only P&L | manual | Set `is_locked=true`, reload page | |
| Rolling view | 13-15 month column range renders | manual | Verify column count in P&L table | |
| FY filter on load | getOrCreateForecast returns correct FY row | manual | Create two forecasts, switch tabs | |

### Wave 0 Gaps
- [ ] No automated test infrastructure — all validation is manual TypeScript type-check + visual review
- [ ] TypeScript check: `npx tsc --noEmit` must pass after every plan

*(No test framework exists in this project — all prior phases validated with TypeScript + manual coach session review)*

---

## Sources

### Primary (HIGH confidence)
- Direct inspection: `src/app/finances/forecast/page.tsx` — FY determination, forecast load flow
- Direct inspection: `src/app/finances/forecast/services/forecast-service.ts` — `getOrCreateForecast` implementation
- Direct inspection: `src/app/finances/forecast/types.ts` — `FinancialForecast` interface, `is_locked` field
- Direct inspection: `src/lib/utils/fiscal-year-utils.ts` — `isNearYearEnd`, `getMonthsUntilYearEnd`, `generateFiscalMonthKeys`
- Direct inspection: `src/app/finances/forecast/utils/fiscal-year.ts` — `getForecastFiscalYear` (currently no planning-season awareness)
- Direct inspection: `src/app/finances/forecast/components/ForecastSelector.tsx` — multi-forecast per FY, `is_active` management
- Direct inspection: `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` — goals loading from `business_financial_goals`
- Direct inspection: `src/app/quarterly-review/services/strategic-sync-service.ts` — `syncAnnualReview` writes `revenue_year1` etc.
- Direct inspection: `src/app/finances/forecast/components/wizard-v4/types/assumptions.ts` — `ForecastAssumptions` structure
- Direct inspection: `supabase/migrations/20241120_financial_forecast_simple.sql` — base table schema
- Direct inspection: `supabase/migrations/20260407_extended_period_support.sql` — `business_financial_goals` extended columns
- Direct inspection: `.planning/ROADMAP.md` — Phase 13/14/15 dependencies confirmed complete

---

## Metadata

**Confidence breakdown:**
- Forecast page flow and FY determination: HIGH — code fully read
- Multi-forecast DB schema: HIGH — migration files read; `is_locked` column existence MEDIUM (in TS type but migration not confirmed)
- Phase 15 pre-population path: HIGH — `syncAnnualReview` writes `revenue_year1`, wizard reads it
- Rolling view feasibility: HIGH — `generateMonthColumns` is date-range-agnostic
- `forecast_pl_lines` as prior-year source: HIGH — schema confirmed; API path LOW (doesn't exist yet)

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable codebase, low churn expected)
