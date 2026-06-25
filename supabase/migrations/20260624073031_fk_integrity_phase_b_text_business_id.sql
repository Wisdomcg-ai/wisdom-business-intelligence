-- FK Integrity, Phase B (Phase 75 R-5): convert the 6 text-typed `business_id`
-- columns to uuid and add their FK → business_profiles(id), rewriting the
-- text-based RLS policies to uuid form in lockstep (Phase A deferred these
-- precisely because the cast breaks `(x.id)::text = business_id` and
-- `business_id = ANY(auth_get_accessible_business_ids_text())`).
--
-- Pre-verified by 75-01 (audit + cleanse): every business_id on all 6 tables is
-- a valid business_profiles.id uuid; business_kpis had 13 biz-keyed dup rows,
-- deleted. So the cast cannot fail and the FK cannot reject a row.
--
-- Helper note: auth_get_accessible_business_ids() returns uuid[] unioning BOTH
-- businesses.id and business_profiles.id, so the profile-keyed comparison holds.
-- Policy rewrite is behaviour-preserving: every text comparison is type-adapted
-- to uuid; the businesses-branch of each coach check is kept (now always-false
-- since business_id is FK-bound to business_profiles, but harmless) rather than
-- dropped, to make this a pure type adaptation.
--
-- ORDER per table: DROP the business_id-referencing policies (they would block
-- the cast) → ALTER COLUMN ... TYPE uuid → ADD FK (idempotent) → CREATE the
-- uuid-form policies. user_id-only and super_admin-only policies are left intact.
--
-- ‼️ APPLY ON A SUPABASE BRANCH FIRST and verify client/coach/super_admin access
-- on all 6 tables before promoting to prod. Do NOT run blind on prod.

begin;

-- ============================================================================
-- activity_log
-- ============================================================================
drop policy if exists "Coaches can insert client activity log" on public.activity_log;
drop policy if exists "activity_log_select" on public.activity_log;
drop policy if exists "coach_insert_activity_log_coach_rls_v3" on public.activity_log;
drop policy if exists "coach_select_activity_log_coach_rls_v3" on public.activity_log;
-- (kept: "activity_log_insert" — user_id only, no business_id reference)

alter table public.activity_log alter column business_id type uuid using business_id::uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'activity_log_business_id_fkey' and conrelid = 'public.activity_log'::regclass) then
    alter table public.activity_log add constraint activity_log_business_id_fkey foreign key (business_id) references public.business_profiles(id) on delete cascade;
  end if;
end $$;

create policy "activity_log_select" on public.activity_log for select to authenticated
  using ((user_id = auth.uid()) or (business_id = any(public.auth_get_accessible_business_ids())) or public.auth_is_super_admin());

create policy "Coaches can insert client activity log" on public.activity_log for insert
  with check (
    (exists (select 1 from public.businesses b where b.id = activity_log.business_id and b.assigned_coach_id = auth.uid()))
    or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = activity_log.business_id and b.assigned_coach_id = auth.uid()))
    or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));

create policy "coach_insert_activity_log_coach_rls_v3" on public.activity_log for insert to authenticated
  with check (
    (exists (select 1 from public.businesses b where b.id = activity_log.business_id and b.assigned_coach_id = auth.uid()))
    or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = activity_log.business_id and b.assigned_coach_id = auth.uid()))
    or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));

create policy "coach_select_activity_log_coach_rls_v3" on public.activity_log for select to authenticated
  using (
    (exists (select 1 from public.businesses b where b.id = activity_log.business_id and b.assigned_coach_id = auth.uid()))
    or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = activity_log.business_id and b.assigned_coach_id = auth.uid()))
    or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));

-- ============================================================================
-- plan_snapshots  (coach policies reference business_id; user/super-admin do not)
-- ============================================================================
drop policy if exists "Coaches can insert client plan snapshots" on public.plan_snapshots;
drop policy if exists "Coaches can view client plan snapshots" on public.plan_snapshots;

