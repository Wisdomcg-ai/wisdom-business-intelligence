-- Phase 2: Security & Best Practices
-- Migration: RBAC and Audit Log System
-- Created: 2024-11-21

-- =====================================================
-- USER ROLES TABLE
-- =====================================================
-- Track user roles for business access control
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'coach', 'client', 'viewer', 'admin')),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure a user can only have one role per business
  UNIQUE(user_id, business_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_business_id ON public.user_roles(business_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

-- Add comments
COMMENT ON TABLE public.user_roles IS 'Stores user roles for business access control';
COMMENT ON COLUMN public.user_roles.role IS 'Role types: owner (full access), coach (can view all clients), client (own data only), viewer (read-only), admin (full system access)';

-- =====================================================
-- FORECAST AUDIT LOG TABLE
-- =====================================================
-- Track all changes to financial forecasts for compliance and debugging
CREATE TABLE IF NOT EXISTS public.forecast_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID REFERENCES public.financial_forecasts(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL CHECK (action IN ('create', 'update', 'delete', 'sync_xero', 'import_annual_plan')),
  table_name VARCHAR(100),
  record_id UUID,
  field_name VARCHAR(100),
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for query performance
CREATE INDEX IF NOT EXISTS idx_forecast_audit_log_forecast_id ON public.forecast_audit_log(forecast_id);
CREATE INDEX IF NOT EXISTS idx_forecast_audit_log_user_id ON public.forecast_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_forecast_audit_log_action ON public.forecast_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_forecast_audit_log_created_at ON public.forecast_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_audit_log_table_record ON public.forecast_audit_log(table_name, record_id);

-- Add comments
COMMENT ON TABLE public.forecast_audit_log IS 'Audit trail for all forecast changes - compliance and debugging';
COMMENT ON COLUMN public.forecast_audit_log.action IS 'Type of action: create, update, delete, sync_xero, import_annual_plan';
COMMENT ON COLUMN public.forecast_audit_log.old_value IS 'Previous value (JSONB for flexibility)';
COMMENT ON COLUMN public.forecast_audit_log.new_value IS 'New value (JSONB for flexibility)';

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on user_roles table
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Business owners can manage roles for their business
CREATE POLICY "Business owners can manage roles"
  ON public.user_roles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.business_id = user_roles.business_id
        AND ur.role = 'owner'
    )
  );

-- Policy: Admins can manage all roles
CREATE POLICY "Admins can manage all roles"
  ON public.user_roles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  );

-- Enable RLS on forecast_audit_log table
ALTER TABLE public.forecast_audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view audit logs for forecasts they have access to
CREATE POLICY "Users can view audit logs for accessible forecasts"
  ON public.forecast_audit_log
  FOR SELECT
  USING (
    -- User can see logs for forecasts they own or have access to
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_audit_log.forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Or if they have a role for the business
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.user_roles ur ON f.business_id = ur.business_id
      WHERE f.id = forecast_audit_log.forecast_id
        AND ur.user_id = auth.uid()
    )
  );

-- Policy: Only system can insert audit logs (via trigger or service role)
CREATE POLICY "System can insert audit logs"
  ON public.forecast_audit_log
  FOR INSERT
  WITH CHECK (true); -- Service role bypass, or use auth.role() = 'service_role'

-- =====================================================
-- ENHANCED RLS FOR FINANCIAL_FORECASTS
-- =====================================================

-- Drop existing policies to recreate with role support
DROP POLICY IF EXISTS "Users can view their own forecasts" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Users can insert their own forecasts" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Users can update their own forecasts" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Users can delete their own forecasts" ON public.financial_forecasts;

-- Policy: Users can view forecasts they own OR have role access to
CREATE POLICY "Users can view forecasts with role access"
  ON public.financial_forecasts
  FOR SELECT
  USING (
    -- Own forecast
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.id = financial_forecasts.business_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Has role for this business
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.business_id = financial_forecasts.business_id
        AND ur.user_id = auth.uid()
    )
  );

-- Policy: Users can insert forecasts for businesses they own or have owner/coach role
CREATE POLICY "Users can insert forecasts with appropriate role"
  ON public.financial_forecasts
  FOR INSERT
  WITH CHECK (
    -- Own business
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.id = business_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Has owner or coach role
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.business_id = financial_forecasts.business_id
        AND ur.user_id = auth.uid()
        AND ur.role IN ('owner', 'coach', 'admin')
    )
  );

