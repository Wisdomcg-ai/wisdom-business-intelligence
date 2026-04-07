# Phase 15: Q4 Annual Review — Abridged Goals Wizard — Research

**Researched:** 2026-04-07
**Domain:** Quarterly Review Workshop / Goals Wizard integration — annual review sync path
**Confidence:** HIGH (codebase-sourced, no stale training data involved)

---

## Summary

Phase 15 inserts an "abridged Goals Wizard" into the annual review flow so returning clients can set next-year goals without leaving the workshop. The annual review already has four A4 steps (A4.1 Year in Review, A4.2 Vision/Strategy, A4.3 Next Year Targets, A4.4 Annual Initiative Plan) that were added in `20260313000001_annual_review_support.sql`. Those steps store data in JSONB columns (`next_year_targets`, `annual_initiative_plan`) on `quarterly_reviews`.

What does NOT yet exist: (1) a `status` field on `strategic_initiatives`, (2) a sync path that writes `A4.3` and `A4.4` data back to `business_financial_goals` and `strategic_initiatives` for next FY, and (3) Goals Wizard detection logic that recognises when Q4 review has already planned next year.

The sync path for quarterly reviews (`StrategicSyncService.syncAll`) is already mature and coach-safe. Phase 15 needs an equivalent `syncAnnualReview()` that rolls 3-year financial targets forward and upserts next-year initiatives into `strategic_initiatives` under the correct `fiscal_year`.

**Primary recommendation:** Extend `StrategicSyncService` with a `syncAnnualReview()` method that: (a) reads `A4.3` + `A4.4` from the completed annual review, (b) calls `FinancialService.saveFinancialGoals` with rolled-forward targets, (c) upserts initiatives into `strategic_initiatives` with next FY `fiscal_year`, and (d) writes `planType = 'annual_reset'` on the existing StrategicPlan row. Also add a `status` column migration and a Goals Wizard banner check.

---

## Architecture Patterns

### 1. Annual Review Step Map (already deployed)

The `ANNUAL_WORKSHOP_STEPS` array in `src/app/quarterly-review/types/index.ts` is:

```
prework → 1.1 → 1.2 → 1.3 → 1.4
       → 2.1 → 2.2 → 2.3 → 2.4 → 2.5
       → 3.1 → 3.2 (SWOT — step 3.2 is already the SWOT refresh)
       → A4.1 → A4.2 → A4.3 → A4.4   (annual-only block)
       → 4.1 → 4.2 → 4.3              (next-quarter sprint, part 5 label)
       → complete
```

The "new ideas from SWOT" requirement is already satisfied by step `3.2` (`SwotUpdateStep`). No new step is needed — SWOT items naturally feed into `A4.4` via the existing `AnnualInitiativePlanStep` carry-forward loader.

### 2. Annual Planning Steps — Current State

All four A4 step components already exist:

| Step | Component | Data column on `quarterly_reviews` | Status |
|------|-----------|-------------------------------------|--------|
| A4.1 | `YearInReviewStep` | `year_in_review` JSONB | Complete |
| A4.2 | `VisionStrategyStep` | `vision_strategy` JSONB | Complete |
| A4.3 | `NextYearTargetsStep` | `next_year_targets` JSONB | Complete |
| A4.4 | `AnnualInitiativePlanStep` | `annual_initiative_plan` JSONB | Complete |

The `AnnualInitiativePlanStep` already loads carry-forward initiatives (those with `status IN ('in_progress', 'not_started')`) from `strategic_initiatives` and pre-populates the Q-lane grid. It populates from `step_type IN ('q1','q2','q3','q4','twelve_month')`. This is the correct source for "incomplete initiatives from current year".

### 3. The Missing Sync Path

`completeWorkshop()` in `useQuarterlyReview.ts` only calls `strategicSyncService.syncAll()`, which syncs **current-quarter** data (initiative decisions, quarterly targets, rocks, new initiatives). It does NOT sync the A4 annual planning data to `business_financial_goals` or `strategic_initiatives` for the NEXT fiscal year.

That sync is the core deliverable of Phase 15.

### 4. strategic_initiatives Table — Confirmed Schema

