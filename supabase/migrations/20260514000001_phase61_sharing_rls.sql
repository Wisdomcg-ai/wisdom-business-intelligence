-- Phase 61: Selective List Sharing — Asymmetric RLS + status-flip RPCs
--
-- Depends on: 20260514000000_phase61_add_sharing_columns.sql (61-01)
--   That migration adds `shared_with_all boolean` and `shared_with uuid[]`
--   to `daily_tasks` and `ideas`. This migration assumes those columns exist.
--
-- Asymmetric model (CONTEXT.md decisions §RLS):
--   * SELECT is BROADENED to:
--       owner
--       OR (shared_with_all = true AND business_id ∈ auth_get_accessible_business_ids())
--       OR auth.uid() = ANY(shared_with)
--   * INSERT / UPDATE / DELETE remain STRICTLY OWNER-ONLY.
--   * The ONLY non-owner mutation channel is the two SECURITY DEFINER RPCs
--     defined below (mark_task_complete, mark_idea_status). They perform their
--     own visibility check and narrowly update only status columns.
--
-- Scope (NON-NEGOTIABLE): only `daily_tasks` and `ideas`. Do NOT touch
-- `action_items`, `issues_list`, `ideas_filter`, or `business_users` RLS.
--
-- Idempotency: DROP POLICY IF EXISTS + CREATE POLICY; CREATE OR REPLACE
-- FUNCTION. Re-running this migration is a no-op (modulo policy text changes).
--
-- Atomic: the whole file is wrapped in BEGIN/COMMIT so policies and RPCs land
-- together or not at all.

BEGIN;

-- =====================================================================
-- Section A — daily_tasks: broaden SELECT, keep mutations owner-only
-- =====================================================================
--
-- Existing policies (baseline_schema.sql lines 10026, 10071, 10236, 10341):
--   "Users can view their own tasks"   — SELECT, user_id = auth.uid()
--   "Users can create their own tasks" — INSERT, WITH CHECK user_id = auth.uid()
--   "Users can update their own tasks" — UPDATE, USING  user_id = auth.uid()
--   "Users can delete their own tasks" — DELETE, USING  user_id = auth.uid()
--
-- We DROP and replace ONLY the SELECT policy. The INSERT/UPDATE/DELETE
-- policies are intentionally left in place — they already enforce
-- owner-only mutation, which is exactly the asymmetric guarantee we want.
-- Recipients literally cannot rename/archive/delete via generic UPDATE.
DROP POLICY IF EXISTS "Users can view their own tasks"   ON public.daily_tasks;
DROP POLICY IF EXISTS "daily_tasks_select_shared"        ON public.daily_tasks;

CREATE POLICY "daily_tasks_select_shared"
  ON public.daily_tasks
  FOR SELECT
  TO authenticated
  USING (
    user_id = ( SELECT auth.uid() )
    OR (
      shared_with_all = true
      AND business_id IS NOT NULL
      AND business_id = ANY (public.auth_get_accessible_business_ids())
    )
    OR ( SELECT auth.uid() ) = ANY (shared_with)
  );

COMMENT ON POLICY "daily_tasks_select_shared" ON public.daily_tasks IS
  'Phase 61: asymmetric RLS — owner OR (team-wide + business member) OR explicit recipient. INSERT/UPDATE/DELETE policies are intentionally NOT modified; they keep mutations owner-only. Non-owner status flips go through public.mark_task_complete RPC.';

-- =====================================================================
-- Section B — ideas: broaden SELECT, preserve every pre-existing clause
-- =====================================================================
--
-- Existing policy (baseline_schema.sql lines 12100-12107, verbatim):
--   CREATE POLICY "ideas_select_consolidated" ON "public"."ideas"
--     FOR SELECT TO "authenticated" USING ((
--       ("user_id" = ( SELECT "auth"."uid"() AS "uid"))
--       OR (EXISTS ( SELECT 1
--             FROM "public"."system_roles"
--            WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))
--                   AND ("system_roles"."role" = 'super_admin'::"text"))))
--       OR ("user_id" IN ( SELECT "b"."owner_id"
--             FROM "public"."businesses" "b"
--            WHERE ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid"))))
--       OR (EXISTS ( SELECT 1
--             FROM ("public"."businesses" "b"
--                   JOIN "public"."profiles" "p" ON (("p"."business_id" = "b"."id")))
--            WHERE (("p"."id" = "ideas"."user_id")
--                   AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))))
--     ));
--
-- The four pre-phase OR clauses are reproduced VERBATIM below; the two new
-- Phase 61 clauses (shared_with_all + shared_with) are appended as additive ORs.
-- INSERT / UPDATE / DELETE policies on `ideas` are NOT touched.
DROP POLICY IF EXISTS "ideas_select_consolidated" ON public.ideas;

