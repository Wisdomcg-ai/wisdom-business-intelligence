-- ============================================================================
-- R15 (repo reconciliation) — rename 22 dead/backup tables to deprecated_*.
-- ============================================================================
-- Applied to prod 2026-06-02 (apply_migration `r15_deprecate_dead_tables`). All 22
-- verified zero real app usage (zero `.from()` refs, zero FK dependents; only
-- live-DB-gated RLS-comments test + generated types referenced them).
-- This file brings the REPO into line so the fork inherits the deprecation.
--
-- Reversible (rename back). Hard-drop is a SEPARATE future migration after a bake
-- period (see .planning/codebase/R15-DEPRECATED-TABLES.md). Canonical tables:
-- KPIs → business_kpis, Goals → business_financial_goals.
-- Idempotent (IF EXISTS); no-op on prod (already renamed).
-- ============================================================================
ALTER TABLE IF EXISTS "public"."assessments_backup" RENAME TO "deprecated_assessments_backup";
ALTER TABLE IF EXISTS "public"."kpi_definitions_backup" RENAME TO "deprecated_kpi_definitions_backup";
ALTER TABLE IF EXISTS "public"."strategic_kpis_backup" RENAME TO "deprecated_strategic_kpis_backup";
ALTER TABLE IF EXISTS "public"."strategic_initiatives_backup" RENAME TO "deprecated_strategic_initiatives_backup";
ALTER TABLE IF EXISTS "public"."life_goals" RENAME TO "deprecated_life_goals";
ALTER TABLE IF EXISTS "public"."forecast_insights" RENAME TO "deprecated_forecast_insights";
ALTER TABLE IF EXISTS "public"."forecast_values" RENAME TO "deprecated_forecast_values";
ALTER TABLE IF EXISTS "public"."strategic_kpis" RENAME TO "deprecated_strategic_kpis";
ALTER TABLE IF EXISTS "public"."strategic_wheels" RENAME TO "deprecated_strategic_wheels";
ALTER TABLE IF EXISTS "public"."success_disciplines" RENAME TO "deprecated_success_disciplines";
ALTER TABLE IF EXISTS "public"."annual_plans" RENAME TO "deprecated_annual_plans";
ALTER TABLE IF EXISTS "public"."user_businesses" RENAME TO "deprecated_user_businesses";
ALTER TABLE IF EXISTS "public"."user_selected_kpis" RENAME TO "deprecated_user_selected_kpis";
ALTER TABLE IF EXISTS "public"."kpi_alerts" RENAME TO "deprecated_kpi_alerts";
ALTER TABLE IF EXISTS "public"."kpi_benchmarks" RENAME TO "deprecated_kpi_benchmarks";
ALTER TABLE IF EXISTS "public"."kpi_tracking_values" RENAME TO "deprecated_kpi_tracking_values";
ALTER TABLE IF EXISTS "public"."kpi_values" RENAME TO "deprecated_kpi_values";
ALTER TABLE IF EXISTS "public"."swot_collaborators" RENAME TO "deprecated_swot_collaborators";
ALTER TABLE IF EXISTS "public"."swot_comments" RENAME TO "deprecated_swot_comments";
ALTER TABLE IF EXISTS "public"."swot_comparisons" RENAME TO "deprecated_swot_comparisons";
ALTER TABLE IF EXISTS "public"."swot_history" RENAME TO "deprecated_swot_history";
ALTER TABLE IF EXISTS "public"."swot_templates" RENAME TO "deprecated_swot_templates";
