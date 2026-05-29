---
phase: 68-step-4-wizard-mvp-improvements-armstrong-co-plan-data-refresh
plan: 07
status: complete
completed: 2026-05-29
---

# Plan 68-07 — Sales process note — SUMMARY

## What was built

`scripts/68-07-armstrong-sales-process-note.mjs` — PATCHes the `notes` field on Armstrong's "Unpack current sales process and refine/systemise" initiative (id `529682fc-1b8e-44d7-9179-487311054ae0`, `step_type='twelve_month'`) with a markdown-formatted note capturing current process + proposed additions from the 2026-05-12 session.

## Apply result

- **Target initiative:** `529682fc-1b8e-44d7-9179-487311054ae0` — "Unpack current sales process and refine/systemise"
- **Match logic:** title contains both `'unpack'` AND `'sales process'` (case-insensitive); resolves to exactly 1 row
- **Before:** `notes = ''`
- **After:** Markdown-formatted note (~700 chars) with two sections — Current process (7 steps) + Proposed additions (3 items)
- **Idempotency confirmed:** second `--apply` reports "Notes already match — no write needed" ✓

### Note payload

```
Captured from: 2026-05-12 Armstrong session.

## Current sales process

1. Architect produces plans
2. Client takes plans to builder for price
3. Initial meeting with client
4. Site walk
5. Reference check / references provided
6. Formal quote
7. Follow-up

## Proposed additions

- **Discovery questions block before pricing** — surface budget, decision-makers, timeline, decision criteria.
- **Choreographed indecision period** — own the indecision period; make space for the client to slow down and feel the decision.
- **2-beer fit-test** — informal social meeting to confirm relationship-fit before signing. Use with caveats: it's a heuristic, not a gate.
```

## Deviations from PLAN

### Deviation — markdown text instead of stringified JSONB

PLAN specified a JSON payload for `notes`. Live `strategic_initiatives.notes` is a `text` column (verified — existing rows hold empty strings). Script writes a formatted markdown string instead so:
- Matt can read it directly in the wizard UI without parsing
- The structure (headings + bullet/numbered lists) is preserved as visual hierarchy
- Adding more notes later is concatenation, not JSON merge

Match logic also widened: PLAN used exact lowercased equality against `'unpack sales process'`. Live title is `"Unpack current sales process and refine/systemise"` — exact match fails. Switched to contains both `'unpack'` + `'sales process'` which resolves to the canonical row unambiguously.

## Acceptance criteria

### Static (all pass)
- ✓ Script exists, `node --check` passes
- ✓ Contains `'678ae542-7f0b-43d1-8784-e7341767c250'`
- ✓ Contains the lowercase match substrings
- ✓ Contains `'2-beer fit-test'`, `'Choreographed indecision period'`, `'Architect produces plans'`
- ✓ Contains "Captured from: 2026-05-12 Armstrong session"

### Live (all pass)
- ✓ Dry-run output reports 1 matching initiative and `PATCH planned: YES`
- ✓ First `--apply` successfully patched
- ✓ Second `--apply` reports "Notes already match — no write needed" (idempotency)

## Files

| Path | Status |
|---|---|
| `scripts/68-07-armstrong-sales-process-note.mjs` | Created |
| (Armstrong production data) | 1 row PATCHed in `strategic_initiatives` |

## Next plan

**Plan 68-08** — `plan_snapshots` baseline. Build a complete `OnePagePlanData` payload from Armstrong's current DB state (post 68-02..68-07) and insert as `snapshot_type='goals_wizard_complete'` row.

## Self-Check

PASSED. All criteria met. Idempotency confirmed. Sales process knowledge now lives inside the corresponding initiative — Matt can reference it directly while doing the unpack work.
