-- ============================================================================
-- COMPREHENSIVE MIGRATION: Audit Log + Forecast Versioning
-- ============================================================================
-- This migration adds:
-- 1. Complete audit logging infrastructure for Change History
-- 2. Forecast versioning system for Budget vs Forecast tracking
-- 3. Scenario planning enhancements
-- ============================================================================

-- ============================================================================
-- PART 1: AUDIT LOG INFRASTRUCTURE (for Change History tab)
-- ============================================================================

-- Create audit log table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.forecast_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID NOT NULL REFERENCES public.financial_forecasts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'sync_xero', 'import_annual_plan', 'lock_version', 'create_version')),
  table_name TEXT NOT NULL,
  record_id UUID,
  field_name TEXT,
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_audit_log_forecast_id ON public.forecast_audit_log(forecast_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.forecast_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.forecast_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.forecast_audit_log(action);

-- Enable RLS on audit log
ALTER TABLE public.forecast_audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view audit logs for forecasts they can access
CREATE POLICY "Users can view audit logs for their forecasts" ON public.forecast_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.financial_forecasts
      WHERE financial_forecasts.id = forecast_audit_log.forecast_id
      AND financial_forecasts.user_id = auth.uid()
    )
  );

-- Grant permissions
GRANT SELECT ON public.forecast_audit_log TO authenticated;

-- ============================================================================
-- PART 2: FORECAST VERSIONING SYSTEM
-- ============================================================================

-- Add versioning columns to financial_forecasts table
ALTER TABLE public.financial_forecasts
ADD COLUMN IF NOT EXISTS forecast_type TEXT DEFAULT 'forecast' CHECK (forecast_type IN ('budget', 'forecast', 'actual')),
ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS locked_by UUID,
ADD COLUMN IF NOT EXISTS parent_forecast_id UUID REFERENCES public.financial_forecasts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS version_notes TEXT;

-- Create index for version queries
CREATE INDEX IF NOT EXISTS idx_forecasts_type_version ON public.financial_forecasts(business_id, forecast_type, version_number);
CREATE INDEX IF NOT EXISTS idx_forecasts_active ON public.financial_forecasts(business_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_forecasts_parent ON public.financial_forecasts(parent_forecast_id) WHERE parent_forecast_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.financial_forecasts.forecast_type IS 'Type: budget (locked baseline), forecast (working version), or actual (from Xero)';
COMMENT ON COLUMN public.financial_forecasts.version_number IS 'Version number (1, 2, 3...) - increments with each new version';
COMMENT ON COLUMN public.financial_forecasts.is_active IS 'Only one active forecast per business - the current working version';
COMMENT ON COLUMN public.financial_forecasts.is_locked IS 'Locked versions cannot be edited';
COMMENT ON COLUMN public.financial_forecasts.parent_forecast_id IS 'Reference to the forecast this version was created from';

-- ============================================================================
-- PART 3: AUDIT TRIGGER FUNCTION (Fixed for all tables)
-- ============================================================================

-- Drop existing trigger function if it exists
DROP FUNCTION IF EXISTS public.log_forecast_change() CASCADE;

-- Create improved audit trigger function
CREATE OR REPLACE FUNCTION public.log_forecast_change()
RETURNS TRIGGER AS $$
DECLARE
  v_forecast_id UUID;
BEGIN
  -- Determine forecast_id based on table structure
  IF TG_TABLE_NAME = 'financial_forecasts' THEN
    v_forecast_id := COALESCE(NEW.id, OLD.id);
  ELSE
    v_forecast_id := COALESCE(NEW.forecast_id, OLD.forecast_id);
  END IF;

  -- Skip if no forecast_id (shouldn't happen, but be safe)
  IF v_forecast_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

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
    v_forecast_id,
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID), -- Fallback for system operations
    CASE
      WHEN TG_OP = 'INSERT' THEN 'create'
      WHEN TG_OP = 'UPDATE' THEN 'update'
      WHEN TG_OP = 'DELETE' THEN 'delete'
    END,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 4: CREATE TRIGGERS ON ALL FORECAST TABLES
-- ============================================================================

-- Trigger for financial_forecasts table
DROP TRIGGER IF EXISTS audit_financial_forecasts ON public.financial_forecasts;
CREATE TRIGGER audit_financial_forecasts
  AFTER INSERT OR UPDATE OR DELETE ON public.financial_forecasts
  FOR EACH ROW EXECUTE FUNCTION public.log_forecast_change();

-- Trigger for forecast_pl_lines table
DROP TRIGGER IF EXISTS audit_forecast_pl_lines ON public.forecast_pl_lines;
CREATE TRIGGER audit_forecast_pl_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.forecast_pl_lines
  FOR EACH ROW EXECUTE FUNCTION public.log_forecast_change();

-- Trigger for forecast_employees table
DROP TRIGGER IF EXISTS audit_forecast_employees ON public.forecast_employees;
CREATE TRIGGER audit_forecast_employees
  AFTER INSERT OR UPDATE OR DELETE ON public.forecast_employees
  FOR EACH ROW EXECUTE FUNCTION public.log_forecast_change();

-- ============================================================================
-- PART 5: HELPER FUNCTIONS FOR VERSIONING
-- ============================================================================

-- Function to lock a forecast version
CREATE OR REPLACE FUNCTION public.lock_forecast_version(
  p_forecast_id UUID
) RETURNS void AS $$
BEGIN
  UPDATE public.financial_forecasts
  SET
    is_locked = true,
    locked_at = NOW(),
    locked_by = auth.uid()
  WHERE id = p_forecast_id
    AND user_id = auth.uid()
    AND is_locked = false;

  -- Log the lock action
  INSERT INTO public.forecast_audit_log (
    forecast_id,
    user_id,
    action,
    table_name,
    record_id
  ) VALUES (
    p_forecast_id,
    auth.uid(),
    'lock_version',
    'financial_forecasts',
    p_forecast_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get next version number
CREATE OR REPLACE FUNCTION public.get_next_version_number(
  p_business_id UUID,
  p_fiscal_year INTEGER,
  p_forecast_type TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_max_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) INTO v_max_version
  FROM public.financial_forecasts
  WHERE business_id = p_business_id
    AND fiscal_year = p_fiscal_year
    AND forecast_type = p_forecast_type;

  RETURN v_max_version + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 6: UPDATE EXISTING FORECASTS
-- ============================================================================

-- Set default values for existing forecasts
UPDATE public.financial_forecasts
SET
  forecast_type = COALESCE(forecast_type, 'forecast'),
  version_number = COALESCE(version_number, 1),
  is_active = COALESCE(is_active, true),
  is_locked = COALESCE(is_locked, false)
WHERE forecast_type IS NULL
   OR version_number IS NULL
   OR is_active IS NULL
   OR is_locked IS NULL;

-- ============================================================================
-- VERIFICATION QUERIES (commented out - run manually to verify)
-- ============================================================================

-- Check if audit log table exists and has correct structure
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'forecast_audit_log' ORDER BY ordinal_position;

-- Check if triggers are installed
-- SELECT trigger_name, event_object_table FROM information_schema.triggers
-- WHERE trigger_name LIKE 'audit_%';

-- Check existing forecasts have versioning columns
-- SELECT id, name, forecast_type, version_number, is_active, is_locked
-- FROM financial_forecasts LIMIT 5;
