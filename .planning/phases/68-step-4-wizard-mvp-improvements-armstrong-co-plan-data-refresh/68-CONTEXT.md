# Phase 68: Step 4 wizard MVP improvements + Armstrong & Co plan-data refresh — Context

**Gathered:** 2026-05-28
**Status:** Ready for planning
**Source:** PRD Express Path — `docs/armstrong-update-and-step4-plan.md`

<domain>
## Phase Boundary

Two coordinated workstreams, one phase, no schema changes:

**Workstream A — Armstrong & Co plan-data refresh** (data only)
One-off data writes to a single tenant's plan in Supabase. Reflects the 2026-05-12 coaching session held with Luke & Alice Armstrong. Out of scope: any other tenant.

**Workstream B — Step 4 wizard MVP improvements** (code, ships for all tenants)
9 items: 3 bug-fixes (B2, B3, B15/B16) + 6 UX additions (B4, B5, B6, B7, B8 + one more). All UI-layer or additive JSONB writes. No DB migration. Methodology constraint: `MAX_PER_QUARTER = 5` stays.

**Identifiers (Armstrong):**
- `businesses.id` = `a0bf1b0a-663e-4636-8c0d-eef62972dcbc`
- `business_profiles.id` = `678ae542-7f0b-43d1-8784-e7341767c250`
- `user_id` = `f4702002-69a6-44f1-b963-ada2a95c843b`
- `swot_analyses.id` = `cb6d1358-a0ec-48b8-878c-159df6b3a576`

**Files of interest (Workstream B):**
- `src/app/goals/components/Step4AnnualPlan.tsx` (1297 lines — primary surface)
- `src/app/goals/utils/quarters.ts` (period derivation, `deriveCurrentRemainderColumn`)
- `src/app/goals/services/strategic-planning-service.ts` (already supports `step_type='current_remainder'`)
- `src/app/goals/types.ts` (`OnePagePlanData`, `StrategicInitiative`, `KPIData`)
- `src/app/one-page-plan/types.ts` (snapshot shape)

</domain>

<decisions>
## Implementation Decisions

### Workstream A — Armstrong data updates (data only)

#### A1. Dedupe `strategic_initiatives`
Currently ~65 rows for ~30 unique titles — every initiative triplicated across `step_type` values (`q1`, `twelve_month`, `strategic_ideas`). Keep one canonical row per unique title.
- **Decision**: Prefer `step_type='twelve_month'` rows as canonical (carry the active 12-month plan assignment).
- **Action**: Delete `step_type='q1'` and `step_type='strategic_ideas'` duplicates of titles that also exist as `twelve_month`. Where only `strategic_ideas` exists (e.g., books, exploratory items), keep `strategic_ideas`.
- Idempotent: re-running must not re-delete already-removed rows.

#### A2. Quarter-assign canonical initiatives
Today every `quarter_assigned`, `year_assigned`, `start_date`, `end_date` is NULL. Apply Matt's end-of-session sequencing.
- **Q1 (Jul–Sep 2026, FY27)** — pricing review, progress claims update, job profitability review, Builder Trend audit, sales-process unpack, home-warranty tracker, financial forecast
- **Q2 (Oct–Dec 2026)** — website update, testimonials (written + video), social media plan, site signage refresh, new imagery, client feedback questionnaire pilot
- **Q3 (Jan–Mar 2027)** — performance management process (GAP MAP), team-building plan, training and development plan, key checklists, document key processes, embed core values, discuss management opportunity with Pablo
- **Q4 (Apr–Jun 2027)** — leadership reading list, competitor analysis, supplier 6–12 month review cadence, stop-doing list creation, ideal-week design, time audit, 2-weeks-off goal
- Set `year_assigned = 2027`, `fiscal_year = 2027` for all.

#### A3. Add diversification ideas (13 items)
Add to `strategic_initiatives` as parking-lot ideas:
- `idea_type = 'exploratory'`, `selected = false`, `quarter_assigned = null`, `step_type = 'strategic_ideas'`, `category` = `diversification` (or closest existing category)
1. Australian Housing partnership (Jordan Ricketts)
2. NSW affordable housing builder panel
3. Strata maintenance / repair work
4. In-house electrical + plumbing
5. Insurance remediation work (flood/storm/roof)
6. Duplex defect remediation
7. School works / demountables
8. Government tenders
9. University maintenance contracts
10. Waterfront / barge + maritime partner (Class 2 licence, Evolve FM panel)
11. Prefab passive homes / kit homes
12. Pontoon innovation (Kevlar/fibreglass)
13. "Experiences" subscription business (Portelli-style)