-- Policy: Users can update forecasts they own or have owner/coach role
CREATE POLICY "Users can update forecasts with appropriate role"
  ON public.financial_forecasts
  FOR UPDATE
  USING (
    -- Own business
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.id = financial_forecasts.business_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Has owner or coach role (not viewer or client)
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.business_id = financial_forecasts.business_id
        AND ur.user_id = auth.uid()
        AND ur.role IN ('owner', 'coach', 'admin')
    )
  );

-- Policy: Only owners and admins can delete forecasts
CREATE POLICY "Only owners and admins can delete forecasts"
  ON public.financial_forecasts
  FOR DELETE
  USING (
    -- Own business
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.id = financial_forecasts.business_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Has owner or admin role
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.business_id = financial_forecasts.business_id
        AND ur.user_id = auth.uid()
        AND ur.role IN ('owner', 'admin')
    )
  );

-- =====================================================
-- ENHANCED RLS FOR FORECAST_PL_LINES
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own P&L lines" ON public.forecast_pl_lines;
DROP POLICY IF EXISTS "Users can insert their own P&L lines" ON public.forecast_pl_lines;
DROP POLICY IF EXISTS "Users can update their own P&L lines" ON public.forecast_pl_lines;
DROP POLICY IF EXISTS "Users can delete their own P&L lines" ON public.forecast_pl_lines;

-- Policy: Users can view P&L lines for forecasts they have access to
CREATE POLICY "Users can view PL lines with role access"
  ON public.forecast_pl_lines
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.user_roles ur ON f.business_id = ur.business_id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND ur.user_id = auth.uid()
    )
  );

-- Policy: Users can insert P&L lines with appropriate role
CREATE POLICY "Users can insert PL lines with appropriate role"
  ON public.forecast_pl_lines
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.user_roles ur ON f.business_id = ur.business_id
      WHERE f.id = forecast_id
        AND ur.user_id = auth.uid()
        AND ur.role IN ('owner', 'coach', 'admin')
    )
  );

-- Policy: Users can update P&L lines with appropriate role
CREATE POLICY "Users can update PL lines with appropriate role"
  ON public.forecast_pl_lines
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.user_roles ur ON f.business_id = ur.business_id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND ur.user_id = auth.uid()
        AND ur.role IN ('owner', 'coach', 'admin')
    )
  );

-- Policy: Users can delete P&L lines with appropriate role
CREATE POLICY "Users can delete PL lines with appropriate role"
  ON public.forecast_pl_lines
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.user_roles ur ON f.business_id = ur.business_id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND ur.user_id = auth.uid()
        AND ur.role IN ('owner', 'coach', 'admin')
    )
  );

-- =====================================================
-- AUDIT TRIGGER FUNCTION
-- =====================================================

-- Function to automatically log changes to forecast tables
CREATE OR REPLACE FUNCTION public.log_forecast_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert audit log entry
  INSERT INTO public.forecast_audit_log (
    forecast_id,
    user_id,
    action,
    table_name,
    record_id,
    old_value,
    new_value
  ) VALUES (
    COALESCE(NEW.forecast_id, OLD.forecast_id, NEW.id),
    auth.uid(),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'create'
      WHEN TG_OP = 'UPDATE' THEN 'update'
      WHEN TG_OP = 'DELETE' THEN 'delete'
    END,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit triggers to forecast tables
DROP TRIGGER IF EXISTS audit_financial_forecasts ON public.financial_forecasts;
CREATE TRIGGER audit_financial_forecasts
  AFTER INSERT OR UPDATE OR DELETE ON public.financial_forecasts
  FOR EACH ROW EXECUTE FUNCTION public.log_forecast_change();

DROP TRIGGER IF EXISTS audit_forecast_pl_lines ON public.forecast_pl_lines;
CREATE TRIGGER audit_forecast_pl_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.forecast_pl_lines
  FOR EACH ROW EXECUTE FUNCTION public.log_forecast_change();

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to check if user has specific role for a business
CREATE OR REPLACE FUNCTION public.user_has_role(
  p_user_id UUID,
  p_business_id UUID,
  p_role VARCHAR
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id
      AND business_id = p_business_id
      AND role = p_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's role for a business
CREATE OR REPLACE FUNCTION public.get_user_role(
  p_user_id UUID,
  p_business_id UUID
)
RETURNS VARCHAR AS $$
DECLARE
  v_role VARCHAR;
BEGIN
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = p_user_id
    AND business_id = p_business_id
  LIMIT 1;

  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT ON public.forecast_audit_log TO authenticated;
GRANT INSERT ON public.forecast_audit_log TO service_role;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
