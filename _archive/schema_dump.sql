Initialising login role...
Dumping schemas from remote database...


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."todo_priority" AS ENUM (
    'high',
    'medium',
    'low'
);


ALTER TYPE "public"."todo_priority" OWNER TO "postgres";


CREATE TYPE "public"."todo_status" AS ENUM (
    'pending',
    'in-progress',
    'completed'
);


ALTER TYPE "public"."todo_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_coach_to_process"("process_id" "uuid", "coach_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  UPDATE public.process_diagrams
  SET coach_id = $2
  WHERE id = $1 AND coach_id IS NULL;
END;
$_$;


ALTER FUNCTION "public"."assign_coach_to_process"("process_id" "uuid", "coach_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_employee_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DECLARE
    current_user_id uuid;
  BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NOT NULL
       AND current_user_id != '00000000-0000-0000-0000-000000000000'::uuid THEN

      IF EXISTS (SELECT 1 FROM auth.users WHERE id = current_user_id) THEN
        INSERT INTO public.forecast_audit_log (
          forecast_id,
          user_id,
          table_name,
          operation,
          old_data,
          new_data
        ) VALUES (
          COALESCE(NEW.forecast_id, OLD.forecast_id),
          current_user_id,
          'forecast_employees',
          TG_OP,
          CASE WHEN TG_OP IN ('DELETE', 'UPDATE') THEN row_to_json(OLD) ELSE NULL END,
          CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END
        );
      END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
  END;
$$;


ALTER FUNCTION "public"."audit_employee_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_process"("process_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF process_user_id = auth.uid() THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin') THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.owner_id = process_user_id
    AND b.assigned_coach_id = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."can_access_process"("process_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_password_tokens"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.password_reset_tokens
  WHERE expires_at < NOW()
  OR used_at IS NOT NULL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_password_tokens"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_audit_logs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.audit_log
  WHERE created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_audit_logs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_user_setup"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE public.businesses
  SET onboarding_completed = TRUE,
      onboarding_completed_at = NOW()
  WHERE owner_id = p_user_id;

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."complete_user_setup"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_app_user"("p_email" "text", "p_password" "text", "p_full_name" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id UUID;
BEGIN
  INSERT INTO auth.users (
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data
  ) VALUES (
    p_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object('full_name', p_full_name)
  )
  RETURNING id INTO v_user_id;
  RETURN v_user_id;
END;
$$;


ALTER FUNCTION "public"."create_app_user"("p_email" "text", "p_password" "text", "p_full_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_baseline_scenario_for_forecast"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.forecast_scenarios (
    forecast_id, user_id, name, description, scenario_type,
    revenue_multiplier, cogs_multiplier, opex_multiplier,
    is_active, is_baseline
  ) VALUES (
    NEW.id, NEW.user_id, 'Baseline', 'Original forecast values',
    'active', 1.0, 1.0, 1.0, TRUE, TRUE
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_baseline_scenario_for_forecast"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_client_account"("p_email" "text", "p_business_name" "text", "p_coach_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("user_id" "uuid", "business_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id UUID;
  v_business_id UUID;
BEGIN
  v_user_id := gen_random_uuid();

  INSERT INTO public.businesses (owner_id, business_name, assigned_coach_id)
  VALUES (v_user_id, p_business_name, p_coach_id)
  RETURNING id INTO v_business_id;

  INSERT INTO public.system_roles (user_id, role)
  VALUES (v_user_id, 'client');

  RETURN QUERY SELECT v_user_id, v_business_id;
END;
$$;


ALTER FUNCTION "public"."create_client_account"("p_email" "text", "p_business_name" "text", "p_coach_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_quarterly_swot"("p_user_id" "uuid", "p_quarter" "text", "p_year" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_swot_id UUID;
BEGIN
  INSERT INTO public.swot_analyses (user_id, quarter, year)
  VALUES (p_user_id, p_quarter, p_year)
  RETURNING id INTO v_swot_id;
  RETURN v_swot_id;
END;
$$;


ALTER FUNCTION "public"."create_quarterly_swot"("p_user_id" "uuid", "p_quarter" "text", "p_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_test_user"("p_email" "text", "p_role" "text" DEFAULT 'client'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- For testing purposes only
  v_user_id := gen_random_uuid();

  INSERT INTO public.system_roles (user_id, role)
  VALUES (v_user_id, p_role);

  RETURN v_user_id;
END;
$$;


ALTER FUNCTION "public"."create_test_user"("p_email" "text", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_version_snapshot"("p_forecast_id" "uuid", "p_version_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_new_id UUID;
  v_new_version INTEGER;
BEGIN
  SELECT public.get_next_version_number(p_forecast_id) INTO v_new_version;

  INSERT INTO public.financial_forecasts (
    business_id, user_id, name, description, fiscal_year, year_type,
    baseline_start_month, baseline_end_month, actual_start_month, actual_end_month,
    forecast_start_month, forecast_end_month, is_completed, currency,
    forecast_type, version_number, is_active, parent_forecast_id, version_notes
  )
  SELECT
    business_id, user_id, name || ' v' || v_new_version, description, fiscal_year, year_type,
    baseline_start_month, baseline_end_month, actual_start_month, actual_end_month,
    forecast_start_month, forecast_end_month, is_completed, currency,
    'forecast', v_new_version, FALSE, p_forecast_id, p_version_notes
  FROM public.financial_forecasts
  WHERE id = p_forecast_id
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;


ALTER FUNCTION "public"."create_version_snapshot"("p_forecast_id" "uuid", "p_version_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_single_active_scenario"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.is_active = TRUE THEN
    UPDATE public.forecast_scenarios
    SET is_active = FALSE
    WHERE forecast_id = NEW.forecast_id
    AND id != NEW.id
    AND is_active = TRUE;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_single_active_scenario"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_all_users"() RETURNS TABLE("id" "uuid", "email" "text", "full_name" "text", "role" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Only super admins can call this
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::TEXT,
    (u.raw_user_meta_data->>'full_name')::TEXT AS full_name,
    COALESCE(sr.role, 'client')::TEXT AS role,
    u.created_at
  FROM auth.users u
  LEFT JOIN public.system_roles sr ON u.id = sr.user_id
  ORDER BY u.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_all_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_coach_for_process"("process_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  coach_id UUID;
BEGIN
  SELECT b.assigned_coach_id INTO coach_id
  FROM public.businesses b
  WHERE b.owner_id = process_user_id
  LIMIT 1;

  RETURN coach_id;
END;
$$;


ALTER FUNCTION "public"."get_coach_for_process"("process_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_version_number"("p_forecast_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_max_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_max_version
  FROM public.financial_forecasts
  WHERE id = p_forecast_id OR parent_forecast_id = p_forecast_id;
  RETURN v_max_version;
END;
$$;


ALTER FUNCTION "public"."get_next_version_number"("p_forecast_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_business_profile"("p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_profile_id
  FROM public.business_profiles
  WHERE user_id = p_user_id;

  IF v_profile_id IS NULL THEN
    INSERT INTO public.business_profiles (user_id)
    VALUES (p_user_id)
    RETURNING id INTO v_profile_id;
  END IF;

  RETURN v_profile_id;
END;
$$;


ALTER FUNCTION "public"."get_or_create_business_profile"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_quarter_date_range"("quarter" "text", "year" integer) RETURNS TABLE("start_date" "date", "end_date" "date")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  q_num INTEGER;
BEGIN
  q_num := SUBSTRING(quarter FROM 2)::INTEGER;
  start_date := MAKE_DATE(year, (q_num - 1) * 3 + 1, 1);
  end_date := (MAKE_DATE(year, q_num * 3, 1) + INTERVAL '1 month - 1 day')::DATE;
  RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."get_quarter_date_range"("quarter" "text", "year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_quarter_from_date"("check_date" "date") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN 'Q' || CEIL(EXTRACT(MONTH FROM check_date)::NUMERIC / 3)::TEXT;
END;
$$;


ALTER FUNCTION "public"."get_quarter_from_date"("check_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_todo_stats"("p_user_id" "uuid") RETURNS TABLE("total" integer, "completed" integer, "pending" integer, "overdue" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER AS total,
    COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed,
    COUNT(*) FILTER (WHERE status = 'pending')::INTEGER AS pending,
    COUNT(*) FILTER (WHERE status = 'pending' AND due_date < CURRENT_DATE)::INTEGER AS overdue
  FROM public.todos
  WHERE user_id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."get_todo_stats"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"("p_user_id" "uuid", "p_business_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = p_user_id AND business_id = p_business_id
  LIMIT 1;

  RETURN v_role;
END;
$$;


ALTER FUNCTION "public"."get_user_role"("p_user_id" "uuid", "p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_system_role"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM public.system_roles
  WHERE user_id = auth.uid()
  LIMIT 1;
  RETURN COALESCE(user_role, 'client');
END;
$$;


ALTER FUNCTION "public"."get_user_system_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_direct_business_access"("check_user_id" "uuid", "check_business_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$                                                           
    SELECT EXISTS (                                               
      SELECT 1 FROM businesses                                    
      WHERE id = check_business_id                                
      AND (owner_id = check_user_id OR assigned_coach_id =        
  check_user_id)                                                  
    );                                                            
  $$;


ALTER FUNCTION "public"."has_direct_business_access"("check_user_id" "uuid", "check_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_custom_kpi_usage"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE public.custom_kpi_templates
  SET usage_count = COALESCE(usage_count, 0) + 1
  WHERE id = NEW.template_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."increment_custom_kpi_usage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_business_team_member"("check_user_id" "uuid", "check_business_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$                                                           
    SELECT EXISTS (                                               
      SELECT 1 FROM business_users                                
      WHERE business_id = check_business_id                       
      AND user_id = check_user_id                                 
      AND status = 'active'                                       
    );                                                            
  $$;


ALTER FUNCTION "public"."is_business_team_member"("check_user_id" "uuid", "check_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_coach"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.system_roles
    WHERE user_id = auth.uid() AND role IN ('coach', 'super_admin')
  );
END;
$$;


ALTER FUNCTION "public"."is_coach"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"("check_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$                                                           
    SELECT EXISTS (                                               
      SELECT 1 FROM system_roles                                  
      WHERE user_id = check_user_id                               
      AND role = 'super_admin'                                    
    );                                                            
  $$;


ALTER FUNCTION "public"."is_super_admin"("check_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lock_forecast_version"("p_forecast_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE public.financial_forecasts
  SET is_locked = TRUE,
      locked_at = NOW(),
      locked_by = auth.uid()
  WHERE id = p_forecast_id
  AND is_locked = FALSE;

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."lock_forecast_version"("p_forecast_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_forecast_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.forecast_audit_log (
    forecast_id,
    user_id,
    action,
    table_name,
    record_id,
    old_value,
    new_value
  ) VALUES (
    COALESCE(NEW.forecast_id, OLD.forecast_id),
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."log_forecast_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_coach_forecast_complete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_coach_id UUID;
  v_business_name TEXT;
BEGIN
  IF NEW.is_completed = TRUE AND (OLD.is_completed IS NULL OR OLD.is_completed = FALSE) THEN
    SELECT b.assigned_coach_id, b.business_name INTO v_coach_id, v_business_name
    FROM public.businesses b
    WHERE b.id = NEW.business_id;

    IF v_coach_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (
        v_coach_id,
        'forecast_complete',
        'Forecast Completed',
        v_business_name || ' has completed their forecast',
        jsonb_build_object('forecast_id', NEW.id, 'business_id', NEW.business_id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_coach_forecast_complete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_user_password"("p_user_id" "uuid", "p_new_password" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = NOW()
  WHERE id = p_user_id;
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."reset_user_password"("p_user_id" "uuid", "p_new_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM system_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  );
$$;


ALTER FUNCTION "public"."rls_is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_user_all_businesses"() RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    ARRAY(
      -- Owned businesses
      SELECT id FROM businesses WHERE owner_id = auth.uid()
      UNION
      -- Coached businesses
      SELECT id FROM businesses WHERE assigned_coach_id = auth.uid()
      UNION
      -- Team member businesses
      SELECT business_id FROM business_users WHERE user_id = auth.uid() AND status = 'active'
    ),
    '{}'::UUID[]
  );
$$;


ALTER FUNCTION "public"."rls_user_all_businesses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_user_all_businesses_text"() RETURNS "text"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT id::TEXT FROM businesses WHERE owner_id = auth.uid()
      UNION
      SELECT id::TEXT FROM businesses WHERE assigned_coach_id = auth.uid()
      UNION
      SELECT business_id::TEXT FROM business_users WHERE user_id = auth.uid() AND status = 'active'
    ),
    '{}'::TEXT[]
  );
$$;


ALTER FUNCTION "public"."rls_user_all_businesses_text"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_user_coached_businesses"() RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    ARRAY(SELECT id FROM businesses WHERE assigned_coach_id = auth.uid()),
    '{}'::UUID[]
  );
$$;


ALTER FUNCTION "public"."rls_user_coached_businesses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_user_owned_businesses"() RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    ARRAY(SELECT id FROM businesses WHERE owner_id = auth.uid()),
    '{}'::UUID[]
  );
$$;


ALTER FUNCTION "public"."rls_user_owned_businesses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_user_team_businesses"() RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    ARRAY(SELECT business_id FROM business_users WHERE user_id = auth.uid() AND status = 'active'),
    '{}'::UUID[]
  );
$$;


ALTER FUNCTION "public"."rls_user_team_businesses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ai_tables_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ai_tables_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_annual_plans_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_annual_plans_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_assessment_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_assessment_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_custom_kpis_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_custom_kpis_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_decision_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Update stats on decision changes
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_decision_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_idea_status_on_filter"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.filter_status IS DISTINCT FROM OLD.filter_status THEN
    IF NEW.filter_status IN ('do', 'delegate', 'do_later') THEN
      NEW.status := 'filtered';
    ELSIF NEW.filter_status = 'delete' THEN
      NEW.status := 'deleted';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_idea_status_on_filter"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ideas_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ideas_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_life_goals_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_life_goals_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_notifications_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_notifications_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_process_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Update stats on process changes
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_process_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_profile_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_profile_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_quarterly_reviews_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_quarterly_reviews_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_roadmap_progress_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_roadmap_progress_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_session_actions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_session_actions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_session_notes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_session_notes_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_stop_doing_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_stop_doing_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_strategic_goals_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_strategic_goals_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_strategic_kpis_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_strategic_kpis_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_subscription_budgets_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_subscription_budgets_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_swot_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_swot_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_category_pattern"("p_business_id" "uuid", "p_account_code" "text", "p_account_name" "text", "p_category" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.account_category_patterns (business_id, account_code, account_name, category)
  VALUES (p_business_id, p_account_code, p_account_name, p_category)
  ON CONFLICT (business_id, account_code)
  DO UPDATE SET category = p_category, account_name = p_account_name, updated_at = NOW();
END;
$$;


ALTER FUNCTION "public"."upsert_category_pattern"("p_business_id" "uuid", "p_account_code" "text", "p_account_name" "text", "p_category" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_user_preference"("p_user_id" "uuid", "p_preference_key" "text", "p_preference_value" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id, preference_key, preference_value)
  VALUES (p_user_id, p_preference_key, p_preference_value)
  ON CONFLICT (user_id, preference_key)
  DO UPDATE SET preference_value = p_preference_value, updated_at = NOW();
END;
$$;


ALTER FUNCTION "public"."upsert_user_preference"("p_user_id" "uuid", "p_preference_key" "text", "p_preference_value" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_role"("required_role" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.system_roles
    WHERE user_id = auth.uid() AND role = required_role
  );
END;
$$;


ALTER FUNCTION "public"."user_has_role"("required_role" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."action_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "priority" "text" DEFAULT 'medium'::"text",
    "due_date" "date",
    "assigned_to" "uuid",
    "created_by" "uuid",
    "category" "text",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."action_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "text",
    "user_id" "uuid",
    "action" "text",
    "description" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_cfo_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "wizard_step" integer NOT NULL,
    "active_year" integer DEFAULT 1 NOT NULL,
    "fiscal_year" integer,
    "user_message" "text" NOT NULL,
    "ai_response" "text",
    "quick_action_used" "text",
    "response_time_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_cfo_conversations" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_cfo_conversations" IS 'Stores AI CFO chat conversations for learning and analytics';



COMMENT ON COLUMN "public"."ai_cfo_conversations"."session_id" IS 'Groups messages in a single conversation session';



COMMENT ON COLUMN "public"."ai_cfo_conversations"."quick_action_used" IS 'Tracks which quick action button triggered this message, null for typed questions';



CREATE TABLE IF NOT EXISTS "public"."ai_interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "user_id" "uuid",
    "coach_id" "uuid",
    "question" "text" NOT NULL,
    "question_type" "text" NOT NULL,
    "context" "text" NOT NULL,
    "context_data" "jsonb",
    "ai_response" "jsonb" NOT NULL,
    "confidence" "text" DEFAULT 'medium'::"text" NOT NULL,
    "action_taken" "text",
    "user_value" numeric,
    "user_feedback" "text",
    "coach_reviewed" boolean DEFAULT false,
    "coach_override" "jsonb",
    "coach_notes" "text",
    "added_to_library" boolean DEFAULT false,
    "library_entry_id" "uuid",
    "business_industry" "text",
    "business_revenue_range" "text",
    "business_state" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "coach_reviewed_at" timestamp with time zone,
    "session_id" "uuid",
    "step_context" "text",
    "conversation_context" "jsonb"
);


ALTER TABLE "public"."ai_interactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_interactions" IS 'Captures all AI advisor interactions for learning and improvement';



COMMENT ON COLUMN "public"."ai_interactions"."confidence" IS 'AI confidence level: high (use benchmark), medium (market data), low (needs coach input)';



COMMENT ON COLUMN "public"."ai_interactions"."action_taken" IS 'What the user did with the suggestion: used, adjusted, ignored, asked_coach';



CREATE TABLE IF NOT EXISTS "public"."annual_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "goals_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "q1_targets" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "q2_targets" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "q3_targets" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "q4_targets" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "initiative_allocations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."annual_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."annual_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "strategic_plan_id" "uuid",
    "snapshot_year" integer NOT NULL,
    "snapshot_date" timestamp with time zone DEFAULT "now"(),
    "total_initiatives" integer DEFAULT 0,
    "completed_initiatives" integer DEFAULT 0,
    "annual_completion_rate" numeric(5,2),
    "q1_snapshot_id" "uuid",
    "q2_snapshot_id" "uuid",
    "q3_snapshot_id" "uuid",
    "q4_snapshot_id" "uuid",
    "full_year_snapshot" "jsonb",
    "financial_performance" "jsonb",
    "kpi_performance" "jsonb",
    "year_wins" "text",
    "year_challenges" "text",
    "year_learnings" "text",
    "strategic_adjustments" "text",
    "next_year_focus" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."annual_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."annual_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "revenue_target" numeric DEFAULT 0,
    "gross_profit_target" numeric DEFAULT 0,
    "net_profit_target" numeric DEFAULT 0,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid"
);


ALTER TABLE "public"."annual_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assessments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "answers" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "total_score" integer DEFAULT 0 NOT NULL,
    "percentage" integer DEFAULT 0 NOT NULL,
    "health_status" "text",
    "foundation_score" integer DEFAULT 0,
    "strategic_wheel_score" integer DEFAULT 0,
    "profitability_score" integer DEFAULT 0,
    "engines_score" integer DEFAULT 0,
    "disciplines_score" integer DEFAULT 0,
    "foundation_max" integer DEFAULT 50,
    "strategic_wheel_max" integer DEFAULT 70,
    "profitability_max" integer DEFAULT 0,
    "engines_max" integer DEFAULT 180,
    "disciplines_max" integer DEFAULT 0,
    "total_max" integer DEFAULT 300,
    "status" "text" DEFAULT 'completed'::"text",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "attract_score" integer DEFAULT 0,
    "attract_max" integer DEFAULT 40,
    "convert_score" integer DEFAULT 0,
    "convert_max" integer DEFAULT 40,
    "deliver_score" integer DEFAULT 0,
    "deliver_max" integer DEFAULT 40,
    "people_score" integer DEFAULT 0,
    "people_max" integer DEFAULT 40,
    "systems_score" integer DEFAULT 0,
    "systems_max" integer DEFAULT 40,
    "finance_score" integer DEFAULT 0,
    "finance_max" integer DEFAULT 30,
    "leadership_score" integer DEFAULT 0,
    "leadership_max" integer DEFAULT 30,
    "time_score" integer DEFAULT 0,
    "time_max" integer DEFAULT 40
);


ALTER TABLE "public"."assessments" OWNER TO "postgres";


COMMENT ON TABLE "public"."assessments" IS 'Business assessment results - stores user responses and calculated scores';



COMMENT ON COLUMN "public"."assessments"."attract_score" IS '8 Business Engines Assessment - Attract Engine Score (max 40)';



COMMENT ON COLUMN "public"."assessments"."convert_score" IS '8 Business Engines Assessment - Convert Engine Score (max 40)';



COMMENT ON COLUMN "public"."assessments"."deliver_score" IS '8 Business Engines Assessment - Deliver Engine Score (max 40)';



COMMENT ON COLUMN "public"."assessments"."people_score" IS '8 Business Engines Assessment - People Engine Score (max 40)';



COMMENT ON COLUMN "public"."assessments"."systems_score" IS '8 Business Engines Assessment - Systems Engine Score (max 40)';



COMMENT ON COLUMN "public"."assessments"."finance_score" IS '8 Business Engines Assessment - Finance Engine Score (max 30)';



COMMENT ON COLUMN "public"."assessments"."leadership_score" IS '8 Business Engines Assessment - Leadership Engine Score (max 30)';



COMMENT ON COLUMN "public"."assessments"."time_score" IS '8 Business Engines Assessment - Time Engine Score (max 40)';



CREATE TABLE IF NOT EXISTS "public"."assessments_backup" (
    "id" "uuid",
    "business_id" "uuid",
    "responses" "jsonb",
    "scores" "jsonb",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone,
    "completed_by" "uuid",
    "completion_percentage" integer
);


ALTER TABLE "public"."assessments_backup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "user_id" "uuid",
    "user_name" character varying(255),
    "user_email" character varying(255),
    "table_name" character varying(100) NOT NULL,
    "record_id" "text" NOT NULL,
    "action" character varying(20) NOT NULL,
    "field_name" character varying(100),
    "old_value" "jsonb",
    "new_value" "jsonb",
    "changes" "jsonb",
    "description" "text",
    "page_path" character varying(255),
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "audit_log_action_check" CHECK ((("action")::"text" = ANY (ARRAY[('create'::character varying)::"text", ('update'::character varying)::"text", ('delete'::character varying)::"text"])))
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


COMMENT ON COLUMN "public"."audit_log"."page_path" IS 'The page/route where the change was made';



CREATE TABLE IF NOT EXISTS "public"."business_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "role" "text" DEFAULT 'Owner'::"text",
    "is_primary" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."business_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_financial_goals" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "business_id" "text" NOT NULL,
    "user_id" "uuid",
    "revenue_current" numeric DEFAULT 0,
    "revenue_year1" numeric DEFAULT 0,
    "revenue_year2" numeric DEFAULT 0,
    "revenue_year3" numeric DEFAULT 0,
    "gross_profit_current" numeric DEFAULT 0,
    "gross_profit_year1" numeric DEFAULT 0,
    "gross_profit_year2" numeric DEFAULT 0,
    "gross_profit_year3" numeric DEFAULT 0,
    "gross_margin_current" numeric DEFAULT 0,
    "gross_margin_year1" numeric DEFAULT 0,
    "gross_margin_year2" numeric DEFAULT 0,
    "gross_margin_year3" numeric DEFAULT 0,
    "net_profit_current" numeric DEFAULT 0,
    "net_profit_year1" numeric DEFAULT 0,
    "net_profit_year2" numeric DEFAULT 0,
    "net_profit_year3" numeric DEFAULT 0,
    "net_margin_current" numeric DEFAULT 0,
    "net_margin_year1" numeric DEFAULT 0,
    "net_margin_year2" numeric DEFAULT 0,
    "net_margin_year3" numeric DEFAULT 0,
    "customers_current" numeric DEFAULT 0,
    "customers_year1" numeric DEFAULT 0,
    "customers_year2" numeric DEFAULT 0,
    "customers_year3" numeric DEFAULT 0,
    "employees_current" numeric DEFAULT 0,
    "employees_year1" numeric DEFAULT 0,
    "employees_year2" numeric DEFAULT 0,
    "employees_year3" numeric DEFAULT 0,
    "year_type" "text" DEFAULT 'FY'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "leads_per_month_current" numeric DEFAULT 0,
    "leads_per_month_year1" numeric DEFAULT 0,
    "leads_per_month_year2" numeric DEFAULT 0,
    "leads_per_month_year3" numeric DEFAULT 0,
    "conversion_rate_current" numeric DEFAULT 0,
    "conversion_rate_year1" numeric DEFAULT 0,
    "conversion_rate_year2" numeric DEFAULT 0,
    "conversion_rate_year3" numeric DEFAULT 0,
    "avg_transaction_value_current" numeric DEFAULT 0,
    "avg_transaction_value_year1" numeric DEFAULT 0,
    "avg_transaction_value_year2" numeric DEFAULT 0,
    "avg_transaction_value_year3" numeric DEFAULT 0,
    "team_headcount_current" numeric DEFAULT 0,
    "team_headcount_year1" numeric DEFAULT 0,
    "team_headcount_year2" numeric DEFAULT 0,
    "team_headcount_year3" numeric DEFAULT 0,
    "owner_hours_per_week_current" numeric DEFAULT 0,
    "owner_hours_per_week_year1" numeric DEFAULT 0,
    "owner_hours_per_week_year2" numeric DEFAULT 0,
    "owner_hours_per_week_year3" numeric DEFAULT 0,
    "quarterly_targets" "jsonb" DEFAULT '{}'::"jsonb",
    "business_profile_id" "uuid"
);


ALTER TABLE "public"."business_financial_goals" OWNER TO "postgres";


COMMENT ON COLUMN "public"."business_financial_goals"."quarterly_targets" IS 'Stores quarterly breakdown of targets';



CREATE TABLE IF NOT EXISTS "public"."business_kpis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "text" NOT NULL,
    "kpi_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "friendly_name" "text",
    "description" "text",
    "category" "text",
    "frequency" "text",
    "unit" "text",
    "target_value" "text",
    "current_value" "text",
    "why_it_matters" "text",
    "what_to_do" "text",
    "is_universal" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "notes" "text",
    "last_updated" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "year1_target" numeric DEFAULT 0,
    "year2_target" numeric DEFAULT 0,
    "year3_target" numeric DEFAULT 0,
    "user_id" "uuid" NOT NULL,
    "business_profile_id" "uuid"
);


ALTER TABLE "public"."business_kpis" OWNER TO "postgres";


COMMENT ON COLUMN "public"."business_kpis"."kpi_id" IS 'Reference ID to the KPI template from the library';



COMMENT ON COLUMN "public"."business_kpis"."friendly_name" IS 'User-friendly name for the KPI';



COMMENT ON COLUMN "public"."business_kpis"."year1_target" IS 'Target value for year 1';



COMMENT ON COLUMN "public"."business_kpis"."year2_target" IS 'Target value for year 2';



COMMENT ON COLUMN "public"."business_kpis"."year3_target" IS 'Target value for year 3';



CREATE TABLE IF NOT EXISTS "public"."business_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "user_id" "uuid",
    "role" "text" DEFAULT 'member'::"text",
    "joined_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."business_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "company_name" "text" NOT NULL,
    "current_revenue" numeric(12,2) DEFAULT 0,
    "industry" "text",
    "employee_count" integer DEFAULT 1,
    "founded_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "business_id" "uuid",
    "business_name" "text",
    "years_in_operation" integer,
    "owner_info" "jsonb" DEFAULT '{}'::"jsonb",
    "key_roles" "jsonb" DEFAULT '[]'::"jsonb",
    "social_media" "jsonb" DEFAULT '{}'::"jsonb",
    "top_challenges" "text"[],
    "growth_opportunities" "text"[],
    "profile_completed" boolean DEFAULT false,
    "profile_updated_at" timestamp with time zone,
    "revenue_growth_rate" numeric,
    "business_model" "text",
    "contractors_count" integer,
    "reporting_structure" "text",
    "website" "text",
    "current_priorities" "text"[],
    "annual_revenue" numeric,
    "cash_in_bank" numeric,
    "gross_profit_margin" numeric,
    "net_profit_margin" numeric,
    "locations" "text"[],
    "name" "text",
    "gross_profit" numeric(15,2),
    "net_profit" numeric(15,2)
);


ALTER TABLE "public"."business_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."business_profiles" IS 'Detailed business data - all profile fields, financials, team info';



COMMENT ON COLUMN "public"."business_profiles"."company_name" IS 'Display name of the business';



COMMENT ON COLUMN "public"."business_profiles"."owner_info" IS 'JSON object containing owner details (owner_name, owner_email, owner_phone, owner_role, ownership_percentage)';



COMMENT ON COLUMN "public"."business_profiles"."key_roles" IS 'JSON array of key roles [{title, name, status}]';



COMMENT ON COLUMN "public"."business_profiles"."social_media" IS 'JSON object containing social media links (linkedin, facebook, instagram, twitter)';



COMMENT ON COLUMN "public"."business_profiles"."locations" IS 'Array of business locations or service areas';



CREATE TABLE IF NOT EXISTS "public"."business_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "user_id" "uuid",
    "role" "text" DEFAULT 'owner'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "invited_by" "uuid",
    "invited_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'active'::"text",
    "weekly_review_enabled" boolean DEFAULT true,
    "section_permissions" "jsonb" DEFAULT '{"goals": true, "actions": true, "roadmap": true, "messages": true, "documents": true, "financials": true, "business_profile": true, "quarterly_review": true}'::"jsonb",
    CONSTRAINT "business_users_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'viewer'::"text"]))),
    CONSTRAINT "business_users_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."business_users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."business_users"."section_permissions" IS 'JSON object controlling which sidebar sections this user can access. Groups: business_plan (my_business, vision_mission, roadmap, goals_rocks, one_page_plan), financial (financial_forecast, financial_dashboard), execute (kpi_dashboard, weekly_review, quarterly_review, actions), messages';



CREATE TABLE IF NOT EXISTS "public"."businesses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "owner_id" "uuid",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "business_name" "text",
    "industry" "text",
    "revenue_stage" "text",
    "created_by" "uuid",
    "legal_name" "text",
    "abn_tax_id" "text",
    "years_in_business" integer,
    "locations" "text"[],
    "business_model" "text",
    "annual_revenue" numeric(15,2),
    "revenue_growth_rate" numeric(5,2),
    "gross_margin" numeric(5,2),
    "net_margin" numeric(5,2),
    "employee_count" integer,
    "key_roles" "jsonb" DEFAULT '[]'::"jsonb",
    "products_services" "jsonb" DEFAULT '[]'::"jsonb",
    "customer_segments" "jsonb" DEFAULT '[]'::"jsonb",
    "total_customers" integer,
    "customer_concentration" numeric(5,2),
    "top_challenges" "text"[],
    "growth_opportunities" "text"[],
    "profile_completed" boolean DEFAULT false,
    "profile_updated_at" timestamp with time zone DEFAULT "now"(),
    "website" "text",
    "description" "text",
    "founded_year" integer,
    "social_media" "jsonb",
    "owner_info" "jsonb" DEFAULT '{}'::"jsonb",
    "assigned_coach_id" "uuid",
    "program_type" "text",
    "engagement_start_date" "date",
    "session_frequency" "text",
    "enabled_modules" "jsonb" DEFAULT '{"chat": true, "plan": true, "goals": true, "forecast": true, "documents": true}'::"jsonb",
    "onboarding_completed" boolean DEFAULT false,
    "status" "text" DEFAULT 'active'::"text",
    "address" "text",
    "custom_frequency" "text",
    "invitation_sent" boolean DEFAULT false,
    "invitation_sent_at" timestamp with time zone,
    "temp_password" "text",
    "owner_email" "text",
    "owner_name" "text",
    CONSTRAINT "businesses_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'pending'::"text", 'inactive'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."businesses" OWNER TO "postgres";


COMMENT ON TABLE "public"."businesses" IS 'Lightweight parent table - just business name and owner';



COMMENT ON COLUMN "public"."businesses"."owner_info" IS 'Stores owner information including: name, experience, goals, working style, financial needs, and business partners array';



COMMENT ON COLUMN "public"."businesses"."invitation_sent" IS 'Whether login credentials have been sent to the client';



COMMENT ON COLUMN "public"."businesses"."invitation_sent_at" IS 'Timestamp when invitation email was sent';



COMMENT ON COLUMN "public"."businesses"."temp_password" IS 'Temporary password stored until invitation is sent (cleared after sending)';



COMMENT ON COLUMN "public"."businesses"."owner_email" IS 'Email address of the business owner - used for invitation tracking and user lookup';



CREATE TABLE IF NOT EXISTS "public"."category_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "initiative_text" "text" NOT NULL,
    "suggested_category" "text",
    "actual_category" "text" NOT NULL,
    "suggestion_accepted" boolean NOT NULL,
    "confidence_score" numeric(3,2),
    "suggestion_method" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."category_suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_logins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "business_id" "uuid",
    "login_at" timestamp with time zone DEFAULT "now"(),
    "ip_address" "inet",
    "user_agent" "text"
);


ALTER TABLE "public"."user_logins" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_logins" IS 'Tracks last login timestamp per user per business';



CREATE OR REPLACE VIEW "public"."client_activity_summary" WITH ("security_invoker"='true') AS
 SELECT "b"."id" AS "business_id",
    "b"."business_name",
    "b"."assigned_coach_id",
    "ul"."login_at" AS "last_login",
    "al"."last_change_at",
    "al"."last_change_table",
    "al"."last_change_page",
    "al"."last_change_user_name",
    "al"."total_changes_30d"
   FROM (("public"."businesses" "b"
     LEFT JOIN "public"."user_logins" "ul" ON ((("ul"."business_id" = "b"."id") AND ("ul"."user_id" = "b"."owner_id"))))
     LEFT JOIN LATERAL ( SELECT "max"("audit_log"."created_at") AS "last_change_at",
            ( SELECT "audit_log_1"."table_name"
                   FROM "public"."audit_log" "audit_log_1"
                  WHERE ("audit_log_1"."business_id" = "b"."id")
                  ORDER BY "audit_log_1"."created_at" DESC
                 LIMIT 1) AS "last_change_table",
            ( SELECT "audit_log_1"."page_path"
                   FROM "public"."audit_log" "audit_log_1"
                  WHERE ("audit_log_1"."business_id" = "b"."id")
                  ORDER BY "audit_log_1"."created_at" DESC
                 LIMIT 1) AS "last_change_page",
            ( SELECT "audit_log_1"."user_name"
                   FROM "public"."audit_log" "audit_log_1"
                  WHERE ("audit_log_1"."business_id" = "b"."id")
                  ORDER BY "audit_log_1"."created_at" DESC
                 LIMIT 1) AS "last_change_user_name",
            "count"(*) FILTER (WHERE ("audit_log"."created_at" > ("now"() - '30 days'::interval))) AS "total_changes_30d"
           FROM "public"."audit_log"
          WHERE ("audit_log"."business_id" = "b"."id")) "al" ON (true))
  WHERE ("b"."assigned_coach_id" IS NOT NULL);


ALTER VIEW "public"."client_activity_summary" OWNER TO "postgres";


COMMENT ON VIEW "public"."client_activity_summary" IS 'Summary of client activity for coach dashboard. Uses SECURITY INVOKER to respect RLS policies.';



CREATE TABLE IF NOT EXISTS "public"."client_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "business_name" "text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "expires_at" timestamp with time zone NOT NULL,
    "business_data" "jsonb",
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "client_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."client_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_benchmarks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid",
    "benchmark_type" "text" NOT NULL,
    "category" "text" NOT NULL,
    "min_value" numeric,
    "max_value" numeric,
    "typical_value" numeric,
    "industry_filter" "text",
    "applicable_industries" "text"[],
    "applicable_revenue_ranges" "text"[],
    "applicable_states" "text"[],
    "notes" "text",
    "source" "text",
    "source_interaction_id" "uuid",
    "times_used" integer DEFAULT 0,
    "last_used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."coach_benchmarks" OWNER TO "postgres";


COMMENT ON TABLE "public"."coach_benchmarks" IS 'Coach-curated benchmarks that override AI suggestions';



CREATE TABLE IF NOT EXISTS "public"."coach_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "process_id" "uuid" NOT NULL,
    "step_id" "uuid",
    "suggestion_type" "text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text",
    "suggestion_title" "text" NOT NULL,
    "suggestion_text" "text" NOT NULL,
    "metric_value" integer,
    "recommended_action" "text",
    "dismissed" boolean DEFAULT false,
    "implemented" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "coach_suggestions_priority_check" CHECK (("priority" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "coach_suggestions_suggestion_type_check" CHECK (("suggestion_type" = ANY (ARRAY['bottleneck'::"text", 'risk'::"text", 'automation'::"text", 'handoff'::"text", 'documentation'::"text"]))),
    CONSTRAINT "text_not_empty" CHECK (("length"("suggestion_text") > 0)),
    CONSTRAINT "title_not_empty" CHECK (("length"("suggestion_title") > 0))
);


ALTER TABLE "public"."coach_suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coaching_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "duration_minutes" integer DEFAULT 60,
    "status" "text" DEFAULT 'scheduled'::"text",
    "agenda" "jsonb" DEFAULT '[]'::"jsonb",
    "notes" "text",
    "transcript_text" "text",
    "summary" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "coaching_sessions_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."coaching_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "process_id" "uuid" NOT NULL,
    "turn_number" integer NOT NULL,
    "role" "text" NOT NULL,
    "message" "text" NOT NULL,
    "parsed_data" "jsonb" DEFAULT '{}'::"jsonb",
    "confidence" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "conversation_history_confidence_check" CHECK ((("confidence" >= 0) AND ("confidence" <= 100))),
    CONSTRAINT "conversation_history_role_check" CHECK (("role" = ANY (ARRAY['system'::"text", 'user'::"text"]))),
    CONSTRAINT "conversation_history_turn_number_check" CHECK (("turn_number" > 0)),
    CONSTRAINT "message_not_empty" CHECK (("length"("message") > 0))
);


ALTER TABLE "public"."conversation_history" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."current_quarter_swots" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"uuid" AS "business_id",
    NULL::integer AS "quarter",
    NULL::integer AS "year",
    NULL::character varying(50) AS "type",
    NULL::character varying(20) AS "status",
    NULL::character varying(255) AS "title",
    NULL::"text" AS "description",
    NULL::integer AS "swot_score",
    NULL::"uuid" AS "created_by",
    NULL::timestamp with time zone AS "created_at",
    NULL::timestamp with time zone AS "updated_at",
    NULL::timestamp with time zone AS "finalized_at",
    NULL::"date" AS "due_date",
    NULL::bigint AS "total_items",
    NULL::bigint AS "strengths_count",
    NULL::bigint AS "weaknesses_count",
    NULL::bigint AS "opportunities_count",
    NULL::bigint AS "threats_count",
    NULL::bigint AS "action_items_count",
    NULL::bigint AS "completed_actions_count";


ALTER VIEW "public"."current_quarter_swots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_kpis_library" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "name" "text" NOT NULL,
    "friendly_name" "text",
    "unit" "text" NOT NULL,
    "frequency" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "rejection_reason" "text",
    "usage_count" integer DEFAULT 0,
    "last_used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."custom_kpis_library" OWNER TO "postgres";


COMMENT ON TABLE "public"."custom_kpis_library" IS 'Shared library of custom KPIs created by users. Approved KPIs are available to all users.';



CREATE TABLE IF NOT EXISTS "public"."daily_musts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_name" "text" NOT NULL,
    "todo_id" "uuid" NOT NULL,
    "must_date" "date" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "must_level" integer DEFAULT 1,
    CONSTRAINT "daily_musts_must_level_check" CHECK (("must_level" = ANY (ARRAY[1, 2])))
);


ALTER TABLE "public"."daily_musts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_id" "uuid",
    "title" "text" NOT NULL,
    "priority" "text" NOT NULL,
    "status" "text" DEFAULT 'to-do'::"text" NOT NULL,
    "due_date" "text" NOT NULL,
    "specific_date" "date",
    "open_loop_id" "uuid",
    "completed_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "daily_tasks_due_date_check" CHECK (("due_date" = ANY (ARRAY['today'::"text", 'tomorrow'::"text", 'this-week'::"text", 'next-week'::"text", 'custom'::"text"]))),
    CONSTRAINT "daily_tasks_priority_check" CHECK (("priority" = ANY (ARRAY['critical'::"text", 'important'::"text", 'nice-to-do'::"text"]))),
    CONSTRAINT "daily_tasks_status_check" CHECK (("status" = ANY (ARRAY['to-do'::"text", 'in-progress'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."daily_tasks" OWNER TO "postgres";


COMMENT ON TABLE "public"."daily_tasks" IS 'Daily to-do tasks for users, replaces localStorage storage';



CREATE TABLE IF NOT EXISTS "public"."dashboard_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "visible_core_metrics" "text"[] DEFAULT ARRAY['leads'::"text", 'conversion_rate'::"text", 'avg_transaction'::"text", 'team_headcount'::"text", 'owner_hours'::"text"],
    "hidden_custom_kpis" "text"[] DEFAULT ARRAY[]::"text"[],
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."dashboard_preferences" OWNER TO "postgres";


COMMENT ON TABLE "public"."dashboard_preferences" IS 'Stores user preferences for 
  which metrics to display on the business dashboard';



CREATE TABLE IF NOT EXISTS "public"."financial_forecasts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "fiscal_year" integer NOT NULL,
    "year_type" "text" NOT NULL,
    "actual_start_month" "text" NOT NULL,
    "actual_end_month" "text" NOT NULL,
    "forecast_start_month" "text" NOT NULL,
    "forecast_end_month" "text" NOT NULL,
    "is_completed" boolean DEFAULT false,
    "completed_at" timestamp with time zone,
    "last_xero_sync_at" timestamp with time zone,
    "xero_connection_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "revenue_goal" numeric(15,2),
    "gross_profit_goal" numeric(15,2),
    "net_profit_goal" numeric(15,2),
    "goal_source" character varying(50) DEFAULT 'manual'::character varying,
    "annual_plan_id" "uuid",
    "revenue_distribution_method" character varying(50) DEFAULT 'even'::character varying,
    "revenue_distribution_data" "jsonb" DEFAULT '{}'::"jsonb",
    "category_assumptions" "jsonb" DEFAULT '{}'::"jsonb",
    "cogs_percentage" numeric(5,4),
    "opex_wages" numeric(15,2),
    "opex_fixed" numeric(15,2),
    "opex_variable" numeric(15,2),
    "opex_variable_percentage" numeric(5,4),
    "opex_other" numeric(15,2),
    "payroll_frequency" "text" DEFAULT 'fortnightly'::"text",
    "pay_day" "text",
    "superannuation_rate" numeric(5,4) DEFAULT 0.12,
    "wages_opex_pl_line_id" "uuid",
    "wages_cogs_pl_line_id" "uuid",
    "super_opex_pl_line_id" "uuid",
    "super_cogs_pl_line_id" "uuid",
    "forecast_type" "text" DEFAULT 'forecast'::"text",
    "version_number" integer DEFAULT 1,
    "is_active" boolean DEFAULT true,
    "is_locked" boolean DEFAULT false,
    "locked_at" timestamp with time zone,
    "locked_by" "uuid",
    "parent_forecast_id" "uuid",
    "version_notes" "text",
    "baseline_start_month" character varying(7),
    "baseline_end_month" character varying(7),
    "five_ways_data" "jsonb",
    "industry_id" character varying(50),
    "wizard_opex_categories" "jsonb",
    "wizard_team_summary" "jsonb",
    "wizard_completed_at" timestamp with time zone,
    "coach_notified_at" timestamp with time zone,
    "coach_reviewed_at" timestamp with time zone,
    "wizard_session_id" "uuid",
    "is_base_forecast" boolean DEFAULT true,
    "assumptions" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "financial_forecasts_forecast_type_check" CHECK (("forecast_type" = ANY (ARRAY['budget'::"text", 'forecast'::"text", 'actual'::"text"]))),
    CONSTRAINT "financial_forecasts_pay_day_check" CHECK (("pay_day" = ANY (ARRAY['monday'::"text", 'tuesday'::"text", 'wednesday'::"text", 'thursday'::"text", 'friday'::"text", 'saturday'::"text", 'sunday'::"text"]))),
    CONSTRAINT "financial_forecasts_payroll_frequency_check" CHECK (("payroll_frequency" = ANY (ARRAY['weekly'::"text", 'fortnightly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "financial_forecasts_year_type_check" CHECK (("year_type" = ANY (ARRAY['CY'::"text", 'FY'::"text"])))
);


ALTER TABLE "public"."financial_forecasts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."financial_forecasts"."actual_start_month" IS 'Start of current year actual period (for rolling forecasts, this is start of FY being forecasted)';



COMMENT ON COLUMN "public"."financial_forecasts"."actual_end_month" IS 'End of current year actual period (for rolling forecasts, this is last complete month of FY being forecasted)';



COMMENT ON COLUMN "public"."financial_forecasts"."forecast_start_month" IS 'Start of forecast period (remaining months to forecast)';



COMMENT ON COLUMN "public"."financial_forecasts"."forecast_end_month" IS 'End of forecast period (end of fiscal year)';



COMMENT ON COLUMN "public"."financial_forecasts"."revenue_goal" IS 'Annual revenue target from Annual Plan or manual entry';



COMMENT ON COLUMN "public"."financial_forecasts"."gross_profit_goal" IS 'Annual gross profit target';



COMMENT ON COLUMN "public"."financial_forecasts"."net_profit_goal" IS 'Annual net profit target';



COMMENT ON COLUMN "public"."financial_forecasts"."goal_source" IS 'Source of goals: annual_plan or manual';



COMMENT ON COLUMN "public"."financial_forecasts"."annual_plan_id" IS 'Reference to annual_plans table if imported';



COMMENT ON COLUMN "public"."financial_forecasts"."revenue_distribution_method" IS 'How revenue is distributed across months';



COMMENT ON COLUMN "public"."financial_forecasts"."revenue_distribution_data" IS 'Monthly revenue targets as JSON';



COMMENT ON COLUMN "public"."financial_forecasts"."category_assumptions" IS 'Forecasting assumptions by category (Revenue, COGS, OpEx)';



COMMENT ON COLUMN "public"."financial_forecasts"."cogs_percentage" IS 'Cost of Sales as percentage of revenue (e.g., 0.40 = 40% COGS, 60% GP margin)';



COMMENT ON COLUMN "public"."financial_forecasts"."opex_wages" IS 'Annual wages and salaries (calculated from Payroll & Staff tab)';



COMMENT ON COLUMN "public"."financial_forecasts"."opex_fixed" IS 'Annual fixed operating expenses (rent, insurance, subscriptions) - distributed evenly';



COMMENT ON COLUMN "public"."financial_forecasts"."opex_variable" IS 'Annual variable operating expenses (marketing, commissions, supplies) - can be fixed amount or % of revenue';



COMMENT ON COLUMN "public"."financial_forecasts"."opex_variable_percentage" IS 'Variable OpEx as percentage of revenue (used instead of opex_variable if user chooses % method)';



COMMENT ON COLUMN "public"."financial_forecasts"."opex_other" IS 'Annual other/seasonal operating expenses (uses historical pattern or even split)';



COMMENT ON COLUMN "public"."financial_forecasts"."payroll_frequency" IS 'How often employees are paid: weekly, fortnightly, or monthly';



COMMENT ON COLUMN "public"."financial_forecasts"."pay_day" IS 'Day of week for payroll (for weekly/fortnightly)';



COMMENT ON COLUMN "public"."financial_forecasts"."superannuation_rate" IS 'Superannuation rate as decimal (e.g., 0.12 for 12%)';



COMMENT ON COLUMN "public"."financial_forecasts"."forecast_type" IS 'Type: budget (locked baseline), forecast (working version), or actual (from Xero)';



COMMENT ON COLUMN "public"."financial_forecasts"."version_number" IS 'Version number (1, 2, 3...) - increments with each new version';



COMMENT ON COLUMN "public"."financial_forecasts"."is_active" IS 'Only one active forecast per business - the current working version';



COMMENT ON COLUMN "public"."financial_forecasts"."is_locked" IS 'Locked versions cannot be edited';



COMMENT ON COLUMN "public"."financial_forecasts"."parent_forecast_id" IS 'Reference to the forecast this version was created from';



COMMENT ON COLUMN "public"."financial_forecasts"."baseline_start_month" IS 'Start of baseline comparison period (typically prior fiscal year)';



COMMENT ON COLUMN "public"."financial_forecasts"."baseline_end_month" IS 'End of baseline comparison period (typically prior fiscal year)';



COMMENT ON COLUMN "public"."financial_forecasts"."five_ways_data" IS 'Stores 5 Ways business engine data: leads, conversion, transactions, avgSaleValue, margin with current/target values';



COMMENT ON COLUMN "public"."financial_forecasts"."industry_id" IS 'Selected industry for 5 Ways calculations (e.g., construction, accounting, retail)';



COMMENT ON COLUMN "public"."financial_forecasts"."wizard_opex_categories" IS 'OpEx categories from Setup Wizard Step 4 with forecasting methods';



COMMENT ON COLUMN "public"."financial_forecasts"."wizard_team_summary" IS 'Summary of team planning from Setup Wizard: totalWagesCOGS, totalWagesOpEx';



CREATE TABLE IF NOT EXISTS "public"."financial_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "metric_date" "date" NOT NULL,
    "total_cash" numeric(12,2),
    "operating_account" numeric(12,2),
    "gst_account" numeric(12,2),
    "revenue_month" numeric(12,2),
    "cogs_month" numeric(12,2),
    "gross_profit_month" numeric(12,2),
    "gross_margin_percent" numeric(5,2),
    "expenses_month" numeric(12,2),
    "net_profit_month" numeric(12,2),
    "net_margin_percent" numeric(5,2),
    "revenue_ytd" numeric(12,2),
    "cogs_ytd" numeric(12,2),
    "gross_profit_ytd" numeric(12,2),
    "expenses_ytd" numeric(12,2),
    "net_profit_ytd" numeric(12,2),
    "accounts_receivable" numeric(12,2),
    "accounts_payable" numeric(12,2),
    "ar_days" integer,
    "ap_days" integer,
    "gst_payable" numeric(12,2),
    "payg_payable" numeric(12,2),
    "super_payable" numeric(12,2),
    "unreconciled_count" integer,
    "last_bank_rec_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."financial_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "quarter" integer NOT NULL,
    "year" integer NOT NULL,
    "revenue_target" numeric DEFAULT 0,
    "revenue_actual" numeric DEFAULT 0,
    "gross_profit_target" numeric DEFAULT 0,
    "gross_profit_actual" numeric DEFAULT 0,
    "net_profit_target" numeric DEFAULT 0,
    "net_profit_actual" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "financial_targets_quarter_check" CHECK ((("quarter" >= 1) AND ("quarter" <= 4)))
);


ALTER TABLE "public"."financial_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forecast_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "forecast_id" "uuid",
    "user_id" "uuid",
    "action" character varying(100) NOT NULL,
    "table_name" character varying(100),
    "record_id" "uuid",
    "field_name" character varying(100),
    "old_value" "jsonb",
    "new_value" "jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "forecast_audit_log_action_check" CHECK ((("action")::"text" = ANY (ARRAY[('create'::character varying)::"text", ('update'::character varying)::"text", ('delete'::character varying)::"text", ('sync_xero'::character varying)::"text", ('import_annual_plan'::character varying)::"text"])))
);


ALTER TABLE "public"."forecast_audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."forecast_audit_log" IS 'Audit trail for all forecast changes - compliance and debugging';



COMMENT ON COLUMN "public"."forecast_audit_log"."action" IS 'Type of action: create, update, delete, sync_xero, import_annual_plan';



COMMENT ON COLUMN "public"."forecast_audit_log"."old_value" IS 'Previous value (JSONB for flexibility)';



COMMENT ON COLUMN "public"."forecast_audit_log"."new_value" IS 'New value (JSONB for flexibility)';



CREATE TABLE IF NOT EXISTS "public"."forecast_decisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "forecast_id" "uuid",
    "session_id" "uuid",
    "user_id" "uuid",
    "business_id" "uuid" NOT NULL,
    "decision_type" "text" NOT NULL,
    "decision_data" "jsonb" NOT NULL,
    "reasoning" "text",
    "ai_suggestion" "jsonb",
    "user_accepted_ai" boolean,
    "ai_confidence" "text",
    "linked_initiative_id" "uuid",
    "linked_pl_line_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "forecast_decisions_ai_confidence_check" CHECK (("ai_confidence" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"])))
);


ALTER TABLE "public"."forecast_decisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forecast_employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "forecast_id" "uuid" NOT NULL,
    "employee_name" "text" NOT NULL,
    "position" "text",
    "category" "text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "hours" numeric(10,2),
    "rate" numeric(10,2),
    "weekly_budget" numeric(10,2),
    "annual_salary" numeric(12,2),
    "weekly_payg" numeric(10,2),
    "super_rate" numeric(5,2) DEFAULT 11.0,
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "classification" "text" DEFAULT 'opex'::"text",
    "hourly_rate" numeric(10,2),
    "standard_hours_per_week" numeric(5,2) DEFAULT 40,
    "pay_per_period" numeric(10,2),
    "super_per_period" numeric(10,2),
    "payg_per_period" numeric(10,2),
    "monthly_cost" numeric(10,2),
    "is_planned_hire" boolean DEFAULT false,
    "notes" "text",
    CONSTRAINT "forecast_employees_category_check" CHECK (("category" = ANY (ARRAY['Wages Admin'::"text", 'Wages COGS'::"text", 'Contractor'::"text", 'Other'::"text"]))),
    CONSTRAINT "forecast_employees_classification_check" CHECK (("classification" = ANY (ARRAY['opex'::"text", 'cogs'::"text"])))
);


ALTER TABLE "public"."forecast_employees" OWNER TO "postgres";


COMMENT ON COLUMN "public"."forecast_employees"."classification" IS 'Whether wages are OpEx or COGS';



COMMENT ON COLUMN "public"."forecast_employees"."hourly_rate" IS 'Hourly rate of pay';



COMMENT ON COLUMN "public"."forecast_employees"."standard_hours_per_week" IS 'Standard hours worked per week';



COMMENT ON COLUMN "public"."forecast_employees"."pay_per_period" IS 'Calculated pay per pay period';



COMMENT ON COLUMN "public"."forecast_employees"."super_per_period" IS 'Calculated superannuation per pay period';



COMMENT ON COLUMN "public"."forecast_employees"."payg_per_period" IS 'Calculated PAYG tax per pay period';



COMMENT ON COLUMN "public"."forecast_employees"."monthly_cost" IS 'Total monthly cost including super';



COMMENT ON COLUMN "public"."forecast_employees"."is_planned_hire" IS 'True if this employee was added via Setup Wizard as a planned hire';



CREATE TABLE IF NOT EXISTS "public"."forecast_insights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "fiscal_year" integer NOT NULL,
    "insights" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "data_hash" "text",
    "generated_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."forecast_insights" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forecast_investments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "forecast_id" "uuid",
    "user_id" "uuid",
    "business_id" "uuid" NOT NULL,
    "initiative_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "investment_type" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "start_month" "text" NOT NULL,
    "is_recurring" boolean DEFAULT false,
    "recurrence" "text",
    "end_month" "text",
    "pl_account_category" "text",
    "pl_line_id" "uuid",
    "depreciation_years" integer,
    "reasoning" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "forecast_investments_investment_type_check" CHECK (("investment_type" = ANY (ARRAY['capex'::"text", 'opex'::"text"]))),
    CONSTRAINT "forecast_investments_recurrence_check" CHECK (("recurrence" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'annual'::"text"])))
);


ALTER TABLE "public"."forecast_investments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forecast_payroll_summary" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "forecast_id" "uuid" NOT NULL,
    "pay_runs_per_month" "jsonb" DEFAULT '{}'::"jsonb",
    "wages_admin_monthly" "jsonb" DEFAULT '{}'::"jsonb",
    "wages_cogs_monthly" "jsonb" DEFAULT '{}'::"jsonb",
    "payg_monthly" "jsonb" DEFAULT '{}'::"jsonb",
    "net_wages_monthly" "jsonb" DEFAULT '{}'::"jsonb",
    "superannuation_monthly" "jsonb" DEFAULT '{}'::"jsonb",
    "payroll_tax_monthly" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."forecast_payroll_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forecast_pl_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "forecast_id" "uuid" NOT NULL,
    "account_code" "text",
    "account_name" "text" NOT NULL,
    "account_type" "text",
    "account_class" "text",
    "category" "text",
    "subcategory" "text",
    "sort_order" integer DEFAULT 0,
    "actual_months" "jsonb" DEFAULT '{}'::"jsonb",
    "forecast_months" "jsonb" DEFAULT '{}'::"jsonb",
    "is_from_xero" boolean DEFAULT false,
    "is_manual" boolean DEFAULT false,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "forecast_method" "jsonb",
    "analysis" "jsonb",
    "is_from_payroll" boolean DEFAULT false
);


ALTER TABLE "public"."forecast_pl_lines" OWNER TO "postgres";


COMMENT ON COLUMN "public"."forecast_pl_lines"."forecast_method" IS 'Stores the forecasting method configuration (method type, parameters, etc.)';



COMMENT ON COLUMN "public"."forecast_pl_lines"."analysis" IS 'Stores calculated analysis metrics (averages, percentages, trends, etc.)';



CREATE TABLE IF NOT EXISTS "public"."forecast_scenario_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scenario_id" "uuid" NOT NULL,
    "pl_line_id" "uuid" NOT NULL,
    "adjusted_forecast_months" "jsonb",
    "adjustment_reason" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."forecast_scenario_lines" OWNER TO "postgres";


COMMENT ON TABLE "public"."forecast_scenario_lines" IS 'Line-level adjustments for specific P&L lines within a scenario';



COMMENT ON COLUMN "public"."forecast_scenario_lines"."adjusted_forecast_months" IS 'Override monthly values for this line in this scenario';



CREATE TABLE IF NOT EXISTS "public"."forecast_scenarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "base_forecast_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "assumption_overrides" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."forecast_scenarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forecast_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "forecast_id" "uuid",
    "month" "date" NOT NULL,
    "revenue_data" "jsonb",
    "total_revenue" numeric(12,2),
    "cogs_data" "jsonb",
    "total_cogs" numeric(12,2),
    "gross_profit" numeric(12,2),
    "gross_margin_percent" numeric(5,2),
    "expense_data" "jsonb",
    "total_expenses" numeric(12,2),
    "net_profit" numeric(12,2),
    "net_margin_percent" numeric(5,2)
);


ALTER TABLE "public"."forecast_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forecast_wizard_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "forecast_id" "uuid",
    "user_id" "uuid",
    "business_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "mode" "text" DEFAULT 'guided'::"text",
    "current_step" "text" DEFAULT 'setup'::"text",
    "steps_completed" "jsonb" DEFAULT '{}'::"jsonb",
    "dropped_off_at" "text",
    "years_selected" integer[] DEFAULT ARRAY[1],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "forecast_wizard_sessions_mode_check" CHECK (("mode" = ANY (ARRAY['guided'::"text", 'quick'::"text"])))
);


ALTER TABLE "public"."forecast_wizard_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forecast_years" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "forecast_id" "uuid",
    "user_id" "uuid",
    "business_id" "uuid" NOT NULL,
    "year_number" integer NOT NULL,
    "fiscal_year" integer NOT NULL,
    "granularity" "text" DEFAULT 'annual'::"text",
    "revenue_target" numeric(12,2),
    "revenue_growth_percent" numeric(5,2),
    "gross_margin_percent" numeric(5,2),
    "net_profit_percent" numeric(5,2),
    "headcount_start" integer DEFAULT 0,
    "headcount_end" integer DEFAULT 0,
    "headcount_change" integer DEFAULT 0,
    "planned_roles" "jsonb",
    "team_cost_estimate" numeric(12,2),
    "opex_estimate" numeric(12,2),
    "capex_estimate" numeric(12,2),
    "quarterly_data" "jsonb",
    "notes" "text",
    "assumptions" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "forecast_years_granularity_check" CHECK (("granularity" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'annual'::"text"]))),
    CONSTRAINT "forecast_years_year_number_check" CHECK (("year_number" = ANY (ARRAY[1, 2, 3])))
);


ALTER TABLE "public"."forecast_years" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forecasts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "name" "text" NOT NULL,
    "fiscal_year_start" "date" NOT NULL,
    "fiscal_year_end" "date" NOT NULL,
    "is_active" boolean DEFAULT false,
    "currency" "text" DEFAULT 'AUD'::"text",
    "cogs_percentage" numeric(5,2) DEFAULT 50.0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."forecasts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "goal_type" "text" DEFAULT 'goal'::"text",
    "quarter" integer,
    "year" integer,
    "status" "text" DEFAULT 'not_started'::"text",
    "progress" integer DEFAULT 0,
    "owner" "text",
    "due_date" "date",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "goals_quarter_check" CHECK ((("quarter" >= 1) AND ("quarter" <= 4)))
);


ALTER TABLE "public"."goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ideas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "source" "text",
    "status" "text" DEFAULT 'captured'::"text",
    "archived" boolean DEFAULT false,
    "category" "text",
    "estimated_impact" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ideas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ideas_filter" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idea_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "problem_solving" "text",
    "pros" "jsonb" DEFAULT '[]'::"jsonb",
    "cons" "jsonb" DEFAULT '[]'::"jsonb",
    "mvp_description" "text",
    "mvp_timeline" "text",
    "revenue_forecast" "jsonb" DEFAULT '{}'::"jsonb",
    "profit_forecast" "jsonb" DEFAULT '{}'::"jsonb",
    "cash_required" numeric(15,2) DEFAULT 0,
    "time_investment" "jsonb" DEFAULT '[]'::"jsonb",
    "total_time_investment" numeric(15,2) DEFAULT 0,
    "bhag_alignment_score" integer,
    "bhag_alignment_notes" "text",
    "unique_selling_proposition" "text",
    "how_to_sell" "text",
    "who_will_sell" "text",
    "why_now" "text",
    "what_will_suffer" "text",
    "competition_analysis" "text",
    "competitive_advantage" "text",
    "upside_risks" "jsonb" DEFAULT '[]'::"jsonb",
    "downside_risks" "jsonb" DEFAULT '[]'::"jsonb",
    "decision" "text",
    "decision_notes" "text",
    "decision_date" timestamp with time zone,
    "evaluation_score" integer,
    "evaluated_at" timestamp with time zone,
    "evaluated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ideas_filter" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."issues_list" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "issue_type" "text" DEFAULT 'problem'::"text" NOT NULL,
    "priority" integer,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "owner" "text" DEFAULT 'Me'::"text" NOT NULL,
    "stated_problem" "text",
    "root_cause" "text",
    "solution" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "solved_date" "date",
    "archived" boolean DEFAULT false,
    "business_id" "uuid",
    CONSTRAINT "issues_list_issue_type_check" CHECK (("issue_type" = ANY (ARRAY['problem'::"text", 'opportunity'::"text", 'idea'::"text", 'challenge'::"text"]))),
    CONSTRAINT "issues_list_priority_check" CHECK ((("priority" = ANY (ARRAY[1, 2, 3])) OR ("priority" IS NULL))),
    CONSTRAINT "issues_list_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'identified'::"text", 'in-discussion'::"text", 'solving'::"text", 'solved'::"text"])))
);


ALTER TABLE "public"."issues_list" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kpi_actuals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kpi_id" "text" NOT NULL,
    "period_year" integer NOT NULL,
    "period_quarter" "text",
    "period_month" integer,
    "period_type" "text" NOT NULL,
    "actual_value" numeric(15,2) NOT NULL,
    "target_value" numeric(15,2),
    "variance" numeric(15,2),
    "variance_percentage" numeric(5,2),
    "notes" "text",
    "recorded_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "kpi_actuals_period_month_check" CHECK ((("period_month" >= 1) AND ("period_month" <= 12))),
    CONSTRAINT "kpi_actuals_period_quarter_check" CHECK (("period_quarter" = ANY (ARRAY['Q1'::"text", 'Q2'::"text", 'Q3'::"text", 'Q4'::"text"]))),
    CONSTRAINT "kpi_actuals_period_type_check" CHECK (("period_type" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'annual'::"text"])))
);


ALTER TABLE "public"."kpi_actuals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kpi_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kpi_id" "text" NOT NULL,
    "alert_type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "is_dismissed" boolean DEFAULT false NOT NULL,
    "period_date" "date",
    "actual_value" numeric(15,4),
    "target_value" numeric(15,4),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "read_at" timestamp with time zone,
    "dismissed_at" timestamp with time zone
);


ALTER TABLE "public"."kpi_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kpi_benchmarks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kpi_id" "text",
    "industry" "text" NOT NULL,
    "revenue_stage" "text",
    "benchmark_value" numeric NOT NULL,
    "percentile" integer,
    "source" "text" DEFAULT 'Industry Research'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "business_size" "text"
);


ALTER TABLE "public"."kpi_benchmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kpi_definitions" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "friendly_name" "text",
    "description" "text" NOT NULL,
    "why_it_matters" "text" NOT NULL,
    "what_to_do" "text" NOT NULL,
    "category" "text" NOT NULL,
    "business_function" "text",
    "industries" "jsonb",
    "unit" "text" NOT NULL,
    "frequency" "text" NOT NULL,
    "formula" "text",
    "is_universal" boolean DEFAULT false,
    "target_benchmark" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tier" integer,
    "revenue_stages" "jsonb",
    "is_core" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "benchmarks" "jsonb"
);


ALTER TABLE "public"."kpi_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kpi_definitions_backup" (
    "id" "text",
    "name" "text",
    "friendly_name" "text",
    "description" "text",
    "why_it_matters" "text",
    "what_to_do" "text",
    "category" "text",
    "business_function" "text",
    "industries" "text"[],
    "unit" "text",
    "frequency" "text",
    "formula" "text",
    "is_universal" boolean,
    "target_benchmark" numeric,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."kpi_definitions_backup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kpi_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "text" NOT NULL,
    "kpi_id" "text" NOT NULL,
    "value" "text",
    "notes" "text",
    "recorded_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kpi_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kpi_tracking_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "kpi_id" "text",
    "period_date" "date" NOT NULL,
    "actual_value" numeric NOT NULL,
    "target_value" numeric,
    "variance_percentage" numeric GENERATED ALWAYS AS (
CASE
    WHEN ("target_value" > (0)::numeric) THEN ((("actual_value" - "target_value") / "target_value") * (100)::numeric)
    ELSE NULL::numeric
END) STORED,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kpi_tracking_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kpi_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kpi_id" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "period_type" "text" NOT NULL,
    "actual_value" numeric(15,4) NOT NULL,
    "target_value" numeric(15,4),
    "previous_period_value" numeric(15,4),
    "data_source" "text" DEFAULT 'manual'::"text",
    "confidence" integer DEFAULT 3,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "entered_by" "uuid"
);


ALTER TABLE "public"."kpi_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kpis" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "business_profile_id" "uuid" NOT NULL,
    "kpi_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "current_value" numeric(12,2) DEFAULT 0,
    "year1_target" numeric(12,2) DEFAULT 0,
    "year2_target" numeric(12,2) DEFAULT 0,
    "year3_target" numeric(12,2) DEFAULT 0,
    "unit" "text" NOT NULL,
    "frequency" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kpis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."life_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category" character varying(50) NOT NULL,
    "title" character varying(300) NOT NULL,
    "target_amount" integer,
    "target_year" character varying(10) NOT NULL,
    "description" "text",
    "completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "life_goals_target_year_check" CHECK ((("target_year")::"text" = ANY (ARRAY[('year1'::character varying)::"text", ('year2'::character varying)::"text", ('year3'::character varying)::"text"])))
);


