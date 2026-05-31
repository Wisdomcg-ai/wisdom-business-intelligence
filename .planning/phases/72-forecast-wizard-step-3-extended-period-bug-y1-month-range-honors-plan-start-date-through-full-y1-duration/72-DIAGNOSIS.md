# Phase 72-01 — Step 3 Extended-Period Diagnosis

**Plan:** 72-01 (read-only investigation)
**Date:** 2026-05-31
**Triggered by:** Matt observed 2026-05-29 — Armstrong's Step 3 Revenue/COGS only allows editing 3 months instead of 13.
**Affected client:** Armstrong & Co (`plan_start_date = 2026-06-01`, `is_extended_period = true`, `year1_months = 13`, `year1_end_date = 2027-06-30`).
**Symptom on 2026-05-31:** Step 3 renders **3 editable months** (Apr/May/Jun 2026) instead of the **13 months Jun 2026 → Jun 2027** that the plan actually covers.

---

## Root Cause

**`Step3RevenueCOGS.tsx` conflates "current fiscal year" with "plan Year 1".** It hardcodes a 12-month window starting at `fiscalYear - 1` and locks `currentYTD.months_count` actuals against that window — without ever consulting `is_extended_period`, `plan_start_date`, `year1_end_date`, or `year1_months` on the strategic plan.

For extended-period plans whose `plan_start_date` is mid-current-FY (or in a future FY), this produces two compounding errors:

1. **Wrong month range** — the editor's month grid covers the current FY (Jul→Jun), not the plan's actual Y1 period.
2. **Wrong actuals lock** — `remainingMonthsCount = 12 - currentYTD.months_count` treats already-elapsed current-FY months as "Y1 actuals" and shrinks the editable set to the calendar tail of the current FY.

For Armstrong on 2026-05-31:
- `fiscalYear = 2026` → `monthKeys = generateMonthKeys(2025)` → `2025-07 .. 2026-06` (12 entries, current FY26 Jul-Jun).
- `currentYTD.months_count = 9` (Jul-2025 .. Mar-2026 actuals from Xero).
- `remainingMonthsCount = 12 - 9 = 3` → only Apr/May/Jun-2026 are editable.
- But the plan's Y1 is `2026-06-01 .. 2027-06-30` (13 months) — none of those except Jun-2026 are even in the grid, and 12 of 13 plan months are off-screen.

### Evidence (file:line)

**E1 — Hardcoded current-FY month range, no plan-period awareness:**

```ts
// src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx:311
const monthKeys = generateMonthKeys(fiscalYear - 1 + (activeYear - 1));
```

`generateMonthKeys(fyStart)` is the deprecated 12-month helper from `types.ts:1028`:

```ts
// src/app/finances/forecast/components/wizard-v4/types.ts:1028
export function generateMonthKeys(fiscalYearStart: number, yearStartMonth: number = 7): string[] {
  const months: string[] = [];
  for (let i = 0; i < 12; i++) { ... }   // ← hardcoded 12
  return months;
}
```

It produces exactly 12 entries for the current FY (or `fy ± n` for Y2/Y3) regardless of plan boundaries. There is no `year1_months` parameter and no `plan_start_date` parameter.

**E2 — Actuals lock based on current-FY YTD, not on plan-Y1 overlap:**

```ts
// src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx:545-547
const ytdActualTotal = currentYTD?.total_revenue || 0;
const completedMonthsCount = currentYTD?.months_count || 0;
const remainingMonthsCount = 12 - completedMonthsCount;
```

`currentYTD` is fetched from `/api/Xero/pl-summary?business_id=…&fiscal_year=2026` — it is the **current FY YTD**. For a plan whose Y1 has not started yet (Armstrong: starts 2026-06-01), zero plan-Y1 months have actuals — yet the wizard treats 9 unrelated FY26 months as locked actuals.

The membership test:

```ts
// Step3RevenueCOGS.tsx:350-355
const actualMonthKeys = useMemo(() => {
  if (!currentYTD?.revenue_by_month) return new Set<string>();
  return new Set(Object.keys(currentYTD.revenue_by_month));
}, [currentYTD]);
const isActualMonth = (monthKey: string) => actualMonthKeys.has(monthKey);
```

