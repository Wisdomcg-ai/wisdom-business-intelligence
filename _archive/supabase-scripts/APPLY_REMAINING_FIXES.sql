-- Fix remaining function search_path issues
-- These functions may have multiple signatures, so we drop all versions

-- Drop all versions of remaining functions
DROP FUNCTION IF EXISTS public.create_quarterly_swot(UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.upsert_user_preference(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.create_app_user(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_app_user(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.increment_custom_kpi_usage();
DROP FUNCTION IF EXISTS public.upsert_category_pattern(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_or_create_business_profile(UUID);
DROP FUNCTION IF EXISTS public.get_or_create_business_profile();
DROP FUNCTION IF EXISTS public.get_next_version_number(UUID);
DROP FUNCTION IF EXISTS public.get_next_version_number();
DROP FUNCTION IF EXISTS public.can_access_process(UUID);
DROP FUNCTION IF EXISTS public.create_version_snapshot(UUID, TEXT);
DROP FUNCTION IF EXISTS public.create_version_snapshot(UUID);
DROP FUNCTION IF EXISTS public.create_client_account(TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.create_client_account(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.is_super_admin();
DROP FUNCTION IF EXISTS public.is_coach();
DROP FUNCTION IF EXISTS public.get_user_system_role();
DROP FUNCTION IF EXISTS public.reset_user_password(UUID, TEXT);
DROP FUNCTION IF EXISTS public.user_has_role(TEXT);
DROP FUNCTION IF EXISTS public.get_quarter_date_range(TEXT, INTEGER);

-- Recreate all functions with secure search_path

CREATE OR REPLACE FUNCTION public.create_quarterly_swot(
  p_user_id UUID,
  p_quarter TEXT,
  p_year INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.upsert_user_preference(
  p_user_id UUID,
  p_preference_key TEXT,
  p_preference_value JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id, preference_key, preference_value)
  VALUES (p_user_id, p_preference_key, p_preference_value)
  ON CONFLICT (user_id, preference_key)
  DO UPDATE SET preference_value = p_preference_value, updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.create_app_user(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.increment_custom_kpi_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.custom_kpi_templates
  SET usage_count = COALESCE(usage_count, 0) + 1
  WHERE id = NEW.template_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_category_pattern(
  p_business_id UUID,
  p_account_code TEXT,
  p_account_name TEXT,
  p_category TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.account_category_patterns (business_id, account_code, account_name, category)
  VALUES (p_business_id, p_account_code, p_account_name, p_category)
  ON CONFLICT (business_id, account_code)
  DO UPDATE SET category = p_category, account_name = p_account_name, updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_business_profile(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.get_next_version_number(p_forecast_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.can_access_process(process_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.create_version_snapshot(p_forecast_id UUID, p_version_notes TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.create_client_account(
  p_email TEXT,
  p_business_name TEXT,
  p_coach_id UUID DEFAULT NULL
)
RETURNS TABLE(user_id UUID, business_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.system_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_coach()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.system_roles
    WHERE user_id = auth.uid() AND role IN ('coach', 'super_admin')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_system_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.reset_user_password(
  p_user_id UUID,
  p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = NOW()
  WHERE id = p_user_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_role(required_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.system_roles
    WHERE user_id = auth.uid() AND role = required_role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_quarter_date_range(quarter TEXT, year INTEGER)
RETURNS TABLE(start_date DATE, end_date DATE)
LANGUAGE plpgsql
SET search_path = ''
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

-- Done!