ALTER TABLE "public"."life_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_id" "uuid",
    "value_proposition" "jsonb",
    "brand_messaging" "jsonb",
    "marketing_plan" "jsonb",
    "content_calendar" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."marketing_data" OWNER TO "postgres";


COMMENT ON TABLE "public"."marketing_data" IS 'Stores marketing-related data including value proposition and brand messaging';



COMMENT ON COLUMN "public"."marketing_data"."value_proposition" IS 'JSONB: target_demographics, target_problems, target_location, uvp_statement, competitive_advantage, key_differentiators, competitors, usp_list';



CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "sender_id" "uuid",
    "sender_type" "text",
    "content" "text" NOT NULL,
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "recipient_id" "uuid",
    "attachment_url" "text",
    "attachment_name" "text",
    "attachment_size" integer,
    "attachment_type" "text"
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."messages"."attachment_url" IS 'URL to the attached file in storage';



COMMENT ON COLUMN "public"."messages"."attachment_name" IS 'Original filename of the attachment';



COMMENT ON COLUMN "public"."messages"."attachment_size" IS 'File size in bytes';



COMMENT ON COLUMN "public"."messages"."attachment_type" IS 'MIME type of the attachment';



CREATE TABLE IF NOT EXISTS "public"."monthly_actuals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "month" "date" NOT NULL,
    "revenue_data" "jsonb",
    "total_revenue" numeric(12,2),
    "cogs_data" "jsonb",
    "total_cogs" numeric(12,2),
    "gross_profit" numeric(12,2),
    "gross_margin_percent" numeric(5,2),
    "expense_data" "jsonb",
    "total_expenses" numeric(12,2),
    "net_profit" numeric(12,2),
    "net_margin_percent" numeric(5,2),
    "imported_at" timestamp with time zone DEFAULT "now"(),
    "xero_report_id" "text"
);


ALTER TABLE "public"."monthly_actuals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monthly_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "review_month" "date" NOT NULL,
    "actual_revenue" numeric(15,2),
    "actual_gross_profit" numeric(15,2),
    "actual_gross_profit_percent" numeric(5,2),
    "actual_net_profit" numeric(15,2),
    "actual_net_profit_percent" numeric(5,2),
    "actual_cash_position" numeric(15,2),
    "revenue_variance" numeric(15,2),
    "gross_profit_variance" numeric(15,2),
    "net_profit_variance" numeric(15,2),
    "kpi_actuals" "jsonb",
    "wins" "text",
    "challenges" "text",
    "adjustments_made" "text"
);


ALTER TABLE "public"."monthly_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ninety_day_sprints" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "business_profile_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "owner" "text",
    "due_date" "date" NOT NULL,
    "status" "text" DEFAULT 'not-started'::"text",
    "quarter" "text" NOT NULL,
    "year" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ninety_day_sprints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "user_id" "uuid" NOT NULL,
    "email_session_reminders" boolean DEFAULT true,
    "email_chat_messages" boolean DEFAULT true,
    "email_action_due" boolean DEFAULT true,
    "email_document_shared" boolean DEFAULT true,
    "email_weekly_summary" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_id" "uuid",
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "link" "text",
    "read" boolean DEFAULT false,
    "sent_email" boolean DEFAULT false,
    "email_sent_at" timestamp with time zone,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_progress" (
    "business_id" "uuid" NOT NULL,
    "profile_completed" boolean DEFAULT false,
    "first_plan_created" boolean DEFAULT false,
    "first_forecast_created" boolean DEFAULT false,
    "first_goal_set" boolean DEFAULT false,
    "team_member_invited" boolean DEFAULT false,
    "first_session_scheduled" boolean DEFAULT false,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."onboarding_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."open_loops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "expected_completion_date" "date",
    "owner" "text" DEFAULT 'Me'::"text" NOT NULL,
    "status" "text" DEFAULT 'in-progress'::"text" NOT NULL,
    "blocker" "text",
    "completed_date" "date",
    "archived" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "business_id" "uuid",
    CONSTRAINT "open_loops_status_check" CHECK (("status" = ANY (ARRAY['in-progress'::"text", 'stuck'::"text", 'on-hold'::"text"])))
);


