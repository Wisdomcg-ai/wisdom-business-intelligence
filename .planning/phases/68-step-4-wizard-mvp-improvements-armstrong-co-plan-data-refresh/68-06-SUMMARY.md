---
phase: 68-step-4-wizard-mvp-improvements-armstrong-co-plan-data-refresh
plan: 06
status: complete
completed: 2026-05-29
---

# Plan 68-06 — Values + mission + SWOT polish — SUMMARY

## What was built

`scripts/68-06-armstrong-values-mission-swot.mjs` — patches `strategy_data.vision_mission` (core_values + mission_statement) and applies 5 SWOT mutations to `swot_items`. Idempotent on both sides.

## Apply result

### A7 — Core values
- **Before**: 5 buzzwords — `["Happy and Fun", "Learning and Teaching", "Hardworking", "Open and Transparent", "Collaborate and problem solve"]`
- **After**: 9 "we" statements:
  1. We are happy and have fun on every job
  2. We are always learning and teaching each other
  3. We work hard and do what we say we will do
  4. We are open and transparent — with each other and with clients
  5. We collaborate to solve problems
  6. We build long-term relationships, not transactions
  7. We do the right thing when no one's watching
  8. No dickheads
  9. We are welcoming and collaborative on site

### A8 — Mission statement
Updated verbatim to session wording:
> "We take someone's dream that has been sketched on paper and turn it into reality, focusing on the details, overcoming the unforeseen challenges, and constantly ensuring we align with their desires, while coupling this with an amazing client experience."

### A9 — SWOT touch-ups (30 → 32 items)
- **PATCH** — `strength` row "Flexible & adaptable to client needs" description → `"Flexibility wins clients but creates scope creep — same trait shows up as a weakness"`
- **PATCH** — `weakness` row "Flexible & adaptable to client needs" description → `"Same trait that wins clients also drives scope creep when boundaries aren't set early"`
- **INSERT** — new `strength`: "Operational delivery — Marrickville 7 weeks ahead of schedule with wet weather" (impact_level 4)
- **INSERT** — new `threat`: "Trade cost inflation pushing jobs out of client budget (e.g., $175k → $200k)" (impact_level 4)
- **PATCH** — `threat` row "Home warranty insurance not growing at the same or faster rate then our pipeline" description → `"Current cap $5M; $2.2M tied at Clavellie, $700k Marrickville; zero claims history (advantage when negotiating cap increase)"`

**Idempotency confirmed**: second `--apply` reports "strategy_data: no changes" + "swot_items: 0 inserted, 0 patched" ✓

## Deviations from PLAN

### Deviation 1 — `swot_items` field name
PLAN referenced `swot_items.content`. Live schema uses `swot_items.title` (verified in 68-01 snapshot). Script uses `title`.

### Deviation 2 — `swot_items.category` singular vs plural
PLAN used plural categories (`'strengths'`, `'weaknesses'`, `'threats'`). Live schema uses singular (`'strength'`, `'weakness'`, `'threat'`, `'opportunity'`). Script uses singular per the live data.

### Deviation 3 — `strategy_data` filter key
PLAN GET pattern was `strategy_data?business_id=eq.${BPID}`. Live row has `business_id = null`, filterable only by `user_id`. Script uses `user_id=eq.${USER_ID}`.

### Deviation 4 — `swot_items` requires `created_by`
PLAN didn't include `created_by`. Live schema enforces NOT NULL. Script sets `created_by = USER_ID`.

### Deviation 5 — `swot_items` requires `impact_level` and `status`
Same as 4 — required fields not in PLAN. Script defaults `impact_level = 3` or 4 depending on item importance, `status = 'active'`.

### Deviation 6 — "Flexible & adaptable" rows already existed
PLAN was defensive about whether the strength side existed. Both strength and weakness sides were already present in the data with empty descriptions — script went straight to PATCH-description for both, no defensive INSERTs needed.

## Acceptance criteria

### Static (all pass)
- ✓ Script exists, `node --check` passes
- ✓ Contains `'cb6d1358-a0ec-48b8-878c-159df6b3a576'`
- ✓ Contains all 9 core-value strings (including "No dickheads", "long-term relationships", "right thing when no one's watching", "welcoming and collaborative on site")
- ✓ Contains the literal mission substring "sketched on paper and turn it into reality"
- ✓ Contains "Marrickville 7 weeks ahead of schedule" (new strength)
- ✓ Contains "Trade cost inflation" (new threat)
- ✓ Contains `"Current cap $5M; $2.2M tied at Clavellie, $700k Marrickville"` (home warranty desc)
- ✓ Contains singular category values (`'strength'`, `'weakness'`, `'threat'`)

### Live (all pass)
- ✓ Dry-run reports strategy_data + 5 swot_items mutations
- ✓ First `--apply` patched strategy_data + 2 swot_items inserted + 3 swot_items patched
- ✓ Second `--apply` reports "no changes" / "0 inserted, 0 patched" (idempotency)
- ✓ Post-query: swot_items count 30 → 32 ✓

## Files

| Path | Status |
|---|---|
| `scripts/68-06-armstrong-values-mission-swot.mjs` | Created |
| (Armstrong production data) | `strategy_data.vision_mission` patched; `swot_items` +2 rows, 3 PATCHes |

## Next plan

**Plan 68-07** — Sales process note: append a structured JSONB note to the existing "Unpack current sales process and refine/systemise" strategic_initiative row capturing current process (architect → quote → meeting → site walk → references → follow-up) + proposed additions (discovery questions, indecision-period choreography, 2-beer fit-test with caveats).

## Self-Check

PASSED. All criteria met. Idempotency confirmed. Six schema/data deviations from PLAN documented (none changed scope). Values, mission, and SWOT now reflect 2026-05-12 session reality.
