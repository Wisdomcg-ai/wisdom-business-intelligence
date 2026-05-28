---
phase: 68-step-4-wizard-mvp-improvements-armstrong-co-plan-data-refresh
plan: 08
status: complete
completed: 2026-05-29
---

# Plan 68-08 — Armstrong plan_snapshots baseline — SUMMARY

## What was built

`scripts/68-08-armstrong-plan-snapshot-baseline.mjs` — assembles a complete `OnePagePlanData` payload from Armstrong's now-refreshed DB state (post 68-02..68-07) and inserts a single `plan_snapshots` row as the canonical "post 2026-05-12 session refresh" baseline. Idempotent via `(business_id, label)` existence check.

## Apply result

**Snapshot inserted:**
- `id` = `a6dd0359-891d-43bb-9583-95cba15cba21`
- `business_id` = `678ae542-7f0b-43d1-8784-e7341767c250` (business_profiles.id — accepted on first try; no FK fallback to businesses.id needed)
- `user_id` = `f4702002-69a6-44f1-b963-ada2a95c843b`
- `version_number` = `1` (no prior snapshots)
- `snapshot_type` = `'goals_wizard_complete'`
- `label` = `'Post 2026-05-12 session refresh'`

**Idempotency confirmed:** second `--apply` reports "Baseline snapshot already exists" with the same id/version and exits 0 ✓

### Composed plan_data shape

| Field | Result |
|---|---|
| `vision` | Luke off-the-tools / $30M / diversified — full statement, 174 chars |
| `mission` | Final session wording, 313 chars (verbatim per 68-06) |
| `coreValues` | **9 items** — the new "we" statements (per 68-06) |
| `strengths` | **8 items** — 7 prior + 1 new Marrickville (per 68-06) |
| `weaknesses` | 10 items (unchanged) |
| `opportunities` | 7 items (unchanged) |
| `threats` | **7 items** — 6 prior + 1 new Trade cost inflation (per 68-06) |
| `financialGoals.year1` | revenue $7.5M, GP $1.5M, NP $750k |
| `financialGoals.year{2,3}` | $10M/$2M/$1.15M, $12M/$2.4M/$1.44M |
| `coreMetrics.year1` | leads 8/mo, conv 60%, avg $2M, team 10, **ownerHrs 40** (per 68-04) |
| `coreMetrics.year{2,3}` | scales 10→12 / 60%→60% / 12→14 / **25→10 owner hrs** |
| `kpis` | **9 items** — Completed Jobs + 8 from 68-05 |
| `strategicInitiatives` | **21 items, 11 with quarter assignments** (see note) |
| `quarterlyRocks` | `[]` (Step 5 not used by Armstrong yet) |
| `currentQuarter` / `currentQuarterLabel` | `'q4'` / `'Pre-FY27 — Q4 FY26 (Apr-Jun 2026)'` |
| `yearType` / `planYear` | `'FY'` / `2027` |
| `companyName` | `"Armstrong & Co"` |
| `ownerGoals` | desiredHours **10** (per 68-04), primaryGoal "Build income & wealth", timeHorizon "Forever/retirement", exitStrategy "Run forever" |

## Deviations from PLAN

None on the composition side. Two clarifications:

### Clarification 1 — quarter overlay derived from `step_type` rows (not `quarter_assigned`)

PLAN expected initiatives' `quarters[]` to come from `strategic_initiatives.quarter_assigned`. After Plan 68-02 (Option 3 hybrid), `quarter_assigned` was deliberately left untouched — Matt's wizard stores quarter assignment via separate `step_type='q1'/'q2'/'q3'/'q4'` rows. Script overlays the quarter step_type rows by title match onto the twelve_month canonical rows to derive `quarters[]`.

### Clarification 2 — `business_id` keyed to business_profiles.id confirmed

PLAN noted "business_id presumed to be business_profiles.id; fall back to businesses.id if FK fails". First attempt accepted. Confirmed: `plan_snapshots.business_id` stores `business_profiles.id`.

## Noted (out of scope) — duplicate `twelve_month` row

