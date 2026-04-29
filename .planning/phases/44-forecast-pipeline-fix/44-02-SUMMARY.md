---
phase: 44-forecast-pipeline-fix
plan: 02
status: complete
wave: 2
deployed: prod
completed_at: 2026-04-27
---

# Plan 44-02 — Sub-phase A Foundation Migrations: SUMMARY

**Status:** Complete (deployed to prod). Sub-phase A foundation is live: `xero_pl_lines` is long-format, `sync_jobs` audit table exists, `acquire_xero_sync_lock` RPC is callable by service role, `xero_pl_lines_wide_compat` view exposes the legacy wide shape read-only.

## Outcome

| Artifact | Status | Detail |
|----------|--------|--------|
| `xero_pl_lines` (long-format) | ✅ live | 4037 rows; columns: id, business_id, tenant_id, account_code, account_name, account_type, section, period_month, amount, source, created_at, updated_at |
| `xero_pl_lines_natural_key_idx` | ✅ live | UNIQUE on (business_id, COALESCE(tenant_id, ''), account_code, period_month) |
| `xero_pl_lines_wide_legacy` | ✅ preserved | 369 rows; pre-migration wide-format snapshot for rollback (drop in Phase 45 after stability soak) |
| `xero_pl_lines_wide_compat` | ✅ live | Read-only view projecting long-format back to monthly_values JSONB shape |
| `sync_jobs` table | ✅ live | Audit log; RLS allows coach/business-member SELECT, service-role full access; absence of authenticated write policies enforces append-only |
| `sync_jobs_business_started_idx` | ✅ live | (business_id, started_at DESC) |
| `sync_jobs_status_idx` | ✅ live | Partial index on status IN ('error','partial') |
| `acquire_xero_sync_lock(uuid)` RPC | ✅ live | Wraps pg_advisory_xact_lock(hashtext); SECURITY DEFINER; service-role-only EXECUTE |

## Commits

- `171802f` — feat(44-02): xero_pl_lines wide → long format migration (initial draft, schema-mismatched + Studio-incompatible)
- `efb2b57` — feat(44-02): sync_jobs audit table migration (initial draft)
- `817c76d` — feat(44-02): acquire_xero_sync_lock RPC migration (initial draft)
- `01dc98d` — fix(44-02): align long-format migration with actual prod xero_pl_lines schema (replaced fiscal_year with section; dropped source from SELECT; aligned wide-compat view)
- `6145e1c` — fix(44-02): make migration Studio-compatible (replaced DO $$ ... SELECT INTO variable pre-flight with DO $preflight$ ... IF EXISTS; uniquely-tagged dollar quote; removed explicit BEGIN/COMMIT)
- `b3ad990` — fix(44-02): make sync_jobs migration Studio-compatible (removed BEGIN/COMMIT; added DROP POLICY IF EXISTS guards for re-runability)
- `6883268` — fix(44-02): make advisory lock RPC migration Studio-compatible (uniquely-tagged $rpc_body$ dollar quote; removed BEGIN/COMMIT)

## Deviations from Plan

The plan assumed (a) the migrations would apply cleanly via the Supabase Management API like Phase 42-01, and (b) the prod `xero_pl_lines` schema matched the planner's assumed shape. Both were wrong, leading to four substantive deviations from the as-written plan:

### Deviation 1 — Prod xero_pl_lines schema diverged from the plan's assumed shape

The plan's INSERT...SELECT backfill assumed `xero_pl_lines` had columns `fiscal_year` and `source`. Inspection of prod showed the actual columns: `id, business_id, account_name, account_type, section, monthly_values, created_at, updated_at, account_code, tenant_id`. No `fiscal_year`, no `source`.

**Resolution:** rewrote the new long-format table and the wide-compat view to use `section` (which DOES exist on prod) instead of `fiscal_year`. Kept `source text DEFAULT 'xero'` as a column on the new table for future MYOB / multi-source work but dropped it from the SELECT (defaults applied automatically). See commit `01dc98d`.

### Deviation 2 — Supabase Studio SQL Editor parser fights with `DO $$ ... SELECT INTO variable`

The pre-flight check used `DO $$ DECLARE dup_count int; BEGIN SELECT count(*) INTO dup_count FROM (...) AS d; IF dup_count > 0 THEN RAISE EXCEPTION...` — Studio reported `relation "dup_count" does not exist`, suggesting it was splitting on `;` inside the dollar-quoted block.

**Resolution:** rewrote the pre-flight using `DO $preflight$ ... IF EXISTS (SELECT 1 ...) THEN RAISE EXCEPTION` — no PL/pgSQL variable, uniquely-tagged dollar quote, no SELECT INTO. The verification DO block was removed entirely (replaced with inline comments showing the queries to run separately). All three migrations also dropped explicit BEGIN/COMMIT (Studio uses an implicit transaction; idempotency guards via IF NOT EXISTS / DROP-IF-EXISTS-then-CREATE / CREATE OR REPLACE handle re-runs). See commits `6145e1c`, `b3ad990`, `6883268`.

### Deviation 3 — IICT Group production data had a `(business_id, tenant_id, account_code)` collision

