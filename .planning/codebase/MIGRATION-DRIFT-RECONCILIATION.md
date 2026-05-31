# Migration Drift Reconciliation — Diagnosis, Plan & Actions Taken

> **⚠️ UPDATE 2026-05-31 (latest) — 505/506/507 APPLIED; only 508 remains deferred.**
> A read-only orphan pre-flight scan of every FK in the 4 deferred migrations
> (each does DROP + re-ADD, and the re-ADD validates existing rows) found **two
> orphan landmines** that would abort the migrations as-written:
> - `strategic_initiatives.user_id` = **36 orphans** (the FK was never enforced in
>   prod — the only `strategic_initiatives_user_id_fkey` lives on the *_backup table).
> - `custom_kpis_library.business_id` = **26 orphans** (in 508).
>
> Actions (per Matt "lets go with your plan"), applied to `coaching-platform-prod`
> via MCP, each in one transaction with its tracking row:
> 1. **`20260505000000`** (24 SET NULL FKs) — zero orphans, applied as-is.
> 2. **`20260506000000`** (26 SET NULL FKs) — applied WITH an added orphan-NULL
>    pre-step that nulls the 36 dangling `strategic_initiatives.user_id` refs
>    before the FK validates (policy-consistent; no-op on fresh DBs). The repo
>    migration file was edited to include this pre-step (uncommitted).
> 3. **`20260507000000`** (4 CASCADE on process_flows/process_phases) — zero
>    orphans, applied as-is. CASCADE semantics were pre-signed-off by Matt 2026-05-04.
>
> Verified live: sampled SET NULL FKs confdeltype='n', all 4 CASCADE='c', 0
> remaining strategic_initiatives orphans, tracking holds 505/506/507.
>
> **`20260508000000` — APPLIED (no deletion needed).** businesses.owner_id→auth.users
> RESTRICT + custom_kpis_library.business_id→**business_profiles** CASCADE.
> **Dual-ID trap caught before any destructive write:** the "26 orphans" were a
> false alarm from scanning `business_id` against `businesses` — the FK actually
> references `business_profiles` (project dual-id pattern). Re-scanned vs the
> correct parent = 0 orphans, so 508 applied verbatim with zero row deletes.
>
> **All four DB-04 batches (505–508) are now applied + tracked.** All 56 in-scope
> Phase-49 FKs carry an explicit ON DELETE clause. The only remaining `public`
> NO ACTION FK is `strategic_initiatives_user_id_fkey` on the out-of-scope
> `strategic_initiatives_backup` table (leftover backup, not part of Phase 49).