Current columns (from migrations):
- Core: `id`, `business_id`, `user_id`, `title`, `description`, `notes`, `category`, `priority`, `estimated_effort`
- Routing: `step_type` (`strategic_ideas | roadmap | twelve_month | q1 | q2 | q3 | q4 | sprint | current_remainder`), `source`
- Lifecycle: `status` (already exists — used in `syncInitiativeChanges`: `'in_progress' | 'cancelled' | 'on_hold' | 'not_started'`), `progress_percentage`, `actual_start_date`, `actual_completion_date`
- Year: `fiscal_year` (INTEGER — added in Phase 13 migration `20260407_year_type_foundation.sql`)
- Sprint: `why`, `outcome`, `start_date`, `end_date`, `total_hours`, `milestones` JSONB, `tasks` JSONB
- Assignment: `assigned_to`, `order_index`, `selected`, `linked_kpis`, `quarter_assigned`
- Classification: `idea_type` (`strategic | operational`)

**CRITICAL FINDING:** The `status` column already exists on `strategic_initiatives`. The `StrategicSyncService.syncInitiativeChanges()` already writes `status` values (`in_progress`, `cancelled`, `on_hold`, `not_started`). The TypeScript `InitiativeStatus` type in `goals/types.ts` lists: `'not_started' | 'in_progress' | 'completed' | 'cancelled' | 'on_hold'`.

Phase 15 requires adding `'deferred'` and `'planned'` to the DB CHECK constraint (if one exists) and potentially the TypeScript union. However, looking at `StrategicInitiativeRef` in `quarterly-review/types/index.ts` the type already lists `'completed'` and `'cancelled'` — neither `'deferred'` nor `'planned'` exist yet. The DB column may not have a CHECK constraint (it was added via code, not a formal constraint in any migration file).

**Action needed:** Verify whether a CHECK constraint exists on `strategic_initiatives.status`. If yes, a migration must extend it to include `'deferred'` and `'planned'`. If no constraint, only TypeScript types need updating.

### 5. 3-Year Target Roll-Forward Logic

`business_financial_goals` stores targets in flat columns: `revenue_year1`, `revenue_year2`, `revenue_year3` (and equivalents for GP, NP). The `FinancialService.saveFinancialGoals()` upserts by `business_id`.

Roll-forward mapping (Phase 15):
- New `year1` = current `year2` (was Year 2 → becomes Year 1)
- New `year2` = current `year3` (was Year 3 → becomes Year 2)
- New `year3` = set from `A4.3.stretchRevenue` or blank (coach-entered Year 3)

The `A4.3` `NextYearTargets` type already has `revenue`, `grossProfit`, `netProfit` plus optional `stretchRevenue`, `stretchGrossProfit`, `stretchNetProfit` fields. These map to the rolled-forward Year 1.

`FinancialService.loadFinancialGoals()` is called from `useStrategicPlanning` with `business_profiles.id` (not `businesses.id`). The sync must use `profileBusinessId` (resolved via `business_profiles` table, same pattern as existing `syncAll` flow).

### 6. sync on `completeWorkshop` — Existing Pattern

In `useQuarterlyReview.ts` the `completeWorkshop` callback:
1. Flushes pending auto-saves
2. Takes a pre-sync plan snapshot
3. Calls `strategicSyncService.syncAll(...)`
4. Takes a post-sync snapshot
5. Calls `quarterlyReviewService.completeWorkshop(review.id)`

Phase 15 adds a step between 3 and 4 (or after 3) — a new `strategicSyncService.syncAnnualReview()` call guarded by `effectiveReviewType === 'annual'`.

### 7. Goals Wizard Detection — "Already planned in Q4 review"

There is currently NO detection logic in the Goals Wizard (`src/app/goals/page.tsx` or `useStrategicPlanning`) that checks if next-year data was planned in a Q4 review.

The check needs to be: query `quarterly_reviews` for a completed annual review of the upcoming fiscal year. Specifically:
- Find a record with `review_type = 'annual'` AND `status = 'completed'` AND `year = nextFiscalYear`
- If found and `annual_initiative_plan.initiatives.length > 0`: show the "Already planned in Q4 review" banner

