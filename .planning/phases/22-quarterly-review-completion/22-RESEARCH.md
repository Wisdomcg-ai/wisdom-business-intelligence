# Phase 22: Quarterly Review Completion — Research

**Researched:** 2026-04-07
**Domain:** Quarterly review workshop facilitation, strategic initiative progress tracking, review completion flow
**Confidence:** HIGH

## Summary

The quarterly review workshop is a substantially complete 19-step facilitation tool. The core infrastructure — step navigation, auto-save, `completeWorkshop` flow, snapshot creation, and `StrategicSyncService` — is all working. Phase 15 delivered the foundational `InitiativeStatus` extension (`deferred` | `planned`) and `syncAnnualReview` wiring. What is genuinely missing is a narrow set of connection problems: initiative status decisions made during the workshop do not write `deferred` or `planned` back to the DB in a meaningful way for quarterly (non-annual) reviews, there is no progress view showing annual-plan completion % against strategic initiatives for the coach during the workshop, and the `InitiativesReviewStep` (step 4.2, old component) uses `user_id` instead of `business_id` to query initiatives — creating a data-loading bug.

**Primary recommendation:** Fix the three missing pieces: (1) initiative status write-back for quarterly reviews at `completeWorkshop`, (2) a progress view within step 4.1 (ConfidenceRealignmentStep) or as a standalone panel showing initiative completion rates, and (3) the `user_id` → dual-ID fix in `InitiativesReviewStep`. Do not redesign the workshop structure.

---

## Current Workshop Architecture (HIGH confidence — code-verified)

### Step Map
| Step ID | Label | Component |
|---------|-------|-----------|
| prework | Pre-Work Questionnaire | PreWorkStep |
| 1.1 | Pre-Work Review | PreWorkReviewStep |
| 1.2 | Scorecard Review | ScorecardReviewStep |
| 1.3 | Rocks Accountability | RocksReviewStep |
| 1.4 | Action Replay | ActionReplayStep |
| 2.1 | Feedback Loop Framework | FeedbackLoopStep |
| 2.2 | Open Loops Audit | OpenLoopsStep |
| 2.3 | Issues List (IDS) | IssuesListStep |
| 2.4 | Customer Pulse | CustomerPulseStep |
| 2.5 | People Review | PeopleReviewStep |
| 3.1 | Assessment & Roadmap | AssessmentRoadmapStep |
| 3.2 | SWOT Update | SwotUpdateStep |
| 4.1 | Annual Plan & Confidence | ConfidenceRealignmentStep |
| 4.2 | Quarterly Plan | QuarterlyPlanStep (wraps InitiativeReviewStep + targets) |
| 4.3 | Sprint Planning | QuarterlyRocksStep |
| complete | Review Complete | WorkshopCompleteStep |

Annual reviews add `A4.1`–`A4.4` between `3.2` and `4.1`.

### completeWorkshop Flow (code-verified)
```
completeWorkshop():
  1. Flush pending auto-save
  2. PRE-SYNC SNAPSHOT → plan_snapshots table (assemblePlanData)
  3. strategicSyncService.syncAll() → updates initiative status/notes, quarterly targets, rocks, sprint data, new initiatives
  4. If annual review → strategicSyncService.syncAnnualReview() → rolls financial targets, syncs next-year initiatives with fiscal_year stamp
  5. POST-SYNC SNAPSHOT → plan_snapshots table
  6. quarterlyReviewService.completeWorkshop() → marks status='completed', creates quarterly_snapshots, saves kpi_actuals
```

### StrategicSyncService.syncAll() writes (code-verified)
- `syncInitiativeChanges`: UPDATE-only on existing `strategic_initiatives` rows — writes `status` + `notes`
- `syncQuarterlyTargets`: writes to `business_financial_goals.quarterly_targets` JSONB
- `syncRealignedTargets`: if user chose `adjust_targets`, writes `revenue_year1`/`gross_profit_year1`/`net_profit_year1`
- `syncSprintPlanningToQuarter`: writes `assigned_to`, `why`, `outcome`, `tasks`, `milestones` to matching initiative rows
- `syncRocks`: UPSERT rocks → `strategic_initiatives` with `step_type = nextQuarterKey`
- `syncNewInitiatives`: INSERT newly-created initiatives via `StrategicPlanningService.saveInitiatives()`

---

## Gap Analysis: What Is Missing (HIGH confidence — code-verified)

### Gap 1: Initiative status write-back for quarterly reviews is incomplete

**What exists:** `syncInitiativeChanges` maps review decisions to DB status like this:
- `kill` → `cancelled`
- `defer` → `on_hold`
- `keep/accelerate` → `in_progress` (or `not_started`)

