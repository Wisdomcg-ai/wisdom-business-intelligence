# 75-02 SUMMARY — R-5 FK Phase B + RLS rewrite (LIVE ON PROD 2026-06-24)

**Outcome: GREEN.** The 6 text-typed `business_id` columns are now uuid + FK-bound to
`business_profiles(id)`. Any future mis-key (a `businesses.id` or `user_id` written into these columns)
is now rejected by the FK — the loud backstop is in place. Applied to prod as migration version
`20260624073031` via the Supabase MCP (WisdomBI org connected this session).

## What shipped
- **Casts + FKs (6 tables):** activity_log, plan_snapshots, sprint_key_actions, kpi_history,
  business_financial_goals, business_kpis — `business_id` text→uuid, FK → business_profiles(id) CASCADE.
- **31 RLS policies rewritten** from text-based comparisons (`(x.id)::text = business_id`,
  `auth_get_accessible_business_ids_text()`) to uuid form, behaviour-preserving. Group B FKs already
  existed from Phase A; user_id/super_admin-only policies left untouched.

## Verification (real prod data, not a clone)
1. **Pre-flight:** read prod's applied migration list — the `505`–`508` "deferred" memory was stale (they
   ARE applied). My migration is independent and lands cleanly.
2. **Rolled-back dry-run on prod:** caught a real error — Postgres blocks `ALTER COLUMN TYPE` on a column
   referenced by ANY policy, even kpi_history's `(business_id)::uuid` one. Fixed (drop+recreate it too).
3. **RLS impersonation (SET ROLE + jwt claims):** coach + Precision client + Digital Bond client see
   IDENTICAL row counts before vs after (e.g. coach 58 KPIs / Precision 12 / Digital Bond 4) — no access
   gained or lost.
4. **Post-apply prod check:** 6 FKs present, all 6 columns uuid, policy counts 5/7/9/1/6/12 (unchanged).

## Reversibility
Cast back (`uuid→text`), drop the FKs, restore policies from the captured `pg_policies` dump. Not needed —
all checks green.

## Found en route (separate, flagged to Matt)
- **Migration drift:** prod is missing on-disk `20260617000000_add_business_financial_goals_current_actuals`
  (annual-reset `current_actuals` column) and `20260611000000_swot_repoint`. The broken auto-apply pipeline.

## Post-apply incident (2026-06-25, resolved) — schema cache, NOT the FK
Login hung after apply. Misdiagnosed as the FK rejecting a login-time write; dropping the FKs + reloading
the PostgREST schema restored login. A **non-blocking probe trigger** on all 6 tables then caught **ZERO**
mis-keyed writes on a fresh login — proving the FK was innocent. Real cause: **stale PostgREST schema cache**
after the text→uuid change (the `notify pgrst, 'reload schema'` hadn't propagated before the app retried).
Re-added the 6 FKs + reload + waited → fresh login + saves all work. FKs are LIVE; probe removed.
**Lesson:** after any direct-SQL DDL via the MCP, `notify pgrst` AND allow propagation before the app hits
it. (memory `project_postgrest_schema_reload`).

## Hand-off to 75-03
Now safe to remove the latent fallbacks (FKs are the loud backstop) AND drop the dead `business_profile_id`
column once `strategic-sync-service.ts` + `useQuarterlyReview.ts` stop reading it.