The snapshot shows **21 `strategicInitiatives` items** with 11 assigned to quarters. There are only 20 unique titles — "Set up a 6 - 12 month review of all suppliers - costs" exists **twice** as `step_type='twelve_month'`. Both inherit the q2 assignment from the corresponding `step_type='q2'` row, hence 11 instead of 10.

**Why not fixed here:** Plan 68-02 (Option 3 hybrid) dedupe scope was narrow on purpose — only cross-step (`strategic_ideas` vs `twelve_month`) and cross-quarter (q1-q4 duplicates). Within-step duplicates inside `twelve_month` weren't in scope. Fixing now would be out-of-scope mutation on Wave 1's final plan.

**Recommended follow-up:** small one-off cleanup script to deduplicate within-step `twelve_month` rows, OR Matt can resolve in the wizard. Either way the data is already useful — the wizard's existing title-dedupe workaround at [Step4AnnualPlan.tsx:347](src/app/goals/components/Step4AnnualPlan.tsx#L347) hides the dupe from UI rendering.

## Acceptance criteria

### Static (all pass)
- ✓ Script exists, `node --check` passes
- ✓ Contains both `'678ae542-7f0b-43d1-8784-e7341767c250'` and `'a0bf1b0a-663e-4636-8c0d-eef62972dcbc'`
- ✓ Contains `'goals_wizard_complete'`
- ✓ Contains `'Post 2026-05-12 session refresh'`
- ✓ Contains `'cb6d1358-a0ec-48b8-878c-159df6b3a576'`
- ✓ Contains `planYear: 2027`, `yearType: 'FY'`
- ✓ Contains `'coreValues'`, `'strategicInitiatives'`, `'kpis'`, `'ownerGoals'`
- ✓ Contains all 5 `*_year1` column references for coreMetrics (`leads_per_month_year1`, `conversion_rate_year1`, `avg_transaction_value_year1`, `team_headcount_year1`, `owner_hours_per_week_year1`)
- ✓ Does NOT reference `business_metrics` table

### Live (all pass)
- ✓ Dry-run reports full composed plan_data summary with non-zero counts for every populated field
- ✓ First `--apply` inserted snapshot id=`a6dd0359-891d-43bb-9583-95cba15cba21` version 1
- ✓ Second `--apply` reports "Baseline snapshot already exists" (idempotency)

## Files

| Path | Status |
|---|---|
| `scripts/68-08-armstrong-plan-snapshot-baseline.mjs` | Created |
| (Armstrong production data) | 1 `plan_snapshots` row inserted |

## Wave 1 (Workstream A) — FINAL STATUS

All 8 plans complete:

| Plan | Effect |
|---|---|
| 68-01 | 107-row read-only snapshot captured |
| 68-02 | Dedupe 70→49 (parking-lot + cross-quarter) |
| 68-03 | 13 diversification ideas added (then hotfixed `growth`→`other`) |
| 68-04 | Team roster 7→10; owner_hours_per_week 0→glide path 50/40/25/10 |
| 68-05 | 8 KPIs added (2-tier library + tracking); existing Completed Jobs untouched |
| 68-06 | 5 buzzword values → 9 "we" statements; mission updated; SWOT 30→32 |
| 68-07 | Sales process note attached to "Unpack" initiative |
| 68-08 | Baseline plan_snapshots row id `a6dd0359-…` version 1 |

Also shipped during Wave 1: ramp-aware quarterly split ($1.4M / $1.9M / $2.2M / $2.0M = $7.5M Y1) replacing the even auto-split.

## Next: Wave 2-8 (Workstream B)

Step 4 wizard code changes — UX fixes + extended-period bug fix + plan-snapshot save action. All on the same `phase-68-step4-armstrong` branch.

Plus the B-followup tracked from the Clients-page hotfix: add `growth` to the category bucket maps in `Step2StrategicIdeas.tsx`, `Step3PrioritizeInitiatives.tsx`, and `quarterly-review/services/strategic-sync-service.ts`, OR add a defensive `grouped[category] ?? grouped.misc` fallback.

## Self-Check

PASSED. Snapshot composed correctly, accepted by `plan_snapshots` schema on first try, idempotency confirmed, all source fields verified. Armstrong now has a frozen reference point for the 2026-05-12 session refresh.
