# Plan: Armstrong & Co Update + Step 4 Wizard Improvements

**Created**: 2026-05-28
**Source**: 2026-05-12 Armstrong & Co planning session transcript + Step 4 code review
**Owner**: Matt Malouf

Two parallel workstreams:
- **Workstream A** — Armstrong & Co plan-data update (data writes only, no code)
- **Workstream B** — Step 4 wizard UX improvements (code changes)

---

## Workstream A — Armstrong & Co DB updates

Business: `Armstrong & Co`
- `businesses.id` = `a0bf1b0a-663e-4636-8c0d-eef62972dcbc`
- `business_profiles.id` = `678ae542-7f0b-43d1-8784-e7341767c250`
- `user_id` = `f4702002-69a6-44f1-b963-ada2a95c843b`

### A1. Dedupe `strategic_initiatives`
Currently triplicated across `step_type` values (`q1`, `twelve_month`, `strategic_ideas`). Keep one canonical row per unique title. The Step 4 dedupe workaround at [Step4AnnualPlan.tsx:347](../src/app/goals/components/Step4AnnualPlan.tsx#L347) is masking this; cleaning the data is still the right call.

**Action**: Identify the canonical row per title (prefer `twelve_month` rows that already carry the active plan assignment); delete duplicates.

### A2. Quarter-assign the canonical initiatives
Today every initiative has `quarter_assigned = null`, `year_assigned = null`, `start_date = null`. Apply Matt's end-of-session sequencing:

- **Q1 (May–Jun 2026)** — pricing review, progress claims update, job profitability review, Builder Trend audit, sales-process unpack, home-warranty tracker, financial forecast
- **Q2 (Jul–Sep 2026)** — website update, testimonials (written + video), social media plan, site signage refresh, new imagery, client feedback questionnaire pilot
- **Q3 (Oct–Dec 2026)** — performance management process (GAP MAP), team-building plan, training and development plan, key checklists, document key processes, embed core values, discuss management opportunity with Pablo
- **Q4 (Jan–Mar 2027)** — leadership reading list, competitor analysis, supplier 6–12 month review cadence, stop-doing list creation, ideal-week design, time audit, 2-weeks-off goal

### A3. Add diversification ideas (parking lot)
Add 13 items not currently in `strategic_initiatives`, tagged `idea_type = 'exploratory'`:
1. Australian Housing partnership (Jordan Ricketts)
2. NSW affordable housing builder panel
3. Strata maintenance / repair work
4. In-house electrical + plumbing
5. Insurance remediation work (flood/storm/roof)
6. Duplex defect remediation
7. School works / demountables
8. Government tenders
9. University maintenance contracts
10. Waterfront / barge + maritime partner (Class 2 licence applied; Evolve FM panel)
11. Prefab passive homes / kit homes
12. Pontoon innovation (Kevlar/fibreglass)
13. "Experiences" subscription business idea (Portelli-style)

### A4. Update `key_roles`
Current roster missing: **Carly** (subcontract carpenter — first apprentice, "huge part of the cocktail"), **Cooper** (subcontract carpenter), **Chris** (just started).

Also:
- Reconcile **Pablo / "Pubs"** (same person — confirm and standardise spelling)
- Pablo title → "Foreman (Lockup → Finish)"
- Kye title → "Foreman (Setup → Lockup)"
- Add field/note marking **Pablo as foreman-promotion candidate**, target ready Jan–Jun 2028

### A5. Add missing KPIs
Today only "Completed Jobs" exists. Add (with Y1/Y2/Y3 targets):
| KPI | Y1 | Y2 | Y3 |
|---|---|---|---|
| Revenue Invoiced | $7.5M | $10M | $12M |
| Gross Margin % per job | 20% | 20% | 20% |
| Quote-to-Win Conversion | 80% | 80% | 80% |
| Home Warranty Headroom (available capacity) | track | track | track |
| Active Jobs in Pipeline | track | track | track |
| Variations Captured & Invoiced % | 95% | 95% | 95% |
| Client Feedback Score (1–10) | 9 | 9 | 9 |
| Luke Hours on Tools / Week | 20 | 5 | 0 |

### A6. Fix `owner_hours_per_week` data
`business_financial_goals.owner_hours_per_week_year1/2/3` are all 0 — implausible. Set to reflect Luke's "off tools by FY29" trajectory:
- current = 50, Y1 = 40, Y2 = 25, Y3 = 10

Same for `owner_info.desired_hours` (Luke currently 0 — looks like data-entry bug; set to ~10).

### A7. Refine core values
Currently stored as 5 buzzwords. Convert to "we" behaviour statements per Matt's framework, and add the additional principles surfaced in the transcript:
- "We build long-term relationships, not transactions" (suppliers / subbies / investors)
- "We do the right thing when no one's watching"
- "No dickheads"
- "Welcoming + collaborative on site"

This is a prep step for the GAP MAP that lands in Q3.

### A8. Polish mission statement
Update from current stored version to the final session wording:
> "We take someone's dream that has been sketched on paper and turn it into reality, focusing on the details, overcoming the unforeseen challenges, and constantly ensuring we align with their desires, while coupling this with an amazing client experience."

### A9. SWOT touch-ups
- Annotate duplicate "Flexible & adaptable" item as **both** strength *and* weakness with brief context
- Add strength: "Operational delivery — 7 weeks ahead at Marrickville with wet weather"
- Add threat: "Trade cost inflation pushing jobs out of client budget ($175k → $200k)"
- Add threat specifics on home warranty: current cap $5M, $2.2M tied at Clavellie, $700k Marrickville, zero claims history

### A10. Create `plan_snapshots` baseline
After A1–A9 are applied, write one `plan_snapshots` row with `snapshot_type = 'goals_wizard_complete'` and the full `OnePagePlanData` payload. Gives Matt a version to reference at next quarterly review.

### A11. Document sales process
Capture the current process (architect → plans → price → meeting → site walk → reference list → quote → follow-up) and the proposed additions (discovery questions, choreographed indecision period with pre-booked next meeting, 2-beer fit-test with caveats) somewhere structured — either a new `sales_processes` document or an attached note on the "Unpack sales process" initiative.

### A12. Stop-doing items
Deferred — Luke needs to run the exercise first. Placeholder initiative already exists.

---

## Workstream B — Step 4 wizard improvements

Source: [Step4AnnualPlan.tsx](../src/app/goals/components/Step4AnnualPlan.tsx)

### B-MVP — no schema changes, pure UI/UX

| ID | Change | Where |
|---|---|---|
_**Methodology preserved**: `MAX_PER_QUARTER = 5` stays. Capacity flexes via dynamic period count — [`deriveCurrentRemainderColumn`](../src/app/goals/utils/quarters.ts) auto-injects a "Now" period in the last 3 months of the current FY when planning the next year, giving 5×5 = 25 item capacity during planning season. Disappears automatically on FY rollover._

| **B2** | Always show **Owner Hours / Week** core-metric row even when year1 = 0. Replace silent drop with "Set in Step 1" inline CTA. | [Step4AnnualPlan.tsx:953](../src/app/goals/components/Step4AnnualPlan.tsx#L953) |
| **B3** | Surface the **Stagger by Priority** button in the kanban header. Function exists at [Step4AnnualPlan.tsx:412](../src/app/goals/components/Step4AnnualPlan.tsx#L412), no UI calls it. | Kanban header |
| **B4** | **Category + priority badges** on initiative cards (kanban + Available pool). Currently only source badge. | Card components |
| **B5** | **Per-quarter engine balance bar** — 6px stacked bar showing category breakdown. | Below quarter header |
| **B6** | **Filterable Available pool** by category chips (Marketing / Finance / People / Systems / CX / Leadership / Time). | Available pool header |
| **B7** | **Per-quarter notes** free-text field, saved to `quarterly_targets[q].notes`. | Quarter card body |
| **B8** | **Plan snapshot** save action — button at Step 4 completion writing `plan_snapshots` row with `snapshot_type = 'goals_wizard_complete'`. | Bottom of Step 4 / on Next |
| **B15** | **Fix `current_remainder` boundary for extended-period plans.** When `is_extended_period = true` and `plan_start_date < fyEnd`, end the remainder column at `plan_start_date - 1 day` instead of the standard FY end. Otherwise the remainder overlaps with planned Y1 (Armstrong: May–Jun 2026 vs Y1 starting 1 Jun 2026). | [quarters.ts:259](../src/app/goals/utils/quarters.ts#L259) |
| **B16** | **Fix `autoSplitEvenly` for extended-period plans.** The "outside Year 1" assumption at [Step4AnnualPlan.tsx:662](../src/app/goals/components/Step4AnnualPlan.tsx#L662) is wrong when Y1 is extended and includes pre-FY-end months. Auto-split should distribute proportionally across (remainder + Q1–Q4) when extended. | [Step4AnnualPlan.tsx:662](../src/app/goals/components/Step4AnnualPlan.tsx#L662) |

### B-Phase 2 — needs new schema

| ID | Change | Schema |
|---|---|---|
| **B9** | **Committed-invoicing baseline** — show already-committed invoicing per quarter next to Revenue input. | New `active_jobs` table: `id, business_id, name, contract_value, start_date, end_date, home_warranty_used, status` |
| **B10** | **Holiday / leave overlay** — render leave blocks as amber bar in affected quarter. | Either reuse `active_jobs.status='leave'` or new `leave_periods` table |

### B-Deferred — nice to have

- **B11** Initiative clusters (link related initiatives)
- **B12** Dependency edges between initiatives
- **B13** Seasonality-aware auto-split
- **B14** One-page plan preview modal at bottom of Step 4

---

## Execution sequence

| Phase | Scope | Effort | Trigger |
|---|---|---|---|
| **1** | Workstream A1–A6 (data: dedupe, quarter-assign, ideas, team, KPIs, owner hours) | ~30 min | Now — unblocks next Armstrong session |
| **2** | Step 4 MVP (B2–B8, B15, B16) | ~1 day | After Phase 1; before next batch of coaching sessions for max leverage |
| **3** | Workstream A7–A11 (data: values polish, mission, SWOT, sales process, plan snapshot) | ~30 min | After Step 4 MVP so snapshot uses the new schema |
| **4** | Step 4 Phase 2 (B9–B10 + `active_jobs` table) | ~2–3 days | When 2+ project-based clients want pipeline integration |
| **5** | Stop-doing (A12) + Step 4 deferred (B11–B14) | Someday | When demand surfaces |

---

## Safety + review strategy

### Workstream A (data writes)
- **Dry-run mode** on every script — print payloads without writing (follows the [onboard-fit2shine.mjs](../scripts/onboard-fit2shine.mjs) pattern)
- **Pre-write snapshot** — read current state of every affected table for Armstrong into a timestamped JSON file. Trivial rollback if anything goes wrong.
- **Post-write verify** — re-query and diff against expected.
- Run scripts with `--apply` only after dry-run output is eyeballed.

### Workstream B (code changes)
- Feature branch off `main` (`armstrong-update-and-step4` or split into two).
- Local sanity: `npm run lint && npm run test && npm run build` green before push.
- **`/ultrareview` on the branch** before opening PR. Brief the agents specifically:
  > "Pay special attention to: (a) any DB migration that could lock a live table; (b) backward-compatibility of the `quarterlyTargets` shape and `strategic_initiatives` row schema; (c) whether existing saved plans still load after these changes; (d) Step 4 state-shape regressions."
- CI runs lint + typecheck + vitest + build automatically on PR.
- Optional second `/ultrareview <PR#>` after final commits.

### Downtime risk vectors specific to this codebase
1. **DB migrations** — additive only, nullable columns, no `NOT NULL` without defaults on populated tables.
2. **`strategic_initiatives` parent_id refactor** (mentioned as long-term debt in Step 4 dedupe comment) — when we eventually do it, two-phase: add column nullable → backfill → enforce in later release.
3. **Wizard state-shape changes** — `quarterlyTargets` is keyed by `q1..q4` + `current_remainder`. Any shape change needs a tolerant read-side parser so old saved plans still load.

### Rollback plan
- **Data (A)**: pre-write snapshot JSON + revert script saved alongside apply script.
- **Code (B)**: standard `git revert` + redeploy. Vercel preserves prior deployment for instant rollback.

---

## Definition of Done

### Armstrong update done when
- All `strategic_initiatives` deduped, prioritised, quarter-assigned
- All 13 diversification ideas captured as `idea_type='exploratory'`
- Team roster matches transcript (Carly, Cooper, Chris added; Pablo flagged)
- Owner hours target reflects "off tools by FY29" trajectory
- KPI list includes Revenue, GM%, Conversion, Home Warranty Headroom (minimum)
- `plan_snapshots` baseline row exists
- Matt can present a clean one-page plan to Luke in next session

### Step 4 MVP done when
- All 9 B-MVP items (B2–B8, B15, B16) implemented and shipped
- Extended-period plans (Armstrong-style: Y1 starts before FY boundary) render the "Now" column with correct boundaries and auto-split distributes across all periods including the remainder
- `/ultrareview` clean
- No regression in existing plan loads (verified against ≥2 existing client plans)
- Matt confirms it feels right walking through Armstrong's plan end-to-end

---

## Open questions for Matt

1. **Pablo vs "Pubs"** — same person? Confirm before A4.
2. **Diversification ideas** — should they go into `strategic_initiatives` with `idea_type='exploratory'` (current schema supports it) or do you want a dedicated parking-lot table?
3. **Sales process** (A11) — keep in initiative notes for now, or build a dedicated `sales_processes` schema?
4. **B8 Plan snapshot trigger** — auto-create on Step 5 entry, or manual "Save version" button on Step 4?
5. **Short-period capacity hint** — when "Now" column is 1 month (vs 3-month quarter), do you want a UI hint to "treat this as a sprint, pick fewer", or stay strict at 5? (No code change needed if strict.)
