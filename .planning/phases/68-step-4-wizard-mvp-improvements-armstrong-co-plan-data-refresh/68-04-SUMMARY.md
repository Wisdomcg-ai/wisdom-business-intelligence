---
phase: 68-step-4-wizard-mvp-improvements-armstrong-co-plan-data-refresh
plan: 04
status: complete
completed: 2026-05-29
---

# Plan 68-04 — Team roster + owner-hours backfill — SUMMARY

## What was built

`scripts/68-04-armstrong-team-roster-and-owner-hours.mjs` — additive PATCH of two tables. Merges target roles into existing `key_roles` (preserves unrelated names); patches `owner_info.desired_hours` from 0 → 10; backfills `owner_hours_per_week_*` to reflect Luke's glide-path to off-the-tools by FY29.

## Apply result

**`business_profiles.key_roles`** — 7 → 10 entries

| Disposition | Roles |
|---|---|
| Preserved (5) | Luke (Director), Alice (Administration), Peni Misinale (3rd Year Apprentice), Billy Nye (1st Year Apprentice), Brodie Whitingham (1st Year Apprentice) |
| Updated title (2) | Pablo: "Foreman" → "Foreman (Lockup → Finish)" + `status: 'promotion_candidate'` + notes flagging Jan-Jun 2028 readiness target & Pubs reconciliation; Kye: "Foreman" → "Foreman (Setup → Lockup)" |
| Added (3) | Carly — Subcontract Carpenter ("First apprentice — huge part of the cocktail"), Cooper — Subcontract Carpenter, Chris — Carpenter ("Just started") |

**`business_profiles.owner_info.desired_hours`:** 0 → 10 (data-entry bug fix)

**`business_financial_goals` owner_hours_per_week_***
| Field | Before | After |
|---|---|---|
| `_current` | 0 | 50 |
| `_year1` | 0 | 40 |
| `_year2` | 0 | 25 |
| `_year3` | 0 | 10 |

**Idempotency confirmed:** second `--apply` logged "business_profiles: no changes needed" AND "business_financial_goals: no changes needed". ✓

## Pubs ↔ Pablo reconciliation

**No "Pubs" entry exists in the current `key_roles` array.** The stderr warning code path is in place but did not fire. No reconciliation required.

If "Pubs" was ever in a prior snapshot but not the current state, no action needed. The Pablo role payload now carries a note explicitly tagging the open question for Matt's future reference.

## Deviations from PLAN

**Schema deviation: `title:` not `role:`.** PLAN's target role objects used `role:` key. Live `business_profiles.key_roles` schema uses `title:` (verified via snapshot from 68-01). Script uses `title:` to match the live schema and the wizard reads at [Step4AnnualPlan.tsx:179](src/app/goals/components/Step4AnnualPlan.tsx#L179). Documented inline at top of script. Functional impact: nil (wizard reads `role.name` for display; the title field is metadata Matt can edit in the profile UI).

No other deviations.

## Acceptance criteria

### Static (all pass)
- ✓ Script exists, `node --check` passes
- ✓ Contains `'678ae542-7f0b-43d1-8784-e7341767c250'`
- ✓ Contains all 4 `owner_hours_per_week_*` fields with correct integer values (50/40/25/10)
- ✓ Contains `desired_hours: 10`
- ✓ Contains `'Foreman (Lockup → Finish)'`, `'Foreman (Setup → Lockup)'`
- ✓ Contains `'Carly'`, `'Cooper'`, `'Chris'`
- ✓ Contains `'promotion_candidate'`
- ✓ Contains the literal stderr warning `⚠️ FOUND 'Pubs' entry`

### Live (all pass)
- ✓ Dry-run reports `Roles change required: YES`, owner-hours all CHANGE, `business_profiles change needed: YES`, `business_financial_goals change needed: YES`
- ✓ First `--apply` patched both tables successfully
- ✓ Second `--apply` reports both tables "no changes needed" (idempotency)
- ✓ "Pubs" reconciliation flag code path executed without firing (no Pubs entry present)

## Files

| Path | Status |
|---|---|
| `scripts/68-04-armstrong-team-roster-and-owner-hours.mjs` | Created |
| (Armstrong production data) | `business_profiles.key_roles` patched (7→10), `owner_info.desired_hours` patched (0→10), `business_financial_goals.owner_hours_per_week_*` patched (4 fields) |

## Next plan

**Plan 68-05** — Add 8 KPIs to `business_kpis`. **Critical:** use `business_id = 'a0bf1b0a-663e-4636-8c0d-eef62972dcbc'` (businesses.id), NOT `business_profiles.id`, per the dual-ID discovery in 68-01.

## Self-Check

PASSED. All criteria met. Idempotency confirmed. Schema deviation (`title:` vs `role:`) documented and harmless. Pubs reconciliation flag code in place but did not need to fire.