> **⚠️ UPDATE 2026-05-31 — RECONCILIATION EXECUTED (partial, per Matt's decision).**
> The original diagnosis below was REST-only and under-counted the gap. Catalog
> verification via the Supabase MCP (`pg_constraint`, `information_schema`) then
> revealed **5 migrations genuinely unapplied, not 1**. Actions taken against
> `coaching-platform-prod`:
>
> 1. **Applied `20260504000000`** (DB-01/02 audit columns + backfill) — 32 columns +
>    8 partial indexes created; `created_by` backfilled. **Adapted from the repo file:**
>    the original unguarded backfill failed on prod data (1 orphaned
>    `financial_forecasts.user_id` → deleted `auth.users` row, FK violation). Each
>    backfill is now `EXISTS(auth.users)`-guarded; the 1 orphan stays NULL by design.
>    The repo migration file was hardened to match (replay-safe for the fork).
> 2. **Backfilled tracking for 41 applied migrations** (all untracked versions EXCEPT
>    the 4 deferred FK migrations). `schema_migrations` now runs marker→`20260531010000`.
> 3. **DEFERRED (still unapplied + untracked, pending review):**
>    `20260505000000`, `20260506000000`, `20260507000000`, `20260508000000` — the
>    Phase 49 DB-04 FK delete-action batches (50 SET NULL + 4 CASCADE + 1 RESTRICT).
>    These are real behavioral changes (incl. irreversible CASCADE) and were
>    intentionally NOT applied. `supabase migration list --linked` will show these
>    4 as pending — that is correct and expected.
>
> **UPDATE 2026-05-31 (later) — PIPELINE ROOT CAUSE FIXED.**
> `supabase migration list --linked` revealed the real reason auto-deploy stopped:
> the repo was squashed to `00000000000000_baseline_schema.sql`, but prod tracking
> still held the **35 pre-squash rows** (`20240101000000`→`20260218000001`) that no
> longer exist in the repo. That divergent history makes `supabase db push` (which
> the GitHub integration runs on merge) refuse with "remote migrations not found
> locally" — so deploys silently stopped right at the squash point.
>
> 4. **Repaired the squash history mismatch** (authorized by Matt; tracking-table-only,
>    no schema/data change): inserted `00000000000000` as applied and deleted the 35
>    pre-squash rows. The 35 `(version,name)` pairs are saved for rollback (see §7b).
>    `migration list --linked` now shows a clean shared history; only the 4 deferred
>    FK migrations remain pending. `db push` is unblocked.
> 5. **Added a gated CI deploy workflow** `.github/workflows/supabase-deploy.yml` —
>    `supabase db push` to prod, **manual `workflow_dispatch` only** (the `push: main`
>    trigger is commented out) until 505–508 are decided. Needs GH secrets
>    `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD`. NOT committed/pushed yet.
>
> Outstanding: (a) decide whether/when to apply the 4 deferred FK migrations
> (and only then uncomment the `push:` trigger); (b) **verify the Supabase GitHub
> integration will NOT auto-deploy prod now that history is clean** — if it's still
> connected + set to auto-deploy, the next merge could apply 505–508 via the
> integration, bypassing our manual gate. Disable its prod deploys in the Supabase
> dashboard so the new CI workflow is the single source of truth.
> The original diagnosis text is retained below for the record.

---

**Status (original):** DIAGNOSIS ONLY. No migrations were applied, no `migration repair` was run, no DDL/writes were executed against production. Every production check below was a read-only `SELECT`/REST probe. Run the recommended commands yourself after review.

**Prod project:** `coaching-platform-prod` — project_ref `uudfstpvndurzwnapibf`
**Date of diagnosis:** 2026-05-31
**Diagnosis method:** `supabase migration list --linked` (read-only) + PostgREST OpenAPI spec (`GET /rest/v1/`) + per-column REST probes (`?select=<col>&limit=0` → 200 present / 400 absent) + reading migration SQL in the repo. `psql`/direct DB access was unavailable (no DB password, Docker daemon down), so **FK delete-actions, NOT NULL constraints, and `SECURITY DEFINER` helper bodies could NOT be verified via REST** — these are flagged explicitly below with a catalog query for you to run.

---

## 1. The drift, precisely

Production's `supabase_migrations.schema_migrations` is **frozen at `20260218000001_monthly_report_phase4`** (Feb 2026). The repo contains **33 newer migrations** that prod tracking has no row for. The prod *schema* reflects almost all of them (they were applied out-of-band via the Studio SQL editor), but the *tracking table* was never updated. Separately, the Supabase GitHub integration is not auto-applying on merge to `main`.

**The 33 untracked migrations (oldest → newest):**

```
20260420032941  20260420054330  20260420195612  20260422100000
20260424000000  20260427000000  20260427024433  20260428000001
20260428000002  20260428000003  20260428000004  20260428000005
20260428000006  20260429000001  20260429000002  20260429000003
20260429000004  20260429000010  20260430000001  20260430000002
20260430000003  20260430000004  20260430000010  20260430000011
20260503000000  20260504000000  20260504000001  20260505000000
20260506000000  20260507000000  20260507000001  20260508000000
20260512000000  20260512000001  20260512000002  20260513000000
20260514000000  20260514000001  20260516000000  20260520000000
20260521000000  20260521000001  20260521000002  20260530000000
20260531010000
```

> Note: this list is the full set of repo migration files dated after the frozen marker. The earlier summary cited "33"; the enumerated set here is what `supabase migration list --linked` will show as **Local-only** (Local column populated, Remote column blank).

There is also a **baseline/squash inverse divergence**: the repo was reset to `00000000000000_baseline_schema.sql`, while remote tracking still retains the pre-squash history up to the frozen marker. `migration repair` will reconcile the forward gap; the baseline-vs-old-history mismatch is cosmetic in the `list` output and does not block anything.

---

## 2. Per-migration classification (applied vs not-applied)

Legend: **APPLIED** = schema effect confirmed present in prod (safe to `repair --status applied`). **NOT APPLIED** = effect absent, DO NOT mark applied. **VERIFY (catalog)** = effect is a constraint/function-body REST cannot see; presence is *likely* but you must confirm with the catalog query in §4 before marking applied.

| Version | What it does | Classification | Evidence |
|---|---|---|---|
| 20260420032941 / 054330 / 195612 | early Apr schema adds | APPLIED | tables/cols present in OpenAPI |
| 20260422100000 | schema add | APPLIED | present in OpenAPI |
| 20260424000000 | (DB-05 rename target) prior `20260424` | APPLIED | see DB-05 note §3 |
| 20260427000000 / 024433 | (DB-05 rename target) + add | APPLIED | see DB-05 note §3 |
| **20260428000001** | **xero_pl_lines wide→long swap**: renames wide table to `xero_pl_lines_wide_legacy`, builds long-format `xero_pl_lines`, adds `xero_pl_lines_wide_compat` view | APPLIED | prod `xero_pl_lines` is long-format (cols: account_code, account_name, account_type, section, period_month, amount, basis…); `xero_pl_lines_wide_compat` present; `xero_pl_lines_wide_legacy` correctly **absent** (dropped by 20260531010000) |
| 20260428000002–06 | follow-on to the swap (indexes, backfill, compat) | APPLIED | long-format artifacts present |
| 20260429000001–04, 000010 | late-Apr adds | APPLIED | present in OpenAPI |
| 20260430000001 | schema add | APPLIED | present in OpenAPI |
| **20260430000002** | **`xero_pl_lines_business_id_fk`** → `business_profiles(id) ON DELETE RESTRICT` (pre-flight orphan check) | APPLIED (FK exists); **delete-action = VERIFY (catalog)** | `xero_pl_lines.business_id` present + FK to `business_profiles` shown in OpenAPI; `ON DELETE RESTRICT` not REST-visible |
| 20260430000003 / 04 / 10 / 11 | adds/backfills | APPLIED | present in OpenAPI |
| 20260503000000 | schema add | APPLIED | present in OpenAPI |
| **20260504000000** | **Phase 49 DB-01/DB-02 audit columns**: adds `deleted_at, deleted_by, created_by, updated_by` (+ partial `idx_<t>_deleted_at`) to 8 tables: `financial_forecasts, forecast_employees, forecast_pl_lines, monthly_actuals, xero_pl_lines, cfo_report_status, cfo_email_log, account_mappings`; plus DB-02 backfill | **❌ NOT APPLIED** | **All 8 target tables return 400 for `deleted_at`, `deleted_by`, `created_by`, `updated_by`** (probed 2026-05-31). This is the one genuine gap. |
| 20260504000001 | follow-on | APPLIED | present in OpenAPI (verify alongside, see note) |
| **20260505000000 / 20260506000000** | **DB-04 SET NULL FK batch** (~50 FKs) + NOT NULL relaxations on 14 cols | **VERIFY (catalog)** | FK delete-actions + NOT NULL not REST-visible |
| **20260507000000** | **DB-04 CASCADE** on 4 `process_flows`/`process_phases` FKs (irreversibility warning in header) | **VERIFY (catalog)** | delete-action not REST-visible |
| **20260507000001** | RPC `create_active_forecast_locked` (filename says `acquire_forecast_save_lock` — misleading) | APPLIED | `/rpc/create_active_forecast_locked` present in OpenAPI |
| **20260508000000** | DB-04 final: 2 Bucket-C RESTRICT FKs (signed off 2026-05-04) | **VERIFY (catalog)** | delete-action not REST-visible |
| 20260512000000 | `subscription_budgets.current_fy_spend` | APPLIED | column present (200) |
| 20260512000001 | `subscription_budgets.renewal_month` | APPLIED | column present (200) |
| 20260512000002 | `subscription_budgets.account_splits` | APPLIED | column present (200) |
| **20260513000000** | `xero_pl_lines.tenant_id` → **NOT NULL** (after the $28M null-tenant corruption on 2026-04-27) | APPLIED (col present); **NOT NULL = VERIFY (catalog)** | `tenant_id` column present; NOT NULL not REST-visible |
| **20260514000000** | **Phase 61**: `shared_with_all bool`, `shared_with uuid[]` on `daily_tasks` and `ideas` | APPLIED | all four columns present (200) |
| 20260514000001 | Phase 61 follow-on | APPLIED | present in OpenAPI |
| 20260516000000 | Phase 66: data backfill of `business_users` + `team_invites` (no DDL) | APPLIED (data-only) | no schema delta to probe; idempotent backfill |
| 20260520000000 | comment-only RLS intent documentation (no DDL) | APPLIED (no-op) | nothing to verify |
| **20260521000000 / 000001** | fix `auth_can_manage_business` / `auth_can_manage_team` to add `business_profiles → business_users` bridges (`CREATE OR REPLACE FUNCTION`) | **VERIFY (catalog)** | `SECURITY DEFINER` helpers are not REST-exposed; function body not probeable |
| **20260521000002** | DROP `auth_get_section_permissions`, `auth_get_team_role` (zero callers) | **VERIFY (catalog)** | not REST-exposed; confirm absence via catalog |
| 20260530000000 | late-May add | APPLIED | present in OpenAPI |
| **20260531010000** | DROP `xero_pl_lines_wide_legacy` (abandoned snapshot; CI fresh-build fix, PR #238) | APPLIED | `xero_pl_lines_wide_legacy` **absent** from OpenAPI (200 tables enumerated) |

**Bottom line:** 1 migration is definitively **NOT APPLIED** (`20260504000000`). ~26 are confirmed **APPLIED**. ~6 carry effects REST can't see and need a one-shot **catalog verification** (§4) before being marked applied — all are *expected* to be applied, but verify rather than assume.

---

## 3. DB-05 version-rename note (informational — moot in prod)

The header of `20260504000000` documents a DB-05 operator action performed in some environment:

```sql
UPDATE supabase_migrations.schema_migrations SET version='20260424000000' WHERE version='20260424';
-- and the same for 20260427 → 20260427000000
```

**This is moot for prod:** prod tracking is frozen at `20260218000001`, so rows `20260424`/`20260427` were never present there to rename. Do **not** run those UPDATEs against prod. The repo already carries the correctly-named files (`20260424000000`, `20260427000000`), and §5's `repair` sequence inserts the canonical names directly.

---

## 4. Catalog verification (run these read-only queries first)

Run in Studio SQL editor (read-only `SELECT`s). These confirm the **VERIFY (catalog)** rows above before you mark them applied.

**(a) FK delete-actions — DB-04 batches (20260430000002, 20260505/506/507/508):**

```sql
SELECT con.conname,
       rel.relname        AS child_table,
       confrel.relname    AS parent_table,
       con.confdeltype    AS on_delete   -- a=NO ACTION, r=RESTRICT, c=CASCADE, n=SET NULL, d=SET DEFAULT
FROM pg_constraint con
JOIN pg_class rel       ON rel.oid = con.conrelid
JOIN pg_class confrel   ON confrel.oid = con.confrelid
JOIN pg_namespace ns    ON ns.oid = rel.relnamespace
WHERE con.contype = 'f'
  AND ns.nspname = 'public'
ORDER BY child_table, con.conname;
```

Spot-check: `xero_pl_lines_business_id_fk` should be `r` (RESTRICT); the 4 `process_flows`/`process_phases` FKs from 20260507000000 should be `c` (CASCADE); the ~50 DB-04 batch FKs should be `n` (SET NULL).

**(b) NOT NULL on `xero_pl_lines.tenant_id` (20260513000000) + DB-04 relaxations:**

```sql
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ( (table_name='xero_pl_lines' AND column_name='tenant_id')
        OR column_name IN ('deleted_at','deleted_by','created_by','updated_by') )
ORDER BY table_name, column_name;
```

`xero_pl_lines.tenant_id` should be `NO` (NOT NULL).

**(c) auth helper bodies + drops (20260521000000/01/02):**

```sql
-- Should be PRESENT (bridges added):
SELECT proname, pg_get_functiondef(oid) ~ 'business_profiles' AS has_bp_bridge
FROM pg_proc
WHERE proname IN ('auth_can_manage_business','auth_can_manage_team');

-- Should be ABSENT (dropped):
SELECT proname FROM pg_proc
WHERE proname IN ('auth_get_section_permissions','auth_get_team_role');
```

**(d) Confirm the NOT-APPLIED finding for 20260504000000 (sanity before you apply it):**

```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema='public'
  AND column_name IN ('deleted_at','deleted_by','created_by','updated_by')
  AND table_name IN ('financial_forecasts','forecast_employees','forecast_pl_lines',
                     'monthly_actuals','xero_pl_lines','cfo_report_status',
                     'cfo_email_log','account_mappings');
-- Expect: ZERO rows. (REST probe on 2026-05-31 returned 400 for all 32 column checks.)
```

---

## 5. Recommended reconciliation

### Step 1 — apply the one missing migration (`20260504000000`)

This migration is **not** in prod. Its SQL is fully idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, backfill `UPDATE … WHERE created_by IS NULL`), so it is safe to run directly. **Run its SQL first**, then mark it applied in Step 2 along with the others.

Apply it via Studio SQL editor (paste the file contents) **or** let `supabase db push` apply it as part of Step 2 (push will run any migration whose version is missing from tracking — but push will try to run *every* untracked version, which re-executes already-applied SQL; that's only safe if the entire chain is idempotent — see the caution below). **Safest: paste `20260504000000` SQL manually, confirm with query (d), then use `repair` for the rest.**

### Step 2 — backfill tracking for the already-applied versions (no SQL re-run)

`migration repair --status applied <version>` writes a tracking row **without executing the migration's SQL**. Run one per version. **Order doesn't matter** for repair, but do `20260504000000` only *after* Step 1 has actually applied it.

After you've confirmed the **VERIFY (catalog)** rows in §4, mark the full set applied:

```bash
supabase migration repair --status applied \
  20260420032941 20260420054330 20260420195612 20260422100000 \
  20260424000000 20260427000000 20260427024433 20260428000001 \
  20260428000002 20260428000003 20260428000004 20260428000005 \
  20260428000006 20260429000001 20260429000002 20260429000003 \
  20260429000004 20260429000010 20260430000001 20260430000002 \
  20260430000003 20260430000004 20260430000010 20260430000011 \
  20260503000000 20260504000000 20260504000001 20260505000000 \
  20260506000000 20260507000000 20260507000001 20260508000000 \
  20260512000000 20260512000001 20260512000002 20260513000000 \
  20260514000000 20260514000001 20260516000000 20260520000000 \
  20260521000000 20260521000001 20260521000002 20260530000000 \
  20260531010000
```

> The CLI accepts multiple versions in one invocation; if your CLI version rejects the batch form, loop one version per call. **Do not** include `20260504000000` in this batch unless Step 1 has already applied its SQL.

### Step 3 — verify reconciliation

```bash
supabase migration list --linked
```

Every version should now show in **both** Local and Remote columns with no Local-only gap.

### Step 4 — fix the auto-apply pipeline (root cause)

`migration repair` only backfills history; it does not fix *why* tracking froze. The Supabase GitHub integration is not applying on merge to `main`. Separately decide: re-enable the GitHub integration's "apply migrations on push", **or** add a CI step (`supabase db push --linked`) gated on `main`. Until that's fixed, the drift will simply recur from the next merge.

> ⚠️ **Caution on `supabase db push` against prod going forward:** push runs every untracked migration's SQL. Once Steps 1–2 are done and tracking is current, push is safe for *future* migrations. But never run `db push` against prod while the 33-version gap is still untracked — it would re-execute 3 months of already-applied DDL. Several of those are *not* idempotent if their guards were stripped (e.g. the `RENAME TO` in 20260428000001 would fail on a second run because `xero_pl_lines_wide_legacy` no longer exists). Reconcile via `repair` first, push only after.

---

## 6. Fork replay-safety (inLIFE Pulse)

The inLIFE Pulse fork starts from a **fresh DB** and replays the **migration files** in order from `00000000000000_baseline_schema.sql`. The fork does **not** read prod's `schema_migrations`, so prod's drift is irrelevant to the fork — what matters is that the file chain is a complete, ordered, idempotent sequence.

**Critical path verified — the wide→long swap replays cleanly:**
- Baseline ships `xero_pl_lines` in **wide** format (`monthly_values jsonb`) — baseline_schema.sql:5573.
- `20260428000001` renames wide → `xero_pl_lines_wide_legacy`, builds long-format `xero_pl_lines` (guarded with `IF EXISTS`/`IF NOT EXISTS`).
- `20260531010000` drops `xero_pl_lines_wide_legacy` with `DROP … IF EXISTS`.
- Net: a fresh fork ends with long-format `xero_pl_lines`, no legacy table. ✅ Replay-safe.

**Divergence to be aware of:** because `20260504000000` IS in the repo and IS idempotent, the **fork will apply the DB-01/02 audit columns** — so a fresh fork will have `deleted_at/deleted_by/created_by/updated_by` on those 8 tables that **prod currently lacks**. Until you complete §5 Step 1, prod and the fork diverge on 32 columns + 8 indexes. Applying Step 1 closes that gap.

**Replay-safety watch-items (verify on a throwaway fork build, not prod):**
- `20260428000001` `RENAME TO` pair — safe on fresh baseline (wide table exists exactly once), but **not** idempotent on a second run. Fine for fork (single replay); never re-run against prod.
- `20260507000000` CASCADE FKs — irreversible by design; fine on fresh replay.
- DB-04 batches (20260505–508) — confirm the `pg_constraint` DO-block guards are present in each file so a re-run is a no-op (matters only if the fork is ever re-seeded).

**Recommendation:** before the next fork cut, run `supabase db reset` (or `db push` against a scratch project) from a clean DB to confirm the full chain applies end-to-end with zero errors. That single dry-run is the definitive replay-safety check.

---

## 7. Summary for action

1. **Run §4 catalog queries** (read-only) to confirm the 6 VERIFY rows and the NOT-APPLIED finding.
2. **Apply `20260504000000` SQL manually** (it's idempotent), confirm with query (d).
3. **Run the §5 Step 2 `migration repair` batch** to backfill tracking for all 45 versions (including 20260504000000 now that it's applied).
4. **`supabase migration list --linked`** — confirm no Local-only gap.
5. **Fix the auto-apply pipeline** (GitHub integration or CI `db push` on main) so drift doesn't recur.
6. **Dry-run the full chain on a scratch/fork DB** to certify replay-safety before the next inLIFE Pulse cut.

The only true schema gap is `20260504000000`; everything else is a tracking-only backfill via `repair`. Constraint/function effects (FK delete-actions, NOT NULL, auth helper bodies) are the only items REST couldn't confirm — §4 closes that.

---

## 7b. Rollback record — the 35 pre-squash rows deleted in the history repair

If the squash history repair (UPDATE 2026-05-31 later, item 4) ever needs to be undone,
re-insert these rows into `supabase_migrations.schema_migrations`:

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
('20240101000000','baseline_from_production'),
('20241120','financial_forecast'),
('20241121','add_forecast_method_analysis'),
('20241123','comprehensive_audit_and_versioning'),
('20251124','add_baseline_periods'),
('20251125','add_8_engine_scores'),
('20251126','create_quarterly_reviews'),
('20251127','add_ytd_annual_columns'),
('20251128','coach_portal_tables'),
('20251129','add_last_login_tracking'),
('20251202','add_locations_column'),
('20251203','add_five_ways_data'),
('20251204','coach_access_policies'),
('20251205','fix_weekly_reviews_schema'),
('20251209','add_missing_columns'),
('20251210','add_business_kpis_columns'),
('20251211','activity_logging_enhancements'),
('20251212','add_idea_type_column'),
('20251215','enhance_operational_activities'),
('20251217','fix_coach_forecast_pl_lines_employees'),
('20251219','fix_strategic_initiatives_rls'),
('20251220','ai_interactions'),
('20251222','fix_xero_connections_rls'),
('20251224','fix_function_search_paths'),
('20251227','fix_businesses_rls_recursion'),
('20251230','forecast_insights'),
('20260103','fix_notifications_column'),
('20260104','fix_forecast_trigger'),
('20260116','ai_cfo_conversations'),
('20260118','subscription_budgets'),
('20260123','fix_businesses_rls_final'),
('20260127000001','rls_10_10_implementation'),
('20260216000001','monthly_report_module'),
('20260216000002','create_xero_pl_lines'),
('20260218000001','monthly_report_phase4')
ON CONFLICT (version) DO NOTHING;
-- and optionally: DELETE FROM supabase_migrations.schema_migrations WHERE version='00000000000000';
```