ALTER TABLE "public"."open_loops" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operational_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "function_id" "text" NOT NULL,
    "description" "text" NOT NULL,
    "assigned_to" "text",
    "order_index" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "name" "text",
    "frequency" "text",
    "recommended_frequency" "text",
    "source" "text" DEFAULT 'custom'::"text"
);


ALTER TABLE "public"."operational_activities" OWNER TO "postgres";


COMMENT ON TABLE "public"."operational_activities" IS 'Stores operational rhythm habits/activities for each business';



COMMENT ON COLUMN "public"."operational_activities"."function_id" IS 'Business engine ID (attract, convert, deliver, people, systems, finance, leadership, time)';



COMMENT ON COLUMN "public"."operational_activities"."name" IS 'The name of the operational habit';



COMMENT ON COLUMN "public"."operational_activities"."frequency" IS 'User-selected frequency (daily, 3x_week, weekly, fortnightly, monthly, quarterly)';



COMMENT ON COLUMN "public"."operational_activities"."recommended_frequency" IS 'System-recommended frequency for suggested habits';



COMMENT ON COLUMN "public"."operational_activities"."source" IS 'Origin of the habit: suggested, custom, or step2';



CREATE TABLE IF NOT EXISTS "public"."password_reset_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."password_reset_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."process_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "process_id" "uuid" NOT NULL,
    "step_id" "uuid",
    "commented_by" "uuid" NOT NULL,
    "commented_to" "uuid",
    "comment_text" "text" NOT NULL,
    "comment_type" "text" DEFAULT 'suggestion'::"text",
    "resolved" boolean DEFAULT false,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "comment_not_empty" CHECK (("length"("comment_text") > 0)),
    CONSTRAINT "process_comments_comment_type_check" CHECK (("comment_type" = ANY (ARRAY['suggestion'::"text", 'question'::"text", 'improvement'::"text"])))
);


ALTER TABLE "public"."process_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."process_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "process_id" "uuid" NOT NULL,
    "from_step_id" "uuid",
    "to_step_id" "uuid",
    "connection_type" "text" DEFAULT 'sequential'::"text",
    "condition_label" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."process_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."process_decisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "process_id" "uuid" NOT NULL,
    "after_step_id" "uuid" NOT NULL,
    "decision_question" "text" NOT NULL,
    "decision_type" "text" DEFAULT 'yes_no'::"text",
    "branches" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "process_decisions_decision_type_check" CHECK (("decision_type" = ANY (ARRAY['yes_no'::"text", 'multi_branch'::"text"]))),
    CONSTRAINT "question_not_empty" CHECK (("length"("decision_question") > 0))
);


ALTER TABLE "public"."process_decisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."process_diagrams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "industry" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "conversation_status" "text" DEFAULT 'in_progress'::"text",
    "process_data" "jsonb" DEFAULT '{}'::"jsonb",
    "step_count" integer DEFAULT 0,
    "decision_count" integer DEFAULT 0,
    "swimlane_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."process_diagrams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."process_flows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "process_id" "uuid",
    "from_step_id" "uuid",
    "to_step_id" "uuid",
    "flow_type" "text" NOT NULL,
    "condition_label" "text",
    "condition_color" "text",
    "notes" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."process_flows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."process_phases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "process_id" "uuid",
    "phase_name" "text" NOT NULL,
    "phase_order" integer NOT NULL,
    "phase_color" "text",
    "department" "text",
    "description" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."process_phases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."process_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "process_id" "uuid" NOT NULL,
    "order_num" integer NOT NULL,
    "title" "text" NOT NULL,
    "type" "text" DEFAULT 'action'::"text",
    "swimlane" "text",
    "description" "text",
    "duration" "text",
    "success_criteria" "text",
    "documents" "text"[],
    "systems" "text"[],
    "decision_question" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."process_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."process_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "process_id" "uuid" NOT NULL,
    "version_number" integer NOT NULL,
    "change_summary" "text",
    "process_data_snapshot" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."process_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "business_id" "uuid",
    "role" "text" DEFAULT 'owner'::"text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "full_name" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quarterly_forecasts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "business_id" "uuid",
    "user_id" "uuid",
    "year" integer NOT NULL,
    "quarter" integer NOT NULL,
    "revenue_target" bigint,
    "profit_target" bigint,
    "cash_target" bigint,
    "new_customers_target" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "quarterly_forecasts_quarter_check" CHECK (("quarter" = ANY (ARRAY[1, 2, 3, 4])))
);


ALTER TABLE "public"."quarterly_forecasts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quarterly_plans" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "business_profile_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "quarter" "text" NOT NULL,
    "revenue_target" numeric(12,2) DEFAULT 0,
    "profit_target" numeric(12,2) DEFAULT 0,
    "other_goals" "jsonb" DEFAULT '[]'::"jsonb",
    "kpi_targets" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."quarterly_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quarterly_priorities" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "business_id" "uuid",
    "user_id" "uuid",
    "year" integer NOT NULL,
    "quarter" integer NOT NULL,
    "priority_number" integer NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "owner" "text",
    "status" "text" DEFAULT 'not_started'::"text",
    "completion_percentage" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "quarterly_priorities_completion_percentage_check" CHECK ((("completion_percentage" >= 0) AND ("completion_percentage" <= 100))),
    CONSTRAINT "quarterly_priorities_priority_number_check" CHECK ((("priority_number" >= 1) AND ("priority_number" <= 5))),
    CONSTRAINT "quarterly_priorities_quarter_check" CHECK (("quarter" = ANY (ARRAY[1, 2, 3, 4]))),
    CONSTRAINT "quarterly_priorities_status_check" CHECK (("status" = ANY (ARRAY['not_started'::"text", 'in_progress'::"text", 'completed'::"text", 'delayed'::"text"])))
);


ALTER TABLE "public"."quarterly_priorities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quarterly_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "quarter" integer NOT NULL,
    "year" integer NOT NULL,
    "review_type" "text" DEFAULT 'quarterly'::"text",
    "prework_completed_at" timestamp with time zone,
    "last_quarter_rating" integer,
    "biggest_win" "text",
    "biggest_challenge" "text",
    "key_learning" "text",
    "hours_worked_avg" integer,
    "days_off_taken" integer,
    "energy_level" integer,
    "purpose_alignment" integer,
    "one_thing_for_success" "text",
    "coach_support_needed" "text",
    "dashboard_snapshot" "jsonb" DEFAULT '{}'::"jsonb",
    "action_replay" "jsonb" DEFAULT '{"worked": [], "newIdeas": [], "didntWork": [], "keyInsight": "", "plannedButDidnt": []}'::"jsonb",
    "feedback_loop" "jsonb" DEFAULT '{"owner": {"less": [], "more": [], "stop": [], "start": [], "continue": []}, "sales": {"less": [], "more": [], "stop": [], "start": [], "continue": []}, "people": {"less": [], "more": [], "stop": [], "start": [], "continue": []}, "finances": {"less": [], "more": [], "stop": [], "start": [], "continue": []}, "marketing": {"less": [], "more": [], "stop": [], "start": [], "continue": []}, "operations": {"less": [], "more": [], "stop": [], "start": [], "continue": []}, "topPriorities": []}'::"jsonb",
    "open_loops_decisions" "jsonb" DEFAULT '[]'::"jsonb",
    "issues_resolved" "jsonb" DEFAULT '[]'::"jsonb",
    "assessment_snapshot" "jsonb" DEFAULT '{}'::"jsonb",
    "roadmap_snapshot" "jsonb" DEFAULT '{}'::"jsonb",
    "swot_analysis_id" "uuid",
    "annual_target_confidence" integer,
    "confidence_notes" "text",
    "targets_adjusted" boolean DEFAULT false,
    "quarterly_targets" "jsonb" DEFAULT '{"kpis": [], "revenue": 0, "netProfit": 0, "grossProfit": 0}'::"jsonb",
    "initiatives_changes" "jsonb" DEFAULT '{"added": [], "removed": [], "deferred": [], "carriedForward": []}'::"jsonb",
    "quarterly_rocks" "jsonb" DEFAULT '[]'::"jsonb",
    "personal_commitments" "jsonb" DEFAULT '{"personalGoal": "", "daysOffPlanned": null, "daysOffScheduled": [], "hoursPerWeekTarget": null}'::"jsonb",
    "current_step" "text" DEFAULT 'prework'::"text",
    "steps_completed" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'not_started'::"text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "ytd_revenue_annual" numeric,
    "ytd_gross_profit_annual" numeric,
    "ytd_net_profit_annual" numeric,
    CONSTRAINT "quarterly_reviews_annual_target_confidence_check" CHECK ((("annual_target_confidence" >= 1) AND ("annual_target_confidence" <= 10))),
    CONSTRAINT "quarterly_reviews_energy_level_check" CHECK ((("energy_level" >= 1) AND ("energy_level" <= 10))),
    CONSTRAINT "quarterly_reviews_last_quarter_rating_check" CHECK ((("last_quarter_rating" >= 1) AND ("last_quarter_rating" <= 10))),
    CONSTRAINT "quarterly_reviews_purpose_alignment_check" CHECK ((("purpose_alignment" >= 1) AND ("purpose_alignment" <= 10))),
    CONSTRAINT "quarterly_reviews_quarter_check" CHECK ((("quarter" >= 1) AND ("quarter" <= 4))),
    CONSTRAINT "quarterly_reviews_review_type_check" CHECK (("review_type" = ANY (ARRAY['quarterly'::"text", 'annual'::"text", 'mid-year'::"text"]))),
    CONSTRAINT "quarterly_reviews_status_check" CHECK (("status" = ANY (ARRAY['not_started'::"text", 'prework_complete'::"text", 'in_progress'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."quarterly_reviews" OWNER TO "postgres";


COMMENT ON TABLE "public"."quarterly_reviews" IS 'Stores quarterly review workshop data including reflection, analysis, strategic review, and planning phases';



COMMENT ON COLUMN "public"."quarterly_reviews"."action_replay" IS 'Four-column retrospective: worked, didnt work, planned but didnt, new ideas';



COMMENT ON COLUMN "public"."quarterly_reviews"."feedback_loop" IS 'Stop/Less/Continue/More/Start matrix across 6 business areas';



COMMENT ON COLUMN "public"."quarterly_reviews"."quarterly_rocks" IS 'The 3-5 priority initiatives for the quarter (90-day sprint)';



COMMENT ON COLUMN "public"."quarterly_reviews"."current_step" IS 'Current step in workshop: prework, 1.1-1.3, 2.1-2.3, 3.1-3.3, 4.1-4.4, complete';



COMMENT ON COLUMN "public"."quarterly_reviews"."ytd_revenue_annual" IS 'Manual entry of YTD revenue for annual target confidence check';



COMMENT ON COLUMN "public"."quarterly_reviews"."ytd_gross_profit_annual" IS 'Manual entry of YTD gross profit for annual target confidence check';



COMMENT ON COLUMN "public"."quarterly_reviews"."ytd_net_profit_annual" IS 'Manual entry of YTD net profit for annual target confidence check';



CREATE TABLE IF NOT EXISTS "public"."quarterly_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "strategic_plan_id" "uuid",
    "snapshot_year" integer NOT NULL,
    "snapshot_quarter" "text" NOT NULL,
    "snapshot_date" timestamp with time zone DEFAULT "now"(),
    "total_initiatives" integer DEFAULT 0,
    "completed_initiatives" integer DEFAULT 0,
    "in_progress_initiatives" integer DEFAULT 0,
    "cancelled_initiatives" integer DEFAULT 0,
    "completion_rate" numeric(5,2),
    "initiatives_snapshot" "jsonb",
    "kpis_snapshot" "jsonb",
    "financial_snapshot" "jsonb",
    "wins" "text",
    "challenges" "text",
    "learnings" "text",
    "adjustments" "text",
    "overall_reflection" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "quarterly_snapshots_snapshot_quarter_check" CHECK (("snapshot_quarter" = ANY (ARRAY['Q1'::"text", 'Q2'::"text", 'Q3'::"text", 'Q4'::"text"])))
);


ALTER TABLE "public"."quarterly_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_completions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stage" character varying(20) NOT NULL,
    "category" character varying(20) NOT NULL,
    "item_text" "text" NOT NULL,
    "completed" boolean DEFAULT false,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."roadmap_completions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "completed_builds" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "completion_checks" "jsonb" DEFAULT '{}'::"jsonb",
    "view_mode" "text" DEFAULT 'full'::"text",
    "has_seen_intro" boolean DEFAULT false
);


ALTER TABLE "public"."roadmap_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_note_id" "uuid",
    "business_id" "uuid" NOT NULL,
    "action_number" integer NOT NULL,
    "description" "text" NOT NULL,
    "due_date" "date",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "completed_at" timestamp with time zone,
    "follow_up_notes" "text",
    "reviewed_at" timestamp with time zone,
    "reviewed_in_session_id" "uuid",
    "carried_over_to_id" "uuid",
    "carried_over_from_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "session_actions_action_number_check" CHECK (("action_number" >= 1)),
    CONSTRAINT "session_actions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'missed'::"text", 'carried_over'::"text"])))
);


ALTER TABLE "public"."session_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_attendees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_note_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_type" "text" NOT NULL,
    "added_by" "uuid",
    "added_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "session_attendees_user_type_check" CHECK (("user_type" = ANY (ARRAY['coach'::"text", 'client'::"text"])))
);


ALTER TABLE "public"."session_attendees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "session_date" "date" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "duration_minutes" integer,
    "discussion_points" "text",
    "client_commitments" "text",
    "coach_action_items" "text",
    "private_observations" "text",
    "next_session_prep" "text",
    "transcript_url" "text",
    "transcript_name" "text",
    "client_takeaways" "text",
    "client_notes" "text",
    "client_rating" integer,
    "client_feedback" "text",
    "visible_to_all_users" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "coach_started_at" timestamp with time zone,
    "client_started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    CONSTRAINT "session_notes_client_rating_check" CHECK ((("client_rating" >= 1) AND ("client_rating" <= 5))),
    CONSTRAINT "session_notes_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."session_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid",
    "type" "text" DEFAULT 'session'::"text",
    "name" "text" NOT NULL,
    "description" "text",
    "agenda" "jsonb",
    "content" "text",
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."session_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "coach_id" "uuid",
    "title" "text",
    "description" "text",
    "scheduled_at" timestamp with time zone NOT NULL,
    "duration_minutes" integer DEFAULT 60,
    "type" "text" DEFAULT 'video'::"text",
    "location" "text",
    "status" "text" DEFAULT 'scheduled'::"text",
    "notes" "text",
    "agenda" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shared_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "folder" "text" DEFAULT 'root'::"text",
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shared_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sprint_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "owner" "text",
    "due_date" "date",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "sprint_actions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in-progress'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."sprint_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sprint_key_actions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "business_id" "text" NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "owner" "text",
    "due_date" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sprint_key_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sprint_milestones" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "sprint_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "completed" boolean DEFAULT false,
    "due_date" "date" NOT NULL,
    "order_index" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sprint_milestones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stage_transitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "from_stage" "text",
    "to_stage" "text" NOT NULL,
    "revenue_at_transition" numeric,
    "triggered_by" "text" DEFAULT 'revenue_update'::"text" NOT NULL,
    "transitioned_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stage_transitions" OWNER TO "postgres";


COMMENT ON TABLE "public"."stage_transitions" IS 'Tracks business progression through roadmap stages (Foundation → Mastery)';



COMMENT ON COLUMN "public"."stage_transitions"."from_stage" IS 'Previous stage (null for initial record)';



COMMENT ON COLUMN "public"."stage_transitions"."to_stage" IS 'Stage transitioned to';



COMMENT ON COLUMN "public"."stage_transitions"."triggered_by" IS 'What triggered the transition: revenue_update, manual, or initial';



CREATE TABLE IF NOT EXISTS "public"."stop_doing_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "activity_name" "text" NOT NULL,
    "frequency" "text" DEFAULT 'weekly'::"text",
    "duration_minutes" integer DEFAULT 30,
    "zone" "text" DEFAULT 'competence'::"text",
    "focus_funnel_outcome" "text",
    "special_skills_required" "text",
    "importance" "text" DEFAULT 'medium'::"text",
    "has_system" boolean DEFAULT false,
    "delegation_hourly_rate" numeric(10,2),
    "order_index" integer DEFAULT 0,
    "is_selected_for_stop_doing" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stop_doing_activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stop_doing_hourly_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "target_annual_income" numeric(15,2) DEFAULT 0,
    "working_weeks_per_year" integer DEFAULT 48,
    "hours_per_week" integer DEFAULT 40,
    "calculated_hourly_rate" numeric(10,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stop_doing_hourly_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stop_doing_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "activity_id" "uuid",
    "item_name" "text" NOT NULL,
    "zone" "text",
    "focus_funnel_outcome" "text",
    "monthly_hours" numeric(10,2) DEFAULT 0,
    "hourly_rate_used" numeric(10,2) DEFAULT 0,
    "delegation_rate" numeric(10,2) DEFAULT 0,
    "net_gain_loss" numeric(10,2) DEFAULT 0,
    "opportunity_cost_monthly" numeric(15,2) DEFAULT 0,
    "suggested_decision" "text",
    "delegate_to" "text",
    "target_date" "date",
    "notes" "text",
    "status" "text" DEFAULT 'identified'::"text",
    "order_index" integer DEFAULT 0,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stop_doing_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stop_doing_time_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "week_start_date" "date" NOT NULL,
    "entries" "jsonb" DEFAULT '{}'::"jsonb",
    "total_minutes" integer DEFAULT 0,
    "is_complete" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stop_doing_time_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."strategic_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "revenue_current" integer DEFAULT 0 NOT NULL,
    "revenue_1_year" integer DEFAULT 0 NOT NULL,
    "revenue_2_year" integer DEFAULT 0 NOT NULL,
    "revenue_3_year" integer DEFAULT 0 NOT NULL,
    "gross_profit_current" integer DEFAULT 0 NOT NULL,
    "gross_profit_1_year" integer DEFAULT 0 NOT NULL,
    "gross_profit_2_year" integer DEFAULT 0 NOT NULL,
    "gross_profit_3_year" integer DEFAULT 0 NOT NULL,
    "gross_margin_current" numeric(5,2) DEFAULT 0 NOT NULL,
    "gross_margin_1_year" numeric(5,2) DEFAULT 0 NOT NULL,
    "gross_margin_2_year" numeric(5,2) DEFAULT 0 NOT NULL,
    "gross_margin_3_year" numeric(5,2) DEFAULT 0 NOT NULL,
    "net_profit_current" integer DEFAULT 0 NOT NULL,
    "net_profit_1_year" integer DEFAULT 0 NOT NULL,
    "net_profit_2_year" integer DEFAULT 0 NOT NULL,
    "net_profit_3_year" integer DEFAULT 0 NOT NULL,
    "net_margin_current" numeric(5,2) DEFAULT 0 NOT NULL,
    "net_margin_1_year" numeric(5,2) DEFAULT 0 NOT NULL,
    "net_margin_2_year" numeric(5,2) DEFAULT 0 NOT NULL,
    "net_margin_3_year" numeric(5,2) DEFAULT 0 NOT NULL,
    "customers_current" integer DEFAULT 0 NOT NULL,
    "customers_1_year" integer DEFAULT 0 NOT NULL,
    "customers_2_year" integer DEFAULT 0 NOT NULL,
    "customers_3_year" integer DEFAULT 0 NOT NULL,
    "employees_current" integer DEFAULT 0 NOT NULL,
    "employees_1_year" integer DEFAULT 0 NOT NULL,
    "employees_2_year" integer DEFAULT 0 NOT NULL,
    "employees_3_year" integer DEFAULT 0 NOT NULL,
    "year_type" character varying(2) DEFAULT 'FY'::character varying NOT NULL,
    "industry" character varying(100),
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "business_profile_id" "uuid",
    CONSTRAINT "strategic_goals_year_type_check" CHECK ((("year_type")::"text" = ANY (ARRAY[('FY'::character varying)::"text", ('CY'::character varying)::"text"])))
);


ALTER TABLE "public"."strategic_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."strategic_initiatives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "notes" "text",
    "category" "text",
    "priority" "text",
    "estimated_effort" "text",
    "step_type" "text" NOT NULL,
    "source" "text",
    "timeline" "text",
    "selected" boolean DEFAULT false,
    "order_index" integer DEFAULT 0,
    "linked_kpis" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'not_started'::"text",
    "progress_percentage" integer DEFAULT 0,
    "actual_start_date" "date",
    "actual_completion_date" "date",
    "quarter_assigned" "text",
    "year_assigned" integer,
    "reflection_notes" "text",
    "assigned_to" "text",
    "tasks" "jsonb" DEFAULT '[]'::"jsonb",
    "milestones" "jsonb",
    "why" "text",
    "outcome" "text",
    "start_date" "date",
    "end_date" "date",
    "total_hours" numeric(10,2),
    "idea_type" "text" DEFAULT 'strategic'::"text",
    CONSTRAINT "strategic_initiatives_idea_type_check" CHECK (("idea_type" = ANY (ARRAY['strategic'::"text", 'operational'::"text"]))),
    CONSTRAINT "strategic_initiatives_progress_percentage_check" CHECK ((("progress_percentage" >= 0) AND ("progress_percentage" <= 100))),
    CONSTRAINT "strategic_initiatives_quarter_assigned_check" CHECK (("quarter_assigned" = ANY (ARRAY['Q1'::"text", 'Q2'::"text", 'Q3'::"text", 'Q4'::"text"]))),
    CONSTRAINT "strategic_initiatives_status_check" CHECK (("status" = ANY (ARRAY['not_started'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text", 'on_hold'::"text"])))
);


ALTER TABLE "public"."strategic_initiatives" OWNER TO "postgres";


COMMENT ON COLUMN "public"."strategic_initiatives"."tasks" IS 'Array of subtasks for this initiative. Each task has: id, name, owner, dueDate, status, minutesAllocated';



COMMENT ON COLUMN "public"."strategic_initiatives"."milestones" IS 'JSON array of project milestones with id, description, targetDate, isCompleted';



COMMENT ON COLUMN "public"."strategic_initiatives"."why" IS 'Explanation of why this initiative is important';



COMMENT ON COLUMN "public"."strategic_initiatives"."outcome" IS 'Expected outcome or success criteria for this initiative';



COMMENT ON COLUMN "public"."strategic_initiatives"."start_date" IS 'Planned start date for this initiative';



COMMENT ON COLUMN "public"."strategic_initiatives"."end_date" IS 'Planned end date for this initiative';



COMMENT ON COLUMN "public"."strategic_initiatives"."total_hours" IS 'Total estimated hours for all tasks in this initiative';



COMMENT ON COLUMN "public"."strategic_initiatives"."idea_type" IS 'Type of idea: strategic (one-off projects) or operational (recurring activities). Strategic ideas flow through Steps 3-6 planning. Operational ideas auto-populate in Step 5 operational plan.';



CREATE TABLE IF NOT EXISTS "public"."strategic_initiatives_backup" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "business_id" "text" NOT NULL,
    "user_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "step_type" "text" NOT NULL,
    "priority" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    "estimated_effort" "text",
    "source" "text",
    "timeline" "text",
    "selected" boolean DEFAULT false,
    "order_index" integer DEFAULT 0,
    "linked_kpis" "jsonb"
);


ALTER TABLE "public"."strategic_initiatives_backup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."strategic_kpis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kpi_id" character varying(100) NOT NULL,
    "name" character varying(200) NOT NULL,
    "friendly_name" character varying(300),
    "category" character varying(100) NOT NULL,
    "unit" character varying(20) NOT NULL,
    "frequency" character varying(20) NOT NULL,
    "description" "text",
    "current_value" numeric(15,2) DEFAULT 0 NOT NULL,
    "year1_target" numeric(15,2) DEFAULT 0 NOT NULL,
    "year2_target" numeric(15,2) DEFAULT 0 NOT NULL,
    "year3_target" numeric(15,2) DEFAULT 0 NOT NULL,
    "is_standard" boolean DEFAULT false,
    "is_industry" boolean DEFAULT false,
    "is_custom" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "priority" integer,
    "alert_threshold_red" numeric(15,4),
    "alert_threshold_amber" numeric(15,4),
    "track_frequency" "text",
    "custom_target_reason" "text",
    "notes" "text"
);


ALTER TABLE "public"."strategic_kpis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."strategic_kpis_backup" (
    "id" "uuid",
    "user_id" "uuid",
    "kpi_id" character varying(100),
    "name" character varying(200),
    "friendly_name" character varying(300),
    "category" character varying(100),
    "unit" character varying(20),
    "frequency" character varying(20),
    "description" "text",
    "current_value" numeric(15,2),
    "year1_target" numeric(15,2),
    "year2_target" numeric(15,2),
    "year3_target" numeric(15,2),
    "is_standard" boolean,
    "is_industry" boolean,
    "is_custom" boolean,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."strategic_kpis_backup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."strategic_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "wizard_completed_at" timestamp with time zone,
    "plan_start_date" "date",
    "plan_year" integer,
    "current_quarter" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "plan_type" "text" DEFAULT 'initial'::"text",
    CONSTRAINT "strategic_plans_current_quarter_check" CHECK (("current_quarter" = ANY (ARRAY['Q1'::"text", 'Q2'::"text", 'Q3'::"text", 'Q4'::"text"]))),
    CONSTRAINT "strategic_plans_plan_type_check" CHECK (("plan_type" = ANY (ARRAY['initial'::"text", 'quarterly_refresh'::"text", 'annual_reset'::"text"]))),
    CONSTRAINT "strategic_plans_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'completed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."strategic_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."strategic_todos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "title" "text" NOT NULL,
    "description" "text",
    "engine" "text" NOT NULL,
    "impact_level" "text",
    "effort_level" "text",
    "financial_impact" numeric(15,2),
    "owner_id" "uuid",
    "owner_name" "text",
    "status" "text" DEFAULT 'backlog'::"text",
    "dependencies" "text"[],
    "linked_roadmap_stage" "text",
    "linked_assessment_gap" "text",
    "estimated_duration_days" integer,
    "target_completion_date" "date",
    "actual_completion_date" "date",
    "selected_for_quarter" "text",
    "notes" "text",
    CONSTRAINT "strategic_todos_effort_level_check" CHECK (("effort_level" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "strategic_todos_engine_check" CHECK (("engine" = ANY (ARRAY['attract'::"text", 'convert'::"text", 'deliver_customer'::"text", 'deliver_operations'::"text", 'scale'::"text", 'finance'::"text"]))),
    CONSTRAINT "strategic_todos_impact_level_check" CHECK (("impact_level" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "strategic_todos_status_check" CHECK (("status" = ANY (ARRAY['backlog'::"text", 'selected'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."strategic_todos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."strategic_wheels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "vision_purpose" "jsonb",
    "strategy_market" "jsonb",
    "people_culture" "jsonb",
    "systems_execution" "jsonb",
    "money_metrics" "jsonb",
    "communications_alignment" "jsonb",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."strategic_wheels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."strategy_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "vision_mission" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "business_id" "uuid"
);


ALTER TABLE "public"."strategy_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_audit_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "forecast_id" "uuid",
    "vendor_name" "text" NOT NULL,
    "vendor_normalized" "text",
    "source_account_id" "text",
    "source_account_name" "text",
    "detected_frequency" "text",
    "confidence" "text",
    "typical_amount" numeric(12,2),
    "annual_total" numeric(12,2),
    "cost_per_employee" numeric(12,2),
    "status" "text" DEFAULT 'review'::"text",
    "user_notes" "text",
    "last_payment_date" "date",
    "next_expected_date" "date",
    "payment_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "subscription_audit_results_confidence_check" CHECK (("confidence" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "subscription_audit_results_detected_frequency_check" CHECK (("detected_frequency" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'annual'::"text", 'irregular'::"text"]))),
    CONSTRAINT "subscription_audit_results_status_check" CHECK (("status" = ANY (ARRAY['essential'::"text", 'review'::"text", 'reduce'::"text", 'cancel'::"text"])))
);


ALTER TABLE "public"."subscription_audit_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "forecast_id" "uuid",
    "vendor_name" "text" NOT NULL,
    "vendor_key" "text" NOT NULL,
    "frequency" "text" NOT NULL,
    "monthly_budget" numeric(12,2) DEFAULT 0 NOT NULL,
    "annual_budget" numeric(12,2) GENERATED ALWAYS AS (
CASE
    WHEN ("frequency" = 'monthly'::"text") THEN ("monthly_budget" * (12)::numeric)
    WHEN ("frequency" = 'quarterly'::"text") THEN ("monthly_budget" * (12)::numeric)
    WHEN ("frequency" = 'annual'::"text") THEN ("monthly_budget" * (12)::numeric)
    ELSE ("monthly_budget" * (12)::numeric)
END) STORED,
    "last_12_months_spend" numeric(12,2) DEFAULT 0,
    "transaction_count" integer DEFAULT 0,
    "avg_transaction_amount" numeric(12,2) DEFAULT 0,
    "last_transaction_date" "date",
    "account_codes" "text"[] DEFAULT '{}'::"text"[],
    "is_active" boolean DEFAULT true,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "subscription_budgets_frequency_check" CHECK (("frequency" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'annual'::"text", 'ad-hoc'::"text"])))
);


ALTER TABLE "public"."subscription_budgets" OWNER TO "postgres";


COMMENT ON TABLE "public"."subscription_budgets" IS 'Stores subscription/recurring expense budgets set by users in the Forecast Wizard';



CREATE TABLE IF NOT EXISTS "public"."success_disciplines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "discipline_1" "text" NOT NULL,
    "discipline_2" "text" NOT NULL,
    "discipline_3" "text" NOT NULL,
    "discipline_1_score" integer DEFAULT 0,
    "discipline_2_score" integer DEFAULT 0,
    "discipline_3_score" integer DEFAULT 0,
    "selection_reason" "text",
    "target_completion_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."success_disciplines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."swot_action_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "swot_item_id" "uuid" NOT NULL,
    "swot_analysis_id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text",
    "action_type" character varying(50),
    "priority" character varying(20) DEFAULT 'medium'::character varying,
    "status" character varying(20) DEFAULT 'pending'::character varying,
    "assigned_to" "uuid",
    "assigned_to_email" character varying(255),
    "assigned_to_name" character varying(255),
    "due_date" "date",
    "completed_date" "date",
    "progress_percentage" integer DEFAULT 0,
    "effort_hours" numeric(10,2),
    "notes" "text",
    "last_update" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "swot_action_items_action_type_check" CHECK ((("action_type")::"text" = ANY (ARRAY[('leverage'::character varying)::"text", ('improve'::character varying)::"text", ('pursue'::character varying)::"text", ('mitigate'::character varying)::"text", ('monitor'::character varying)::"text"]))),
    CONSTRAINT "swot_action_items_priority_check" CHECK ((("priority")::"text" = ANY (ARRAY[('critical'::character varying)::"text", ('high'::character varying)::"text", ('medium'::character varying)::"text", ('low'::character varying)::"text"]))),
    CONSTRAINT "swot_action_items_progress_percentage_check" CHECK ((("progress_percentage" >= 0) AND ("progress_percentage" <= 100))),
    CONSTRAINT "swot_action_items_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('pending'::character varying)::"text", ('in-progress'::character varying)::"text", ('completed'::character varying)::"text", ('cancelled'::character varying)::"text", ('deferred'::character varying)::"text"])))
);


ALTER TABLE "public"."swot_action_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."swot_analyses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "quarter" integer NOT NULL,
    "year" integer NOT NULL,
    "type" character varying(50) NOT NULL,
    "status" character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    "title" character varying(255),
    "description" "text",
    "swot_score" integer DEFAULT 0,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" timestamp with time zone,
    "due_date" "date",
    "user_id" "uuid",
    CONSTRAINT "swot_analyses_quarter_check" CHECK ((("quarter" >= 1) AND ("quarter" <= 4))),
    CONSTRAINT "swot_analyses_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('draft'::character varying)::"text", ('in-progress'::character varying)::"text", ('final'::character varying)::"text", ('archived'::character varying)::"text"]))),
    CONSTRAINT "swot_analyses_swot_score_check" CHECK ((("swot_score" >= 0) AND ("swot_score" <= 100))),
    CONSTRAINT "swot_analyses_type_check" CHECK ((("type")::"text" = ANY (ARRAY[('initial'::character varying)::"text", ('quarterly'::character varying)::"text", ('ad-hoc'::character varying)::"text"]))),
    CONSTRAINT "swot_analyses_year_check" CHECK ((("year" >= 2020) AND ("year" <= 2100)))
);


ALTER TABLE "public"."swot_analyses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."swot_collaborators" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "swot_analysis_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_email" character varying(255) NOT NULL,
    "user_name" character varying(255),
    "role" character varying(50) DEFAULT 'contributor'::character varying,
    "invited_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "last_accessed" timestamp with time zone,
    CONSTRAINT "swot_collaborators_role_check" CHECK ((("role")::"text" = ANY (ARRAY[('owner'::character varying)::"text", ('editor'::character varying)::"text", ('contributor'::character varying)::"text", ('viewer'::character varying)::"text"])))
);


ALTER TABLE "public"."swot_collaborators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."swot_comments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "swot_item_id" "uuid" NOT NULL,
    "parent_comment_id" "uuid",
    "comment_text" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_by_name" character varying(255),
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "is_edited" boolean DEFAULT false,
    "is_deleted" boolean DEFAULT false
);


ALTER TABLE "public"."swot_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."swot_comparisons" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "from_analysis_id" "uuid" NOT NULL,
    "to_analysis_id" "uuid" NOT NULL,
    "comparison_date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "items_added" integer DEFAULT 0,
    "items_removed" integer DEFAULT 0,
    "items_modified" integer DEFAULT 0,
    "items_carried_forward" integer DEFAULT 0,
    "strengths_change" integer DEFAULT 0,
    "weaknesses_change" integer DEFAULT 0,
    "opportunities_change" integer DEFAULT 0,
    "threats_change" integer DEFAULT 0,
    "overall_improvement_score" integer,
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "swot_comparisons_overall_improvement_score_check" CHECK ((("overall_improvement_score" >= '-100'::integer) AND ("overall_improvement_score" <= 100)))
);


ALTER TABLE "public"."swot_comparisons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."swot_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "swot_analysis_id" "uuid",
    "swot_item_id" "uuid",
    "action_type" character varying(50) NOT NULL,
    "old_value" "jsonb",
    "new_value" "jsonb",
    "change_description" "text",
    "changed_by" "uuid" NOT NULL,
    "changed_by_name" character varying(255),
    "changed_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "swot_history_action_type_check" CHECK ((("action_type")::"text" = ANY (ARRAY[('created'::character varying)::"text", ('updated'::character varying)::"text", ('deleted'::character varying)::"text", ('status_changed'::character varying)::"text", ('finalized'::character varying)::"text", ('carried_forward'::character varying)::"text"])))
);


ALTER TABLE "public"."swot_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."swot_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "swot_analysis_id" "uuid" NOT NULL,
    "category" character varying(20) NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text",
    "impact_level" integer DEFAULT 3,
    "likelihood" integer,
    "priority_order" integer DEFAULT 0,
    "status" character varying(20) DEFAULT 'active'::character varying,
    "tags" "text"[],
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" timestamp with time zone,
    "carried_from_item_id" "uuid",
    CONSTRAINT "swot_items_category_check" CHECK ((("category")::"text" = ANY (ARRAY[('strength'::character varying)::"text", ('weakness'::character varying)::"text", ('opportunity'::character varying)::"text", ('threat'::character varying)::"text"]))),
    CONSTRAINT "swot_items_impact_level_check" CHECK ((("impact_level" >= 1) AND ("impact_level" <= 5))),
    CONSTRAINT "swot_items_likelihood_check" CHECK ((("likelihood" >= 1) AND ("likelihood" <= 5))),
    CONSTRAINT "swot_items_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('active'::character varying)::"text", ('resolved'::character varying)::"text", ('archived'::character varying)::"text", ('carried-forward'::character varying)::"text"])))
);


