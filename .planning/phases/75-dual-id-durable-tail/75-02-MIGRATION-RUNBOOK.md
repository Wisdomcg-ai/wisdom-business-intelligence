# 75-02 Migration Runbook — FK Phase B (text business_id → uuid + FK + RLS rewrite)

**Migration:** `supabase/migrations/20260624000000_fk_integrity_phase_b_text_business_id.sql`
**Risk:** HIGH (6 column casts + 30 RLS policy rewrites on live tables). **Validated by 75-01:** all 6
`business_id` columns are 100% valid profile uuids; cleanse removed the 13 blocker rows. Atomic
(`begin/commit`) and re-runnable (DROP POLICY IF EXISTS + guarded FK).

## ⚠️ Rule: branch first, prod never blind

Do NOT run this on prod first. Apply to a **Supabase branch** (a copy of prod), verify role access, then
promote. The pre-flight also confirmed the deferred `505`–`508` (Phase 49 audit-attribution FKs) are
unrelated to this DDL — apply THIS migration explicitly, don't `db push` everything pending.

## Step 1 — create a branch + apply
- Supabase Dashboard → Branches → create a branch off prod, OR `supabase branches create phase75-fkb`.
- Apply ONLY this migration to the branch (dashboard SQL editor: paste the file, or push to the branch).
- It must complete with no error (atomic — a failure rolls the whole thing back).

## Step 2 — structural verification (SQL, read-only on the branch)
```sql
-- 6 FKs now exist
SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
WHERE conname IN ('activity_log_business_id_fkey','plan_snapshots_business_id_fkey',
  'sprint_key_actions_business_id_fkey','kpi_history_business_id_fkey',
  'business_financial_goals_business_id_fkey','business_kpis_business_id_fkey');  -- expect 6

-- business_id is now uuid on all 6
SELECT table_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND column_name='business_id'
  AND table_name IN ('activity_log','plan_snapshots','sprint_key_actions','kpi_history',
                     'business_financial_goals','business_kpis');  -- all 'uuid'

-- policy counts per table match the pre-migration dump
SELECT tablename, count(*) FROM pg_policies WHERE schemaname='public'
  AND tablename IN ('activity_log','plan_snapshots','sprint_key_actions','kpi_history',
                    'business_financial_goals','business_kpis') GROUP BY tablename ORDER BY tablename;
-- expect: activity_log 5, business_financial_goals 7, business_kpis 9, kpi_history 1,
--         plan_snapshots 6, sprint_key_actions 12
```

## Step 3 — functional verification (the real test — RLS access by role)
Point a preview/local app build at the **branch** DB (swap the Supabase URL/keys), then log in and confirm
nothing lost access:
- **A coach** viewing an assigned client: KPIs, financial goals, activity log, and sprint actions all
  **load and save** (insert/update). Quarterly-review save still writes kpi_actuals/snapshots.
- **The client** (business owner) login: sees their own KPIs/goals/sprint actions; can edit.
- **A different coach / unrelated user:** sees NONE of that client's rows (no cross-tenant leak).
- **Super admin:** sees all.
Spot-check the two real clients from 75-01 (Precision `86e9d84f`, Digital Bond `61a7809f`) — their KPIs
must still be visible/editable to their coach.

## Step 4 — promote to prod
Only after Step 3 is GREEN on the branch. Apply the SAME migration file to prod through the normal
supervised pipeline (explicit apply of this one file — not a blanket `db push`). Re-run Step 2's
structural checks against prod. Re-run `node scripts/audit-dual-id-fk-readiness.mjs` (expect all GREEN).

## Rollback (if Step 3 fails on the branch)
The branch is disposable — just delete it; prod is untouched. If a problem is found AFTER a prod apply
(shouldn't happen if the branch passed): revert via `ALTER COLUMN business_id TYPE text USING
business_id::text` + `DROP CONSTRAINT ..._business_id_fkey` per table, then restore the old policies from
the pre-migration `pg_policies` dump (saved with this wave). Row data is safe (cast is reversible; 75-01
snapshot covers the deleted dup rows).

## NOT in this migration (deliberately)
- `business_profile_id` is NOT dropped — `strategic-sync-service.ts` + `useQuarterlyReview.ts` still read
  it. Drop it in a follow-up migration AFTER 75-03 removes those code references.
- The coach checks keep both id-space branches (type-adapted); the now-dead businesses-branch can be
  collapsed to single-branch in a later cleanup once this is confirmed stable.