alter table public.plan_snapshots alter column business_id type uuid using business_id::uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'plan_snapshots_business_id_fkey' and conrelid = 'public.plan_snapshots'::regclass) then
    alter table public.plan_snapshots add constraint plan_snapshots_business_id_fkey foreign key (business_id) references public.business_profiles(id) on delete cascade;
  end if;
end $$;

create policy "Coaches can insert client plan snapshots" on public.plan_snapshots for insert
  with check (
    (exists (select 1 from public.businesses b where b.id = plan_snapshots.business_id and b.assigned_coach_id = auth.uid()))
    or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = plan_snapshots.business_id and b.assigned_coach_id = auth.uid())));

create policy "Coaches can view client plan snapshots" on public.plan_snapshots for select
  using (
    (exists (select 1 from public.businesses b where b.id = plan_snapshots.business_id and b.assigned_coach_id = auth.uid()))
    or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = plan_snapshots.business_id and b.assigned_coach_id = auth.uid())));

-- ============================================================================
-- sprint_key_actions  (4 coach policies × 2 naming variants reference business_id)
-- ============================================================================
drop policy if exists "Coaches can delete client sprint actions" on public.sprint_key_actions;
drop policy if exists "Coaches can insert client sprint actions" on public.sprint_key_actions;
drop policy if exists "Coaches can update client sprint actions" on public.sprint_key_actions;
drop policy if exists "Coaches can view client sprint actions" on public.sprint_key_actions;
drop policy if exists "coach_delete_sprint_key_actions_coach_rls_v3" on public.sprint_key_actions;
drop policy if exists "coach_insert_sprint_key_actions_coach_rls_v3" on public.sprint_key_actions;
drop policy if exists "coach_select_sprint_key_actions_coach_rls_v3" on public.sprint_key_actions;
drop policy if exists "coach_update_sprint_key_actions_coach_rls_v3" on public.sprint_key_actions;

alter table public.sprint_key_actions alter column business_id type uuid using business_id::uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sprint_key_actions_business_id_fkey' and conrelid = 'public.sprint_key_actions'::regclass) then
    alter table public.sprint_key_actions add constraint sprint_key_actions_business_id_fkey foreign key (business_id) references public.business_profiles(id) on delete cascade;
  end if;
end $$;