The `FinancialService.loadFinancialGoals()` could also detect this via `fiscal_year` on the `business_financial_goals` row, but a direct `quarterly_reviews` query is more reliable.

This detection should happen in `useStrategicPlanning` (or directly in `goals/page.tsx`) on initial load, not deep in a service.

### 8. Q1 Sprint Rocks for New Year

After the annual sync, the `4.3` sprint step (which immediately follows A4.4 in ANNUAL_WORKSHOP_STEPS) sets up Q1 sprint rocks for the new year. This already works via `QuarterlyRocksStep` — it just needs to know the next year's Q1 key. The `syncAll` call already handles this via `resolvedQuarterKey` resolved from `yearType`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Upsert financial goals | Manual SQL | `FinancialService.saveFinancialGoals()` — already handles upsert with conflict on `business_id` |
| Save next-year initiatives | Custom insert loop | `StrategicPlanningService.saveInitiatives()` — handles UUID vs temp-ID, safeguard against mass delete |
| Update initiative status | Direct DB writes | `StrategicSyncService.syncInitiativeChanges()` — update-only, never deletes |
| Business ID resolution | Re-implement lookup | `profileBusinessId` state from `useQuarterlyReview` (already resolves via `business_profiles`) |
| SWOT ideas feed | New loader | `AnnualInitiativePlanStep` already loads carry-forward initiatives from `strategic_initiatives` |

---

## Common Pitfalls