#### A4. Update `key_roles` and `owner_info.partners`
- **Add**: Carly (Subcontract Carpenter, "first apprentice, huge part of the cocktail"), Cooper (Subcontract Carpenter), Chris (Carpenter, just started)
- **Reconcile**: Confirm Pablo == "Pubs" (open question — Matt to answer; if same, standardise to "Pablo"). Pending answer, document as same person.
- **Titles**: Pablo → "Foreman (Lockup → Finish)", Kye → "Foreman (Setup → Lockup)"
- **Annotate**: Pablo as foreman-promotion candidate, target ready Jan–Jun 2028 — store as `status` field text or `notes` JSONB key.

#### A5. Add missing KPIs to `business_kpis`
Today only "Completed Jobs" exists. Add (each as separate `business_kpis` row, `is_active=true`, `is_universal=false`):
| Name | Category | Frequency | Unit | Y1 | Y2 | Y3 |
|---|---|---|---|---|---|---|
| Revenue Invoiced | DELIVER | monthly | dollar | 7500000 | 10000000 | 12000000 |
| Gross Margin % per Job | DELIVER | per-job | percentage | 20 | 20 | 20 |
| Quote-to-Win Conversion | ATTRACT | monthly | percentage | 80 | 80 | 80 |
| Home Warranty Headroom | DELIVER | monthly | dollar | track | track | track |
| Active Jobs in Pipeline | DELIVER | monthly | number | track | track | track |
| Variations Captured & Invoiced | DELIVER | per-job | percentage | 95 | 95 | 95 |
| Client Feedback Score | DELIVER | per-job | number | 9 | 9 | 9 |
| Luke Hours on Tools per Week | LEAD | monthly | number | 20 | 5 | 0 |

#### A6. Fix `owner_hours_per_week` in `business_financial_goals`
- `owner_hours_per_week_current` = 50 (Luke today)
- `owner_hours_per_week_year1` = 40
- `owner_hours_per_week_year2` = 25
- `owner_hours_per_week_year3` = 10
- Also fix `owner_info.desired_hours` (Luke `0` → `10`; data-entry bug)

#### A7. Refine core values in `strategy_data.vision_mission.core_values`
Convert from 5 buzzwords ("Happy and Fun", "Learning and Teaching", "Hardworking", "Open and Transparent", "Collaborate and problem solve") to "we" behaviour statements, and add:
- "We build long-term relationships, not transactions"
- "We do the right thing when no one's watching"
- "No dickheads"
- "We are welcoming and collaborative on site"

#### A8. Polish mission in `strategy_data.vision_mission.mission_statement`
Replace with final session wording:
> "We take someone's dream that has been sketched on paper and turn it into reality, focusing on the details, overcoming the unforeseen challenges, and constantly ensuring we align with their desires, while coupling this with an amazing client experience."

#### A9. SWOT touch-ups in `swot_items` (analysis_id `cb6d1358-a0ec-48b8-878c-159df6b3a576`)
- Annotate "Flexible & adaptable" duplicate as both strength AND weakness with description
- **Add strength**: "Operational delivery — Marrickville 7 weeks ahead of schedule with wet weather"
- **Add threat**: "Trade cost inflation pushing jobs out of client budget (e.g., $175k → $200k)"
- **Update threat (home warranty)** description: "Current cap $5M; $2.2M tied at Clavellie, $700k Marrickville; zero claims history (advantage when negotiating cap increase)"

#### A10. `plan_snapshots` baseline
After A1–A9 applied, write one `plan_snapshots` row:
- `business_id = '678ae542-7f0b-43d1-8784-e7341767c250'` (business_profiles.id per existing convention)
- `user_id = 'f4702002-69a6-44f1-b963-ada2a95c843b'`
- `snapshot_type = 'goals_wizard_complete'`
- `version_number = next` (read max + 1)
- `plan_data` = full `OnePagePlanData` payload assembled from current DB state
- `label = "Post 2026-05-12 session refresh"`

#### A11. Document sales process
Capture current process (architect → plans → price → meeting → site walk → references → quote → follow-up) and proposed additions (discovery questions, choreographed indecision period, 2-beer fit-test) as a note on the "Unpack sales process" initiative (`strategic_initiatives.notes` JSONB).
- No new schema for now — store in initiative `notes` field.

#### A12. Stop-doing items
**Deferred** — Luke runs the exercise; placeholder initiative remains.

### Workstream B — Step 4 wizard code changes

