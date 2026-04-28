# Phase 49: Database Integrity Hygiene

**Milestone:** v1.1 — Codebase Hardening
**Status:** Not started
**Source:** `CODEBASE-AUDIT.md` Section D (Database), written 2026-04-28

## Goal

Additive-only DB improvements. ON DELETE clauses on the 56 orphan-prone FKs, soft-delete + audit columns on the 8 most-mutated financial tables, and migration-naming hygiene. **No destructive schema changes** — every migration is additive or constraint-only.

## Why now

- 56 FKs on `businesses.id` lack `ON DELETE` clauses today; deleting a business leaves orphan rows in 56 child tables (audit Section D #1). The phantom-row problem from Phase 41 was a symptom of this.
- The 8 most-mutated financial tables have no `deleted_at` / `deleted_by` columns — there's no soft-delete capability for finance data, which is required for any auditable system.
- Done last because each ON-DELETE migration is tested against a seeded preview branch (delete a test user, confirm downstream rows behave correctly) — this requires the Phase 44 CI/preview-branch test pattern to be solid first.

## Dependencies

- **Phase 44 (Test Gate & CI Hardening)** — preview-branch testing per migration is the validation pattern. Without enforcing CI we can't trust the per-migration sign-off.

## Blast Radius

**Low — additive-only migrations and constraint additions.** ON DELETE clauses are tested against seeded preview branches before merging to production. Soft-delete and audit columns are added as nullable; existing inserts/updates need no change. RLS tightening (DB-06) only narrows policies if intent is per-business — system reference data stays open with documented intent. Rollback per migration is `DROP CONSTRAINT` or `DROP COLUMN`; no data loss.

## Requirements (1:1 from REQUIREMENTS.md)

- **DB-01** — Add nullable `deleted_at`, `deleted_by` columns to the 8 most-mutated financial tables: `financial_forecasts`, `forecast_employees`, `forecast_pl_lines`, `monthly_actuals`, `xero_pl_lines`, `cfo_report_status`, `cfo_email_log`, `account_mappings`. Single additive migration.
- **DB-02** — Add nullable `created_by`, `updated_by` columns to the same 8 tables. Backfill `created_by` from `forecast_audit_log` where possible. Single additive migration.
- **DB-03** — Audit each of the 56 orphan-prone FKs (per audit Section D #1). Decide CASCADE vs SET NULL per FK; document the choice in `docs/db/fk-policy.md`.
- **DB-04** — Apply `ON DELETE` clauses one-or-two per migration, tested against a seeded preview branch by deleting a test user and confirming downstream rows behave correctly. Target: all 56 FKs covered by phase end.
- **DB-05** — Rename the two date-only migration files (`20260424_cfo_email_log.sql`, `20260427_unique_active_forecast_per_fy.sql`) to full `YYYYMMDDHHMMSS` form for ordering consistency.
- **DB-06** — Tighten the 3 over-permissive RLS policies (`swot_templates`, `kpi_benchmarks`, `kpi_definitions` use `USING (true)`) — confirm intent (system reference data vs per-business). Add comments to the migration; only narrow if intent is per-business.

## Success Criteria (observable)

1. **The 8 financial tables expose `deleted_at`, `deleted_by`, `created_by`, `updated_by` columns** — verified by `\d financial_forecasts` etc. in `psql` and by a single migration applied successfully to all 3 production tenants. Existing inserts continue working unchanged. (Validates DB-01, DB-02.)
2. **`docs/db/fk-policy.md` exists and documents the CASCADE vs SET NULL decision for each of the 56 FKs**, signed off by the developer (Matt) before any DB-04 migration ships. (Validates DB-03.)
3. **A seeded preview-branch test deleting a test user shows zero orphan rows in the 56 target child tables**, with each FK's behaviour matching the documented policy in `fk-policy.md`. The test is captured in a Playwright or migration-test script that runs per FK migration. (Validates DB-04.)
4. **`ls supabase/migrations/` shows every migration file in `YYYYMMDDHHMMSS_*.sql` form** — no date-only filenames remain. (Validates DB-05.)
5. **The 3 `USING (true)` RLS policies (`swot_templates`, `kpi_benchmarks`, `kpi_definitions`) carry an explicit migration comment recording the intent** (system reference data — open by design — vs per-business — narrowed). Any policy narrowed has a regression test confirming a non-owner cannot read another tenant's row. (Validates DB-06.)

## Evidence in audit

- Audit Section D #1 — 56 FKs on `businesses.id` lack `ON DELETE` clauses (verified via `information_schema.referential_constraints`).
- Audit Section D — 8 most-mutated financial tables have no soft-delete columns; the phantom-row work in Phase 41 confirmed this is needed.
- Audit Section D #5 — `swot_templates`, `kpi_benchmarks`, `kpi_definitions` use `USING (true)` on RLS policies with no documented intent.
- Migrations `20260424_cfo_email_log.sql` and `20260427_unique_active_forecast_per_fy.sql` violate the project's `YYYYMMDDHHMMSS_*.sql` naming convention.

## Out of scope for this phase

- Any destructive schema change (DROP COLUMN, DROP TABLE, schema renames) — defer to a separate milestone with explicit migration sign-off.
- Backfilling `updated_by` historically (only `created_by` from `forecast_audit_log` per DB-02 — `updated_by` populates from this point forward).
- Refactoring `auth_can_access_business` or other helper functions — they're working as designed.
- Index tuning / query plan work — separate performance milestone.
- Removing the 41 SECURITY DEFINER functions or changing `SET search_path` patterns — they're hardened correctly already.

## Plans

TBD — to be drafted at `/gsd-plan-phase 49`.
