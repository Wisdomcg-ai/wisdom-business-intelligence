# Dual-ID FK Integrity Plan

**Origin:** 2026-06-11 SWOT "disappeared" incident (Efficient Living). Root cause = a
table whose `business_id` had **no foreign key**, so data orphaned silently when the
read key drifted / a profile was recreated. This plan closes the whole bug class by
adding FKs to the remaining un-protected `business_id` columns.

## Why FKs

A foreign key would have made the SWOT and forecast orphans **impossible**:
- An orphaned `business_id` (pointing at a deleted/old id) can't be inserted.
- `ON DELETE CASCADE` removes child rows when a profile/business is deleted, instead of
  leaving them dangling (which is exactly how the Oh Nine stale forecast + SWOT orphans
  were created — profile recreated, children left behind).

## Audit result (prod, 2026-06-11)

- ~70 `business_id` columns **already FK-protected** → not at risk.
- **swot_analyses** → FIXED (migration `20260611000000_...`).
- **financial_forecasts** → 2 dead duplicate rows (Oh Nine Dec-2025 stale; orphan account
  `5c30a2be`). Not user-facing; must be removed before its FK can be added.
- All other no-FK tables are **internally consistent** (one key each) but unprotected.
- False alarms cleared: `vision_targets` (user_id + business_id both populated → reads
  match) and `business_kpis` (read/write share the same profile id; one-page-plan path
  works via fallback) are FINE. No action.

## Tables to protect, grouped by FK target

### Group A → `business_profiles(id)` ON DELETE CASCADE  (profile-keyed)
uuid columns (FK-ready, no prep): `strategic_initiatives` (448), `sync_jobs` (289),
`kpi_actuals` (73), `operational_activities` (66), `weekly_metrics_snapshots` (51),
`weekly_reviews` (42), `forecast_investments` (6), `forecast_years` (3),
`quarterly_snapshots` (3), `dashboard_preferences` (2), `forecast_wizard_sessions` (2),
`vision_targets` (2), `financial_forecasts` (37 — **after** orphan cleanup).

text columns (need `ALTER COLUMN business_id TYPE uuid USING business_id::uuid` first —
all values verified to be valid profile UUIDs): `activity_log` (2545), `plan_snapshots`
(58), `sprint_key_actions` (3), `kpi_history` (0).

needs design decision (have BOTH `business_id` text AND `business_profile_id` uuid):
`business_financial_goals` (14), `business_kpis` (55). Recommend putting the FK on the
existing uuid `business_profile_id` column and backfilling/retiring the legacy text
`business_id`. Confirm `business_profile_id` is fully populated before deciding.

### Group B → `businesses(id)` ON DELETE CASCADE  (businesses-keyed)
uuid columns, no orphans found: `issues_list` (24, 5 null), `open_loops` (45, 12 null),
`strategy_data` (15, 13 null), `cashflow_assumptions` (1). NULLs are allowed by FK.

## STATUS (2026-06-11)

- ✅ **Pre-clean:** 2 dead `financial_forecasts` rows deleted (Oh Nine stale dup; orphan
  account `5c30a2be`). 0 orphans remain anywhere.
- ✅ **Phase A DONE:** FKs added to the **17 uuid-typed** `business_id` columns, all
  `ON DELETE CASCADE`. Migration `20260611010000_fk_integrity_phase_a_uuid_business_id.sql`,
  applied to prod + recorded. (13 → business_profiles, 4 → businesses.)
- ⏳ **Phase B PENDING:** the 6 **text-typed** columns — see below.

## Phase B (deferred — needs an RLS rewrite, not just a type change)

Tables: `activity_log`, `business_financial_goals`, `business_kpis`, `kpi_history`,
`plan_snapshots`, `sprint_key_actions`.

These can't simply be converted text→uuid: their RLS policies compare `business_id` as
**text** — e.g. `(b.id)::text = business_id` and
`business_id = ANY(auth_get_accessible_business_ids_text())`. Changing the column to uuid
breaks those comparisons (`text = uuid` errors), locking users out of the tables. So Phase B
must, in one migration:
1. Rewrite each affected policy to compare as uuid (`b.id = business_id`,
   `business_id = ANY(auth_get_accessible_business_ids())` — note the non-`_text` helper,
   which `kpi_history` already uses).
2. `ALTER COLUMN business_id TYPE uuid USING business_id::uuid` (values pre-validated:
   0 nulls, 0 bad formats).
3. For `business_financial_goals` / `business_kpis`: the uuid `business_profile_id` column
   is empty (NULL on all rows) — FK the converted `business_id`; leave/ drop the unused
   `business_profile_id` separately.
4. Add FKs → `business_profiles(id)` `ON DELETE CASCADE`.
5. Optional cleanup: `business_financial_goals` has 4 redundant indexes on `business_id`.

Run as a GSD phase with tests (RLS regression). Lower urgency: these tables are internally
consistent today, so nothing is currently broken — Phase B is pure prevention.

## Risk notes
- `ON DELETE CASCADE` is a **behavior change**: deleting a profile/business now deletes its
  children. This is the desired anti-orphan behavior and matches how `swot_*` already
  cascade, but confirm no code relies on soft-deleting a parent while keeping children.
- Type conversions and FK validation should run in a low-traffic window.
- This is a multi-table schema change → run as a GSD phase with tests, not ad-hoc.

## Open questions for Matt
- OK to **delete** the 2 dead `financial_forecasts` rows? (reversible via snapshot)
- CASCADE vs SET NULL preference on parent deletion? (recommend CASCADE)
- Retire the legacy text `business_id` on `business_financial_goals`/`business_kpis`?