This is correct **iff** `monthKeys` covers the same period as `currentYTD.revenue_by_month`. It does not, for extended-period plans.

**E3 — Extended-period plan boundaries never reach Step 3:**

`Step3RevenueCOGS` props (L240-244):

```ts
interface Step3RevenueCOGSProps {
  state: ForecastWizardState;
  actions: WizardActions;
  fiscalYear: number;
}
```

Wizard state shape (`types.ts:735-757`) — no extended-period fields, anywhere:

```ts
export interface ForecastWizardState {
  fiscalYearStart: number;
  currentStep: WizardStep;
  activeYear: 1 | 2 | 3;
  businessProfile: BusinessProfile | null;     // ← see BusinessProfile below
  goals: Goals;                                // ← year1/2/3 revenue + margins only
  priorYear: PriorYearData | null;
  currentYTD: {
    revenue_by_month: Record<string, number>;
    total_revenue: number;
    months_count: number;
    revenue_lines?: PLLineItem[];
  } | null;
  ...
}
```

`BusinessProfile` (`types.ts:56-62`) is the **narrowest possible shape** — no extended-period fields:

```ts
export interface BusinessProfile {
  industry?: string;
  employeeCount?: number;
  annualRevenue?: number;
  businessModel?: string;
  profileCompleted?: boolean;
}
```

`Goals` (`types.ts:64-75`) — also no extended-period fields, just year-1/2/3 revenue + margin scalars.

**E4 — Data is in `/api/goals` but the wizard discards it:**

`ForecastWizardV4.tsx:131-162` fetches `/api/goals?business_id=…` and the only fields used from the response are `revenue_year{1,2,3}`, `gross_margin_year{1,2,3}`, `net_margin_year{1,2,3}`. The fields `is_extended_period`, `year1_months`, `plan_start_date`, `year1_end_date` returned by `src/app/goals/services/financial-service.ts:265-275` are dropped on the floor.

```ts
// src/app/goals/services/financial-service.ts:265-275 (already deserialised)
isExtendedPeriod: data.is_extended_period ?? false,
year1Months:      data.year1_months      ?? 12,
planStartDate:    (data.plan_start_date as string | null) ?? null,
year1EndDate:     (data.year1_end_date  as string | null) ?? null,
```

