-- create_quarterly_swot never checked who was calling.
--
-- The RPC is SECURITY DEFINER (it bypasses swot_analyses RLS) and granted to
-- `authenticated`, but its body inserted a draft under whatever p_user_id it
-- was handed. Any logged-in user could create a SWOT keyed to any owner —
-- and, via unique_quarterly_swot(business_id, quarter, year, type), claim
-- that owner's quarter slot before they did.
--
-- SWOT is keyed by the business OWNER's auth user_id (p_user_id =
-- businesses.owner_id). The guard admits exactly the callers the
-- swot_analyses rls_access policy admits for that key:
--   * the owner themselves (p_user_id = auth.uid())
--   * super_admin
--   * the assigned coach of a business owned by p_user_id
--   * an active business_users member (any role) of a business owned by
--     p_user_id
--   * service_role (auth.uid() is null there, so bypass on auth.role())
-- Anyone else gets insufficient_privilege (42501).
--
-- Also carries forward the SEC-05 quarter/year validation from
-- 20260503000000, whose function body never reached prod. The table's own
-- CHECK constraints already enforce the same ranges, so this only changes
-- the error message, not what is accepted.
--
-- CREATE OR REPLACE keeps the ACL; the revoke/grant is re-issued anyway so
-- this file alone states the intended grants.

create or replace function public.create_quarterly_swot(
  p_user_id uuid,
  p_quarter text,
  p_year integer
) returns uuid
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  v_swot_id uuid;
  v_quarter_int integer;
  v_caller uuid := auth.uid();
begin
  if auth.role() is distinct from 'service_role' then
    if v_caller is null
       or p_user_id is null
       or not (
         p_user_id = v_caller
         or exists (
           select 1 from public.system_roles sr
           where sr.user_id = v_caller and sr.role = 'super_admin'
         )
         or exists (
           select 1 from public.businesses b
           where b.owner_id = p_user_id and b.assigned_coach_id = v_caller
         )
         or exists (
           select 1
           from public.businesses b
           join public.business_users bu on bu.business_id = b.id
           where b.owner_id = p_user_id
             and bu.user_id = v_caller
             and bu.status = 'active'
         )
       )
    then
      raise exception 'create_quarterly_swot: not permitted to create a SWOT for this business'
        using errcode = '42501';  -- insufficient_privilege
    end if;
  end if;

  -- SEC-05: validate quarter 1..4. The cast itself raises on non-numeric (loud).
  v_quarter_int := p_quarter::integer;
  if v_quarter_int < 1 or v_quarter_int > 4 then
    raise exception 'create_quarterly_swot: p_quarter must be 1..4 (got %)', p_quarter
      using errcode = '22023';  -- invalid_parameter_value
  end if;

  -- SEC-05: validate plausible year range.
  if p_year < 2020 or p_year > 2100 then
    raise exception 'create_quarterly_swot: p_year must be 2020..2100 (got %)', p_year
      using errcode = '22023';
  end if;

  insert into public.swot_analyses (user_id, business_id, quarter, year, type, status, created_by)
  values (p_user_id, p_user_id, v_quarter_int, p_year, 'quarterly', 'draft', v_caller)
  returning id into v_swot_id;
  return v_swot_id;
end;
$$;

revoke all on function public.create_quarterly_swot(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.create_quarterly_swot(uuid, text, integer) to authenticated, service_role;