ALTER TABLE "public"."swot_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."swot_templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "industry" character varying(100),
    "business_stage" character varying(50),
    "category" character varying(20) NOT NULL,
    "prompt_text" "text" NOT NULL,
    "example_items" "text"[],
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "swot_templates_business_stage_check" CHECK ((("business_stage")::"text" = ANY (ARRAY[('startup'::character varying)::"text", ('growth'::character varying)::"text", ('mature'::character varying)::"text", ('turnaround'::character varying)::"text"]))),
    CONSTRAINT "swot_templates_category_check" CHECK ((("category")::"text" = ANY (ARRAY[('strength'::character varying)::"text", ('weakness'::character varying)::"text", ('opportunity'::character varying)::"text", ('threat'::character varying)::"text"])))
);


ALTER TABLE "public"."swot_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_roles" (
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "system_roles_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'coach'::"text", 'client'::"text"])))
);


ALTER TABLE "public"."system_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_id" "uuid",
    "accountability_chart" "jsonb",
    "hiring_roadmap" "jsonb",
    "org_chart" "jsonb",
    "team_performance" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."team_data" OWNER TO "postgres";


COMMENT ON TABLE "public"."team_data" IS 'Stores team-related data including accountability chart and hiring roadmap';



COMMENT ON COLUMN "public"."team_data"."accountability_chart" IS 'JSONB: roles array with function, person, responsibilities, success_metric; culture_description';



COMMENT ON COLUMN "public"."team_data"."hiring_roadmap" IS 'JSONB: hiring_priorities array, recognition_rewards, growth_opportunities, work_environment, compensation_strategy';



CREATE TABLE IF NOT EXISTS "public"."team_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text",
    "phone" "text",
    "position" "text",
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "invite_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invited_by" "uuid",
    "invited_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval),
    "status" "text" DEFAULT 'pending'::"text",
    "accepted_at" timestamp with time zone,
    "accepted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "section_permissions" "jsonb" DEFAULT '{"goals": true, "actions": true, "roadmap": true, "messages": true, "documents": true, "financials": false, "business_profile": true, "quarterly_review": false}'::"jsonb",
    CONSTRAINT "team_invites_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text", 'viewer'::"text"]))),
    CONSTRAINT "team_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."team_invites" OWNER TO "postgres";


COMMENT ON COLUMN "public"."team_invites"."section_permissions" IS 'JSON object controlling which sidebar sections this invited user will be able to access once they accept';



CREATE TABLE IF NOT EXISTS "public"."todo_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "assigned_to" "text",
    "priority" "public"."todo_priority" DEFAULT 'medium'::"public"."todo_priority",
    "status" "public"."todo_status" DEFAULT 'pending'::"public"."todo_status",
    "due_date" "date",
    "completed_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "category" character varying(50) DEFAULT 'Other'::character varying,
    "effort_size" character varying(20) DEFAULT 'quick-win'::character varying,
    "is_published" boolean DEFAULT true,
    "is_private_note" boolean DEFAULT false,
    "source" character varying(50) DEFAULT 'manual'::character varying,
    "scheduled_date" "date",
    "session_date" "date",
    "order_index" integer DEFAULT 0,
    "tags" "jsonb" DEFAULT '[]'::"jsonb",
    "notes" "text",
    "is_must" boolean DEFAULT false,
    "must_date" "date",
    "is_top_three" boolean DEFAULT false,
    "effort_estimate" integer,
    "actual_effort" integer,
    "is_recurring" boolean DEFAULT false,
    "recurrence_pattern" "jsonb",
    "parent_task_id" "uuid",
    "attachments" "jsonb" DEFAULT '[]'::"jsonb"
);


ALTER TABLE "public"."todo_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_businesses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_businesses_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'coach'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."user_businesses" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_kpi_dashboard" WITH ("security_invoker"='true') AS
 SELECT "sk"."user_id",
    "sk"."kpi_id",
    "kd"."name",
    "kd"."friendly_name",
    "kd"."description",
    "kd"."category",
    "kd"."unit",
    "kd"."frequency",
    "sk"."current_value",
    "sk"."year1_target",
    "sk"."year2_target",
    "sk"."year3_target",
    "sk"."is_standard",
    "sk"."is_industry",
    "sk"."is_custom",
    "kv"."actual_value" AS "latest_actual",
    "kv"."period_end" AS "latest_period",
        CASE
            WHEN ("kv"."actual_value" IS NULL) THEN 'no_data'::"text"
            WHEN (("sk"."year1_target" IS NOT NULL) AND ("kv"."actual_value" >= "sk"."year1_target")) THEN 'green'::"text"
            WHEN (("sk"."year1_target" IS NOT NULL) AND ("kv"."actual_value" >= ("sk"."year1_target" * 0.9))) THEN 'amber'::"text"
            WHEN ("sk"."year1_target" IS NOT NULL) THEN 'red'::"text"
            ELSE 'no_target'::"text"
        END AS "current_status"
   FROM (("public"."strategic_kpis" "sk"
     JOIN "public"."kpi_definitions" "kd" ON ((("sk"."kpi_id")::"text" = "kd"."id")))
     LEFT JOIN LATERAL ( SELECT "kv2"."actual_value",
            "kv2"."period_end"
           FROM "public"."kpi_values" "kv2"
          WHERE (("kv2"."user_id" = "sk"."user_id") AND ("kv2"."kpi_id" = ("sk"."kpi_id")::"text"))
          ORDER BY "kv2"."period_end" DESC
         LIMIT 1) "kv" ON (true));


ALTER VIEW "public"."user_kpi_dashboard" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_kpis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kpi_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "friendly_name" "text",
    "description" "text",
    "category" "text",
    "frequency" "text" DEFAULT 'monthly'::"text",
    "unit" "text",
    "target_benchmark" "text",
    "why_it_matters" "text",
    "what_to_do" "text",
    "is_universal" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_kpis" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_kpis" IS 'Stores user-selected KPIs from the KPI selection page';



COMMENT ON COLUMN "public"."user_kpis"."kpi_id" IS 'Reference ID to the KPI template';



COMMENT ON COLUMN "public"."user_kpis"."frequency" IS 'How often this KPI should be tracked: daily, weekly, monthly, quarterly, annually';



CREATE TABLE IF NOT EXISTS "public"."user_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "can_view_annual_plan" boolean DEFAULT false,
    "can_view_forecast" boolean DEFAULT false,
    "can_view_goals" boolean DEFAULT false,
    "can_view_documents" boolean DEFAULT false,
    "can_view_sessions" boolean DEFAULT false,
    "can_view_chat" boolean DEFAULT false,
    "can_view_reports" boolean DEFAULT false,
    "can_edit_annual_plan" boolean DEFAULT false,
    "can_edit_forecast" boolean DEFAULT false,
    "can_edit_goals" boolean DEFAULT false,
    "can_upload_documents" boolean DEFAULT false,
    "can_manage_users" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "role" character varying(50) NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"(),
    "granted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_roles_role_check" CHECK ((("role")::"text" = ANY (ARRAY[('owner'::character varying)::"text", ('coach'::character varying)::"text", ('client'::character varying)::"text", ('viewer'::character varying)::"text", ('admin'::character varying)::"text"])))
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_roles" IS 'Stores user roles for business access control';



COMMENT ON COLUMN "public"."user_roles"."role" IS 'Role types: owner (full access), coach (can view all clients), client (own data only), viewer (read-only), admin (full system access)';



CREATE TABLE IF NOT EXISTS "public"."user_selected_kpis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "kpi_id" "text",
    "is_active" boolean DEFAULT true,
    "personal_target" numeric,
    "priority_level" integer DEFAULT 1,
    "date_added" timestamp with time zone DEFAULT "now"(),
    "notes" "text"
);


ALTER TABLE "public"."user_selected_kpis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "phone" "text",
    "system_role" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_login_at" timestamp with time zone,
    CONSTRAINT "users_system_role_check" CHECK (("system_role" = ANY (ARRAY['super_admin'::"text", 'coach'::"text", 'client'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vision_targets" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "business_id" "uuid",
    "user_id" "uuid",
    "timeframe" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "target_value" "text",
    "target_metric" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "three_year_gross_profit" numeric(15,2),
    "kpis" "jsonb" DEFAULT '[]'::"jsonb",
    "initiatives" "jsonb" DEFAULT '[]'::"jsonb",
    CONSTRAINT "vision_targets_timeframe_check" CHECK (("timeframe" = ANY (ARRAY['10_year'::"text", '3_year'::"text", '1_year'::"text"])))
);


ALTER TABLE "public"."vision_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quarterly_priority_id" "uuid",
    "business_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "week_ending_date" "date" NOT NULL,
    "progress_update" "text",
    "blockers_identified" "text",
    "help_needed" "text",
    "progress_percentage" integer,
    "on_track" boolean
);


ALTER TABLE "public"."weekly_checkins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_metrics_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "week_ending_date" "date" NOT NULL,
    "revenue_actual" numeric(15,2),
    "gross_profit_actual" numeric(15,2),
    "net_profit_actual" numeric(15,2),
    "leads_actual" integer,
    "conversion_rate_actual" numeric(5,2),
    "avg_transaction_value_actual" numeric(15,2),
    "team_headcount_actual" integer,
    "owner_hours_actual" numeric(5,2),
    "kpi_actuals" "jsonb" DEFAULT '{}'::"jsonb",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."weekly_metrics_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "week_start_date" "date" NOT NULL,
    "week_end_date" "date" NOT NULL,
    "wins" "text"[] DEFAULT ARRAY[]::"text"[],
    "challenges" "text"[] DEFAULT ARRAY[]::"text"[],
    "key_learning" "text",
    "last_week_goals" "jsonb" DEFAULT '[]'::"jsonb",
    "completion_rate" numeric(5,2) DEFAULT 0,
    "disciplines_completed" "jsonb" DEFAULT '[]'::"jsonb",
    "next_week_goals" "text"[] DEFAULT ARRAY[]::"text"[],
    "important_dates" "jsonb" DEFAULT '[]'::"jsonb",
    "stop_doing" "text"[] DEFAULT ARRAY[]::"text"[],
    "start_doing" "text"[] DEFAULT ARRAY[]::"text"[],
    "week_rating" integer,
    "rating_reason" "text",
    "coach_questions" "jsonb" DEFAULT '[]'::"jsonb",
    "is_completed" boolean DEFAULT false,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "submitter_name" "text",
    "alignment_notes" "text" DEFAULT ''::"text",
    "energy_rating" integer,
    "quarterly_revenue_target" numeric(15,2),
    "quarterly_gp_target" numeric(15,2),
    "quarterly_np_target" numeric(15,2),
    "rock_progress" "jsonb" DEFAULT '[]'::"jsonb",
    "top_priorities" "jsonb" DEFAULT '[]'::"jsonb",
    "other_priorities" "jsonb" DEFAULT '[]'::"jsonb",
    CONSTRAINT "weekly_reviews_week_rating_check" CHECK ((("week_rating" IS NULL) OR (("week_rating" >= 1) AND ("week_rating" <= 10))))
);


ALTER TABLE "public"."weekly_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."xero_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "access_token" "text" NOT NULL,
    "refresh_token" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "tenant_id" "text" NOT NULL,
    "tenant_name" "text",
    "is_active" boolean DEFAULT true,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "token_refreshing_at" timestamp with time zone
);


ALTER TABLE "public"."xero_connections" OWNER TO "postgres";


COMMENT ON COLUMN "public"."xero_connections"."token_refreshing_at" IS 'Timestamp when a token refresh started. Used as a distributed lock to prevent concurrent refreshes. NULL means no refresh in progress.';



ALTER TABLE ONLY "public"."action_items"
    ADD CONSTRAINT "action_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_cfo_conversations"
    ADD CONSTRAINT "ai_cfo_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_interactions"
    ADD CONSTRAINT "ai_interactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."annual_plans"
    ADD CONSTRAINT "annual_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."annual_plans"
    ADD CONSTRAINT "annual_plans_user_id_year_key" UNIQUE ("user_id", "year");



ALTER TABLE ONLY "public"."annual_snapshots"
    ADD CONSTRAINT "annual_snapshots_business_id_snapshot_year_key" UNIQUE ("business_id", "snapshot_year");



ALTER TABLE ONLY "public"."annual_snapshots"
    ADD CONSTRAINT "annual_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."annual_targets"
    ADD CONSTRAINT "annual_targets_business_id_year_key" UNIQUE ("business_id", "year");



ALTER TABLE ONLY "public"."annual_targets"
    ADD CONSTRAINT "annual_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessments"
    ADD CONSTRAINT "assessments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_contacts"
    ADD CONSTRAINT "business_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_financial_goals"
    ADD CONSTRAINT "business_financial_goals_business_id_key" UNIQUE ("business_id");



ALTER TABLE ONLY "public"."business_financial_goals"
    ADD CONSTRAINT "business_financial_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_kpis"
    ADD CONSTRAINT "business_kpis_business_id_kpi_id_key" UNIQUE ("business_id", "kpi_id");



ALTER TABLE ONLY "public"."business_kpis"
    ADD CONSTRAINT "business_kpis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_members"
    ADD CONSTRAINT "business_members_business_id_user_id_key" UNIQUE ("business_id", "user_id");



ALTER TABLE ONLY "public"."business_members"
    ADD CONSTRAINT "business_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_profiles"
    ADD CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_users"
    ADD CONSTRAINT "business_users_business_id_user_id_key" UNIQUE ("business_id", "user_id");



ALTER TABLE ONLY "public"."business_users"
    ADD CONSTRAINT "business_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."category_suggestions"
    ADD CONSTRAINT "category_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_invitations"
    ADD CONSTRAINT "client_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_invitations"
    ADD CONSTRAINT "client_invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."coach_benchmarks"
    ADD CONSTRAINT "coach_benchmarks_coach_id_benchmark_type_category_key" UNIQUE ("coach_id", "benchmark_type", "category");



ALTER TABLE ONLY "public"."coach_benchmarks"
    ADD CONSTRAINT "coach_benchmarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_suggestions"
    ADD CONSTRAINT "coach_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coaching_sessions"
    ADD CONSTRAINT "coaching_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_history"
    ADD CONSTRAINT "conversation_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_kpis_library"
    ADD CONSTRAINT "custom_kpis_library_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_musts"
    ADD CONSTRAINT "daily_musts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_tasks"
    ADD CONSTRAINT "daily_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dashboard_preferences"
    ADD CONSTRAINT "dashboard_preferences_business_id_key" UNIQUE ("business_id");



ALTER TABLE ONLY "public"."dashboard_preferences"
    ADD CONSTRAINT "dashboard_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_forecasts"
    ADD CONSTRAINT "financial_forecasts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_metrics"
    ADD CONSTRAINT "financial_metrics_business_id_metric_date_key" UNIQUE ("business_id", "metric_date");



ALTER TABLE ONLY "public"."financial_metrics"
    ADD CONSTRAINT "financial_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_targets"
    ADD CONSTRAINT "financial_targets_business_id_quarter_year_key" UNIQUE ("business_id", "quarter", "year");



ALTER TABLE ONLY "public"."financial_targets"
    ADD CONSTRAINT "financial_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forecast_audit_log"
    ADD CONSTRAINT "forecast_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forecast_decisions"
    ADD CONSTRAINT "forecast_decisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forecast_employees"
    ADD CONSTRAINT "forecast_employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forecast_insights"
    ADD CONSTRAINT "forecast_insights_business_year_unique" UNIQUE ("business_id", "fiscal_year");



ALTER TABLE ONLY "public"."forecast_insights"
    ADD CONSTRAINT "forecast_insights_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forecast_investments"
    ADD CONSTRAINT "forecast_investments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forecast_payroll_summary"
    ADD CONSTRAINT "forecast_payroll_summary_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forecast_pl_lines"
    ADD CONSTRAINT "forecast_pl_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forecast_scenario_lines"
    ADD CONSTRAINT "forecast_scenario_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forecast_scenario_lines"
    ADD CONSTRAINT "forecast_scenario_lines_scenario_id_pl_line_id_key" UNIQUE ("scenario_id", "pl_line_id");



ALTER TABLE ONLY "public"."forecast_scenarios"
    ADD CONSTRAINT "forecast_scenarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forecast_values"
    ADD CONSTRAINT "forecast_values_forecast_id_month_key" UNIQUE ("forecast_id", "month");



ALTER TABLE ONLY "public"."forecast_values"
    ADD CONSTRAINT "forecast_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forecast_wizard_sessions"
    ADD CONSTRAINT "forecast_wizard_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forecast_years"
    ADD CONSTRAINT "forecast_years_forecast_id_year_number_key" UNIQUE ("forecast_id", "year_number");



ALTER TABLE ONLY "public"."forecast_years"
    ADD CONSTRAINT "forecast_years_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forecasts"
    ADD CONSTRAINT "forecasts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ideas_filter"
    ADD CONSTRAINT "ideas_filter_idea_id_key" UNIQUE ("idea_id");



ALTER TABLE ONLY "public"."ideas_filter"
    ADD CONSTRAINT "ideas_filter_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ideas"
    ADD CONSTRAINT "ideas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."issues_list"
    ADD CONSTRAINT "issues_list_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kpi_actuals"
    ADD CONSTRAINT "kpi_actuals_business_id_kpi_id_period_year_period_quarter_p_key" UNIQUE ("business_id", "kpi_id", "period_year", "period_quarter", "period_month", "period_type");



ALTER TABLE ONLY "public"."kpi_actuals"
    ADD CONSTRAINT "kpi_actuals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kpi_alerts"
    ADD CONSTRAINT "kpi_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kpi_benchmarks"
    ADD CONSTRAINT "kpi_benchmarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kpi_definitions"
    ADD CONSTRAINT "kpi_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kpi_history"
    ADD CONSTRAINT "kpi_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kpi_tracking_values"
    ADD CONSTRAINT "kpi_tracking_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kpi_tracking_values"
    ADD CONSTRAINT "kpi_tracking_values_user_id_kpi_id_period_date_key" UNIQUE ("user_id", "kpi_id", "period_date");



ALTER TABLE ONLY "public"."kpi_values"
    ADD CONSTRAINT "kpi_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kpis"
    ADD CONSTRAINT "kpis_business_profile_id_kpi_id_key" UNIQUE ("business_profile_id", "kpi_id");



ALTER TABLE ONLY "public"."kpis"
    ADD CONSTRAINT "kpis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."life_goals"
    ADD CONSTRAINT "life_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_data"
    ADD CONSTRAINT "marketing_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_data"
    ADD CONSTRAINT "marketing_data_user_unique" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_actuals"
    ADD CONSTRAINT "monthly_actuals_business_id_month_key" UNIQUE ("business_id", "month");



ALTER TABLE ONLY "public"."monthly_actuals"
    ADD CONSTRAINT "monthly_actuals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_reviews"
    ADD CONSTRAINT "monthly_reviews_business_id_review_month_key" UNIQUE ("business_id", "review_month");



ALTER TABLE ONLY "public"."monthly_reviews"
    ADD CONSTRAINT "monthly_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ninety_day_sprints"
    ADD CONSTRAINT "ninety_day_sprints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_progress"
    ADD CONSTRAINT "onboarding_progress_pkey" PRIMARY KEY ("business_id");



ALTER TABLE ONLY "public"."open_loops"
    ADD CONSTRAINT "open_loops_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operational_activities"
    ADD CONSTRAINT "operational_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."process_comments"
    ADD CONSTRAINT "process_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_connections"
    ADD CONSTRAINT "process_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_decisions"
    ADD CONSTRAINT "process_decisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_diagrams"
    ADD CONSTRAINT "process_diagrams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_flows"
    ADD CONSTRAINT "process_flows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_phases"
    ADD CONSTRAINT "process_phases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_steps"
    ADD CONSTRAINT "process_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_versions"
    ADD CONSTRAINT "process_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quarterly_forecasts"
    ADD CONSTRAINT "quarterly_forecasts_business_id_year_quarter_key" UNIQUE ("business_id", "year", "quarter");



ALTER TABLE ONLY "public"."quarterly_forecasts"
    ADD CONSTRAINT "quarterly_forecasts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quarterly_plans"
    ADD CONSTRAINT "quarterly_plans_business_profile_id_year_quarter_key" UNIQUE ("business_profile_id", "year", "quarter");



ALTER TABLE ONLY "public"."quarterly_plans"
    ADD CONSTRAINT "quarterly_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quarterly_priorities"
    ADD CONSTRAINT "quarterly_priorities_business_id_year_quarter_priority_numb_key" UNIQUE ("business_id", "year", "quarter", "priority_number");



ALTER TABLE ONLY "public"."quarterly_priorities"
    ADD CONSTRAINT "quarterly_priorities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quarterly_reviews"
    ADD CONSTRAINT "quarterly_reviews_business_id_quarter_year_key" UNIQUE ("business_id", "quarter", "year");



ALTER TABLE ONLY "public"."quarterly_reviews"
    ADD CONSTRAINT "quarterly_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quarterly_snapshots"
    ADD CONSTRAINT "quarterly_snapshots_business_id_snapshot_year_snapshot_quar_key" UNIQUE ("business_id", "snapshot_year", "snapshot_quarter");



ALTER TABLE ONLY "public"."quarterly_snapshots"
    ADD CONSTRAINT "quarterly_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_completions"
    ADD CONSTRAINT "roadmap_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_progress"
    ADD CONSTRAINT "roadmap_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_progress"
    ADD CONSTRAINT "roadmap_progress_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."session_actions"
    ADD CONSTRAINT "session_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_attendees"
    ADD CONSTRAINT "session_attendees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_attendees"
    ADD CONSTRAINT "session_attendees_session_note_id_user_id_key" UNIQUE ("session_note_id", "user_id");



ALTER TABLE ONLY "public"."session_notes"
    ADD CONSTRAINT "session_notes_business_id_session_date_key" UNIQUE ("business_id", "session_date");



ALTER TABLE ONLY "public"."session_notes"
    ADD CONSTRAINT "session_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_templates"
    ADD CONSTRAINT "session_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shared_documents"
    ADD CONSTRAINT "shared_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sprint_actions"
    ADD CONSTRAINT "sprint_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sprint_key_actions"
    ADD CONSTRAINT "sprint_key_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sprint_milestones"
    ADD CONSTRAINT "sprint_milestones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stage_transitions"
    ADD CONSTRAINT "stage_transitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stop_doing_activities"
    ADD CONSTRAINT "stop_doing_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stop_doing_hourly_rates"
    ADD CONSTRAINT "stop_doing_hourly_rates_business_id_key" UNIQUE ("business_id");



ALTER TABLE ONLY "public"."stop_doing_hourly_rates"
    ADD CONSTRAINT "stop_doing_hourly_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stop_doing_items"
    ADD CONSTRAINT "stop_doing_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stop_doing_time_logs"
    ADD CONSTRAINT "stop_doing_time_logs_business_id_week_start_date_key" UNIQUE ("business_id", "week_start_date");



ALTER TABLE ONLY "public"."stop_doing_time_logs"
    ADD CONSTRAINT "stop_doing_time_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."strategic_goals"
    ADD CONSTRAINT "strategic_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."strategic_goals"
    ADD CONSTRAINT "strategic_goals_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."strategic_initiatives_backup"
    ADD CONSTRAINT "strategic_initiatives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."strategic_initiatives"
    ADD CONSTRAINT "strategic_initiatives_pkey1" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."strategic_kpis"
    ADD CONSTRAINT "strategic_kpis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."strategic_kpis"
    ADD CONSTRAINT "strategic_kpis_user_id_kpi_id_key" UNIQUE ("user_id", "kpi_id");



ALTER TABLE ONLY "public"."strategic_plans"
    ADD CONSTRAINT "strategic_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."strategic_todos"
    ADD CONSTRAINT "strategic_todos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."strategic_wheels"
    ADD CONSTRAINT "strategic_wheels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."strategy_data"
    ADD CONSTRAINT "strategy_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."strategy_data"
    ADD CONSTRAINT "strategy_data_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."subscription_audit_results"
    ADD CONSTRAINT "subscription_audit_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_budgets"
    ADD CONSTRAINT "subscription_budgets_business_id_vendor_key_key" UNIQUE ("business_id", "vendor_key");



ALTER TABLE ONLY "public"."subscription_budgets"
    ADD CONSTRAINT "subscription_budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."success_disciplines"
    ADD CONSTRAINT "success_disciplines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."swot_action_items"
    ADD CONSTRAINT "swot_action_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."swot_analyses"
    ADD CONSTRAINT "swot_analyses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."swot_collaborators"
    ADD CONSTRAINT "swot_collaborators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."swot_comments"
    ADD CONSTRAINT "swot_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."swot_comparisons"
    ADD CONSTRAINT "swot_comparisons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."swot_history"
    ADD CONSTRAINT "swot_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."swot_items"
    ADD CONSTRAINT "swot_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."swot_templates"
    ADD CONSTRAINT "swot_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_roles"
    ADD CONSTRAINT "system_roles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."team_data"
    ADD CONSTRAINT "team_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_data"
    ADD CONSTRAINT "team_data_user_unique" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."team_invites"
    ADD CONSTRAINT "team_invites_invite_token_key" UNIQUE ("invite_token");



ALTER TABLE ONLY "public"."team_invites"
    ADD CONSTRAINT "team_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."todo_items"
    ADD CONSTRAINT "todo_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_profiles"
    ADD CONSTRAINT "unique_business_profile_per_business" UNIQUE ("business_id");



ALTER TABLE ONLY "public"."xero_connections"
    ADD CONSTRAINT "unique_business_tenant" UNIQUE ("business_id", "tenant_id");



ALTER TABLE ONLY "public"."swot_collaborators"
    ADD CONSTRAINT "unique_collaborator" UNIQUE ("swot_analysis_id", "user_id");



ALTER TABLE ONLY "public"."swot_comparisons"
    ADD CONSTRAINT "unique_comparison" UNIQUE ("from_analysis_id", "to_analysis_id");



ALTER TABLE ONLY "public"."forecast_pl_lines"
    ADD CONSTRAINT "unique_forecast_account" UNIQUE ("forecast_id", "account_code");



ALTER TABLE ONLY "public"."forecast_payroll_summary"
    ADD CONSTRAINT "unique_forecast_payroll" UNIQUE ("forecast_id");



ALTER TABLE ONLY "public"."kpi_benchmarks"
    ADD CONSTRAINT "unique_kpi_benchmark" UNIQUE ("kpi_id", "industry", "revenue_stage");



ALTER TABLE ONLY "public"."kpi_values"
    ADD CONSTRAINT "unique_kpi_value" UNIQUE ("user_id", "kpi_id", "period_start", "period_end");



ALTER TABLE ONLY "public"."swot_analyses"
    ADD CONSTRAINT "unique_quarterly_swot" UNIQUE ("business_id", "quarter", "year", "type");



ALTER TABLE ONLY "public"."forecast_scenarios"
    ADD CONSTRAINT "unique_scenario_name_per_forecast" UNIQUE ("base_forecast_id", "name");



ALTER TABLE ONLY "public"."daily_musts"
    ADD CONSTRAINT "unique_todo_must_date" UNIQUE ("todo_id", "must_date");



ALTER TABLE ONLY "public"."conversation_history"
    ADD CONSTRAINT "unique_turn" UNIQUE ("process_id", "turn_number");



ALTER TABLE ONLY "public"."subscription_audit_results"
    ADD CONSTRAINT "unique_vendor_per_business" UNIQUE ("business_id", "vendor_normalized");



ALTER TABLE ONLY "public"."process_versions"
    ADD CONSTRAINT "unique_version" UNIQUE ("process_id", "version_number");



ALTER TABLE ONLY "public"."user_businesses"
    ADD CONSTRAINT "user_businesses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_businesses"
    ADD CONSTRAINT "user_businesses_user_id_business_id_key" UNIQUE ("user_id", "business_id");



ALTER TABLE ONLY "public"."user_kpis"
    ADD CONSTRAINT "user_kpis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_kpis"
    ADD CONSTRAINT "user_kpis_unique" UNIQUE ("user_id", "kpi_id");



ALTER TABLE ONLY "public"."user_logins"
    ADD CONSTRAINT "user_logins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_logins"
    ADD CONSTRAINT "user_logins_user_id_business_id_key" UNIQUE ("user_id", "business_id");



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_user_id_business_id_key" UNIQUE ("user_id", "business_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_business_id_key" UNIQUE ("user_id", "business_id");



