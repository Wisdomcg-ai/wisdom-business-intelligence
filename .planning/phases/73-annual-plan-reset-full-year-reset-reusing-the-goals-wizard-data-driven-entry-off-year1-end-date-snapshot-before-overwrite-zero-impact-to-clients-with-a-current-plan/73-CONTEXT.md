# Phase 73: Annual Plan Reset (full-year reset) — Context

**Gathered:** 2026-06-12
**Status:** Ready for planning
**Source:** PRD Express Path (`.planning/codebase/ANNUAL-RESET-DESIGN.md` — the locked design)

<domain>
## Phase Boundary

When a client's plan year has ended, they need to set a fresh annual plan for the new year
(e.g. FY27): annual goals + quarterly targets + initiatives. This phase delivers that "full-year
reset" by **reusing the existing Goals & Targets wizard (`/goals`)** as the planning engine —
NOT by maintaining the quarterly-review module's separate annual steps.

**Delivers:**
1. A history **snapshot** of the ending year's full plan before any overwrite.
2. A **rollover** action that shifts the 3-year ladder + plan dates forward and routes the
   client into the `/goals` wizard to confirm/adjust and set Q1–Q4 targets + initiatives.
3. A **data-driven entry** point that detects (off `business_financial_goals.year1_end_date`)
   whether a client needs a reset vs a normal quarterly review vs initial setup.
4. **Retirement** of the quarterly-review module's bolted-on annual steps + the Q4-gated button.

**Out of scope:** reflection / year-in-review / vision & values steps (D1); embedding goals
steps inside the review (D2); Xero scorecard actuals (separate, deferred).
</domain>

<decisions>
## Implementation Decisions (ALL LOCKED — do not re-litigate)

### Model
- Annual reset = **the Goals & Targets wizard, nothing bolted on**. Lean: detect → snapshot →
  goals wizard (rollover mode).
- Reset is **per-client**, anchored to when their own plan year ends (`year1_end_date`) — NOT
  the calendar. This makes the 1 July boundary irrelevant.

### D1 — Goals wizard ONLY
- No reflection, no year-in-review, no vision & values steps in the reset. The goals wizard's
  current-vs-Year1/2/3 structure is the plan.

### D2 — Route into `/goals` (no embed)
- After snapshot + rollover, route the client INTO the existing `/goals` wizard (the flow they
  already know). Do not rebuild goals steps inside the review workshop.

### D3 — Prepopulate from prior Year 2
- New Year 1 = the new FY, **prepopulated from the prior plan's Year 2**; Year 2 = prior Year 3;
  Year 3 = blank/extrapolated. `*_current` baseline set from the prior plan's Year 1 figures.

### Entry logic (data-driven)
For the quarter being planned (its start date), read the client's `business_financial_goals`
plan dates:
- **No goals row / no plan dates** → "Set up your Annual Plan" (initial; nothing to snapshot).
- **planningQuarter start > `year1_end_date`** (Year 1 ended; plan no longer covers the new
  quarter) → "Set your {FY} Annual Plan" (the RESET).
- **planningQuarter within current Year 1** → normal "Start your Q{n} Review" (quarterly review
  inside the existing plan); optional secondary "Adjust annual plan" link.
- Available to **client AND coach**.

### Quarterly targets on reset
- Follow the **same pattern the goals wizard already uses** (`Step4AnnualPlan` — manual
  per-quarter with even-split-from-annual). Reuse the wizard's editor/defaults; invent nothing.

### Initiatives on reset
- **Carry incomplete initiatives forward** as candidates (client keeps/drops). Not wiped, not
  auto-committed.

### History snapshot
- Before any overwrite, capture the full ending-year plan (financial ladder + `quarterly_targets`
  + KPIs + initiatives) as a point-in-time record. **Reuse `plan_snapshots`** + `planSnapshotService`
  (tag e.g. `annual_reset_<endingFY>`). Year-over-year comparison must be recoverable.

### Plan-date rollover
- `plan_start_date` = new FY start, `year1_end_date` = new FY end, `plan_end_date` = +3 years.
  Honour Phase-42 explicit plan-period dates and Phase-14 extended-period semantics.

### Retire
- Remove from the flow: `NextYearTargetsStep`, `AnnualInitiativePlanStep`, `YearInReviewStep`,
  `VisionStrategyStep`, and the Q4-gated "Start Annual Review" button. Keep the
  `quarterly_reviews` annual jsonb columns (historical data) — just stop routing into the steps.

