# Audit Pass 2 — Data-Integrity & Money-Math Gaps (NET-NEW)

**Generated:** 2026-05-31 · **Branch:** main · **Commit:** e1b4e7c7 (Phase 70 merged)
**Scope:** Net-new data-integrity + financial-correctness findings the first pass (C-01..C-40 / R1..R28) missed, plus Phase-70 drift.
**Method:** Static analysis only — migrations + source. No DB queries, no app run, no network.
**Convention:** Each finding has ID (DM-N#), Sev, Evidence (file:line), Effort (S/M/L/XL), Fork-split (CODE/PROD/BOTH), why-missed.

---

## (a) NET-NEW FINDINGS

### DM-N1 · `xero_pl_lines.business_id` carries TWO contradictory FK constraints — CRITICAL
- **Sev:** CRITICAL · **Effort:** M · **Fork:** CODE
- **What:** The migration set declares two mutually-exclusive foreign keys on the *same* column:
  - `xero_pl_lines_business_id_fkey` → `businesses(id)` **ON DELETE CASCADE** (`baseline_schema.sql:9685`, never dropped — verified no `DROP CONSTRAINT` anywhere)
  - `xero_pl_lines_business_id_fk` → `business_profiles(id)` **ON DELETE RESTRICT** (`20260430000002_xero_pl_lines_business_id_fk.sql:51-56`)
- A single column cannot satisfy FKs to two different tables' PKs at once. The 44.2 migration's pre-flight *requires* every `business_id` to be a `business_profiles.id` — which would make the baseline `→ businesses(id)` FK unsatisfiable for every row. A fresh DB build (or the fork) replaying migrations in order either fails at the 44.2 pre-flight or ends with two contradictory FKs. Delete semantics also conflict: CASCADE says "deleting a business wipes PL lines", RESTRICT says "forbidden".
- **Evidence:** `supabase/migrations/00000000000000_baseline_schema.sql:9685`; `supabase/migrations/20260430000002_xero_pl_lines_business_id_fk.sql:23-56`.
- **Why missed:** R3 only inspected `xero_connections`. R1/R27 treated `xero_pl_lines` CASCADE as the single delete path (the baseline one) and never reconciled it against the 44.2 RESTRICT FK that supersedes it in intent. The contradiction lives across two files.
- **Corrects roadmap:** **R1/R3's "use `businesses.id` as the canonical tenancy root" is WRONG for the core money tables.** Prod keys `xero_pl_lines` to `business_profiles.id` (see DM-N2, and Phase-70 snapshot proof). Canonicalization must reckon with this, not assume `businesses.id`.

### DM-N2 · The two Xero financial tables (P&L vs BS) are keyed to DIFFERENT id-spaces by design — HIGH
- **Sev:** HIGH · **Effort:** L · **Fork:** BOTH
- **What:** Balance-sheet data is split across two tables that use opposite id conventions:
  - `xero_pl_lines.business_id` = `business_profiles.id`; `xero_bs_lines.business_id` = `business_profiles.id` (FK RESTRICT, RLS-protected) — written by `sync-orchestrator.ts` with `profileId` (`sync-orchestrator.ts:385` `business_id: profileId`).
  - `xero_balance_sheet_lines.business_id` = `businesses.id` (FK → `businesses(id)` CASCADE) — written by `monthly-report/sync-xero/route.ts` with `ids.bizId` (`route.ts:318` `business_id: ids.bizId`).
- So `xero_balance_sheet_lines` (businesses.id, CASCADE) and `xero_bs_lines` (business_profiles.id, RESTRICT) both store balance sheets in opposite id-spaces with opposite delete semantics. Consolidation reads `xero_balance_sheet_lines`; reconciliation/orchestrator writes `xero_bs_lines`. Any code reading a money table by a single id-space silently gets partial/empty data; only `resolveBusinessIds(...).all` (which unions both spaces) papers over it.
- **Evidence:** `src/lib/xero/sync-orchestrator.ts:385,406-407`; `src/app/api/monthly-report/sync-xero/route.ts:6 (warning comment),257,318`; `supabase/migrations/20260420032941_consolidation_bs_translation.sql:42-50`; `supabase/migrations/20260430000010_xero_bs_lines.sql:42,71-74`.
- **Why missed:** First pass treated the dual-ID issue as a per-row *data* problem (R14) and a resolver *code* problem (R1). It never enumerated that the schema *itself* hard-codes two id conventions across sibling money tables, making "pick ONE canonical id" a schema migration, not just a resolver swap.

### DM-N3 · Two divergent balance-sheet tables = two sources of truth — HIGH
- **Sev:** HIGH · **Effort:** M · **Fork:** CODE
- **What:** `xero_balance_sheet_lines` (created 2026-04-20, monthly-values jsonb, businesses.id, **no RLS policy found in its creation migration**) and `xero_bs_lines` (created 2026-04-30, long-format, business_profiles.id, RLS enabled) both hold balance-sheet lines. The monthly report + consolidation read `xero_balance_sheet_lines`; the Phase-44 reconciliation gates and sync-orchestrator use `xero_bs_lines`. Nothing keeps the two in sync — a BS sync that updates one table does not update the other, so the report BS and the reconciliation BS can silently diverge.
- **Evidence:** readers of `xero_balance_sheet_lines`: `src/lib/consolidation/balance-sheet.ts`, `src/lib/consolidation/cashflow.ts`, `src/app/api/monthly-report/sync-xero/route.ts`; reader/writer of `xero_bs_lines`: `src/lib/xero/sync-orchestrator.ts`. Creation: `20260420032941_consolidation_bs_translation.sql:23` vs `20260430000010_xero_bs_lines.sql:42`.
- **Why missed:** C-19/ARCHITECTURE flagged "two forecasts tables / wide_compat ambiguity" (R19) but never the **two balance-sheet tables**. RLS absence on `xero_balance_sheet_lines` is also a net-new gap (compare to the RLS that `xero_bs_lines` and `xero_pl_lines` carry).

### DM-N4 · `unique_active_forecast_per_fy` is defeated by dual-ID pollution — HIGH
- **Sev:** HIGH · **Effort:** M · **Fork:** PROD (constraint forks clean; data is prod)
- **What:** The partial unique index enforces one active forecast per `(business_id, fiscal_year, forecast_type)`. But `financial_forecasts.business_id` is a MIXED column (baseline audit: 8 profile / 26 biz / 2 orphan). Two active forecasts for the SAME real business — one row keyed `businesses.id`, the other `business_profiles.id` — have *different* `business_id` values, so **both pass the unique index**. The "exactly one active forecast" guarantee the constraint was written to provide does not hold under pollution; "find the active forecast" stays non-deterministic.
- **Evidence:** `supabase/migrations/20260427000000_unique_active_forecast_per_fy.sql:8-11`; `financial_forecasts.business_id` has NO FK (see table b); MIXED-row counts from the frozen baseline.
- **Why missed:** R14 lists `financial_forecasts` as a MIXED table to cleanse but never connected the pollution to the *defeat of the uniqueness invariant* that other code relies on.

### DM-N5 · `xero_balance_sheet_lines` BS sync is non-atomic AND dual-ID-fragile (extends R25) — HIGH
- **Sev:** HIGH · **Effort:** M · **Fork:** CODE
- **What:** R25 already flags the delete-then-insert + `success:true` on insert failure. NET-NEW layer: the delete is `delete().in('business_id', ids.all)` (ALL resolved id-spaces) while the insert writes a SINGLE `business_id = ids.bizId`. If the tenant's existing rows were stored under a *different* id-space than `bizId`, the delete wipes the broad set and the insert re-writes under only one space — so a partial-failure or id-space mismatch can leave the BS empty *and* the surviving/rewritten rows keyed inconsistently vs `xero_pl_lines` (profileId). The non-atomicity and the id-space asymmetry compound.
- **Evidence:** `src/app/api/monthly-report/sync-xero/route.ts:338-345` (delete `.in('business_id', ids.all)`), `:318` (insert `business_id: ids.bizId`), `:347-357` (insert-fail returns warning, success preserved).
- **Why missed:** R25 saw the atomicity bug but not the `ids.all`-delete vs `bizId`-insert id-space asymmetry sitting in the same block.

### DM-N6 · Cashflow `getLineValue` discards legitimate zero actuals → overstates actualized cash — MEDIUM
- **Sev:** MEDIUM · **Effort:** S · **Fork:** CODE
- **What:** `getLineValue` returns the forecast value whenever the actual is `0`: the guard is `actual_months[mk] !== undefined && actual_months[mk] !== 0`. A genuine actual of **exactly $0** for an account in a closed month (e.g. zero revenue that month) is treated as "no actual" and the engine substitutes the *forecast* figure instead. In actualized months this overstates cash inflow/outflow by the forecast amount of any account that legitimately printed zero.
- **Evidence:** `src/lib/cashflow/engine.ts:805-812`.
- **Why missed:** R6 covered keyword classification + hardcoded AUD in the cashflow engine but not the actual-vs-forecast selection logic.

### DM-N7 · Xero report parsers key accounts by display NAME → same-named accounts overwrite each other — MEDIUM
- **Sev:** MEDIUM · **Effort:** S · **Fork:** CODE
- **What:** `parsePLReport`/`parseSingleMonthBSReport` build `Map<account_name, …>`. Two Xero accounts sharing a display name (common: duplicated "Other", or identically-named accounts across sub-sections) cause the second to silently overwrite the first → understated section totals. Xero's stable identifier is `account_id`/`account_code`, not name.
- **Evidence:** `src/app/api/monthly-report/sync-xero/route.ts:111-114` (`accounts.set(name,…)`), `:167-173` (BS, `accounts.set(name,…)`).
- **Why missed:** R6 flagged name-keyword *classification*; this is name-keyed *aggregation/dedup*, a distinct collision class.

### DM-N8 · Consolidation FX skipped when `functional_currency` is NULL (amplifies R6 hardcoded AUD) — MEDIUM
- **Sev:** MEDIUM · **Effort:** S · **Fork:** CODE
- **What:** FX translation is short-circuited when `tenant.functional_currency === business.presentation_currency`. `presentation_currency` is hardcoded `'AUD'` (R6) AND each tenant's `functional_currency` defaults to `'AUD'` when the column is null (`engine.ts:123` `c.functional_currency || 'AUD'`). A tenant whose Xero org genuinely reports in NZD/USD but whose `functional_currency` column is NULL is silently treated as AUD: foreign amounts are summed 1:1 into the AUD consolidation with **no conversion** — a wrong number with no error.
- **Evidence:** `src/lib/consolidation/engine.ts:123,136`; `src/lib/consolidation/balance-sheet.ts:325` (`if (… === business.presentation_currency) return passthrough`).
- **Why missed:** R6 named the hardcoded `'AUD'` presentation currency but not the NULL→AUD *functional* default that makes the FX short-circuit fire incorrectly.

### DM-N9 · Reconciliation gates match equity/earnings accounts by NAME substring — verification blind spot — MEDIUM
- **Sev:** MEDIUM · **Effort:** S · **Fork:** CODE
- **What:** Gate 2 articulation sums "current year earnings"/"retained earnings" by case-insensitive substring (`bsEarningsTotal`). A tenant equity sub-account whose name *contains* "retained earnings" is double-counted; a Xero org that renamed its system earnings account is missed — so Gate 2 can pass/fail on the wrong basis. Separately, Gate 4 only sums rows typed exactly `asset|liability|equity`; any BS row parsed with a different/blank `account_type` is silently dropped from the balance check, so a genuine imbalance hiding in an unclassified row passes Gate 4.
- **Evidence:** `src/lib/xero/reconciliation-gates.ts:71-85` (name substring), `:258-268` (Gate 4 drops non-asset/liability/equity rows).
- **Why missed:** First pass treated the gates as the trusted oracle (referenced in MEMORY as the verifier) and never audited the gates' own classification fragility.

### DM-N10 · `subscription_budgets.forecast_id → forecasts` SET NULL silently unlinks a budget's forecast — LOW/MEDIUM
- **Sev:** LOW · **Effort:** S · **Fork:** CODE
- **What:** Deleting a `forecasts` row nulls `subscription_budgets.forecast_id` (SET NULL). The budget row survives but loses its forecast linkage with no flag — a budget that silently detaches from the plan it was sized against. Combined with the two-`forecasts`-tables ambiguity (R19), the wrong table's delete can orphan budgets.
- **Evidence:** `supabase/migrations/00000000000000_baseline_schema.sql` FK `subscription_budgets.forecast_id → forecasts ON DELETE SET NULL` (see table c).
- **Why missed:** R27 audited the businesses-delete cascade chain, not the forecast-delete SET-NULL fan-out.

### DM-N11 · Deleting a forecast CASCADE-wipes all child money rows with no soft-delete (R27 sibling) — MEDIUM
- **Sev:** MEDIUM · **Effort:** M · **Fork:** CODE
- **What:** `financial_forecasts.id` is the CASCADE parent of `cashflow_assumptions`, `cashflow_settings`, `forecast_decisions`, `forecast_investments`, `forecast_years` (all `forecast_id → financial_forecasts ON DELETE CASCADE`). A single forecast delete silently wipes every assumption, setting, investment, decision and year-rollup beneath it — the forecast analog of R27's client-delete cascade, but R27 only covered the *business* delete. No soft-delete/backup on the forecast delete path.
- **Evidence:** `supabase/migrations/00000000000000_baseline_schema.sql` FKs `cashflow_assumptions.forecast_id`, `cashflow_settings.forecast_id`, `forecast_decisions.forecast_id`, `forecast_investments.forecast_id`, `forecast_years.forecast_id` → `financial_forecasts` CASCADE (see table c).
- **Why missed:** R27 scoped only the super-admin client (business) delete; the forecast-level cascade is a separate, more-frequently-hit path (coaches delete/recreate forecasts routinely).

### DM-N12 · `financial_forecasts.xero_connection_id → xero_connections` SET NULL — forecast loses its Xero source on reconnect — LOW
- **Sev:** LOW · **Effort:** S · **Fork:** CODE
- **What:** When a `xero_connections` row is deleted (which happens during the reconnect/disconnect cycles that are a known incident class — Phases 53/69), `financial_forecasts.xero_connection_id` is SET NULL. The forecast keeps its materialized numbers but loses the link to the connection they were pulled from — downstream "resync from source" silently can't find the origin. Given `xero_connections` has no FK on its own `business_id` (R3), connection rows are already churn-prone.
- **Evidence:** `supabase/migrations/00000000000000_baseline_schema.sql` FK `financial_forecasts.xero_connection_id → xero_connections ON DELETE SET NULL` (see table c).
- **Why missed:** Xero-durability work (R8) focused on token refresh, not on what a connection delete does to forecast provenance.

---

## (b) ALL business_id-ish columns MISSING a foreign key

R3 captured only `xero_connections.business_id`. Full enumeration (36 columns across 35 tables; `*` = holds money/financial data → highest orphan-risk):

| Table.column | Type | NOT NULL | Money? |
|---|---|---|---|
| activity_log.business_id | text | – | |
| assessments_backup.business_id | uuid | – | |
| business_financial_goals.business_id | text | ✓ | * |
| business_financial_goals.business_profile_id | uuid | – | * |
| business_kpis.business_id | text | ✓ | * |
| business_kpis.business_profile_id | uuid | – | * |
| **cashflow_assumptions.business_id** | uuid | ✓ | * |
| client_error_logs.business_id | uuid | – | |
| daily_musts.business_id | uuid | ✓ | |
| dashboard_preferences.business_id | uuid | ✓ | |
| **financial_forecasts.business_id** | uuid | ✓ | * (MIXED — see DM-N4) |
| **forecast_decisions.business_id** | uuid | ✓ | * |
| **forecast_investments.business_id** | uuid | ✓ | * |
| forecast_wizard_sessions.business_id | uuid | ✓ | * |
| **forecast_years.business_id** | uuid | ✓ | * |
| issues_list.business_id | uuid | – | |
| **kpi_actuals.business_id** | uuid | ✓ | * |
| kpi_history.business_id | text | ✓ | * |
| open_loops.business_id | uuid | – | |
| operational_activities.business_id | uuid | ✓ | |
| pending_xero_connections.business_id | uuid | ✓ | * |
| plan_snapshots.business_id | text | ✓ | |
| **quarterly_snapshots.business_id** | uuid | ✓ | * |
| sprint_actions.business_id | uuid | ✓ | |
| sprint_key_actions.business_id | text | ✓ | |
| strategic_initiatives.business_id | uuid | ✓ | |
| strategic_initiatives_backup.business_id | text | ✓ | |
| strategy_data.business_id | uuid | – | |
| swot_analyses.business_id | uuid | ✓ | (26/27 rows = user-ids) |
| vision_targets.business_id | uuid | – | |
| **weekly_metrics_snapshots.business_id** | uuid | ✓ | * |
| **weekly_reviews.business_id** | uuid | ✓ | |
| xero_accounts.tenant_id | text | – | * |
| **xero_connections.business_id** | uuid | ✓ | * (R3 — only one previously captured) |
| xero_connections.tenant_id | text | ✓ | * |
| xero_pl_lines.tenant_id | text | – | * |

**Net-new orphan-risk money tables (uuid NOT NULL, no FK):** `cashflow_assumptions`, `financial_forecasts`, `forecast_decisions`, `forecast_investments`, `forecast_years`, `forecast_wizard_sessions`, `kpi_actuals`, `pending_xero_connections`, `quarterly_snapshots`, `weekly_metrics_snapshots`. Each can hold a `business_id` that matches no `businesses.id` and no `business_profiles.id` with nothing at the DB level to stop it.

> Note: `financial_forecasts.business_id` has no FK on `business_id` itself, yet child tables `cashflow_assumptions/settings`, `forecast_years/decisions/investments` CASCADE off `financial_forecasts.id` (the PK) — so the *parent's* tenancy key is unconstrained while its *children* are tightly bound. An orphaned-tenancy forecast still owns a full cascade subtree.

---

## (c) CASCADE / SET NULL FKs — blast-radius notes

Distribution across ALL 250 FKs: **CASCADE 163 · SET NULL 31 · NO ACTION 56.** Money-relevant subset:

### CASCADE landing on money/financial tables (parent delete wipes the money)
| Child.column | → Parent | Blast-radius note |
|---|---|---|
| xero_pl_lines.business_id | businesses | **R27** + DM-N1 (contradicts the 44.2 RESTRICT FK on the same column) |
| xero_accounts.business_id | businesses | chart of accounts gone with the business |
| monthly_actuals.business_id | businesses | all month-end actuals |
| monthly_report_snapshots.business_id | businesses | every saved month-end report |
| annual_snapshots.business_id | businesses | annual rollups |
| financial_metrics / financial_targets.business_id | businesses | metrics + targets |
| subscription_budgets.business_id | businesses | all subscription budgets |
| consolidation_elimination_rules.business_id | businesses | consolidation eliminations |
| account_mappings.business_id | businesses | Xero→report mappings |
| forecasts.business_id | businesses | legacy forecasts |
| **cashflow_assumptions.forecast_id** | financial_forecasts | **DM-N11** — forecast delete wipes assumptions |
| **cashflow_settings.forecast_id** | financial_forecasts | **DM-N11** |
| **forecast_decisions.forecast_id** | financial_forecasts | **DM-N11** |
| **forecast_investments.forecast_id** | financial_forecasts | **DM-N11** |
| **forecast_years.forecast_id** | financial_forecasts | **DM-N11** — year rollups |
| kpi_actuals.user_id / quarterly_snapshots.user_id / annual_snapshots.user_id | profiles | a **profile** delete wipes KPI actuals + snapshots (money rows hang off a *user* row) |
| {10 tables}.business_id/profile_id | **business_profiles** | dual-ID cascade: `kpis`, `ninety_day_sprints`, `quarterly_plans`, `stage_transitions`, `stop_doing_*` (4), `strategic_goals`, `user_roles`, `custom_kpis_library` — deleting a *profile* (not a business) cascades these |

### SET NULL on money tables (orphans money rows / unlinks provenance)
| Child.column | → Parent | Note |
|---|---|---|
| **subscription_budgets.forecast_id** | forecasts | **DM-N10** — budget silently unlinked |
| **financial_forecasts.xero_connection_id** | xero_connections | **DM-N12** — loses Xero source on reconnect |
| financial_forecasts.parent_forecast_id | financial_forecasts | scenario tree detaches |
| financial_forecasts.{wages,super}_{cogs,opex}_pl_line_id | forecast_pl_lines | wage/super line refs null on PL-line delete |
| financial_forecasts.wizard_session_id | forecast_wizard_sessions | wizard provenance lost |
| forecast_decisions.{linked_initiative_id, linked_pl_line_id, session_id} | initiatives / pl_lines / sessions | decision links detach |
| forecast_investments.{initiative_id, pl_line_id} | initiatives / pl_lines | investment links detach |
| profiles.business_id | businesses | user's home-business pointer nulls (login/landing impact) |

---

## (d) CONFIRMATIONS (already-covered / clean)

- **R25 (BS sync non-atomic)** — still true at `monthly-report/sync-xero/route.ts:338-371`; extended by DM-N5.
- **R6 (keyword classification + hardcoded AUD)** — still true: `cashflow/engine.ts:29-79` (keyword maps), `consolidation/engine.ts:136` (`'AUD'`); extended by DM-N8.
- **R28 (KPI validator /0)** — unchanged at `kpi/utils/validators.ts:147`.
- **R3** — `xero_connections.business_id` still FK-less; confirmed plus 35 more (table b).
- **Forecast materialize RPC — CLEAN (hardened):** `save_assumptions_and_materialize` was converted from delete-then-insert to UPSERT keyed on `(forecast_id, account_code) WHERE is_manual=false`, with `p_force_full_replace` and manual-row protection (`20260429000003_..._upsert.sql`). This is the *correct* idempotency pattern R25 should mirror — no net-new bug here.
- **xero_pl_lines / xero_bs_lines / accounts-catalog upserts — CLEAN:** all use explicit `onConflict` natural keys (`sync-orchestrator.ts:406-407,871-872`; `accounts-catalog.ts:198-199`) — idempotent.
- **company-tax — CLEAN:** `Math.max(0, annualNet*rate)` guards negative tax (`company-tax.ts:53`); even per-payment distribution, no /0 (guards `eligibleMonths.length===0`).
- **getTimingSplit (DSO/DPO) — CLEAN:** bucket formula now sums to exactly 1.0 (`engine.ts:93-105`); the prior >100% allocation bug is fixed.
- **Reconciliation gates — tight tolerance ($0.01) and structurally sound** (`reconciliation-gates.ts`); only the name-substring + dropped-type blind spots in DM-N9.
- **reconciliation-watch cron** — correctly fail-closed on `CRON_SECRET` (`reconciliation-watch/route.ts:44`), reads drift from `sync_jobs` (no extra Xero calls). (Note: R4 still applies to the *other* crons.)
- **Unique-constraint coverage — broadly good:** snapshots/actuals/budgets/forecast-children all carry composite uniques (table in §a search); the only defeat is DM-N4 (dual-ID).

---

## (e) PHASE-70 DRIFT

- **Zero schema changes in Phase 70** (commit message: "Zero schema changes"; verified — no new migration files dated 2026-05-31, latest is `20260530000000_phase69_cron_heartbeats.sql`). So no new FK/constraint drift introduced by Phase 70 itself.
- **Phase-70 snapshot CONFIRMS DM-N1/DM-N2:** the 70-01 snapshot recorded *"ALL xero_pl_lines for the 3 sampled clients (Envisage/JDS/IICT) are correctly keyed under business_profiles.id — 0 rows under businesses.id."* This is direct prod evidence that the live convention is `business_profiles.id`, contradicting the baseline `→ businesses(id)` FK and R1/R3's "use businesses.id" guidance.
- **Phase-70 locked decision:** `super = 0.12` (per Matt 2026-05-31) — consistent with MEMORY `project_super_rate`. NET-NEW nit: `forecast/cashflow/settings/route.ts:34` still defaults `super_rate: 0.115` (the old SG rate), not 0.12. Low-sev stale default; flag for alignment with the Phase-70 decision. (Not a calc bug if per-forecast value is set, but a wrong default for new forecasts.)
- **Phase-70 produced data-cleanse scripts only** (`scripts/70-*.mjs`, `audit-dual-id-*.mjs`) — these are PROD-track per R14; no code-spine change. Untracked working-tree scripts (`onboard-fit2shine.mjs`, `reassess-fit2shine.mjs`) are one-off client scripts, out of audit scope.

---

## Severity roll-up (net-new)

- CRITICAL: DM-N1
- HIGH: DM-N2, DM-N3, DM-N4, DM-N5
- MEDIUM: DM-N6, DM-N7, DM-N8, DM-N9, DM-N11
- LOW/MEDIUM: DM-N10, DM-N12; plus Phase-70 super_rate default nit.