ALTER TABLE ONLY "public"."user_selected_kpis"
    ADD CONSTRAINT "user_selected_kpis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_selected_kpis"
    ADD CONSTRAINT "user_selected_kpis_user_id_kpi_id_key" UNIQUE ("user_id", "kpi_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vision_targets"
    ADD CONSTRAINT "vision_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_checkins"
    ADD CONSTRAINT "weekly_checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_checkins"
    ADD CONSTRAINT "weekly_checkins_quarterly_priority_id_week_ending_date_key" UNIQUE ("quarterly_priority_id", "week_ending_date");



ALTER TABLE ONLY "public"."weekly_metrics_snapshots"
    ADD CONSTRAINT "weekly_metrics_snapshots_business_id_week_ending_date_key" UNIQUE ("business_id", "week_ending_date");



ALTER TABLE ONLY "public"."weekly_metrics_snapshots"
    ADD CONSTRAINT "weekly_metrics_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_reviews"
    ADD CONSTRAINT "weekly_reviews_business_id_week_start_date_key" UNIQUE ("business_id", "week_start_date");



ALTER TABLE ONLY "public"."weekly_reviews"
    ADD CONSTRAINT "weekly_reviews_business_user_week_unique" UNIQUE ("business_id", "user_id", "week_start_date");



ALTER TABLE ONLY "public"."weekly_reviews"
    ADD CONSTRAINT "weekly_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."xero_connections"
    ADD CONSTRAINT "xero_connections_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_action_items_business_id" ON "public"."action_items" USING "btree" ("business_id");



CREATE INDEX "idx_activity_log_business_id" ON "public"."activity_log" USING "btree" ("business_id");



CREATE INDEX "idx_ai_cfo_conversations_business" ON "public"."ai_cfo_conversations" USING "btree" ("business_id");



CREATE INDEX "idx_ai_cfo_conversations_business_id" ON "public"."ai_cfo_conversations" USING "btree" ("business_id");



CREATE INDEX "idx_ai_cfo_conversations_created" ON "public"."ai_cfo_conversations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ai_cfo_conversations_session" ON "public"."ai_cfo_conversations" USING "btree" ("session_id");



CREATE INDEX "idx_ai_cfo_conversations_step" ON "public"."ai_cfo_conversations" USING "btree" ("wizard_step");



CREATE INDEX "idx_ai_interactions_business" ON "public"."ai_interactions" USING "btree" ("business_id");



CREATE INDEX "idx_ai_interactions_coach" ON "public"."ai_interactions" USING "btree" ("coach_id");



CREATE INDEX "idx_ai_interactions_created" ON "public"."ai_interactions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ai_interactions_needs_review" ON "public"."ai_interactions" USING "btree" ("coach_reviewed", "confidence") WHERE ("coach_reviewed" = false);



CREATE INDEX "idx_ai_interactions_type" ON "public"."ai_interactions" USING "btree" ("question_type");



CREATE INDEX "idx_annual_snapshots_business" ON "public"."annual_snapshots" USING "btree" ("business_id", "snapshot_year" DESC);



CREATE INDEX "idx_annual_snapshots_plan" ON "public"."annual_snapshots" USING "btree" ("strategic_plan_id");



CREATE INDEX "idx_annual_targets_business_id" ON "public"."annual_targets" USING "btree" ("business_id");



CREATE INDEX "idx_annual_targets_user" ON "public"."annual_targets" USING "btree" ("user_id");



CREATE INDEX "idx_assessments_attract_score" ON "public"."assessments" USING "btree" ("attract_score");



CREATE INDEX "idx_assessments_convert_score" ON "public"."assessments" USING "btree" ("convert_score");



CREATE INDEX "idx_assessments_created_at" ON "public"."assessments" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_assessments_deliver_score" ON "public"."assessments" USING "btree" ("deliver_score");



CREATE INDEX "idx_assessments_finance_score" ON "public"."assessments" USING "btree" ("finance_score");



CREATE INDEX "idx_assessments_leadership_score" ON "public"."assessments" USING "btree" ("leadership_score");



CREATE INDEX "idx_assessments_people_score" ON "public"."assessments" USING "btree" ("people_score");



CREATE INDEX "idx_assessments_status" ON "public"."assessments" USING "btree" ("status");



CREATE INDEX "idx_assessments_systems_score" ON "public"."assessments" USING "btree" ("systems_score");



CREATE INDEX "idx_assessments_time_score" ON "public"."assessments" USING "btree" ("time_score");



CREATE INDEX "idx_assessments_user_id" ON "public"."assessments" USING "btree" ("user_id");



CREATE INDEX "idx_audit_log_business_id" ON "public"."audit_log" USING "btree" ("business_id");



CREATE INDEX "idx_audit_log_page" ON "public"."audit_log" USING "btree" ("page_path");



CREATE INDEX "idx_business_contacts_business_id" ON "public"."business_contacts" USING "btree" ("business_id");



CREATE INDEX "idx_business_financial_goals_business_id" ON "public"."business_financial_goals" USING "btree" ("business_id");



CREATE INDEX "idx_business_financial_goals_user" ON "public"."business_financial_goals" USING "btree" ("user_id");



CREATE INDEX "idx_business_kpis_business_id" ON "public"."business_kpis" USING "btree" ("business_id");



CREATE INDEX "idx_business_kpis_category" ON "public"."business_kpis" USING "btree" ("category");



CREATE INDEX "idx_business_kpis_frequency" ON "public"."business_kpis" USING "btree" ("frequency");



CREATE INDEX "idx_business_kpis_kpi_id" ON "public"."business_kpis" USING "btree" ("kpi_id");



CREATE INDEX "idx_business_kpis_user_id" ON "public"."business_kpis" USING "btree" ("user_id");



CREATE INDEX "idx_business_members_business_id" ON "public"."business_members" USING "btree" ("business_id");



CREATE INDEX "idx_business_members_user_id" ON "public"."business_members" USING "btree" ("user_id");



CREATE INDEX "idx_business_profiles_business_id" ON "public"."business_profiles" USING "btree" ("business_id");



CREATE INDEX "idx_business_profiles_user_id" ON "public"."business_profiles" USING "btree" ("user_id");



CREATE INDEX "idx_business_users_business_id" ON "public"."business_users" USING "btree" ("business_id");



CREATE INDEX "idx_business_users_status" ON "public"."business_users" USING "btree" ("status");



CREATE INDEX "idx_business_users_user_id" ON "public"."business_users" USING "btree" ("user_id");



CREATE INDEX "idx_business_users_user_status" ON "public"."business_users" USING "btree" ("user_id", "status") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_business_users_weekly_review" ON "public"."business_users" USING "btree" ("business_id", "weekly_review_enabled");



CREATE INDEX "idx_businesses_assigned_coach" ON "public"."businesses" USING "btree" ("assigned_coach_id");



CREATE INDEX "idx_businesses_assigned_coach_id" ON "public"."businesses" USING "btree" ("assigned_coach_id");



CREATE INDEX "idx_businesses_invitation_pending" ON "public"."businesses" USING "btree" ("invitation_sent") WHERE ("invitation_sent" = false);



CREATE INDEX "idx_businesses_owner_coach" ON "public"."businesses" USING "btree" ("owner_id", "assigned_coach_id");



CREATE INDEX "idx_businesses_owner_email" ON "public"."businesses" USING "btree" ("owner_email");



CREATE INDEX "idx_businesses_owner_id" ON "public"."businesses" USING "btree" ("owner_id");



CREATE INDEX "idx_category_suggestions_created_at" ON "public"."category_suggestions" USING "btree" ("created_at");



CREATE INDEX "idx_category_suggestions_text" ON "public"."category_suggestions" USING "gin" ("to_tsvector"('"english"'::"regconfig", "initiative_text"));



CREATE INDEX "idx_category_suggestions_user_id" ON "public"."category_suggestions" USING "btree" ("user_id");



CREATE INDEX "idx_chat_messages_business" ON "public"."chat_messages" USING "btree" ("business_id");



CREATE INDEX "idx_client_invitations_email" ON "public"."client_invitations" USING "btree" ("email");



CREATE INDEX "idx_client_invitations_status" ON "public"."client_invitations" USING "btree" ("status");



CREATE INDEX "idx_client_invitations_token" ON "public"."client_invitations" USING "btree" ("token");



CREATE INDEX "idx_coach_benchmarks_coach" ON "public"."coach_benchmarks" USING "btree" ("coach_id");



CREATE INDEX "idx_coach_benchmarks_type" ON "public"."coach_benchmarks" USING "btree" ("benchmark_type", "category");



CREATE INDEX "idx_coach_suggestions_process_id" ON "public"."coach_suggestions" USING "btree" ("process_id");



CREATE INDEX "idx_coach_suggestions_type" ON "public"."coach_suggestions" USING "btree" ("suggestion_type");



CREATE INDEX "idx_coaching_sessions_business" ON "public"."coaching_sessions" USING "btree" ("business_id");



CREATE INDEX "idx_coaching_sessions_business_id" ON "public"."coaching_sessions" USING "btree" ("business_id");



CREATE INDEX "idx_conversation_history_process_id" ON "public"."conversation_history" USING "btree" ("process_id");



CREATE INDEX "idx_conversation_history_turn" ON "public"."conversation_history" USING "btree" ("process_id", "turn_number");



CREATE INDEX "idx_custom_kpis_business_id" ON "public"."custom_kpis_library" USING "btree" ("business_id");



CREATE INDEX "idx_custom_kpis_category" ON "public"."custom_kpis_library" USING "btree" ("category");



CREATE INDEX "idx_custom_kpis_created_by" ON "public"."custom_kpis_library" USING "btree" ("created_by");



CREATE INDEX "idx_custom_kpis_status" ON "public"."custom_kpis_library" USING "btree" ("status");



CREATE INDEX "idx_daily_musts_business_date" ON "public"."daily_musts" USING "btree" ("business_id", "must_date");



CREATE INDEX "idx_daily_musts_user_date" ON "public"."daily_musts" USING "btree" ("user_name", "must_date");



CREATE INDEX "idx_daily_tasks_created_at" ON "public"."daily_tasks" USING "btree" ("created_at");



CREATE INDEX "idx_daily_tasks_status" ON "public"."daily_tasks" USING "btree" ("status");



CREATE INDEX "idx_daily_tasks_user_id" ON "public"."daily_tasks" USING "btree" ("user_id");



CREATE INDEX "idx_dashboard_preferences_business_id" ON "public"."dashboard_preferences" USING "btree" ("business_id");



CREATE INDEX "idx_dashboard_preferences_user_id" ON "public"."dashboard_preferences" USING "btree" ("user_id");



CREATE INDEX "idx_financial_forecasts_business" ON "public"."financial_forecasts" USING "btree" ("business_id");



CREATE INDEX "idx_financial_forecasts_business_id" ON "public"."financial_forecasts" USING "btree" ("business_id");



CREATE INDEX "idx_financial_forecasts_year" ON "public"."financial_forecasts" USING "btree" ("business_id", "fiscal_year");



CREATE INDEX "idx_financial_goals_business_id" ON "public"."business_financial_goals" USING "btree" ("business_id");



CREATE INDEX "idx_financial_metrics_business_id" ON "public"."financial_metrics" USING "btree" ("business_id");



CREATE INDEX "idx_forecast_audit_log_action" ON "public"."forecast_audit_log" USING "btree" ("action");



CREATE INDEX "idx_forecast_audit_log_created_at" ON "public"."forecast_audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_forecast_audit_log_forecast_id" ON "public"."forecast_audit_log" USING "btree" ("forecast_id");



CREATE INDEX "idx_forecast_audit_log_table_record" ON "public"."forecast_audit_log" USING "btree" ("table_name", "record_id");



CREATE INDEX "idx_forecast_audit_log_user_id" ON "public"."forecast_audit_log" USING "btree" ("user_id");



CREATE INDEX "idx_forecast_decisions_business_id" ON "public"."forecast_decisions" USING "btree" ("business_id");



CREATE INDEX "idx_forecast_decisions_forecast" ON "public"."forecast_decisions" USING "btree" ("forecast_id");



CREATE INDEX "idx_forecast_decisions_session" ON "public"."forecast_decisions" USING "btree" ("session_id");



CREATE INDEX "idx_forecast_decisions_type" ON "public"."forecast_decisions" USING "btree" ("decision_type");



CREATE INDEX "idx_forecast_employees_category" ON "public"."forecast_employees" USING "btree" ("forecast_id", "category");



CREATE INDEX "idx_forecast_employees_classification" ON "public"."forecast_employees" USING "btree" ("classification");



CREATE INDEX "idx_forecast_employees_dates" ON "public"."forecast_employees" USING "btree" ("start_date", "end_date");



CREATE INDEX "idx_forecast_employees_forecast" ON "public"."forecast_employees" USING "btree" ("forecast_id");



CREATE INDEX "idx_forecast_employees_forecast_id" ON "public"."forecast_employees" USING "btree" ("forecast_id");



CREATE INDEX "idx_forecast_insights_business_id" ON "public"."forecast_insights" USING "btree" ("business_id");



CREATE INDEX "idx_forecast_insights_business_year" ON "public"."forecast_insights" USING "btree" ("business_id", "fiscal_year");



CREATE INDEX "idx_forecast_investments_business_id" ON "public"."forecast_investments" USING "btree" ("business_id");



CREATE INDEX "idx_forecast_investments_forecast" ON "public"."forecast_investments" USING "btree" ("forecast_id");



CREATE INDEX "idx_forecast_investments_initiative" ON "public"."forecast_investments" USING "btree" ("initiative_id");



CREATE INDEX "idx_forecast_investments_type" ON "public"."forecast_investments" USING "btree" ("investment_type");



CREATE INDEX "idx_forecast_payroll_summary_forecast" ON "public"."forecast_payroll_summary" USING "btree" ("forecast_id");



CREATE INDEX "idx_forecast_payroll_summary_forecast_id" ON "public"."forecast_payroll_summary" USING "btree" ("forecast_id");



CREATE INDEX "idx_forecast_pl_lines_category" ON "public"."forecast_pl_lines" USING "btree" ("forecast_id", "category");



CREATE INDEX "idx_forecast_pl_lines_forecast" ON "public"."forecast_pl_lines" USING "btree" ("forecast_id");



CREATE INDEX "idx_forecast_pl_lines_forecast_id" ON "public"."forecast_pl_lines" USING "btree" ("forecast_id");



CREATE INDEX "idx_forecast_wizard_sessions_business_id" ON "public"."forecast_wizard_sessions" USING "btree" ("business_id");



CREATE INDEX "idx_forecast_years_business_id" ON "public"."forecast_years" USING "btree" ("business_id");



CREATE INDEX "idx_forecast_years_fiscal" ON "public"."forecast_years" USING "btree" ("fiscal_year");



CREATE INDEX "idx_forecast_years_forecast" ON "public"."forecast_years" USING "btree" ("forecast_id");



CREATE INDEX "idx_forecasts_active" ON "public"."financial_forecasts" USING "btree" ("business_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_forecasts_is_base" ON "public"."financial_forecasts" USING "btree" ("business_id", "is_base_forecast") WHERE ("is_base_forecast" = true);



CREATE INDEX "idx_forecasts_parent" ON "public"."financial_forecasts" USING "btree" ("parent_forecast_id") WHERE ("parent_forecast_id" IS NOT NULL);



CREATE INDEX "idx_forecasts_type_version" ON "public"."financial_forecasts" USING "btree" ("business_id", "forecast_type", "version_number");



CREATE INDEX "idx_goals_business_id" ON "public"."goals" USING "btree" ("business_id");



CREATE INDEX "idx_ideas_archived" ON "public"."ideas" USING "btree" ("archived") WHERE ("archived" = false);



CREATE INDEX "idx_ideas_created_at" ON "public"."ideas" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ideas_filter_decision" ON "public"."ideas_filter" USING "btree" ("decision");



CREATE INDEX "idx_ideas_filter_evaluated_at" ON "public"."ideas_filter" USING "btree" ("evaluated_at" DESC);



CREATE INDEX "idx_ideas_filter_idea_id" ON "public"."ideas_filter" USING "btree" ("idea_id");



CREATE INDEX "idx_ideas_filter_user_id" ON "public"."ideas_filter" USING "btree" ("user_id");



CREATE INDEX "idx_ideas_status" ON "public"."ideas" USING "btree" ("status");



CREATE INDEX "idx_ideas_user_id" ON "public"."ideas" USING "btree" ("user_id");



CREATE INDEX "idx_issues_list_business_id" ON "public"."issues_list" USING "btree" ("business_id");



CREATE INDEX "idx_issues_list_user_id" ON "public"."issues_list" USING "btree" ("user_id");



CREATE INDEX "idx_issues_priority" ON "public"."issues_list" USING "btree" ("priority");



CREATE INDEX "idx_issues_status" ON "public"."issues_list" USING "btree" ("status");



CREATE INDEX "idx_kpi_actuals_business_kpi" ON "public"."kpi_actuals" USING "btree" ("business_id", "kpi_id");



CREATE INDEX "idx_kpi_actuals_period" ON "public"."kpi_actuals" USING "btree" ("business_id", "period_year" DESC, "period_quarter" DESC);



CREATE INDEX "idx_kpi_alerts_user_recent" ON "public"."kpi_alerts" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_kpi_alerts_user_unread" ON "public"."kpi_alerts" USING "btree" ("user_id", "is_read") WHERE ("is_read" = false);



CREATE INDEX "idx_kpi_benchmarks_industry" ON "public"."kpi_benchmarks" USING "btree" ("industry", "revenue_stage");



CREATE INDEX "idx_kpi_benchmarks_kpi_id" ON "public"."kpi_benchmarks" USING "btree" ("kpi_id");



CREATE INDEX "idx_kpi_benchmarks_lookup" ON "public"."kpi_benchmarks" USING "btree" ("kpi_id", "industry", "revenue_stage");



CREATE INDEX "idx_kpi_benchmarks_stage" ON "public"."kpi_benchmarks" USING "btree" ("revenue_stage");



CREATE INDEX "idx_kpi_definitions_benchmarks" ON "public"."kpi_definitions" USING "gin" ("benchmarks");



CREATE INDEX "idx_kpi_definitions_business_function" ON "public"."kpi_definitions" USING "btree" ("business_function");



CREATE INDEX "idx_kpi_definitions_category" ON "public"."kpi_definitions" USING "btree" ("category");



CREATE INDEX "idx_kpi_definitions_industries" ON "public"."kpi_definitions" USING "gin" ("industries");



CREATE INDEX "idx_kpi_definitions_tier" ON "public"."kpi_definitions" USING "btree" ("tier");



CREATE INDEX "idx_kpi_definitions_universal" ON "public"."kpi_definitions" USING "btree" ("is_universal") WHERE ("is_universal" = true);



CREATE INDEX "idx_kpi_history_business_id" ON "public"."kpi_history" USING "btree" ("business_id");



CREATE INDEX "idx_kpi_history_kpi_id" ON "public"."kpi_history" USING "btree" ("kpi_id");



CREATE INDEX "idx_kpi_history_recorded_at" ON "public"."kpi_history" USING "btree" ("recorded_at");



CREATE INDEX "idx_kpi_tracking_values_user_date" ON "public"."kpi_tracking_values" USING "btree" ("user_id", "period_date" DESC);



CREATE INDEX "idx_kpi_values_period" ON "public"."kpi_values" USING "btree" ("period_start", "period_end");



CREATE INDEX "idx_kpi_values_recent" ON "public"."kpi_values" USING "btree" ("user_id", "period_end" DESC);



CREATE INDEX "idx_kpi_values_user_kpi" ON "public"."kpi_values" USING "btree" ("user_id", "kpi_id");



CREATE INDEX "idx_kpis_business_profile_id" ON "public"."kpis" USING "btree" ("business_profile_id");



CREATE INDEX "idx_marketing_data_business_id" ON "public"."marketing_data" USING "btree" ("business_id");



CREATE INDEX "idx_marketing_data_user_id" ON "public"."marketing_data" USING "btree" ("user_id");



CREATE INDEX "idx_messages_business_id" ON "public"."messages" USING "btree" ("business_id");



CREATE INDEX "idx_messages_created_at" ON "public"."messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_messages_read" ON "public"."messages" USING "btree" ("read");



CREATE INDEX "idx_messages_recipient_id" ON "public"."messages" USING "btree" ("recipient_id");



CREATE INDEX "idx_messages_sender_id" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_monthly_reviews_business" ON "public"."monthly_reviews" USING "btree" ("business_id");



CREATE INDEX "idx_ninety_day_sprints_business_profile_id" ON "public"."ninety_day_sprints" USING "btree" ("business_profile_id");



CREATE INDEX "idx_notifications_business_id" ON "public"."notifications" USING "btree" ("business_id");



CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_sent_email" ON "public"."notifications" USING "btree" ("sent_email") WHERE ("sent_email" = false);



CREATE INDEX "idx_notifications_type" ON "public"."notifications" USING "btree" ("type");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_open_loops_archived" ON "public"."open_loops" USING "btree" ("archived");



CREATE INDEX "idx_open_loops_business_id" ON "public"."open_loops" USING "btree" ("business_id");



CREATE INDEX "idx_open_loops_status" ON "public"."open_loops" USING "btree" ("status");



CREATE INDEX "idx_open_loops_user_id" ON "public"."open_loops" USING "btree" ("user_id");



CREATE INDEX "idx_operational_activities_business_function" ON "public"."operational_activities" USING "btree" ("business_id", "function_id");



CREATE INDEX "idx_operational_activities_business_id" ON "public"."operational_activities" USING "btree" ("business_id");



CREATE INDEX "idx_operational_activities_user" ON "public"."operational_activities" USING "btree" ("user_id");



CREATE INDEX "idx_password_reset_tokens_token" ON "public"."password_reset_tokens" USING "btree" ("token");



CREATE INDEX "idx_password_reset_tokens_user_id" ON "public"."password_reset_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_process_comments_process_id" ON "public"."process_comments" USING "btree" ("process_id");



CREATE INDEX "idx_process_comments_step_id" ON "public"."process_comments" USING "btree" ("step_id");



CREATE INDEX "idx_process_connections_process_id" ON "public"."process_connections" USING "btree" ("process_id");



CREATE INDEX "idx_process_decisions_after_step" ON "public"."process_decisions" USING "btree" ("after_step_id");



CREATE INDEX "idx_process_decisions_process_id" ON "public"."process_decisions" USING "btree" ("process_id");



CREATE INDEX "idx_process_diagrams_created_at" ON "public"."process_diagrams" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_process_diagrams_status" ON "public"."process_diagrams" USING "btree" ("status");



CREATE INDEX "idx_process_diagrams_user_id" ON "public"."process_diagrams" USING "btree" ("user_id");



CREATE INDEX "idx_process_flows_process" ON "public"."process_flows" USING "btree" ("process_id");



CREATE INDEX "idx_process_phases_process" ON "public"."process_phases" USING "btree" ("process_id");



CREATE INDEX "idx_process_steps_order" ON "public"."process_steps" USING "btree" ("process_id", "order_num");



CREATE INDEX "idx_process_steps_process_id" ON "public"."process_steps" USING "btree" ("process_id");



CREATE INDEX "idx_process_versions_process_id" ON "public"."process_versions" USING "btree" ("process_id");



CREATE INDEX "idx_profiles_business_id" ON "public"."profiles" USING "btree" ("business_id");



CREATE INDEX "idx_quarterly_forecasts_business_id" ON "public"."quarterly_forecasts" USING "btree" ("business_id");



CREATE INDEX "idx_quarterly_forecasts_user_id" ON "public"."quarterly_forecasts" USING "btree" ("user_id");



CREATE INDEX "idx_quarterly_plans_business_profile_id" ON "public"."quarterly_plans" USING "btree" ("business_profile_id");



CREATE INDEX "idx_quarterly_priorities_business_id" ON "public"."quarterly_priorities" USING "btree" ("business_id");



CREATE INDEX "idx_quarterly_priorities_user_id" ON "public"."quarterly_priorities" USING "btree" ("user_id");



CREATE INDEX "idx_quarterly_reviews_business_id" ON "public"."quarterly_reviews" USING "btree" ("business_id");



CREATE INDEX "idx_quarterly_reviews_quarter_year" ON "public"."quarterly_reviews" USING "btree" ("year" DESC, "quarter" DESC);



CREATE INDEX "idx_quarterly_reviews_status" ON "public"."quarterly_reviews" USING "btree" ("status");



CREATE INDEX "idx_quarterly_reviews_user_id" ON "public"."quarterly_reviews" USING "btree" ("user_id");



CREATE INDEX "idx_quarterly_snapshots_business" ON "public"."quarterly_snapshots" USING "btree" ("business_id", "snapshot_year" DESC, "snapshot_quarter" DESC);



CREATE INDEX "idx_quarterly_snapshots_plan" ON "public"."quarterly_snapshots" USING "btree" ("strategic_plan_id");



CREATE INDEX "idx_roadmap_completions_stage_category" ON "public"."roadmap_completions" USING "btree" ("stage", "category");



CREATE INDEX "idx_roadmap_completions_user_id" ON "public"."roadmap_completions" USING "btree" ("user_id");



CREATE INDEX "idx_roadmap_progress_user_id" ON "public"."roadmap_progress" USING "btree" ("user_id");



CREATE INDEX "idx_scenario_lines_pl_line" ON "public"."forecast_scenario_lines" USING "btree" ("pl_line_id");



CREATE INDEX "idx_scenario_lines_scenario" ON "public"."forecast_scenario_lines" USING "btree" ("scenario_id");



CREATE INDEX "idx_scenarios_active" ON "public"."forecast_scenarios" USING "btree" ("base_forecast_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_scenarios_base_forecast" ON "public"."forecast_scenarios" USING "btree" ("base_forecast_id");



CREATE INDEX "idx_session_actions_business" ON "public"."session_actions" USING "btree" ("business_id");



CREATE INDEX "idx_session_actions_due_date" ON "public"."session_actions" USING "btree" ("due_date");



CREATE INDEX "idx_session_actions_pending" ON "public"."session_actions" USING "btree" ("business_id", "status") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_session_actions_session" ON "public"."session_actions" USING "btree" ("session_note_id");



CREATE INDEX "idx_session_actions_status" ON "public"."session_actions" USING "btree" ("status");



CREATE INDEX "idx_session_attendees_session" ON "public"."session_attendees" USING "btree" ("session_note_id");



CREATE INDEX "idx_session_attendees_user" ON "public"."session_attendees" USING "btree" ("user_id");



CREATE INDEX "idx_session_notes_business_id" ON "public"."session_notes" USING "btree" ("business_id");



CREATE INDEX "idx_session_notes_coach_id" ON "public"."session_notes" USING "btree" ("coach_id");



CREATE INDEX "idx_session_notes_session_date" ON "public"."session_notes" USING "btree" ("session_date" DESC);



CREATE INDEX "idx_sessions_business_id" ON "public"."sessions" USING "btree" ("business_id");



CREATE INDEX "idx_sessions_coach_id" ON "public"."sessions" USING "btree" ("coach_id");



CREATE INDEX "idx_sprint_actions_user" ON "public"."sprint_key_actions" USING "btree" ("user_id");



CREATE INDEX "idx_sprint_key_actions_business_id" ON "public"."sprint_key_actions" USING "btree" ("business_id");



CREATE INDEX "idx_sprint_milestones_sprint_id" ON "public"."sprint_milestones" USING "btree" ("sprint_id");



CREATE INDEX "idx_stage_transitions_business_date" ON "public"."stage_transitions" USING "btree" ("business_id", "transitioned_at" DESC);



CREATE INDEX "idx_stage_transitions_business_id" ON "public"."stage_transitions" USING "btree" ("business_id");



CREATE INDEX "idx_stop_doing_activities_business_id" ON "public"."stop_doing_activities" USING "btree" ("business_id");



CREATE INDEX "idx_stop_doing_activities_selected" ON "public"."stop_doing_activities" USING "btree" ("is_selected_for_stop_doing") WHERE ("is_selected_for_stop_doing" = true);



CREATE INDEX "idx_stop_doing_activities_user_id" ON "public"."stop_doing_activities" USING "btree" ("user_id");



CREATE INDEX "idx_stop_doing_activities_zone" ON "public"."stop_doing_activities" USING "btree" ("zone");



CREATE INDEX "idx_stop_doing_hourly_rates_business_id" ON "public"."stop_doing_hourly_rates" USING "btree" ("business_id");



CREATE INDEX "idx_stop_doing_hourly_rates_user_id" ON "public"."stop_doing_hourly_rates" USING "btree" ("user_id");



CREATE INDEX "idx_stop_doing_items_activity_id" ON "public"."stop_doing_items" USING "btree" ("activity_id");



CREATE INDEX "idx_stop_doing_items_business_id" ON "public"."stop_doing_items" USING "btree" ("business_id");



CREATE INDEX "idx_stop_doing_items_status" ON "public"."stop_doing_items" USING "btree" ("status");



CREATE INDEX "idx_stop_doing_items_user_id" ON "public"."stop_doing_items" USING "btree" ("user_id");



CREATE INDEX "idx_stop_doing_time_logs_business_id" ON "public"."stop_doing_time_logs" USING "btree" ("business_id");



CREATE INDEX "idx_stop_doing_time_logs_user_id" ON "public"."stop_doing_time_logs" USING "btree" ("user_id");



CREATE INDEX "idx_stop_doing_time_logs_week" ON "public"."stop_doing_time_logs" USING "btree" ("week_start_date" DESC);



CREATE INDEX "idx_strategic_goals_business_profile_id" ON "public"."strategic_goals" USING "btree" ("business_profile_id");



CREATE INDEX "idx_strategic_initiatives_assigned_to" ON "public"."strategic_initiatives" USING "btree" ("business_id", "assigned_to");



CREATE INDEX "idx_strategic_initiatives_business" ON "public"."strategic_initiatives_backup" USING "btree" ("business_id");



CREATE INDEX "idx_strategic_initiatives_business_id" ON "public"."strategic_initiatives" USING "btree" ("business_id");



CREATE INDEX "idx_strategic_initiatives_category" ON "public"."strategic_initiatives" USING "btree" ("business_id", "category");



CREATE INDEX "idx_strategic_initiatives_end_date" ON "public"."strategic_initiatives" USING "btree" ("end_date") WHERE ("end_date" IS NOT NULL);



CREATE INDEX "idx_strategic_initiatives_idea_type" ON "public"."strategic_initiatives" USING "btree" ("idea_type");



CREATE INDEX "idx_strategic_initiatives_order" ON "public"."strategic_initiatives" USING "btree" ("business_id", "step_type", "order_index");



CREATE INDEX "idx_strategic_initiatives_priority" ON "public"."strategic_initiatives" USING "btree" ("business_id", "priority");



CREATE INDEX "idx_strategic_initiatives_quarter" ON "public"."strategic_initiatives" USING "btree" ("business_id", "year_assigned", "quarter_assigned");



CREATE INDEX "idx_strategic_initiatives_start_date" ON "public"."strategic_initiatives" USING "btree" ("start_date") WHERE ("start_date" IS NOT NULL);



CREATE INDEX "idx_strategic_initiatives_status" ON "public"."strategic_initiatives" USING "btree" ("business_id", "status");



CREATE INDEX "idx_strategic_initiatives_step_type" ON "public"."strategic_initiatives" USING "btree" ("business_id", "step_type");



CREATE INDEX "idx_strategic_initiatives_user" ON "public"."strategic_initiatives_backup" USING "btree" ("user_id");



CREATE INDEX "idx_strategic_kpis_active" ON "public"."strategic_kpis" USING "btree" ("user_id", "is_standard") WHERE ("is_standard" = true);



CREATE INDEX "idx_strategic_kpis_user_id" ON "public"."strategic_kpis" USING "btree" ("user_id");



CREATE INDEX "idx_strategic_plans_business_status" ON "public"."strategic_plans" USING "btree" ("business_id", "status");



CREATE INDEX "idx_strategic_plans_year_quarter" ON "public"."strategic_plans" USING "btree" ("business_id", "plan_year", "current_quarter");



CREATE INDEX "idx_strategic_todos_business" ON "public"."strategic_todos" USING "btree" ("business_id");



CREATE INDEX "idx_strategic_todos_engine" ON "public"."strategic_todos" USING "btree" ("engine");



CREATE INDEX "idx_strategic_todos_status" ON "public"."strategic_todos" USING "btree" ("status");



CREATE INDEX "idx_strategy_data_business_id" ON "public"."strategy_data" USING "btree" ("business_id");



CREATE INDEX "idx_strategy_data_user_id" ON "public"."strategy_data" USING "btree" ("user_id");



CREATE INDEX "idx_subscription_audit_business" ON "public"."subscription_audit_results" USING "btree" ("business_id");



CREATE INDEX "idx_subscription_audit_forecast" ON "public"."subscription_audit_results" USING "btree" ("forecast_id");



CREATE INDEX "idx_subscription_audit_results_business_id" ON "public"."subscription_audit_results" USING "btree" ("business_id");



CREATE INDEX "idx_subscription_audit_status" ON "public"."subscription_audit_results" USING "btree" ("business_id", "status");



CREATE INDEX "idx_subscription_budgets_active" ON "public"."subscription_budgets" USING "btree" ("business_id", "is_active");



CREATE INDEX "idx_subscription_budgets_business" ON "public"."subscription_budgets" USING "btree" ("business_id");



CREATE INDEX "idx_subscription_budgets_business_id" ON "public"."subscription_budgets" USING "btree" ("business_id");



CREATE INDEX "idx_subscription_budgets_forecast" ON "public"."subscription_budgets" USING "btree" ("forecast_id");



CREATE INDEX "idx_swot_action_items_analysis_id" ON "public"."swot_action_items" USING "btree" ("swot_analysis_id");



CREATE INDEX "idx_swot_action_items_assigned_to" ON "public"."swot_action_items" USING "btree" ("assigned_to");



CREATE INDEX "idx_swot_action_items_status" ON "public"."swot_action_items" USING "btree" ("status");



CREATE INDEX "idx_swot_analyses_business_id" ON "public"."swot_analyses" USING "btree" ("business_id");



CREATE INDEX "idx_swot_analyses_quarter_year" ON "public"."swot_analyses" USING "btree" ("quarter", "year");



CREATE INDEX "idx_swot_analyses_status" ON "public"."swot_analyses" USING "btree" ("status");



CREATE INDEX "idx_swot_analyses_user_id" ON "public"."swot_analyses" USING "btree" ("user_id");



CREATE INDEX "idx_swot_history_analysis_id" ON "public"."swot_history" USING "btree" ("swot_analysis_id");



CREATE INDEX "idx_swot_history_item_id" ON "public"."swot_history" USING "btree" ("swot_item_id");



CREATE INDEX "idx_swot_items_category" ON "public"."swot_items" USING "btree" ("category");



CREATE INDEX "idx_swot_items_status" ON "public"."swot_items" USING "btree" ("status");



CREATE INDEX "idx_swot_items_swot_analysis_id" ON "public"."swot_items" USING "btree" ("swot_analysis_id");



CREATE INDEX "idx_system_roles_role" ON "public"."system_roles" USING "btree" ("role");



CREATE INDEX "idx_system_roles_user_id" ON "public"."system_roles" USING "btree" ("user_id");



CREATE INDEX "idx_system_roles_user_role" ON "public"."system_roles" USING "btree" ("user_id", "role");



CREATE INDEX "idx_team_data_business_id" ON "public"."team_data" USING "btree" ("business_id");



CREATE INDEX "idx_team_invites_business" ON "public"."team_invites" USING "btree" ("business_id");



CREATE INDEX "idx_team_invites_token" ON "public"."team_invites" USING "btree" ("invite_token");



CREATE UNIQUE INDEX "idx_team_invites_unique_pending" ON "public"."team_invites" USING "btree" ("business_id", "email") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_todo_items_business_id" ON "public"."todo_items" USING "btree" ("business_id");



CREATE INDEX "idx_todo_items_category" ON "public"."todo_items" USING "btree" ("category");



CREATE INDEX "idx_todo_items_created_at" ON "public"."todo_items" USING "btree" ("created_at");



CREATE INDEX "idx_todo_items_created_by" ON "public"."todo_items" USING "btree" ("created_by");



CREATE INDEX "idx_todo_items_due_date" ON "public"."todo_items" USING "btree" ("due_date");



CREATE INDEX "idx_todo_items_is_must" ON "public"."todo_items" USING "btree" ("is_must");



CREATE INDEX "idx_todo_items_is_published" ON "public"."todo_items" USING "btree" ("is_published");



CREATE INDEX "idx_todo_items_is_top_three" ON "public"."todo_items" USING "btree" ("is_top_three");



CREATE INDEX "idx_todo_items_priority" ON "public"."todo_items" USING "btree" ("priority");



CREATE INDEX "idx_todo_items_status" ON "public"."todo_items" USING "btree" ("status");



CREATE INDEX "idx_user_businesses_business_id" ON "public"."user_businesses" USING "btree" ("business_id");



CREATE INDEX "idx_user_businesses_user_id" ON "public"."user_businesses" USING "btree" ("user_id");



CREATE INDEX "idx_user_kpis_user_id" ON "public"."user_kpis" USING "btree" ("user_id");



CREATE INDEX "idx_user_logins_business" ON "public"."user_logins" USING "btree" ("business_id");



CREATE INDEX "idx_user_logins_time" ON "public"."user_logins" USING "btree" ("login_at" DESC);



CREATE INDEX "idx_user_logins_user" ON "public"."user_logins" USING "btree" ("user_id");



CREATE INDEX "idx_user_roles_business_id" ON "public"."user_roles" USING "btree" ("business_id");



CREATE INDEX "idx_user_roles_role" ON "public"."user_roles" USING "btree" ("role");



CREATE INDEX "idx_user_roles_user_id" ON "public"."user_roles" USING "btree" ("user_id");



CREATE INDEX "idx_user_selected_kpis_user" ON "public"."user_selected_kpis" USING "btree" ("user_id") WHERE ("is_active" = true);



CREATE INDEX "idx_users_last_login" ON "public"."users" USING "btree" ("last_login_at");



CREATE INDEX "idx_users_system_role" ON "public"."users" USING "btree" ("system_role");



CREATE INDEX "idx_vision_targets_business_id" ON "public"."vision_targets" USING "btree" ("business_id");



CREATE INDEX "idx_vision_targets_user_id" ON "public"."vision_targets" USING "btree" ("user_id");



CREATE INDEX "idx_weekly_checkins_priority" ON "public"."weekly_checkins" USING "btree" ("quarterly_priority_id");



CREATE INDEX "idx_weekly_metrics_business_week" ON "public"."weekly_metrics_snapshots" USING "btree" ("business_id", "week_ending_date" DESC);



CREATE INDEX "idx_weekly_metrics_snapshots_business_id" ON "public"."weekly_metrics_snapshots" USING "btree" ("business_id");



CREATE INDEX "idx_weekly_metrics_user" ON "public"."weekly_metrics_snapshots" USING "btree" ("user_id");



CREATE INDEX "idx_weekly_reviews_business_id" ON "public"."weekly_reviews" USING "btree" ("business_id");



CREATE INDEX "idx_weekly_reviews_business_user" ON "public"."weekly_reviews" USING "btree" ("business_id", "user_id");



CREATE INDEX "idx_weekly_reviews_business_week" ON "public"."weekly_reviews" USING "btree" ("business_id", "week_start_date" DESC);



CREATE INDEX "idx_weekly_reviews_user_id" ON "public"."weekly_reviews" USING "btree" ("user_id");



CREATE INDEX "idx_weekly_reviews_user_week" ON "public"."weekly_reviews" USING "btree" ("user_id", "week_start_date");



CREATE INDEX "idx_weekly_reviews_week_dates" ON "public"."weekly_reviews" USING "btree" ("week_start_date" DESC);



CREATE INDEX "idx_weekly_reviews_week_start" ON "public"."weekly_reviews" USING "btree" ("week_start_date");



CREATE INDEX "idx_wizard_sessions_business" ON "public"."forecast_wizard_sessions" USING "btree" ("business_id");



CREATE INDEX "idx_wizard_sessions_forecast" ON "public"."forecast_wizard_sessions" USING "btree" ("forecast_id");



CREATE INDEX "idx_wizard_sessions_user" ON "public"."forecast_wizard_sessions" USING "btree" ("user_id");



CREATE INDEX "idx_xero_connections_active" ON "public"."xero_connections" USING "btree" ("business_id", "is_active");



CREATE INDEX "idx_xero_connections_business" ON "public"."xero_connections" USING "btree" ("business_id");



CREATE INDEX "idx_xero_connections_business_id" ON "public"."xero_connections" USING "btree" ("business_id");



CREATE INDEX "idx_xero_connections_token_refreshing" ON "public"."xero_connections" USING "btree" ("id", "token_refreshing_at") WHERE ("token_refreshing_at" IS NOT NULL);



CREATE OR REPLACE VIEW "public"."current_quarter_swots" WITH ("security_invoker"='true') AS
 SELECT "sa"."id",
    "sa"."business_id",
    "sa"."quarter",
    "sa"."year",
    "sa"."type",
    "sa"."status",
    "sa"."title",
    "sa"."description",
    "sa"."swot_score",
    "sa"."created_by",
    "sa"."created_at",
    "sa"."updated_at",
    "sa"."finalized_at",
    "sa"."due_date",
    "count"(DISTINCT "si"."id") AS "total_items",
    "count"(DISTINCT
        CASE
            WHEN (("si"."category")::"text" = 'strength'::"text") THEN "si"."id"
            ELSE NULL::"uuid"
        END) AS "strengths_count",
    "count"(DISTINCT
        CASE
            WHEN (("si"."category")::"text" = 'weakness'::"text") THEN "si"."id"
            ELSE NULL::"uuid"
        END) AS "weaknesses_count",
    "count"(DISTINCT
        CASE
            WHEN (("si"."category")::"text" = 'opportunity'::"text") THEN "si"."id"
            ELSE NULL::"uuid"
        END) AS "opportunities_count",
    "count"(DISTINCT
        CASE
            WHEN (("si"."category")::"text" = 'threat'::"text") THEN "si"."id"
            ELSE NULL::"uuid"
        END) AS "threats_count",
    "count"(DISTINCT "sai"."id") AS "action_items_count",
    "count"(DISTINCT
        CASE
            WHEN (("sai"."status")::"text" = 'completed'::"text") THEN "sai"."id"
            ELSE NULL::"uuid"
        END) AS "completed_actions_count"
   FROM (("public"."swot_analyses" "sa"
     LEFT JOIN "public"."swot_items" "si" ON (("sa"."id" = "si"."swot_analysis_id")))
     LEFT JOIN "public"."swot_action_items" "sai" ON (("sa"."id" = "sai"."swot_analysis_id")))
  WHERE ((EXTRACT(quarter FROM CURRENT_DATE) = ("sa"."quarter")::numeric) AND (EXTRACT(year FROM CURRENT_DATE) = ("sa"."year")::numeric))
  GROUP BY "sa"."id";



CREATE OR REPLACE TRIGGER "ai_interactions_updated_at" BEFORE UPDATE ON "public"."ai_interactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_ai_tables_updated_at"();



CREATE OR REPLACE TRIGGER "coach_benchmarks_updated_at" BEFORE UPDATE ON "public"."coach_benchmarks" FOR EACH ROW EXECUTE FUNCTION "public"."update_ai_tables_updated_at"();



CREATE OR REPLACE TRIGGER "ideas_filter_decision_trigger" AFTER INSERT OR UPDATE OF "decision" ON "public"."ideas_filter" FOR EACH ROW EXECUTE FUNCTION "public"."update_idea_status_on_filter"();



CREATE OR REPLACE TRIGGER "ideas_filter_updated_at" BEFORE UPDATE ON "public"."ideas_filter" FOR EACH ROW EXECUTE FUNCTION "public"."update_ideas_updated_at"();



CREATE OR REPLACE TRIGGER "ideas_updated_at" BEFORE UPDATE ON "public"."ideas" FOR EACH ROW EXECUTE FUNCTION "public"."update_ideas_updated_at"();



CREATE OR REPLACE TRIGGER "notifications_updated_at" BEFORE UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."update_notifications_updated_at"();



CREATE OR REPLACE TRIGGER "quarterly_reviews_updated_at" BEFORE UPDATE ON "public"."quarterly_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_quarterly_reviews_updated_at"();



CREATE OR REPLACE TRIGGER "session_actions_updated_at" BEFORE UPDATE ON "public"."session_actions" FOR EACH ROW EXECUTE FUNCTION "public"."update_session_actions_updated_at"();



CREATE OR REPLACE TRIGGER "session_notes_updated_at" BEFORE UPDATE ON "public"."session_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_session_notes_updated_at"();



CREATE OR REPLACE TRIGGER "stop_doing_activities_updated_at" BEFORE UPDATE ON "public"."stop_doing_activities" FOR EACH ROW EXECUTE FUNCTION "public"."update_stop_doing_updated_at"();



CREATE OR REPLACE TRIGGER "stop_doing_hourly_rates_updated_at" BEFORE UPDATE ON "public"."stop_doing_hourly_rates" FOR EACH ROW EXECUTE FUNCTION "public"."update_stop_doing_updated_at"();



CREATE OR REPLACE TRIGGER "stop_doing_items_updated_at" BEFORE UPDATE ON "public"."stop_doing_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_stop_doing_updated_at"();



CREATE OR REPLACE TRIGGER "stop_doing_time_logs_updated_at" BEFORE UPDATE ON "public"."stop_doing_time_logs" FOR EACH ROW EXECUTE FUNCTION "public"."update_stop_doing_updated_at"();



CREATE OR REPLACE TRIGGER "subscription_budgets_updated_at" BEFORE UPDATE ON "public"."subscription_budgets" FOR EACH ROW EXECUTE FUNCTION "public"."update_subscription_budgets_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_notify_coach_forecast" BEFORE UPDATE ON "public"."financial_forecasts" FOR EACH ROW EXECUTE FUNCTION "public"."notify_coach_forecast_complete"();



CREATE OR REPLACE TRIGGER "update_annual_plans_updated_at" BEFORE UPDATE ON "public"."annual_plans" FOR EACH ROW EXECUTE FUNCTION "public"."update_annual_plans_updated_at"();



CREATE OR REPLACE TRIGGER "update_business_profiles_updated_at" BEFORE UPDATE ON "public"."business_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_businesses_profile_timestamp" BEFORE UPDATE ON "public"."businesses" FOR EACH ROW EXECUTE FUNCTION "public"."update_profile_timestamp"();



CREATE OR REPLACE TRIGGER "update_custom_kpis_timestamp" BEFORE UPDATE ON "public"."custom_kpis_library" FOR EACH ROW EXECUTE FUNCTION "public"."update_custom_kpis_updated_at"();



CREATE OR REPLACE TRIGGER "update_decision_count" AFTER INSERT OR DELETE ON "public"."process_decisions" FOR EACH ROW EXECUTE FUNCTION "public"."update_decision_stats"();



CREATE OR REPLACE TRIGGER "update_forecast_insights_updated_at" BEFORE UPDATE ON "public"."forecast_insights" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_forecast_payroll_summary_updated_at" BEFORE UPDATE ON "public"."forecast_payroll_summary" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_forecast_scenarios_updated_at" BEFORE UPDATE ON "public"."forecast_scenarios" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_kpi_benchmarks_updated_at" BEFORE UPDATE ON "public"."kpi_benchmarks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_kpi_definitions_updated_at" BEFORE UPDATE ON "public"."kpi_definitions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_kpi_values_updated_at" BEFORE UPDATE ON "public"."kpi_values" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_kpis_updated_at" BEFORE UPDATE ON "public"."kpis" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_life_goals_updated_at" BEFORE UPDATE ON "public"."life_goals" FOR EACH ROW EXECUTE FUNCTION "public"."update_life_goals_updated_at"();



CREATE OR REPLACE TRIGGER "update_ninety_day_sprints_updated_at" BEFORE UPDATE ON "public"."ninety_day_sprints" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_process_decisions_updated_at" BEFORE UPDATE ON "public"."process_decisions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_quarterly_plans_updated_at" BEFORE UPDATE ON "public"."quarterly_plans" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_roadmap_completions_updated_at" BEFORE UPDATE ON "public"."roadmap_completions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_roadmap_progress_timestamp" BEFORE UPDATE ON "public"."roadmap_progress" FOR EACH ROW EXECUTE FUNCTION "public"."update_roadmap_progress_updated_at"();



CREATE OR REPLACE TRIGGER "update_sprint_milestones_updated_at" BEFORE UPDATE ON "public"."sprint_milestones" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_strategic_goals_updated_at" BEFORE UPDATE ON "public"."strategic_goals" FOR EACH ROW EXECUTE FUNCTION "public"."update_strategic_goals_updated_at"();



CREATE OR REPLACE TRIGGER "update_strategic_initiatives_updated_at" BEFORE UPDATE ON "public"."strategic_initiatives" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_strategic_kpis_updated_at" BEFORE UPDATE ON "public"."strategic_kpis" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_subscription_audit_updated_at" BEFORE UPDATE ON "public"."subscription_audit_results" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_swot_analyses_timestamp" BEFORE UPDATE ON "public"."swot_analyses" FOR EACH ROW EXECUTE FUNCTION "public"."update_swot_updated_at"();



CREATE OR REPLACE TRIGGER "update_swot_items_timestamp" BEFORE UPDATE ON "public"."swot_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_swot_updated_at"();



CREATE OR REPLACE TRIGGER "update_xero_connections_updated_at" BEFORE UPDATE ON "public"."xero_connections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."action_items"
    ADD CONSTRAINT "action_items_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."action_items"
    ADD CONSTRAINT "action_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."action_items"
    ADD CONSTRAINT "action_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ai_cfo_conversations"
    ADD CONSTRAINT "ai_cfo_conversations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_cfo_conversations"
    ADD CONSTRAINT "ai_cfo_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_interactions"
    ADD CONSTRAINT "ai_interactions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_interactions"
    ADD CONSTRAINT "ai_interactions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."forecast_wizard_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_interactions"
    ADD CONSTRAINT "ai_interactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."annual_plans"
    ADD CONSTRAINT "annual_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."annual_snapshots"
    ADD CONSTRAINT "annual_snapshots_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."annual_snapshots"
    ADD CONSTRAINT "annual_snapshots_q1_snapshot_id_fkey" FOREIGN KEY ("q1_snapshot_id") REFERENCES "public"."quarterly_snapshots"("id");



ALTER TABLE ONLY "public"."annual_snapshots"
    ADD CONSTRAINT "annual_snapshots_q2_snapshot_id_fkey" FOREIGN KEY ("q2_snapshot_id") REFERENCES "public"."quarterly_snapshots"("id");



ALTER TABLE ONLY "public"."annual_snapshots"
    ADD CONSTRAINT "annual_snapshots_q3_snapshot_id_fkey" FOREIGN KEY ("q3_snapshot_id") REFERENCES "public"."quarterly_snapshots"("id");



ALTER TABLE ONLY "public"."annual_snapshots"
    ADD CONSTRAINT "annual_snapshots_q4_snapshot_id_fkey" FOREIGN KEY ("q4_snapshot_id") REFERENCES "public"."quarterly_snapshots"("id");



ALTER TABLE ONLY "public"."annual_snapshots"
    ADD CONSTRAINT "annual_snapshots_strategic_plan_id_fkey" FOREIGN KEY ("strategic_plan_id") REFERENCES "public"."strategic_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."annual_snapshots"
    ADD CONSTRAINT "annual_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."annual_targets"
    ADD CONSTRAINT "annual_targets_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."annual_targets"
    ADD CONSTRAINT "annual_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessments"
    ADD CONSTRAINT "assessments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."business_contacts"
    ADD CONSTRAINT "business_contacts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_financial_goals"
    ADD CONSTRAINT "business_financial_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."business_kpis"
    ADD CONSTRAINT "business_kpis_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."business_members"
    ADD CONSTRAINT "business_members_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_members"
    ADD CONSTRAINT "business_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_profiles"
    ADD CONSTRAINT "business_profiles_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_profiles"
    ADD CONSTRAINT "business_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_users"
    ADD CONSTRAINT "business_users_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_users"
    ADD CONSTRAINT "business_users_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."business_users"
    ADD CONSTRAINT "business_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_assigned_coach_id_fkey" FOREIGN KEY ("assigned_coach_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."category_suggestions"
    ADD CONSTRAINT "category_suggestions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."client_invitations"
    ADD CONSTRAINT "client_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."coach_benchmarks"
    ADD CONSTRAINT "coach_benchmarks_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_benchmarks"
    ADD CONSTRAINT "coach_benchmarks_source_interaction_id_fkey" FOREIGN KEY ("source_interaction_id") REFERENCES "public"."ai_interactions"("id");



ALTER TABLE ONLY "public"."coaching_sessions"
    ADD CONSTRAINT "coaching_sessions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coaching_sessions"
    ADD CONSTRAINT "coaching_sessions_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."custom_kpis_library"
    ADD CONSTRAINT "custom_kpis_library_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."custom_kpis_library"
    ADD CONSTRAINT "custom_kpis_library_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."business_profiles"("id");



ALTER TABLE ONLY "public"."custom_kpis_library"
    ADD CONSTRAINT "custom_kpis_library_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."daily_tasks"
    ADD CONSTRAINT "daily_tasks_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_tasks"
    ADD CONSTRAINT "daily_tasks_open_loop_id_fkey" FOREIGN KEY ("open_loop_id") REFERENCES "public"."open_loops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."daily_tasks"
    ADD CONSTRAINT "daily_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_forecasts"
    ADD CONSTRAINT "financial_forecasts_parent_forecast_id_fkey" FOREIGN KEY ("parent_forecast_id") REFERENCES "public"."financial_forecasts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_forecasts"
    ADD CONSTRAINT "financial_forecasts_super_cogs_pl_line_id_fkey" FOREIGN KEY ("super_cogs_pl_line_id") REFERENCES "public"."forecast_pl_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_forecasts"
    ADD CONSTRAINT "financial_forecasts_super_opex_pl_line_id_fkey" FOREIGN KEY ("super_opex_pl_line_id") REFERENCES "public"."forecast_pl_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_forecasts"
    ADD CONSTRAINT "financial_forecasts_wages_cogs_pl_line_id_fkey" FOREIGN KEY ("wages_cogs_pl_line_id") REFERENCES "public"."forecast_pl_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_forecasts"
    ADD CONSTRAINT "financial_forecasts_wages_opex_pl_line_id_fkey" FOREIGN KEY ("wages_opex_pl_line_id") REFERENCES "public"."forecast_pl_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_forecasts"
    ADD CONSTRAINT "financial_forecasts_wizard_session_id_fkey" FOREIGN KEY ("wizard_session_id") REFERENCES "public"."forecast_wizard_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_metrics"
    ADD CONSTRAINT "financial_metrics_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_targets"
    ADD CONSTRAINT "financial_targets_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forecast_employees"
    ADD CONSTRAINT "fk_employees_forecast" FOREIGN KEY ("forecast_id") REFERENCES "public"."financial_forecasts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_forecasts"
    ADD CONSTRAINT "fk_forecast_xero_connection" FOREIGN KEY ("xero_connection_id") REFERENCES "public"."xero_connections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."forecast_payroll_summary"
    ADD CONSTRAINT "fk_payroll_forecast" FOREIGN KEY ("forecast_id") REFERENCES "public"."financial_forecasts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forecast_pl_lines"
    ADD CONSTRAINT "fk_pl_lines_forecast" FOREIGN KEY ("forecast_id") REFERENCES "public"."financial_forecasts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_musts"
    ADD CONSTRAINT "fk_todo_id" FOREIGN KEY ("todo_id") REFERENCES "public"."todo_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forecast_audit_log"
    ADD CONSTRAINT "forecast_audit_log_forecast_id_fkey" FOREIGN KEY ("forecast_id") REFERENCES "public"."financial_forecasts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."forecast_audit_log"
    ADD CONSTRAINT "forecast_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."forecast_decisions"
    ADD CONSTRAINT "forecast_decisions_forecast_id_fkey" FOREIGN KEY ("forecast_id") REFERENCES "public"."financial_forecasts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forecast_decisions"
    ADD CONSTRAINT "forecast_decisions_linked_initiative_id_fkey" FOREIGN KEY ("linked_initiative_id") REFERENCES "public"."strategic_initiatives"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."forecast_decisions"
    ADD CONSTRAINT "forecast_decisions_linked_pl_line_id_fkey" FOREIGN KEY ("linked_pl_line_id") REFERENCES "public"."forecast_pl_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."forecast_decisions"
    ADD CONSTRAINT "forecast_decisions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."forecast_wizard_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."forecast_decisions"
    ADD CONSTRAINT "forecast_decisions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forecast_insights"
    ADD CONSTRAINT "forecast_insights_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forecast_investments"
    ADD CONSTRAINT "forecast_investments_forecast_id_fkey" FOREIGN KEY ("forecast_id") REFERENCES "public"."financial_forecasts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forecast_investments"
    ADD CONSTRAINT "forecast_investments_initiative_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "public"."strategic_initiatives"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."forecast_investments"
    ADD CONSTRAINT "forecast_investments_pl_line_id_fkey" FOREIGN KEY ("pl_line_id") REFERENCES "public"."forecast_pl_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."forecast_investments"
    ADD CONSTRAINT "forecast_investments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forecast_scenario_lines"
    ADD CONSTRAINT "forecast_scenario_lines_pl_line_id_fkey" FOREIGN KEY ("pl_line_id") REFERENCES "public"."forecast_pl_lines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forecast_scenarios"
    ADD CONSTRAINT "forecast_scenarios_base_forecast_id_fkey" FOREIGN KEY ("base_forecast_id") REFERENCES "public"."financial_forecasts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forecast_scenarios"
    ADD CONSTRAINT "forecast_scenarios_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."forecast_values"
    ADD CONSTRAINT "forecast_values_forecast_id_fkey" FOREIGN KEY ("forecast_id") REFERENCES "public"."forecasts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forecast_wizard_sessions"
    ADD CONSTRAINT "forecast_wizard_sessions_forecast_id_fkey" FOREIGN KEY ("forecast_id") REFERENCES "public"."financial_forecasts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forecast_wizard_sessions"
    ADD CONSTRAINT "forecast_wizard_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forecast_years"
    ADD CONSTRAINT "forecast_years_forecast_id_fkey" FOREIGN KEY ("forecast_id") REFERENCES "public"."financial_forecasts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forecast_years"
    ADD CONSTRAINT "forecast_years_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forecasts"
    ADD CONSTRAINT "forecasts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forecasts"
    ADD CONSTRAINT "forecasts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ideas_filter"
    ADD CONSTRAINT "ideas_filter_evaluated_by_fkey" FOREIGN KEY ("evaluated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ideas_filter"
    ADD CONSTRAINT "ideas_filter_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ideas_filter"
    ADD CONSTRAINT "ideas_filter_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ideas"
    ADD CONSTRAINT "ideas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."issues_list"
    ADD CONSTRAINT "issues_list_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kpi_actuals"
    ADD CONSTRAINT "kpi_actuals_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kpi_actuals"
    ADD CONSTRAINT "kpi_actuals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kpi_alerts"
    ADD CONSTRAINT "kpi_alerts_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kpi_alerts"
    ADD CONSTRAINT "kpi_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kpi_benchmarks"
    ADD CONSTRAINT "kpi_benchmarks_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kpi_tracking_values"
    ADD CONSTRAINT "kpi_tracking_values_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kpi_tracking_values"
    ADD CONSTRAINT "kpi_tracking_values_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kpi_values"
    ADD CONSTRAINT "kpi_values_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kpi_values"
    ADD CONSTRAINT "kpi_values_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kpis"
    ADD CONSTRAINT "kpis_business_profile_id_fkey" FOREIGN KEY ("business_profile_id") REFERENCES "public"."business_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."life_goals"
    ADD CONSTRAINT "life_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_data"
    ADD CONSTRAINT "marketing_data_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_data"
    ADD CONSTRAINT "marketing_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."monthly_actuals"
    ADD CONSTRAINT "monthly_actuals_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monthly_reviews"
    ADD CONSTRAINT "monthly_reviews_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monthly_reviews"
    ADD CONSTRAINT "monthly_reviews_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ninety_day_sprints"
    ADD CONSTRAINT "ninety_day_sprints_business_profile_id_fkey" FOREIGN KEY ("business_profile_id") REFERENCES "public"."business_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_progress"
    ADD CONSTRAINT "onboarding_progress_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."open_loops"
    ADD CONSTRAINT "open_loops_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_comments"
    ADD CONSTRAINT "process_comments_commented_by_fkey" FOREIGN KEY ("commented_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."process_comments"
    ADD CONSTRAINT "process_comments_commented_to_fkey" FOREIGN KEY ("commented_to") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."process_connections"
    ADD CONSTRAINT "process_connections_from_step_id_fkey" FOREIGN KEY ("from_step_id") REFERENCES "public"."process_steps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_connections"
    ADD CONSTRAINT "process_connections_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."process_diagrams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_connections"
    ADD CONSTRAINT "process_connections_to_step_id_fkey" FOREIGN KEY ("to_step_id") REFERENCES "public"."process_steps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_diagrams"
    ADD CONSTRAINT "process_diagrams_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_flows"
    ADD CONSTRAINT "process_flows_from_step_id_fkey" FOREIGN KEY ("from_step_id") REFERENCES "public"."process_steps"("id");



ALTER TABLE ONLY "public"."process_flows"
    ADD CONSTRAINT "process_flows_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."process_diagrams"("id");



ALTER TABLE ONLY "public"."process_flows"
    ADD CONSTRAINT "process_flows_to_step_id_fkey" FOREIGN KEY ("to_step_id") REFERENCES "public"."process_steps"("id");



ALTER TABLE ONLY "public"."process_phases"
    ADD CONSTRAINT "process_phases_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."process_diagrams"("id");



ALTER TABLE ONLY "public"."process_steps"
    ADD CONSTRAINT "process_steps_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."process_diagrams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_versions"
    ADD CONSTRAINT "process_versions_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."process_diagrams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quarterly_forecasts"
    ADD CONSTRAINT "quarterly_forecasts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quarterly_forecasts"
    ADD CONSTRAINT "quarterly_forecasts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quarterly_plans"
    ADD CONSTRAINT "quarterly_plans_business_profile_id_fkey" FOREIGN KEY ("business_profile_id") REFERENCES "public"."business_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quarterly_priorities"
    ADD CONSTRAINT "quarterly_priorities_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quarterly_priorities"
    ADD CONSTRAINT "quarterly_priorities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quarterly_reviews"
    ADD CONSTRAINT "quarterly_reviews_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quarterly_reviews"
    ADD CONSTRAINT "quarterly_reviews_swot_analysis_id_fkey" FOREIGN KEY ("swot_analysis_id") REFERENCES "public"."swot_analyses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quarterly_reviews"
    ADD CONSTRAINT "quarterly_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quarterly_snapshots"
    ADD CONSTRAINT "quarterly_snapshots_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quarterly_snapshots"
    ADD CONSTRAINT "quarterly_snapshots_strategic_plan_id_fkey" FOREIGN KEY ("strategic_plan_id") REFERENCES "public"."strategic_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quarterly_snapshots"
    ADD CONSTRAINT "quarterly_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roadmap_completions"
    ADD CONSTRAINT "roadmap_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."roadmap_progress"
    ADD CONSTRAINT "roadmap_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_actions"
    ADD CONSTRAINT "session_actions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_actions"
    ADD CONSTRAINT "session_actions_carried_over_from_id_fkey" FOREIGN KEY ("carried_over_from_id") REFERENCES "public"."session_actions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."session_actions"
    ADD CONSTRAINT "session_actions_carried_over_to_id_fkey" FOREIGN KEY ("carried_over_to_id") REFERENCES "public"."session_actions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."session_actions"
    ADD CONSTRAINT "session_actions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."session_actions"
    ADD CONSTRAINT "session_actions_reviewed_in_session_id_fkey" FOREIGN KEY ("reviewed_in_session_id") REFERENCES "public"."session_notes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."session_actions"
    ADD CONSTRAINT "session_actions_session_note_id_fkey" FOREIGN KEY ("session_note_id") REFERENCES "public"."session_notes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."session_attendees"
    ADD CONSTRAINT "session_attendees_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."session_attendees"
    ADD CONSTRAINT "session_attendees_session_note_id_fkey" FOREIGN KEY ("session_note_id") REFERENCES "public"."session_notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_attendees"
    ADD CONSTRAINT "session_attendees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."session_notes"
    ADD CONSTRAINT "session_notes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_notes"
    ADD CONSTRAINT "session_notes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."session_templates"
    ADD CONSTRAINT "session_templates_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."shared_documents"
    ADD CONSTRAINT "shared_documents_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shared_documents"
    ADD CONSTRAINT "shared_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."sprint_actions"
    ADD CONSTRAINT "sprint_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."sprint_key_actions"
    ADD CONSTRAINT "sprint_key_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."sprint_milestones"
    ADD CONSTRAINT "sprint_milestones_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "public"."ninety_day_sprints"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stage_transitions"
    ADD CONSTRAINT "stage_transitions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."business_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stop_doing_activities"
    ADD CONSTRAINT "stop_doing_activities_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."business_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stop_doing_activities"
    ADD CONSTRAINT "stop_doing_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stop_doing_hourly_rates"
    ADD CONSTRAINT "stop_doing_hourly_rates_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."business_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stop_doing_hourly_rates"
    ADD CONSTRAINT "stop_doing_hourly_rates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stop_doing_items"
    ADD CONSTRAINT "stop_doing_items_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."stop_doing_activities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stop_doing_items"
    ADD CONSTRAINT "stop_doing_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."business_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stop_doing_items"
    ADD CONSTRAINT "stop_doing_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stop_doing_time_logs"
    ADD CONSTRAINT "stop_doing_time_logs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."business_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stop_doing_time_logs"
    ADD CONSTRAINT "stop_doing_time_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."strategic_goals"
    ADD CONSTRAINT "strategic_goals_business_profile_id_fkey" FOREIGN KEY ("business_profile_id") REFERENCES "public"."business_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."strategic_goals"
    ADD CONSTRAINT "strategic_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."strategic_initiatives_backup"
    ADD CONSTRAINT "strategic_initiatives_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."strategic_kpis"
    ADD CONSTRAINT "strategic_kpis_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."strategic_plans"
    ADD CONSTRAINT "strategic_plans_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."strategic_plans"
    ADD CONSTRAINT "strategic_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."strategic_todos"
    ADD CONSTRAINT "strategic_todos_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."strategic_todos"
    ADD CONSTRAINT "strategic_todos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."strategic_todos"
    ADD CONSTRAINT "strategic_todos_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."strategic_wheels"
    ADD CONSTRAINT "strategic_wheels_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."strategy_data"
    ADD CONSTRAINT "strategy_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_audit_results"
    ADD CONSTRAINT "subscription_audit_results_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_audit_results"
    ADD CONSTRAINT "subscription_audit_results_forecast_id_fkey" FOREIGN KEY ("forecast_id") REFERENCES "public"."financial_forecasts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscription_budgets"
    ADD CONSTRAINT "subscription_budgets_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_budgets"
    ADD CONSTRAINT "subscription_budgets_forecast_id_fkey" FOREIGN KEY ("forecast_id") REFERENCES "public"."forecasts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."success_disciplines"
    ADD CONSTRAINT "success_disciplines_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."success_disciplines"
    ADD CONSTRAINT "success_disciplines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."swot_action_items"
    ADD CONSTRAINT "swot_action_items_swot_analysis_id_fkey" FOREIGN KEY ("swot_analysis_id") REFERENCES "public"."swot_analyses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."swot_action_items"
    ADD CONSTRAINT "swot_action_items_swot_item_id_fkey" FOREIGN KEY ("swot_item_id") REFERENCES "public"."swot_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."swot_analyses"
    ADD CONSTRAINT "swot_analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."swot_collaborators"
    ADD CONSTRAINT "swot_collaborators_swot_analysis_id_fkey" FOREIGN KEY ("swot_analysis_id") REFERENCES "public"."swot_analyses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."swot_comments"
    ADD CONSTRAINT "swot_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."swot_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."swot_comments"
    ADD CONSTRAINT "swot_comments_swot_item_id_fkey" FOREIGN KEY ("swot_item_id") REFERENCES "public"."swot_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."swot_comparisons"
    ADD CONSTRAINT "swot_comparisons_from_analysis_id_fkey" FOREIGN KEY ("from_analysis_id") REFERENCES "public"."swot_analyses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."swot_comparisons"
    ADD CONSTRAINT "swot_comparisons_to_analysis_id_fkey" FOREIGN KEY ("to_analysis_id") REFERENCES "public"."swot_analyses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."swot_history"
    ADD CONSTRAINT "swot_history_swot_analysis_id_fkey" FOREIGN KEY ("swot_analysis_id") REFERENCES "public"."swot_analyses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."swot_history"
    ADD CONSTRAINT "swot_history_swot_item_id_fkey" FOREIGN KEY ("swot_item_id") REFERENCES "public"."swot_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."swot_items"
    ADD CONSTRAINT "swot_items_carried_from_item_id_fkey" FOREIGN KEY ("carried_from_item_id") REFERENCES "public"."swot_items"("id");



ALTER TABLE ONLY "public"."swot_items"
    ADD CONSTRAINT "swot_items_swot_analysis_id_fkey" FOREIGN KEY ("swot_analysis_id") REFERENCES "public"."swot_analyses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_roles"
    ADD CONSTRAINT "system_roles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."system_roles"
    ADD CONSTRAINT "system_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_data"
    ADD CONSTRAINT "team_data_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_data"
    ADD CONSTRAINT "team_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_invites"
    ADD CONSTRAINT "team_invites_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."team_invites"
    ADD CONSTRAINT "team_invites_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_invites"
    ADD CONSTRAINT "team_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."todo_items"
    ADD CONSTRAINT "todo_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."todo_items"
    ADD CONSTRAINT "todo_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."todo_items"
    ADD CONSTRAINT "todo_items_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "public"."todo_items"("id");



ALTER TABLE ONLY "public"."user_businesses"
    ADD CONSTRAINT "user_businesses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_businesses"
    ADD CONSTRAINT "user_businesses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_kpis"
    ADD CONSTRAINT "user_kpis_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_logins"
    ADD CONSTRAINT "user_logins_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_logins"
    ADD CONSTRAINT "user_logins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."business_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_selected_kpis"
    ADD CONSTRAINT "user_selected_kpis_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_selected_kpis"
    ADD CONSTRAINT "user_selected_kpis_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vision_targets"
    ADD CONSTRAINT "vision_targets_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vision_targets"
    ADD CONSTRAINT "vision_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_checkins"
    ADD CONSTRAINT "weekly_checkins_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_checkins"
    ADD CONSTRAINT "weekly_checkins_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."xero_connections"
    ADD CONSTRAINT "xero_connections_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can delete process flows" ON "public"."process_flows" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text")))));



CREATE POLICY "Admins can delete process phases" ON "public"."process_phases" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text")))));



CREATE POLICY "Admins can manage process flows" ON "public"."process_flows" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text")))));



CREATE POLICY "Admins can manage process phases" ON "public"."process_phases" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text")))));



CREATE POLICY "Admins can update process flows" ON "public"."process_flows" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text")))));



CREATE POLICY "Admins can update process phases" ON "public"."process_phases" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text")))));



CREATE POLICY "Allow all for authenticated users" ON "public"."strategic_wheels" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can view process flows" ON "public"."process_flows" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view process phases" ON "public"."process_phases" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view swot templates" ON "public"."swot_templates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Block direct system_roles delete" ON "public"."system_roles" FOR DELETE USING (false);



CREATE POLICY "Block direct system_roles insert" ON "public"."system_roles" FOR INSERT WITH CHECK (false);



CREATE POLICY "Block direct system_roles update" ON "public"."system_roles" FOR UPDATE USING (false);



CREATE POLICY "KPI definitions are editable by service role only" ON "public"."kpi_definitions" TO "service_role" USING (true);



CREATE POLICY "Service role can manage tokens" ON "public"."password_reset_tokens" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));



CREATE POLICY "Super admins can view all invitations" ON "public"."client_invitations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text")))));