**E5 — Schema confirmation (planner's prompt was slightly off):**

The extended-period columns live on **`business_financial_goals`** (NOT `business_profiles` as the planner's prompt suggested):

```sql
-- supabase/migrations/00000000000000_baseline_schema.sql:1777-1779
"is_extended_period" boolean DEFAULT false,
"year1_months" integer DEFAULT 12,
"current_year_remaining_months" integer DEFAULT 0
```

```sql
-- supabase/migrations/20260427024433_plan_period_columns.sql
ALTER TABLE business_financial_goals
  ADD COLUMN IF NOT EXISTS plan_start_date date,
  ADD COLUMN IF NOT EXISTS plan_end_date   date,
  ADD COLUMN IF NOT EXISTS year1_end_date  date;
```

`plan_start_date` also exists on `strategic_plans` (baseline L4810) as the wizard-driven source of truth. `business_profiles` does NOT carry any of these fields — fix scope (below) reflects this correction.

### Named root cause

> **"Wizard-blind-to-plan-period"** — Step 3 (and the rest of the forecast wizard's data layer) was authored against a single, implicit assumption that **plan Year 1 == current fiscal year**. Every reference to month-range and actuals-lock follows from that assumption: `generateMonthKeys` is hardcoded 12-wide, `monthKeys` is anchored at `fiscalYear - 1`, and `remainingMonthsCount = 12 - completedMonthsCount` measures the calendar tail of the current FY. The fields that disprove the assumption (`is_extended_period`, `year1_months`, `plan_start_date`, `year1_end_date`) exist on `business_financial_goals`, are deserialised by `financial-service.ts`, are surfaced by `/api/goals`, and are then **discarded by `ForecastWizardV4.tsx`'s goals-loader** before they can reach any step.

This is the **same root cause family** that Phase 68 B15 already solved in the **goals** wizard — but the forecast wizard was never touched.

---

## Fix Scope

72-02 will implement the following. Pre-extracted here so the planner can break it into atomic tasks.

### Phase A — Plumb plan-period into wizard state (1 file, ~30 LOC)

1. Extend `BusinessProfile` interface (`types.ts:56-62`) **or** add a new `planPeriod` slice on `ForecastWizardState`:

   ```ts
   export interface PlanPeriod {
     isExtendedPeriod: boolean;
     year1Months: number;            // 12 for standard, 13-23 for extended
     planStartDate: string | null;   // 'YYYY-MM-DD'
     year1EndDate: string | null;    // 'YYYY-MM-DD'
   }
   ```

   Recommended: add `planPeriod: PlanPeriod | null` to `ForecastWizardState` (cleaner separation from `BusinessProfile`, which is sourced from `business_profiles` not `business_financial_goals`).

2. Extend `WizardActions` with `setPlanPeriod(period: PlanPeriod | null)`.

3. Update `useForecastWizard.ts:145` default state to seed `planPeriod: null`.

4. In `ForecastWizardV4.tsx:145-167` (the `/api/goals` loader), capture the four fields the API already returns and call `actions.setPlanPeriod(...)`.

### Phase B — Replace Step 3 month-key derivation (1 file, ~40 LOC + tests)

In `Step3RevenueCOGS.tsx`:

1. Replace L311 `generateMonthKeys(fiscalYear - 1 + (activeYear - 1))` with a new helper that, **when `activeYear === 1` and `planPeriod` is extended**, returns the month keys spanning `[planStartDate, year1EndDate]` (inclusive month-bucket). For Y2/Y3 and for standard 12-month plans, fall through to the existing 12-month logic.

2. Replace L545-547 with a derivation that:
   - For standard plans: keeps current behavior (`12 - currentYTD.months_count`).
   - For extended plans: counts the **intersection** of `monthKeys ∩ currentYTD.revenue_by_month` keys as actuals, and treats the rest as editable. If `planStartDate > today`, all months are editable (zero actuals).

3. Update L1560-1564 (the "X/12 months actual" banner) to use `monthKeys.length` instead of hardcoded `12`.

4. Update L1828, L2085, L2175, L2231, L2353 (month-cell renderers) — these already iterate `monthKeys.map(...)`, so once `monthKeys` is correct they render correctly. **No structural change needed for the grid itself.**

### Phase C — Decide: shared util vs inline (RECOMMENDATION: shared util)

**Recommendation: extract a shared util.** Reasoning:

- `deriveCurrentRemainderColumn` (`quarters.ts:246-312`) already encodes the
  same conceptual logic for the **goals** wizard's "Now" column. It is well-tested,
  pure, and accepts `(today, planYear, fiscalYearStart, thresholdMonths, isExtendedPeriod, planStartDate)`.
- Inlining a parallel implementation in Step 3 would create **the exact drift
  hazard Phase 68 B15 just paid down**: two derivations of "what months does
  plan Y1 cover?" that can fall out of sync over time.
- Steps 4-8 do not currently render a per-month grid keyed on `currentYTD`
  (see audit below), so the shared util only has one new consumer today —
  but the cost of a tiny shared module is zero compared to the cost of a
  silent divergence.

**Proposed util shape** (new file `src/lib/utils/plan-period.ts`):

```ts
/**
 * Compute the month keys covered by plan Year 1.
 * - Standard 12-month plan: returns the active fiscal year's 12 keys.
 * - Extended plan (is_extended_period=true, year1_months>12, plan_start_date set):
 *     returns the keys from plan_start_date's month → year1_end_date's month
 *     (inclusive).
 *
 * Pure function. `yearStartMonth` defaults to 7 (AU FY) and matches DEFAULT_YEAR_START_MONTH.
 */
export function getPlanY1MonthKeys(
  fiscalYear: number,
  planPeriod: PlanPeriod | null,
  yearStartMonth: number = 7,
): string[]

/**
 * Given a set of plan-Y1 month keys and the currentYTD actuals payload,
 * return the subset of keys that are LOCKED as actuals. For extended plans
 * where plan_start_date is in the future, returns empty Set.
 */
export function getActualMonthKeysForPlanY1(
  planY1MonthKeys: string[],
  currentYTDRevenueByMonth: Record<string, number> | undefined,
  today: Date = new Date(),
  planStartDate: string | null = null,
): Set<string>
```

Both functions get **pure-function vitest coverage** (clock injection via parameter — same pattern as `deriveCurrentRemainderColumn`).

`deriveCurrentRemainderColumn` is NOT modified or moved — it serves a different consumer (the goals wizard's "Now" pseudo-column). The shared util is a new sibling, not a refactor.

### Phase D — Audit & decide on Step 4-8 same-family bugs (out of scope for 72-02)

See "Same-family audit" below. **All same-family items are deferred to a follow-up phase** — 72-02's lock is Step 3 only.

### Out of scope for Phase 72 entirely

- `deprecated` warning on `generateMonthKeys` — leave it; it has 13+ call sites in Step 3 alone, plus several in `useForecastWizard.ts`, plus `Step8GrowthPlan.tsx`. Migrating to `generateFiscalMonthKeys` is a separate cleanup phase.
- Visual/UX work on the Step 3 grid for 13+ month rendering (horizontal scroll? wrap?). The grid already iterates `monthKeys.map` and will render whatever it's given; if 13 columns is too wide for normal screens, that is a UX follow-up.
- Touching the goals wizard or `quarters.ts` — Phase 68 B15 already handled that side.

---

## Same-Family Audit (Steps 4-8)

Per success criterion, audited Steps 4-8 for the same pattern (hardcoded 12 / `currentYTD.months_count` / unconditional current-FY anchor).

| Step | File | `generateMonthKeys` uses | `months_count` uses | Verdict |
|---|---|---|---|---|
| 4 (Team) | `Step4Team.tsx` | 0 | 0 | **No bug.** Step 4 operates on per-employee periods (`startMonth`, `departureMonth`) keyed to `fiscalYear - 1`, not a 12-cell grid. Extended-period support for hiring/departure month pickers is a UX item, not a data-integrity bug. |
| 5 (OpEx) | `Step5OpEx.tsx` | 0 | 0 | **No bug.** No per-month grid; uses annual totals + a % increase. |
| 6 (CapEx) | `Step6CapEx.tsx` | 0 | 0 | **No bug.** Per-item periods. |
| 6 (Subscriptions) | `Step6Subscriptions.tsx` | 0 | 0 | **No bug.** Vendor-level monthly budget, no FY-aligned grid. |
| 7 (Other) | `Step7Other.tsx` | 0 | 0 | **No bug.** |
| 8 (GrowthPlan) | `Step8GrowthPlan.tsx` | 2 | 0 | **Adjacent risk.** Uses `generateMonthKeys(state.fiscalYearStart + yearOffset)` at L150 to compute a 12-month grid for summary aggregation. For extended plans, the Y1 aggregation row could under-count (rolling up 12 months instead of 13). **Defer** to a follow-up phase — it's a summary-display issue, not the blocker Matt reported. |
| 8 (Review) | `Step8Review.tsx` | 0 | 0 | **No bug.** Yearly totals only. |

**Conclusion:** Step 3 is the only place where extended-period plans render an actively-broken editable grid. Step 8 GrowthPlan has a latent summary-aggregation under-count that is worth a future phase but does not block Armstrong's wizard usage. Phase 72-02 fixes Step 3 only.

---

## Verification checklist for 72-02 (forward-looking)

After 72-02 lands, the following should be true for Armstrong on a date after 2026-06-01:

- [ ] Open Step 3 → see **13 month columns** (Jun 2026 … Jun 2027).
- [ ] No columns are locked as "Actual" (`plan_start_date = 2026-06-01` ≥ today on the date of testing — depending on date).
- [ ] The "X/Y months actual" banner shows `0/13 months actual` (or whatever fraction has elapsed within Y1).
- [ ] For a standard 12-month plan client (e.g. JDS, Fit2Shine), Step 3 still renders 12 columns and the actuals lock behavior matches current production.
- [ ] Vitest covers: standard 12-month plan + extended 13-month plan + extended plan with `plan_start_date` in the future + extended plan mid-Y1.
