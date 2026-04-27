# Phase 42: Plan period as explicit state — Research

**Researched:** 2026-04-27
**Domain:** Goals Wizard state management, plan period persistence, fiscal year semantics, coach/owner view equivalence
**Confidence:** HIGH

## Summary

Phase 42 replaces Phase 14's runtime inference (`isExtendedPeriod` derived from `isNearYearEnd(today, fiscalYearStart)` at hook load time) with three persisted date columns on `business_financial_goals`: `plan_start_date`, `plan_end_date`, `year1_end_date`. A new `suggestPlanPeriod(today, fiscalYearStart)` helper runs **once at plan creation** to propose dates; the user confirms via a visible Step 1 banner ("Your plan: Apr 2026 → Jun 2029 · Year 1 is 14 months · [Adjust]"); the dates become the immutable plan record. Year-label computations and the `isExtendedPeriod` state both become derived from those columns.

The detection block at [src/app/goals/hooks/useStrategicPlanning.ts:744-771](src/app/goals/hooks/useStrategicPlanning.ts#L744-L771) is replaced. Critically, the `ownerUser === user.id` guard at line 759 — which excludes coach view from extended-period activation — is removed. Coach view and owner view now load identical plan data from the same persisted columns.

Phase 14 already shipped a working extended-period UI (Step 4 `current_remainder` column, Step 5 Year End Bridge sprint, Step 1 combined Year 1 label). All those surfaces are driven by `isExtendedPeriod` / `year1Months` / `currentYearRemainingMonths`. Phase 42 keeps the same state shape exposed to UI components — the `useStrategicPlanning` return value continues to expose `isExtendedPeriod`, `year1Months`, `currentYearRemainingMonths` — but their values now derive from the persisted dates instead of from runtime detection. **No UI component below the hook needs API changes.**

**Primary recommendation:** Three sequential waves. Wave 1 = migration with backfill + `suggestPlanPeriod()` helper + `FinancialService` extensions (additive, no breaking changes). Wave 2 = hook refactor (replace lines 744-771 with date-driven logic, remove role guard) + Step 1 banner with Adjust modal. Wave 3 = test coverage + verification. Schema push is a [BLOCKING] task between Wave 1 task 1 and any Wave 2 work.

**Three discovered side issues** (recommend fixing in this phase since they affect the same surface):
1. [/api/goals/save/route.ts:140-142](src/app/api/goals/save/route.ts#L140-L142) does NOT persist the Phase-14 extended period columns — the coach save path has been silently dropping `is_extended_period` / `year1_months` / `current_year_remaining_months` since Phase 14. Phase 42 must fix this.
2. [/coach/clients/[id]/goals/page.tsx:740-749](src/app/coach/clients/[id]/goals/page.tsx#L740-L749) does NOT pass `extendedPeriodInfo` to `Step1GoalsAndKPIs`, so even if persistence worked, the coach Step 1 view never renders the combined Year 1 label. Phase 42 must fix this.
3. The `quarter_assigned` CHECK constraint at [supabase/migrations/00000000000000_baseline_schema.sql:4683](supabase/migrations/00000000000000_baseline_schema.sql#L4683) is `('Q1','Q2','Q3','Q4')` only — `'CR'` would violate. The Phase 14 implementation correctly sets `step_type = 'current_remainder'` (free text) but has never written `'CR'` to `quarter_assigned`. Phase 42 should not change this; document for the planner.

---

## User Constraints

There is no `42-CONTEXT.md` for this phase — the planner runs without locked decisions, only the ROADMAP `## Goal` / `## Why` / `## Requirements` blocks (copied verbatim into the next section).

### Phase 42 Requirements (verbatim from ROADMAP.md lines 685-712)

1. New columns on `business_financial_goals`: `plan_start_date`, `plan_end_date`, `year1_end_date`. Migration includes a one-time backfill from current `is_extended_period` + `year1_months` semantics.
2. Single `suggestPlanPeriod()` helper computes recommended dates using existing `isNearYearEnd` / `getMonthsUntilYearEnd`. Runs ONLY at plan creation (or "Reset Plan Period" user action). Never consulted at render time.
3. Step 1 surfaces the suggestion visibly: e.g. "Your plan: Apr 2026 → Jun 2029 · Year 1 is 14 months · [Adjust]". User confirms or adjusts before save.
4. Year 1/2/3 labels everywhere derive from persisted period columns, not `new Date()`.
5. `isExtendedPeriod` becomes a derived getter (`year1_end_date - plan_start_date > 365 days`); not a stored flag the future can disagree with.
6. The `ownerUser === user.id` guard at useStrategicPlanning.ts:759 is removed; coach view sees the same plan period as owner view.
7. Existing Phase 14 tests pass; new tests cover: plan period persists across reloads, coach view and owner view render identical periods, suggestion is shown visibly at creation, "Adjust" lets user override.

### Out of Scope (from ROADMAP)

- Forecast period logic (`calculateForecastPeriods` in fiscal-year-utils.ts:194-271) — separate flow, already correct.
- Multi-year plan templates beyond 3-year horizon.
- Removing legacy `is_extended_period` / `year1_months` / `current_year_remaining_months` columns (deferred to a cleanup phase after one release of dual-write).

### Project Constraints (from CLAUDE.md)

`./CLAUDE.md` does not exist in the project root (verified via Read). No project-wide AGENTS.md was loaded. Project memory does include some relevant directives:
- **Supabase Branching workflow** ([CONTRIBUTING.md](CONTRIBUTING.md)): every schema change goes through a PR that creates a Supabase preview branch. New migration filenames must match `^[0-9]{14}_[a-z0-9_]+\.sql$` (verified at [.github/workflows/supabase-preview.yml:39](/.github/workflows/supabase-preview.yml#L39)). Migrations must be idempotent (`ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE`).
- **Active business routing**: per Phase 41, `/business-profile` and Goals are routed via `BusinessContext` not `owner_id`. Phase 42 must continue that pattern — the resolver is already used at useStrategicPlanning.ts:674.
- **Dual-ID system**: `businesses.id` (FK target for some tables, e.g. `business_kpis`) vs `business_profiles.id` (FK target for `business_financial_goals` and `strategic_initiatives`). Phase 42 writes to `business_financial_goals` which keys on `business_profiles.id` — same as Phase 14.
- **Vitest test framework is already installed** (vitest 4.1.4 + @vitest/ui + jsdom + @testing-library/react + @testing-library/jest-dom). Test files match `src/**/*.test.ts(x)` per [vitest.config.ts:9-14](/vitest.config.ts#L9-L14).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Persist plan period dates (new columns + backfill) | Database / Migration | — | Schema is source of truth; backfill is one-time SQL |
| Compute suggested period at plan creation | Frontend pure util (`utils/suggest-plan-period.ts`) | — | Pure function, no I/O; mirrors existing `isNearYearEnd` helpers |
| Persist period dates on save | Frontend service (FinancialService) + API route (/api/goals/save) | Database | Service writes via Supabase client; API route writes via service role |
| Load period dates on hook init | Frontend hook (useStrategicPlanning) | Frontend service (FinancialService.loadFinancialGoals) | Hook calls service; service reads row |
| Derive `isExtendedPeriod` / `year1Months` from dates | Frontend pure util (called from hook) | — | Single derivation function consumed by hook |
| Render banner with date range + Adjust | Frontend component (PlanPeriodBanner inside Step1GoalsAndKPIs) | — | Banner is UI; Adjust modal also UI |
| Year labels in Step 1 | Frontend (step1/types.ts `getYearLabel`) | — | Already takes `extendedPeriodInfo`; will additionally accept persisted dates so labels read from `plan_start_date` / `year1_end_date` instead of `new Date()` |
| Coach/owner equivalence | Frontend hook + API resolver | — | Removing the role guard at line 759 is a hook change; resolver already returns same `fiscalYearStart` for both paths |

**Why this matters:** Wave 2's central deliverable is the hook refactor. Every other tier (DB, service, components) is essentially additive — no breaking changes. The hook is the single seam where runtime inference transitions to date-driven derivation.

---

## Standard Stack

No new dependencies. Phase 42 builds on the existing stack only.

| Layer | Tool | Version (verified [VERIFIED: package.json]) | Purpose |
|-------|------|---------------------------------------------|---------|
| Database | Supabase Postgres + Branching | supabase CLI 2.92.1 | Schema + RLS; PR-driven preview branches |
| Test framework | vitest | 4.1.4 | Already installed; jsdom env; test glob `src/**/*.test.ts(x)` |
| React Testing Library | @testing-library/react + jest-dom | 16.3.2 / 6.9.1 | Component tests for banner + Step 1 |
| Date logic | `src/lib/utils/fiscal-year-utils.ts` | n/a (project utility) | `isNearYearEnd`, `getMonthsUntilYearEnd`, `getFiscalYearEndDate`, `getFiscalYear` — all already exist |
| Hook state | React 18 useState/useEffect | 18.2.0 | Existing pattern in useStrategicPlanning |
| Persistence | Supabase JS client + service-role admin client | @supabase/supabase-js 2.76.1 | Existing FinancialService + /api/goals/save patterns |

**Version verification:** Vitest 4.1.4 is current per package.json [VERIFIED: package.json:69]. No new package installs needed.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-42-01 | Add `plan_start_date`, `plan_end_date`, `year1_end_date` columns to `business_financial_goals` with backfill from `is_extended_period` + `year1_months` | Migration design section below; baseline schema confirmed at supabase/migrations/00000000000000_baseline_schema.sql:1720-1780 |
| REQ-42-02 | `suggestPlanPeriod()` helper called only at plan creation / "Reset Plan Period" — never at render | Helper contract in "Patterns / Decisions" section; existing `isNearYearEnd` and `getMonthsUntilYearEnd` available at fiscal-year-utils.ts:296-317 |
| REQ-42-03 | Step 1 banner visible at all times when plan period is active; [Adjust] action lets user override | Banner placement and Adjust UX in "Banner UX" section |
| REQ-42-04 | Year 1/2/3 labels derive from persisted dates, not `new Date()` | Current `getYearLabel` at step1/types.ts:19-69 still uses `new Date()` for both extended and standard cases — must change |
| REQ-42-05 | `isExtendedPeriod` becomes derived from persisted dates | Derivation in hook; same name retained for backwards-compat with Step 1/4/5 components |
| REQ-42-06 | Remove `ownerUser === user.id` guard at useStrategicPlanning.ts:759 | Hook refactor in "Hook Refactor Pattern" section |
| REQ-42-07 | Tests cover persistence, coach/owner equivalence, banner visibility, Adjust override | Validation Architecture section |

---

## Architecture Patterns

### Current State Diagram (before Phase 42)

```
useStrategicPlanning(overrideBusinessId)
       │
       ▼
  loadData() — useEffect on mount
       │
       ├─► resolve businessId (coach or normal user)
       │       └─► [API] /api/goals/resolve-business → { profileId, fiscalYearStart, ... }
       │
       ├─► FinancialService.loadFinancialGoals(bizId)
       │       └─► [DB] business_financial_goals — returns row OR null + extendedPeriod
       │
       ├─► Detection block (lines 744-771):
       │       │
       │       ├─► IF loadedExtendedPeriod.isExtendedPeriod === true:
       │       │       restore saved state from DB row
       │       │
       │       └─► ELSE IF ownerUser === user.id AND !loadedFinancialData:
       │               │  ◄── BUG: coach excluded
       │               │  ◄── BUG: only "first time" detection, never re-evaluated
       │               IF isNearYearEnd(today, fiscalYearStart):
       │                       activate extended period
       │
       └─► load Q1-Q4 + current_remainder initiatives
                                  │
                                  ▼
                          state exposed to components
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
  Step1 banner               Step4 column                Step5 sprint
  (Year 1 label)             (current_remainder)         (Year End Bridge)
```

### Target State Diagram (after Phase 42)

```
useStrategicPlanning(overrideBusinessId)
       │
       ▼
  loadData() — useEffect on mount
       │
       ├─► resolve businessId (coach or normal user) ── unchanged
       │
       ├─► FinancialService.loadFinancialGoals(bizId)
       │       └─► [DB] business_financial_goals
       │              returns: { ...financial, planPeriod: { planStartDate, planEndDate, year1EndDate } }
       │
       ├─► Plan period resolution (replaces lines 744-771):
       │       │
       │       ├─► IF planPeriod.planStartDate exists (saved row):
       │       │       use as-is — both coach AND owner
       │       │
       │       └─► ELSE IF !loadedFinancialData (truly new plan):
       │               suggested = suggestPlanPeriod(new Date(), fiscalYearStart)
       │               set state to suggested  (NOT yet persisted — banner offers Adjust + saves on first dirty)
       │
       ├─► derive isExtendedPeriod, year1Months, currentYearRemainingMonths
       │       from { planStartDate, planEndDate, year1EndDate }
       │       — exposed in return value (preserves component contract)
       │
       └─► load Q1-Q4 + current_remainder initiatives ── unchanged
                                  │
                                  ▼
                          state exposed to components ── same shape
```

### Project Structure (additive)

```
src/app/goals/
├── hooks/
│   └── useStrategicPlanning.ts        # Modified (Wave 2)
├── services/
│   └── financial-service.ts           # Modified (Wave 1) — add planPeriod to save/load
├── utils/
│   ├── suggest-plan-period.ts         # NEW (Wave 1)
│   └── derive-period-info.ts          # NEW (Wave 1) — pure derivation from dates → ExtendedPeriodInfo
├── components/
│   ├── Step1GoalsAndKPIs.tsx          # Modified (Wave 2) — render PlanPeriodBanner
│   ├── PlanPeriodBanner.tsx           # NEW (Wave 2)
│   ├── PlanPeriodAdjustModal.tsx      # NEW (Wave 2)
│   └── step1/
│       └── types.ts                   # Modified (Wave 2) — getYearLabel reads dates
└── ...

src/app/api/goals/
├── save/route.ts                      # Modified (Wave 1) — persist plan period columns

supabase/migrations/
└── YYYYMMDDHHMMSS_plan_period_columns.sql  # NEW (Wave 1) — adds 3 columns + backfill

src/__tests__/goals/                   # NEW (Wave 3)
├── suggest-plan-period.test.ts
├── derive-period-info.test.ts
└── plan-period-coach-owner-equivalence.test.tsx
```

---

## Patterns / Decisions

### Pattern 1: Migration Design — Three New Columns + Idempotent Backfill

**File:** `supabase/migrations/YYYYMMDDHHMMSS_plan_period_columns.sql` (timestamp at write time)
**Filename regex:** Must match `^[0-9]{14}_[a-z0-9_]+\.sql$` per [.github/workflows/supabase-preview.yml:39](/.github/workflows/supabase-preview.yml#L39).

```sql
-- Phase 42: Plan period as explicit state
-- Adds plan_start_date, plan_end_date, year1_end_date as persisted plan boundaries.
-- One-time backfill maps existing rows from (is_extended_period, year1_months,
-- current_year_remaining_months) to the new date columns so existing clients see
-- identical plan shapes after migration.

ALTER TABLE "public"."business_financial_goals"
  ADD COLUMN IF NOT EXISTS "plan_start_date" date,
  ADD COLUMN IF NOT EXISTS "plan_end_date"   date,
  ADD COLUMN IF NOT EXISTS "year1_end_date"  date;

COMMENT ON COLUMN "public"."business_financial_goals"."plan_start_date" IS
  'Phase 42: Start date of the strategic plan. NULL = legacy row not yet migrated by user save.';
COMMENT ON COLUMN "public"."business_financial_goals"."plan_end_date" IS
  'Phase 42: End date of Year 3 (always plan_start_date + 3 years - adjusted to FY end).';
COMMENT ON COLUMN "public"."business_financial_goals"."year1_end_date" IS
  'Phase 42: End date of Year 1. For extended period plans this is plan_start_date + year1_months. Standard plans: end of next FY.';

-- One-time backfill — only for rows that have financial data set (revenue_year1 > 0
-- or any year1 metric set) so we don't synthesize a plan for placeholder rows.
-- For each row:
--   plan_start_date := computed from updated_at (or created_at) + year_type
--   year1_end_date  := plan_start_date + year1_months months - 1 day (snap to month-end)
--   plan_end_date   := year1_end_date + 24 months (Years 2 + 3, standard 12 each)
--
-- Mapping rules (researcher decision — see "Backfill semantics" subsection below):
--   - is_extended_period = true:
--       plan_start_date := first-of-month(updated_at)  (the date we presume detection ran)
--       year1_end_date  := plan_start_date + year1_months months - 1 day
--   - is_extended_period = false (standard 12-month):
--       plan_start_date := start of fiscal_year that updated_at falls in
--       year1_end_date  := end of that same fiscal_year
--   - NULL year1_months → treat as 12 (default)
--   - rows where revenue_year1 = 0 AND revenue_year2 = 0 AND revenue_year3 = 0 → SKIP
--     (no real plan; first save will generate dates from suggestPlanPeriod)
--
-- Backfill is gated on plan_start_date IS NULL so re-running the migration is a no-op.

UPDATE "public"."business_financial_goals" g
SET
  plan_start_date = computed.start_date,
  year1_end_date  = computed.year1_end,
  plan_end_date   = computed.year3_end
FROM (
  SELECT
    id,
    -- start date depends on is_extended_period
    CASE
      WHEN COALESCE(is_extended_period, false) = true THEN
        date_trunc('month', updated_at)::date
      ELSE
        -- Snap to start of fiscal year. For year_type='FY', FY starts July 1.
        -- For year_type='CY', FY starts January 1. We don't know yearStartMonth
        -- per-business in this table, so we use year_type as proxy (matches
        -- DEFAULT_YEAR_START_MONTH semantics in fiscal-year-utils.ts).
        CASE COALESCE(year_type, 'FY')
          WHEN 'CY' THEN make_date(EXTRACT(YEAR FROM updated_at)::int, 1, 1)
          ELSE
            CASE
              WHEN EXTRACT(MONTH FROM updated_at) >= 7 THEN
                make_date(EXTRACT(YEAR FROM updated_at)::int, 7, 1)
              ELSE
                make_date(EXTRACT(YEAR FROM updated_at)::int - 1, 7, 1)
            END
        END
    END AS start_date,
    -- year1_end = start + year1_months months - 1 day
    (
      CASE
        WHEN COALESCE(is_extended_period, false) = true THEN
          date_trunc('month', updated_at)::date
        ELSE
          CASE COALESCE(year_type, 'FY')
            WHEN 'CY' THEN make_date(EXTRACT(YEAR FROM updated_at)::int, 1, 1)
            ELSE
              CASE
                WHEN EXTRACT(MONTH FROM updated_at) >= 7 THEN
                  make_date(EXTRACT(YEAR FROM updated_at)::int, 7, 1)
                ELSE
                  make_date(EXTRACT(YEAR FROM updated_at)::int - 1, 7, 1)
              END
          END
      END
      + (COALESCE(year1_months, 12) || ' months')::interval
      - INTERVAL '1 day'
    )::date AS year1_end,
    -- year3_end = year1_end + 24 months
    (
      CASE
        WHEN COALESCE(is_extended_period, false) = true THEN
          date_trunc('month', updated_at)::date
        ELSE
          CASE COALESCE(year_type, 'FY')
            WHEN 'CY' THEN make_date(EXTRACT(YEAR FROM updated_at)::int, 1, 1)
            ELSE
              CASE
                WHEN EXTRACT(MONTH FROM updated_at) >= 7 THEN
                  make_date(EXTRACT(YEAR FROM updated_at)::int, 7, 1)
                ELSE
                  make_date(EXTRACT(YEAR FROM updated_at)::int - 1, 7, 1)
              END
          END
      END
      + (COALESCE(year1_months, 12) || ' months')::interval
      + INTERVAL '24 months'
      - INTERVAL '1 day'
    )::date AS year3_end
  FROM "public"."business_financial_goals"
  WHERE plan_start_date IS NULL
    AND (
      COALESCE(revenue_year1, 0) > 0
      OR COALESCE(revenue_year2, 0) > 0
      OR COALESCE(revenue_year3, 0) > 0
    )
) computed
WHERE g.id = computed.id;

-- Verification query (run manually post-migration; not part of the SQL):
--
-- SELECT business_id, year_type, is_extended_period, year1_months,
--        plan_start_date, year1_end_date, plan_end_date,
--        EXTRACT(EPOCH FROM (year1_end_date - plan_start_date)) / 86400 AS year1_days
-- FROM business_financial_goals
-- WHERE plan_start_date IS NOT NULL
-- ORDER BY updated_at DESC LIMIT 10;
--
-- Expectations:
--   - is_extended_period=true rows: year1_days between 28 and 470 (1-15 months range)
--   - is_extended_period=false rows: year1_days = 364 or 365
--   - plan_end_date - plan_start_date always ≈ year1_days + 730
```

**Backfill semantics — design decisions documented:**

1. **What does `plan_start_date` mean for an existing extended-period row?** Phase 14 stored `current_year_remaining_months` (e.g., 2) but did NOT store the date the wizard was run. The backfill uses `date_trunc('month', updated_at)::date` as a proxy: this is the first-of-month for the row's most recent save. For rows saved on 2026-04-24 (Fit2Shine), this gives `plan_start_date = 2026-04-01`. The Year 1 label "FY26 rem + FY27" was generated relative to that start date, so this preserves user expectation.
2. **What about non-extended (standard 12-month) rows?** We snap to FY start: a row updated 2026-03-15 with `year_type='FY'` gets `plan_start_date = 2025-07-01` (start of FY26). This is what the wizard would have implied: Year 1 = FY26, Year 2 = FY27, Year 3 = FY28.
3. **Rows with all-zero financial data** (e.g., a coach opened the wizard but never entered numbers): SKIP. These have no real plan to backfill; the first save will run `suggestPlanPeriod()` and produce fresh dates.
4. **Rows with NULL `year1_months`**: treated as 12 (matches the column default).
5. **Re-runnability:** `WHERE plan_start_date IS NULL` makes the UPDATE a no-op on second run. Safe for preview branch + production.
6. **Equivalence to "no plan period set yet"**: `plan_start_date IS NULL` after migration ⇒ the row has no plan period and the next save must generate one (via `suggestPlanPeriod`).

[VERIFIED: supabase/migrations/00000000000000_baseline_schema.sql:1720-1780 — current schema; all three new columns are absent]
[VERIFIED: CONTRIBUTING.md:35-44 — migration filename + idempotency requirements]

### Pattern 2: `suggestPlanPeriod()` Helper Contract

**File:** `src/app/goals/utils/suggest-plan-period.ts` (NEW)

```typescript
import {
  getFiscalYear,
  getFiscalYearStartDate,
  getFiscalYearEndDate,
  isNearYearEnd,
  getMonthsUntilYearEnd,
  DEFAULT_YEAR_START_MONTH,
} from '@/lib/utils/fiscal-year-utils'

export interface PlanPeriodSuggestion {
  planStartDate: Date       // First day of the plan
  planEndDate: Date         // Last day of Year 3
  year1EndDate: Date        // Last day of Year 1 (= planEndDate - 24 months)
  year1Months: number       // 12 for standard, 13-15 for extended
  rationale: string         // Banner copy: e.g. "You're 2 months from FY end..."
}

export function suggestPlanPeriod(
  today: Date,
  yearStartMonth: number = DEFAULT_YEAR_START_MONTH,
): PlanPeriodSuggestion {
  const currentFY = getFiscalYear(today, yearStartMonth)

  if (isNearYearEnd(today, yearStartMonth)) {
    // Extended period: plan starts today (snap to first of month) and runs through end of currentFY+1.
    const monthsLeft = getMonthsUntilYearEnd(today, yearStartMonth)
    const planStartDate = new Date(today.getFullYear(), today.getMonth(), 1)  // first-of-month
    const year1EndDate = getFiscalYearEndDate(currentFY + 1, yearStartMonth)  // end of NEXT FY
    const year1Months = monthsLeft + 12
    const planEndDate = getFiscalYearEndDate(currentFY + 3, yearStartMonth)  // Year 3 end

    return {
      planStartDate,
      planEndDate,
      year1EndDate,
      year1Months,
      rationale: `You're within ${monthsLeft} month${monthsLeft === 1 ? '' : 's'} of your FY end. Year 1 spans the rest of this year plus the full next year (${year1Months} months total).`,
    }
  }

  // Standard 12-month plan: Year 1 = current FY (or next FY if we're early enough that FY makes more sense).
  // Decision: when plan begins, Year 1 is the FY that contains today.
  const planStartDate = getFiscalYearStartDate(currentFY, yearStartMonth)
  const year1EndDate = getFiscalYearEndDate(currentFY, yearStartMonth)
  const planEndDate = getFiscalYearEndDate(currentFY + 2, yearStartMonth)

  return {
    planStartDate,
    planEndDate,
    year1EndDate,
    year1Months: 12,
    rationale: `Year 1 is the current fiscal year (12 months). Years 2 and 3 follow.`,
  }
}
```

**Where it lives:** `src/app/goals/utils/suggest-plan-period.ts` — colocated with other goals utils per existing structure (`quarters.ts`, `formatting.ts`, `team.ts` are all there). [VERIFIED: ls of src/app/goals/utils/]

**Where it's called:** Two places only:
1. `useStrategicPlanning.ts` load block, when no `planStartDate` is loaded AND no financial data exists → set state to suggestion (banner shows it for user confirmation).
2. `PlanPeriodAdjustModal` "Reset to suggestion" button → re-run with `new Date()` and overwrite current period.

**Where it's NOT called:** Never at render time, never inside `getYearLabel`, never inside Step 4/5 components.

**Rationale string:** Drives the banner subtitle. Keep it data-driven (count of months, FY name) — no hardcoded month names beyond what `fiscal-year-utils` already provides. The component renders the formatted dates separately using existing helpers.

### Pattern 3: Hook Refactor — Replace Lines 744-771

**Current code [src/app/goals/hooks/useStrategicPlanning.ts:744-771](src/app/goals/hooks/useStrategicPlanning.ts#L744-L771):**

```typescript
// ── Extended Period Detection (Phase 14) ────────────────────
const effectiveYearStart = localFiscalYearStart
let detectedExtended = false

if (loadedExtendedPeriod?.isExtendedPeriod) {
  // Returning user — restore saved extended period state
  setIsExtendedPeriod(true)
  setYear1Months(loadedExtendedPeriod.year1Months)
  setCurrentYearRemainingMonths(loadedExtendedPeriod.currentYearRemainingMonths)
  detectedExtended = true
} else if (ownerUser === user.id && !loadedFinancialData) {
  // First-time user (client's own view only, not coach viewing) — check if near year end
  const nearEnd = isNearYearEnd(new Date(), effectiveYearStart)
  if (nearEnd) {
    const monthsLeft = getMonthsUntilYearEnd(new Date(), effectiveYearStart)
    setIsExtendedPeriod(true)
    setCurrentYearRemainingMonths(monthsLeft)
    setYear1Months(monthsLeft + 12)
    detectedExtended = true
  }
}
// ── End Extended Period Detection ────────────────────────────
```

**Replacement (Wave 2 task):**

```typescript
// ── Plan Period Resolution (Phase 42) ───────────────────────
// Source of truth: persisted plan_start_date / plan_end_date / year1_end_date.
// If absent (truly new plan, no save yet), call suggestPlanPeriod() and use the
// suggested dates as state. The banner in Step 1 shows them visibly so the user
// can [Adjust] before any auto-save fires. No role guard — coach view and owner
// view both follow this branch identically.

let resolvedPeriod: { planStartDate: Date; planEndDate: Date; year1EndDate: Date }

if (loadedPlanPeriod?.planStartDate) {
  // Existing plan — use persisted dates regardless of who is viewing.
  resolvedPeriod = {
    planStartDate: new Date(loadedPlanPeriod.planStartDate),
    planEndDate: new Date(loadedPlanPeriod.planEndDate),
    year1EndDate: new Date(loadedPlanPeriod.year1EndDate),
  }
} else if (!loadedFinancialData) {
  // No saved plan AND no financial data — generate suggestion. Both coach and
  // owner view see the same suggested period.
  const suggestion = suggestPlanPeriod(new Date(), localFiscalYearStart)
  resolvedPeriod = {
    planStartDate: suggestion.planStartDate,
    planEndDate: suggestion.planEndDate,
    year1EndDate: suggestion.year1EndDate,
  }
  // Mark dirty so the suggestion gets persisted on next auto-save tick.
  // (markDirty fires after isLoadComplete becomes true — handled by existing
  // 500ms setTimeout at line 897-899.)
  setPendingPlanPeriodSave(true)
} else {
  // Existing financial data but no plan_start_date — this is a Phase 14 row that
  // wasn't backfilled (zero-revenue case) or migration didn't cover it.
  // Fall back to a 12-month standard plan based on yearType + today.
  const fallback = suggestPlanPeriod(new Date(), localFiscalYearStart)
  resolvedPeriod = {
    planStartDate: fallback.planStartDate,
    planEndDate: fallback.planEndDate,
    year1EndDate: fallback.year1EndDate,
  }
}

setPlanStartDate(resolvedPeriod.planStartDate)
setPlanEndDate(resolvedPeriod.planEndDate)
setYear1EndDate(resolvedPeriod.year1EndDate)

// Derive backwards-compat fields for components that still consume them.
const derived = derivePeriodInfo(resolvedPeriod)
setIsExtendedPeriod(derived.isExtendedPeriod)
setYear1Months(derived.year1Months)
setCurrentYearRemainingMonths(derived.currentYearRemainingMonths)
const detectedExtended = derived.isExtendedPeriod
// ── End Plan Period Resolution ─────────────────────────────
```

**Ordering:** This block sits in the same place (between `loadFinancialGoals` return and the `setFinancialData(loadedFinancialData)` call at line 774). Critical that it runs BEFORE `setIsLoadComplete(true)` at line 898. The existing 500ms `setTimeout` ensures all setStates flush.

**`derivePeriodInfo` (NEW pure helper at `src/app/goals/utils/derive-period-info.ts`):**

```typescript
import { ExtendedPeriodInfo } from '../types'

export interface PlanPeriodDates {
  planStartDate: Date
  planEndDate: Date
  year1EndDate: Date
}

/**
 * Derive Phase 14 ExtendedPeriodInfo from Phase 42 persisted dates.
 * Single source of truth for the relationship "Year 1 length → isExtendedPeriod boolean".
 */
export function derivePeriodInfo(period: PlanPeriodDates): ExtendedPeriodInfo {
  const ms = period.year1EndDate.getTime() - period.planStartDate.getTime()
  const days = Math.round(ms / (1000 * 60 * 60 * 24))
  // 365-day standard year; anything materially longer is "extended"
  // (covers leap year noise: 366 days is still standard)
  const isExtendedPeriod = days > 366

  // Calendar-month diff between planStartDate and year1EndDate, rounded up.
  // 14 months ≈ 425 days. Use month math to be precise.
  const months =
    (period.year1EndDate.getFullYear() - period.planStartDate.getFullYear()) * 12 +
    (period.year1EndDate.getMonth() - period.planStartDate.getMonth()) + 1  // +1 because end date is inclusive

  const year1Months = months
  const currentYearRemainingMonths = isExtendedPeriod ? Math.max(0, year1Months - 12) : 0

  return { isExtendedPeriod, year1Months, currentYearRemainingMonths }
}
```

**Backwards-compat contract:** All Step 1/4/5 components currently consume `isExtendedPeriod`, `year1Months`, `currentYearRemainingMonths` from the hook return. Phase 42 keeps these names and shapes — they just become derived from the dates. **Zero breaking changes for components.**

### Pattern 4: Service Layer — `FinancialService` Extensions

**File:** [src/app/goals/services/financial-service.ts](src/app/goals/services/financial-service.ts)

Add `planPeriod` to both `saveFinancialGoals` and `loadFinancialGoals`. Keep the existing `extendedPeriod` parameter for one release of dual-write so any third-party consumer of the service (none found in repo, but the Phase 14 cleanup lists `is_extended_period` removal as a separate phase per ROADMAP).

**Save path additions ([financial-service.ts:18-26](src/app/goals/services/financial-service.ts#L18-L26)):**

```typescript
static async saveFinancialGoals(
  businessId: string,
  userId: string,
  financialData: FinancialData,
  yearType: 'FY' | 'CY',
  coreMetrics?: CoreMetricsData,
  quarterlyTargets?: Record<string, { q1: string; q2: string; q3: string; q4: string }>,
  extendedPeriod?: { isExtendedPeriod: boolean; year1Months: number; currentYearRemainingMonths: number },
  planPeriod?: { planStartDate: Date; planEndDate: Date; year1EndDate: Date },  // NEW Phase 42
): Promise<{ success: boolean; error?: string }>
```

In `dataToSave` (after line 113), add:

```typescript
// Phase 42: Persist plan period as ISO date strings (YYYY-MM-DD)
plan_start_date: planPeriod?.planStartDate?.toISOString().slice(0, 10) ?? null,
plan_end_date:   planPeriod?.planEndDate?.toISOString().slice(0, 10) ?? null,
year1_end_date:  planPeriod?.year1EndDate?.toISOString().slice(0, 10) ?? null,
```

**Load path additions ([financial-service.ts:141-148](src/app/goals/services/financial-service.ts#L141-L148)):**

Extend the return type:

```typescript
static async loadFinancialGoals(businessId: string): Promise<{
  // ...existing fields...
  planPeriod: { planStartDate: string | null; planEndDate: string | null; year1EndDate: string | null }
  // ...
}>
```

After line 261 (where `extendedPeriod` is built), add:

```typescript
const planPeriod = {
  planStartDate: data.plan_start_date as string | null,
  planEndDate:   data.plan_end_date   as string | null,
  year1EndDate:  data.year1_end_date  as string | null,
}
```

Return it alongside `extendedPeriod`. All four early-return paths (lines 151, 166, 170, 174) get the same default: `{ planStartDate: null, planEndDate: null, year1EndDate: null }`.

**API save route ([src/app/api/goals/save/route.ts:97-142](src/app/api/goals/save/route.ts#L97-L142)) — bug fix + new columns:**

Currently at line 96 destructures `{ financialData, coreMetrics, yearType, quarterlyTargets }` — extended period is silently dropped. Phase 42 fix:

```typescript
const { financialData, coreMetrics, yearType, quarterlyTargets, extendedPeriod, planPeriod } = data.financial

// ...build financialPayload...

// Phase 14 columns (was missing — Phase 42 fixes the bug)
if (extendedPeriod) {
  financialPayload.is_extended_period          = extendedPeriod.isExtendedPeriod ?? false
  financialPayload.year1_months                = extendedPeriod.year1Months ?? 12
  financialPayload.current_year_remaining_months = extendedPeriod.currentYearRemainingMonths ?? 0
}

// Phase 42 columns
if (planPeriod) {
  financialPayload.plan_start_date = planPeriod.planStartDate
  financialPayload.plan_end_date   = planPeriod.planEndDate
  financialPayload.year1_end_date  = planPeriod.year1EndDate
}
```

The hook's `saveViaApi` body at [useStrategicPlanning.ts:309-336](src/app/goals/hooks/useStrategicPlanning.ts#L309-L336) already sends `extendedPeriod`. Add `planPeriod` to the same `financial` block.

### Pattern 5: Banner UX in Step 1

**Component:** `src/app/goals/components/PlanPeriodBanner.tsx` (NEW)

**Placement:** Inside `Step1GoalsAndKPIs.tsx`, immediately after the "Year Type & Industry Selector" block (current location: [Step1GoalsAndKPIs.tsx:59-86](src/app/goals/components/Step1GoalsAndKPIs.tsx#L59-L86)) and BEFORE the "Required Section Header" at line 88. Always rendered when `planStartDate` is set (which is always after Phase 42, including the suggestion case).

**Visual layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│ 📅 YOUR PLAN PERIOD                                              │
│                                                                  │
│ Apr 2026 → Jun 2029 · Year 1 is 14 months                       │
│ You're within 2 months of your FY end. Year 1 spans the rest of │
│ this year plus the full next year.                              │
│                                                                  │
│                                              [ Adjust ]          │
└─────────────────────────────────────────────────────────────────┘
```

**Props:**

```typescript
interface PlanPeriodBannerProps {
  planStartDate: Date
  planEndDate: Date
  year1EndDate: Date
  rationale: string         // From suggestPlanPeriod or computed locally for loaded plans
  onAdjust: () => void      // Opens PlanPeriodAdjustModal
}
```

**[Adjust] action:** Opens a modal (`PlanPeriodAdjustModal.tsx`). The modal lets the user:
1. **See the suggested period** with rationale
2. **Manually edit** `planStartDate`, `year1EndDate` via two date inputs (or via Year 1 length slider — implementer's choice; date inputs are simpler for v1)
3. **Reset to suggestion** button — re-runs `suggestPlanPeriod(new Date(), fiscalYearStart)` and writes those dates back
4. **Cancel** — close without changes
5. **Save** — overwrites state, marks dirty, triggers auto-save in 2s

**"Reset Plan Period" workflow** for an existing confirmed plan: Inside the Adjust modal, the "Reset to suggestion" button regenerates dates from today's date. This gives coaches a way to refresh a stale plan when the wizard is re-opened mid-cycle. Same code path as initial creation.

**Critical UX rule:** Editing the plan period from the banner does NOT delete existing initiatives. Year 1/2/3 financial data, KPI targets, and Q1-Q4 buckets all stay; only the date labels change. (The relationship between dates and `current_remainder` initiatives is documented in "Pitfall 5" below.)

### Pattern 6: Year Labels — Read From Persisted Dates

**File:** [src/app/goals/components/step1/types.ts](src/app/goals/components/step1/types.ts) — `getYearLabel`

Current signature uses `currentYear: number` plus `extendedPeriodInfo`, then computes the FY year via `new Date()` at line 27-32. Phase 42 changes:

```typescript
export function getYearLabel(
  idx: number,
  yearType: YearType,
  // currentYear: number,           // REMOVE — derived from planStartDate
  // extendedPeriodInfo?: ...,      // REMOVE — derived from dates
  planPeriod?: { planStartDate: Date; year1EndDate: Date; planEndDate: Date }
): YearLabel {
  if (idx === 0) return { main: 'Current', subtitle: null }
  if (!planPeriod) {
    // Defensive default for the brief moment before hook load completes.
    return { main: `Year ${idx}`, subtitle: null }
  }

  // Year 1 boundary: planStartDate → year1EndDate
  // Year 2 boundary: year1EndDate + 1 day → year1EndDate + 12 months
  // Year 3 boundary: + 12 more months → planEndDate

  if (idx === 1) {
    const startFY = getFiscalYear(planPeriod.planStartDate, ...)  // requires yearStartMonth
    const endFY   = getFiscalYear(planPeriod.year1EndDate, ...)
    if (startFY !== endFY) {
      // Extended: spans two FYs
      return {
        main: `${prefix}${(startFY).toString().slice(-2)} rem + ${prefix}${endFY.toString().slice(-2)}`,
        subtitle: `${months} months`,
      }
    }
    // Standard
    return { main: `${prefix}${endFY.toString().slice(-2)}`, subtitle: `Ending ${formatDate(year1EndDate)}` }
  }

  // Years 2 and 3 — derive from planEndDate going backwards
  // ... (similar pattern)
}
```

**Key change:** No more `new Date()` inside `getYearLabel`. All year boundaries derive from the three persisted dates. This eliminates the bug where loading a plan in May shows different labels than loading the same plan in August.

**Caller sites** that need updating to pass `planPeriod`:
- `Step1GoalsAndKPIs.tsx:144` — currently `getYearLabel(idx, yearType, currentYear, extendedPeriodInfo)` ✱ 5 callsites in FinancialGoalsSection.tsx alone (lines 106, 144) + propagation through other Step 1 sections (CoreMetricsSection, KPISection — verify these aren't using getYearLabel; if they are, update accordingly)

### Pattern 7: Coach-View Equivalence — Removing the Role Guard

**The guard at [useStrategicPlanning.ts:759](src/app/goals/hooks/useStrategicPlanning.ts#L759):**

```typescript
} else if (ownerUser === user.id && !loadedFinancialData) {
```

In the Phase 42 replacement (Pattern 3), the entire branch becomes:

```typescript
} else if (!loadedFinancialData) {
  // suggested = suggestPlanPeriod(...)
}
```

`ownerUser === user.id` is removed. Coach view (`overrideBusinessId !== null`) and owner view both fall into the same `loadedFinancialData === null` branch.

**Audit of OTHER guards in the broader coach-view codepath** ([useStrategicPlanning.ts:576-718](src/app/goals/hooks/useStrategicPlanning.ts#L576-L718)):

- Lines 576-668 (coach branch): resolves businesses.id → business_profiles.id via `/api/goals/resolve-business` (which does its own access check via `business_users` / `assigned_coach_id` / `system_roles`). Sets `bizId`, `ownerUser`, `localFiscalYearStart`, `businessesId`. Identical data shape to the owner branch by design.
- Lines 669-718 (owner branch): resolves via `resolveBusinessId` helper. Same fields populated.
- Both branches converge at line 720 with identical state. After that, all `FinancialService.loadFinancialGoals(bizId)` and `StrategicPlanningService.loadInitiatives` calls are identical.

**The ONLY user-id-keyed difference** is the `user.id !== bizId` fallback at lines 805-808, 815-817, 824-826, etc. — these load initiatives from `user.id` if `bizId` returns nothing. This is for **legacy data migration** (initiatives saved under user.id before the dual-ID pattern was enforced) and is NOT a coach-vs-owner divergence. Leave untouched.

**Conclusion:** Removing the guard at line 759 is the only behavioural difference Phase 42 needs to make for coach/owner equivalence. No other guards bypass.

[VERIFIED: full read of useStrategicPlanning.ts:576-905]

### Anti-Patterns to Avoid

- **Don't run `suggestPlanPeriod()` at render time.** It depends on `new Date()` and would re-suggest a different period each session. ALWAYS persist + read from columns.
- **Don't use `quarters.ts` `determinePlanYear()` for any new logic.** It hardcodes `currentMonth >= 7` for FY (lines 193-198) and ignores `fiscal_year_start`. Use `fiscal-year-utils.ts` `getFiscalYear()` instead.
- **Don't drop `is_extended_period` / `year1_months` / `current_year_remaining_months` columns in this phase.** ROADMAP explicitly defers that to a later cleanup phase. Dual-write for one release.
- **Don't change `quarter_assigned` in `strategic_initiatives`** to add 'CR' as a valid value — there's a CHECK constraint at baseline_schema.sql:4683 that rejects it. Phase 14's `step_type='current_remainder'` mechanism already works without touching `quarter_assigned`.
- **Don't auto-save the suggestion silently.** The banner MUST be visible before any save. Otherwise we re-introduce the silent-coach-behavior problem Phase 42 is designed to fix. Use `setPendingPlanPeriodSave(true)` flag and let the existing `markDirty()` flow trigger save AFTER `isLoadComplete` is true (banner has rendered).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fiscal year date math | Custom JS month arithmetic | `getFiscalYearStartDate`, `getFiscalYearEndDate`, `getFiscalYear` from fiscal-year-utils.ts | Already handles CY/FY, leap years, edge cases; tested in production |
| Months-until-year-end | Manual `(fyEnd - today) / 30` | `getMonthsUntilYearEnd(today, yearStartMonth)` from fiscal-year-utils.ts:296 | Already exists and matches Phase 14 semantics |
| Plan period derivation | Inline conditionals scattered across components | `derivePeriodInfo({ planStartDate, year1EndDate, planEndDate })` (NEW pure helper) | Single source of truth; testable; no "extended period inferred two different ways" drift |
| Date input UI | Custom date picker | Native `<input type="date">` | Project doesn't have a date picker library; one-off use; Tailwind-styleable |
| Migration date math (SQL) | Postgres `EXTRACT()` chains | `make_date()` + `INTERVAL` arithmetic in the migration | Cleaner, easier to verify post-migration |
| Plan period validation | Custom regex / range checks | `zod` schema (already in deps `^4.0.17`) | Already used elsewhere in the repo; supports `z.date()` parsing |

**Key insight:** Phase 42 is mostly composition of existing pieces. The two genuinely new pieces are `suggestPlanPeriod` (a 30-line pure helper) and `derivePeriodInfo` (a 10-line pure helper). Everything else is wiring through services and components.

---

## Common Pitfalls

### Pitfall 1: Save Path Bypasses Service Layer for Coach Mode

**What goes wrong:** Phase 14 added `extendedPeriod` to `FinancialService.saveFinancialGoals` but forgot to add it to `/api/goals/save/route.ts` (the coach save path). Result: when a coach saves Goals data via the API route, `is_extended_period` / `year1_months` / `current_year_remaining_months` are silently dropped. Phase 42 mustn't repeat this with `plan_start_date` etc.

**Why it happens:** The codebase has TWO save paths:
1. **NORMAL MODE** ([useStrategicPlanning.ts:423-509](src/app/goals/hooks/useStrategicPlanning.ts#L423-L509)) — direct calls to `FinancialService.saveFinancialGoals`
2. **COACH MODE** ([useStrategicPlanning.ts:395-421](src/app/goals/hooks/useStrategicPlanning.ts#L395-L421)) — POST to `/api/goals/save` which has its own column mapping

Updating one without the other is easy to miss.

**How to avoid:** Wave 1 task that adds plan-period columns must touch BOTH `FinancialService.saveFinancialGoals` AND `/api/goals/save/route.ts` IN THE SAME COMMIT. Wave 1 verification grep: `grep -rn "plan_start_date" src/app/api src/app/goals/services` — must show ≥3 references (load + save in service, save in API route).

[VERIFIED: /api/goals/save/route.ts:96 — destructures only `{ financialData, coreMetrics, yearType, quarterlyTargets }`; extended period fields silently dropped]

### Pitfall 2: Coach Goals Page Not Passing extendedPeriodInfo to Step 1

**What goes wrong:** [/coach/clients/[id]/goals/page.tsx:740-749](src/app/coach/clients/[id]/goals/page.tsx#L740-L749) renders `Step1GoalsAndKPIs` WITHOUT `extendedPeriodInfo` prop, while [/goals/page.tsx:973-977](src/app/goals/page.tsx#L973-L977) DOES pass it. Even after Phase 42 fixes persistence, the coach Step 1 banner won't render unless this is fixed too.

**How to avoid:** Wave 2 task that wires the banner must also update `/coach/clients/[id]/goals/page.tsx` to pass the new `planPeriod` prop. Verify: `grep -n "planPeriod" src/app/coach/clients/\[id\]/goals/page.tsx` returns at least one match.

### Pitfall 3: Backfill SQL Mishandles year_type=NULL or Edge Months

**What goes wrong:** `EXTRACT(MONTH FROM updated_at)` on a row where `updated_at` is at midnight UTC near the boundary (e.g., 2026-07-01 00:00:00 in UTC but 2026-06-30 in AEST) could place a row in the wrong fiscal year. Production Australian businesses are in AEST; Supabase stores `timestamptz` in UTC.

**How to avoid:** Use `(updated_at AT TIME ZONE 'Australia/Sydney')::date` for the EXTRACT calls. Or — simpler — accept that backfill is approximate (the wizard will overwrite on next save anyway) and add a verification query that counts how many rows fall on day-1 boundaries. If <5, document it; if more, sharpen the logic.

**Verification SQL:** Per the migration's verification block, post-apply check that all `year1_days` values are within sensible ranges (28–470). Out-of-range rows surface backfill bugs.

### Pitfall 4: First-Time Auto-Save Persists Suggestion Before Banner Renders

**What goes wrong:** If `suggestPlanPeriod()` runs in the load block AND `markDirty()` fires before the banner has rendered, the suggested dates get persisted silently — defeating the "user confirms the suggestion" requirement.

**How to avoid:** The hook's existing 500ms `setTimeout` at [useStrategicPlanning.ts:897-899](src/app/goals/hooks/useStrategicPlanning.ts#L897-L899) for `setIsLoadComplete(true)` already gates auto-save. The banner renders synchronously inside Step 1. By the time the auto-save 2-second debounce fires (line 935), the banner has been on screen for ~2.5 seconds — user has visibility. Don't add `markDirty()` directly inside the load block; let the banner be the user's confirmation surface. If the user [Adjust]s in the first 2 seconds, the modal write replaces the suggestion before the auto-save fires.

**Test:** A vitest test should mock `setTimeout` and `Date.now` to verify save fires AFTER `isLoadComplete = true` AND user has had a chance to interact (or 2s of debounce expired).

### Pitfall 5: Adjusting Plan Period Length Strands current_remainder Initiatives

**What goes wrong:** A user creates a 14-month extended plan (with `current_remainder` initiatives in Step 4), then [Adjust]s back to a standard 12-month plan. The `current_remainder` bucket still has data but the Step 4 column is hidden (because `currentRemainderInfo` is null when `isExtendedPeriod === false` — see [Step4AnnualPlan.tsx:54-56](src/app/goals/components/Step4AnnualPlan.tsx#L54-L56)).

**How to avoid:** Document this as known behaviour in Wave 2 tasks. Two acceptable approaches:
- **(A) Conservative:** Show a warning in the Adjust modal: "Switching to a standard plan will hide your current_remainder initiatives. They won't be deleted; you can switch back."
- **(B) Active:** On adjust to standard, automatically move `current_remainder` initiatives into `q1`. This is more aggressive but safer.

Recommend (A) for v1 — it's a coach-driven workflow; warning + reversible is fine. Note in the test plan.

### Pitfall 6: `plan_start_date IS NULL` for an Old Row Triggers Re-Suggestion

**What goes wrong:** A coach opens the wizard for a client that has an old `business_financial_goals` row with revenue_year1 = 50000 but `plan_start_date` is NULL (because the row was last saved by Phase 14 and the migration backfill skipped or missed it). Today's date is 2026-04-27. The hook hits the `else` branch in Pattern 3, generates a suggestion that looks like Q4-extended (Apr 2026 → Jun 2029, 14 months), and the user sees a banner. But the row already has Year 1 = $50K targets. Bad UX — looks like the plan suddenly changed shape.

**How to avoid:** Don't re-suggest for rows that have financial data. The fallback branch in Pattern 3 should compute dates from `updated_at` semantics matching the migration backfill. This means: backfill SQL semantics should be available as a JS helper too (`suggestPlanPeriod` already does the "today-driven" version; we need `inferPlanPeriodFromLegacy(row)` for legacy rows).

Or simpler: ensure the migration backfills EVERY row with non-zero financial data (already the design — see "Backfill semantics" rule 3). Then `loadedPlanPeriod.planStartDate` is always set for legacy rows after migration runs.

**Conclusion:** This pitfall is mitigated by the migration's coverage of "any year1/year2/year3 metric > 0". Validate post-migration that the count of `plan_start_date IS NULL AND revenue_year1 > 0` is zero.

### Pitfall 7: Returning a Date as ISO String Confuses TypeScript at the Service Boundary

**What goes wrong:** Supabase returns `date` columns as `string` (YYYY-MM-DD). The hook expects `Date` instances (because `derivePeriodInfo` does `getTime()`). Mixing them silently causes `getTime() is not a function` runtime errors.

**How to avoid:** `FinancialService.loadFinancialGoals` returns `planPeriod` with `string | null` types (raw from DB). The hook is responsible for `new Date(stringValue)` conversion. Document this in the service's JSDoc.

---

## Code Examples

### Example 1: Calling suggestPlanPeriod inside the hook

```typescript
// src/app/goals/hooks/useStrategicPlanning.ts (excerpt, Wave 2)
// Source: Pattern 3 above

import { suggestPlanPeriod } from '../utils/suggest-plan-period'
import { derivePeriodInfo } from '../utils/derive-period-info'

// Inside loadData(), after FinancialService.loadFinancialGoals call:
const loadedPlanPeriod = loadedData.planPeriod  // { planStartDate, planEndDate, year1EndDate } | null fields

let planStart: Date, planEnd: Date, year1End: Date

if (loadedPlanPeriod?.planStartDate) {
  planStart = new Date(loadedPlanPeriod.planStartDate)
  planEnd   = new Date(loadedPlanPeriod.planEndDate!)
  year1End  = new Date(loadedPlanPeriod.year1EndDate!)
} else if (!loadedFinancialData) {
  const suggestion = suggestPlanPeriod(new Date(), localFiscalYearStart)
  planStart = suggestion.planStartDate
  planEnd   = suggestion.planEndDate
  year1End  = suggestion.year1EndDate
} else {
  // Legacy row without backfilled dates — should be rare after migration
  const fallback = suggestPlanPeriod(new Date(), localFiscalYearStart)
  planStart = fallback.planStartDate
  planEnd   = fallback.planEndDate
  year1End  = fallback.year1EndDate
}

setPlanStartDate(planStart)
setPlanEndDate(planEnd)
setYear1EndDate(year1End)

const derived = derivePeriodInfo({ planStartDate: planStart, planEndDate: planEnd, year1EndDate: year1End })
setIsExtendedPeriod(derived.isExtendedPeriod)
setYear1Months(derived.year1Months)
setCurrentYearRemainingMonths(derived.currentYearRemainingMonths)
```

### Example 2: Banner rendering inside Step1

```tsx
// src/app/goals/components/Step1GoalsAndKPIs.tsx (excerpt, Wave 2)

{planStartDate && (
  <PlanPeriodBanner
    planStartDate={planStartDate}
    planEndDate={planEndDate}
    year1EndDate={year1EndDate}
    rationale={planPeriodRationale}      // computed from derivePeriodInfo + helper text
    onAdjust={() => setShowAdjustModal(true)}
  />
)}
{showAdjustModal && (
  <PlanPeriodAdjustModal
    initialPlanStart={planStartDate}
    initialPlanEnd={planEndDate}
    initialYear1End={year1EndDate}
    fiscalYearStart={fiscalYearStart}
    onClose={() => setShowAdjustModal(false)}
    onSave={(p) => {
      setPlanStartDate(p.planStartDate)
      setPlanEndDate(p.planEndDate)
      setYear1EndDate(p.year1EndDate)
      markDirty()
      setShowAdjustModal(false)
    }}
    onResetToSuggestion={() => {
      const s = suggestPlanPeriod(new Date(), fiscalYearStart)
      setPlanStartDate(s.planStartDate)
      setPlanEndDate(s.planEndDate)
      setYear1EndDate(s.year1EndDate)
      markDirty()
      setShowAdjustModal(false)
    }}
  />
)}
```

### Example 3: Test for coach/owner equivalence

```typescript
// src/__tests__/goals/plan-period-coach-owner-equivalence.test.ts (Wave 3)
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useStrategicPlanning } from '@/app/goals/hooks/useStrategicPlanning'

// Mock Supabase client + FinancialService.loadFinancialGoals to return a saved plan
vi.mock('@/app/goals/services/financial-service', () => ({
  FinancialService: {
    loadFinancialGoals: vi.fn().mockResolvedValue({
      financialData: { revenue: { current: 0, year1: 100000, year2: 0, year3: 0 }, /* ... */ },
      coreMetrics: null,
      yearType: 'FY',
      quarterlyTargets: {},
      extendedPeriod: { isExtendedPeriod: true, year1Months: 14, currentYearRemainingMonths: 2 },
      planPeriod: { planStartDate: '2026-04-01', planEndDate: '2029-06-30', year1EndDate: '2027-06-30' },
    }),
  },
}))

describe('Plan period: coach view equals owner view', () => {
  it('renders identical period when same DB row is loaded as owner and as coach', async () => {
    // Render twice — once with overrideBusinessId (coach), once without (owner)
    const { result: ownerHook } = renderHook(() => useStrategicPlanning(undefined))
    const { result: coachHook } = renderHook(() => useStrategicPlanning('businesses-uuid'))

    await waitFor(() => {
      expect(ownerHook.current.isLoading).toBe(false)
      expect(coachHook.current.isLoading).toBe(false)
    })

    expect(coachHook.current.isExtendedPeriod).toBe(ownerHook.current.isExtendedPeriod)
    expect(coachHook.current.year1Months).toBe(ownerHook.current.year1Months)
    // Both should be the persisted 14-month period
    expect(ownerHook.current.year1Months).toBe(14)
  })
})
```

---

## State of the Art

| Old Approach (Phase 14) | Phase 42 Approach | Why Changed |
|------------------------|------------------|-------------|
| `isExtendedPeriod` inferred at runtime via `isNearYearEnd(today, fiscalYearStart)` | Persisted as derived from `(year1_end_date - plan_start_date) > 365 days` | Eliminates "today-dependent plan shape"; matches Anaplan/Adaptive/Planful patterns |
| `is_extended_period` BOOL stored alongside `year1_months` INT | Only dates persisted; flag derived from dates | DRY — flag and dates can disagree if updated independently |
| Detection runs only at first load (`!loadedFinancialData` branch) | Suggestion runs only at plan creation; otherwise read from DB | Coaches viewing existing plans always see persisted shape; no surprises |
| Coach view excluded by `ownerUser === user.id` | Both views identical | Surfaced 2026-04-24 in Fit2Shine session — the bug Phase 42 directly fixes |
| Year labels use `new Date()` inside `getYearLabel` | Year labels read `planStartDate` / `year1EndDate` | Same plan loaded in March vs August now shows the same labels |

**Deprecated in this phase (kept for one release):**
- `is_extended_period` column — read by FinancialService load path; written by save path. Not removed until cleanup phase per ROADMAP.
- `year1_months` column — same.
- `current_year_remaining_months` column — same.

---

## Runtime State Inventory

> Phase 42 is mostly a refactor of an existing feature. Apply the rename/refactor lens.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `business_financial_goals` rows for existing clients (5 CFO clients + Fit2Shine + Just Digital Signage + ~handful of demo) — all have non-null `is_extended_period` / `year1_months` / `current_year_remaining_months` from Phase 14. | Migration backfill (Wave 1) — see "Backfill semantics". |
| Live service config | None — Goals Wizard data lives entirely in DB; no n8n / external config. | None. |
| OS-registered state | None — nothing registers cron/scheduled tasks against plan periods. | None. |
| Secrets/env vars | None — no plan-period env vars. | None. |
| Build artifacts | None — no compiled binaries embed plan-period semantics. TypeScript types regenerate from source on `tsc --noEmit`. | None. Run `tsc --noEmit` after Wave 2 to confirm types are consistent. |

**Verified:** `grep -rn "is_extended_period\|year1_months\|current_year_remaining_months" src/` (excluded node_modules / .claude / worktrees) returns only the goals wizard surface (10 files). No other consumers; no analytics dashboards read these. [VERIFIED: see file list in research session]

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI | Migration creation + preview branch validation | ✓ | 2.92.1 (devDep) | — |
| Postgres `make_date()` + `INTERVAL` | Backfill SQL | ✓ | Postgres 15+ on Supabase | — |
| Vitest | Test execution | ✓ | 4.1.4 | — |
| @testing-library/react | Component test rendering | ✓ | 16.3.2 | — |
| jsdom | Vitest DOM environment | ✓ | 29.0.2 | — |
| GitHub PR + Supabase Branching | Schema preview gate | ✓ | per CONTRIBUTING.md | None — phase ROADMAP requires PR-driven schema (Pitfall: do NOT push directly to main) |

No missing dependencies. No fallbacks needed.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 (jsdom env) |
| Config file | [vitest.config.ts](vitest.config.ts) |
| Quick run command | `npm run test -- <path-pattern>` (vitest filter) |
| Full suite command | `npx vitest run` (used by GitHub Actions per supabase-preview.yml:50) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-42-01 | Migration adds 3 columns + backfills extended rows correctly | Manual / preview branch | `psql` query against preview DB after migration applied | ❌ Wave 0 (no test framework for SQL; verify manually per migration's verification SQL block) |
| REQ-42-02 | `suggestPlanPeriod()` returns correct dates for near-year-end and standard cases | Unit | `npx vitest run src/__tests__/goals/suggest-plan-period.test.ts` | ❌ Wave 3 |
| REQ-42-02 | `derivePeriodInfo()` correctly classifies 12-mo vs 14-mo plans | Unit | `npx vitest run src/__tests__/goals/derive-period-info.test.ts` | ❌ Wave 3 |
| REQ-42-03 | Banner renders with date range when `planStartDate` is set | Component | `npx vitest run src/__tests__/goals/plan-period-banner.test.tsx` | ❌ Wave 3 |
| REQ-42-03 | [Adjust] modal opens, edits dates, saves, dismisses | Component | same file | ❌ Wave 3 |
| REQ-42-04 | `getYearLabel` reads from `planPeriod` props, not `new Date()` | Unit | `npx vitest run src/__tests__/goals/get-year-label.test.ts` | ❌ Wave 3 |
| REQ-42-05 | `isExtendedPeriod` derives correctly from `year1EndDate - planStartDate` | Unit | covered by `derive-period-info.test.ts` | ❌ Wave 3 |
| REQ-42-06 | Coach view and owner view return identical period state for same row | Integration | `npx vitest run src/__tests__/goals/plan-period-coach-owner-equivalence.test.ts` | ❌ Wave 3 |
| REQ-42-07 | Plan period persists across hook unmount/remount | Integration | `npx vitest run src/__tests__/goals/plan-period-persistence.test.ts` | ❌ Wave 3 |
| Migration round-trip | Save → reload returns identical dates | Manual | `npm run dev` + smoke test on Vercel preview | Manual gate |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit && npx vitest run src/__tests__/goals/` (≤5s for goals tests once written)
- **Per wave merge:** `npx vitest run` (full vitest suite; <30s based on existing test count)
- **Phase gate:** `npm run verify` (= build + lint + smoke-test) green AND preview branch backfill verification SQL run manually before /gsd-verify-work

### Wave 0 Gaps
- [ ] `src/__tests__/goals/` directory does not exist — needs creation
- [ ] No existing fixture for a fully-loaded `useStrategicPlanning` mock — Wave 3 task should create one (mock `FinancialService` + `StrategicPlanningService`)
- [ ] Manual SQL verification protocol for backfill — document in Wave 1 task as a checklist

---

## Open Questions

1. **Should `[Adjust]` allow shrinking Year 1 below 12 months?**
   - What we know: ROADMAP requirement says "user confirms or adjusts before save" — no explicit bound mentioned. Phase 14 hardcoded the range as 13-15 months for the auto-detection path.
   - What's unclear: Whether a user can intentionally create a 6-month or 18-month Year 1 via the modal.
   - Recommendation: Clamp `year1Months` to [12, 15] in v1; document any out-of-range as future work. Anaplan supports arbitrary ranges, but our Step 4/5 UI assumes Year 1 is "12 plus a CR remainder" — outside [12, 15] would need broader UI changes.

2. **What happens when a coach opens the wizard for a client that has a Phase 14 row but the migration hasn't been applied (preview branch only)?**
   - What we know: Migration is applied per-PR via Supabase Branching. Production migration runs on merge.
   - What's unclear: If a coach pulls a feature branch and runs locally without applying the migration, the load path will hit the "legacy row without dates" fallback in Pattern 3.
   - Recommendation: The fallback handles this (re-suggests from yearType + today). It's UX-acceptable. Document in Wave 1 task that local dev requires applying the migration.

3. **Is `currentYearRemainingMonths` still meaningful as a derived value?**
   - What we know: Phase 14's Step 4 uses it to label the `current_remainder` column header. `derivePeriodInfo` keeps the field.
   - What's unclear: Whether the value should be re-derived as "months from `planStartDate` to start of next FY" (= year1Months - 12) — which is what `derivePeriodInfo` does — or as "months from today to end of current FY" (the original Phase 14 intent).
   - Recommendation: Use `year1Months - 12` (the persisted-date derivation). For a 14-month plan, this gives `currentYearRemainingMonths = 2`, which matches Phase 14's column-label expectation. The original "today-to-end" semantic was a runtime-inference artifact and shouldn't survive Phase 42.

4. **Does the One Page Plan / Plan Snapshot service need updating?**
   - What we know: [/one-page-plan/services/plan-data-assembler.ts:357-636](src/app/one-page-plan/services/plan-data-assembler.ts#L357-L636) reads `revenue_year1`, `gross_profit_year1`, etc. from `business_financial_goals`. It does NOT read `is_extended_period` or any plan-period field [VERIFIED: grep result above shows no matches in src/app/one-page-plan].
   - What's unclear: Whether the snapshot should embed plan period dates for historical fidelity.
   - Recommendation: Out of scope for Phase 42. The dollar values are unchanged; only the labels for those values change. If desired, add `plan_start_date` to the snapshot schema in a follow-up phase.

---

## Sources

### Primary (HIGH confidence)
- [src/app/goals/hooks/useStrategicPlanning.ts](src/app/goals/hooks/useStrategicPlanning.ts) — full read of detection block (lines 744-771), save logic (380-541), load sequence (543-909), return value (1059-1128)
- [src/app/goals/services/financial-service.ts](src/app/goals/services/financial-service.ts) — full read; saveFinancialGoals + loadFinancialGoals signatures
- [src/app/api/goals/save/route.ts](src/app/api/goals/save/route.ts) — full read; CONFIRMED extended period fields are NOT persisted (line 96 destructure)
- [src/app/api/goals/resolve-business/route.ts](src/app/api/goals/resolve-business/route.ts) — full read; returns fiscalYearStart correctly
- [src/lib/utils/fiscal-year-utils.ts](src/lib/utils/fiscal-year-utils.ts) — full read; `isNearYearEnd`, `getMonthsUntilYearEnd`, `getFiscalYearStartDate`, `getFiscalYearEndDate`, `getFiscalYear`, `DEFAULT_YEAR_START_MONTH=7` all confirmed
- [src/app/goals/utils/quarters.ts](src/app/goals/utils/quarters.ts) — full read; `determinePlanYear` confirmed to hardcode FY (Phase 14 anti-pattern still present, not in Phase 42 scope)
- [src/app/goals/types.ts](src/app/goals/types.ts) — full read; `ExtendedPeriodInfo` interface, `QuarterType = 'Q1'|'Q2'|'Q3'|'Q4'|'CR'`
- [src/app/goals/components/Step1GoalsAndKPIs.tsx](src/app/goals/components/Step1GoalsAndKPIs.tsx) — read; `extendedPeriodInfo` prop wiring
- [src/app/goals/components/step1/FinancialGoalsSection.tsx](src/app/goals/components/step1/FinancialGoalsSection.tsx) — full read; getYearLabel callsites
- [src/app/goals/components/step1/types.ts](src/app/goals/components/step1/types.ts) — full read; current `getYearLabel` signature
- [src/app/goals/components/Step4AnnualPlan.tsx](src/app/goals/components/Step4AnnualPlan.tsx) — read header + `currentRemainderInfo` (lines 54-90) + status overview (1376-1430)
- [src/app/goals/components/Step5SprintPlanning.tsx](src/app/goals/components/Step5SprintPlanning.tsx) — read header + sprint bridge (lines 100-115, 754-783)
- [src/app/coach/clients/\[id\]/goals/page.tsx](src/app/coach/clients/[id]/goals/page.tsx) — read; CONFIRMED missing `extendedPeriodInfo` prop on Step 1 (lines 740-749)
- [supabase/migrations/00000000000000_baseline_schema.sql](supabase/migrations/00000000000000_baseline_schema.sql) — `business_financial_goals` table at line 1720-1780 (confirmed columns include `is_extended_period`, `year1_months`, `current_year_remaining_months`); `strategic_initiatives` at 4644-4685 (no quarter_assigned='CR')
- [.planning/phases/14-goals-wizard-first-time-extended-period/14-RESEARCH.md](.planning/phases/14-goals-wizard-first-time-extended-period/14-RESEARCH.md) — full Phase 14 research
- [.planning/phases/14-goals-wizard-first-time-extended-period/14-01-SUMMARY.md](.planning/phases/14-goals-wizard-first-time-extended-period/14-01-SUMMARY.md), [14-02-SUMMARY.md](.planning/phases/14-goals-wizard-first-time-extended-period/14-02-SUMMARY.md), [14-03-SUMMARY.md](.planning/phases/14-goals-wizard-first-time-extended-period/14-03-SUMMARY.md) — Phase 14 implementation notes
- [.planning/ROADMAP.md](.planning/ROADMAP.md) — Phase 42 entry (lines 685-712) and Phase 14 history
- [vitest.config.ts](vitest.config.ts), [package.json](package.json) — test framework verified
- [.github/workflows/supabase-preview.yml](.github/workflows/supabase-preview.yml) — migration filename regex
- [CONTRIBUTING.md](CONTRIBUTING.md) — Supabase Branching workflow
- Project memory `project_branching.md` — Branching context

### Secondary (MEDIUM confidence)
- Verified by grep: `is_extended_period` / `year1_months` / `current_year_remaining_months` appear ONLY in goals surface files — no downstream consumers (no API routes, no forecast wizard, no one-page-plan reads them). [VERIFIED: full repo grep]
- Verified by grep: `extendedPeriod` is not consumed in `quarterly-review/services/strategic-sync-service.ts` despite that file extending the StepType union to include `'current_remainder'`. [VERIFIED: grep returned no matches for extendedPeriod in that file]

### Tertiary (LOW confidence)
- The "always 3 years out" assumption in `suggestPlanPeriod` uses `getFiscalYearEndDate(currentFY + 3)` for `planEndDate`. ROADMAP says "3-year horizon" — confidence MEDIUM that this matches the user expectation, since Phase 14 / Phase 15 also use 3-year arithmetic. Open Question 1 documents the boundary case.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `updated_at` is a sufficient proxy for "the date the wizard was last run" in the backfill | Pattern 1 | Could yield off-by-one fiscal years for rows saved on July 1 boundary. Verification SQL post-migration catches this; small impact since users overwrite on next save. |
| A2 | `year1Months` should be clamped to [12, 15] in the Adjust modal | Open Question 1 | If business needs longer Year 1 (e.g., starting fresh in Q3 of an unusual fiscal year), this restricts valid use cases. Acceptable — can be relaxed in a follow-up phase. |
| A3 | The 500ms `setTimeout` for `setIsLoadComplete(true)` is sufficient time for Step 1 banner to render before auto-save fires | Pitfall 4 | If render is slow (large initiative list), banner might not be visible before the 2.5s auto-save mark. Test by loading a large dataset and watching the network tab. |
| A4 | Existing Phase 14 tests do not exist (so "existing tests pass" requirement is vacuous) | Validation Architecture | Verified — `grep -rn "isExtendedPeriod" src/__tests__` returns no matches. ROADMAP requirement "Existing Phase 14 tests pass" is satisfied trivially. |
| A5 | Removing `ownerUser === user.id` does not require additional access-control work because `/api/goals/resolve-business` already gates access via business_users / assigned_coach_id | Pattern 7 | If the API access check has gaps not visible in this research, removing the guard might expose data. Audit the resolve-business access logic confirms 4-way check (owner / coach / member / super_admin) at lines 45-66. Confidence: HIGH this is safe. |
| A6 | All existing `business_financial_goals` rows in production have non-null `revenue_year1` (so backfill covers them) | Pattern 1, Pitfall 6 | If a row was created via signup and never had numbers entered, backfill skips it. Pattern 3's "legacy row" branch handles it (re-suggests from today). Acceptable. |
| A7 | The Phase 14 detection-block bug (silent coach exclusion) has not been silently re-introduced by another PR since 2026-04-07 | Hook Refactor | grep confirms line 759's guard is still there. Phase 42 explicitly removes it; if a future PR re-introduces it, that's a regression caught by the new coach/owner equivalence test. |

**If this table is empty:** It isn't — A1-A7 are all assumptions that should be confirmed during implementation. None block planning, but each is a verification target for the planner's tasks.

---

## Sequencing — Recommended Wave Structure

### Wave 1: Foundation (parallel-safe within wave; gated by [BLOCKING] schema push)

| Task | File | Notes |
|------|------|-------|
| W1-T1 | `supabase/migrations/YYYYMMDDHHMMSS_plan_period_columns.sql` | NEW migration with backfill |
| W1-T2 **[BLOCKING]** | Schema push to preview branch via PR | Cannot proceed to W2 until preview branch shows the columns exist + backfill verified |
| W1-T3 | `src/app/goals/utils/suggest-plan-period.ts` | NEW pure helper |
| W1-T4 | `src/app/goals/utils/derive-period-info.ts` | NEW pure helper |
| W1-T5 | `src/app/goals/services/financial-service.ts` | Add `planPeriod` to save + load (additive) |
| W1-T6 | `src/app/api/goals/save/route.ts` | Add `extendedPeriod` (bug fix) AND `planPeriod` to financialPayload |

W1-T3 through W1-T6 can run in parallel after W1-T1 lands. W1-T2 (push) is the [BLOCKING] gate before Wave 2.

### Wave 2: Hook + UI

| Task | File | Notes |
|------|------|-------|
| W2-T1 | `src/app/goals/hooks/useStrategicPlanning.ts` | Replace lines 744-771 with date-driven logic; remove role guard at 759; add `planStartDate`/`planEndDate`/`year1EndDate` state; expose in return |
| W2-T2 | `src/app/goals/components/PlanPeriodBanner.tsx` | NEW |
| W2-T3 | `src/app/goals/components/PlanPeriodAdjustModal.tsx` | NEW |
| W2-T4 | `src/app/goals/components/Step1GoalsAndKPIs.tsx` | Render banner + modal |
| W2-T5 | `src/app/goals/components/step1/types.ts` | Refactor `getYearLabel` to read `planPeriod` |
| W2-T6 | `src/app/goals/components/step1/FinancialGoalsSection.tsx` | Pass `planPeriod` to `getYearLabel` |
| W2-T7 | `src/app/goals/page.tsx` + `src/app/coach/clients/[id]/goals/page.tsx` | Pass `planPeriod` and `extendedPeriodInfo` to Step1GoalsAndKPIs (fixes coach goals page bug) |

W2-T2 and W2-T3 can run in parallel. W2-T1 must land before W2-T4. W2-T5 must land before W2-T6. W2-T7 is the cleanup for the coach-goals-page bug discovered during research.

### Wave 3: Tests + Verification

| Task | File | Notes |
|------|------|-------|
| W3-T1 | `src/__tests__/goals/suggest-plan-period.test.ts` | NEW; covers near-year-end + standard cases for both FY and CY |
| W3-T2 | `src/__tests__/goals/derive-period-info.test.ts` | NEW; covers extended boundary (366 days), 14-mo, 12-mo, leap year |
| W3-T3 | `src/__tests__/goals/plan-period-banner.test.tsx` | NEW; renders banner, opens modal, edits, saves |
| W3-T4 | `src/__tests__/goals/plan-period-coach-owner-equivalence.test.ts` | NEW; the critical regression test for the `ownerUser === user.id` removal |
| W3-T5 | `src/__tests__/goals/plan-period-persistence.test.ts` | NEW; mock load/save round-trip |
| W3-T6 **[human verify]** | Manual smoke test on Vercel preview: open Fit2Shine wizard as coach; verify banner shows "Apr 2026 → Jun 2029 · 14 months"; verify Adjust modal works; verify Year 1/2/3 labels match | The original 2026-04-24 incident reproduction |

Wave 3 tasks are independent and can all run in parallel. Wave 3 is purely additive — no production code changes after Wave 2 lands.

---

## Metadata

**Confidence breakdown:**
- Migration design: HIGH — all column types verified against baseline schema; backfill logic is straightforward Postgres
- Hook refactor pattern: HIGH — full read of useStrategicPlanning.ts; precise replacement target identified
- Banner UX: MEDIUM — placement and modal contract clear; visual specifics ("Apr 2026 → Jun 2029 · Year 1 is 14 months · [Adjust]") match ROADMAP requirement; exact styling left to plan author
- Coach/owner equivalence: HIGH — full audit of branching logic completed; only one guard removal needed
- Three discovered bugs (api/goals/save bug, coach Step 1 missing prop, no existing tests): HIGH — verified by direct file reads + grep
- Test coverage strategy: HIGH — vitest stack confirmed; existing patterns in src/__tests__/services/opex-classifier.test.ts followed

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (stable codebase, 30-day window — Goals Wizard surface is mature)
