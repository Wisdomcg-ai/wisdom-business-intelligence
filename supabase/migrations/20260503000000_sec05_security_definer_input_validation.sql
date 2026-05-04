-- Phase 46 Plan 46-03 — SEC-05 input validation for SECURITY DEFINER functions.
--
-- Adds RAISE EXCEPTION guards to two functions granted to anon/authenticated/service_role
-- (see baseline_schema.sql:13394-13402):
--   create_quarterly_swot(p_user_id, p_quarter, p_year) — quarter must be 1..4, year 2020..2100
--   create_test_user(p_email, p_role)                   — role must be one of canonical list
--
-- The canonical role list ('client', 'coach', 'super_admin') mirrors the
-- system_roles_role_check CHECK constraint defined at baseline_schema.sql:5153.
-- Using RAISE EXCEPTION here gives a clear error surface ("must be one of ...")
-- instead of the generic "violates check constraint system_roles_role_check"
-- error a downstream INSERT would emit.
--
-- No callers break: verified all 5 production callers
--   src/app/swot/page.tsx:203
--   src/app/quarterly-review/components/steps/SwotUpdateStep.tsx:250, 397, 486
-- pass quarter values 1..4 (RESEARCH.md SEC-05). create_test_user has zero
-- production callers in src/ or scripts/ (only invoked manually from psql).
--
-- Defence-in-depth: REVOKE EXECUTE on create_test_user from anon and
-- authenticated. The function has zero production callers; service_role is the
-- only legitimate caller (developer running psql with the service key).
--
-- Rollback: a follow-up migration (e.g. 20260503000001_sec05_revert.sql) that
-- re-applies the original function bodies copied from baseline_schema.sql:499-530
-- and re-grants EXECUTE on create_test_user to anon/authenticated. Do not write
-- the rollback file unless rollback is needed — the original bodies are intact
-- in baseline_schema.sql for reference.

BEGIN;

-- ----- create_quarterly_swot -----
-- Note: we intentionally keep the empty SET search_path TO '' from the original
-- definition (security hardening — prevents schema-injection via search_path).
-- All references inside the body are schema-qualified accordingly.
CREATE OR REPLACE FUNCTION "public"."create_quarterly_swot"(
  "p_user_id" "uuid",
  "p_quarter" "text",
  "p_year" integer
) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_swot_id UUID;
  v_quarter_int INTEGER;
BEGIN
  -- SEC-05: validate quarter 1..4. The cast itself raises on non-numeric (loud).
  v_quarter_int := p_quarter::INTEGER;
  IF v_quarter_int < 1 OR v_quarter_int > 4 THEN
    RAISE EXCEPTION 'create_quarterly_swot: p_quarter must be 1..4 (got %)', p_quarter
      USING ERRCODE = '22023';  -- invalid_parameter_value
  END IF;

  -- SEC-05: validate plausible year range (avoid year-9999 bombs).
  IF p_year < 2020 OR p_year > 2100 THEN
    RAISE EXCEPTION 'create_quarterly_swot: p_year must be 2020..2100 (got %)', p_year
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.swot_analyses (user_id, business_id, quarter, year, type, status, created_by)
  VALUES (p_user_id, p_user_id, v_quarter_int, p_year, 'quarterly', 'draft', auth.uid())
  RETURNING id INTO v_swot_id;
  RETURN v_swot_id;
END;
$$;

-- ----- create_test_user -----
CREATE OR REPLACE FUNCTION "public"."create_test_user"(
  "p_email" "text",
  "p_role" "text" DEFAULT 'client'::"text"
) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- SEC-05: enforce canonical role list. Mirrors system_roles_role_check at
  -- baseline_schema.sql:5153 — keep this in sync if the table constraint changes.
  IF p_role NOT IN ('client', 'coach', 'super_admin') THEN
    RAISE EXCEPTION 'create_test_user: p_role must be one of client/coach/super_admin (got %)', p_role
      USING ERRCODE = '22023';
  END IF;

  v_user_id := gen_random_uuid();
  INSERT INTO public.system_roles (user_id, role) VALUES (v_user_id, p_role);
  RETURN v_user_id;
END;
$$;

-- ----- Defence-in-depth: revoke broad grants on create_test_user. -----
-- create_test_user has zero production callers (verified via grep -rn
-- "create_test_user" src/ scripts/). It is only invoked by developers from psql
-- with the service_role key. With the role-list guard above, an unauthenticated
-- caller can still create system_roles rows (just only with canonical roles),
-- so revoking anon/authenticated EXECUTE is the right defence-in-depth move.
REVOKE EXECUTE ON FUNCTION "public"."create_test_user"("p_email" "text", "p_role" "text") FROM "anon";
REVOKE EXECUTE ON FUNCTION "public"."create_test_user"("p_email" "text", "p_role" "text") FROM "authenticated";

COMMIT;