### Pitfall 1: Wrong business_id on the sync write
**What goes wrong:** `business_financial_goals` and `strategic_initiatives` are keyed by `business_profiles.id`, not `businesses.id`. Writing with `businesses.id` will create a duplicate row and break the Goals Wizard load (which uses `maybeSingle()` and expects one row).
**Why it happens:** `useQuarterlyReview` has both `businessId` (the review's `business_id` which may be `businesses.id`) and `profileBusinessId` (resolved via `business_profiles`). The latter is the correct key for planning data.
**How to avoid:** Always use `profileBusinessId` (or the same `syncBusinessId` resolution pattern from `completeWorkshop`) when calling financial and initiative services.

### Pitfall 2: Overwriting current-year goals with rolled-forward targets
**What goes wrong:** If `FinancialService.saveFinancialGoals()` is called with rolled-forward values, it overwrites all year columns including current-year actuals.
**Why it happens:** The service does a full upsert of all columns.
**How to avoid:** The sync should only update `year1`/`year2`/`year3` columns and set `year_type`. It must preserve `revenue_current` and other current-year fields. Use a targeted Supabase `update` (not the full `saveFinancialGoals` call) or pass the existing current-year data through.

### Pitfall 3: Duplicate initiatives in Goals Wizard after annual sync
**What goes wrong:** `AnnualInitiativePlanStep` pre-populates from existing `strategic_initiatives` with `status IN ('in_progress', 'not_started')`. After sync writes next-year initiatives, a second Goals Wizard run loads them again.
**Why it happens:** The sync inserts with `fiscal_year = nextYear`. The Goals Wizard loads without filtering by `fiscal_year` (it uses `step_type`).
**How to avoid:** When syncing annual initiatives, set `step_type` to reflect Q1-Q4 for the next year (e.g., `q1` with `fiscal_year = nextYear`). The Goals Wizard's existing load query already filters by `step_type`, so next-year Q1-Q4 rows won't conflict with current-year rows of the same `step_type` once `fiscal_year` differs. Verify the wizard load query filters by `fiscal_year` or that the `step_type` write correctly segregates data.

### Pitfall 4: status column CHECK constraint violation
**What goes wrong:** Adding `'deferred'` or `'planned'` status values will fail if the DB has a CHECK constraint that only lists the original 5 statuses.
**Why it happens:** The `status` column may have been created without a formal constraint (no `CREATE TABLE` migration was found for `strategic_initiatives`), but this is unverified.
**How to avoid:** The migration for Phase 15 must check for and conditionally alter the constraint. Use the `DO $$ IF NOT EXISTS` pattern already used in this codebase.

### Pitfall 5: Goals Wizard "already planned" banner on wrong year
**What goes wrong:** The banner fires even when the Q4 review planned for a different year, or fires during non-Q4 quarters.
**Why it happens:** Year calculation using `getCurrentFiscalYear()` must match how `quarterly_reviews.year` is stored.
**How to avoid:** Compare `review.year` to `getForecastFiscalYear(fiscalYearStart) + 1` (the next FY). Confirm that `quarterly_reviews.year` stores the current FY year, not the calendar year. From the seed data, FY26 Q4 (Apr-Jun 2026) stores `year = 2026`. So "next year" for annual review of FY26 is FY27. The check must be: find a completed annual review with `year = currentFY`.

---

## Code Examples

### Roll-forward logic (to implement in syncAnnualReview)
```typescript
// Source: financial-service.ts pattern + annual_initiative_plan types
// Load current goals, roll forward, write back as targeted update
const { data: current } = await supabase
  .from('business_financial_goals')
  .select('*')
  .eq('business_id', profileBusinessId)
  .maybeSingle();

// next_year_targets from A4.3 becomes the new Year 1
const newYear1 = {
  revenue:      nextYearTargets.revenue,
  grossProfit:  nextYearTargets.grossProfit,
  netProfit:    nextYearTargets.netProfit,
};
// current Year 2 becomes new Year 2 baseline (or use coach-set stretch)
const newYear2 = {
  revenue:      current.revenue_year2,
  grossProfit:  current.gross_profit_year2,
  netProfit:    current.net_profit_year2,
};
// current Year 3 becomes new Year 3 (or leave blank for coach)
const newYear3 = {
  revenue:      nextYearTargets.stretchRevenue ?? current.revenue_year3,
  grossProfit:  nextYearTargets.stretchGrossProfit ?? current.gross_profit_year3,
  netProfit:    nextYearTargets.stretchNetProfit ?? current.net_profit_year3,
};

await supabase
  .from('business_financial_goals')
  .update({
    revenue_year1: newYear1.revenue,
    gross_profit_year1: newYear1.grossProfit,
    net_profit_year1: newYear1.netProfit,
    revenue_year2: newYear2.revenue,
    gross_profit_year2: newYear2.grossProfit,
    net_profit_year2: newYear2.netProfit,
    revenue_year3: newYear3.revenue,
    gross_profit_year3: newYear3.grossProfit,
    net_profit_year3: newYear3.netProfit,
  })
  .eq('business_id', profileBusinessId);
```

### Sync next-year initiatives (to implement in syncAnnualReview)
```typescript
// Source: StrategicPlanningService.saveInitiatives pattern
// annual_initiative_plan.initiatives are already grouped by quarterAssigned
for (const init of annualInitiativePlan.initiatives) {
  const stepType = init.quarterAssigned || 'q1'; // 'q1' | 'q2' | 'q3' | 'q4'
  await supabase
    .from('strategic_initiatives')
    .insert({
      business_id: profileBusinessId,
      user_id: userId,
      title: init.title,
      category: init.category || 'misc',
      step_type: stepType,
      source: 'annual_review',
      fiscal_year: nextYear, // CRITICAL: stamp with next FY
      status: 'not_started',
      idea_type: 'strategic',
      selected: true,
      assigned_to: init.assignedTo || null,
    });
}
```

### Goals Wizard detection (to add to useStrategicPlanning or goals/page.tsx)
```typescript
// Source: quarterly-review-service.ts pattern
// Run once on load, guard with review_type = 'annual' and status = 'completed'
const nextFY = getCurrentFiscalYear(fiscalYearStart) + 1;
const { data: annualReview } = await supabase
  .from('quarterly_reviews')
  .select('id, annual_initiative_plan, next_year_targets')
  .eq('business_id', businessId)   // Note: this is the businesses.id format
  .eq('review_type', 'annual')
  .eq('status', 'completed')
  .eq('year', nextFY - 1)          // Review done in the year before next FY
  .maybeSingle();

const hasNextYearPlan = Boolean(
  annualReview?.annual_initiative_plan?.initiatives?.length > 0
);
// If hasNextYearPlan: show banner "Already planned in Q4 annual review"
```

---

## DB Schema — Key Tables for This Phase

### `quarterly_reviews` — relevant columns
```
next_year_targets     JSONB  -- A4.3: { nextYear, yearType, revenue, grossProfit, netProfit, ... }
annual_initiative_plan JSONB -- A4.4: { nextYear, yearType, quarterlyTargets, initiatives[] }
year_in_review        JSONB  -- A4.1
vision_strategy       JSONB  -- A4.2
review_type           TEXT   -- 'quarterly' | 'annual' | 'mid-year'
status                TEXT   -- 'not_started' | 'prework_complete' | 'in_progress' | 'completed'
```

### `strategic_initiatives` — key columns for Phase 15
```
status       TEXT  -- current: 'in_progress' | 'cancelled' | 'on_hold' | 'not_started'
             -- Phase 15 adds: 'deferred' | 'planned' to TypeScript, verify DB constraint
fiscal_year  INTEGER  -- from Phase 13, used to segregate next-year rows
step_type    TEXT  -- 'strategic_ideas' | 'roadmap' | 'twelve_month' | 'q1'-'q4' | 'sprint' | 'current_remainder'
source       TEXT  -- 'strategic_ideas' | 'roadmap' | 'quarterly_review' | (add 'annual_review')
```

### `business_financial_goals` — targeted update pattern
```
business_id      TEXT  (UNIQUE — upsert key)
revenue_year1    NUMERIC
revenue_year2    NUMERIC
revenue_year3    NUMERIC
gross_profit_year1..3  NUMERIC
net_profit_year1..3    NUMERIC
year_type        TEXT  'FY' | 'CY'
```

---

## Implementation Breakdown

Phase 15 naturally splits into 3 workstreams:

### Workstream A: DB Migration
1. Add `status` values `'deferred'` and `'planned'` to TypeScript `InitiativeStatus` type
2. Verify/add DB CHECK constraint alteration if needed
3. No `quarterly_reviews` schema change needed — all A4 columns exist

### Workstream B: Sync Service Extension
1. Add `syncAnnualReview(businessId, userId, nextYearTargets, annualInitiativePlan, nextYear)` to `StrategicSyncService`
   - Rolls `year2→year1`, `year3→year2`, sets new `year3` from stretch targets
   - Upserts next-year initiatives into `strategic_initiatives` with `fiscal_year = nextYear`
   - Uses `source = 'annual_review'` to distinguish from quarterly review sync
2. Call `syncAnnualReview()` from `completeWorkshop()` in `useQuarterlyReview` when `review_type === 'annual'`

### Workstream C: Goals Wizard Detection
1. Add `hasNextYearAnnualPlan` flag to `useStrategicPlanning` (or detect in `goals/page.tsx`)
2. Query `quarterly_reviews` for completed annual review of current fiscal year
3. Show banner on Goals Wizard Step 1 if detected

---

## Open Questions

1. **Does `strategic_initiatives.status` have a DB CHECK constraint?**
   - What we know: No `CREATE TABLE strategic_initiatives` migration was found. The column is referenced in code but not created via a migration file in this repo (likely created via Supabase UI or an early migration not in this project).
   - What's unclear: Whether extending the TypeScript union is sufficient or if a `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT` migration is needed.
   - Recommendation: Include a defensive `DO $$ IF EXISTS ... ALTER CONSTRAINT` block in the Phase 15 DB migration regardless.

2. **Should `AnnualInitiativePlanStep` pre-populate from completed annual review data, or only from current-year carry-forward?**
   - What we know: The component currently queries `strategic_initiatives` with `status IN ('in_progress', 'not_started')` and `step_type IN ('q1', 'q2', 'q3', 'q4', 'twelve_month')`. It does NOT filter by `fiscal_year`.
   - What's unclear: After Phase 15 sync writes next-year rows (with `fiscal_year = nextYear`), a future annual review load may pick them up again as "carry-forward".
   - Recommendation: After Phase 15 sync, add `fiscal_year` filter to `AnnualInitiativePlanStep`'s carry-forward query (filter out rows where `fiscal_year = nextYear` to avoid self-referential loops). This is a safe improvement.

3. **Which `business_id` does `quarterly_reviews.business_id` store?**
   - What we know: The `quarterly_review-service.ts` `getReview()` queries by `business_id`. From `useQuarterlyReview`, it uses `businessId` from `useBusinessContext` — which is `businesses.id`, not `business_profiles.id`.
   - Implication: The Goals Wizard detection query must query `quarterly_reviews` using `businesses.id`, then resolve `business_profiles.id` separately for the financial/initiative write. This matches the existing `syncAll` pattern.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified — this is code/DB-only changes).