CREATE POLICY "System can insert audit logs" ON "public"."forecast_audit_log" FOR INSERT WITH CHECK (true);



CREATE POLICY "Update own comments" ON "public"."process_comments" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "commented_by"));



CREATE POLICY "Users can all financial_targets" ON "public"."financial_targets" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can create custom KPIs" ON "public"."custom_kpis_library" FOR INSERT WITH CHECK (("created_by" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can create ninety day sprints" ON "public"."ninety_day_sprints" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."business_profiles"
  WHERE (("business_profiles"."id" = "ninety_day_sprints"."business_profile_id") AND ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can create quarterly plans" ON "public"."quarterly_plans" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."business_profiles"
  WHERE (("business_profiles"."id" = "quarterly_plans"."business_profile_id") AND ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can create sprint milestones" ON "public"."sprint_milestones" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."ninety_day_sprints"
     JOIN "public"."business_profiles" ON (("business_profiles"."id" = "ninety_day_sprints"."business_profile_id")))
  WHERE (("ninety_day_sprints"."id" = "sprint_milestones"."sprint_id") AND ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can create their own tasks" ON "public"."daily_tasks" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete ninety day sprints" ON "public"."ninety_day_sprints" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."business_profiles"
  WHERE (("business_profiles"."id" = "ninety_day_sprints"."business_profile_id") AND ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can delete quarterly plans" ON "public"."quarterly_plans" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."business_profiles"
  WHERE (("business_profiles"."id" = "quarterly_plans"."business_profile_id") AND ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can delete sprint milestones" ON "public"."sprint_milestones" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."ninety_day_sprints"
     JOIN "public"."business_profiles" ON (("business_profiles"."id" = "ninety_day_sprints"."business_profile_id")))
  WHERE (("ninety_day_sprints"."id" = "sprint_milestones"."sprint_id") AND ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can delete their own initiatives" ON "public"."strategic_initiatives_backup" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own life goals" ON "public"."life_goals" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own sprint actions" ON "public"."sprint_actions" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own sprint actions" ON "public"."sprint_key_actions" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own tasks" ON "public"."daily_tasks" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert activity" ON "public"."activity_log" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can insert own KPI history" ON "public"."kpi_history" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can insert own preferences" ON "public"."notification_preferences" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own annual snapshots" ON "public"."annual_snapshots" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own initiatives" ON "public"."strategic_initiatives_backup" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own kpi actuals" ON "public"."kpi_actuals" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own life goals" ON "public"."life_goals" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own quarterly snapshots" ON "public"."quarterly_snapshots" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own sprint actions" ON "public"."sprint_actions" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own sprint actions" ON "public"."sprint_key_actions" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own strategic plans" ON "public"."strategic_plans" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own success disciplines" ON "public"."success_disciplines" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can manage monthly_reviews for their businesses" ON "public"."monthly_reviews" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))
UNION
 SELECT "business_members"."business_id"
   FROM "public"."business_members"
  WHERE ("business_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can manage strategic_todos for their businesses" ON "public"."strategic_todos" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))
UNION
 SELECT "business_members"."business_id"
   FROM "public"."business_members"
  WHERE ("business_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can manage weekly_checkins for their businesses" ON "public"."weekly_checkins" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))