CREATE POLICY "ideas_select_consolidated"
  ON public.ideas
  FOR SELECT
  TO authenticated
  USING ((
    -- pre-existing clauses (copied verbatim from baseline_schema.sql) ↓↓↓
    ("user_id" = ( SELECT "auth"."uid"() AS "uid"))
    OR (EXISTS ( SELECT 1
          FROM "public"."system_roles"
         WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))
                AND ("system_roles"."role" = 'super_admin'::"text"))))
    OR ("user_id" IN ( SELECT "b"."owner_id"
          FROM "public"."businesses" "b"
         WHERE ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid"))))
    OR (EXISTS ( SELECT 1
          FROM ("public"."businesses" "b"
                JOIN "public"."profiles" "p" ON (("p"."business_id" = "b"."id")))
         WHERE (("p"."id" = "ideas"."user_id")
                AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))))
    -- ↑↑↑ pre-existing clauses preserved verbatim
    -- new Phase 61 clauses (additive) ↓↓↓
    OR (
      "shared_with_all" = true
      AND "business_id" IS NOT NULL
      AND "business_id" = ANY (public.auth_get_accessible_business_ids())
    )
    OR (( SELECT "auth"."uid"() AS "uid") = ANY ("shared_with"))
  ));

COMMENT ON POLICY "ideas_select_consolidated" ON public.ideas IS
  'Phase 61: broadened SELECT — original four OR clauses (owner / super_admin / coach via assigned_coach_id / coach via profiles JOIN) preserved verbatim, with two additive sharing clauses (team-wide + business member, and explicit recipient). INSERT/UPDATE/DELETE policies (ideas_insert_final, ideas_update_consolidated, ideas_delete_consolidated, coach_*_ideas_coach_rls_v3) are unchanged. Non-owner status flips go through public.mark_idea_status RPC.';

-- =====================================================================
-- Section C — Status-flip RPCs (RESEARCH.md §5 Risk 1, Option B)
-- =====================================================================
--
-- These are the ONLY channel through which a non-owner can mutate a shared
-- row. They run with SECURITY DEFINER, perform their own visibility check
-- (mirroring the SELECT predicate), then narrowly update ONLY:
--   * daily_tasks: status, completed_at, updated_at
--   * ideas:       status, updated_at
-- They do NOT mutate user_id, business_id, shared_with_all, shared_with,
-- title, description, or any other column. Recipients literally cannot
-- re-share or rename through this channel.
--
-- search_path is locked to public to defeat search-path injection attacks
-- against SECURITY DEFINER functions.

-- ---------------------------------------------------------------------
-- C.1  mark_task_complete(p_task_id, p_completed)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_task_complete(
  p_task_id uuid,
  p_completed boolean
) RETURNS public.daily_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.daily_tasks;
  v_uid  uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Visibility check: same predicate as the daily_tasks SELECT policy.
  -- We use SELECT ... INTO with the predicate inline so that a row not
  -- visible to the caller resolves to NOT FOUND and we raise 42501.
  SELECT t.* INTO v_task
    FROM public.daily_tasks t
   WHERE t.id = p_task_id
     AND (
       t.user_id = v_uid
       OR (
         t.shared_with_all = true
         AND t.business_id IS NOT NULL
         AND t.business_id = ANY (public.auth_get_accessible_business_ids())
       )
       OR v_uid = ANY (t.shared_with)
     );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found or access denied'
      USING ERRCODE = '42501';
  END IF;

  -- Narrow UPDATE: ONLY status, completed_at, updated_at.
  -- The bare WHERE id = p_task_id is safe here because we already verified
  -- visibility above; SECURITY DEFINER bypasses RLS for this UPDATE so the
  -- owner-only UPDATE policy does not block recipients on this code path.
  UPDATE public.daily_tasks
     SET status       = CASE WHEN p_completed THEN 'done' ELSE 'to-do' END,
         completed_at = CASE WHEN p_completed THEN now() ELSE NULL END,
         updated_at   = now()
   WHERE id = p_task_id
  RETURNING * INTO v_task;

  RETURN v_task;