**What is missing:** The new `InitiativeStatus` values from Phase 15 (`deferred` | `planned`) are not used by `syncInitiativeChanges`. The `on_hold` mapping for `defer` does not use the new `deferred` status. The `planned` status (for initiatives not yet started but assigned to next quarter) is also unused in the sync path.

**Location:** `src/app/quarterly-review/services/strategic-sync-service.ts` lines 80-95 in `syncInitiativeChanges()`.

**Fix:** Map `defer` → `deferred` (not `on_hold`) and treat `not_started` + `keep`/`accelerate` → `planned` for initiatives assigned to a future quarter.

### Gap 2: No progress tracking view against annual plan during the workshop

**What exists:** Step 4.1 (`ConfidenceRealignmentStep`) loads `strategic_initiatives` and shows them in `AnnualPlanSnapshot.strategicInitiatives[]` — but only as a list of title/status/progress_percentage. There is no aggregated completion rate display (X of Y complete, by quarter, etc.).

There is also an `AnnualPlanProgressWidget` in the forecast module, but it has a `TODO` for YTD actuals and only shows financial progress (not initiative completion). The `QuarterProgressCard` on the business dashboard shows financial QTD progress only.

**What is missing:** During the review (particularly step 4.1), the coach needs to see: how many annual-plan initiatives are complete/in-progress/deferred vs total, broken down by quarter. This is the "progress tracking against annual plan" item in the phase requirements.

**Implementation path:** Extend `ConfidenceRealignmentStep` to query `strategic_initiatives` filtered by `fiscal_year = current year` and compute completion stats (same data it already loads). Alternatively, add a dedicated `AnnualProgressPanel` sub-component inside step 4.1. The `quarterly-summary` API (from Phase 17) handles financial variance; initiative progress needs a separate query.

### Gap 3: InitiativesReviewStep uses user_id not business_id (bug)

**Location:** `src/app/quarterly-review/components/steps/InitiativesReviewStep.tsx` line 53-54:
```typescript
const { data, error } = await supabase
  .from('strategic_initiatives')
  .select('*')
  .eq('user_id', targetUserId)  // BUG: should use business_id
```

**Impact:** For coaches viewing a client, `targetUserId` is the client's `ownerId`, which may or may not match `user_id` on initiative rows (depends on how they were created). The canonical dual-ID pattern requires `.in('business_id', [profileId, businessId])`. This is the same class of bug that caused Xero lookup failures.

**Note:** This component (`InitiativesReviewStep.tsx`) appears to be an older version of the same step handled by `InitiativeReviewStep.tsx` (without the 's'). Both files exist and both claim to be step 4.2. Only one is wired into `QuarterlyPlanStep`. Verify which is actually used.

### Gap 4: WorkshopCompleteStep has an initiative decisions display bug

**Location:** `src/app/quarterly-review/components/steps/WorkshopCompleteStep.tsx` line 207:
```typescript
(review.initiative_decisions as any[]).filter((d: any) => d.action === action).length
```
The field is `d.decision`, not `d.action` (confirmed from `InitiativeDecision` type and sync service). This means all four counts always show `0`.

---

## Architecture Patterns (HIGH confidence)

### Initiative Status in the DB

The `strategic_initiatives` table status column accepts:
```typescript
// From src/app/goals/types.ts (code-verified)
type InitiativeStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled' | 'on_hold' | 'deferred' | 'planned'
```