UNION
 SELECT "business_members"."business_id"
   FROM "public"."business_members"
  WHERE ("business_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can read approved custom KPIs or their own" ON "public"."custom_kpis_library" FOR SELECT USING ((("status" = 'approved'::"text") OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR ("business_id" IN ( SELECT "business_profiles"."id"
   FROM "public"."business_profiles"
  WHERE ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can send chat messages" ON "public"."chat_messages" FOR INSERT WITH CHECK ((("business_id" IN ( SELECT "user_roles"."business_id"
   FROM "public"."user_roles"
  WHERE ("user_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) AND ("sender_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users can update ninety day sprints" ON "public"."ninety_day_sprints" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."business_profiles"
  WHERE (("business_profiles"."id" = "ninety_day_sprints"."business_profile_id") AND ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can update own preferences" ON "public"."notification_preferences" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update quarterly plans" ON "public"."quarterly_plans" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."business_profiles"
  WHERE (("business_profiles"."id" = "quarterly_plans"."business_profile_id") AND ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can update sprint milestones" ON "public"."sprint_milestones" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."ninety_day_sprints"
     JOIN "public"."business_profiles" ON (("business_profiles"."id" = "ninety_day_sprints"."business_profile_id")))
  WHERE (("ninety_day_sprints"."id" = "sprint_milestones"."sprint_id") AND ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can update their own annual snapshots" ON "public"."annual_snapshots" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own initiatives" ON "public"."strategic_initiatives_backup" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own kpi actuals" ON "public"."kpi_actuals" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own life goals" ON "public"."life_goals" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own quarterly snapshots" ON "public"."quarterly_snapshots" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own sprint actions" ON "public"."sprint_actions" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own sprint actions" ON "public"."sprint_key_actions" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own strategic plans" ON "public"."strategic_plans" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own success disciplines" ON "public"."success_disciplines" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own tasks" ON "public"."daily_tasks" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view chat messages" ON "public"."chat_messages" FOR SELECT USING (("business_id" IN ( SELECT "user_roles"."business_id"
   FROM "public"."user_roles"
  WHERE ("user_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can view ninety day sprints" ON "public"."ninety_day_sprints" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."business_profiles"
  WHERE (("business_profiles"."id" = "ninety_day_sprints"."business_profile_id") AND ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can view own KPI history" ON "public"."kpi_history" FOR SELECT USING (true);



CREATE POLICY "Users can view own activity" ON "public"."activity_log" FOR SELECT USING (true);



CREATE POLICY "Users can view own business actuals" ON "public"."monthly_actuals" USING (("business_id" IN ( SELECT "profiles"."business_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can view own business forecasts" ON "public"."forecasts" USING (("business_id" IN ( SELECT "profiles"."business_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can view own forecast values" ON "public"."forecast_values" USING (("forecast_id" IN ( SELECT "forecasts"."id"
   FROM "public"."forecasts"
  WHERE ("forecasts"."business_id" IN ( SELECT "profiles"."business_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Users can view own preferences" ON "public"."notification_preferences" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view quarterly plans" ON "public"."quarterly_plans" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."business_profiles"
  WHERE (("business_profiles"."id" = "quarterly_plans"."business_profile_id") AND ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can view sprint milestones" ON "public"."sprint_milestones" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."ninety_day_sprints"
     JOIN "public"."business_profiles" ON (("business_profiles"."id" = "ninety_day_sprints"."business_profile_id")))
  WHERE (("ninety_day_sprints"."id" = "sprint_milestones"."sprint_id") AND ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can view their business onboarding" ON "public"."onboarding_progress" FOR SELECT USING (("business_id" IN ( SELECT "user_roles"."business_id"
   FROM "public"."user_roles"
  WHERE ("user_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can view their own annual snapshots" ON "public"."annual_snapshots" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own initiatives" ON "public"."strategic_initiatives_backup" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own kpi actuals" ON "public"."kpi_actuals" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own life goals" ON "public"."life_goals" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own quarterly snapshots" ON "public"."quarterly_snapshots" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own sprint actions" ON "public"."sprint_actions" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own sprint actions" ON "public"."sprint_key_actions" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own strategic plans" ON "public"."strategic_plans" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own success disciplines" ON "public"."success_disciplines" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own tasks" ON "public"."daily_tasks" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users delete own processes" ON "public"."process_diagrams" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users delete steps" ON "public"."process_steps" FOR DELETE USING (("process_id" IN ( SELECT "process_diagrams"."id"
   FROM "public"."process_diagrams"
  WHERE ("process_diagrams"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users insert connections" ON "public"."process_connections" FOR INSERT WITH CHECK (("process_id" IN ( SELECT "process_diagrams"."id"
   FROM "public"."process_diagrams"
  WHERE ("process_diagrams"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users insert own processes" ON "public"."process_diagrams" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users insert steps" ON "public"."process_steps" FOR INSERT WITH CHECK (("process_id" IN ( SELECT "process_diagrams"."id"
   FROM "public"."process_diagrams"
  WHERE ("process_diagrams"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users insert versions" ON "public"."process_versions" FOR INSERT WITH CHECK (("process_id" IN ( SELECT "process_diagrams"."id"
   FROM "public"."process_diagrams"
  WHERE ("process_diagrams"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users see connections" ON "public"."process_connections" FOR SELECT USING (("process_id" IN ( SELECT "process_diagrams"."id"
   FROM "public"."process_diagrams"
  WHERE ("process_diagrams"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users see own processes" ON "public"."process_diagrams" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users see steps" ON "public"."process_steps" FOR SELECT USING (("process_id" IN ( SELECT "process_diagrams"."id"
   FROM "public"."process_diagrams"
  WHERE ("process_diagrams"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users see versions" ON "public"."process_versions" FOR SELECT USING (("process_id" IN ( SELECT "process_diagrams"."id"
   FROM "public"."process_diagrams"
  WHERE ("process_diagrams"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users update own processes" ON "public"."process_diagrams" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users update steps" ON "public"."process_steps" FOR UPDATE USING (("process_id" IN ( SELECT "process_diagrams"."id"
   FROM "public"."process_diagrams"
  WHERE ("process_diagrams"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."action_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "action_items_delete" ON "public"."action_items" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "action_items_insert" ON "public"."action_items" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "action_items_select" ON "public"."action_items" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "action_items_update" ON "public"."action_items" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_cfo_conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_cfo_conversations_delete" ON "public"."ai_cfo_conversations" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "ai_cfo_conversations_insert" ON "public"."ai_cfo_conversations" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "ai_cfo_conversations_select" ON "public"."ai_cfo_conversations" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "ai_cfo_conversations_update" ON "public"."ai_cfo_conversations" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."ai_interactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_interactions_insert" ON "public"."ai_interactions" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = ANY (ARRAY['super_admin'::"text", 'coach'::"text"])))))));



CREATE POLICY "ai_interactions_select_own" ON "public"."ai_interactions" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "ai_interactions"."business_id") AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text"))))));



CREATE POLICY "ai_interactions_update" ON "public"."ai_interactions" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "ai_interactions"."business_id") AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text"))))));



ALTER TABLE "public"."annual_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "annual_plans_delete_consolidated" ON "public"."annual_plans" FOR DELETE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR ("user_id" IN ( SELECT "businesses"."owner_id"
   FROM "public"."businesses"
  WHERE ("businesses"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text"))))));



CREATE POLICY "annual_plans_insert_final" ON "public"."annual_plans" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text"))))));



CREATE POLICY "annual_plans_select_consolidated" ON "public"."annual_plans" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR ("user_id" IN ( SELECT "businesses"."owner_id"
   FROM "public"."businesses"
  WHERE ("businesses"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text"))))));



CREATE POLICY "annual_plans_update_consolidated" ON "public"."annual_plans" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR ("user_id" IN ( SELECT "businesses"."owner_id"
   FROM "public"."businesses"
  WHERE ("businesses"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text"))))));



ALTER TABLE "public"."annual_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."annual_targets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "annual_targets_delete" ON "public"."annual_targets" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "annual_targets_insert" ON "public"."annual_targets" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "annual_targets_select" ON "public"."annual_targets" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "annual_targets_update" ON "public"."annual_targets" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."assessments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assessments_backup" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assessments_coach_delete" ON "public"."assessments" FOR DELETE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text")))) OR ("user_id" IN ( SELECT "b"."owner_id"
   FROM "public"."businesses" "b"
  WHERE ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "assessments_insert_final" ON "public"."assessments" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text"))))));



CREATE POLICY "assessments_select_consolidated" ON "public"."assessments" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("b"."owner_id" = "assessments"."user_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text"))))));



CREATE POLICY "assessments_update_consolidated" ON "public"."assessments" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text")))) OR ("user_id" IN ( SELECT "b"."owner_id"
   FROM "public"."businesses" "b"
  WHERE ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_delete" ON "public"."audit_log" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "audit_log_insert" ON "public"."audit_log" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "audit_log_select" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "audit_log_update" ON "public"."audit_log" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "authenticated_access_user_businesses" ON "public"."user_businesses" USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



ALTER TABLE "public"."business_contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_contacts_all_final" ON "public"."business_contacts" TO "authenticated" USING (((("business_id")::"text" IN ( SELECT ("bm"."business_id")::"text" AS "business_id"
   FROM "public"."business_members" "bm"
  WHERE ("bm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("business_id")::"text" IN ( SELECT ("b"."id")::"text" AS "id"
   FROM "public"."businesses" "b"
  WHERE ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text")))))) WITH CHECK (((("business_id")::"text" IN ( SELECT ("bm"."business_id")::"text" AS "business_id"
   FROM "public"."business_members" "bm"
  WHERE ("bm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("business_id")::"text" IN ( SELECT ("b"."id")::"text" AS "id"
   FROM "public"."businesses" "b"
  WHERE ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text"))))));



ALTER TABLE "public"."business_financial_goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_financial_goals_delete" ON "public"."business_financial_goals" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses_text"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "business_financial_goals_insert" ON "public"."business_financial_goals" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses_text"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "business_financial_goals_select" ON "public"."business_financial_goals" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses_text"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "business_financial_goals_update" ON "public"."business_financial_goals" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses_text"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses_text"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."business_kpis" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_kpis_delete" ON "public"."business_kpis" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses_text"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "business_kpis_insert" ON "public"."business_kpis" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses_text"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "business_kpis_select" ON "public"."business_kpis" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses_text"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "business_kpis_update" ON "public"."business_kpis" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses_text"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses_text"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."business_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_members_all_final" ON "public"."business_members" TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("business_id")::"text" IN ( SELECT ("b"."id")::"text" AS "id"
   FROM "public"."businesses" "b"
  WHERE ("b"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("business_id")::"text" IN ( SELECT ("b"."id")::"text" AS "id"
   FROM "public"."businesses" "b"
  WHERE ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text")))))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("business_id")::"text" IN ( SELECT ("b"."id")::"text" AS "id"
   FROM "public"."businesses" "b"
  WHERE ("b"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("business_id")::"text" IN ( SELECT ("b"."id")::"text" AS "id"
   FROM "public"."businesses" "b"
  WHERE ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text"))))));



ALTER TABLE "public"."business_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_profiles_delete" ON "public"."business_profiles" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "business_profiles_insert" ON "public"."business_profiles" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "business_profiles_select" ON "public"."business_profiles" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "business_profiles_update" ON "public"."business_profiles" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."business_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_users_access_policy" ON "public"."business_users" USING ((("user_id" = "auth"."uid"()) OR "public"."has_direct_business_access"("auth"."uid"(), "business_id") OR "public"."is_super_admin"("auth"."uid"()))) WITH CHECK (("public"."has_direct_business_access"("auth"."uid"(), "business_id") OR "public"."is_super_admin"("auth"."uid"())));



ALTER TABLE "public"."businesses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "businesses_access_policy" ON "public"."businesses" USING ((("owner_id" = "auth"."uid"()) OR ("assigned_coach_id" = "auth"."uid"()) OR "public"."is_business_team_member"("auth"."uid"(), "id") OR "public"."is_super_admin"("auth"."uid"()))) WITH CHECK ((("owner_id" = "auth"."uid"()) OR ("assigned_coach_id" = "auth"."uid"()) OR "public"."is_super_admin"("auth"."uid"())));



ALTER TABLE "public"."category_suggestions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "category_suggestions_all_final" ON "public"."category_suggestions" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_benchmarks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_benchmarks_delete" ON "public"."coach_benchmarks" FOR DELETE USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text"))))));



CREATE POLICY "coach_benchmarks_insert" ON "public"."coach_benchmarks" FOR INSERT WITH CHECK ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text"))))));



CREATE POLICY "coach_benchmarks_select" ON "public"."coach_benchmarks" FOR SELECT USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text"))))));



CREATE POLICY "coach_benchmarks_update" ON "public"."coach_benchmarks" FOR UPDATE USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text"))))));



ALTER TABLE "public"."coach_suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coaching_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coaching_sessions_delete" ON "public"."coaching_sessions" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "coaching_sessions_insert" ON "public"."coaching_sessions" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "coaching_sessions_select" ON "public"."coaching_sessions" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "coaching_sessions_update" ON "public"."coaching_sessions" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."conversation_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."custom_kpis_library" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "custom_kpis_library_update_consolidated" ON "public"."custom_kpis_library" FOR UPDATE TO "authenticated" USING (((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pending'::"text")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'admin'::"text")))))) WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pending'::"text")));



ALTER TABLE "public"."daily_musts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_musts_all_final" ON "public"."daily_musts" TO "authenticated" USING (((("business_id")::"text" IN ( SELECT ("bm"."business_id")::"text" AS "business_id"
   FROM "public"."business_members" "bm"
  WHERE ("bm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("business_id")::"text" IN ( SELECT ("b"."id")::"text" AS "id"
   FROM "public"."businesses" "b"
  WHERE ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text")))))) WITH CHECK (((("business_id")::"text" IN ( SELECT ("bm"."business_id")::"text" AS "business_id"
   FROM "public"."business_members" "bm"
  WHERE ("bm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("business_id")::"text" IN ( SELECT ("b"."id")::"text" AS "id"
   FROM "public"."businesses" "b"
  WHERE ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text"))))));



ALTER TABLE "public"."daily_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dashboard_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dashboard_preferences_all_final" ON "public"."dashboard_preferences" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "delete_session_actions" ON "public"."session_actions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "session_actions"."business_id") AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "delete_session_attendees" ON "public"."session_attendees" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM ("public"."session_notes" "sn"
     JOIN "public"."businesses" "b" ON (("b"."id" = "sn"."business_id")))
  WHERE (("sn"."id" = "session_attendees"."session_note_id") AND (("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("sn"."coach_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (EXISTS ( SELECT 1
   FROM ("public"."session_notes" "sn"
     JOIN "public"."businesses" "b" ON (("b"."id" = "sn"."business_id")))
  WHERE (("sn"."id" = "session_attendees"."session_note_id") AND ("b"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."financial_forecasts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "financial_forecasts_delete" ON "public"."financial_forecasts" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "financial_forecasts_insert" ON "public"."financial_forecasts" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "financial_forecasts_select" ON "public"."financial_forecasts" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "financial_forecasts_update" ON "public"."financial_forecasts" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."financial_metrics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "financial_metrics_delete" ON "public"."financial_metrics" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "financial_metrics_insert" ON "public"."financial_metrics" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "financial_metrics_select" ON "public"."financial_metrics" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "financial_metrics_update" ON "public"."financial_metrics" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."financial_targets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forecast_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "forecast_audit_log_select_consolidated" ON "public"."forecast_audit_log" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."financial_forecasts" "f"
     JOIN "public"."business_profiles" "bp" ON (("f"."business_id" = "bp"."id")))
  WHERE (("f"."id" = "forecast_audit_log"."forecast_id") AND ("bp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'super_admin'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."financial_forecasts"
  WHERE (("financial_forecasts"."id" = "forecast_audit_log"."forecast_id") AND ("financial_forecasts"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."forecast_decisions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "forecast_decisions_delete" ON "public"."forecast_decisions" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "forecast_decisions_insert" ON "public"."forecast_decisions" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "forecast_decisions_select" ON "public"."forecast_decisions" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "forecast_decisions_update" ON "public"."forecast_decisions" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."forecast_employees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "forecast_employees_access" ON "public"."forecast_employees" TO "authenticated" USING ((("forecast_id" IN ( SELECT "financial_forecasts"."id"
   FROM "public"."financial_forecasts"
  WHERE ("financial_forecasts"."business_id" = ANY ("public"."rls_user_all_businesses"())))) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("forecast_id" IN ( SELECT "financial_forecasts"."id"
   FROM "public"."financial_forecasts"
  WHERE ("financial_forecasts"."business_id" = ANY ("public"."rls_user_all_businesses"())))) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."forecast_insights" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "forecast_insights_delete" ON "public"."forecast_insights" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "forecast_insights_insert" ON "public"."forecast_insights" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "forecast_insights_select" ON "public"."forecast_insights" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "forecast_insights_update" ON "public"."forecast_insights" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."forecast_investments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "forecast_investments_delete" ON "public"."forecast_investments" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "forecast_investments_insert" ON "public"."forecast_investments" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "forecast_investments_select" ON "public"."forecast_investments" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "forecast_investments_update" ON "public"."forecast_investments" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."forecast_payroll_summary" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "forecast_payroll_summary_access" ON "public"."forecast_payroll_summary" TO "authenticated" USING ((("forecast_id" IN ( SELECT "financial_forecasts"."id"
   FROM "public"."financial_forecasts"
  WHERE ("financial_forecasts"."business_id" = ANY ("public"."rls_user_all_businesses"())))) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("forecast_id" IN ( SELECT "financial_forecasts"."id"
   FROM "public"."financial_forecasts"
  WHERE ("financial_forecasts"."business_id" = ANY ("public"."rls_user_all_businesses"())))) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."forecast_pl_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "forecast_pl_lines_access" ON "public"."forecast_pl_lines" TO "authenticated" USING ((("forecast_id" IN ( SELECT "financial_forecasts"."id"
   FROM "public"."financial_forecasts"
  WHERE ("financial_forecasts"."business_id" = ANY ("public"."rls_user_all_businesses"())))) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("forecast_id" IN ( SELECT "financial_forecasts"."id"
   FROM "public"."financial_forecasts"
  WHERE ("financial_forecasts"."business_id" = ANY ("public"."rls_user_all_businesses"())))) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."forecast_scenario_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forecast_scenarios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "forecast_scenarios_delete_policy" ON "public"."forecast_scenarios" FOR DELETE USING ((("base_forecast_id" IN ( SELECT "ff"."id"
   FROM ("public"."financial_forecasts" "ff"
     JOIN "public"."businesses" "b" ON (("b"."id" = "ff"."business_id")))
  WHERE (("b"."owner_id" = "auth"."uid"()) OR ("b"."assigned_coach_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = "auth"."uid"()) AND ("system_roles"."role" = 'super_admin'::"text"))))));



CREATE POLICY "forecast_scenarios_insert_policy" ON "public"."forecast_scenarios" FOR INSERT WITH CHECK ((("base_forecast_id" IN ( SELECT "ff"."id"
   FROM ("public"."financial_forecasts" "ff"
     JOIN "public"."businesses" "b" ON (("b"."id" = "ff"."business_id")))
  WHERE (("b"."owner_id" = "auth"."uid"()) OR ("b"."assigned_coach_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = "auth"."uid"()) AND ("system_roles"."role" = 'super_admin'::"text"))))));



CREATE POLICY "forecast_scenarios_select_policy" ON "public"."forecast_scenarios" FOR SELECT USING ((("base_forecast_id" IN ( SELECT "ff"."id"
   FROM ("public"."financial_forecasts" "ff"
     JOIN "public"."businesses" "b" ON (("b"."id" = "ff"."business_id")))
  WHERE (("b"."owner_id" = "auth"."uid"()) OR ("b"."assigned_coach_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = "auth"."uid"()) AND ("system_roles"."role" = 'super_admin'::"text"))))));



CREATE POLICY "forecast_scenarios_update_policy" ON "public"."forecast_scenarios" FOR UPDATE USING ((("base_forecast_id" IN ( SELECT "ff"."id"
   FROM ("public"."financial_forecasts" "ff"
     JOIN "public"."businesses" "b" ON (("b"."id" = "ff"."business_id")))
  WHERE (("b"."owner_id" = "auth"."uid"()) OR ("b"."assigned_coach_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = "auth"."uid"()) AND ("system_roles"."role" = 'super_admin'::"text"))))));



ALTER TABLE "public"."forecast_values" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forecast_wizard_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "forecast_wizard_sessions_delete" ON "public"."forecast_wizard_sessions" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "forecast_wizard_sessions_insert" ON "public"."forecast_wizard_sessions" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "forecast_wizard_sessions_select" ON "public"."forecast_wizard_sessions" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "forecast_wizard_sessions_update" ON "public"."forecast_wizard_sessions" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."forecast_years" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "forecast_years_delete" ON "public"."forecast_years" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "forecast_years_insert" ON "public"."forecast_years" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "forecast_years_select" ON "public"."forecast_years" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "forecast_years_update" ON "public"."forecast_years" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."forecasts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goals_delete" ON "public"."goals" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "goals_insert" ON "public"."goals" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "goals_select" ON "public"."goals" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "goals_update" ON "public"."goals" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."ideas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ideas_delete_consolidated" ON "public"."ideas" FOR DELETE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text")))) OR ("user_id" IN ( SELECT "b"."owner_id"
   FROM "public"."businesses" "b"
  WHERE ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."owner_id" = "ideas"."user_id") AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."ideas_filter" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ideas_filter_all_final" ON "public"."ideas_filter" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "ideas_insert_final" ON "public"."ideas" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text"))))));



CREATE POLICY "ideas_select_consolidated" ON "public"."ideas" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text")))) OR ("user_id" IN ( SELECT "b"."owner_id"
   FROM "public"."businesses" "b"
  WHERE ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM ("public"."businesses" "b"
     JOIN "public"."profiles" "p" ON (("p"."business_id" = "b"."id")))
  WHERE (("p"."id" = "ideas"."user_id") AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "ideas_update_consolidated" ON "public"."ideas" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text")))) OR ("user_id" IN ( SELECT "b"."owner_id"
   FROM "public"."businesses" "b"
  WHERE ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."owner_id" = "ideas"."user_id") AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "insert_session_actions" ON "public"."session_actions" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "session_actions"."business_id") AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "session_actions"."business_id") AND ("b"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."business_users" "bu"
  WHERE (("bu"."business_id" = "session_actions"."business_id") AND ("bu"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "insert_session_attendees" ON "public"."session_attendees" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."session_notes" "sn"
     JOIN "public"."businesses" "b" ON (("b"."id" = "sn"."business_id")))
  WHERE (("sn"."id" = "session_attendees"."session_note_id") AND (("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("sn"."coach_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (EXISTS ( SELECT 1
   FROM ("public"."session_notes" "sn"
     JOIN "public"."businesses" "b" ON (("b"."id" = "sn"."business_id")))
  WHERE (("sn"."id" = "session_attendees"."session_note_id") AND ("b"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM ("public"."session_notes" "sn"
     JOIN "public"."business_users" "bu" ON (("bu"."business_id" = "sn"."business_id")))
  WHERE (("sn"."id" = "session_attendees"."session_note_id") AND ("bu"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



ALTER TABLE "public"."issues_list" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "issues_list_delete" ON "public"."issues_list" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "issues_list_insert" ON "public"."issues_list" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "issues_list_select" ON "public"."issues_list" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "issues_list_update" ON "public"."issues_list" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."kpi_actuals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kpi_alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kpi_alerts_all_final" ON "public"."kpi_alerts" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."kpi_benchmarks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kpi_benchmarks_select_consolidated" ON "public"."kpi_benchmarks" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."kpi_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kpi_definitions_backup" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kpi_definitions_select_consolidated" ON "public"."kpi_definitions" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."kpi_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kpi_tracking_values" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kpi_tracking_values_own_data" ON "public"."kpi_tracking_values" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."kpi_values" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kpi_values_all_final" ON "public"."kpi_values" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."kpis" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kpis_delete_consolidated" ON "public"."kpis" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."business_profiles" "bp"
     JOIN "public"."businesses" "b" ON (("b"."id" = "bp"."business_id")))
  WHERE (("bp"."id" = "kpis"."business_profile_id") AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."business_profiles"
  WHERE (("business_profiles"."id" = "kpis"."business_profile_id") AND ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR ("business_profile_id" IN ( SELECT "business_profiles"."id"
   FROM "public"."business_profiles"
  WHERE ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "kpis_insert_final" ON "public"."kpis" FOR INSERT TO "authenticated" WITH CHECK (((("business_profile_id")::"text" IN ( SELECT ("bp"."id")::"text" AS "id"
   FROM "public"."business_profiles" "bp"
  WHERE ("bp"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("business_profile_id")::"text" IN ( SELECT ("bp"."id")::"text" AS "id"
   FROM ("public"."business_profiles" "bp"
     JOIN "public"."business_members" "bm" ON ((("bm"."business_id")::"text" = ("bp"."business_id")::"text")))
  WHERE ("bm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("business_profile_id")::"text" IN ( SELECT ("bp"."id")::"text" AS "id"
   FROM ("public"."business_profiles" "bp"
     JOIN "public"."businesses" "b" ON ((("b"."id")::"text" = ("bp"."business_id")::"text")))
  WHERE ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text"))))));



CREATE POLICY "kpis_select_consolidated" ON "public"."kpis" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."business_profiles" "bp"
     JOIN "public"."businesses" "b" ON (("b"."id" = "bp"."business_id")))
  WHERE (("bp"."id" = "kpis"."business_profile_id") AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."business_profiles"
  WHERE (("business_profiles"."id" = "kpis"."business_profile_id") AND ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text")))) OR ("business_profile_id" IN ( SELECT "business_profiles"."id"
   FROM "public"."business_profiles"
  WHERE ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "kpis_update_consolidated" ON "public"."kpis" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."business_profiles" "bp"
     JOIN "public"."businesses" "b" ON (("b"."id" = "bp"."business_id")))
  WHERE (("bp"."id" = "kpis"."business_profile_id") AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."business_profiles"
  WHERE (("business_profiles"."id" = "kpis"."business_profile_id") AND ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR ("business_profile_id" IN ( SELECT "business_profiles"."id"
   FROM "public"."business_profiles"
  WHERE ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."life_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_data" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "marketing_data_delete" ON "public"."marketing_data" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "marketing_data_insert" ON "public"."marketing_data" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "marketing_data_select" ON "public"."marketing_data" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "marketing_data_update" ON "public"."marketing_data" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_delete" ON "public"."messages" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "messages_insert" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "messages_select" ON "public"."messages" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "messages_update" ON "public"."messages" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."monthly_actuals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."monthly_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ninety_day_sprints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete" ON "public"."notifications" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "notifications_insert" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "notifications_select" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "notifications_update" ON "public"."notifications" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."onboarding_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."open_loops" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "open_loops_delete" ON "public"."open_loops" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "open_loops_insert" ON "public"."open_loops" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "open_loops_select" ON "public"."open_loops" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "open_loops_update" ON "public"."open_loops" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."operational_activities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "operational_activities_delete" ON "public"."operational_activities" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "operational_activities_insert" ON "public"."operational_activities" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "operational_activities_select" ON "public"."operational_activities" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "operational_activities_update" ON "public"."operational_activities" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."password_reset_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."process_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."process_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."process_decisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."process_diagrams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."process_flows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."process_phases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."process_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."process_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_all_final" ON "public"."profiles" TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR (("business_id")::"text" IN ( SELECT ("bm"."business_id")::"text" AS "business_id"
   FROM "public"."business_members" "bm"
  WHERE ("bm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text")))))) WITH CHECK ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR (("business_id")::"text" IN ( SELECT ("bm"."business_id")::"text" AS "business_id"
   FROM "public"."business_members" "bm"
  WHERE ("bm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text"))))));



ALTER TABLE "public"."quarterly_forecasts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quarterly_forecasts_all_final" ON "public"."quarterly_forecasts" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."quarterly_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quarterly_priorities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quarterly_priorities_all_final" ON "public"."quarterly_priorities" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."quarterly_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quarterly_reviews_delete" ON "public"."quarterly_reviews" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "quarterly_reviews_insert" ON "public"."quarterly_reviews" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "quarterly_reviews_select" ON "public"."quarterly_reviews" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "quarterly_reviews_update" ON "public"."quarterly_reviews" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."quarterly_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roadmap_completions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roadmap_completions_all_final" ON "public"."roadmap_completions" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."roadmap_progress" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roadmap_progress_delete_consolidated" ON "public"."roadmap_progress" FOR DELETE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."owner_id" = "roadmap_progress"."user_id") AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "roadmap_progress_insert_final" ON "public"."roadmap_progress" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text"))))));



CREATE POLICY "roadmap_progress_select_consolidated" ON "public"."roadmap_progress" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("b"."owner_id" = "roadmap_progress"."user_id"))))));



CREATE POLICY "roadmap_progress_update_consolidated" ON "public"."roadmap_progress" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."owner_id" = "roadmap_progress"."user_id") AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "select_session_attendees" ON "public"."session_attendees" FOR SELECT USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM ("public"."session_notes" "sn"
     JOIN "public"."businesses" "b" ON (("b"."id" = "sn"."business_id")))
  WHERE (("sn"."id" = "session_attendees"."session_note_id") AND (("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("sn"."coach_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (EXISTS ( SELECT 1
   FROM ("public"."session_notes" "sn"
     JOIN "public"."businesses" "b" ON (("b"."id" = "sn"."business_id")))
  WHERE (("sn"."id" = "session_attendees"."session_note_id") AND ("b"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."session_notes" "sn"
     JOIN "public"."business_users" "bu" ON (("bu"."business_id" = "sn"."business_id")))
  WHERE (("sn"."id" = "session_attendees"."session_note_id") AND ("bu"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."session_actions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session_actions_select_consolidated" ON "public"."session_actions" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "session_actions"."business_id") AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "session_actions"."business_id") AND ("b"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."business_users" "bu"
  WHERE (("bu"."business_id" = "session_actions"."business_id") AND ("bu"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."session_attendees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session_notes_delete" ON "public"."session_notes" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "session_notes_insert" ON "public"."session_notes" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "session_notes_select" ON "public"."session_notes" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "session_notes_update" ON "public"."session_notes" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."session_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session_templates_access" ON "public"."session_templates" TO "authenticated" USING ((("coach_id" = "auth"."uid"()) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("coach_id" = "auth"."uid"()) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sessions_delete" ON "public"."sessions" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "sessions_insert" ON "public"."sessions" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "sessions_select" ON "public"."sessions" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "sessions_update" ON "public"."sessions" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."shared_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sprint_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sprint_key_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sprint_milestones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stage_transitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stage_transitions_delete" ON "public"."stage_transitions" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "stage_transitions_insert" ON "public"."stage_transitions" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "stage_transitions_select" ON "public"."stage_transitions" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "stage_transitions_update" ON "public"."stage_transitions" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."stop_doing_activities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stop_doing_activities_delete" ON "public"."stop_doing_activities" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "stop_doing_activities_insert" ON "public"."stop_doing_activities" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "stop_doing_activities_select" ON "public"."stop_doing_activities" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "stop_doing_activities_update" ON "public"."stop_doing_activities" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."stop_doing_hourly_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stop_doing_hourly_rates_delete" ON "public"."stop_doing_hourly_rates" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "stop_doing_hourly_rates_insert" ON "public"."stop_doing_hourly_rates" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "stop_doing_hourly_rates_select" ON "public"."stop_doing_hourly_rates" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "stop_doing_hourly_rates_update" ON "public"."stop_doing_hourly_rates" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."stop_doing_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stop_doing_items_delete" ON "public"."stop_doing_items" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "stop_doing_items_insert" ON "public"."stop_doing_items" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "stop_doing_items_select" ON "public"."stop_doing_items" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "stop_doing_items_update" ON "public"."stop_doing_items" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."stop_doing_time_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stop_doing_time_logs_delete" ON "public"."stop_doing_time_logs" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "stop_doing_time_logs_insert" ON "public"."stop_doing_time_logs" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "stop_doing_time_logs_select" ON "public"."stop_doing_time_logs" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "stop_doing_time_logs_update" ON "public"."stop_doing_time_logs" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."strategic_goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "strategic_goals_delete_consolidated" ON "public"."strategic_goals" FOR DELETE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR ("user_id" IN ( SELECT "businesses"."owner_id"
   FROM "public"."businesses"
  WHERE ("businesses"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text")))) OR ("business_profile_id" IN ( SELECT "business_profiles"."id"
   FROM "public"."business_profiles"
  WHERE ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "strategic_goals_insert_final" ON "public"."strategic_goals" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("business_profile_id")::"text" IN ( SELECT ("bp"."id")::"text" AS "id"
   FROM "public"."business_profiles" "bp"
  WHERE ("bp"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("business_profile_id")::"text" IN ( SELECT ("bp"."id")::"text" AS "id"
   FROM ("public"."business_profiles" "bp"
     JOIN "public"."businesses" "b" ON ((("b"."id")::"text" = ("bp"."business_id")::"text")))
  WHERE ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text"))))));



CREATE POLICY "strategic_goals_select_consolidated" ON "public"."strategic_goals" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR ("user_id" IN ( SELECT "businesses"."owner_id"
   FROM "public"."businesses"
  WHERE ("businesses"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text")))) OR ("business_profile_id" IN ( SELECT "business_profiles"."id"
   FROM "public"."business_profiles"
  WHERE ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "strategic_goals_update_consolidated" ON "public"."strategic_goals" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR ("user_id" IN ( SELECT "businesses"."owner_id"
   FROM "public"."businesses"
  WHERE ("businesses"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text")))) OR ("business_profile_id" IN ( SELECT "business_profiles"."id"
   FROM "public"."business_profiles"
  WHERE ("business_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."strategic_initiatives" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."strategic_initiatives_backup" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "strategic_initiatives_delete" ON "public"."strategic_initiatives" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "strategic_initiatives_insert" ON "public"."strategic_initiatives" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "strategic_initiatives_select" ON "public"."strategic_initiatives" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "strategic_initiatives_update" ON "public"."strategic_initiatives" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."strategic_kpis" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "strategic_kpis_all_final" ON "public"."strategic_kpis" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."strategic_kpis_backup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."strategic_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."strategic_todos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."strategic_wheels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."strategy_data" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "strategy_data_delete" ON "public"."strategy_data" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "strategy_data_insert" ON "public"."strategy_data" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "strategy_data_select" ON "public"."strategy_data" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "strategy_data_update" ON "public"."strategy_data" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."subscription_audit_results" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subscription_audit_results_delete" ON "public"."subscription_audit_results" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "subscription_audit_results_insert" ON "public"."subscription_audit_results" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "subscription_audit_results_select" ON "public"."subscription_audit_results" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "subscription_audit_results_update" ON "public"."subscription_audit_results" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."subscription_budgets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subscription_budgets_delete" ON "public"."subscription_budgets" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "subscription_budgets_insert" ON "public"."subscription_budgets" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "subscription_budgets_select" ON "public"."subscription_budgets" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "subscription_budgets_update" ON "public"."subscription_budgets" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."success_disciplines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."swot_action_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "swot_action_items_all_final" ON "public"."swot_action_items" TO "authenticated" USING ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR (("swot_analysis_id")::"text" IN ( SELECT ("sa"."id")::"text" AS "id"
   FROM "public"."swot_analyses" "sa"
  WHERE ("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("swot_analysis_id")::"text" IN ( SELECT ("sa"."id")::"text" AS "id"
   FROM ("public"."swot_analyses" "sa"
     JOIN "public"."business_members" "bm" ON (("bm"."business_id" = "sa"."business_id")))
  WHERE ("bm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("swot_analysis_id")::"text" IN ( SELECT ("sa"."id")::"text" AS "id"
   FROM ("public"."swot_analyses" "sa"
     JOIN "public"."businesses" "b" ON (("b"."id" = "sa"."business_id")))
  WHERE ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text")))))) WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR (("swot_analysis_id")::"text" IN ( SELECT ("sa"."id")::"text" AS "id"
   FROM "public"."swot_analyses" "sa"
  WHERE ("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("swot_analysis_id")::"text" IN ( SELECT ("sa"."id")::"text" AS "id"
   FROM ("public"."swot_analyses" "sa"
     JOIN "public"."business_members" "bm" ON (("bm"."business_id" = "sa"."business_id")))
  WHERE ("bm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("swot_analysis_id")::"text" IN ( SELECT ("sa"."id")::"text" AS "id"
   FROM ("public"."swot_analyses" "sa"
     JOIN "public"."businesses" "b" ON (("b"."id" = "sa"."business_id")))
  WHERE ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text"))))));



ALTER TABLE "public"."swot_analyses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "swot_analyses_delete" ON "public"."swot_analyses" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "swot_analyses_insert" ON "public"."swot_analyses" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "swot_analyses_select" ON "public"."swot_analyses" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "swot_analyses_update" ON "public"."swot_analyses" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."swot_collaborators" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "swot_collaborators_all_final" ON "public"."swot_collaborators" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."swot_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "swot_comments_all_final" ON "public"."swot_comments" TO "authenticated" USING ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR (("swot_item_id")::"text" IN ( SELECT ("si"."id")::"text" AS "id"
   FROM ("public"."swot_items" "si"
     JOIN "public"."swot_analyses" "sa" ON (("sa"."id" = "si"."swot_analysis_id")))
  WHERE ("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("swot_item_id")::"text" IN ( SELECT ("si"."id")::"text" AS "id"
   FROM (("public"."swot_items" "si"
     JOIN "public"."swot_analyses" "sa" ON (("sa"."id" = "si"."swot_analysis_id")))
     JOIN "public"."business_members" "bm" ON (("bm"."business_id" = "sa"."business_id")))
  WHERE ("bm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text")))))) WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR (("swot_item_id")::"text" IN ( SELECT ("si"."id")::"text" AS "id"
   FROM ("public"."swot_items" "si"
     JOIN "public"."swot_analyses" "sa" ON (("sa"."id" = "si"."swot_analysis_id")))
  WHERE ("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("swot_item_id")::"text" IN ( SELECT ("si"."id")::"text" AS "id"
   FROM (("public"."swot_items" "si"
     JOIN "public"."swot_analyses" "sa" ON (("sa"."id" = "si"."swot_analysis_id")))
     JOIN "public"."business_members" "bm" ON (("bm"."business_id" = "sa"."business_id")))
  WHERE ("bm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text"))))));



ALTER TABLE "public"."swot_comparisons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "swot_comparisons_all_final" ON "public"."swot_comparisons" TO "authenticated" USING ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR (("from_analysis_id")::"text" IN ( SELECT ("sa"."id")::"text" AS "id"
   FROM "public"."swot_analyses" "sa"
  WHERE ("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("from_analysis_id")::"text" IN ( SELECT ("sa"."id")::"text" AS "id"
   FROM ("public"."swot_analyses" "sa"
     JOIN "public"."business_members" "bm" ON (("bm"."business_id" = "sa"."business_id")))
  WHERE ("bm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text")))))) WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR (("from_analysis_id")::"text" IN ( SELECT ("sa"."id")::"text" AS "id"
   FROM "public"."swot_analyses" "sa"
  WHERE ("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("from_analysis_id")::"text" IN ( SELECT ("sa"."id")::"text" AS "id"
   FROM ("public"."swot_analyses" "sa"
     JOIN "public"."business_members" "bm" ON (("bm"."business_id" = "sa"."business_id")))
  WHERE ("bm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text"))))));



ALTER TABLE "public"."swot_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "swot_history_all_final" ON "public"."swot_history" TO "authenticated" USING ((("changed_by" = ( SELECT "auth"."uid"() AS "uid")) OR (("swot_analysis_id")::"text" IN ( SELECT ("sa"."id")::"text" AS "id"
   FROM "public"."swot_analyses" "sa"
  WHERE ("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("swot_analysis_id")::"text" IN ( SELECT ("sa"."id")::"text" AS "id"
   FROM ("public"."swot_analyses" "sa"
     JOIN "public"."business_members" "bm" ON (("bm"."business_id" = "sa"."business_id")))
  WHERE ("bm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text")))))) WITH CHECK ((("changed_by" = ( SELECT "auth"."uid"() AS "uid")) OR (("swot_analysis_id")::"text" IN ( SELECT ("sa"."id")::"text" AS "id"
   FROM "public"."swot_analyses" "sa"
  WHERE ("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("swot_analysis_id")::"text" IN ( SELECT ("sa"."id")::"text" AS "id"
   FROM ("public"."swot_analyses" "sa"
     JOIN "public"."business_members" "bm" ON (("bm"."business_id" = "sa"."business_id")))
  WHERE ("bm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text"))))));



ALTER TABLE "public"."swot_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "swot_items_delete_consolidated" ON "public"."swot_items" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."swot_analyses" "sa"
     JOIN "public"."businesses" "b" ON (("b"."id" = "sa"."business_id")))
  WHERE (("sa"."id" = "swot_items"."swot_analysis_id") AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."swot_analyses" "sa"
  WHERE (("sa"."id" = "swot_items"."swot_analysis_id") AND (("sa"."business_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("sa"."created_by" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "swot_items_insert_final" ON "public"."swot_items" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR (("swot_analysis_id")::"text" IN ( SELECT ("sa"."id")::"text" AS "id"
   FROM "public"."swot_analyses" "sa"
  WHERE ("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("swot_analysis_id")::"text" IN ( SELECT ("sa"."id")::"text" AS "id"
   FROM ("public"."swot_analyses" "sa"
     JOIN "public"."business_members" "bm" ON (("bm"."business_id" = "sa"."business_id")))
  WHERE ("bm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (("swot_analysis_id")::"text" IN ( SELECT ("sa"."id")::"text" AS "id"
   FROM ("public"."swot_analyses" "sa"
     JOIN "public"."businesses" "b" ON (("b"."id" = "sa"."business_id")))
  WHERE ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text"))))));



CREATE POLICY "swot_items_select_consolidated" ON "public"."swot_items" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."swot_analyses" "sa"
  WHERE (("sa"."id" = "swot_items"."swot_analysis_id") AND (("sa"."business_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("sa"."created_by" = ( SELECT "auth"."uid"() AS "uid")))))) OR ("swot_analysis_id" IN ( SELECT "swot_analyses"."id"
   FROM "public"."swot_analyses"
  WHERE (("swot_analyses"."business_id")::"text" IN ( SELECT ("businesses"."owner_id")::"text" AS "owner_id"
           FROM "public"."businesses"
          WHERE ("businesses"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "swot_items_update_consolidated" ON "public"."swot_items" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."swot_analyses" "sa"
     JOIN "public"."businesses" "b" ON (("b"."id" = "sa"."business_id")))
  WHERE (("sa"."id" = "swot_items"."swot_analysis_id") AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."swot_analyses" "sa"
  WHERE (("sa"."id" = "swot_items"."swot_analysis_id") AND (("sa"."business_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("sa"."created_by" = ( SELECT "auth"."uid"() AS "uid"))))))));



ALTER TABLE "public"."swot_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_roles_policy" ON "public"."system_roles" USING ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"("auth"."uid"())));



CREATE POLICY "system_roles_select_consolidated" ON "public"."system_roles" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."team_data" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "team_data_delete" ON "public"."team_data" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "team_data_insert" ON "public"."team_data" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "team_data_select" ON "public"."team_data" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "team_data_update" ON "public"."team_data" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."team_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "team_invites_all_final" ON "public"."team_invites" TO "authenticated" USING (((("business_id")::"text" IN ( SELECT ("b"."id")::"text" AS "id"
   FROM "public"."businesses" "b"
  WHERE ("b"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text")))))) WITH CHECK (((("business_id")::"text" IN ( SELECT ("b"."id")::"text" AS "id"
   FROM "public"."businesses" "b"
  WHERE ("b"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text"))))));



ALTER TABLE "public"."todo_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "todo_items_delete" ON "public"."todo_items" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "todo_items_insert" ON "public"."todo_items" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "todo_items_select" ON "public"."todo_items" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "todo_items_update" ON "public"."todo_items" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "update_session_actions" ON "public"."session_actions" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "session_actions"."business_id") AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "session_actions"."business_id") AND ("b"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."business_users" "bu"
  WHERE (("bu"."business_id" = "session_actions"."business_id") AND ("bu"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."user_businesses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_kpis" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_kpis_delete_consolidated" ON "public"."user_kpis" FOR DELETE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."owner_id" = "user_kpis"."user_id") AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "user_kpis_insert_final" ON "public"."user_kpis" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text"))))));



CREATE POLICY "user_kpis_select_consolidated" ON "public"."user_kpis" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (EXISTS ( SELECT 1
   FROM ("public"."business_users" "bu"
     JOIN "public"."businesses" "b" ON (("bu"."business_id" = "b"."id")))
  WHERE (("bu"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("bu"."role" = 'coach'::"text") AND ("b"."owner_id" = "user_kpis"."user_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles"
  WHERE (("system_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("system_roles"."role" = 'super_admin'::"text"))))));



CREATE POLICY "user_kpis_update_consolidated" ON "public"."user_kpis" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."owner_id" = "user_kpis"."user_id") AND ("b"."assigned_coach_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."user_logins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_logins_all_final" ON "public"."user_logins" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles_all_final" ON "public"."user_roles" TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("business_id")::"text" IN ( SELECT ("b"."id")::"text" AS "id"
   FROM "public"."businesses" "b"
  WHERE ("b"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text")))))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("business_id")::"text" IN ( SELECT ("b"."id")::"text" AS "id"
   FROM "public"."businesses" "b"
  WHERE ("b"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))) OR (EXISTS ( SELECT 1
   FROM "public"."system_roles" "sr"
  WHERE (("sr"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sr"."role" = 'super_admin'::"text"))))));



ALTER TABLE "public"."user_selected_kpis" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_selected_kpis_own_data" ON "public"."user_selected_kpis" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_select" ON "public"."users" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin") OR ("id" IN ( SELECT "bu"."user_id"
   FROM "public"."business_users" "bu"
  WHERE ("bu"."business_id" = ANY ("public"."rls_user_coached_businesses"())))) OR ("id" IN ( SELECT "b"."owner_id"
   FROM "public"."businesses" "b"
  WHERE ("b"."assigned_coach_id" = "auth"."uid"())))));



CREATE POLICY "users_update" ON "public"."users" FOR UPDATE TO "authenticated" USING ((("id" = "auth"."uid"()) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("id" = "auth"."uid"()) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."vision_targets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vision_targets_delete" ON "public"."vision_targets" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "vision_targets_insert" ON "public"."vision_targets" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "vision_targets_select" ON "public"."vision_targets" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "vision_targets_update" ON "public"."vision_targets" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."weekly_checkins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_metrics_snapshots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "weekly_metrics_snapshots_delete" ON "public"."weekly_metrics_snapshots" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "weekly_metrics_snapshots_insert" ON "public"."weekly_metrics_snapshots" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "weekly_metrics_snapshots_select" ON "public"."weekly_metrics_snapshots" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "weekly_metrics_snapshots_update" ON "public"."weekly_metrics_snapshots" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."weekly_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "weekly_reviews_delete" ON "public"."weekly_reviews" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "weekly_reviews_insert" ON "public"."weekly_reviews" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "weekly_reviews_select" ON "public"."weekly_reviews" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "weekly_reviews_update" ON "public"."weekly_reviews" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



ALTER TABLE "public"."xero_connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "xero_connections_delete" ON "public"."xero_connections" FOR DELETE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "xero_connections_insert" ON "public"."xero_connections" FOR INSERT TO "authenticated" WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "xero_connections_select" ON "public"."xero_connections" FOR SELECT TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));



CREATE POLICY "xero_connections_update" ON "public"."xero_connections" FOR UPDATE TO "authenticated" USING ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin"))) WITH CHECK ((("business_id" = ANY ("public"."rls_user_all_businesses"())) OR ( SELECT "public"."rls_is_super_admin"() AS "rls_is_super_admin")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."annual_targets";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."assessments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."audit_log";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."business_financial_goals";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."business_kpis";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."business_profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."financial_forecasts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."ideas";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."issues_list";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."open_loops";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."quarterly_reviews";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."stop_doing_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."strategic_initiatives";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."strategy_data";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."swot_analyses";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."todo_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."vision_targets";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."weekly_metrics_snapshots";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."weekly_reviews";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."assign_coach_to_process"("process_id" "uuid", "coach_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."assign_coach_to_process"("process_id" "uuid", "coach_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_coach_to_process"("process_id" "uuid", "coach_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_employee_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_employee_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_employee_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_process"("process_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_process"("process_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_process"("process_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_password_tokens"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_password_tokens"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_password_tokens"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_audit_logs"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_audit_logs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_audit_logs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_user_setup"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_user_setup"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_user_setup"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_app_user"("p_email" "text", "p_password" "text", "p_full_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_app_user"("p_email" "text", "p_password" "text", "p_full_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_app_user"("p_email" "text", "p_password" "text", "p_full_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_baseline_scenario_for_forecast"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_baseline_scenario_for_forecast"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_baseline_scenario_for_forecast"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_client_account"("p_email" "text", "p_business_name" "text", "p_coach_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_client_account"("p_email" "text", "p_business_name" "text", "p_coach_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_client_account"("p_email" "text", "p_business_name" "text", "p_coach_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_quarterly_swot"("p_user_id" "uuid", "p_quarter" "text", "p_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_quarterly_swot"("p_user_id" "uuid", "p_quarter" "text", "p_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_quarterly_swot"("p_user_id" "uuid", "p_quarter" "text", "p_year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_test_user"("p_email" "text", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_test_user"("p_email" "text", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_test_user"("p_email" "text", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_version_snapshot"("p_forecast_id" "uuid", "p_version_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_version_snapshot"("p_forecast_id" "uuid", "p_version_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_version_snapshot"("p_forecast_id" "uuid", "p_version_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_single_active_scenario"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_single_active_scenario"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_single_active_scenario"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_all_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_coach_for_process"("process_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_coach_for_process"("process_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_coach_for_process"("process_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_version_number"("p_forecast_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_version_number"("p_forecast_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_version_number"("p_forecast_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_or_create_business_profile"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_business_profile"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_business_profile"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_quarter_date_range"("quarter" "text", "year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_quarter_date_range"("quarter" "text", "year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_quarter_date_range"("quarter" "text", "year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_quarter_from_date"("check_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_quarter_from_date"("check_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_quarter_from_date"("check_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_todo_stats"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_todo_stats"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_todo_stats"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"("p_user_id" "uuid", "p_business_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"("p_user_id" "uuid", "p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"("p_user_id" "uuid", "p_business_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_system_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_system_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_system_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_direct_business_access"("check_user_id" "uuid", "check_business_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_direct_business_access"("check_user_id" "uuid", "check_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_direct_business_access"("check_user_id" "uuid", "check_business_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_custom_kpi_usage"() TO "anon";
GRANT ALL ON FUNCTION "public"."increment_custom_kpi_usage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_custom_kpi_usage"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_business_team_member"("check_user_id" "uuid", "check_business_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_business_team_member"("check_user_id" "uuid", "check_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_business_team_member"("check_user_id" "uuid", "check_business_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_coach"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_coach"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_coach"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"("check_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"("check_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"("check_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."lock_forecast_version"("p_forecast_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."lock_forecast_version"("p_forecast_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lock_forecast_version"("p_forecast_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_forecast_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_forecast_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_forecast_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_coach_forecast_complete"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_coach_forecast_complete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_coach_forecast_complete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_user_password"("p_user_id" "uuid", "p_new_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reset_user_password"("p_user_id" "uuid", "p_new_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_user_password"("p_user_id" "uuid", "p_new_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_user_all_businesses"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_user_all_businesses"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_user_all_businesses"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_user_all_businesses_text"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_user_all_businesses_text"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_user_all_businesses_text"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_user_coached_businesses"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_user_coached_businesses"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_user_coached_businesses"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_user_owned_businesses"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_user_owned_businesses"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_user_owned_businesses"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_user_team_businesses"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_user_team_businesses"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_user_team_businesses"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ai_tables_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ai_tables_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ai_tables_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_annual_plans_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_annual_plans_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_annual_plans_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_assessment_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_assessment_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_assessment_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_custom_kpis_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_custom_kpis_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_custom_kpis_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_decision_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_decision_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_decision_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_idea_status_on_filter"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_idea_status_on_filter"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_idea_status_on_filter"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ideas_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ideas_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ideas_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_life_goals_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_life_goals_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_life_goals_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_notifications_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_notifications_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_notifications_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_process_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_process_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_process_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_profile_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_profile_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_profile_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_quarterly_reviews_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_quarterly_reviews_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_quarterly_reviews_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_roadmap_progress_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_roadmap_progress_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_roadmap_progress_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_session_actions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_session_actions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_session_actions_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_session_notes_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_session_notes_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_session_notes_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_stop_doing_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_stop_doing_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_stop_doing_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_strategic_goals_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_strategic_goals_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_strategic_goals_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_strategic_kpis_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_strategic_kpis_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_strategic_kpis_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_subscription_budgets_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_subscription_budgets_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_subscription_budgets_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_swot_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_swot_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_swot_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_category_pattern"("p_business_id" "uuid", "p_account_code" "text", "p_account_name" "text", "p_category" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_category_pattern"("p_business_id" "uuid", "p_account_code" "text", "p_account_name" "text", "p_category" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_category_pattern"("p_business_id" "uuid", "p_account_code" "text", "p_account_name" "text", "p_category" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_user_preference"("p_user_id" "uuid", "p_preference_key" "text", "p_preference_value" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_user_preference"("p_user_id" "uuid", "p_preference_key" "text", "p_preference_value" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_user_preference"("p_user_id" "uuid", "p_preference_key" "text", "p_preference_value" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_role"("required_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_role"("required_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_role"("required_role" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."action_items" TO "anon";
GRANT ALL ON TABLE "public"."action_items" TO "authenticated";
GRANT ALL ON TABLE "public"."action_items" TO "service_role";



GRANT ALL ON TABLE "public"."activity_log" TO "anon";
GRANT ALL ON TABLE "public"."activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."ai_cfo_conversations" TO "anon";
GRANT ALL ON TABLE "public"."ai_cfo_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_cfo_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."ai_interactions" TO "anon";
GRANT ALL ON TABLE "public"."ai_interactions" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_interactions" TO "service_role";



GRANT ALL ON TABLE "public"."annual_plans" TO "anon";
GRANT ALL ON TABLE "public"."annual_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."annual_plans" TO "service_role";



GRANT ALL ON TABLE "public"."annual_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."annual_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."annual_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."annual_targets" TO "anon";
GRANT ALL ON TABLE "public"."annual_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."annual_targets" TO "service_role";



GRANT ALL ON TABLE "public"."assessments" TO "anon";
GRANT ALL ON TABLE "public"."assessments" TO "authenticated";
GRANT ALL ON TABLE "public"."assessments" TO "service_role";



GRANT ALL ON TABLE "public"."assessments_backup" TO "anon";
GRANT ALL ON TABLE "public"."assessments_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."assessments_backup" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."business_contacts" TO "anon";
GRANT ALL ON TABLE "public"."business_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."business_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."business_financial_goals" TO "anon";
GRANT ALL ON TABLE "public"."business_financial_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."business_financial_goals" TO "service_role";



GRANT ALL ON TABLE "public"."business_kpis" TO "anon";
GRANT ALL ON TABLE "public"."business_kpis" TO "authenticated";
GRANT ALL ON TABLE "public"."business_kpis" TO "service_role";



GRANT ALL ON TABLE "public"."business_members" TO "anon";
GRANT ALL ON TABLE "public"."business_members" TO "authenticated";
GRANT ALL ON TABLE "public"."business_members" TO "service_role";



GRANT ALL ON TABLE "public"."business_profiles" TO "anon";
GRANT ALL ON TABLE "public"."business_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."business_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."business_users" TO "anon";
GRANT ALL ON TABLE "public"."business_users" TO "authenticated";
GRANT ALL ON TABLE "public"."business_users" TO "service_role";



GRANT ALL ON TABLE "public"."businesses" TO "anon";
GRANT ALL ON TABLE "public"."businesses" TO "authenticated";
GRANT ALL ON TABLE "public"."businesses" TO "service_role";



GRANT ALL ON TABLE "public"."category_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."category_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."category_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."user_logins" TO "anon";
GRANT ALL ON TABLE "public"."user_logins" TO "authenticated";
GRANT ALL ON TABLE "public"."user_logins" TO "service_role";



GRANT ALL ON TABLE "public"."client_activity_summary" TO "anon";
GRANT ALL ON TABLE "public"."client_activity_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."client_activity_summary" TO "service_role";



GRANT ALL ON TABLE "public"."client_invitations" TO "anon";
GRANT ALL ON TABLE "public"."client_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."client_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."coach_benchmarks" TO "anon";
GRANT ALL ON TABLE "public"."coach_benchmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_benchmarks" TO "service_role";



GRANT ALL ON TABLE "public"."coach_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."coach_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."coaching_sessions" TO "anon";
GRANT ALL ON TABLE "public"."coaching_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."coaching_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_history" TO "anon";
GRANT ALL ON TABLE "public"."conversation_history" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_history" TO "service_role";



GRANT ALL ON TABLE "public"."current_quarter_swots" TO "anon";
GRANT ALL ON TABLE "public"."current_quarter_swots" TO "authenticated";
GRANT ALL ON TABLE "public"."current_quarter_swots" TO "service_role";



GRANT ALL ON TABLE "public"."custom_kpis_library" TO "anon";
GRANT ALL ON TABLE "public"."custom_kpis_library" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_kpis_library" TO "service_role";



GRANT ALL ON TABLE "public"."daily_musts" TO "anon";
GRANT ALL ON TABLE "public"."daily_musts" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_musts" TO "service_role";



GRANT ALL ON TABLE "public"."daily_tasks" TO "anon";
GRANT ALL ON TABLE "public"."daily_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."dashboard_preferences" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."financial_forecasts" TO "anon";
GRANT ALL ON TABLE "public"."financial_forecasts" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_forecasts" TO "service_role";



GRANT ALL ON TABLE "public"."financial_metrics" TO "anon";
GRANT ALL ON TABLE "public"."financial_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."financial_targets" TO "anon";
GRANT ALL ON TABLE "public"."financial_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_targets" TO "service_role";



GRANT ALL ON TABLE "public"."forecast_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."forecast_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."forecast_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."forecast_decisions" TO "anon";
GRANT ALL ON TABLE "public"."forecast_decisions" TO "authenticated";
GRANT ALL ON TABLE "public"."forecast_decisions" TO "service_role";



GRANT ALL ON TABLE "public"."forecast_employees" TO "anon";
GRANT ALL ON TABLE "public"."forecast_employees" TO "authenticated";
GRANT ALL ON TABLE "public"."forecast_employees" TO "service_role";



GRANT ALL ON TABLE "public"."forecast_insights" TO "anon";
GRANT ALL ON TABLE "public"."forecast_insights" TO "authenticated";
GRANT ALL ON TABLE "public"."forecast_insights" TO "service_role";



GRANT ALL ON TABLE "public"."forecast_investments" TO "anon";
GRANT ALL ON TABLE "public"."forecast_investments" TO "authenticated";
GRANT ALL ON TABLE "public"."forecast_investments" TO "service_role";



GRANT ALL ON TABLE "public"."forecast_payroll_summary" TO "anon";
GRANT ALL ON TABLE "public"."forecast_payroll_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."forecast_payroll_summary" TO "service_role";



GRANT ALL ON TABLE "public"."forecast_pl_lines" TO "anon";
GRANT ALL ON TABLE "public"."forecast_pl_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."forecast_pl_lines" TO "service_role";



GRANT ALL ON TABLE "public"."forecast_scenario_lines" TO "anon";
GRANT ALL ON TABLE "public"."forecast_scenario_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."forecast_scenario_lines" TO "service_role";



GRANT ALL ON TABLE "public"."forecast_scenarios" TO "anon";
GRANT ALL ON TABLE "public"."forecast_scenarios" TO "authenticated";
GRANT ALL ON TABLE "public"."forecast_scenarios" TO "service_role";



GRANT ALL ON TABLE "public"."forecast_values" TO "anon";
GRANT ALL ON TABLE "public"."forecast_values" TO "authenticated";
GRANT ALL ON TABLE "public"."forecast_values" TO "service_role";



GRANT ALL ON TABLE "public"."forecast_wizard_sessions" TO "anon";
GRANT ALL ON TABLE "public"."forecast_wizard_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."forecast_wizard_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."forecast_years" TO "anon";
GRANT ALL ON TABLE "public"."forecast_years" TO "authenticated";
GRANT ALL ON TABLE "public"."forecast_years" TO "service_role";



GRANT ALL ON TABLE "public"."forecasts" TO "anon";
GRANT ALL ON TABLE "public"."forecasts" TO "authenticated";
GRANT ALL ON TABLE "public"."forecasts" TO "service_role";



GRANT ALL ON TABLE "public"."goals" TO "anon";
GRANT ALL ON TABLE "public"."goals" TO "authenticated";
GRANT ALL ON TABLE "public"."goals" TO "service_role";



GRANT ALL ON TABLE "public"."ideas" TO "anon";
GRANT ALL ON TABLE "public"."ideas" TO "authenticated";
GRANT ALL ON TABLE "public"."ideas" TO "service_role";



GRANT ALL ON TABLE "public"."ideas_filter" TO "anon";
GRANT ALL ON TABLE "public"."ideas_filter" TO "authenticated";
GRANT ALL ON TABLE "public"."ideas_filter" TO "service_role";



GRANT ALL ON TABLE "public"."issues_list" TO "anon";
GRANT ALL ON TABLE "public"."issues_list" TO "authenticated";
GRANT ALL ON TABLE "public"."issues_list" TO "service_role";



GRANT ALL ON TABLE "public"."kpi_actuals" TO "anon";
GRANT ALL ON TABLE "public"."kpi_actuals" TO "authenticated";
GRANT ALL ON TABLE "public"."kpi_actuals" TO "service_role";



GRANT ALL ON TABLE "public"."kpi_alerts" TO "anon";
GRANT ALL ON TABLE "public"."kpi_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."kpi_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."kpi_benchmarks" TO "anon";
GRANT ALL ON TABLE "public"."kpi_benchmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."kpi_benchmarks" TO "service_role";



GRANT ALL ON TABLE "public"."kpi_definitions" TO "anon";
GRANT ALL ON TABLE "public"."kpi_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."kpi_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."kpi_definitions_backup" TO "anon";
GRANT ALL ON TABLE "public"."kpi_definitions_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."kpi_definitions_backup" TO "service_role";



GRANT ALL ON TABLE "public"."kpi_history" TO "anon";
GRANT ALL ON TABLE "public"."kpi_history" TO "authenticated";
GRANT ALL ON TABLE "public"."kpi_history" TO "service_role";



GRANT ALL ON TABLE "public"."kpi_tracking_values" TO "anon";
GRANT ALL ON TABLE "public"."kpi_tracking_values" TO "authenticated";
GRANT ALL ON TABLE "public"."kpi_tracking_values" TO "service_role";



GRANT ALL ON TABLE "public"."kpi_values" TO "anon";
GRANT ALL ON TABLE "public"."kpi_values" TO "authenticated";
GRANT ALL ON TABLE "public"."kpi_values" TO "service_role";



GRANT ALL ON TABLE "public"."kpis" TO "anon";
GRANT ALL ON TABLE "public"."kpis" TO "authenticated";
GRANT ALL ON TABLE "public"."kpis" TO "service_role";



GRANT ALL ON TABLE "public"."life_goals" TO "anon";
GRANT ALL ON TABLE "public"."life_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."life_goals" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_data" TO "anon";
GRANT ALL ON TABLE "public"."marketing_data" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_data" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_actuals" TO "anon";
GRANT ALL ON TABLE "public"."monthly_actuals" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_actuals" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_reviews" TO "anon";
GRANT ALL ON TABLE "public"."monthly_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."ninety_day_sprints" TO "anon";
GRANT ALL ON TABLE "public"."ninety_day_sprints" TO "authenticated";
GRANT ALL ON TABLE "public"."ninety_day_sprints" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_progress" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_progress" TO "service_role";



GRANT ALL ON TABLE "public"."open_loops" TO "anon";
GRANT ALL ON TABLE "public"."open_loops" TO "authenticated";
GRANT ALL ON TABLE "public"."open_loops" TO "service_role";



GRANT ALL ON TABLE "public"."operational_activities" TO "anon";
GRANT ALL ON TABLE "public"."operational_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."operational_activities" TO "service_role";



GRANT ALL ON TABLE "public"."password_reset_tokens" TO "anon";
GRANT ALL ON TABLE "public"."password_reset_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."password_reset_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."process_comments" TO "anon";
GRANT ALL ON TABLE "public"."process_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."process_comments" TO "service_role";



GRANT ALL ON TABLE "public"."process_connections" TO "anon";
GRANT ALL ON TABLE "public"."process_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."process_connections" TO "service_role";



GRANT ALL ON TABLE "public"."process_decisions" TO "anon";
GRANT ALL ON TABLE "public"."process_decisions" TO "authenticated";
GRANT ALL ON TABLE "public"."process_decisions" TO "service_role";



GRANT ALL ON TABLE "public"."process_diagrams" TO "anon";
GRANT ALL ON TABLE "public"."process_diagrams" TO "authenticated";
GRANT ALL ON TABLE "public"."process_diagrams" TO "service_role";



GRANT ALL ON TABLE "public"."process_flows" TO "anon";
GRANT ALL ON TABLE "public"."process_flows" TO "authenticated";
GRANT ALL ON TABLE "public"."process_flows" TO "service_role";



GRANT ALL ON TABLE "public"."process_phases" TO "anon";
GRANT ALL ON TABLE "public"."process_phases" TO "authenticated";
GRANT ALL ON TABLE "public"."process_phases" TO "service_role";



GRANT ALL ON TABLE "public"."process_steps" TO "anon";
GRANT ALL ON TABLE "public"."process_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."process_steps" TO "service_role";



GRANT ALL ON TABLE "public"."process_versions" TO "anon";
GRANT ALL ON TABLE "public"."process_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."process_versions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."quarterly_forecasts" TO "anon";
GRANT ALL ON TABLE "public"."quarterly_forecasts" TO "authenticated";
GRANT ALL ON TABLE "public"."quarterly_forecasts" TO "service_role";



GRANT ALL ON TABLE "public"."quarterly_plans" TO "anon";
GRANT ALL ON TABLE "public"."quarterly_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."quarterly_plans" TO "service_role";



GRANT ALL ON TABLE "public"."quarterly_priorities" TO "anon";
GRANT ALL ON TABLE "public"."quarterly_priorities" TO "authenticated";
GRANT ALL ON TABLE "public"."quarterly_priorities" TO "service_role";



GRANT ALL ON TABLE "public"."quarterly_reviews" TO "anon";
GRANT ALL ON TABLE "public"."quarterly_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."quarterly_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."quarterly_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."quarterly_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."quarterly_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_completions" TO "anon";
GRANT ALL ON TABLE "public"."roadmap_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."roadmap_completions" TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_progress" TO "anon";
GRANT ALL ON TABLE "public"."roadmap_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."roadmap_progress" TO "service_role";



GRANT ALL ON TABLE "public"."session_actions" TO "anon";
GRANT ALL ON TABLE "public"."session_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."session_actions" TO "service_role";



GRANT ALL ON TABLE "public"."session_attendees" TO "anon";
GRANT ALL ON TABLE "public"."session_attendees" TO "authenticated";
GRANT ALL ON TABLE "public"."session_attendees" TO "service_role";



GRANT ALL ON TABLE "public"."session_notes" TO "anon";
GRANT ALL ON TABLE "public"."session_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."session_notes" TO "service_role";



GRANT ALL ON TABLE "public"."session_templates" TO "anon";
GRANT ALL ON TABLE "public"."session_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."session_templates" TO "service_role";



GRANT ALL ON TABLE "public"."sessions" TO "anon";
GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";



GRANT ALL ON TABLE "public"."shared_documents" TO "anon";
GRANT ALL ON TABLE "public"."shared_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."shared_documents" TO "service_role";



GRANT ALL ON TABLE "public"."sprint_actions" TO "anon";
GRANT ALL ON TABLE "public"."sprint_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."sprint_actions" TO "service_role";



GRANT ALL ON TABLE "public"."sprint_key_actions" TO "anon";
GRANT ALL ON TABLE "public"."sprint_key_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."sprint_key_actions" TO "service_role";



GRANT ALL ON TABLE "public"."sprint_milestones" TO "anon";
GRANT ALL ON TABLE "public"."sprint_milestones" TO "authenticated";
GRANT ALL ON TABLE "public"."sprint_milestones" TO "service_role";



GRANT ALL ON TABLE "public"."stage_transitions" TO "anon";
GRANT ALL ON TABLE "public"."stage_transitions" TO "authenticated";
GRANT ALL ON TABLE "public"."stage_transitions" TO "service_role";



GRANT ALL ON TABLE "public"."stop_doing_activities" TO "anon";
GRANT ALL ON TABLE "public"."stop_doing_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."stop_doing_activities" TO "service_role";



GRANT ALL ON TABLE "public"."stop_doing_hourly_rates" TO "anon";
GRANT ALL ON TABLE "public"."stop_doing_hourly_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."stop_doing_hourly_rates" TO "service_role";



GRANT ALL ON TABLE "public"."stop_doing_items" TO "anon";
GRANT ALL ON TABLE "public"."stop_doing_items" TO "authenticated";
GRANT ALL ON TABLE "public"."stop_doing_items" TO "service_role";



GRANT ALL ON TABLE "public"."stop_doing_time_logs" TO "anon";
GRANT ALL ON TABLE "public"."stop_doing_time_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."stop_doing_time_logs" TO "service_role";



GRANT ALL ON TABLE "public"."strategic_goals" TO "anon";
GRANT ALL ON TABLE "public"."strategic_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."strategic_goals" TO "service_role";



GRANT ALL ON TABLE "public"."strategic_initiatives" TO "anon";
GRANT ALL ON TABLE "public"."strategic_initiatives" TO "authenticated";
GRANT ALL ON TABLE "public"."strategic_initiatives" TO "service_role";



GRANT ALL ON TABLE "public"."strategic_initiatives_backup" TO "anon";
GRANT ALL ON TABLE "public"."strategic_initiatives_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."strategic_initiatives_backup" TO "service_role";



GRANT ALL ON TABLE "public"."strategic_kpis" TO "anon";
GRANT ALL ON TABLE "public"."strategic_kpis" TO "authenticated";
GRANT ALL ON TABLE "public"."strategic_kpis" TO "service_role";



GRANT ALL ON TABLE "public"."strategic_kpis_backup" TO "anon";
GRANT ALL ON TABLE "public"."strategic_kpis_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."strategic_kpis_backup" TO "service_role";



GRANT ALL ON TABLE "public"."strategic_plans" TO "anon";
GRANT ALL ON TABLE "public"."strategic_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."strategic_plans" TO "service_role";



GRANT ALL ON TABLE "public"."strategic_todos" TO "anon";
GRANT ALL ON TABLE "public"."strategic_todos" TO "authenticated";
GRANT ALL ON TABLE "public"."strategic_todos" TO "service_role";



GRANT ALL ON TABLE "public"."strategic_wheels" TO "anon";
GRANT ALL ON TABLE "public"."strategic_wheels" TO "authenticated";
GRANT ALL ON TABLE "public"."strategic_wheels" TO "service_role";



GRANT ALL ON TABLE "public"."strategy_data" TO "anon";
GRANT ALL ON TABLE "public"."strategy_data" TO "authenticated";
GRANT ALL ON TABLE "public"."strategy_data" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_audit_results" TO "anon";
GRANT ALL ON TABLE "public"."subscription_audit_results" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_audit_results" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_budgets" TO "anon";
GRANT ALL ON TABLE "public"."subscription_budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_budgets" TO "service_role";



GRANT ALL ON TABLE "public"."success_disciplines" TO "anon";
GRANT ALL ON TABLE "public"."success_disciplines" TO "authenticated";
GRANT ALL ON TABLE "public"."success_disciplines" TO "service_role";



GRANT ALL ON TABLE "public"."swot_action_items" TO "anon";
GRANT ALL ON TABLE "public"."swot_action_items" TO "authenticated";
GRANT ALL ON TABLE "public"."swot_action_items" TO "service_role";



GRANT ALL ON TABLE "public"."swot_analyses" TO "anon";
GRANT ALL ON TABLE "public"."swot_analyses" TO "authenticated";
GRANT ALL ON TABLE "public"."swot_analyses" TO "service_role";



GRANT ALL ON TABLE "public"."swot_collaborators" TO "anon";
GRANT ALL ON TABLE "public"."swot_collaborators" TO "authenticated";
GRANT ALL ON TABLE "public"."swot_collaborators" TO "service_role";



GRANT ALL ON TABLE "public"."swot_comments" TO "anon";
GRANT ALL ON TABLE "public"."swot_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."swot_comments" TO "service_role";



GRANT ALL ON TABLE "public"."swot_comparisons" TO "anon";
GRANT ALL ON TABLE "public"."swot_comparisons" TO "authenticated";
GRANT ALL ON TABLE "public"."swot_comparisons" TO "service_role";



GRANT ALL ON TABLE "public"."swot_history" TO "anon";
GRANT ALL ON TABLE "public"."swot_history" TO "authenticated";
GRANT ALL ON TABLE "public"."swot_history" TO "service_role";



GRANT ALL ON TABLE "public"."swot_items" TO "anon";
GRANT ALL ON TABLE "public"."swot_items" TO "authenticated";
GRANT ALL ON TABLE "public"."swot_items" TO "service_role";



GRANT ALL ON TABLE "public"."swot_templates" TO "anon";
GRANT ALL ON TABLE "public"."swot_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."swot_templates" TO "service_role";



GRANT ALL ON TABLE "public"."system_roles" TO "anon";
GRANT ALL ON TABLE "public"."system_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."system_roles" TO "service_role";



GRANT ALL ON TABLE "public"."team_data" TO "anon";
GRANT ALL ON TABLE "public"."team_data" TO "authenticated";
GRANT ALL ON TABLE "public"."team_data" TO "service_role";



GRANT ALL ON TABLE "public"."team_invites" TO "anon";
GRANT ALL ON TABLE "public"."team_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."team_invites" TO "service_role";



GRANT ALL ON TABLE "public"."todo_items" TO "anon";
GRANT ALL ON TABLE "public"."todo_items" TO "authenticated";
GRANT ALL ON TABLE "public"."todo_items" TO "service_role";



GRANT ALL ON TABLE "public"."user_businesses" TO "anon";
GRANT ALL ON TABLE "public"."user_businesses" TO "authenticated";
GRANT ALL ON TABLE "public"."user_businesses" TO "service_role";



GRANT ALL ON TABLE "public"."user_kpi_dashboard" TO "anon";
GRANT ALL ON TABLE "public"."user_kpi_dashboard" TO "authenticated";
GRANT ALL ON TABLE "public"."user_kpi_dashboard" TO "service_role";



GRANT ALL ON TABLE "public"."user_kpis" TO "anon";
GRANT ALL ON TABLE "public"."user_kpis" TO "authenticated";
GRANT ALL ON TABLE "public"."user_kpis" TO "service_role";



GRANT ALL ON TABLE "public"."user_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."user_selected_kpis" TO "anon";
GRANT ALL ON TABLE "public"."user_selected_kpis" TO "authenticated";
GRANT ALL ON TABLE "public"."user_selected_kpis" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."vision_targets" TO "anon";
GRANT ALL ON TABLE "public"."vision_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."vision_targets" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_checkins" TO "anon";
GRANT ALL ON TABLE "public"."weekly_checkins" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_checkins" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_metrics_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."weekly_metrics_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_metrics_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_reviews" TO "anon";
GRANT ALL ON TABLE "public"."weekly_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."xero_connections" TO "anon";
GRANT ALL ON TABLE "public"."xero_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."xero_connections" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























