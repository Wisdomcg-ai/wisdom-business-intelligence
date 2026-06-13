# R15 — Dead/Backup Table Deprecation + Canonical Tables (WisdomBI prod)

**Status:** rename-to-deprecated DONE in prod (`uudfstpvndurzwnapibf`, migration `r15_deprecate_dead_tables`). Hard-drop deferred until a bake period confirms nothing references them. Prod-only (fork skips Phase C).

## Canonical tables (declare before the fork — roadmap R15 requirement)
A fork engineer asking "where do X live?" gets one answer:
- **KPIs → `business_kpis`.** All other KPI tables are dead/deprecated (see list). KPI *catalog* = `kpi_definitions`; per-business selected KPIs + values = `business_kpis`; history = `kpi_history`; actuals = `kpi_actuals`.
- **Goals → `business_financial_goals`.** The financial-goal canonical. (`goals`, `strategic_goals`, `annual_targets`, `vision_targets` serve distinct non-financial-goal purposes and remain.)

## Deprecated (renamed `deprecated_<name>`, pending hard-drop)
All 22 verified: **zero `.from()` refs, zero FK dependents, zero real app usage** (the only code mentions were the live-DB-gated RLS-comments test + generated `types/database.ts` entries).

**Backups (4):** assessments_backup (2), kpi_definitions_backup (15), strategic_kpis_backup (7), strategic_initiatives_backup (16).
**Abandoned features (6):** strategic_wheels (4), swot_templates (4), life_goals (3), strategic_kpis (2), forecast_insights (1), user_businesses (1).
**Empty dead (12):** annual_plans, forecast_values, kpi_alerts, kpi_benchmarks, kpi_tracking_values, kpi_values, success_disciplines, swot_collaborators, swot_comments, swot_comparisons, swot_history, user_selected_kpis — all 0 rows.

## Remaining R15 steps (deferred)
1. **Bake** (~1–2 weeks): watch Sentry/logs for any error referencing a `deprecated_*` table. None expected.
2. **Code cleanup PR:** regenerate/trim `src/types/database.ts` (drop the 22 entries) and remove `swot_templates` + `kpi_benchmarks` from `src/__tests__/migrations/db-06-rls-comments.test.ts`.
3. **Hard-drop:** `DROP TABLE deprecated_<name>` for all 22 (after bake) + remove them from `supabase/migrations/00000000000000_baseline_schema.sql` so the fork's schema is clean.
4. **Rollback (if needed):** `ALTER TABLE deprecated_<name> RENAME TO <name>` — instant.

## Reversibility
Nothing dropped or data-moved. Each rename reverts in one statement; the migration is fully reversible.
