# 75-01 — FK-Readiness Cleanse Report (R-6)

**Date:** 2026-06-23 (cleanse applied 2026-06-24) · **Tools:** `scripts/audit-dual-id-fk-readiness.mjs`
(read-only) + `scripts/cleanse-dual-id-kpi-dups.mjs` (snapshot+delete) · **Source:** prod
**Verdict:** **GREEN** — after the cleanse, all 10 FK-target tables are FK-ready. 75-02 unblocked.

## APPLIED (2026-06-24)
Deleted the **13 stale biz-keyed `business_kpis` duplicates** (12 Precision + 1 Digital Bond) after a
13/13 safety check (each had an active, identical-value profile-keyed twin). Snapshot:
`snapshots/75-01-business_kpis-dups-2026-06-24.json` (reversible). Result: `business_kpis` 71 → 58 rows,
0 biz-keyed. `business_financial_goals` needed no row cleanse (14 already clean). Re-audit = all GREEN.

## Audit results

| Table | FK target | total | wrong | orphan | uncast | null_pid | verdict |
|---|---|---|---|---|---|---|---|
| activity_log | business_profiles | 2545 | 0 | 0 | 0 | — | **GREEN** |
| plan_snapshots | business_profiles | 62 | 0 | 0 | 0 | — | **GREEN** |
| sprint_key_actions | business_profiles | 3 | 0 | 0 | 0 | — | **GREEN** |
| kpi_history | business_profiles | 0 | 0 | 0 | 0 | — | **GREEN** |
| issues_list | businesses | 23 | 0 | 0 | 0 | — | **GREEN** |
| open_loops | businesses | 38 | 0 | 0 | 0 | — | **GREEN** |
| strategy_data | businesses | 2 | 0 | 0 | 0 | — | **GREEN** |
| cashflow_assumptions | businesses | 1 | 0 | 0 | 0 | — | **GREEN** |
| **business_financial_goals** | (dual-column) | 14 | 0 | 0 | 0 | **14** | **RED** |
| **business_kpis** | (dual-column) | 71 | 0 | 0 | 0 | **71** | **RED** |

The 8 GREEN tables: text columns cast cleanly to uuid and every value is a valid `business_profiles.id`
(or `businesses.id` for Group B). **Ready for 75-02 as-is** — FK goes on the live `business_id` column.

## The dual-column finding (overrides the FK plan's tentative design)

`business_profile_id` is **100% NULL** on both tables — the app never writes it. So the FK-INTEGRITY-PLAN's
suggestion ("FK on `business_profile_id`, backfill from legacy") targets a **dead column**. The live
canonical column is **`business_id`**. Legacy `business_id` classification:

- **business_financial_goals (14):** `business_id` = **14 profile, 0 biz, 0 orphan** → 100% clean.
  → **FK-ready on `business_id`** after the text→uuid cast. `business_profile_id` is dead → drop it.
- **business_kpis (71):** `business_id` = **58 profile + 13 biz** → mixed. The **13 biz-keyed rows are
  duplicates** — each has a profile-keyed twin with the same KPI name under the resolved profile
  (biz `6cb999b5`→prof `86e9d84f` = Precision, 12 KPIs; biz `78db3c56`→prof `61a7809f` = Digital Bond,
  "Automation Rate"). These are the pre-#312 coach-mode fragments.

## The 13 dups — RESOLVED: lossless delete

Initially the dups looked "newer" (updated 2026-06-19 vs twins 2026-05-04), implying a merge. But a
field-level diff (target_value, current_value, year1/2/3_target, what_to_do, notes) shows **all 13 are
identical value-copies of their active twins — 0 value differences**. The 2026-06-19 `updated_at` was just
the incident bumping the timestamp; there is **no unique data** in the dups. → **plain DELETE is lossless.**
(Re-key isn't viable — collides 13/13; deactivate doesn't help — the FK rejects a biz-keyed row regardless
of `is_active`, so the rows must be removed.)

## Regeneration question — RESOLVED: won't regenerate

The dups' `updated_at = 2026-06-19` is the **same day #312 (`f0729e54`) merged** — the dual-ID save fix.
They were written by the OLD save path during that day's coach-mode incident (Precision demo + Digital
Bond live), and #312 fixed the path the same day (live on main ~5 days). Post-#312 the save resolves to the
profile id, so **no new biz-keyed rows are written** — the 13 are pre-fix leftovers, safe to delete.

## Recommended 75-02 revision (pending Matt)
- FK target for both dual-column tables = **`business_id`** (cast text→uuid), NOT `business_profile_id`.
- **Drop the dead `business_profile_id`** column on both (after confirming no code reads it).
- Pre-FK cleanse = **merge the 13 dup business_kpis rows** into their twins (75-01 Task 2, snapshotted,
  signed off), gated on confirming the save path no longer emits biz-keyed rows.
- bfg needs no row cleanse — just the cast + FK.

**GATE:** RED until the 13-dup merge runs and `business_kpis.business_id` is 100% profile. The 8 GREEN
tables could proceed independently if 75-02 is split.