---

## Validation Architecture

The `workflow.nyquist_validation` key is absent from `.planning/config.json`, so this section is included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Not detected — no `jest.config.*`, `vitest.config.*`, or `pytest.ini` found in this repo |
| Config file | None |
| Quick run command | N/A — manual verification via browser |
| Full suite command | N/A |

### Phase Requirements Test Map
| Req | Behavior | Test Type | Notes |
|-----|----------|-----------|-------|
| 3-year roll forward | Year 2→Year 1, Year 3→Year 2, new Year 3 | Manual | Verify Goals Wizard Step 1 shows rolled values after completing annual review |
| Carry-forward initiatives | Incomplete initiatives appear in A4.4 with status | Manual | Check `AnnualInitiativePlanStep` loads the incomplete rows |
| Q1 sprint rocks | 4.3 step creates rocks for next year Q1 | Manual | Complete annual review, verify rocks in next Q1 plan |
| Auto-sync to `business_financial_goals` | `revenue_year1` updated to A4.3 targets | Manual/Supabase query | Query DB after `completeWorkshop` |
| Auto-sync to `strategic_initiatives` | Next-year initiatives inserted with `fiscal_year` | Manual/Supabase query | Query `strategic_initiatives WHERE fiscal_year = nextYear` |
| status field | `strategic_initiatives.status` can be set to `'deferred'` | Manual | Set status in quarterly review, check DB |
| Goals Wizard detection | Banner shows when annual review completed | Manual | Complete annual review, open Goals Wizard |

