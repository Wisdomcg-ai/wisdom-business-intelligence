---
phase: 68-step-4-wizard-mvp-improvements-armstrong-co-plan-data-refresh
plan: 03
status: complete
completed: 2026-05-29
---

# Plan 68-03 — Armstrong diversification ideas — SUMMARY

## What was built

`scripts/68-03-armstrong-diversification-ideas.mjs` — inserts 13 diversification ideas as parking-lot items in `strategic_initiatives`. Idempotent via normalized-title existence check.

## Apply result

- **Existing strategic_ideas rows before:** 18
- **Inserted:** 13
- **Skipped:** 0
- **Total strategic_ideas after:** 31 (18 + 13)
- **Idempotency confirmed:** second `--apply` run produced "Inserted 0, Skipped 13" ✓

### 13 ideas added

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
13. Experiences subscription business (Portelli-style)

Each row:
- `step_type = 'strategic_ideas'`
- `idea_type = 'strategic'` (see deviation below)
- `selected = false` (parking-lot signal)
- `category = 'growth'` (see deviation below)
- All quarter fields null

## Deviations from PLAN

### Deviation — enum constraint discovery

The PLAN (and CONTEXT.md) specified `idea_type='exploratory'` and `category='diversification'`. Both were rejected by DB check constraints on first apply attempt.

**Discovered allowed values (via live query):**

| Column | Allowed enum |
|---|---|
| `strategic_initiatives.idea_type` | `'strategic'`, `'operational'` (no `'exploratory'`) |
| `strategic_initiatives.category` | `customer_experience`, `finance`, `growth`, `marketing`, `misc`, `operations`, `other`, `people`, `product`, `sales`, `systems`, `team` (no `'diversification'`) |

**Remapped:**

| PLAN value | Applied value | Rationale |
|---|---|---|
| `idea_type='exploratory'` | `idea_type='strategic'` | These ARE strategic options. The "parking-lot, not committed" signal is conveyed by `selected=false` (which is how the wizard already distinguishes parking lot from 12-month). |
| `category='diversification'` | `category='growth'` | Closest match in the allowed enum — diversification is a growth play. |

No rows landed during the failed first apply attempt (verified via post-failure title query — empty result for "Australian Housing partnership").

**Impact on downstream plans:**
- Filter for diversification ideas later via `step_type='strategic_ideas' AND category='growth' AND selected=false` — this combination is now meaningful for Armstrong (no pre-existing rows match).
- Pattern note for future plans: discover allowed enum values BEFORE writing inserts. The dual-ID + enum-constraint surprises are recurring themes in this platform.

## Acceptance criteria

### Static (all pass)
- ✓ `scripts/68-03-armstrong-diversification-ideas.mjs` exists, `node --check` exits 0
- ✓ Contains `'678ae542-7f0b-43d1-8784-e7341767c250'`
- ✓ Contains `APPLY = process.argv.includes('--apply')`
- ✓ Contains all 13 literal titles ("Australian Housing partnership (Jordan Ricketts)", "Pontoon innovation (Kevlar/fibreglass)", "Experiences subscription business (Portelli-style)", ...)
- ✓ Contains `'strategic_ideas'`, `selected: false`

### Live (all pass)
- ✓ Dry-run output prints `INSERT PLAN` and `DRY RUN`
- ✓ First `--apply` inserted 13 rows
- ✓ Second `--apply` reports "Inserted 0, Skipped 13" (idempotency)
- ✓ Post-query: 31 strategic_ideas rows for Armstrong (18 prior + 13 new)

## Files

| Path | Status |
|---|---|
| `scripts/68-03-armstrong-diversification-ideas.mjs` | Created |
| (Armstrong production data) | 13 rows inserted into `strategic_initiatives` |

## Next plan

**Plan 68-04** — Team roster (add Carly, Cooper, Chris; reconcile Pablo/"Pubs" flag) + owner_hours_per_week backfill in `business_financial_goals` (Y1=40, Y2=25, Y3=10).

## Self-Check

PASSED. All criteria met after enum-mapping correction. Idempotency confirmed. 13 ideas now visible in Armstrong's wizard parking lot.