END;
$$;

REVOKE ALL    ON FUNCTION public.mark_task_complete(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_task_complete(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.mark_task_complete(uuid, boolean) IS
  'Phase 61: lets a recipient (or owner) flip a shared daily_task between done/to-do. SECURITY DEFINER with manual visibility check + narrowed column update (status, completed_at, updated_at only) — bypasses the owner-only UPDATE policy by design. Raises SQLSTATE 42501 on access denied. Allowed status values come from daily_tasks_status_check: to-do/in-progress/done.';

-- ---------------------------------------------------------------------
-- C.2  mark_idea_status(p_idea_id, p_status)
-- ---------------------------------------------------------------------
--
-- Note on allowed-status source of truth: the `ideas` table has NO
-- ideas_status_check CHECK constraint in the schema (verified by grep
-- against supabase/migrations/). The canonical list of allowed values
-- lives in the application's IdeaStatus type at
-- src/lib/services/ideasService.ts:23:
--     export type IdeaStatus = 'captured' | 'under_review' | 'approved' | 'rejected' | 'parked';
-- We mirror that list here as v_allowed. If a future migration adds a
-- CHECK constraint to the column, update both this RPC and the TS type
-- in lockstep.
CREATE OR REPLACE FUNCTION public.mark_idea_status(
  p_idea_id uuid,
  p_status  text
) RETURNS public.ideas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idea    public.ideas;
  v_uid     uuid    := auth.uid();
  v_allowed text[]  := ARRAY['captured', 'under_review', 'approved', 'rejected', 'parked'];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (p_status = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'Invalid idea status: %', p_status
      USING ERRCODE = '22P02';  -- invalid_text_representation
  END IF;

  -- Visibility check: mirrors the broadened ideas SELECT predicate.
  SELECT i.* INTO v_idea
    FROM public.ideas i
   WHERE i.id = p_idea_id
     AND (
       -- pre-existing clauses (mirror baseline policy verbatim) ↓↓↓
       i.user_id = v_uid
       OR EXISTS (
         SELECT 1 FROM public.system_roles
          WHERE system_roles.user_id = v_uid
            AND system_roles.role = 'super_admin'
       )
       OR i.user_id IN (
         SELECT b.owner_id
           FROM public.businesses b
          WHERE b.assigned_coach_id = v_uid
       )
       OR EXISTS (
         SELECT 1
           FROM public.businesses b
           JOIN public.profiles  p ON p.business_id = b.id
          WHERE p.id = i.user_id
            AND b.assigned_coach_id = v_uid
       )
       -- ↑↑↑ pre-existing clauses preserved
       -- new Phase 61 clauses ↓↓↓
       OR (
         i.shared_with_all = true
         AND i.business_id IS NOT NULL
         AND i.business_id = ANY (public.auth_get_accessible_business_ids())
       )
       OR v_uid = ANY (i.shared_with)
     );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Idea not found or access denied'
      USING ERRCODE = '42501';
  END IF;

  -- Narrow UPDATE: ONLY status, updated_at.
  UPDATE public.ideas
     SET status     = p_status,
         updated_at = now()
   WHERE id = p_idea_id
  RETURNING * INTO v_idea;

  RETURN v_idea;
END;
$$;

REVOKE ALL    ON FUNCTION public.mark_idea_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_idea_status(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.mark_idea_status(uuid, text) IS
  'Phase 61: lets a recipient (or owner) flip a shared idea status. SECURITY DEFINER, narrow column update (status, updated_at only). Allowed status values: captured / under_review / approved / rejected / parked (mirrors IdeaStatus TS type at src/lib/services/ideasService.ts:23). Raises SQLSTATE 42501 on access denied, 22P02 on invalid status.';

COMMIT;