### Wave 0 Gaps
- No automated test infrastructure exists — all validation is manual + DB inspection.
- Consider a Wave 0 task to add a Supabase diagnostic query that verifies the sync wrote correctly.

---

## Sources

### Primary (HIGH confidence)
- `src/app/quarterly-review/types/index.ts` — Full `WorkshopStep` enum, `ANNUAL_WORKSHOP_STEPS`, `AnnualInitiativePlan`, `NextYearTargets` interfaces
- `src/app/quarterly-review/hooks/useQuarterlyReview.ts` — `completeWorkshop()` sync flow, `profileBusinessId` resolution
- `src/app/quarterly-review/services/strategic-sync-service.ts` — Full `StrategicSyncService` with `syncAll`, `syncInitiativeChanges`, `syncQuarterlyTargets`
- `src/app/quarterly-review/components/steps/AnnualInitiativePlanStep.tsx` — Carry-forward loader, next-year target pre-population
- `src/app/goals/services/financial-service.ts` — `saveFinancialGoals` upsert signature, `business_financial_goals` column names
- `src/app/goals/services/strategic-planning-service.ts` — `saveInitiatives` upsert pattern, safeguards
- `supabase/migrations/20260313000001_annual_review_support.sql` — Confirms 4 A4 columns on `quarterly_reviews`
- `supabase/migrations/20260407_year_type_foundation.sql` — Confirms `fiscal_year` column on `strategic_initiatives`
- `supabase/migrations/20251251212_add_initiative_extended_fields.sql` — Confirms `status` usage, no CHECK constraint in this file

### Secondary (MEDIUM confidence)
- `src/app/goals/types.ts` — `InitiativeStatus` union (5 values; `'deferred'` and `'planned'` are absent)
- `supabase/migrations/seed_distinct_directions.sql` — Documents step_type routing for strategic_initiatives
- `supabase/migrations/20260313000005_fix_goals_wizard_complete.sql` — Confirms coach RLS patterns for `strategic_initiatives`

---

## Metadata

**Confidence breakdown:**
- Quarterly review structure: HIGH — full step map and all component files read
- Sync service patterns: HIGH — `StrategicSyncService` fully read
- `strategic_initiatives` schema: HIGH for known columns; MEDIUM for CHECK constraint existence (no CREATE TABLE migration found)
- Goals Wizard detection: HIGH for absence (no existing code); MEDIUM for correct `year` comparison

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable codebase, 30-day window)
