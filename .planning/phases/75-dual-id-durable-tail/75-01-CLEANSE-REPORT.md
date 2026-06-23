# 75-01 — FK-Readiness Cleanse Report (R-6)

**Date:** 2026-06-23 · **Tool:** `scripts/audit-dual-id-fk-readiness.mjs` (read-only) · **Source:** prod
**Verdict:** **RED** — 8/10 FK-target tables are FK-ready; the 2 dual-column tables need a decision + cleanse.

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

## Why the 13 can't just be retired or re-keyed

- **Re-key → collision:** setting their `business_id` to the profile id collides with the existing
  profile-keyed twin (13/13). Not viable.
- **Plain delete/deactivate → data loss:** the **dups are NEWER** (updated 2026-06-19) than their twins
  (2026-05-04) — except Automation Rate (both 2026-06-19). Under #312's "newest-updated wins" read dedupe,
  the dups are the values currently displayed for 12 of Precision's KPIs. Deleting them would silently
  revert those KPIs to the older profile-keyed copies.
- **Correct path = MERGE:** for each dup, carry its (newer) values onto the canonical profile-keyed twin,
  then delete the biz-keyed dup. Snapshot first; operator sign-off (Task 2 is not autonomous).

## ⚠️ Open question that gates the cleanse

The 13 biz-keyed rows carry `updated_at = 2026-06-19` — **after** Phase 74 (#289, 2026-06-13) deployed the
dual-ID save fixes. Either (a) a KPI save path still writes biz-keyed rows (a gap in #289/#312 → dups would
regenerate after cleanse), or (b) something bumped these rows' `updated_at` on 2026-06-19 without creating
them. **Confirm the save path is truly profile-only before merging**, else the cleanse is futile.

## Recommended 75-02 revision (pending Matt)
- FK target for both dual-column tables = **`business_id`** (cast text→uuid), NOT `business_profile_id`.
- **Drop the dead `business_profile_id`** column on both (after confirming no code reads it).
- Pre-FK cleanse = **merge the 13 dup business_kpis rows** into their twins (75-01 Task 2, snapshotted,
  signed off), gated on confirming the save path no longer emits biz-keyed rows.
- bfg needs no row cleanse — just the cast + FK.

**GATE:** RED until the 13-dup merge runs and `business_kpis.business_id` is 100% profile. The 8 GREEN
tables could proceed independently if 75-02 is split.