`deferred` and `planned` were added in Phase 15. There is no DB migration enforcing a CHECK constraint on these values (the extended values were added additively in TypeScript only, which is safe for Supabase's text columns). The DB column is unconstrained text — any string is accepted.

### Dual-ID Pattern (CRITICAL — from project memory)
All `strategic_initiatives` queries MUST use:
```typescript
.in('business_id', [profileBusinessId, businessId])
```
Never `.eq('user_id', userId)` for initiative lookups in coach-view contexts.

### Fiscal Year Filtering for Progress Tracking
When showing annual plan progress, filter by `fiscal_year`:
```typescript
.eq('fiscal_year', currentFiscalYear)
.in('step_type', ['q1', 'q2', 'q3', 'q4', 'twelve_month'])
```
This matches the pattern used in `AnnualInitiativePlanStep.tsx` (lines 125–137).

### Sync is UPDATE-only (never DELETE)
`syncInitiativeChanges` deliberately never deletes or creates rows — only updates `status` and `notes`. This is a deliberate safety decision to prevent accidental data loss from the Goals Wizard data. Any new status values must follow this pattern.

---

## Standard Stack (HIGH confidence — existing project patterns)

No new libraries required. Phase 22 uses only what already exists:

| Pattern | Current Usage | Phase 22 Use |
|---------|--------------|-------------|
| Supabase client | `createClient()` from `@/lib/supabase/client` | Same — initiative queries |
| useBusinessContext | `activeBusiness?.ownerId` for coach override | Same — dual-ID resolution |
| fiscal-year-utils | `getQuarterForMonth`, `generateFiscalMonthKeys` | `getCurrentFiscalYear()` for filter |
| Design tokens | `getCategoryStyle()`, brand-orange, brand-navy | Same |
| Auto-save | `updateLocalState()` + 2s debounce | Not needed — read-only display panel |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Business ID resolution | Custom lookup | `resolveBusinessIds` pattern: `.in('business_id', [profileId, businessId])` |
| Fiscal year calculation | Date math | `getCurrentFiscalYear(startMonth)` from `fiscal-year-utils.ts` |
| Quarter month mapping | Manual arrays | `getQuarterDefs(yearType, year)` from `fiscal-year-utils.ts` |
| Initiative status tracking | New table | Extend `syncInitiativeChanges` — `strategic_initiatives.status` is source of truth |

---

## Common Pitfalls

### Pitfall 1: user_id vs business_id on strategic_initiatives
**What goes wrong:** Queries using `user_id` return no results for coach-viewed clients, or return wrong business's initiatives if multiple clients share an owner.
**Why it happens:** The table has both columns; some rows were created via different code paths.
**How to avoid:** Always use `.in('business_id', [profileBusinessId, businessId])` — never `.eq('user_id', ...)` in coach-facing code.

### Pitfall 2: on_hold vs deferred status mapping
**What goes wrong:** Phase 15 added `deferred` to `InitiativeStatus` but `syncInitiativeChanges` still maps `defer` → `on_hold`. After the fix, existing `on_hold` records from past reviews will remain as `on_hold` — the new mapping only affects new reviews.
**How to avoid:** Only update the mapping for new syncs. Do not backfill old `on_hold` to `deferred`.

### Pitfall 3: Two components for step 4.2
**What goes wrong:** Both `InitiativesReviewStep.tsx` and `InitiativeReviewStep.tsx` claim to be step 4.2. Fixing the wrong one achieves nothing.
**How to avoid:** Trace the import chain: `QuarterlyPlanStep.tsx` → check which component it actually renders → fix that one. The other is likely dead code.

### Pitfall 4: fiscal_year NULL for pre-Phase-13 initiatives
**What goes wrong:** Older `strategic_initiatives` rows have `fiscal_year = NULL`. Filtering by `fiscal_year = 2026` will exclude them from progress views.
**How to avoid:** Annual plan progress query should include a `NULL` fallback: `.or('fiscal_year.eq.2026,fiscal_year.is.null')` with a current-year range filter on `created_at` as the fallback scope, or just display a count that acknowledges "includes unassigned year" rows.

### Pitfall 5: WorkshopCompleteStep shows 0 for all initiative decisions
**What goes wrong:** `d.action` should be `d.decision` in the filter. All four stat boxes show 0.
**How to avoid:** Fix the field name in the filter.

---

## Code Examples

### Correct dual-ID initiative query pattern
```typescript
// Source: verified from InitiativeReviewStep.tsx + project memory
const targetUserId = activeBusiness?.ownerId || user.id;
const { data: profileData } = await supabase
  .from('business_profiles')
  .select('id')
  .eq('user_id', targetUserId)
  .maybeSingle();
const profileId = profileData?.id || review.business_id;

const { data: initiatives } = await supabase
  .from('strategic_initiatives')
  .select('id, title, category, status, progress_percentage, fiscal_year')
  .in('business_id', [profileId, review.business_id])
  .in('status', ['not_started', 'in_progress', 'planned'])
  .in('step_type', ['q1', 'q2', 'q3', 'q4', 'twelve_month'])
  .eq('fiscal_year', currentFiscalYear);
```

### Corrected status mapping in syncInitiativeChanges
```typescript
// Source: src/app/quarterly-review/services/strategic-sync-service.ts
// Current (Phase 14):
if (decision.decision === 'kill') status = 'cancelled';
if (decision.decision === 'defer') status = 'on_hold';  // ← change to 'deferred'

// Phase 22 target:
if (decision.decision === 'kill') status = 'cancelled';
if (decision.decision === 'defer') status = 'deferred';  // uses Phase 15 value
// 'planned' applies when keep/accelerate + quarterAssigned is in a future quarter
```

### Annual initiative progress aggregation pattern
```typescript
// Compute completion stats from loaded initiatives array
const byQuarter = {
  q1: initiatives.filter(i => i.step_type === 'q1'),
  q2: initiatives.filter(i => i.step_type === 'q2'),
  q3: initiatives.filter(i => i.step_type === 'q3'),
  q4: initiatives.filter(i => i.step_type === 'q4'),
};
const completionRate = (arr: typeof initiatives) => {
  if (arr.length === 0) return null;
  return Math.round(arr.filter(i => i.status === 'completed').length / arr.length * 100);
};
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `InitiativeStatus` = `not_started\|in_progress\|completed\|cancelled\|on_hold` | Extended with `deferred\|planned` in Phase 15 | New status values available but not yet used in sync path |
| `user_id` queries on strategic_initiatives | `business_id` dual-ID pattern (required since Phase 3) | Any remaining `user_id` queries are bugs |
| syncAll without annual path | syncAll + conditional syncAnnualReview for annual reviews | Quarterly reviews still only get the basic sync |

---

## Environment Availability

Step 2.6: SKIPPED — Phase 22 is purely code changes within the existing Next.js/Supabase stack. No new external dependencies.

---

## Validation Architecture

`workflow.nyquist_validation` key is absent from `.planning/config.json` — treat as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | No automated test suite detected in repository |
| Config file | None — no jest.config.*, vitest.config.*, or pytest.ini found |
| Quick run command | Manual: run workshop in browser dev server |
| Full suite command | Manual: complete a quarterly review end-to-end |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Approach |
|-----|----------|-----------|----------|
| Progress tracking | Step 4.1 shows initiative completion % by quarter | Manual smoke | Navigate to step 4.1, verify initiative stats panel appears |
| Status updates | completeWorkshop writes `deferred` (not `on_hold`) to DB | Manual verify | Complete a review with a defer decision, check DB row |
| Completion tracking | WorkshopCompleteStep shows correct decision counts | Manual smoke | Complete review, verify keep/accelerate/defer/kill counts are non-zero |

### Wave 0 Gaps
No test framework exists. Manual verification is the only testing method for this phase.

---

## Open Questions

1. **Which initiative review component is actually wired into QuarterlyPlanStep?**
   - What we know: Both `InitiativesReviewStep.tsx` (old) and `InitiativeReviewStep.tsx` (newer) claim step 4.2
   - What's unclear: `QuarterlyPlanStep.tsx` was only read to line 80 — need to verify which is imported
   - Recommendation: Read `QuarterlyPlanStep.tsx` fully before coding to confirm the live component

2. **Should `planned` status be applied at completeWorkshop time or in the step component?**
   - What we know: `planned` logically applies to "this initiative is assigned to next quarter but hasn't started"
   - What's unclear: Whether this is best set in `syncInitiativeChanges` or earlier when the user assigns a quarter
   - Recommendation: Apply in `syncInitiativeChanges` for simplicity — keep the sync as the single write-back point

3. **Is the `AnnualPlanProgressWidget` (forecast module) intended to be the progress view, or should it be built into the quarterly review step?**
   - What we know: `AnnualPlanProgressWidget` has hardcoded `ytdRevenue: 0` TODOs for actuals and only shows financial progress (not initiatives)
   - What's unclear: Whether the phase requires this widget to be wired up OR a new initiative-focused progress panel
   - Recommendation: The phase description says "progress tracking against annual plan" — this is about initiative status tracking, not financial metrics. Build a lightweight initiative-progress panel inside step 4.1 rather than reviving the unfinished widget.

---

## Sources

### Primary (HIGH confidence)
- `src/app/quarterly-review/services/quarterly-review-service.ts` — full completeWorkshop and service layer
- `src/app/quarterly-review/services/strategic-sync-service.ts` — full sync flow including syncAnnualReview
- `src/app/quarterly-review/types/index.ts` — WorkshopStep, InitiativeDecision, AnnualPlanSnapshot interfaces
- `src/app/quarterly-review/hooks/useQuarterlyReview.ts` — completeWorkshop orchestration, sync wiring
- `src/app/quarterly-review/workshop/page.tsx` — step routing and component mapping
- `src/app/quarterly-review/components/steps/WorkshopCompleteStep.tsx` — completion view with d.action bug
- `src/app/quarterly-review/components/steps/InitiativeReviewStep.tsx` — active initiative review component
- `src/app/quarterly-review/components/steps/InitiativesReviewStep.tsx` — older component, user_id bug
- `src/app/quarterly-review/components/steps/AnnualInitiativePlanStep.tsx` — fiscal_year filtering pattern
- `src/app/quarterly-review/components/steps/ConfidenceRealignmentStep.tsx` — step 4.1, lines 1-100
- `src/app/goals/types.ts` — InitiativeStatus with deferred/planned values
- `supabase/migrations/20260407_year_type_foundation.sql` — fiscal_year column on strategic_initiatives

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — Phase 15 completion decisions, confirmed syncAnnualReview wiring
- `.planning/ROADMAP.md` — Phase 22 requirements and Phase 15 dependency confirmation

---

## Metadata

**Confidence breakdown:**
- Current workshop structure: HIGH — read all components directly
- Gap analysis: HIGH — identified from code inspection, not assumption
- Fix approach: HIGH — follows established patterns (dual-ID, fiscal-year-utils, update-only sync)
- Initiative status values: HIGH — verified from goals/types.ts

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable — no fast-moving dependencies)
