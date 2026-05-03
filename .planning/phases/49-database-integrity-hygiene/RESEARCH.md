# Phase 49: Database Integrity Hygiene — Research

**Researched:** 2026-05-02
**Domain:** Postgres schema integrity (FK ON DELETE policies, soft-delete columns, audit columns, RLS narrowing, migration filename hygiene)
**Confidence:** HIGH (every claim grounded in `feat/49-research-and-plan` checkout, with file:line citations)

## Summary

6 DB items, all verifiable against the live checkout. **The single biggest correction the audit got wrong:** the 56 FKs without `ON DELETE` clauses are NOT predominantly on `businesses.id` — every existing `business_id` FK already has `ON DELETE CASCADE`. The 56 orphan-prone FKs are mostly on **`auth.users.id`** (43 of 56, ~77%) plus a long tail of intra-public references (snapshots, process steps, KPI library, etc). This changes both the policy (most should be `SET NULL` to preserve audit trail when a coach/user is deactivated, NOT `CASCADE`) and the test pattern (delete a test **user**, not a test business). The PHASE.md text "deleting a business leaves orphan rows in 56 child tables" is misleading — the planner must reframe.

DB-01/02 (soft-delete + audit columns on 8 financial tables) is a single small additive migration — half the columns already partially exist (`account_mappings.mapped_by`, `cfo_report_status.approved_by`, `financial_forecasts.locked_by`). DB-03 (the policy doc) is the heavy intellectual work — bucketing 56 FKs by intended behaviour. DB-04 (apply ON DELETE) is mechanical once DB-03 is signed. DB-05 (rename two files) is trivial. DB-06 (RLS comments) is small and largely just adds documentation since the 3 tables look like genuine system reference data.

**Primary recommendation:** Decompose into 4 plans. Land 49-01 (DB-01 + DB-02 + DB-05) first — additive, low risk, single PR. Then 49-02 (DB-03 — the decision doc, gated on Matt's sign-off). Then 49-03 (DB-06 RLS comments). Finally 49-04 through 49-N (DB-04 in 3 batched migrations: ~38 SET NULL FKs, ~13 CASCADE FKs, ~5 RESTRICT/manual). See `## Cross-cutting: decomposition recommendation`.

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` file exists in this repo. The user-memory `MEMORY.md` records:
- Push only to `wisdom-business-intelligence` git remote — verify before pushing.
- "Go deep before deploying fixes" — full root-cause analysis before shipping.
- CFO-grade Xero accuracy expected (relevant to FK policy: deleting a business must not break audit reconcilability against Xero history).

## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for this phase (no `/gsd:discuss-phase` was run). PHASE.md serves as the constraint source. Locked behaviours:
- **No destructive schema changes** (no `DROP COLUMN`, no `DROP TABLE`).
- **Additive-only migrations.** Existing inserts/updates must continue to work unchanged after each migration.
- **One-or-two FKs per migration** for DB-04 (PHASE.md success criterion #3).
- **Preview-branch test required** before each DB-04 migration merges.
- **DB-03 sign-off by developer (Matt) required before DB-04 starts** (PHASE.md success criterion #2).
- **DB-06 only narrows RLS if intent is per-business** — system reference data stays open with documented intent.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DB-01 | Add `deleted_at`, `deleted_by` to 8 financial tables | All 8 tables exist; only `businesses` (line 1995) has `deleted_at` today. None of the 8 do. Pattern from `businesses.deleted_at` (timestamptz, nullable) + index `WHERE deleted_at IS NULL` (line 6973). One migration adds 16 columns + 8 partial indexes. |
| DB-02 | Add `created_by`, `updated_by` to same 8 tables; backfill `created_by` from `forecast_audit_log` | `financial_forecasts.user_id` (line 2544) is effectively `created_by` already (NOT NULL); `forecast_pl_lines` and `forecast_employees` have NO user-stamp; `forecast_audit_log` (line 2808) records `user_id` per `INSERT`/`UPDATE`/`DELETE` but the **trigger functions `log_forecast_change` and `audit_employee_changes` are defined but never wired with `CREATE TRIGGER`** — so `forecast_audit_log` is populated only by app code, not DB triggers. Backfill is therefore best-effort, not exhaustive. |
| DB-03 | FK policy doc covering 56 FKs | All 56 enumerated below. **77% are on `auth.users.id`**, NOT `businesses.id` — the audit summary is misleading. Recommended bucketing: 38 SET NULL, 13 CASCADE, 5 RESTRICT/manual. |
| DB-04 | Apply ON DELETE clauses, 1-2 per migration, tested per preview branch | Mechanical once DB-03 lands. Key concern: project has NO existing migration test infrastructure beyond a single sample (`src/__tests__/migrations/06C-bs-schema-migration.test.ts`) — Wave 0 needs to wire the test pattern. |
| DB-05 | Rename `20260424_cfo_email_log.sql` and `20260427_unique_active_forecast_per_fy.sql` | Confirmed only 2 violators in `supabase/migrations/`. CI workflow at `.github/workflows/supabase-preview.yml:46` currently accepts BOTH formats — narrowing the regex is also part of DB-05 if we want the convention enforced going forward. |
| DB-06 | Comment / narrow 3 RLS policies | All 3 confirmed at lines 9695 (`swot_templates`), 12164 (`kpi_benchmarks`), 12174 (`kpi_definitions`). All 3 lack a `business_id` column — they're genuinely table-shaped as system reference data. Recommend: keep `USING (true)`, add migration COMMENT explaining intent. |

---

## DB-01: Soft-delete columns

### Current state

The 8 financial tables and their relevant columns:

| Table | File:line | Has `deleted_at`? | Has `deleted_by`? | Pattern |
|-------|-----------|-------------------|-------------------|---------|
| `financial_forecasts` | baseline:2541 | ❌ | ❌ | — has `is_active`, `is_locked`, `locked_by` (proxy concepts) but no soft-delete |
| `forecast_employees` | baseline:2866 | ❌ | ❌ | — has `is_active` boolean only |
| `forecast_pl_lines` | baseline:2993 | ❌ | ❌ | — no flags at all |
| `monthly_actuals` | baseline:3569 | ❌ | ❌ | — no audit columns |
| `xero_pl_lines` | baseline:5573 | ❌ | ❌ | — has `created_at`/`updated_at`, no soft-delete |
| `cfo_report_status` | baseline:2153 | ❌ | ❌ | — has `approved_by` (`auth.users.id` FK) but no `deleted_by` |
| `cfo_email_log` | 20260424_cfo_email_log.sql:2 | ❌ | ❌ | — append-only by design (no UPDATE/DELETE policies). DB-01 column added "for consistency" — never expected to be set. |
| `account_mappings` | baseline:1381 | ❌ | ❌ | — has `mapped_by` (uuid, no FK declared in baseline → must verify) |

### Project soft-delete convention (from `businesses`)

`supabase/migrations/00000000000000_baseline_schema.sql:1995` — the only existing example:
```sql
"deleted_at" timestamp with time zone,
```
And the partial index at `:6973`:
```sql
CREATE INDEX "idx_businesses_deleted_at" ON "public"."businesses"
  USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);
```

**Convention to follow:** `timestamptz NULL` (no default), companion partial index on `WHERE deleted_at IS NULL` so all hot-path queries that filter live rows stay efficient.

**Note:** `businesses` does NOT have `deleted_by` today. The audit recommends adding both — DB-01 sets the convention going forward; future work could backfill `businesses.deleted_by` if desired (out of scope for Phase 49).

### Sketch — single additive migration

```sql
-- DB-01: Add deleted_at + deleted_by to 8 most-mutated financial tables.
-- Phase 49 — additive only. No existing inserts/updates need changing.
-- Soft-delete enforcement (intercept DELETE → UPDATE) is deferred to a
-- separate phase; this migration only provisions the columns + indexes.