### CRITICAL CONSTRAINT (Matt's #1 requirement)
**ZERO impact to current clients' data or usage.**
- Snapshot BEFORE any overwrite; the reset must be **fully reversible** from the snapshot.
- **No behaviour change** for clients with a current valid plan — clients already on the new FY
  (verified: **Armstrong & Co** and **Fit2Shine** have `year1_end_date` = 29 Jun 2027) must NEVER
  be prompted to reset or have their data mutated.
- The entry detection must be read-only and side-effect-free until the client explicitly starts a
  reset.

### Claude's Discretion
- Exact placement of the entry prompt (quarterly-review landing is the anchor; dashboard/goals
  surface optional).
- Whether the rollover writes happen in a service vs the goals hook; transactional boundaries.
- How `/goals` is signalled to be in "rollover mode" (query param vs state).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The locked design (authoritative)
- `.planning/codebase/ANNUAL-RESET-DESIGN.md` — full design + locked decisions D1–D3 + build order.

### Goals & Targets flow (the reuse target — source of truth)
- `src/app/goals/page.tsx` — the 5-step wizard (3yr Goals & KPIs → Ideas → Prioritise → Annual
  Plan → Sprint), client-facing.
- `src/app/goals/components/Step1GoalsAndKPIs.tsx` — 3-year ladder + KPIs + year_type + plan period.
- `src/app/goals/components/Step4AnnualPlan.tsx` — quarterly-targets editor (REUSE this pattern).
- `src/app/goals/services/financial-service.ts` — save/load `business_financial_goals` (ladder,
  `quarterly_targets`, plan dates `plan_start_date`/`plan_end_date`/`year1_end_date`).
- `src/app/goals/services/kpi-service.ts`, `src/app/goals/services/strategic-planning-service.ts`.
- `src/app/goals/hooks/useStrategicPlanning.ts` — orchestrates save of goals + KPIs + initiatives.
- `src/app/goals/utils/quarters.ts`, `src/app/goals/utils/formatting.ts`.

### Snapshot
- `plan_snapshots` table + `planSnapshotService` (already used by one-page-plan / quarterly review).

### Quarterly-review annual path to RETIRE
- `src/app/quarterly-review/components/steps/{NextYearTargetsStep,AnnualInitiativePlanStep,YearInReviewStep,VisionStrategyStep}.tsx`
- `src/app/quarterly-review/page.tsx` — the `isQ4`-gated "Start Annual Review" button.
- `src/app/quarterly-review/services/strategic-sync-service.ts` `syncAnnualReview` (lines ~531-688).

### Data signal (verified in prod)
- `business_financial_goals.year1_end_date`: 10 active clients end 30 Jun 2026 (FY26 → need
  reset); Armstrong + Fit2Shine end 29 Jun 2027 (already FY27 → MUST NOT be touched); Oh Nine is
  CY (ends 31 Dec 2026); JVJ has no plan dates (initial setup).
</canonical_refs>

<specifics>
## Specific Ideas
- Baseline: the quarterly re-anchoring already shipped (PR #287) — review is anchored to the
  quarter being planned; helpers `getPlanningQuarter`/`getPreviousQuarterOf`/`getNextQuarterOf`
  exist in `src/app/quarterly-review/types`.
- Verify rollover math with unit tests at the FY boundary (FY and CY); verify entry detection for
  all three states (needs-reset / already-planned / no-plan) including Armstrong + Fit2Shine.
- Snapshot integrity test: FY26 plan fully recoverable after a reset.
- A dry-run with Matt on a test client (needs-reset AND already-planned) before any real session.
</specifics>

<deferred>
## Deferred Ideas
- Reflection / year-in-review / vision & values in the reset (D1 — out).
- Embedding goals steps in the review workshop (D2 — out).
- Xero scorecard actuals (separate, deferred).
</deferred>

---

## CORRECTION (2026-06-13, from the Precision dry-run)
The original plan/services assumed `business_kpis` + `strategic_initiatives` were keyed on
**businesses.id**. That was WRONG. Verified in prod: both are 100% keyed on
**business_profiles.id** (`business_kpis` 55/55, `strategic_initiatives` 448/448; 0 by
businesses.id — and `strategic_initiatives` is FK-constrained to `business_profiles`). The
snapshot + rollover services now read/query these by `businessId` (profile id); the
`businessesId` param was removed. Same dual-ID class as PR #287's KPI fix.

*Phase: 73-annual-plan-reset*
*Context gathered: 2026-06-12 via PRD Express Path from ANNUAL-RESET-DESIGN.md*
