-- Team members could not save or read their business's assessment.
--
-- Assessments are keyed by the business OWNER's user_id (the pages write and
-- read `activeBusiness.ownerId`). The RLS only admitted the owner themselves,
-- the owner's assigned coach, or super_admin — so an active team member
-- (Chris Field, Scan2Archive, 25 Sep 2026) got "Failed to save assessment"
-- and could not read the results page either.
--
-- Admit active business_users members of a business whose owner the row is
-- keyed to. Writes need a writing role (owner/admin/member); viewers read only.

create policy assessments_team_member_select on public.assessments
  for select to authenticated
  using (exists (
    select 1
    from public.businesses b
    join public.business_users bu on bu.business_id = b.id
    where b.owner_id = assessments.user_id
      and bu.user_id = (select auth.uid())
      and bu.status = 'active'
  ));

create policy assessments_team_member_insert on public.assessments
  for insert to authenticated
  with check (exists (
    select 1
    from public.businesses b
    join public.business_users bu on bu.business_id = b.id
    where b.owner_id = assessments.user_id
      and bu.user_id = (select auth.uid())
      and bu.status = 'active'
      and bu.role in ('owner', 'admin', 'member')
  ));

create policy assessments_team_member_update on public.assessments
  for update to authenticated
  using (exists (
    select 1
    from public.businesses b
    join public.business_users bu on bu.business_id = b.id
    where b.owner_id = assessments.user_id
      and bu.user_id = (select auth.uid())
      and bu.status = 'active'
      and bu.role in ('owner', 'admin', 'member')
  ))
  with check (exists (
    select 1
    from public.businesses b
    join public.business_users bu on bu.business_id = b.id
    where b.owner_id = assessments.user_id
      and bu.user_id = (select auth.uid())
      and bu.status = 'active'
      and bu.role in ('owner', 'admin', 'member')
  ));
