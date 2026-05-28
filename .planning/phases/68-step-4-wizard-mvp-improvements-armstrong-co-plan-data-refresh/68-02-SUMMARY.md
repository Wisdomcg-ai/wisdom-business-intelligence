---
phase: 68-step-4-wizard-mvp-improvements-armstrong-co-plan-data-refresh
plan: 02
status: complete
completed: 2026-05-29
---

# Plan 68-02 — Armstrong initiative dedupe (Option 3 hybrid) — SUMMARY

## What was built

`scripts/68-02-armstrong-initiatives-dedupe-and-assign.mjs` — dedupe-only script. Two narrow operations:

1. **Parking-lot dedupe**: delete `step_type='strategic_ideas'` rows whose normalized title (lowercased + trimmed) also exists as a `step_type='twelve_month'` row.
2. **Cross-quarter duplicate cleanup**: when a title appears in multiple quarter step_types (q1, q2, q3, q4), keep the earliest quarter and delete the rest.

Explicitly does NOT touch `quarter_assigned`, `year_assigned`, `fiscal_year`, `start_date`, `end_date` columns. The wizard owns quarter assignment via `step_type` and we respect that.

## Apply result

- **Before:** 70 strategic_initiatives rows
- **Deleted:** 21 (20 parking-lot + 1 cross-quarter)
- **After:** 49 rows
- **Idempotency confirmed:** second `--apply` run produced 0 deletes ✓

### Preserved structure (49 rows)

| `step_type` | Rows | What |
|---|---|---|
| `q1` | 5 | Matt's wizard assignments — Marketing + sales process (testimonials, social, website, "Own the indecision period", client feedback questionnaire) |
| `q2` | 4 | Supplier review, Pablo management discussion, document processes, AI/Loom/Slack tech |
| `q3` | 1 | GAP MAP |
| `q4` | 0 | (only entry was the duplicate supplier review; removed in cross-quarter pass) |
| `twelve_month` | 21 | Canonical 12-month committed list (unchanged) |
| `strategic_ideas` | 18 | Books + exploratory parking lot (Atomic Habits, Wooden, Ivan Cleary autobiography, USB-to-clients, Expand referring architects, etc.) |

### Deleted rows (audit trail)

**Parking-lot (20):**
- Investigate Builder Trend and determine how we want to implement the system "properly"
- Social media content plan
- Get client testimonials - written & video
- Do a review of current pricing
- Unpack current sales process and refine/systemise
- Look at the communications during the sales process - "Own the indecision period"
- Periodic Client Feedback Questionnaire - pilot and then systemise
- Develop and embed the core values
- Develop Performance Management Process - GAP MAP
- Discuss Management Opportunity with Pablo
- Document key processes in the business - back of house and on site
- Implement Home Warranty Tracker
- Review progress claims and update how we collect
- Set up a 6 - 12 month review of all suppliers - costs
- Update the Website
- Develop key checklists for running jobs on site in prep for a site supervisor
- Incorporate tech - AI, Loom, Slack
- Develop a budget and cashflow forecast
- Develop a simple dashboard with key metrics that drive growth
- Review job profitability (estimate vs actual) and determine if our pricing is on point

(Each above had a `twelve_month` counterpart that was preserved.)

**Cross-quarter (1):**
- q4 "Set up a 6 - 12 month review of all suppliers - costs" (also exists in q2)

## Deviations from PLAN

None. Script matches the Option 3 hybrid logic specified in the updated PLAN (after Matt switched from Option 2 to Option 3 on 2026-05-29).

Env var convention from 68-01 deviation 1 carried forward: `SUPABASE_SECRET_KEY` with fallback to legacy.

## Acceptance criteria

### Static (all pass)
- ✓ `scripts/68-02-armstrong-initiatives-dedupe-and-assign.mjs` exists, passes `node --check`
- ✓ Contains literal `'678ae542-7f0b-43d1-8784-e7341767c250'`
- ✓ Contains literal `APPLY = process.argv.includes('--apply')`
- ✓ Contains `"PARKING-LOT DEDUPE"` and `"CROSS-QUARTER DUPLICATE"` section labels
- ✓ Does NOT mutate `quarter_assigned`, `year_assigned`, `fiscal_year`, `start_date`, `end_date` (regex confirmed)

### Live (all pass)
- ✓ Dry-run output contains `"PARKING-LOT DEDUPE PLAN"`, `"CROSS-QUARTER DUPLICATE PLAN"`, `"PRESERVED"`, `"DRY RUN"`
- ✓ Dry-run reported 20 parking-lot deletes + 1 cross-quarter delete (within the "approximately 17 + exactly 1" target)
- ✓ Second `--apply` reports 0 deletes (idempotency confirmed)

## Files

| Path | Status |
|---|---|
| `scripts/68-02-armstrong-initiatives-dedupe-and-assign.mjs` | Created |
| (Armstrong production data) | 21 rows deleted from `strategic_initiatives` |

## Next plan

**Plan 68-03** — Add 13 diversification ideas to `strategic_initiatives` as `idea_type='exploratory'`, `step_type='strategic_ideas'`, `selected=false`. Use `SUPABASE_SECRET_KEY` env var; hardcode Armstrong identifiers; idempotent (existence-check by normalized title).

## Self-Check

PASSED. All criteria met, idempotency confirmed, Matt's wizard quarter assignments fully preserved, parking lot reduced to books + exploratory only.
