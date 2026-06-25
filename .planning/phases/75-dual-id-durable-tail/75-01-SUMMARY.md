# 75-01 SUMMARY — R-6 Data cleanse + FK-readiness (COMPLETE 2026-06-24)

**Outcome: GREEN.** All 10 FK-target columns are FK-ready; Wave 75-02 is unblocked.

## What was done
- **Task 1 (read-only audit):** `scripts/audit-dual-id-fk-readiness.mjs` classified every FK-target column
  against prod. 8/10 GREEN immediately (`activity_log` 2545, `plan_snapshots`, `sprint_key_actions`,
  `kpi_history`, + Group B `issues_list`/`open_loops`/`strategy_data`/`cashflow_assumptions`).
- **Key finding (design correction):** on the dual-column tables the uuid `business_profile_id` is 100%
  NULL (dead — the app keys on `business_id`). So the FK target is the live **`business_id`** (cast
  text→uuid), and `business_profile_id` is dropped. This SUPERSEDES the FK-INTEGRITY-PLAN's tentative
  "FK on business_profile_id" — recorded in 75-02.
- **Task 2 (cleanse, operator-approved):** `business_kpis.business_id` was 58 profile + 13 biz. The 13
  biz-keyed rows were confirmed **exact value-copies** of active profile-keyed twins (12 Precision + 1
  Digital Bond), left over from the 2026-06-19 incident; #312 (same-day, deployed) stops regeneration.
  Deleted them via `scripts/cleanse-dual-id-kpi-dups.mjs --apply` (13/13 safety check, snapshot first).
  `business_kpis` 71 → 58, 0 biz-keyed. `business_financial_goals` needed no cleanse (14 clean).
- **Task 3:** 75-01-CLEANSE-REPORT.md = GREEN verdict + the applied results.

## Prod writes
- DELETE 13 `business_kpis` rows. Reversible via `snapshots/75-01-business_kpis-dups-2026-06-24.json`.
- No schema/migration changes (those are 75-02).

## Hand-off to 75-02
FK target for the dual-column tables = `business_id` (cast), drop `business_profile_id`. All 10 tables GREEN.