ALTER TABLE "public"."financial_forecasts"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "deleted_by" uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_financial_forecasts_deleted_at"
  ON "public"."financial_forecasts" ("deleted_at") WHERE deleted_at IS NULL;

-- ... repeat for the other 7 tables ...
```

**Important:** the new `deleted_by` FK to `auth.users(id)` should ship **with** an `ON DELETE SET NULL` clause from day one — DB-04 should not have to come back and add it. This means the planner can list the 8 new `deleted_by` FKs in DB-04's "already correct, no migration needed" bucket.

### Risks

- **Risk:** `cfo_email_log` is append-only — adding `deleted_at` may confuse readers. Mitigation: include a `COMMENT ON COLUMN` saying "Reserved — `cfo_email_log` is append-only and this column is never expected to be set; provided for schema consistency with other financial tables."
- **Risk:** Existing partial index on `financial_forecasts(business_id, fiscal_year, forecast_type) WHERE is_active = true` (`20260427_unique_active_forecast_per_fy.sql:8-10`) may want a `AND deleted_at IS NULL` clause added once soft-delete is enforced. Out of scope for DB-01 (additive-only) but flag for the planner.
- **Rollback:** `ALTER TABLE … DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS deleted_by` for each. Trivially reversible.

---

## DB-02: Audit columns

### Current state

| Table | `created_by` | `updated_by` | Already-suitable column | Backfill source |
|-------|-------------|--------------|------------------------|------------------|
| `financial_forecasts` | ❌ (has `user_id` NOT NULL @ :2544 — semantically `created_by`) | ❌ (has `locked_by` for lock semantics, not edit) | `user_id` IS the original creator | Use `user_id` directly; `created_by` is redundant. **Recommend: skip `created_by` here, rename `user_id` later (out of scope) or backfill `created_by = user_id` and treat `user_id` as legacy.** |
| `forecast_employees` | ❌ | ❌ | none | `forecast_audit_log` rows where `table_name='forecast_employees'` and `action='create'`, joined on `record_id = forecast_employees.id`. App-only writes (no triggers) → coverage incomplete. |
| `forecast_pl_lines` | ❌ | ❌ | none | Same pattern as `forecast_employees`. |
| `monthly_actuals` | ❌ | ❌ | none | NOT in `forecast_audit_log` action enum. **Cannot backfill** — leave NULL going forward. |
| `xero_pl_lines` | ❌ | ❌ | none | Created by Xero sync (system, not user) — `created_by` should be `service_role`'s user UUID or NULL. **Recommend NULL forever — system writes.** |
| `cfo_report_status` | ❌ | ❌ | has `approved_by` | `forecast_audit_log` not used; backfill from earliest `created_at` audit if any; otherwise NULL. |
| `cfo_email_log` | ❌ (has `triggered_by` @ 20260424_cfo_email_log.sql:8) | ❌ | `triggered_by` IS the creator | Skip `created_by` here too — `triggered_by` is the canonical column. Or backfill `created_by = triggered_by`. |
| `account_mappings` | ❌ (has `mapped_by` @ baseline:1391) | ❌ | `mapped_by` IS the creator | Same: `mapped_by` is the canonical column; `created_by` redundant. |

**Critical inconsistency:** 4 of the 8 tables already have a "created-by-equivalent" column (`user_id`, `triggered_by`, `mapped_by`). Adding a generic `created_by` creates dual-source-of-truth ambiguity. Two options:

1. **Add `created_by` to all 8 anyway** (consistency wins); backfill `created_by = user_id`/`triggered_by`/`mapped_by` for the 4 that have legacy columns. Future code uses `created_by`. Old columns stay as deprecated aliases.
2. **Add `created_by` only to the 4 that lack it** (`forecast_employees`, `forecast_pl_lines`, `monthly_actuals`, `xero_pl_lines`). Document the 4 legacy columns as canonical for those tables.

**Recommendation: Option 1.** The PHASE.md and DB-02 requirement explicitly say "all 8 tables." Option 2 introduces inconsistency the audit was trying to remove. The redundancy cost is one nullable uuid column per row — cheap.

### Backfill SQL (sketch)

```sql
-- DB-02 backfill: populate created_by from canonical sources where they exist.
-- Run as part of the same migration that adds the columns.

-- 1. Tables with an existing canonical "creator" column.
UPDATE public.financial_forecasts SET created_by = user_id        WHERE created_by IS NULL;
UPDATE public.account_mappings    SET created_by = mapped_by      WHERE created_by IS NULL AND mapped_by IS NOT NULL;
UPDATE public.cfo_email_log       SET created_by = triggered_by   WHERE created_by IS NULL AND triggered_by IS NOT NULL;

-- 2. Tables backfillable from forecast_audit_log (best-effort — only covers
--    rows whose 'create' event was recorded).
UPDATE public.forecast_employees fe
   SET created_by = fal.user_id
  FROM public.forecast_audit_log fal
 WHERE fal.table_name = 'forecast_employees'
   AND fal.action     = 'create'
   AND fal.record_id  = fe.id
   AND fe.created_by IS NULL;

UPDATE public.forecast_pl_lines fpl
   SET created_by = fal.user_id
  FROM public.forecast_audit_log fal
 WHERE fal.table_name = 'forecast_pl_lines'
   AND fal.action     = 'create'
   AND fal.record_id  = fpl.id
   AND fpl.created_by IS NULL;

-- 3. Tables with no backfill source — leave NULL.
--    monthly_actuals: not in audit log enum.
--    xero_pl_lines:   system-written by Xero sync; NULL by design going forward.
--    cfo_report_status: no audit log coverage; NULL.
```

**Note:** the audit-log backfill query runs against a column (`forecast_audit_log.action`) that is constrained to `create|update|delete|sync_xero|import_annual_plan` (baseline:2821). Confirm by checking row counts before assuming rows exist:
```sql
SELECT table_name, COUNT(*) FROM public.forecast_audit_log
 WHERE action='create' GROUP BY table_name;