#### B2. Always show Owner Hours / Week core-metric row
Today filtered out at [Step4AnnualPlan.tsx:953](src/app/goals/components/Step4AnnualPlan.tsx#L953) — `r.year1 ?? 0 > 0` drops the row when annual is unset. Fix: show row unconditionally. When `year1 == 0`, render annual cell as "Set in Step 1 →" link to Step 1.

#### B3. Surface Stagger by Priority button
Function exists at [Step4AnnualPlan.tsx:412](src/app/goals/components/Step4AnnualPlan.tsx#L412), no UI calls it. Add button to kanban header next to "Auto-split evenly" (which is on the Financial Targets card, not kanban — relocate or add new). Wire `onClick={handleStaggerByPriority}`.

#### B4. Category + priority badges on initiative cards
Cards today show only source badge ("ROADMAP" / "STRATEGIC" / "OPERATIONAL"). Add:
- **Category** badge — colour-coded by engine (Marketing/Finance/People/Systems/CX/Leadership/Time/Customer Experience)
- **Priority** badge — "HIGH" (red), "MED" (amber), "LOW" (slate). Only render if priority is set.
- Apply to both kanban cards and Available-pool cards.
- Use existing `<StrategicInitiative>` fields (`category`, `priority`).

#### B5. Per-quarter engine balance bar
6px tall stacked bar under each quarter card's header, showing the breakdown of that quarter's initiatives by category. Computed from `annualPlanByQuarter[q.id]` grouped by `category`. Empty quarters render an empty bar (or hide it). Colour scheme matches B4 category palette.

#### B6. Filterable Available pool by category chips
Above the Available pool grid: chip row with "All" + each unique category present in `twelveMonthInitiatives`. Clicking a chip filters `unassignedInitiatives` to that category. "All" is the default. Chip count badge (e.g., "Marketing (5)").

#### B7. Per-quarter notes free-text field
Under each quarter's card header (or at the bottom of the card): a small textarea labelled "Why this quarter?" or "Notes". Bound to `quarterlyTargets[q.id].notes` (extend the existing JSONB shape additively — tolerant read-side parser defaults `notes: ''`). Persist on blur.

#### B8. Plan snapshot save action
Button at the bottom of Step 4 (or on transition to Step 5): "Save plan version". Writes a `plan_snapshots` row with `snapshot_type='goals_wizard_complete'`, `version_number = next`, `plan_data` assembled from current wizard state (`OnePagePlanData`). Show success toast with version number. No automatic firing in MVP — explicit user action.

#### B15. Fix `current_remainder` boundary for extended-period plans
At [quarters.ts:259](src/app/goals/utils/quarters.ts#L259), `fyEnd` is computed purely from `fiscalYearStart`. For `is_extended_period = true` clients where `plan_start_date < fyEnd`, the remainder column overlaps with planned Y1.
- **Fix**: when planning context has `is_extended_period = true` and `plan_start_date < fyEnd`, set the remainder column's `endDate = plan_start_date - 1 day` (and trim `months` label accordingly).
- Propagate `is_extended_period` + `plan_start_date` into `deriveCurrentRemainderColumn` (extend signature, add optional params, default behaviour unchanged for non-extended plans).
- Pass these from `Step4AnnualPlan` props (already received as `isExtendedPeriod` though marked "legacy" at lines 28–36 — un-deprecate).

#### B16. Fix `autoSplitEvenly` to include `current_remainder` when extended
At [Step4AnnualPlan.tsx:662](src/app/goals/components/Step4AnnualPlan.tsx#L662), the function explicitly skips `current_remainder` ("stays at 0 by design"). Wrong for extended plans (Armstrong's Y1 includes Jun 2026, which is in the remainder column).
- **Fix**: when `isExtendedPeriod = true` and remainder column is visible, count remainder as a 5th period. Distribute annual / N_periods proportionally (or pro-rata by month count: remainder might be 1mo, quarters are 3mo each). Q4 absorbs rounding.
- When non-extended, preserve current behaviour (remainder = 0).

### Methodology constraints (LOCKED — do not change)
- `MAX_PER_QUARTER = 5` stays. **Do not raise.**
- `MAX_PER_PERSON = 3` per quarter stays.
- Period count flexes via `deriveCurrentRemainderColumn` already (5 periods × 5 items = 25 capacity in planning season). System already correct here.

### Safety constraints
- **No DB schema changes.** Notes field is additive JSONB. `plan_snapshots` table already exists.
- **All A-workstream scripts dry-run first.** Print payloads without writing; require `--apply` flag to commit.
- **Pre-write snapshot.** Before any A-workstream write, snapshot all affected tables for the Armstrong tenant to a timestamped JSON file in `scripts/snapshots/`. Trivial rollback.
- **Post-write verify.** Re-query and diff against expected after each script.
- **B-workstream lint/test/build green before commit.** No `--no-verify`.

### Claude's Discretion
- Exact file split for Workstream B (one wave vs multiple) — planner decides based on dependency analysis.
- Exact UI placement of badges, balance bar, filter chips — follow the existing Step 4 visual language (brand-orange accents, gray-50 backgrounds).
- Exact script structure for Workstream A — pattern after `scripts/onboard-fit2shine.mjs` (dry-run + `--apply`).
- Whether to commit A-workstream as one script or multiple per A-item.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase source-of-truth
- `docs/armstrong-update-and-step4-plan.md` — full PRD, all 20 items (A1–A12, B2–B8, B15, B16) with rationale
- 2026-05-12 Armstrong session transcript (not in repo; full content provided in original prompt)

### Step 4 wizard surface
- `src/app/goals/components/Step4AnnualPlan.tsx` — primary file edited by B2–B8, B16
- `src/app/goals/utils/quarters.ts` — edited by B15
- `src/app/goals/services/strategic-planning-service.ts` — already supports `step_type='current_remainder'`; reference for persistence patterns
- `src/app/goals/types.ts` — `StrategicInitiative`, `KPIData`, `FinancialData`, `YearType`
- `src/app/one-page-plan/types.ts` — `OnePagePlanData`, `PlanSnapshot` shape (used by B8)

### Architectural guardrails
- `docs/BUSINESS_ID_PATTERNS.md` — dual-ID system (businesses.id vs business_profiles.id); critical for Workstream A queries
- `docs/RLS_ARCHITECTURE.md` — RLS policies; Workstream A uses service-role key (allowed for one-off ops scripts)
- `docs/COACHING_PLATFORM_ARCHITECTURE.md` — wizard data flow
- `CLAUDE.md` — repo conventions, npm-only, branded ID types

### Existing script pattern (Workstream A)
- `scripts/onboard-fit2shine.mjs` — canonical pattern for dry-run + `--apply` data scripts

### Database tables touched (Workstream A)
- `strategic_initiatives` (A1–A3, A11)
- `business_profiles.key_roles`, `business_profiles.owner_info` (A4, A6)
- `business_kpis` (A5)
- `business_financial_goals.owner_hours_per_week_*` (A6)
- `strategy_data.vision_mission` (A7, A8)
- `swot_items` (A9)
- `plan_snapshots` (A10)

</canonical_refs>

<specifics>
## Specific Ideas

### Sequencing
Workstream A first (data refresh — unblocks Matt's next Armstrong session). Workstream B second (code changes, helps every client). Each can be one or many waves depending on planner's dependency analysis.

### Suggested wave breakdown (planner may refine)
- **Wave 1** — Pre-write snapshot script + Workstream A scripts in dry-run-validated, idempotent batches:
  - 68-01: Snapshot Armstrong tenant state to JSON (read-only)
  - 68-02: A1+A2 dedupe + quarter-assign `strategic_initiatives`
  - 68-03: A3 add diversification ideas
  - 68-04: A4 team roster + A6 owner hours
  - 68-05: A5 KPIs
  - 68-06: A7+A8+A9 values/mission/SWOT polish
  - 68-07: A11 sales process note on initiative
  - 68-08: A10 plan_snapshots baseline (last — depends on all A above)
- **Wave 2** — Workstream B code changes:
  - 68-09: B2 + B3 (small, isolated fixes)
  - 68-10: B15 + B16 (extended-period bugfix pair — couple-bound)
  - 68-11: B4 (category + priority badges)
  - 68-12: B5 (engine balance bar)
  - 68-13: B6 (filterable pool)
  - 68-14: B7 (per-quarter notes)
  - 68-15: B8 (plan snapshot save)

(Planner free to consolidate or further split.)

### Open methodology question (for Matt — answer before snapshot button ships)
- **B8 trigger**: Auto-snapshot on Step 5 entry, or explicit "Save version" button on Step 4? Current decision (above) is explicit button. Confirm.

</specifics>

<deferred>
## Deferred Ideas

- **A12** — Stop-doing items (Luke runs the exercise; no data to populate yet)
- **B1** — Raise MAX_PER_QUARTER (REJECTED — methodology constraint)
- **B9** — Committed-invoicing baseline (Phase 4 — needs new `active_jobs` table)
- **B10** — Holiday / leave overlay (Phase 4)
- **B11–B14** — Initiative clusters, dependency edges, seasonality-aware auto-split, one-page-plan preview modal (Phase 5 / someday)
- `strategic_initiatives.parent_initiative_id` schema refactor — long-term debt mentioned in [Step4AnnualPlan.tsx:347](src/app/goals/components/Step4AnnualPlan.tsx#L347); two-phase migration when we tackle it. **Out of scope.**

</deferred>

---

*Phase: 68-step-4-wizard-mvp-improvements-armstrong-co-plan-data-refresh*
*Context gathered: 2026-05-28 via PRD Express Path (docs/armstrong-update-and-step4-plan.md)*
