-- Fix audit trigger function to handle tables without forecast_id field
-- The financial_forecasts table uses 'id' while child tables use 'forecast_id'

CREATE OR REPLACE FUNCTION public.log_forecast_change()
RETURNS TRIGGER AS $$
DECLARE
  v_forecast_id UUID;
BEGIN
  -- Determine forecast_id based on table structure
  -- For financial_forecasts table: use NEW.id or OLD.id
  -- For child tables (pl_lines, employees, etc.): use NEW.forecast_id or OLD.forecast_id
  IF TG_TABLE_NAME = 'financial_forecasts' THEN
    v_forecast_id := COALESCE(NEW.id, OLD.id);
  ELSE
    v_forecast_id := COALESCE(NEW.forecast_id, OLD.forecast_id);
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