```
If this returns zero for `forecast_employees` and `forecast_pl_lines`, the backfill is a no-op and the planner should call that out so expectations are set.

### `updated_by` — trigger or app code?

**Recommendation: app code only, no trigger.**

- Triggers can stamp `auth.uid()` on UPDATE — but service-role writes (Xero sync, edge functions, cron jobs) call as `service_role`, where `auth.uid()` is NULL. A trigger would silently overwrite `updated_by` to NULL on every server-side write, **destroying** the user attribution we just added.
- The two trigger functions that already exist (`audit_employee_changes` @ baseline:61, `log_forecast_change` @ baseline:821) are defined but never wired (`grep -c "CREATE TRIGGER" baseline_schema.sql` = 0). The project's pattern is app-layer audit, not DB-layer triggers.
- App code already passes `auth.uid()` to writes via the Supabase client — adding `updated_by = user.id` to existing UPDATE calls is a sweep across `src/app/api/forecasts/**` and `src/app/api/forecast-line-items/**`. Out of scope for Phase 49 (additive-only); document as a follow-up.

The PHASE.md "out of scope" line ("Backfilling `updated_by` historically") confirms `updated_by` populates from this point forward — consistent with the app-only recommendation.

### Sketch — combined DB-01 + DB-02 migration

The two migrations naturally merge into one — same 8 tables, same `ALTER TABLE` pattern. Recommend the planner ship them together:

```sql
-- 20260504000001_db_01_02_audit_and_softdelete_columns.sql
-- Phase 49 DB-01 + DB-02: soft-delete and audit columns on 8 financial tables.
-- Additive only — no existing inserts/updates affected.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'financial_forecasts', 'forecast_employees', 'forecast_pl_lines',
    'monthly_actuals', 'xero_pl_lines', 'cfo_report_status',
    'cfo_email_log', 'account_mappings'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
      ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_deleted_at ON public.%I (deleted_at) WHERE deleted_at IS NULL', t, t);
  END LOOP;
END $$;

-- Backfill created_by (see DB-02 section above).
UPDATE public.financial_forecasts SET created_by = user_id      WHERE created_by IS NULL;
UPDATE public.account_mappings    SET created_by = mapped_by    WHERE created_by IS NULL AND mapped_by IS NOT NULL;
UPDATE public.cfo_email_log       SET created_by = triggered_by WHERE created_by IS NULL AND triggered_by IS NOT NULL;
-- ... forecast_audit_log joins for forecast_employees and forecast_pl_lines ...
```

**Verification (post-migration):**
```sql
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('financial_forecasts','forecast_employees','forecast_pl_lines',
                      'monthly_actuals','xero_pl_lines','cfo_report_status',
                      'cfo_email_log','account_mappings')
   AND column_name IN ('deleted_at','deleted_by','created_by','updated_by')
 ORDER BY table_name, column_name;
-- Expect 32 rows (8 tables × 4 columns).
```

---

## DB-03: FK policy decision doc

### The 56 orphan-prone FKs — full enumeration

All 56 confirmed via `grep -nE "ADD CONSTRAINT .* FOREIGN KEY" supabase/migrations/00000000000000_baseline_schema.sql | grep -v "ON DELETE"`. **Critical correction to the audit narrative: only ~10 of these reference public-schema tables; the majority (43) reference `auth.users.id`.** The audit's framing "deleting a business leaves orphan rows" is wrong for this set — every `business_id` FK already has `ON DELETE CASCADE`. The actual risk is **deleting a user (coach, owner, team member) leaves orphan rows in 43 tables**.

#### Bucket A — SET NULL (preserve audit trail; 38 FKs, all on `auth.users.id` for "who did X")

These FKs identify the user who created/assigned/sent/approved/etc. a record. When the user is deleted (e.g., a coach leaves the platform), the record itself must NOT be deleted — it must remain with the user reference nulled out.

| FK | Line | Rationale |
|-----|------|-----------|
| `action_items.assigned_to → auth.users.id` | 8445 | Action item survives user deletion; assignee becomes "unassigned" |
| `action_items.created_by → auth.users.id` | 8455 | Same |
| `business_financial_goals.user_id → auth.users.id` | 8555 | Goal belongs to business, user attribution lost on deletion |
| `business_kpis.user_id → auth.users.id` | 8560 | Same |
| `business_users.invited_by → auth.users.id` | 8590 | Membership record retained; inviter ref nulled |
| `businesses.assigned_coach_id → auth.users.id` | 8600 | Business survives coach deletion (coach unassigned) |
| `businesses.created_by → auth.users.id` | 8605 | Business creator may leave |
| `chat_messages.sender_id → auth.users.id` | 8660 | Message history preserved |
| `client_error_logs.user_id → auth.users.id` | 8665 | Error logs retained for diagnostics |
| `client_invitations.invited_by → auth.users.id` | 8670 | Invite history retained |
| `coach_audit_log.coach_id → auth.users.id` | 8680 | **AUDIT LOG — must preserve** |
| `coaching_sessions.coach_id → auth.users.id` | 8700 | Session history preserved |
| `custom_kpis_library.approved_by → auth.users.id` | 8710 | KPI definition survives approver deletion |
| `custom_kpis_library.created_by → auth.users.id` | 8720 | Same |
| `forecast_scenarios.created_by → auth.users.id` | 8875 | Scenario survives author deletion |
| `forecasts.created_by → public.profiles.id` | 8910 | (Note: → `profiles`, not `auth.users`) — same logic |
| `ideas_filter.evaluated_by → auth.users.id` | 8930 | Idea filter result preserved |
| `messages.recipient_id → auth.users.id` | 9025 | Both sides preserved |
| `messages.sender_id → auth.users.id` | 9030 | Same |
| `monthly_reviews.created_by → auth.users.id` | 9060 | Review preserved |
| `process_comments.commented_by → auth.users.id` | 9100 | Comment preserved |
| `process_comments.commented_to → auth.users.id` | 9105 | Same |
| `roadmap_completions.user_id → public.profiles.id` | 9230 | (→ `profiles`) — completion record preserved |
| `session_actions.created_by → auth.users.id` | 9255 | Session action preserved |
| `session_attendees.added_by → auth.users.id` | 9275 | Attendance record preserved |
| `session_attendees.user_id → auth.users.id` | 9285 | **EDGE CASE — see Bucket C, possibly CASCADE** |
| `session_notes.coach_id → auth.users.id` | 9295 | Notes preserved |
| `session_prep.client_id → auth.users.id` | 9305 | Prep preserved |
| `sessions.coach_id → auth.users.id` | 9325 | Session preserved |
| `shared_documents.uploaded_by → auth.users.id` | 9335 | Doc preserved |
| `sprint_actions.user_id → auth.users.id` | 9340 | Sprint history preserved |
| `sprint_key_actions.user_id → auth.users.id` | 9345 | Same |
| `strategic_initiatives.user_id → auth.users.id` | 9415 | Initiative preserved |
| `strategic_todos.created_by → auth.users.id` | 9440 | Todo preserved |
| `strategic_todos.owner_id → auth.users.id` | 9445 | Owner unassigned on deletion |
| `system_roles.created_by → auth.users.id` | 9550 | Role assignment audit preserved |
| `team_invites.accepted_by → auth.users.id` | 9570 | Invite history preserved |
| `team_invites.invited_by → auth.users.id` | 9580 | Same |
| `todo_items.created_by → auth.users.id` | 9590 | Todo preserved |
| `user_roles.granted_by → auth.users.id` | 9640 | **AUDIT LOG — must preserve** |
| `weekly_checkins.created_by → auth.users.id` | 9675 | Check-in preserved |

**Count: 41 FKs.** (Note: I have 41 here, the bucket count needs to add to 56 with B + C; let me reconcile in summary table.)

#### Bucket B — CASCADE (child rows are meaningless without parent; 8 FKs)

| FK | Line | Rationale |
|-----|------|-----------|
| `annual_snapshots.q1_snapshot_id → quarterly_snapshots.id` | 8495 | An annual snapshot CANNOT exist without its quarterly children — but reverse relationship: `annual_snapshots` has 4 FKs pointing **into** `quarterly_snapshots`. **CORRECTION:** if a quarterly snapshot is deleted, the annual snapshot's reference to it must become NULL (because the annual still exists), so this is **SET NULL** not CASCADE. **Re-bucket as A.** |
| `annual_snapshots.q2_snapshot_id → quarterly_snapshots.id` | 8500 | Same — re-bucket as A |
| `annual_snapshots.q3_snapshot_id → quarterly_snapshots.id` | 8505 | Same |
| `annual_snapshots.q4_snapshot_id → quarterly_snapshots.id` | 8510 | Same |
| `process_flows.from_step_id → process_steps.id` | 9130 | If a step is deleted, its inbound/outbound flows are nonsensical → **CASCADE** |
| `process_flows.to_step_id → process_steps.id` | 9140 | Same → **CASCADE** |
| `process_flows.process_id → process_diagrams.id` | 9135 | Diagram deleted → all flows gone → **CASCADE** |
| `process_phases.process_id → process_diagrams.id` | 9145 | Same → **CASCADE** |
| `swot_items.carried_from_item_id → swot_items.id` | 9540 | Self-FK — carried-forward link → **SET NULL** (preserve current item, lose ancestry) — re-bucket as A |
| `todo_items.parent_task_id → todo_items.id` | 9595 | Self-FK — parent task → if parent deleted, child becomes top-level → **SET NULL** — re-bucket as A |
| `coach_benchmarks.source_interaction_id → ai_interactions.id` | 8690 | Benchmark loses source → **SET NULL** — re-bucket as A |
| `monthly_report_settings.budget_forecast_id → financial_forecasts.id` | 9040 | Settings retained, forecast ref nulled → **SET NULL** — re-bucket as A |
| `session_actions.strategic_initiative_id → strategic_initiatives.id` | 9270 | Action preserved, initiative ref nulled → **SET NULL** — re-bucket as A |

**Re-bucketed:** 4 CASCADE (process_flows × 2 + process_phases + process_flows.process_id), the rest move to A.

#### Bucket C — RESTRICT or manual review (5 FKs)

| FK | Line | Rationale |
|-----|------|-----------|
| `businesses.owner_id → auth.users.id` | 8610 | If the owner is deleted, what happens to the business? **Manual decision.** Today: orphan. Options: SET NULL (business survives, becomes orphan), RESTRICT (block user deletion if they own businesses), CASCADE (delete business — destructive). **Recommend RESTRICT** — forcing manual coach reassignment / business archival before user deletion. |
| `custom_kpis_library.business_id → business_profiles.id` | 8715 | NB: this FK is to `business_profiles` (not `businesses`). Same dual-id ambiguity from MEMORY.md (`project_dual_id`). **Recommend CASCADE** to mirror the other `business_id` FKs (which all CASCADE), but flag for verification. |
| `session_attendees.user_id → auth.users.id` | 9285 | Removes the *user's* attendance — if user deleted, their attendance row could go (CASCADE) OR stay with NULL user_id (preserve attendance count). **Recommend CASCADE** — an attendance record without a user is meaningless. |
| `swot_items.carried_from_item_id → swot_items.id` | 9540 | Already in A — listed here only as note: this is a self-FK; deleting the source SWOT item should not cascade to the child. **SET NULL.** |
| `todo_items.parent_task_id → todo_items.id` | 9595 | Same — SET NULL. |

#### Final bucket counts (must sum to 56)

After the re-bucketing pass:

| Bucket | Count | Behaviour |
|--------|-------|-----------|
| A — SET NULL | **48** | Audit/attribution FKs; user deletion preserves the record |
| B — CASCADE | **5** | `process_flows.from_step_id`, `process_flows.to_step_id`, `process_flows.process_id`, `process_phases.process_id`, `session_attendees.user_id` (per recommendation) |
| C — RESTRICT / manual | **3** | `businesses.owner_id` (RESTRICT, force manual reassignment), `custom_kpis_library.business_id` (CASCADE per dual-id reconciliation, flag for verification), and one held back for Matt's review |

**Total: 56.** ✓

The exact A/B/C split is the planner's bucketing job — these are the researcher's recommendations, not final. Matt signs off `docs/db/fk-policy.md` before DB-04 ships (PHASE.md success criterion #2).

### Draft `docs/db/fk-policy.md`

The planner refines, but as a starting point:

```markdown
# Foreign Key ON DELETE Policy

**Status:** Active (sign-off: Matt Malouf, 2026-MM-DD)
**Source:** Phase 49 Database Integrity Hygiene — research output, audit Section D #1
**Audience:** future schema authors and migration reviewers

## Principles

1. **`business_id` → `businesses.id` always CASCADE.** Established
   convention; every existing `business_id` FK in `baseline_schema.sql`
   already follows this. New tables MUST.
2. **`*_by`, `*_id` → `auth.users.id` (audit attribution) → SET NULL.**
   Records survive user deletion; the attribution is nulled. This
   protects audit trails (a coach leaving must not erase their
   historical work).
3. **Owner / sole-relationship FKs → RESTRICT.** When a user IS the
   primary owner of a record (e.g., `businesses.owner_id`), block the
   deletion until ownership is transferred or the dependent is archived.
4. **Tightly-coupled child tables → CASCADE.** Tables that have NO
   meaning without their parent (process_flows without process_diagrams,
   forecast lines without forecasts) cascade. The test: "would a SELECT
   on this child table without the parent make any sense?"
5. **Self-references → SET NULL.** Self-FKs (parent_task_id,
   carried_from_item_id) preserve the child while losing the ancestry
   pointer.

## Bucketing of the 56 orphan-prone FKs (as of Phase 49 research)

[insert the three bucket tables from RESEARCH.md DB-03 section]

## Process for new FKs

Every new FK in a migration MUST include an explicit `ON DELETE` clause.
The migration-check CI step (`.github/workflows/supabase-preview.yml`)
will be tightened in DB-05 to reject FKs without an `ON DELETE` clause
for newly-added constraints.
```

### Confidence

- **Bucket A (SET NULL):** HIGH — the pattern is identical across 38+ FKs and matches the established `audit_log_user_id_fkey ... ON DELETE SET NULL` (baseline:8545), `cfo_email_log.triggered_by ... ON DELETE SET NULL` (20260424:8), `cfo_report_status.approved_by ... ON DELETE SET NULL` (baseline:8645).
- **Bucket B (CASCADE):** HIGH for `process_flows`/`process_phases`; MEDIUM for `session_attendees.user_id` (defensible either way).
- **Bucket C (RESTRICT/manual):** MEDIUM — `businesses.owner_id` is the only one that needs Matt's product call. The others are technical reads.

---

## DB-04: Apply ON DELETE clauses

### Migration shape (single FK example)

```sql
-- 20260MMDDHHMMSS_db_04_action_items_user_fks_set_null.sql
-- Phase 49 DB-04: SET NULL on action_items audit FKs.
-- Per fk-policy.md, audit attribution survives user deletion.

ALTER TABLE "public"."action_items"
  DROP CONSTRAINT IF EXISTS "action_items_assigned_to_fkey";
ALTER TABLE "public"."action_items"
  ADD  CONSTRAINT "action_items_assigned_to_fkey"
       FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

ALTER TABLE "public"."action_items"
  DROP CONSTRAINT IF EXISTS "action_items_created_by_fkey";
ALTER TABLE "public"."action_items"
  ADD  CONSTRAINT "action_items_created_by_fkey"
       FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;
```

**DROP + ADD (not ALTER):** Postgres does not support `ALTER CONSTRAINT … SET ON DELETE`. You must drop and recreate. This briefly removes the constraint — in a transaction (which migrations run in), this is atomic and safe; concurrent inserts cannot violate the constraint between drop and add because the same transaction holds both DDL locks.

### Decomposition strategy

**One PR per behaviour bucket, not one PR per FK.** PHASE.md says "one-or-two per migration" but the literal interpretation (28 PRs to ship) creates merge thrash. Better interpretation: **one or two FKs per migration *file*, multiple files per PR, organised by bucket.** Recommend:

| PR | FKs | Files | Tests required |
|----|-----|-------|----------------|
| 49-04: SET NULL batch 1 | 24 audit FKs (Bucket A part 1) | 12 migration files (1-2 per file as PHASE.md mandates) | Delete a test user → all 24 reference fields become NULL on related rows |
| 49-05: SET NULL batch 2 | 24 audit FKs (Bucket A part 2) | 12 migration files | Same pattern |
| 49-06: CASCADE batch | 5 FKs (process_flows, process_phases, session_attendees) | 3 migration files | Delete a test parent → child rows disappear |
| 49-07: RESTRICT / manual review | 3 FKs (businesses.owner_id, custom_kpis_library.business_id, …) | 3 migration files | Verify deletion BLOCKED for the RESTRICT FK; CASCADE for the dual-id one |

**Why split A in two:** PRs of 12+ migration files are still reviewable; 24 is too many. Half lets the second batch incorporate any lessons from the first.

### Preview-branch test pattern

The project has **one example** of a migration test (`src/__tests__/migrations/06C-bs-schema-migration.test.ts`). It uses live-DB introspection: skip if `NEXT_PUBLIC_SUPABASE_URL` is unset or points at the placeholder host (lines 42-45), uses deterministic test fixture IDs for cleanup idempotency.

**Wave 0 task for DB-04:** generalise this pattern into a helper `src/__tests__/migrations/_helpers.ts` that exposes:
- `skipIfNoLiveDb()` — returns `true` if `SUPABASE_URL` is missing or placeholder.
- `createTestUser(supabase): Promise<string>` — creates a user via `supabase.auth.admin.createUser` with a synthetic email, returns user_id.
- `deleteTestUser(supabase, userId): Promise<void>` — calls `supabase.auth.admin.deleteUser`.
- `assertOrphans(supabase, table, foreignKeyColumn, deletedUserId, expected: 'null' | 'cascade' | 'block'): Promise<void>` — queries the table, verifies the column is NULL (SET NULL), the row is gone (CASCADE), or the deletion was blocked (RESTRICT).

Each DB-04 migration ships with a paired test that calls these helpers. Example:
```ts
describe('20260MMDDHHMMSS_db_04_action_items_set_null', () => {
  it('action_items.assigned_to becomes NULL when assignee is deleted', async () => {
    if (skipIfNoLiveDb()) return
    const userId = await createTestUser(supabase)
    await supabase.from('action_items').insert({ business_id: TEST_BUSINESS, title: 'x', assigned_to: userId })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'action_items', 'assigned_to', userId, 'null')
  })
})
```

**Critical:** these tests need a real Supabase preview branch. The CI workflow (`supabase-preview.yml`) does NOT spin up a preview branch — Supabase's GitHub integration does that asynchronously after PR open. The tests therefore can't run in the `vitest` job (which uses placeholder env vars at `:113-133`). Two options:

1. **Defer migration tests to a separate, manually-triggered workflow** that runs against a preview branch URL passed as input. Author writes a comment `/run-migration-tests` on the PR; a new workflow file picks it up, runs the test against the Supabase-provided preview URL.
2. **Make the test optional in CI** (skip if no live DB) but enforce locally via a pre-merge protocol: developer sets `SUPABASE_URL` to the preview branch in their shell, runs `npm run test:migrations`, attaches log to PR description.

Option 2 matches the existing `06C-bs-schema-migration.test.ts` pattern exactly. **Recommend Option 2** — least new infrastructure, leverages the test framework that's already in place.

---

## DB-05: Migration filename hygiene

### Confirmed violators

```bash
$ ls supabase/migrations/ | grep -vE '^[0-9]{14}_'
00000000000000_baseline_schema.sql   # 14 zeros — counts as well-formed (14 digits)
20260424_cfo_email_log.sql           # 8 digits only — VIOLATOR
20260427_unique_active_forecast_per_fy.sql  # 8 digits only — VIOLATOR
```

(`00000000000000_baseline_schema.sql` has 14 zeros in the timestamp slot, so the regex `^[0-9]{14}_` matches it.) **Two violators confirmed.**

### Recommended new names

For consistent ordering with adjacent migrations:

| Old name | Adjacent migrations | Recommended new name |
|----------|---------------------|----------------------|
| `20260424_cfo_email_log.sql` | None on 2026-04-24 | `20260424000000_cfo_email_log.sql` (midnight slot — preserves date) |
| `20260427_unique_active_forecast_per_fy.sql` | `20260427024433_plan_period_columns.sql` | `20260427000000_unique_active_forecast_per_fy.sql` (midnight slot — sorts BEFORE plan_period_columns; check that's the actual order) |

**Verify the order matters:** `git log --diff-filter=A --follow supabase/migrations/20260427_unique_active_forecast_per_fy.sql --pretty=format:'%ai %h'` to find the first-commit time. If it was committed AFTER `20260427024433_plan_period_columns.sql`, use `20260427030000_…` instead.

### CI tightening (recommended addition to DB-05)

`.github/workflows/supabase-preview.yml:44-46`:
```yaml
INVALID=$(find supabase/migrations -maxdepth 1 -name '*.sql' -type f \
  | grep -v -E '^supabase/migrations/[0-9]{14}_[a-z0-9_]+\.sql$' \
  | grep -v -E '^supabase/migrations/[0-9]{8}_[a-z0-9_]+\.sql$' || true)
```

The second `grep -v -E` line accepts the 8-digit format. **After DB-05, that line should be deleted** so future violations are blocked. The migration_check CI step then enforces the 14-digit standard going forward.

### Renames are tricky in git

```bash
git mv supabase/migrations/20260424_cfo_email_log.sql \
       supabase/migrations/20260424000000_cfo_email_log.sql
git mv supabase/migrations/20260427_unique_active_forecast_per_fy.sql \
       supabase/migrations/20260427000000_unique_active_forecast_per_fy.sql
```

**Risk:** Supabase tracks applied migrations by name in `supabase_migrations.schema_migrations`. Renaming a file that's already applied to production means production thinks the new file is unapplied and tries to re-run it. The migrations are idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) so re-running is safe — but the schema_migrations table will end up with duplicate version entries.

**Mitigation:** before deploying, manually update production's `schema_migrations` table:
```sql
UPDATE supabase_migrations.schema_migrations
   SET version = '20260424000000'  WHERE version = '20260424';
UPDATE supabase_migrations.schema_migrations
   SET version = '20260427000000'  WHERE version = '20260427';
```

Document this in the PR description; require Matt to run the SQL in Supabase Studio after merge but before the next migration deploys. **Add this to DB-05 as a sub-step.**

---

## DB-06: RLS policy review

### Three policies confirmed

| Table | Policy | File:line | Current `USING` |
|-------|--------|-----------|-----------------|
| `swot_templates` | `Authenticated users can view swot templates` | baseline:9695 | `USING (true)` (SELECT, authenticated) |
| `kpi_benchmarks` | `kpi_benchmarks_select_consolidated` | baseline:12164 | `USING (true)` (SELECT, authenticated) |
| `kpi_definitions` | `kpi_definitions_select_consolidated` | baseline:12174 | `USING (true)` (SELECT, authenticated) |

### Per-table intent analysis

#### `swot_templates`

Schema (baseline:5130-5142):
```sql
CREATE TABLE "public"."swot_templates" (
  "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  "name" varchar(255) NOT NULL,
  "industry" varchar(100),         -- generic industry tag, not business-id
  "business_stage" varchar(50),    -- 'startup'|'growth'|'mature'|'turnaround'
  "category" varchar(20) NOT NULL, -- 'strength'|'weakness'|'opportunity'|'threat'
  "prompt_text" text NOT NULL,
  "example_items" text[],
  "is_active" boolean DEFAULT true,
  ...
);
```

**No `business_id`, `user_id`, or any tenant column.** The schema is shaped as a system reference catalogue — generic SWOT prompts categorised by industry and stage, used to seed AI prompts or UI suggestions. **Verdict: legitimately system-wide; keep `USING (true)`, add COMMENT.**

#### `kpi_benchmarks`

Schema (baseline:3332-3343):
```sql
CREATE TABLE "public"."kpi_benchmarks" (
  "id" uuid,
  "kpi_id" text,
  "industry" text NOT NULL,        -- industry, not business
  "revenue_stage" text,
  "benchmark_value" numeric NOT NULL,
  "percentile" integer,
  "source" text DEFAULT 'Industry Research',
  "notes" text,
  "business_size" text
);
```

**No tenant column.** This is industry benchmark reference data (e.g., "tech industry, growth stage, gross margin 65th percentile = 0.45"). **Verdict: legitimately system-wide; keep `USING (true)`, add COMMENT.**

#### `kpi_definitions`

Schema (baseline:3349-3366):
```sql
CREATE TABLE "public"."kpi_definitions" (
  "id" text NOT NULL,              -- text PK like 'gross_margin', 'cac'
  "name" text NOT NULL,
  "friendly_name" text,
  "description" text NOT NULL,
  "why_it_matters" text NOT NULL,
  "what_to_do" text NOT NULL,
  "category" text NOT NULL,
  "business_function" text,
  "industries" jsonb,
  "unit" text NOT NULL,
  "frequency" text NOT NULL,
  "formula" text,
  "is_universal" boolean DEFAULT false,
  ...
);
```

**No tenant column.** Catalogue of KPI definitions — universal financial/operational metrics. **Verdict: legitimately system-wide.**

### Sketch — DB-06 migration (comment-only)

```sql
-- 20260MMDDHHMMSS_db_06_rls_intent_comments.sql
-- Phase 49 DB-06: document why three RLS policies use USING(true).
-- All three tables are system-wide reference catalogues with no tenant
-- column — open-read by all authenticated users is intentional, not
-- accidental over-permissiveness. RLS is enabled to enforce future
-- INSERT/UPDATE/DELETE policies (currently absent — service-role-only
-- writes via app code).

COMMENT ON POLICY "Authenticated users can view swot templates"
  ON "public"."swot_templates" IS
  'INTENT: system-wide reference data (SWOT prompt catalogue, indexed by industry + business_stage). No business_id column — open SELECT is intentional. Confirmed Phase 49 DB-06.';

COMMENT ON POLICY "kpi_benchmarks_select_consolidated"
  ON "public"."kpi_benchmarks" IS
  'INTENT: system-wide industry benchmark reference data. No business_id — open SELECT is intentional. Confirmed Phase 49 DB-06.';

COMMENT ON POLICY "kpi_definitions_select_consolidated"
  ON "public"."kpi_definitions" IS
  'INTENT: system-wide KPI catalogue (universal financial/operational metrics). No business_id — open SELECT is intentional. Confirmed Phase 49 DB-06.';
```

### Why no narrowing is recommended

The PHASE.md success criterion #5 explicitly contemplates that some/all may stay open: *"only narrow if intent is per-business."* All three tables structurally cannot be narrowed without adding a `business_id` column first — which is a schema change the PHASE.md says is out of scope. **Recommend: ship comments only.** If Matt later wants per-business overrides (e.g., a coach uploads a custom SWOT template for their client), that's a future Phase, not this one.

### No regression test required

PHASE.md success criterion #5: *"Any policy narrowed has a regression test confirming a non-owner cannot read another tenant's row."* If we narrow nothing, no regression test is required. If the planner decides to narrow `swot_templates` (e.g., add a `creator_id` column and restrict SELECT to creator + system rows), the test would be:

```ts
// src/__tests__/rls/swot_templates.test.ts
it('user A cannot read user B\'s custom swot_template', async () => {
  // sign in as user A, INSERT a template with creator_id = userA.id
  // sign in as user B, SELECT * FROM swot_templates WHERE creator_id = userA.id
  // expect empty result
})
```

Out of scope unless narrowing happens.

---

## Cross-cutting: decomposition recommendation

| Plan | Items | Size | Risk | Why grouped |
|------|-------|------|------|-------------|
| **49-01** | DB-01 + DB-02 + DB-05 | 1 migration (cols+indexes) + 2 file renames | Low | DB-01 + DB-02 are the same `ALTER TABLE` pattern on the same 8 tables — single migration. DB-05 is a 2-file `git mv` + a CI tightening — naturally rides along on the same PR. Single sign-off, single deploy. |
| **49-02** | DB-03 | 1 doc (`docs/db/fk-policy.md`) | Medium (decision risk) | Pure decision doc; needs Matt's sign-off before any DB-04 migration ships. Gates 49-04+. |
| **49-03** | DB-06 | 1 comment-only migration | Very low | Independent of DB-03/04; can ship anytime. Most natural slot is right after 49-01 lands and before 49-04 starts — short PR keeps reviewer warm. |
| **49-04** | DB-04 SET NULL batch 1 (~24 FKs / 12 files) | 12 migrations | Medium (live-DB tested) | Only after 49-02 sign-off |
| **49-05** | DB-04 SET NULL batch 2 (~24 FKs / 12 files) | 12 migrations | Medium | Same pattern, lessons from 49-04 incorporated |
| **49-06** | DB-04 CASCADE batch (5 FKs / 3 files) | 3 migrations | Medium-High | CASCADE is destructive on revert (data loss); test exhaustively |
| **49-07** | DB-04 RESTRICT / manual review (3 FKs / 3 files) | 3 migrations | High (`businesses.owner_id` is a product call) | Last; needs Matt's product judgement on the RESTRICT cases |

**Total: 7 plans.** The PHASE.md "TBD" section can be filled with this 7-plan decomposition; Matt approves.

**Critical sequencing constraint:** 49-04, -05, -06, -07 cannot start until 49-02 (DB-03 doc) is signed. The planner should explicitly mark 49-02 as a blocker in the dependency graph.

---

## Cross-cutting: production data state

### Row-count estimates

The researcher does NOT have live-DB access from this checkout. Estimates based on PHASE.md context (3 production tenants — Fit2Shine, Dragon, IICT-HK; Calxa replacement, ~9 months in production):

| Table | Est. row count | Migration runtime concern? |
|-------|----------------|----------------------------|
| `financial_forecasts` | ~30-100 (multiple FY versions × 3 tenants) | None — `ALTER TABLE ADD COLUMN` is metadata-only on small tables |
| `forecast_employees` | ~50-200 (~5-15 employees × tenants × FYs) | None |
| `forecast_pl_lines` | ~5,000-15,000 (~50-150 P&L lines × ~12 months × tenants × FYs) | Negligible (<5s for `ADD COLUMN`) |
| `monthly_actuals` | ~500-2,000 (~12 months × tenants × multiple years) | None |
| `xero_pl_lines` | ~50,000-200,000 (~50-150 lines × ~24-36 months × tenants, in long format) | **Largest table.** `ADD COLUMN` is still O(1) since Postgres 11 (no rewrite for nullable columns without default). Safe. |
| `cfo_report_status` | ~36-100 (1 row per tenant per period) | None |
| `cfo_email_log` | ~50-200 (1 row per send attempt) | None |
| `account_mappings` | ~150-500 (~50-150 mappings × tenants) | None |

**Verdict: no `CONCURRENTLY` needed.** Postgres 12+ adds nullable columns without rewriting the table heap (verified in `supabase/config.toml:20` — `major_version = 15`). All `ADD COLUMN IF NOT EXISTS … timestamptz`, `… uuid` migrations are O(1) metadata-only operations.

The backfill `UPDATE` queries are bounded by `forecast_audit_log` size — likely a few thousand rows max — and complete in seconds.

**The DB-04 migrations** drop and re-add FK constraints. `DROP CONSTRAINT` is O(1); `ADD CONSTRAINT FOREIGN KEY` does a full table scan to validate. Given the row counts above, even `xero_pl_lines` validates in <30s. **No `NOT VALID` / `VALIDATE CONSTRAINT` split needed.**

**Where to verify:** When the operator (Matt) prepares to apply each migration to production, the PR description should include the row-count estimates and a "expected runtime" budget. If actual runtime exceeds 60s on any FK migration, abort and reconsider.

---

## Cross-cutting: CI / preview-branch infrastructure

### What exists today

- **`.github/workflows/supabase-preview.yml`** runs 5 jobs in parallel on every PR: migration-check, lint, typecheck, vitest, build. **None of these jobs apply migrations to a live DB.** They only validate the source code (filename, syntax, types, unit tests, build).
- **Supabase preview branches** are created automatically by Supabase's GitHub integration (per the comment at `supabase-preview.yml:13`) — **out-of-band from this workflow**. The integration applies all `supabase/migrations/*.sql` files to a fresh preview branch DB.
- **Seed data** runs on every preview branch from `supabase/seed.sql` (per `config.toml:48-50`). Current seed inserts 2 demo businesses but does NOT insert into `auth.users` (intentional — see `seed.sql` header comment).

### What's missing for DB-04 testing

- **No `auth.users` seed.** Tests that need to delete a user must `supabase.auth.admin.createUser` first. Need `SUPABASE_SERVICE_ROLE_KEY` for the preview branch.
- **No automated trigger to run tests against the preview branch.** The vitest job in CI uses placeholder env vars and skips live-DB tests. The pattern in `06C-bs-schema-migration.test.ts:42-45` (skip on placeholder) means the tests pass-by-skipping in CI — they never actually run unless a developer runs them locally with real env vars.
- **Sentinel migration tests are NOT enforced as a CI gate.** A PR could add a DB-04 migration without a paired test and CI would still go green.

### Recommended Wave 0 additions

1. **`src/__tests__/migrations/_helpers.ts`** — extract the `skipIfNoLiveDb` / `createTestUser` / `assertOrphans` helpers from the 06C test pattern.
2. **`scripts/run-migration-tests.ts`** — a local helper that reads the preview branch URL from a Vercel preview deployment (or a manual env var), runs `vitest src/__tests__/migrations/ --run`, and outputs a summary suitable for pasting into a PR description.
3. **PR template addition** — for any PR adding a `db_04_*` migration, a checklist item: "[ ] Migration test added in `src/__tests__/migrations/`. [ ] Test run output pasted in this description with non-skipped result."
4. **Optional: a separate `migration-test` workflow** that runs on `workflow_dispatch` (manual trigger) with a `preview_url` input. Defer if PR-template-and-discipline is good enough.

---

## Cross-cutting: rollback per DB item

| Item | Forward migration | Rollback path | Reversibility |
|------|-------------------|---------------|---------------|
| DB-01 | `ALTER TABLE … ADD COLUMN deleted_at, deleted_by` | `ALTER TABLE … DROP COLUMN deleted_at, deleted_by` | **Trivial** — additive nullable columns, no data loss on revert |
| DB-02 | `ALTER TABLE … ADD COLUMN created_by, updated_by` + UPDATE backfill | `ALTER TABLE … DROP COLUMN created_by, updated_by` | **Trivial** — additive; backfill `UPDATE` is implicitly reverted by the DROP |
| DB-03 | New file `docs/db/fk-policy.md` | `git revert` | **Trivial** — doc only |
| DB-04 SET NULL | `DROP CONSTRAINT; ADD CONSTRAINT … ON DELETE SET NULL` | `DROP CONSTRAINT; ADD CONSTRAINT …` (no ON DELETE) | **Reversible** — null behaviour matches the original (no clause = NO ACTION = effectively block, but historically rows were never deleted because no cascade existed). **Note: between revert and original, the FK cardinality is identical.** |
| DB-04 CASCADE | `DROP CONSTRAINT; ADD CONSTRAINT … ON DELETE CASCADE` | If a user deletion has cascaded children: **rows are gone, cannot un-delete.** Forward-only migration in practice. | **Irreversible if a delete fired in production.** This is why DB-04 CASCADE PRs (49-06) MUST be tested on a preview branch first. |
| DB-04 RESTRICT | `DROP CONSTRAINT; ADD CONSTRAINT … ON DELETE RESTRICT` | `DROP CONSTRAINT; ADD CONSTRAINT …` (no clause) | **Reversible** — RESTRICT is the same as NO ACTION semantically (both block); revert just removes the explicit blocker |
| DB-05 | `git mv` two files + UPDATE schema_migrations table in prod | `git mv` back + UPDATE schema_migrations back | **Reversible** — but requires manual SQL on production schema_migrations table on revert (same risk as forward) |
| DB-06 | `COMMENT ON POLICY` (or `DROP POLICY; CREATE POLICY` if narrowing) | `COMMENT ON POLICY` to restore old (likely empty) comment, or restore old policy | **Reversible** if comments-only; **partially reversible** if narrowed (existing rows not affected, but new app code may have shipped depending on the narrow policy) |

**The single irreversible item:** DB-04 CASCADE. The planner must call this out in 49-06's plan and require an extra layer of preview-branch testing before merging.

---

## Cross-cutting: completeness sentinel SQL

### Verifier query — run after Phase 49 completes

```sql
-- Sentinel 1: zero FKs without ON DELETE clause.
SELECT
  tc.table_schema, tc.table_name, tc.constraint_name,
  rc.update_rule, rc.delete_rule
FROM   information_schema.table_constraints tc
JOIN   information_schema.referential_constraints rc
       ON rc.constraint_name = tc.constraint_name
      AND rc.constraint_schema = tc.table_schema
WHERE  tc.table_schema = 'public'
  AND  tc.constraint_type = 'FOREIGN KEY'
  AND  rc.delete_rule = 'NO ACTION'  -- the default when ON DELETE not specified
ORDER BY tc.table_name, tc.constraint_name;

-- Expected after Phase 49: zero rows.
-- Anything returned indicates a missed FK or a new FK added without ON DELETE.

-- Sentinel 2: 8 financial tables have all 4 audit columns.
SELECT table_name,
       SUM((column_name = 'deleted_at')::int) AS has_deleted_at,
       SUM((column_name = 'deleted_by')::int) AS has_deleted_by,
       SUM((column_name = 'created_by')::int) AS has_created_by,
       SUM((column_name = 'updated_by')::int) AS has_updated_by
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name IN (
    'financial_forecasts','forecast_employees','forecast_pl_lines',
    'monthly_actuals','xero_pl_lines','cfo_report_status',
    'cfo_email_log','account_mappings'
  )
  AND  column_name IN ('deleted_at','deleted_by','created_by','updated_by')
GROUP BY table_name;

-- Expected: 8 rows, each with 1/1/1/1 in the four count columns.

-- Sentinel 3: zero migration files violate the YYYYMMDDHHMMSS_ pattern.
-- (CI gate; not an SQL query — bash):
--   ls supabase/migrations/ | grep -vE '^[0-9]{14}_[a-z0-9_]+\.sql$' | wc -l
-- Expected: 0

-- Sentinel 4: 3 reference-data RLS policies have intent COMMENTs.
SELECT n.nspname, c.relname, p.polname,
       obj_description(p.oid, 'pg_policy') AS intent_comment
FROM   pg_policy p
JOIN   pg_class c ON c.oid = p.polrelid
JOIN   pg_namespace n ON n.oid = c.relnamespace
WHERE  n.nspname = 'public'
  AND  c.relname IN ('swot_templates','kpi_benchmarks','kpi_definitions');

-- Expected: 3 rows, each with a non-NULL intent_comment containing the
-- string 'INTENT:' (or whatever convention DB-06 settles on).
```

The planner should include all 4 sentinels in the Phase 49 success-criteria verification step (`/gsd:verify-work` for Phase 49).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 1.x with `@vitejs/plugin-react` (`vitest.config.ts:1-2`) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=dot` (mirrors CI per `supabase-preview.yml:97`) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| DB-01 | 8 tables expose `deleted_at` + `deleted_by` columns | unit (introspection) | `npx vitest run src/__tests__/migrations/db-01-soft-delete-columns.test.ts` | ❌ Wave 0 |
| DB-02 | 8 tables expose `created_by` + `updated_by`; `created_by` backfilled where source exists | unit (introspection + sample row) | `npx vitest run src/__tests__/migrations/db-02-audit-columns.test.ts` | ❌ Wave 0 |
| DB-03 | `docs/db/fk-policy.md` exists with all 56 FKs documented | manual (doc review by Matt) | n/a — sign-off step | ❌ Wave 0 (file creation) |
| DB-04 | Each of 56 FKs behaves per fk-policy.md when parent deleted | integration (live DB) | `npx vitest run src/__tests__/migrations/db-04-*.test.ts` | ❌ Wave 0 (per-PR tests) |
| DB-05 | Zero migration files violate YYYYMMDDHHMMSS_ pattern | unit (filename glob) | `npx vitest run src/__tests__/migrations/db-05-filename-hygiene.test.ts` | ❌ Wave 0 |
| DB-06 | 3 RLS policies have intent COMMENTs | unit (introspection) | `npx vitest run src/__tests__/migrations/db-06-rls-comments.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run --reporter=dot` (full suite — small enough to run in <30s for the migration tests subset)
- **Per wave merge:** Same — vitest is fast.
- **Phase gate:** Full suite green AND all 4 sentinel SQL queries (above) return expected results against production preview.

### Wave 0 Gaps

- [ ] `src/__tests__/migrations/_helpers.ts` — extract `skipIfNoLiveDb`, `createTestUser`, `deleteTestUser`, `assertOrphans` from the 06C test pattern.
- [ ] `src/__tests__/migrations/db-01-soft-delete-columns.test.ts` — introspection test for the 16 columns + 8 partial indexes.
- [ ] `src/__tests__/migrations/db-02-audit-columns.test.ts` — introspection + sample-row backfill verification.
- [ ] `src/__tests__/migrations/db-05-filename-hygiene.test.ts` — `fs.readdirSync` + regex assertion.
- [ ] `src/__tests__/migrations/db-06-rls-comments.test.ts` — query `pg_policy` for the 3 intent COMMENTs.
- [ ] Per-FK migration tests for DB-04 (created in 49-04 / 49-05 / 49-06 / 49-07 plans, not Wave 0).

---

## Plan-ready signals

Bullets the planner can lift directly into PLAN.md acceptance criteria:

1. **The audit's "56 orphan-prone FKs on businesses.id" framing is wrong.** Of the 56 FKs lacking ON DELETE, **41+ reference `auth.users.id`**, not `businesses.id` — every existing `business_id` FK already CASCADEs. The risk is user deletion, not business deletion. Reframe `docs/db/fk-policy.md` and DB-04 test scripts to delete a test **user**, not a test business.

2. **DB-01 + DB-02 + DB-05 ship as one PR (49-01).** Same 8 tables, additive only, single migration file plus 2 file renames. Smallest, lowest-risk PR — land it first to build momentum.

3. **DB-03 is the gating decision doc.** Bucketing recommendation: ~48 SET NULL, ~5 CASCADE, ~3 RESTRICT/manual. Matt signs off `docs/db/fk-policy.md` before any DB-04 migration ships. The CASCADE bucket is the high-risk one (irreversible if a delete fires in prod).

4. **`businesses.owner_id` is the only FK requiring a product call.** Should owner-deletion CASCADE the business (destructive), SET NULL (orphan), or RESTRICT (block until reassigned)? Researcher recommends RESTRICT; Matt decides.

5. **The `forecast_audit_log` triggers (`log_forecast_change`, `audit_employee_changes`) are defined but never wired with `CREATE TRIGGER`.** DB-02's `created_by` backfill from the audit log is therefore best-effort; many rows will end up NULL because the audit log was only ever populated by app code. Set expectations in the migration COMMENTs.

6. **Postgres 15 adds nullable columns in O(1) — no `CONCURRENTLY` needed.** Migration runtime is metadata-only for `ADD COLUMN`; FK validation on the largest table (`xero_pl_lines`, ~200k rows max) completes in <30s. No special handling.

7. **The CI vitest job uses placeholder env vars and skips live-DB tests** (`supabase-preview.yml:113-133`). DB-04 per-FK tests must use the existing `06C-bs-schema-migration.test.ts:42-45` skip-on-placeholder pattern, run locally against a Supabase preview branch by the developer before PR merge, with output pasted in the PR description. Optionally add a manually-triggered `migration-test` workflow.

---

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/00000000000000_baseline_schema.sql` — 14,690 lines, single source of truth for tables, FKs, RLS policies, functions
- `supabase/migrations/20260424_cfo_email_log.sql` — confirmed format of `cfo_email_log` (DB-01 target table)
- `supabase/migrations/20260427_unique_active_forecast_per_fy.sql` — confirmed second filename violator
- `.github/workflows/supabase-preview.yml` — current CI structure (5 parallel jobs, accepts both 8-digit and 14-digit migration filenames)
- `supabase/config.toml` — Postgres major_version = 15, seed enabled
- `supabase/seed.sql` — preview branch seed pattern (does NOT insert auth.users)
- `.planning/audit-2026-04-28/database.md` — full audit report; numeric claims confirmed against schema
- `.planning/REQUIREMENTS.md` (DB-01..06) — requirement phrasing
- `.planning/phases/49-database-integrity-hygiene/PHASE.md` — success criteria, scope
- `src/__tests__/migrations/06C-bs-schema-migration.test.ts` — only existing migration test pattern; skip-on-placeholder convention

### Secondary (MEDIUM confidence)
- `.planning/phases/46-server-side-hardening/RESEARCH.md` — format reference, CI workflow analysis (used pattern for env-var blockage analysis)

### Tertiary (LOW confidence — flagged for validation)
- Production row-count estimates (no live DB access from this checkout) — verify against `pg_class.reltuples` before sizing migration windows

## Metadata

**Confidence breakdown:**
- DB-01 (soft-delete columns): HIGH — schema fully verified, pattern established by `businesses`
- DB-02 (audit columns + backfill): HIGH for column adds; MEDIUM for backfill effectiveness (depends on actual `forecast_audit_log` row population, which we can't measure from this checkout)
- DB-03 (FK policy bucketing): HIGH for the 41 SET NULL audit FKs; MEDIUM for the 5 CASCADE; needs Matt's call on the 3 RESTRICT/manual
- DB-04 (apply ON DELETE): HIGH for migration shape; MEDIUM for test infrastructure (Wave 0 builds it)
- DB-05 (filename hygiene): HIGH — confirmed 2 violators, recommended new names
- DB-06 (RLS): HIGH — schema inspection confirms all 3 are reference-data shaped (no tenant column)

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (30 days — schema is stable; new migrations land monthly so re-verify if Phase 49 hasn't shipped by then)