Pre-flight aborted on first run: 1 duplicate group. Investigation: two distinct accounts ("Commissions Received" — Revenue, and "Foreign Currency Gains and Losses" — OpEx) both stored with `account_code = NULL` for IICT Group (`fbc6dffd-…` / tenant `1d83c9a4-…`). PostgreSQL's `GROUP BY` treats NULL as equal, so they collided at the natural key.

**Resolution:** synthesized unique account codes for both rows via direct UPDATE in Studio:
- `_SYNTH_COMMISSIONS_RECEIVED` for id `729fdbbd-…`
- `_SYNTH_FOREIGN_CURRENCY_GAINS_AND_LOSSES` for id `32492e59-…`

The new sync orchestrator (44-04) will overwrite these with real account codes if Xero now provides them, or preserve the synthetic codes if Xero still returns null-coded rows. Phase 44's new parser must handle null-coded accounts deterministically; that's a 44-03 / 44-04 acceptance concern.

### Deviation 4 — Migration partially succeeded despite Studio reporting "Failed to run"

After the schema-fix iteration, the migration appeared to fail with `relation dup_count does not exist`. Inspection showed the migration had actually completed: `xero_pl_lines` was already long-format (4037 rows), `xero_pl_lines_wide_legacy` was preserved (369 rows), `xero_pl_lines_v2` was gone (renamed correctly). Studio's error was misleading.

**Resolution:** verified the as-applied state via direct schema inspection. Confirmed:
- 4037 long rows = 369 wide rows × ~11 month-keys average (consistent with the JSONB unwrap; wide rows with empty `monthly_values` were correctly skipped per WHERE clause)
- 0 duplicates at the new natural key (business_id, tenant_id, account_code, period_month)
- 369 distinct (biz, tenant, account_code) groups exactly match the 369 legacy rows
- 24 distinct period_month values (May 2024 → Apr 2026), 4 distinct businesses

Migration 1 was left in its as-applied state and Migrations 2 + 3 were applied on top of it.

## Audit script bug (deferred fix)

The 44-01 audit script `scripts/audit-xero-pl-lines-duplicates.ts` reported 0 duplicate groups across all 369 rows pre-migration, but the IICT Group collision (account_code=NULL × 2 rows) clearly existed at the wide grain. The script's grouping logic is NULL-unaware and missed the collision.

**Deferred:** fix the audit script to use NULL-aware grouping (mirror SQL `GROUP BY` semantics, where NULL-NULL collides) before re-running for Phase 45 / future migrations. The script should also page through full row sets — Supabase's default 1000-row limit truncated some prior reads. Logged in `deferred-items.md`.

## Pre-existing prod data anomaly

xero_pl_lines had grown from ~369 wide rows to a much higher count (>1000 visible in paginated reads) due to the broken sync writing duplicate empty placeholder rows. Most duplicates were `mv_keys=0` empty-monthly_values rows that should have been UPDATE-on-conflict but were INSERT'd by the legacy sync. The wide→long migration's `ON CONFLICT DO NOTHING` silently retained only the first row per natural key, so the long-format table is now correctly de-duplicated (verified: 369 distinct accounts across 4037 long rows, 24 unique period_months).

## Goal-backward check

| Plan 44-02 must-have | Status | Evidence |
|----------------------|--------|----------|
| `xero_pl_lines` storage shape is LONG (D-09) | ✅ | Columns include period_month + amount; no monthly_values |
| Unique constraint enforced at DB level (D-09) | ✅ | xero_pl_lines_natural_key_idx UNIQUE on (biz, COALESCE(tenant,''), code, period_month) |
| `sync_jobs` audit table created (D-07) | ✅ | Table exists with all 13 columns + 2 indexes; RLS enabled append-only |
| Advisory lock RPC available (D-07) | ✅ | acquire_xero_sync_lock(uuid) callable as service role; pg_advisory_xact_lock idiom; pgBouncer-safe |
| Coverage column on sync_jobs (D-10) | ✅ | sync_jobs.coverage jsonb |
| Reconciliation column on sync_jobs (D-08) | ✅ | sync_jobs.reconciliation jsonb |
| Backwards-readable for legacy consumers | ✅ | xero_pl_lines_wide_compat view returns wide shape; readable; existing readers using `from('xero_pl_lines').select('monthly_values')` need to switch to the view (handled in Plans 44-09's consumer migration) |
| Pre-migration audit clean (D-07 idempotency precondition) | ✅ | After IICT remediation, 0 duplicates at new natural key |

## Next: Plan 44-03

Sub-phase A continues with `pl-by-month-parser.ts` + `pl-reconciler.ts` libraries (TDD against the JDS + Envisage fixtures captured in 44-01). Tests fill the `it.todo` placeholders in `src/__tests__/xero/pl-by-month-parser.test.ts` and `pl-reconciler.test.ts`.

**Important:** Plans 44-{03..05} continue Sub-phase A's atomic deployment session — the legacy sync routes (`sync-all`, `refresh-pl`, `sync-forecast`) will fail to write monthly_values JSONB to the post-migration table until Plan 44-05 retires those code paths. The user has been advised; do NOT click XeroSyncButton or trigger /api/Xero/refresh-pl manually until 44-05 ships.