-- coach check, reused for all 8 below
create policy "Coaches can delete client sprint actions" on public.sprint_key_actions for delete
  using ((exists (select 1 from public.businesses b where b.id = sprint_key_actions.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = sprint_key_actions.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "Coaches can insert client sprint actions" on public.sprint_key_actions for insert
  with check ((exists (select 1 from public.businesses b where b.id = sprint_key_actions.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = sprint_key_actions.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "Coaches can update client sprint actions" on public.sprint_key_actions for update
  using ((exists (select 1 from public.businesses b where b.id = sprint_key_actions.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = sprint_key_actions.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "Coaches can view client sprint actions" on public.sprint_key_actions for select
  using ((exists (select 1 from public.businesses b where b.id = sprint_key_actions.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = sprint_key_actions.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "coach_delete_sprint_key_actions_coach_rls_v3" on public.sprint_key_actions for delete to authenticated
  using ((exists (select 1 from public.businesses b where b.id = sprint_key_actions.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = sprint_key_actions.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "coach_insert_sprint_key_actions_coach_rls_v3" on public.sprint_key_actions for insert to authenticated
  with check ((exists (select 1 from public.businesses b where b.id = sprint_key_actions.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = sprint_key_actions.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "coach_select_sprint_key_actions_coach_rls_v3" on public.sprint_key_actions for select to authenticated
  using ((exists (select 1 from public.businesses b where b.id = sprint_key_actions.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = sprint_key_actions.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "coach_update_sprint_key_actions_coach_rls_v3" on public.sprint_key_actions for update to authenticated
  using ((exists (select 1 from public.businesses b where b.id = sprint_key_actions.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = sprint_key_actions.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')))
  with check ((exists (select 1 from public.businesses b where b.id = sprint_key_actions.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = sprint_key_actions.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));

-- ============================================================================
-- kpi_history  (Postgres blocks ALTER TYPE while a policy references the column —
-- even though rls_access's (business_id)::uuid expr would stay valid — so its
-- single policy must be dropped + recreated like the others)
-- ============================================================================
drop policy if exists "rls_access" on public.kpi_history;

alter table public.kpi_history alter column business_id type uuid using business_id::uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'kpi_history_business_id_fkey' and conrelid = 'public.kpi_history'::regclass) then
    alter table public.kpi_history add constraint kpi_history_business_id_fkey foreign key (business_id) references public.business_profiles(id) on delete cascade;
  end if;
end $$;

create policy "rls_access" on public.kpi_history for all to authenticated
  using (public.auth_is_super_admin() or (business_id = any(public.auth_get_accessible_business_ids())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_id and (b.owner_id = auth.uid() or b.assigned_coach_id = auth.uid() or (exists (select 1 from public.business_users bu where bu.business_id = b.id and bu.user_id = auth.uid() and bu.status = 'active'))))))
  with check (public.auth_is_super_admin() or public.auth_can_manage_business(business_id) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_id and (b.owner_id = auth.uid() or b.assigned_coach_id = auth.uid() or (exists (select 1 from public.business_users bu where bu.business_id = b.id and bu.user_id = auth.uid() and bu.status = 'active'))))));

-- ============================================================================
-- business_financial_goals
-- ============================================================================
drop policy if exists "Coaches can insert business financial goals v2" on public.business_financial_goals;
drop policy if exists "Coaches can update business financial goals v2" on public.business_financial_goals;
drop policy if exists "coach_delete_business_financial_goals_coach_rls_v3" on public.business_financial_goals;
drop policy if exists "coach_insert_business_financial_goals_coach_rls_v3" on public.business_financial_goals;
drop policy if exists "coach_select_business_financial_goals_coach_rls_v3" on public.business_financial_goals;
drop policy if exists "coach_update_business_financial_goals_coach_rls_v3" on public.business_financial_goals;
drop policy if exists "rls_access" on public.business_financial_goals;

alter table public.business_financial_goals alter column business_id type uuid using business_id::uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'business_financial_goals_business_id_fkey' and conrelid = 'public.business_financial_goals'::regclass) then
    alter table public.business_financial_goals add constraint business_financial_goals_business_id_fkey foreign key (business_id) references public.business_profiles(id) on delete cascade;
  end if;
end $$;

create policy "Coaches can insert business financial goals v2" on public.business_financial_goals for insert
  with check ((exists (select 1 from public.businesses b where b.id = business_financial_goals.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_financial_goals.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "Coaches can update business financial goals v2" on public.business_financial_goals for update
  using ((exists (select 1 from public.businesses b where b.id = business_financial_goals.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_financial_goals.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "coach_delete_business_financial_goals_coach_rls_v3" on public.business_financial_goals for delete to authenticated
  using ((exists (select 1 from public.businesses b where b.id = business_financial_goals.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_financial_goals.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "coach_insert_business_financial_goals_coach_rls_v3" on public.business_financial_goals for insert to authenticated
  with check ((exists (select 1 from public.businesses b where b.id = business_financial_goals.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_financial_goals.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "coach_select_business_financial_goals_coach_rls_v3" on public.business_financial_goals for select to authenticated
  using ((exists (select 1 from public.businesses b where b.id = business_financial_goals.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_financial_goals.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "coach_update_business_financial_goals_coach_rls_v3" on public.business_financial_goals for update to authenticated
  using ((exists (select 1 from public.businesses b where b.id = business_financial_goals.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_financial_goals.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')))
  with check ((exists (select 1 from public.businesses b where b.id = business_financial_goals.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_financial_goals.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "rls_access" on public.business_financial_goals for all to authenticated
  using (public.auth_is_super_admin() or (business_id = any(public.auth_get_accessible_business_ids())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_financial_goals.business_id and (b.owner_id = auth.uid() or b.assigned_coach_id = auth.uid() or (exists (select 1 from public.business_users bu where bu.business_id = b.id and bu.user_id = auth.uid() and bu.status = 'active'))))))
  with check (public.auth_is_super_admin() or public.auth_can_manage_business(business_id) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_financial_goals.business_id and (b.owner_id = auth.uid() or b.assigned_coach_id = auth.uid() or (exists (select 1 from public.business_users bu where bu.business_id = b.id and bu.user_id = auth.uid() and bu.status = 'active'))))));

-- ============================================================================
-- business_kpis
-- ============================================================================
drop policy if exists "Coaches can delete client KPIs" on public.business_kpis;
drop policy if exists "Coaches can insert client KPIs" on public.business_kpis;
drop policy if exists "Coaches can update client KPIs" on public.business_kpis;
drop policy if exists "Coaches can view client KPIs" on public.business_kpis;
drop policy if exists "coach_delete_business_kpis_coach_rls_v3" on public.business_kpis;
drop policy if exists "coach_insert_business_kpis_coach_rls_v3" on public.business_kpis;
drop policy if exists "coach_select_business_kpis_coach_rls_v3" on public.business_kpis;
drop policy if exists "coach_update_business_kpis_coach_rls_v3" on public.business_kpis;
drop policy if exists "rls_access" on public.business_kpis;

alter table public.business_kpis alter column business_id type uuid using business_id::uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'business_kpis_business_id_fkey' and conrelid = 'public.business_kpis'::regclass) then
    alter table public.business_kpis add constraint business_kpis_business_id_fkey foreign key (business_id) references public.business_profiles(id) on delete cascade;
  end if;
end $$;

create policy "Coaches can delete client KPIs" on public.business_kpis for delete
  using ((exists (select 1 from public.businesses b where b.id = business_kpis.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_kpis.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "Coaches can insert client KPIs" on public.business_kpis for insert
  with check ((exists (select 1 from public.businesses b where b.id = business_kpis.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_kpis.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "Coaches can update client KPIs" on public.business_kpis for update
  using ((exists (select 1 from public.businesses b where b.id = business_kpis.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_kpis.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "Coaches can view client KPIs" on public.business_kpis for select
  using ((exists (select 1 from public.businesses b where b.id = business_kpis.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_kpis.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "coach_delete_business_kpis_coach_rls_v3" on public.business_kpis for delete to authenticated
  using ((exists (select 1 from public.businesses b where b.id = business_kpis.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_kpis.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "coach_insert_business_kpis_coach_rls_v3" on public.business_kpis for insert to authenticated
  with check ((exists (select 1 from public.businesses b where b.id = business_kpis.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_kpis.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "coach_select_business_kpis_coach_rls_v3" on public.business_kpis for select to authenticated
  using ((exists (select 1 from public.businesses b where b.id = business_kpis.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_kpis.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "coach_update_business_kpis_coach_rls_v3" on public.business_kpis for update to authenticated
  using ((exists (select 1 from public.businesses b where b.id = business_kpis.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_kpis.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')))
  with check ((exists (select 1 from public.businesses b where b.id = business_kpis.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_kpis.business_id and b.assigned_coach_id = auth.uid())) or (exists (select 1 from public.system_roles sr where sr.user_id = auth.uid() and sr.role = 'super_admin')));
create policy "rls_access" on public.business_kpis for all to authenticated
  using (public.auth_is_super_admin() or (business_id = any(public.auth_get_accessible_business_ids())) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_kpis.business_id and (b.owner_id = auth.uid() or b.assigned_coach_id = auth.uid() or (exists (select 1 from public.business_users bu where bu.business_id = b.id and bu.user_id = auth.uid() and bu.status = 'active'))))))
  with check (public.auth_is_super_admin() or public.auth_can_manage_business(business_id) or (exists (select 1 from public.business_profiles bp join public.businesses b on b.id = bp.business_id where bp.id = business_kpis.business_id and (b.owner_id = auth.uid() or b.assigned_coach_id = auth.uid() or (exists (select 1 from public.business_users bu where bu.business_id = b.id and bu.user_id = auth.uid() and bu.status = 'active'))))));

commit;
